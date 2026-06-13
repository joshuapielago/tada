import { randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_LIMITS = {
  maxBytes: 50 * 1024 * 1024,
  maxFiles: 500,
};

const WEB_ASSET_EXTENSIONS = new Set([
  ".html",
  ".htm",
  ".css",
  ".js",
  ".mjs",
  ".json",
  ".txt",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".mp4",
  ".webm",
  ".mp3",
  ".wav",
]);

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".htm", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".ttf", "font/ttf"],
  [".otf", "font/otf"],
  [".mp4", "video/mp4"],
  [".webm", "video/webm"],
  [".mp3", "audio/mpeg"],
  [".wav", "audio/wav"],
]);

const WARNING_MESSAGES = new Map([
  [
    "remote-assets",
    "Remote asset dependencies were detected. They were not bundled and may affect playback if they become unavailable.",
  ],
  [
    "missing-assets",
    "Some referenced local assets were missing from the uploaded bundle.",
  ],
  [
    "deck-runtime",
    "This deck appears to include its own navigation. Slides Mode may adapt it; Original Mode is available.",
  ],
]);

const NOTICE_MESSAGES = new Map([
  [
    "source-visible",
    "Uploaded HTML and asset files are public-unlisted web content and may be inspected or fetched by recipients with the link.",
  ],
  ["anonymous-ownerless", "Anonymous uploads cannot be deleted or managed."],
]);

