const DEFAULT_ASPECT_RATIO = "16:9";

export function createHtmlDeckSession({
  id = createSessionId(),
  title = "HTML deck",
  sourceLabel = title,
  sourceUrl = "",
  mode = "document",
  slides = [],
} = {}) {
  const normalizedSlides = slides.map((slide, index) => ({
    id: `${id}-slide-${index + 1}`,
    type: "html",
    title: slide?.title || `Slide ${index + 1}`,
    notes: slide?.notes || "",
    html: String(slide?.html ?? ""),
    runtimeHtml: slide?.runtimeHtml ? String(slide.runtimeHtml) : undefined,
  }));

  return {
    id,
    title,
    sourceLabel,
    sourceUrl,
    sourceType: "html",
    renderMode: normalizedSlides.some((slide) => slide.runtimeHtml) ? "html-runtime" : "html-static",
    mode,
    slides: normalizedSlides,
    currentIndex: 0,
    createdAt: Date.now(),
  };
}

export function createImageDeckSession({
  id = createSessionId(),
  title = "Image deck",
  sourceType = "image",
  sourceLabel = title,
  sourceUrl = "",
  mode = "image",
  slides = [],
} = {}) {
  const normalizedSlides = slides.map((slide, index) => {
    const title = slide?.title || `Slide ${index + 1}`;
    const notes = slide?.notes || "";
    const width = Number(slide?.width ?? 16);
    const height = Number(slide?.height ?? 9);
    const aspectRatio = aspectRatioLabel(width, height);
    const src = String(slide?.src ?? slide?.url ?? "");

    return {
      id: `${id}-slide-${index + 1}`,
      type: "image",
      title,
      notes,
      src,
      width,
      height,
      aspectRatio,
      html: buildImageSlideDocument({ src, title, aspectRatio }),
    };
  });

  return {
    id,
    title,
    sourceLabel,
    sourceUrl,
    sourceType,
    renderMode: "image",
    mode,
    slides: normalizedSlides,
    currentIndex: 0,
    createdAt: Date.now(),
  };
}

export function createRemotePresentSession({
  id = createSessionId(),
  title = "Remote presentation",
  sourceType = "remote",
  sourceLabel = title,
  sourceUrl = "",
} = {}) {
  return {
    id,
    title,
    sourceLabel,
    sourceUrl,
    sourceType,
    renderMode: "remote-present",
    mode: "remote-present",
    slides: [
      {
        id: `${id}-slide-1`,
        type: "remote",
        title,
        notes: "",
        url: sourceUrl,
      },
    ],
    currentIndex: 0,
    createdAt: Date.now(),
  };
}

export function buildImageSlideDocument({ src = "", title = "Slide", aspectRatio = DEFAULT_ASPECT_RATIO } = {}) {
  const safeSrc = escapeAttribute(src);
  const safeTitle = escapeHtml(title);
  const safeAspectRatio = escapeHtml(aspectRatio);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${safeTitle}</title>
    <style>
      * { box-sizing: border-box; }
      html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #050505; }
      body { display: grid; place-items: center; }
      img {
        display: block;
        width: 100vw;
        height: 100vh;
        object-fit: contain;
        background: #050505;
      }
    </style>
  </head>
  <body data-tada-image-slide data-aspect-ratio="${safeAspectRatio}">
    <img src="${safeSrc}" alt="${safeTitle}">
  </body>
</html>`;
}

function createSessionId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function aspectRatioLabel(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return DEFAULT_ASPECT_RATIO;
  }

  const ratio = width / height;
  if (Math.abs(ratio - 16 / 9) < 0.04) {
    return "16:9";
  }

  if (Math.abs(ratio - 4 / 3) < 0.04) {
    return "4:3";
  }

  return `${Math.round(width)}:${Math.round(height)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
