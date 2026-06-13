#!/usr/bin/env node
/* Zero-dependency static server for the TaDa! homepage prototypes.
 * Usage: node web/server.js [port]   (default 4173, or $PORT) */
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] || process.env.PORT || 4173);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const PROTOTYPES = [
  { id: "01-spotlight", name: "Spotlight Gallery" },
  { id: "02-magic-drop", name: "Magic Drop" },
  { id: "03-editorial", name: "Editorial Curated" },
  { id: "04-mosaic", name: "Living Mosaic" },
  { id: "05-bento", name: "Playful Bento" },
  { id: "06-minimal", name: "Quiet Light" },
];

async function send(res, status, body, type) {
  res.writeHead(status, {
    "content-type": type || "text/plain; charset=utf-8",
    "cache-control": "no-cache",
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (urlPath === "/") urlPath = "/index.html";

    // Allow /01-spotlight to resolve to its index.html
    let filePath = normalize(join(ROOT, urlPath));
    if (!filePath.startsWith(ROOT)) return send(res, 403, "Forbidden");

    let info = await stat(filePath).catch(() => null);
    if (info && info.isDirectory()) {
      filePath = join(filePath, "index.html");
      info = await stat(filePath).catch(() => null);
    }
    if (!info) {
      // try appending /index.html for clean prototype links
      const alt = join(ROOT, urlPath, "index.html");
      info = await stat(alt).catch(() => null);
      if (info) filePath = alt;
    }
    if (!info) return send(res, 404, "Not found: " + urlPath);

    const data = await readFile(filePath);
    return send(res, 200, data, TYPES[extname(filePath)] || "application/octet-stream");
  } catch (err) {
    return send(res, 500, "Server error: " + err.message);
  }
});

server.listen(PORT, () => {
  const base = `http://localhost:${PORT}`;
  console.log(`\n  TaDa! homepage prototypes — running\n  ${base}\n`);
  console.log("  Launcher (all prototypes):  " + base + "/");
  for (const p of PROTOTYPES) {
    console.log(`   · ${p.name.padEnd(20)} ${base}/${p.id}/`);
  }
  console.log("");
});
