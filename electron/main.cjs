const { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, protocol, screen, shell } = require("electron");
const { mkdtemp, readFile, rm, writeFile } = require("node:fs/promises");
const { randomUUID } = require("node:crypto");
const os = require("node:os");
const path = require("node:path");
const { fileURLToPath, pathToFileURL } = require("node:url");
const { collectCommandLineOpenRequests } = require("./command-line.cjs");
const { inlineLocalScriptTags } = require("../src/shared/local-scripts.cjs");
const { convertPowerPointFile, isPowerPointFile } = require("../src/shared/powerpoint-adapter.cjs");
const { createUpdateService } = require("./updater.cjs");
const { createPresenterService } = require("./presenter-service.cjs");
const packageConfig = require("../package.json");

const isMac = process.platform === "darwin";
const sourceFilters = [
  { name: "Presentation Sources", extensions: ["html", "htm", "pptx", "ppt"] },
  { name: "HTML Files", extensions: ["html", "htm"] },
  { name: "PowerPoint Files", extensions: ["pptx", "ppt"] },
  { name: "All Files", extensions: ["*"] },
];

let mainWindow = null;
let ipcInstalled = false;
let securityInstalled = false;
let slideProtocolInstalled = false;
let rendererReady = false;
let commandLineOpenPathsQueued = false;
let updateStatusBroadcastQueued = false;
let updateService = null;
let presenterService = null;
const queuedOpenPaths = [];
const slideDocuments = new Map();
const websiteCaptureWebContentsIds = new Set();
const audienceWebContentsIds = new Set();

protocol.registerSchemesAsPrivileged([
  {
    scheme: "tada-slide",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
    },
  },
]);

app.setName("TaDa!");

app.on("open-file", (event, filePath) => {
  event.preventDefault();
  void openPathInWindow({ filePath, presentOnOpen: false });
});

app.whenReady().then(() => {
  installSlideProtocol();
  installSecurityGuards();
  installIpcHandlers();
  createMenu();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (!isMac) {
    app.quit();
  }
});

async function importSharedModule(modulePath) {
  return import(modulePath);
}

function createMainWindow() {
  const rendererEntryPath = path.join(__dirname, "renderer", "index.html");
  rendererReady = false;
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 640,
    show: false,
    title: "TaDa!",
    backgroundColor: "#1b0f26",
    titleBarStyle: isMac ? "hiddenInset" : "default",
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(rendererEntryPath);

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    flushQueuedOpenPaths();
  });

  mainWindow.on("closed", () => {
    presenterService?.stopPresentation?.({ notifyAudience: true });
    mainWindow = null;
    rendererReady = false;
    slideDocuments.clear();
  });
}

