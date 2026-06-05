import { createReadStream } from "node:fs";
import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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

export function createPresentationServer() {
  const localAssetRoots = new Map();

  return createServer(async (request, response) => {
    if (!request.url || request.method !== "GET") {
      sendText(response, 405, "Method not allowed");
      return;
    }

    const url = new URL(request.url, "http://localhost");

    try {
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

      const publicPath = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      await serveStatic(response, publicRoot, publicPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong.";
      sendJson(response, 500, { error: message });
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