export async function createDeckStore(options = {}) {
  const storageRoot = path.resolve(options.storageRoot ?? ".tada-cloud");
  const publicBaseUrl = String(options.publicBaseUrl ?? "http://127.0.0.1:4173").replace(/\/+$/, "");
  const limits = { ...DEFAULT_LIMITS, ...(options.limits ?? {}) };
  const decksRoot = path.join(storageRoot, "decks");
  const reports = [];
  const decks = new Map();

  await mkdir(decksRoot, { recursive: true });
  await loadExistingDecks(decksRoot, decks);

  return {
    async createDeck(input) {
      if (input?.certifyRights !== true) {
        throw new DeckStoreError(400, "certification-required", "Uploader must certify rights before upload.");
      }

      const bundle = normalizeBundleInput(input);
      validateBundle(bundle, limits);

      const id = await uniqueDeckId(decksRoot);
      const createdAt = new Date().toISOString();
      const html = bundle.files.find((file) => file.path === "index.html")?.bytes.toString("utf8") ?? "";
      const warnings = buildWarnings({ html, files: bundle.files, missingAssets: input.missingAssets });
      const notices = buildNotices();
      const title = cleanTitle(input.title) || deriveTitle(html, bundle.sourceLabel);
      const aspectRatio = detectAspectRatio(html);
      const deckDir = path.join(decksRoot, id);

      await mkdir(deckDir, { recursive: true });
      for (const file of bundle.files) {
        const destination = path.join(deckDir, file.path);
        await mkdir(path.dirname(destination), { recursive: true });
        await writeFile(destination, file.bytes);
      }

      const manifest = {
        schemaVersion: 1,
        id,
        title,
        aspectRatio,
        entrypoint: "index.html",
        createdAt,
        uploadSurface: input.uploadSurface ?? "api",
        source: {
          type: bundle.sourceType,
          ...(input.sourceUrl ? { sourceUrl: input.sourceUrl, finalUrl: input.finalUrl ?? input.sourceUrl } : {}),
        },
        files: bundle.files.map((file) => ({
          path: file.path,
          contentType: file.contentType,
          bytes: file.bytes.byteLength,
        })),
        warnings,
        notices,
      };

      await writeFile(path.join(deckDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

      const deckPublicBaseUrl = String(input.publicBaseUrl ?? publicBaseUrl).replace(/\/+$/, "");
      const metadata = metadataFromManifest(manifest, deckPublicBaseUrl);
      decks.set(id, { manifest, metadata });
      return metadata;
    },

    async getDeck(id) {
      return decks.get(String(id))?.metadata ?? null;
    },

    async getManifest(id) {
      return decks.get(String(id))?.manifest ?? null;
    },

    async readDeckFile(id, requestedPath) {
      const manifest = await this.getManifest(id);
      if (!manifest) {
        throw new DeckStoreError(404, "deck-not-found", "Deck was not found.");
      }

      const normalizedPath = normalizeStoredPath(requestedPath);
      const fileRecord = manifest.files.find((file) => file.path === normalizedPath);
      if (!fileRecord) {
        throw new DeckStoreError(404, "file-not-found", "Deck file was not found.");
      }

      const deckDir = path.join(decksRoot, id);
      const resolvedPath = path.resolve(deckDir, normalizedPath);
      if (!isInsideDirectory(deckDir, resolvedPath)) {
        throw new DeckStoreError(403, "path-outside-deck", "Deck file path is outside the bundle.");
      }

      return {
        bytes: await readFile(resolvedPath),
        contentType: fileRecord.contentType,
      };
    },

    async recordReport(input = {}) {
      const deckId = String(input.deckId ?? "").trim();
      const reason = String(input.reason ?? "").trim();
      if (!deckId || !reason) {
        throw new DeckStoreError(400, "invalid-report", "A deck ID and reason are required.");
      }
      const report = {
        id: randomId(10),
        deckId,
        viewUrl: `${publicBaseUrl}/d/${deckId}`,
        reason,
        reporterEmail: String(input.reporterEmail ?? "").trim(),
        createdAt: new Date().toISOString(),
      };
      reports.unshift(report);
      return report;
    },

    getStats() {
      const allDecks = [...decks.values()].map((entry) => entry.metadata);
      const warningCounts = {};
      const uploadSurfaces = {};
      let storedBytes = 0;

      for (const { manifest } of decks.values()) {
        uploadSurfaces[manifest.uploadSurface] = (uploadSurfaces[manifest.uploadSurface] ?? 0) + 1;
        for (const file of manifest.files) {
          storedBytes += file.bytes;
        }
        for (const warning of manifest.warnings) {
          warningCounts[warning.code] = (warningCounts[warning.code] ?? 0) + 1;
        }
      }

      return {
        deckCount: allDecks.length,
        storedBytes,
        uploadSurfaces,
        warningCounts,
        thumbnail: {
          pending: allDecks.filter((deck) => deck.thumbnailStatus === "pending").length,
          ready: allDecks.filter((deck) => deck.thumbnailStatus === "ready").length,
          failed: allDecks.filter((deck) => deck.thumbnailStatus === "failed").length,
        },
        reports: reports.slice(0, 50),
        recentDecks: allDecks
          .slice()
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
          .slice(0, 50),
      };
    },
  };
}

export class DeckStoreError extends Error {
  constructor(statusCode, code, message, details = {}) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

function normalizeBundleInput(input) {
  if (Array.isArray(input.files) && input.files.length > 0) {
    const files = input.files.map(normalizeFileRecord);
    if (!files.some((file) => file.path === "index.html")) {
      throw new DeckStoreError(400, "missing-entrypoint", "Upload requires an index.html entrypoint.");
    }
    return {
      files,
      sourceType: input.sourceType ?? "bundle",
      sourceLabel: input.sourceLabel ?? "index.html",
    };
  }

  const html = String(input.html ?? "");
  if (!looksLikeHtml(html)) {
    throw new DeckStoreError(400, "missing-entrypoint", "Upload requires a usable HTML entrypoint.");
  }

  return {
    files: [
      {
        path: "index.html",
        bytes: Buffer.from(html),
        contentType: "text/html; charset=utf-8",
      },
    ],
    sourceType: input.sourceType ?? (input.sourceUrl ? "url" : "html"),
    sourceLabel: input.sourceLabel,
  };
}

function normalizeFileRecord(file) {
  const normalizedPath = normalizeStoredPath(file.path);
  const extension = path.extname(normalizedPath).toLowerCase();
  if (!WEB_ASSET_EXTENSIONS.has(extension)) {
    throw new DeckStoreError(415, "unsupported-file-type", `Unsupported deck file type: ${extension || "unknown"}.`);
  }

  const bytes =
    file.bytes instanceof Buffer
      ? file.bytes
      : typeof file.contentBase64 === "string"
        ? Buffer.from(file.contentBase64, "base64")
        : Buffer.from(String(file.content ?? ""));

  return {
    path: normalizedPath === "index.htm" ? "index.html" : normalizedPath,
    bytes,
    contentType: file.contentType ?? contentTypeForPath(normalizedPath),
  };
}

function validateBundle(bundle, limits) {
  if (bundle.files.length > limits.maxFiles) {
    throw new DeckStoreError(413, "too-many-files", `Deck exceeds the ${limits.maxFiles} file limit.`);
  }

  const totalBytes = bundle.files.reduce((sum, file) => sum + file.bytes.byteLength, 0);
  if (totalBytes > limits.maxBytes) {
    throw new DeckStoreError(413, "upload-too-large", "Deck exceeds the anonymous upload size limit.");
  }
}

function normalizeStoredPath(value) {
  const rawPath = String(value ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
  const normalized = path.posix.normalize(rawPath);
  if (!normalized || normalized === "." || normalized.startsWith("../") || normalized === ".." || path.posix.isAbsolute(normalized)) {
    throw new DeckStoreError(403, "path-outside-deck", "Deck file path is outside the bundle.");
  }
  return normalized;
}

function buildWarnings({ html, files, missingAssets }) {
  const codes = [];
  if (hasRemoteAssets(html)) {
    codes.push("remote-assets");
  }
  if (Array.isArray(missingAssets) && missingAssets.length > 0) {
    codes.push("missing-assets");
  }
  if (hasDeckRuntime(html, files)) {
    codes.push("deck-runtime");
  }
  return codes.map((code) => ({ code, message: WARNING_MESSAGES.get(code) }));
}

function buildNotices() {
  return ["source-visible", "anonymous-ownerless"].map((code) => ({
    code,
    message: NOTICE_MESSAGES.get(code),
  }));
}

function hasRemoteAssets(html) {
  return /\b(?:src|href|poster)\s*=\s*["']https?:\/\//i.test(html) || /url\(\s*["']?https?:\/\//i.test(html);
}

function hasDeckRuntime(html) {
  return (
    /\b(?:reveal|remark|swiper|bespoke|impress)\b/i.test(html) ||
    /\bclass\s*=\s*["'][^"']*\bdeck\b/i.test(html) ||
    /data-(?:slide|tada-runtime-slide)/i.test(html)
  );
}

function deriveTitle(html, sourceLabel) {
  const match = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = cleanTitle(match?.[1]);
  if (title) {
    return title;
  }
  return cleanTitle(sourceLabel) || "Untitled Deck";
}

function cleanTitle(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function detectAspectRatio(html) {
  const source = String(html ?? "");
  const ratioMatch =
    source.match(/data-(?:aspect-ratio|aspect)\s*=\s*["'](\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)["']/i) ??
    source.match(/aspect-ratio\s*:\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/i);
  if (ratioMatch) {
    return { width: Number(ratioMatch[1]), height: Number(ratioMatch[2]) };
  }

  if (/\b(?:remark-slide|remark-container)\b/i.test(source)) {
    return { width: 4, height: 3 };
  }

  return { width: 16, height: 9 };
}

function looksLikeHtml(html) {
  return /<!doctype\s+html|<html\b|<body\b|<section\b|<article\b|<h[12]\b/i.test(String(html ?? ""));
}

function metadataFromManifest(manifest, publicBaseUrl) {
  return {
    id: manifest.id,
    viewUrl: `${publicBaseUrl}/d/${manifest.id}`,
    createdAt: manifest.createdAt,
    title: manifest.title,
    visibility: "unlisted",
    manageable: false,
    uploadSurface: manifest.uploadSurface,
    aspectRatio: manifest.aspectRatio,
    thumbnailStatus: "pending",
    thumbnailUrl: `${publicBaseUrl}/api/decks/${manifest.id}/thumbnail`,
    warnings: manifest.warnings,
    notices: manifest.notices,
  };
}

async function loadExistingDecks(decksRoot, decks) {
  const entries = await readdir(decksRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    try {
      const manifestPath = path.join(decksRoot, entry.name, "manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      decks.set(manifest.id, { manifest, metadata: metadataFromManifest(manifest, "") });
    } catch {
      // Ignore partial prototype uploads rather than making local startup brittle.
    }
  }
}

async function uniqueDeckId(decksRoot) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const id = randomId(12);
    try {
      await stat(path.join(decksRoot, id));
    } catch {
      return id;
    }
  }
  throw new DeckStoreError(500, "id-generation-failed", "Could not allocate a deck ID.");
}

function randomId(length) {
  return randomBytes(Math.ceil(length / 2)).toString("hex").slice(0, length);
}

function contentTypeForPath(filePath) {
  return MIME_TYPES.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream";
}

function isInsideDirectory(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