function installIpcHandlers() {
  if (ipcInstalled) {
    return;
  }

  ipcInstalled = true;

  ipcMain.handle("dialog:open-file", async () => {
    return showOpenFileDialog();
  });

  ipcMain.handle("source:load", async (_event, source) => {
    return loadSource(source);
  });

  ipcMain.handle("file:read-dropped", async (_event, filePath) => {
    return readSourceFile(filePath);
  });

  ipcMain.handle("clipboard:write-text", (_event, text) => {
    clipboard.writeText(String(text ?? ""));
    return true;
  });

  ipcMain.handle("app:toggle-fullscreen", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      return false;
    }

    const nextValue = !window.isFullScreen();
    window.setFullScreen(nextValue);
    return nextValue;
  });

  ipcMain.handle("app:set-fullscreen", (event, value) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      return false;
    }

    const nextValue = Boolean(value);
    window.setFullScreen(nextValue);
    return nextValue;
  });

  ipcMain.handle("presentation:start", async (_event, payload) => {
    return getPresenterService().startPresentation(payload);
  });

  ipcMain.handle("presentation:set-index", (_event, index) => {
    return getPresenterService().setPresentationIndex(index);
  });

  ipcMain.handle("presentation:stop", () => {
    return getPresenterService().stopPresentation();
  });

  ipcMain.on("presentation:intent", (_event, intent) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("presentation:intent", String(intent ?? "none"));
      return;
    }

    if (intent === "exit") {
      getPresenterService().stopPresentation();
    }
  });

  ipcMain.on("presentation:ready", () => {
    getPresenterService().sendCurrentSession();
  });

  ipcMain.handle("show:save-html", async (event, payload) => {
    return saveShowHtml(event, payload);
  });

  ipcMain.handle("slide-document:create", (_event, html) => {
    return createSlideDocument(html);
  });

  ipcMain.handle("slide-document:revoke", (_event, sourceUrl) => {
    return revokeSlideDocument(sourceUrl);
  });

  ipcMain.handle("app:renderer-ready", () => {
    rendererReady = true;
    queueCommandLineOpenPaths();
    flushQueuedOpenPaths();
    queueInitialUpdateStatusBroadcast();
    return true;
  });

  ipcMain.handle("updates:get-status", () => {
    return getUpdateService().getStatus();
  });

  ipcMain.handle("updates:check", async () => {
    return getUpdateService().checkForUpdates();
  });

  ipcMain.handle("updates:install", () => {
    return getUpdateService().installUpdate();
  });
}

function createMenu() {
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "Open...",
          accelerator: "CmdOrCtrl+O",
          click: () => {
            void chooseFileFromMenu();
          },
        },
        { type: "separator" },
        ...(isMac ? [] : [{ role: "quit" }]),
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        {
          label: "Toggle Full Screen",
          accelerator: isMac ? "Ctrl+Command+F" : "F11",
          click: () => {
            if (mainWindow) {
              mainWindow.setFullScreen(!mainWindow.isFullScreen());
            }
          },
        },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
      ],
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "zoom" }, ...(isMac ? [{ type: "separator" }, { role: "front" }] : [])],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "Check for Updates...",
          click: () => {
            void getUpdateService().checkForUpdates();
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function installSecurityGuards() {
  if (securityInstalled) {
    return;
  }

  securityInstalled = true;

  app.on("web-contents-created", (_event, contents) => {
    contents.on("will-attach-webview", (event) => {
      event.preventDefault();
    });

    contents.on("will-navigate", (event, navigationUrl) => {
      if (websiteCaptureWebContentsIds.has(contents.id) && isAllowedCaptureNavigation(navigationUrl)) {
        return;
      }

      if (audienceWebContentsIds.has(contents.id) && isAllowedAudienceNavigation(navigationUrl)) {
        return;
      }

      if (!isAllowedAppNavigation(navigationUrl)) {
        event.preventDefault();
      }
    });

    contents.setWindowOpenHandler(({ url }) => {
      if (isAllowedExternalUrl(url)) {
        void shell.openExternal(url);
      }

      return { action: "deny" };
    });

    contents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false);
    });
  });
}

