import { createReadStream } from "node:fs";
import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createDeckStore, DeckStoreError } from "./src/cloud/deck-store.js";
import { handleMcpRequest } from "./src/cloud/mcp-server.js";
import { injectBaseElement, normalizeSourceUrl } from "./public/deckify.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.join(__dirname, "public");
const sharedRoot = path.join(__dirname, "src", "shared");
const fixtureRoot = path.join(__dirname, "test", "fixtures");

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
]);

export function createPresentationServer(options = {}) {
  const localAssetRoots = new Map();
  const deckStorePromise = createDeckStore({
    storageRoot: options.storageRoot,
    publicBaseUrl: options.publicBaseUrl,
  });

  return createServer(async (request, response) => {
    if (!request.url) {
      sendText(response, 400, "Bad request");
      return;
    }

    const url = new URL(request.url, "http://localhost");
    const deckStore = await deckStorePromise;

    try {
      if (url.pathname === "/mcp") {
        await handleMcpRequest(request, response, {
          deckStore,
          publicBaseUrl: publicBaseUrlFromRequest(request),
        });
        return;
      }

      if (url.pathname === "/api/decks" && request.method === "POST") {
        await handleCreateDeckRequest(request, response, deckStore);
        return;
      }

      if (url.pathname === "/api/reports" && request.method === "POST") {
        await handleReportRequest(request, response, deckStore);
        return;
      }

      if (url.pathname === "/api/admin/stats" && request.method === "GET") {
        sendJson(response, 200, deckStore.getStats());
        return;
      }

      const deckFileMatch = url.pathname.match(/^\/api\/decks\/([^/]+)\/files\/(.+)$/);
      if (deckFileMatch && request.method === "GET") {
        await handleDeckFileRequest(deckFileMatch[1], deckFileMatch[2], response, deckStore);
        return;
      }

      const deckManifestMatch = url.pathname.match(/^\/api\/decks\/([^/]+)\/manifest$/);
      if (deckManifestMatch && request.method === "GET") {
        await handleDeckManifestRequest(deckManifestMatch[1], response, deckStore);
        return;
      }

      const deckThumbnailMatch = url.pathname.match(/^\/api\/decks\/([^/]+)\/thumbnail$/);
      if (deckThumbnailMatch && request.method === "GET") {
        await handleDeckThumbnailRequest(deckThumbnailMatch[1], response, deckStore);
        return;
      }

      const deckMetadataMatch = url.pathname.match(/^\/api\/decks\/([^/]+)$/);
      if (deckMetadataMatch && request.method === "GET") {
        await handleDeckMetadataRequest(deckMetadataMatch[1], response, deckStore);
        return;
      }

      const deckViewerMatch = url.pathname.match(/^\/d\/([^/]+)$/);
      if (deckViewerMatch && request.method === "GET") {
        await serveStatic(response, publicRoot, "cloud-viewer.html");
        return;
      }

      if (url.pathname === "/api/fetch") {
        await handleFetchRequest(request, url, response, localAssetRoots);
        return;
      }

      if (url.pathname.startsWith("/api/local-assets/")) {
        await handleLocalAssetRequest(url, response, localAssetRoots);
        return;
      }

      if (url.pathname.startsWith("/test/fixtures/")) {
        await serveStatic(response, fixtureRoot, url.pathname.replace("/test/fixtures/", ""));
        return;
      }

      if (url.pathname.startsWith("/src/shared/")) {
        await serveStatic(response, sharedRoot, url.pathname.replace("/src/shared/", ""));
        return;
      }

      if (url.pathname === "/" || url.pathname === "/upload") {
        await serveStatic(response, publicRoot, "upload.html");
        return;
      }

      if (url.pathname === "/admin") {
        await serveStatic(response, publicRoot, "admin.html");
        return;
      }

      if (url.pathname === "/docs/api") {
        await serveStatic(response, publicRoot, "docs-api.html");
        return;
      }

      if (url.pathname === "/presenter") {
        await serveStatic(response, publicRoot, "index.html");
        return;
      }

      if (request.method !== "GET") {
        sendText(response, 405, "Method not allowed");
        return;
      }

      const publicPath = url.pathname.slice(1);
      await serveStatic(response, publicRoot, publicPath);
    } catch (error) {
      sendError(response, error);
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = getPort(process.argv);
  const host = "127.0.0.1";
  const server = createPresentationServer();
  server.listen(port, host, () => {
    console.log(`tada running at http://localhost:${port}`);
  });
}

async function handleFetchRequest(request, url, response, localAssetRoots) {
  let targetUrl;
  try {
    targetUrl = normalizeSourceUrl(url.searchParams.get("url"));
  } catch (error) {
    sendJson(response, 400, { error: error.message });
    return;
  }

  const source = new URL(targetUrl);

  if (source.protocol === "file:") {
    await handleLocalFileSource(request, source, response, localAssetRoots);
    return;
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 12000);

  try {
    const fetched = await fetch(targetUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
        "User-Agent": "tada/0.1",
      },
      signal: abortController.signal,
    });

    const contentType = fetched.headers.get("content-type") ?? "";
    const text = await fetched.text();

    if (!fetched.ok) {
      sendJson(response, fetched.status, { error: `URL returned ${fetched.status}.` });
      return;
    }

    if (!looksLikeHtml(contentType, text)) {
      sendJson(response, 415, { error: "That URL did not return HTML." });
      return;
    }

    sendJson(response, 200, {
      html: injectBaseElement(text, targetUrl),
      sourceUrl: targetUrl,
      sourceLabel: sourceLabelFromUrl(targetUrl),
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    sendJson(response, 502, {
      error: aborted ? "Fetching that URL took too long." : "Could not fetch that URL.",
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function handleCreateDeckRequest(request, response, deckStore) {
  let payload;
  try {
    payload = await readJsonBody(request);
  } catch (error) {
    sendJsonError(response, 400, "invalid-json", error.message);
    return;
  }

  const publicBaseUrl = publicBaseUrlFromRequest(request);

  try {
    if (payload.sourceUrl) {
      const fetched = await fetchRemoteHtmlForUpload(payload.sourceUrl);
      const created = await deckStore.createDeck({
        html: fetched.html,
        title: payload.title,
        certifyRights: payload.certifyRights,
        sourceType: "url",
        sourceUrl: payload.sourceUrl,
        finalUrl: fetched.finalUrl,
        sourceLabel: sourceLabelFromUrl(fetched.finalUrl),
        uploadSurface: payload.uploadSurface ?? "url",
        publicBaseUrl,
      });
      sendJson(response, 201, created);
      return;
    }

    const created = await deckStore.createDeck({
      html: payload.html,
      files: payload.files,
      title: payload.title,
      certifyRights: payload.certifyRights,
      sourceType: payload.files ? "bundle" : "html",
      sourceLabel: payload.sourceLabel,
      uploadSurface: payload.uploadSurface ?? "api",
      missingAssets: payload.missingAssets,
      publicBaseUrl,
    });
    sendJson(response, 201, created);
  } catch (error) {
    sendError(response, error);
  }
}

async function handleDeckMetadataRequest(id, response, deckStore) {
  const deck = await deckStore.getDeck(id);
  if (!deck) {
    sendJsonError(response, 404, "deck-not-found", "Deck was not found.");
    return;
  }
  sendJson(response, 200, deck);
}

async function handleDeckManifestRequest(id, response, deckStore) {
  const manifest = await deckStore.getManifest(id);
  if (!manifest) {
    sendJsonError(response, 404, "deck-not-found", "Deck was not found.");
    return;
  }
  sendJson(response, 200, manifest);
}

async function handleDeckFileRequest(id, requestedPath, response, deckStore) {
  try {
    const file = await deckStore.readDeckFile(id, decodeURIComponent(requestedPath));
    response.writeHead(200, {
      "Content-Type": file.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    });
    response.end(file.bytes);
  } catch (error) {
    sendError(response, error);
  }
}

async function handleDeckThumbnailRequest(id, response, deckStore) {
  const deck = await deckStore.getDeck(id);
  if (!deck) {
    sendJsonError(response, 404, "deck-not-found", "Deck was not found.");
    return;
  }

  const title = escapeXml(deck.title || "Untitled Deck");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
  <rect width="1200" height="675" fill="#fbfaf6"/>
  <rect x="36" y="36" width="1128" height="603" rx="20" fill="#181715"/>
  <text x="90" y="144" font-family="Inter, Arial, sans-serif" font-size="42" font-weight="700" fill="#f6b84b">tada</text>
  <text x="90" y="340" font-family="Inter, Arial, sans-serif" font-size="64" font-weight="760" fill="#fbfaf6">${title}</text>
</svg>`;
  response.writeHead(200, {
    "Content-Type": "image/svg+xml",
    "Cache-Control": "no-store",
  });
  response.end(svg);
}

async function handleReportRequest(request, response, deckStore) {
  let payload;
  try {
    payload = await readJsonBody(request);
  } catch (error) {
    sendJsonError(response, 400, "invalid-json", error.message);
    return;
  }

  try {
    const report = await deckStore.recordReport(payload);
    sendJson(response, 201, report);
  } catch (error) {
    sendError(response, error);
  }
}

async function handleLocalFileSource(request, source, response, localAssetRoots) {
  try {
    sendJson(
      response,
      200,
      await createLocalFilePayload(source, request.headers.host ?? "127.0.0.1:4173", localAssetRoots),
    );
  } catch (error) {
    if (error instanceof LocalSourceError) {
      sendJson(response, error.statusCode, { error: error.message });
      return;
    }

    throw error;
  }
}

export async function createLocalFilePayload(source, host, localAssetRoots = new Map()) {
  const filePath = fileURLToPath(source);

  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch {
    throw new LocalSourceError(404, "That local file was not found.");
  }

  if (!fileStat.isFile()) {
    throw new LocalSourceError(400, "That local path is not a file.");
  }

  const text = await readFile(filePath, "utf8");

  if (!looksLikeHtml(mimeTypes.get(path.extname(filePath).toLowerCase()) ?? "", text)) {
    throw new LocalSourceError(415, "That local file is not HTML.");
  }

  const assetBase = localAssetBaseUrl(host, path.dirname(filePath), localAssetRoots);

  return {
    html: injectBaseElement(text, assetBase),
    sourceUrl: source.href,
    sourceLabel: path.basename(filePath),
  };
}

async function handleLocalAssetRequest(url, response, localAssetRoots) {
  const [, rootToken, requestedPath = ""] =
    url.pathname.match(/^\/api\/local-assets\/([^/]+)\/?(.*)$/) ?? [];

  if (!rootToken) {
    sendText(response, 404, "Not found");
    return;
  }

  let resolvedPath;
  try {
    resolvedPath = resolveLocalAssetPath(localAssetRoots, rootToken, requestedPath || ".");
  } catch {
    sendJson(response, 404, { error: "That local file was not found." });
    return;
  }

  await serveStatic(response, path.dirname(resolvedPath), path.basename(resolvedPath));
}

export function resolveLocalAssetPath(localAssetRoots, rootToken, requestedPath) {
  const root = localAssetRoots.get(rootToken);
  if (!root) {
    throw new Error("Unknown local asset root.");
  }

  const resolvedPath = path.resolve(root, decodeURIComponent(requestedPath));

  if (resolvedPath !== root && !resolvedPath.startsWith(`${root}${path.sep}`)) {
    throw new Error("Local asset path is outside the source directory.");
  }

  return resolvedPath;
}

async function serveStatic(response, root, requestedPath) {
  const safePath = requestedPath.replace(/^\/+/, "");
  const resolvedPath = path.resolve(root, safePath);

  if (resolvedPath !== root && !resolvedPath.startsWith(`${root}${path.sep}`)) {
    sendText(response, 403, "Forbidden");
    return;
  }

  try {
    const fileStat = await stat(resolvedPath);
    if (!fileStat.isFile()) {
      sendText(response, 404, "Not found");
      return;
    }
  } catch {
    sendText(response, 404, "Not found");
    return;
  }

  const extension = path.extname(resolvedPath).toLowerCase();
  response.writeHead(200, {
    "Content-Type": mimeTypes.get(extension) ?? "application/octet-stream",
    "Cache-Control": "no-store",
  });
  createReadStream(resolvedPath).pipe(response);
}

function looksLikeHtml(contentType, text) {
  return (
    /html|xml|text\/plain/i.test(contentType) ||
    /<!doctype\s+html|<html\b|<body\b|<section\b|<article\b|<h[12]\b/i.test(text)
  );
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function sendJsonError(response, statusCode, code, message, details = {}) {
  sendJson(response, statusCode, {
    error: {
      code,
      message,
      details,
    },
  });
}

function sendError(response, error) {
  if (error instanceof DeckStoreError) {
    sendJsonError(response, error.statusCode, error.code, error.message, error.details);
    return;
  }

  const message = error instanceof Error ? error.message : "Something went wrong.";
  sendJsonError(response, 500, "internal-error", message);
}

function sendText(response, statusCode, text) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(text);
}

function localAssetBaseUrl(host, fileDirectory, localAssetRoots) {
  const rootToken = randomUUID();
  localAssetRoots.set(rootToken, fileDirectory);
  return `http://${host}/api/local-assets/${rootToken}/`;
}

function sourceLabelFromUrl(value) {
  const url = new URL(value);
  if (url.protocol === "file:") {
    return path.basename(fileURLToPath(url));
  }

  return url.hostname || value;
}

async function readJsonBody(request) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    totalBytes += chunk.byteLength;
    if (totalBytes > 55 * 1024 * 1024) {
      throw new Error("Request body is too large.");
    }
    chunks.push(chunk);
  }

  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) {
    return {};
  }
  return JSON.parse(text);
}

async function fetchRemoteHtmlForUpload(rawSourceUrl) {
  const targetUrl = normalizeSourceUrl(rawSourceUrl);
  const url = new URL(targetUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new DeckStoreError(400, "invalid-source-url", "URL Upload requires a public HTTP or HTTPS URL.");
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 12000);
  try {
    const fetched = await fetch(targetUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
        "User-Agent": "tada/0.1",
      },
      signal: abortController.signal,
    });
    const contentType = fetched.headers.get("content-type") ?? "";
    const text = await fetched.text();
    if (!fetched.ok) {
      throw new DeckStoreError(fetched.status, "source-fetch-failed", `URL returned ${fetched.status}.`);
    }
    if (!looksLikeHtml(contentType, text)) {
      throw new DeckStoreError(415, "source-not-html", "That URL did not return HTML.");
    }
    return {
      html: injectBaseElement(text, fetched.url || targetUrl),
      finalUrl: fetched.url || targetUrl,
    };
  } catch (error) {
    if (error instanceof DeckStoreError) {
      throw error;
    }
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new DeckStoreError(
      502,
      aborted ? "source-fetch-timeout" : "source-fetch-failed",
      aborted ? "Fetching that URL took too long." : "Could not fetch that URL.",
    );
  } finally {
    clearTimeout(timeout);
  }
}

function publicBaseUrlFromRequest(request) {
  const host = request.headers.host ?? "127.0.0.1:4173";
  const forwardedProto = request.headers["x-forwarded-proto"];
  const protocol = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto || "http";
  return `${protocol}://${host}`;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getPort(argv) {
  const portFlagIndex = argv.indexOf("--port");
  const rawPort = portFlagIndex >= 0 ? argv[portFlagIndex + 1] : process.env.PORT ?? "4173";
  const parsedPort = Number.parseInt(rawPort, 10);
  return Number.isFinite(parsedPort) ? parsedPort : 4173;
}

class LocalSourceError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}
