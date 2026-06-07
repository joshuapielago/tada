import { createRemotePresentSession } from "./deck-session.js";

export function isGoogleSlidesUrl(value) {
  try {
    const url = new URL(String(value ?? ""));
    return url.hostname === "docs.google.com" && /\/presentation\/(?:u\/\d+\/)?d\/[^/]+/.test(url.pathname);
  } catch {
    return false;
  }
}

export function normalizeGoogleSlidesUrl(value) {
  const sourceUrl = String(value ?? "").trim();
  const url = new URL(sourceUrl);
  const id = extractPresentationId(url);

  if (!id) {
    throw new Error("That Google Slides URL does not include a presentation id.");
  }

  return {
    id,
    sourceUrl: url.href,
    editUrl: `https://docs.google.com/presentation/d/${id}/edit`,
    presentUrl: buildGoogleSlidesPresentUrl(id),
    exportPptxUrl: buildGoogleSlidesExportUrl(id, "pptx"),
  };
}

export function buildGoogleSlidesPresentUrl(id) {
  return `https://docs.google.com/presentation/d/${encodeURIComponent(id)}/present`;
}

export function buildGoogleSlidesExportUrl(id, format = "pptx") {
  return `https://docs.google.com/presentation/d/${encodeURIComponent(id)}/export/${encodeURIComponent(format)}`;
}

export function createGoogleSlidesRemoteSession(sourceUrl) {
  const normalized = normalizeGoogleSlidesUrl(sourceUrl);

  return createRemotePresentSession({
    title: "Google Slides",
    sourceType: "google-slides",
    sourceLabel: "Google Slides",
    sourceUrl: normalized.presentUrl,
  });
}

function extractPresentationId(url) {
  return url.pathname.match(/\/presentation\/(?:u\/\d+\/)?d\/([^/]+)/)?.[1] ?? "";
}
