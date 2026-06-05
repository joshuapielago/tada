const { app, BrowserWindow, Menu, dialog, ipcMain, protocol, shell } = require("electron");
const { readFile, writeFile } = require("node:fs/promises");
const { randomUUID } = require("node:crypto");
const path = require("node:path");
const { fileURLToPath, pathToFileURL } = require("node:url");
const { inlineLocalScriptTags } = require("../src/shared/local-scripts.cjs");
const { createUpdateService } = require("./updater.cjs");
const packageConfig = require("../package.json");

const isMac = process.platform === "darwin";
const htmlFilters = [
  { name: "HTML Files", extensions: ["html", "htm"] },
  { name: "All Files", extensions: ["*"] },
];

let mainWindow = null;
let ipcInstalled = false;
let securityInstalled = false;
let slideProtocolInstalled = false;
let rendererReady = false;
let commandLineOpenPathsQueued = false;
let updateService = null;
const queuedOpenPaths = [];
const slideDocuments = new Map();

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

app.setName("Tada!");

app.on("open-file", (event, filePath) => {
  event.preventDefault();
  void openPathInWindow({ filePath, presentOnOpen: false });
});

app.whenReady().then(() => {
  installSlideProtocol();
  installSecurityGuards();
  installIpcHandlers();
  getUpdateService();
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

function createMainWindow() {
  const rendererEntryPath = path.join(__dirname, "renderer", "index.html");
  rendererReady = false;
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 640,
    show: false,
    title: "Tada!",
    backgroundColor: "#171614",
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
    return readHtmlFile(filePath);
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
    sendUpdateStatus(getUpdateService().getStatus());
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

    return fileURLToPath(parsedUrl) === path.join(__dirname, "renderer", "index.html");
  } catch {
    return false;
  }
}

function isAllowedExternalUrl(value) {
  try {
    const parsedUrl = new URL(value);
    return ["https:", "http:", "mailto:"].includes(parsedUrl.protocol);
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

function queueCommandLineOpenPaths() {
  if (commandLineOpenPathsQueued) {
    return;
  }

  commandLineOpenPathsQueued = true;
  const appPathIndex = process.argv.findIndex((argument) => path.resolve(argument) === app.getAppPath());
  const firstFileIndex = appPathIndex >= 0 ? appPathIndex + 1 : isMac && app.isPackaged ? 1 : 2;
  const filePaths = process.argv
    .slice(firstFileIndex)
    .filter((argument) => argument && !argument.startsWith("-"))
    .map((argument) => ({
      filePath: path.resolve(argument),
      presentOnOpen: process.argv.includes("--present"),
    }));

  queuedOpenPaths.push(...filePaths);
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
    title: "Open HTML Presentation",
    properties: ["openFile"],
    filters: htmlFilters,
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return readHtmlFile(result.filePaths[0]);
}

async function saveShowHtml(event, payload) {
  const window = BrowserWindow.fromWebContents(event.sender) ?? mainWindow ?? undefined;
  const html = String(payload?.html ?? "");
  const sourceLabel = String(payload?.sourceLabel ?? "tada-show").replace(/\.html?$/i, "");
  const defaultPath = `${safeFileBaseName(sourceLabel) || "tada-show"}.show.html`;

  if (!html.trim()) {
    throw new Error("There is no presentation to export.");
  }

  const result = await dialog.showSaveDialog(window, {
    title: "Export tada show",
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
      ...(await readHtmlFile(filePath)),
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
    return readHtmlFile(fileURLToPath(url));
  }

  if (url.protocol === "http:" || url.protocol === "https:") {
    return fetchHtmlUrl(url.href);
  }

  throw new Error("That source cannot be loaded.");
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