function installSlideProtocol() {
  if (slideProtocolInstalled) {
    return;
  }

  slideProtocolInstalled = true;
  protocol.handle("tada-slide", (request) => {
    const token = getSlideDocumentToken(request.url);
    const html = token ? slideDocuments.get(token) : "";

    if (!html) {
      return new Response("Slide document not found.", {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  });
}

function createSlideDocument(html) {
  const token = randomUUID();
  slideDocuments.set(token, String(html ?? ""));
  return `tada-slide://${token}/index.html`;
}

function revokeSlideDocument(sourceUrl) {
  const token = getSlideDocumentToken(sourceUrl);
  if (token) {
    slideDocuments.delete(token);
  }

  return true;
}

function getSlideDocumentToken(sourceUrl) {
  try {
    const url = new URL(String(sourceUrl ?? ""));
    if (url.protocol !== "tada-slide:") {
      return "";
    }

    return url.hostname;
  } catch {
    return "";
  }
}

function isAllowedAppNavigation(navigationUrl) {
  try {
    const parsedUrl = new URL(navigationUrl);
    if (parsedUrl.protocol !== "file:") {
      return false;
    }

    const allowedAppFiles = new Set([
      path.join(__dirname, "renderer", "index.html"),
      path.join(__dirname, "audience.html"),
    ]);
    return allowedAppFiles.has(fileURLToPath(parsedUrl));
  } catch {
    return false;
  }
}

function getPresenterService() {
  if (!presenterService) {
    presenterService = createPresenterService({
      BrowserWindow,
      screen,
      audiencePath: path.join(__dirname, "audience.html"),
      preloadPath: path.join(__dirname, "audience-preload.cjs"),
      onAudienceWindowCreated: (window) => {
        audienceWebContentsIds.add(window.webContents.id);
        window.once("closed", () => {
          audienceWebContentsIds.delete(window.webContents.id);
        });
      },
      onStopped: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("presentation:stopped");
        }
      },
    });
  }

  return presenterService;
}

function isAllowedExternalUrl(value) {
  try {
    const parsedUrl = new URL(value);
    return ["https:", "http:", "mailto:"].includes(parsedUrl.protocol);
  } catch {
    return false;
  }
}

function isAllowedCaptureNavigation(value) {
  try {
    const parsedUrl = new URL(value);
    return ["http:", "https:"].includes(parsedUrl.protocol);
  } catch {
    return false;
  }
}

function isAllowedAudienceNavigation(value) {
  try {
    const parsedUrl = new URL(value);
    return parsedUrl.protocol === "https:" && (
      parsedUrl.hostname === "docs.google.com" ||
      parsedUrl.hostname === "accounts.google.com" ||
      parsedUrl.hostname.endsWith(".google.com")
    );
  } catch {
    return false;
  }
}

function getUpdateService() {
  if (!updateService) {
    updateService = createUpdateService({
      app,
      updateProviderConfigured: isUpdateProviderConfigured(packageConfig.build?.publish),
      broadcast: sendUpdateStatus,
    });
  }

  return updateService;
}

function isUpdateProviderConfigured(publishConfig) {
  if (!publishConfig || typeof publishConfig !== "object") {
    return false;
  }

  if (publishConfig.provider === "github") {
    return (
      Boolean(publishConfig.owner) &&
      Boolean(publishConfig.repo) &&
      !String(publishConfig.owner).startsWith("CHANGE_ME") &&
      !String(publishConfig.repo).startsWith("CHANGE_ME")
    );
  }

  if (publishConfig.provider === "generic") {
    return Boolean(publishConfig.url) && !String(publishConfig.url).includes("CHANGE_ME");
  }

  return Boolean(publishConfig.provider);
}

function sendUpdateStatus(status) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("updates:status", status);
  }
}

function queueInitialUpdateStatusBroadcast() {
  if (updateStatusBroadcastQueued) {
    return;
  }

  updateStatusBroadcastQueued = true;
  setTimeout(() => {
    sendUpdateStatus(getUpdateService().getStatus());
    updateStatusBroadcastQueued = false;
  }, 650);
}

function queueCommandLineOpenPaths() {
  if (commandLineOpenPathsQueued) {
    return;
  }

  commandLineOpenPathsQueued = true;
  queuedOpenPaths.push(
    ...collectCommandLineOpenRequests(process.argv, {
      appPath: app.getAppPath(),
      isPackaged: app.isPackaged,
    }),
  );
}

async function chooseFileFromMenu() {
  const payload = await showOpenFileDialog();
  if (payload) {
    sendFilePayload(payload);
  }
}

