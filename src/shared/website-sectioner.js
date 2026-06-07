const SEMANTIC_TAGS = new Set(["main", "section", "article", "header"]);
const HEADING_TAGS = new Set(["h1", "h2"]);
const MIN_USEFUL_HEIGHT = 90;
const MIN_USEFUL_WIDTH = 320;

export function createWebsiteCapturePlan({
  pageTitle = "Website",
  viewport = { width: 1440, height: 900 },
  documentHeight = viewport.height,
  elements = [],
} = {}) {
  const usefulElements = elements
    .filter(isVisibleElement)
    .filter((element) => !isDistractingOverlay(element))
    .filter((element) => isUsefulRect(element.rect));

  const semanticSlides = usefulElements
    .filter(isSemanticElement)
    .map((element) => slideFromElement(element, { pageTitle, viewport, documentHeight, reason: "semantic" }))
    .filter(Boolean);

  if (semanticSlides.length > 0) {
    return normalizeSlides(semanticSlides);
  }

  const headingSlides = usefulElements
    .filter((element) => HEADING_TAGS.has(normalizeTag(element.tagName)))
    .map((element) => slideFromElement(element, { pageTitle, viewport, documentHeight, reason: "heading" }))
    .filter(Boolean);

  if (headingSlides.length > 0) {
    return normalizeSlides(headingSlides);
  }

  return buildViewportChunks({ pageTitle, viewport, documentHeight });
}

export function buildViewportChunks({ pageTitle = "Website", viewport = { width: 1440, height: 900 }, documentHeight = 0 } = {}) {
  const width = Math.max(1, Number(viewport.width) || 1440);
  const viewportHeight = Math.max(1, Number(viewport.height) || 900);
  const totalHeight = Math.max(viewportHeight, Number(documentHeight) || viewportHeight);
  const chunks = [];

  for (let y = 0, index = 1; y < totalHeight; y += viewportHeight, index += 1) {
    chunks.push({
      title: `${pageTitle} ${index}`,
      x: 0,
      y,
      width,
      height: Math.min(viewportHeight, totalHeight - y),
      reason: "viewport",
    });
  }

  return chunks;
}

export function isDistractingOverlay(element) {
  const haystack = [
    element?.id,
    element?.className,
    element?.role,
    element?.text,
  ].join(" ").toLowerCase();
  const position = String(element?.style?.position ?? "").toLowerCase();

  if (!["fixed", "sticky"].includes(position)) {
    return false;
  }

  return /\b(cookie|cookies|consent|banner|chat|intercom|crisp|drift|widget|subscribe|newsletter)\b/.test(haystack);
}

function isVisibleElement(element) {
  const style = element?.style ?? {};
  return style.display !== "none" && style.visibility !== "hidden";
}

function isUsefulRect(rect = {}) {
  return Number(rect.width ?? 0) >= MIN_USEFUL_WIDTH && Number(rect.height ?? 0) >= MIN_USEFUL_HEIGHT;
}

function isSemanticElement(element) {
  const tagName = normalizeTag(element.tagName);
  return SEMANTIC_TAGS.has(tagName) || ["main", "region", "article"].includes(String(element.role ?? "").toLowerCase());
}

function slideFromElement(element, { pageTitle, viewport, documentHeight, reason }) {
  const rect = element.rect ?? {};
  const y = Math.max(0, Math.round(Number(rect.y ?? 0)));
  const height = Math.max(
    MIN_USEFUL_HEIGHT,
    Math.min(Math.round(Number(rect.height ?? viewport.height)), Math.max(1, documentHeight - y)),
  );

  return {
    title: inferTitle(element.text, pageTitle),
    x: Math.max(0, Math.round(Number(rect.x ?? 0))),
    y,
    width: Math.max(1, Math.round(Number(rect.width ?? viewport.width))),
    height,
    reason,
  };
}

function normalizeSlides(slides) {
  const result = [];
  for (const slide of slides.sort((a, b) => a.y - b.y)) {
    const overlapsExisting = result.some((existing) => Math.abs(existing.y - slide.y) < 48);
    if (!overlapsExisting) {
      result.push(slide);
    }
  }
  return result;
}

function inferTitle(text, pageTitle) {
  const title = String(text ?? "")
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)[0];

  return title ? title.slice(0, 80) : pageTitle;
}

function normalizeTag(tagName) {
  return String(tagName ?? "").toLowerCase();
}
