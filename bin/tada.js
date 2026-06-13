#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const DEFAULT_API_URL = process.env.TADA_API_URL ?? "http://127.0.0.1:4173";

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

async function main() {
  const args = process.argv.slice(2);
  const command = args.shift();
  if (command !== "upload") {
    throw new Error("Usage: tada upload <html-file-or-url> [--api-url URL] [--title TITLE] [--json]");
  }

  const target = args.shift();
  if (!target) {
    throw new Error("Usage: tada upload <html-file-or-url> [--api-url URL] [--title TITLE] [--json]");
  }

  const options = parseOptions(args);
  const apiUrl = (options.apiUrl ?? DEFAULT_API_URL).replace(/\/+$/, "");
  const requestBody = await buildUploadBody(target, options);
  const response = await fetch(`${apiUrl}/api/decks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message ?? "Upload failed.");
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  for (const warning of payload.warnings ?? []) {
    process.stderr.write(`Warning: ${warning.message}\n`);
  }
  for (const notice of payload.notices ?? []) {
    process.stderr.write(`Notice: ${notice.message}\n`);
  }
  process.stdout.write(`${payload.viewUrl}\n`);
}

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--api-url") {
      options.apiUrl = args[++index];
    } else if (arg === "--title") {
      options.title = args[++index];
    } else if (arg === "--json") {
      options.json = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

async function buildUploadBody(target, options) {
  if (/^https?:\/\//i.test(target)) {
    return {
      sourceUrl: target,
      title: options.title,
      certifyRights: true,
      uploadSurface: "cli",
    };
  }

  const htmlPath = path.resolve(target);
  const html = await readFile(htmlPath, "utf8");
  const root = path.dirname(htmlPath);
  const { files, missingAssets } = await packageHtmlFile({ html, root });

  return {
    files,
    title: options.title,
    sourceLabel: path.basename(htmlPath),
    certifyRights: true,
    uploadSurface: "cli",
    missingAssets,
  };
}

async function packageHtmlFile({ html, root }) {
  const files = [
    {
      path: "index.html",
      content: html,
      contentType: "text/html; charset=utf-8",
    },
  ];
  const missingAssets = [];
  const seen = new Set(["index.html"]);

  for (const reference of discoverLocalAssetReferences(html)) {
    const assetPath = path.resolve(root, reference);
    if (!isInsideDirectory(root, assetPath)) {
      continue;
    }

    const relativePath = path.relative(root, assetPath).replace(/\\/g, "/");
    if (seen.has(relativePath)) {
      continue;
    }
    seen.add(relativePath);

    try {
      const fileStat = await stat(assetPath);
      if (!fileStat.isFile()) {
        missingAssets.push(reference);
        continue;
      }
      files.push({
        path: relativePath,
        contentBase64: (await readFile(assetPath)).toString("base64"),
        contentType: contentTypeForPath(relativePath),
      });
    } catch {
      missingAssets.push(reference);
    }
  }

  return { files, missingAssets };
}

function discoverLocalAssetReferences(html) {
  const references = new Set();
  const source = String(html ?? "");
  const attributePattern = /\b(?:src|href|poster)\s*=\s*["']([^"']+)["']/gi;
  const cssUrlPattern = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;

  for (const pattern of [attributePattern, cssUrlPattern]) {
    for (const match of source.matchAll(pattern)) {
      const reference = cleanReference(match[1]);
      if (reference) {
        references.add(reference);
      }
    }
  }

  return [...references];
}

function cleanReference(value) {
  const reference = String(value ?? "").trim();
  if (
    !reference ||
    reference.startsWith("#") ||
    /^(?:https?:|data:|mailto:|tel:|javascript:|file:)/i.test(reference)
  ) {
    return "";
  }
  return decodeURIComponent(reference.split("#")[0].split("?")[0]);
}

function contentTypeForPath(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return (
    {
      ".css": "text/css; charset=utf-8",
      ".html": "text/html; charset=utf-8",
      ".htm": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".mjs": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".txt": "text/plain; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".woff": "font/woff",
      ".woff2": "font/woff2",
      ".mp4": "video/mp4",
      ".webm": "video/webm",
      ".mp3": "audio/mpeg",
      ".wav": "audio/wav",
    }[extension] ?? "application/octet-stream"
  );
}

function isInsideDirectory(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