async function showOpenFileDialog() {
  const owner = BrowserWindow.getFocusedWindow() ?? mainWindow ?? undefined;
  const result = await dialog.showOpenDialog(owner, {
    title: "Open Presentation Source",
    properties: ["openFile"],
    filters: sourceFilters,
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return readSourceFile(result.filePaths[0]);
}

async function saveShowHtml(event, payload) {
  const window = BrowserWindow.fromWebContents(event.sender) ?? mainWindow ?? undefined;
  const html = String(payload?.html ?? "");
  const sourceLabel = String(payload?.sourceLabel ?? "TaDa-show").replace(/\.html?$/i, "");
  const defaultPath = `${safeFileBaseName(sourceLabel) || "TaDa-show"}.show.html`;

  if (!html.trim()) {
    throw new Error("There is no presentation to export.");
  }

  const result = await dialog.showSaveDialog(window, {
    title: "Export TaDa! show",
    defaultPath,
    filters: [
      { name: "HTML Show", extensions: ["html"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  await writeFile(result.filePath, html, "utf8");
  return {
    filePath: result.filePath,
    sourceLabel: path.basename(result.filePath),
  };
}

async function openPathInWindow(request) {
  const filePath = typeof request === "string" ? request : request?.filePath;
  const presentOnOpen = Boolean(typeof request === "object" && request?.presentOnOpen);

  if (!mainWindow || mainWindow.webContents.isLoading() || !rendererReady) {
    queuedOpenPaths.push({ filePath, presentOnOpen });
    return;
  }

  try {
    sendFilePayload({
      ...(await readSourceFile(filePath)),
      presentOnOpen,
    });
  } catch (error) {
    sendSourceError(error);
  }
}

function flushQueuedOpenPaths() {
  if (!mainWindow || queuedOpenPaths.length === 0 || mainWindow.webContents.isLoading()) {
    return;
  }

  const filePath = queuedOpenPaths.shift();
  if (filePath) {
    void openPathInWindow(filePath);
  }
}

function sendFilePayload(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("file:opened", payload);
  }
}

function sendSourceError(error) {
  const message = error instanceof Error ? error.message : "Could not load that source.";
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("source:error", message);
  }
}

async function loadSource(source) {
  const value = String(source ?? "").trim();
  if (!value) {
    throw new Error("Enter a URL or local path.");
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a valid URL or local path.");
  }

  if (url.protocol === "file:") {
    return readSourceFile(fileURLToPath(url));
  }

  if (url.protocol === "http:" || url.protocol === "https:") {
    return loadRemoteSource(url.href);
  }

  throw new Error("That source cannot be loaded.");
}

async function readSourceFile(filePath) {
  const value = String(filePath ?? "").trim();
  if (!value) {
    throw new Error("Choose a presentation source.");
  }

  const extension = path.extname(value).toLowerCase();
  if ([".html", ".htm"].includes(extension)) {
    return readHtmlFile(value);
  }

  if (isPowerPointFile(value)) {
    return loadPowerPointFile(value);
  }

  throw new Error("Choose an HTML or PowerPoint file.");
}

async function loadPowerPointFile(filePath) {
  const result = await convertPowerPointFile(filePath);
  if (!result.ok) {
    throw new Error(result.message);
  }

  const { createImageDeckSession } = await importSharedModule("../src/shared/deck-session.js");
  const sourceLabel = path.basename(filePath);
  return {
    session: createImageDeckSession({
      title: sourceLabel,
      sourceType: "powerpoint",
      sourceLabel,
      sourceUrl: pathToFileURL(filePath).href,
      mode: "powerpoint",
      slides: result.slides,
    }),
    sourceType: "powerpoint",
    sourceUrl: pathToFileURL(filePath).href,
    sourceLabel,
    filePath,
  };
}

async function readHtmlFile(filePath) {
  const value = String(filePath ?? "").trim();
  if (!value) {
    throw new Error("Choose an HTML file.");
  }

  const extension = path.extname(value).toLowerCase();
  const text = await readFile(value, "utf8");

  if (!text.trim()) {
    throw new Error("That file is empty.");
  }

  if (![".html", ".htm"].includes(extension) && !looksLikeHtml("", text)) {
    throw new Error("Choose an HTML file.");
  }

  const sourceUrl = pathToFileURL(value).href;
  return {
    html: await inlineLocalScriptTags(text, value, readFile),
    sourceUrl,
    sourceLabel: path.basename(value),
    filePath: value,
  };
}

async function loadRemoteSource(sourceUrl) {
  const { classifySourceInput } = await importSharedModule("../src/shared/source-classifier.js");
  const classification = classifySourceInput(sourceUrl);

  if (classification.kind === "google-slides") {
    return loadGoogleSlidesSource(classification.sourceUrl);
  }

  if (classification.kind === "website") {
    return captureWebsiteDeck(classification.sourceUrl, classification.sourceLabel);
  }

  return fetchHtmlUrl(sourceUrl);
}

async function loadGoogleSlidesSource(sourceUrl) {
  const { createGoogleSlidesRemoteSession, normalizeGoogleSlidesUrl } = await importSharedModule("../src/shared/google-slides.js");
  const { createImageDeckSession } = await importSharedModule("../src/shared/deck-session.js");
  const normalized = normalizeGoogleSlidesUrl(sourceUrl);
  const exported = await tryLoadExportedGoogleSlides(normalized);
  if (exported?.ok) {
    return {
      session: createImageDeckSession({
        title: "Google Slides",
        sourceType: "google-slides",
        sourceLabel: "Google Slides",
        sourceUrl: normalized.presentUrl,
        mode: "google slides",
        slides: exported.slides,
      }),
      sourceType: "google-slides",
      sourceUrl: normalized.presentUrl,
      sourceLabel: "Google Slides",
    };
  }

  return {
    session: createGoogleSlidesRemoteSession(sourceUrl),
    sourceType: "google-slides",
    sourceUrl: normalized.presentUrl,
    sourceLabel: "Google Slides",
  };
}

async function tryLoadExportedGoogleSlides(normalized) {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 12000);
  const workDir = await mkdtemp(path.join(os.tmpdir(), "tada-google-slides-"));

  try {
    const response = await fetch(normalized.exportPptxUrl, {
      headers: {
        Accept: "application/vnd.openxmlformats-officedocument.presentationml.presentation,*/*;q=0.5",
        "User-Agent": "tada/0.1",
      },
      signal: abortController.signal,
    });

    if (!response.ok) {
      return { ok: false };
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (/text\/html/i.test(contentType)) {
      return { ok: false };
    }

    const filePath = path.join(workDir, `${normalized.id}.pptx`);
    await writeFile(filePath, Buffer.from(await response.arrayBuffer()));
    return convertPowerPointFile(filePath);
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timeout);
    await rm(workDir, { force: true, recursive: true });
  }
}

async function fetchHtmlUrl(sourceUrl) {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 12000);

  try {
    const response = await fetch(sourceUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
        "User-Agent": "tada/0.1",
      },
      signal: abortController.signal,
    });
    const text = await response.text();
    const contentType = response.headers.get("content-type") ?? "";

    if (!response.ok) {
      throw new Error(`URL returned ${response.status}.`);
    }

    if (!text.trim()) {
      throw new Error("That URL returned an empty document.");
    }

    if (!looksLikeHtml(contentType, text)) {
      throw new Error("That URL did not return HTML.");
    }

    return {
      html: text,
      sourceUrl,
      sourceLabel: sourceLabelFromUrl(sourceUrl),
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Fetching that URL took too long.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function captureWebsiteDeck(sourceUrl, sourceLabel = sourceLabelFromUrl(sourceUrl)) {
  const captureWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  websiteCaptureWebContentsIds.add(captureWindow.webContents.id);

  try {
    await loadUrlWithTimeout(captureWindow, sourceUrl, 18000);
    const pageSnapshot = await captureWindow.webContents.executeJavaScript(
      `(${collectWebsiteSnapshot.toString()})()`,
      true,
    );
    const { createWebsiteCapturePlan } = await importSharedModule("../src/shared/website-sectioner.js");
    const { createImageDeckSession } = await importSharedModule("../src/shared/deck-session.js");
    const capturePlan = createWebsiteCapturePlan(pageSnapshot).slice(0, 24);

    if (capturePlan.length === 0) {
      throw new Error("TaDa! could not find presentation sections on that website.");
    }

    const viewport = pageSnapshot.viewport ?? { width: 1440, height: 900 };
    const slides = [];
    for (const section of capturePlan) {
      await captureWindow.webContents.executeJavaScript(
        `window.scrollTo(0, ${Math.max(0, Math.round(section.y))}); new Promise((resolve) => setTimeout(resolve, 90));`,
        true,
      );
      const image = await captureWindow.webContents.capturePage({
        x: 0,
        y: 0,
        width: Math.round(viewport.width),
        height: Math.round(Math.min(viewport.height, section.height || viewport.height)),
      });
      slides.push({
        src: image.toDataURL(),
        title: section.title,
        width: Math.round(viewport.width),
        height: Math.round(Math.min(viewport.height, section.height || viewport.height)),
      });
    }

    return {
      session: createImageDeckSession({
        title: sourceLabel,
        sourceType: "website",
        sourceLabel,
        sourceUrl,
        mode: "website capture",
        slides,
      }),
      sourceType: "website",
      sourceUrl,
      sourceLabel,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Capturing that website took too long.");
    }
    throw error;
  } finally {
    websiteCaptureWebContentsIds.delete(captureWindow.webContents.id);
    if (!captureWindow.isDestroyed()) {
      captureWindow.close();
    }
  }
}

async function loadUrlWithTimeout(window, sourceUrl, timeoutMs) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("Capturing that website took too long.")), timeoutMs);
  });

  try {
    await Promise.race([
      window.loadURL(sourceUrl, {
        userAgent: "TaDa/0.1 website-capture",
      }),
      timeout,
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function collectWebsiteSnapshot() {
  const viewport = {
    width: Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1440),
    height: Math.max(1, window.innerHeight || document.documentElement.clientHeight || 900),
  };
  const documentHeight = Math.max(
    viewport.height,
    document.documentElement.scrollHeight,
    document.body?.scrollHeight ?? 0,
  );
  const selectors = [
    "main",
    "section",
    "article",
    "header",
    "[role='main']",
    "[role='region']",
    "[role='article']",
    "h1",
    "h2",
    ".hero",
    ".pricing",
    ".feature",
    ".features",
    ".card",
  ];
  const nodes = Array.from(document.querySelectorAll(selectors.join(","))).slice(0, 220);

  return {
    pageTitle: document.title || location.hostname,
    viewport,
    documentHeight,
    elements: nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return {
        tagName: node.tagName.toLowerCase(),
        text: (node.innerText || node.textContent || "").trim().slice(0, 500),
        className: node.className ? String(node.className) : "",
        id: node.id || "",
        role: node.getAttribute("role") || "",
        style: {
          display: style.display,
          visibility: style.visibility,
          position: style.position,
        },
        rect: {
          x: rect.x + window.scrollX,
          y: rect.y + window.scrollY,
          width: rect.width,
          height: rect.height,
        },
      };
    }),
  };
}

function looksLikeHtml(contentType, text) {
  return (
    /html|xml|text\/plain/i.test(contentType) ||
    /<!doctype\s+html|<html\b|<body\b|<section\b|<article\b|<h[12]\b/i.test(text)
  );
}

function sourceLabelFromUrl(value) {
  const url = new URL(value);
  const lastPathPart = decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) ?? "");
  return lastPathPart || url.hostname || value;
}

function safeFileBaseName(value) {
  return String(value)
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
