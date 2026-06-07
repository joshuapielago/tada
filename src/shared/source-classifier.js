import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { isLikelyHtmlDocument } from "./ingest.js";

const HTML_EXTENSIONS = new Set([".html", ".htm"]);
const POWERPOINT_EXTENSIONS = new Set([".pptx", ".ppt"]);

export function classifySourceInput(value) {
  const source = String(value ?? "").trim();

  if (isLikelyHtmlDocument(source)) {
    return {
      kind: "html",
      inputType: "raw-html",
      html: source,
      sourceLabel: "Pasted HTML",
      sourceUrl: "",
    };
  }

  if (isFileUrl(source)) {
    return classifyFileUrl(source);
  }

  if (isAbsoluteLocalPath(source)) {
    return classifyFilePath(source);
  }

  const sourceUrl = normalizeUrlInput(source);
  if (!sourceUrl) {
    return {
      kind: "unknown",
      inputType: "text",
      sourceLabel: source,
      sourceUrl: "",
    };
  }

  return classifyUrl(sourceUrl);
}

export function classifyFilePath(filePath) {
  const normalizedPath = String(filePath ?? "").trim();
  const extension = path.extname(normalizedPath).toLowerCase();
  const base = {
    inputType: "file",
    filePath: normalizedPath,
    sourceUrl: pathToFileURL(normalizedPath).href,
    sourceLabel: path.basename(normalizedPath),
  };

  if (HTML_EXTENSIONS.has(extension)) {
    return {
      kind: "html",
      ...base,
    };
  }

  if (POWERPOINT_EXTENSIONS.has(extension)) {
    return {
      kind: "powerpoint",
      ...base,
      extension,
    };
  }

  return {
    kind: "unknown",
    ...base,
    extension,
  };
}

export function classifyUrl(sourceUrl) {
  const url = new URL(sourceUrl);
  const extension = path.extname(url.pathname).toLowerCase();

  if (url.protocol === "file:") {
    return classifyFileUrl(url.href);
  }

  if (isGoogleSlidesUrl(url)) {
    return {
      kind: "google-slides",
      inputType: "url",
      sourceUrl: url.href,
      sourceLabel: "Google Slides",
      presentationId: extractGoogleSlidesId(url),
    };
  }

  if (isLoopbackHost(url.hostname) || HTML_EXTENSIONS.has(extension)) {
    return {
      kind: "html",
      inputType: "url",
      sourceUrl: url.href,
      sourceLabel: sourceLabelFromUrl(url),
    };
  }

  return {
    kind: "website",
    inputType: "url",
    sourceUrl: url.href,
    sourceLabel: sourceLabelFromUrl(url),
  };
}

function classifyFileUrl(sourceUrl) {
  const filePath = fileURLToPath(sourceUrl);
  const result = classifyFilePath(filePath);
  return {
    ...result,
    inputType: "file-url",
  };
}

function normalizeUrlInput(value) {
  if (!value) {
    return "";
  }

  if (isLoopbackShorthand(value)) {
    return new URL(`http://${normalizeLoopbackHost(value)}`).href;
  }

  try {
    return new URL(value).href;
  } catch {
    if (isBareRemoteHost(value)) {
      return new URL(`https://${value}`).href;
    }
  }

  return "";
}

function isFileUrl(value) {
  return /^file:/i.test(value);
}

function isAbsoluteLocalPath(value) {
  return path.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value);
}

function isBareRemoteHost(value) {
  return /^[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?(?:[/?#].*)?$/i.test(value);
}

function isLoopbackShorthand(value) {
  return /^(localhost|127(?:\.\d{1,3}){3}|\[::1\]|::1)(?::\d+)?(?:[/?#].*)?$/i.test(value);
}

function normalizeLoopbackHost(value) {
  return value.replace(/^::1/i, "[::1]");
}

function isLoopbackHost(hostname) {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "::1" || /^127(?:\.\d{1,3}){3}$/.test(host);
}

function isGoogleSlidesUrl(url) {
  return url.hostname === "docs.google.com" && /\/presentation\/(?:u\/\d+\/)?d\//.test(url.pathname);
}

function extractGoogleSlidesId(url) {
  return url.pathname.match(/\/presentation\/(?:u\/\d+\/)?d\/([^/]+)/)?.[1] ?? "";
}

function sourceLabelFromUrl(url) {
  if (url.protocol === "file:") {
    return path.basename(fileURLToPath(url));
  }

  return url.hostname;
}
