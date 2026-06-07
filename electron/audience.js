const api = window.tadaAudience;

const state = {
  session: null,
  index: 0,
};

const elements = {
  emptyState: document.querySelector("#emptyState"),
  slideFrame: document.querySelector("#slideFrame"),
  previousButton: document.querySelector("#previousButton"),
  nextButton: document.querySelector("#nextButton"),
  counter: document.querySelector("#counter"),
};

bindEvents();

function bindEvents() {
  api?.onLoad?.((payload) => {
    state.session = normalizeSession(payload?.session);
    state.index = normalizeIndex(payload?.index);
    render();
  });

  api?.onSetIndex?.((index) => {
    state.index = normalizeIndex(index);
    render();
  });

  api?.onStop?.(() => {
    window.close();
  });

  elements.previousButton.addEventListener("click", () => sendIntent("previous"));
  elements.nextButton.addEventListener("click", () => sendIntent("next"));
  window.addEventListener("keydown", handleKeydown);
  window.addEventListener("message", handleSlideMessage);
  elements.slideFrame.addEventListener("load", postSlideIndexToFrame);
  api?.ready?.();
}

function render() {
  const slides = state.session?.slides ?? [];
  const slide = slides[state.index];

  elements.emptyState.hidden = slides.length > 0;
  elements.slideFrame.hidden = slides.length === 0;
  elements.counter.textContent = slides.length ? `${state.index + 1} / ${slides.length}` : "0 / 0";

  if (!slide) {
    elements.slideFrame.removeAttribute("src");
    elements.slideFrame.removeAttribute("srcdoc");
    return;
  }

  if (slide.type === "remote" && slide.url) {
    elements.slideFrame.removeAttribute("srcdoc");
    elements.slideFrame.src = slide.url;
    return;
  }

  const html = slide.runtimeHtml || slide.html || buildImageFallback(slide);
  if (elements.slideFrame.srcdoc !== html) {
    elements.slideFrame.removeAttribute("src");
    elements.slideFrame.srcdoc = html;
  } else {
    postSlideIndexToFrame();
  }
}

function sendIntent(intent) {
  api?.sendIntent?.(intent);
}

function handleKeydown(event) {
  const intent = intentFromKey(event.key);
  if (intent === "none") {
    return;
  }

  event.preventDefault();
  sendIntent(intent);
}

function handleSlideMessage(event) {
  if (event.source !== elements.slideFrame.contentWindow) {
    return;
  }

  if (event.data?.type === "tada:navigate") {
    sendIntent(event.data.intent);
  }
}

function postSlideIndexToFrame() {
  elements.slideFrame.contentWindow?.postMessage(
    {
      type: "tada:set-slide",
      index: state.index,
    },
    "*",
  );
}

function normalizeSession(session) {
  if (!session || typeof session !== "object") {
    return { slides: [] };
  }

  return {
    ...session,
    slides: Array.isArray(session.slides) ? session.slides : [],
  };
}

function normalizeIndex(index) {
  const slides = state.session?.slides ?? [];
  if (slides.length === 0) {
    return 0;
  }

  return Math.max(0, Math.min(Number(index) || 0, slides.length - 1));
}

function intentFromKey(key) {
  if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter", "n", "N"].includes(key)) return "next";
  if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace", "p", "P"].includes(key)) return "previous";
  if (key === "Home") return "first";
  if (key === "End") return "last";
  if (key === "Escape") return "exit";
  return "none";
}

function buildImageFallback(slide) {
  const title = escapeHtml(slide?.title || "Slide");
  const src = escapeAttribute(slide?.src || "");
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{width:100%;height:100%;margin:0;background:#050505;overflow:hidden}body{display:grid;place-items:center}img{max-width:100vw;max-height:100vh;object-fit:contain}</style></head><body><img src="${src}" alt="${title}"></body></html>`;
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
