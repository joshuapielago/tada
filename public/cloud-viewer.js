import {
  buildSlideDocument,
  extractSlides,
  getKeyNavigationIntent,
  injectBaseElement,
} from "./deckify.js";

const deckId = location.pathname.split("/").filter(Boolean).at(-1);
const state = {
  deck: null,
  slides: [],
  html: "",
  index: 0,
  originalMode: false,
};

const elements = {
  deckTitle: document.querySelector("#deckTitle"),
  frameWrap: document.querySelector("#frameWrap"),
  slideFrame: document.querySelector("#slideFrame"),
  prevButton: document.querySelector("#prevButton"),
  nextButton: document.querySelector("#nextButton"),
  slidePosition: document.querySelector("#slidePosition"),
  originalButton: document.querySelector("#originalButton"),
  reportButton: document.querySelector("#reportButton"),
  reportForm: document.querySelector("#reportForm"),
  reportReason: document.querySelector("#reportReason"),
  reporterEmail: document.querySelector("#reporterEmail"),
  cancelReportButton: document.querySelector("#cancelReportButton"),
  toast: document.querySelector("#toast"),
};

elements.prevButton.addEventListener("click", () => goToSlide(state.index - 1));
elements.nextButton.addEventListener("click", () => goToSlide(state.index + 1));
elements.originalButton.addEventListener("click", () => showOriginalMode());
elements.reportButton.addEventListener("click", () => {
  elements.reportForm.hidden = false;
  elements.reportReason.focus();
});
elements.cancelReportButton.addEventListener("click", () => {
  elements.reportForm.hidden = true;
});
elements.reportForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await submitReport();
});
elements.slideFrame.addEventListener("load", () => {
  postSlideIndexToFrame();
});

window.addEventListener("keydown", (event) => {
  if (state.originalMode) {
    return;
  }
  const intent = getKeyNavigationIntent(event.key);
  if (intent === "none") {
    return;
  }
  event.preventDefault();
  if (intent === "next") goToSlide(state.index + 1);
  if (intent === "previous") goToSlide(state.index - 1);
  if (intent === "first") goToSlide(0);
  if (intent === "last") goToSlide(state.slides.length - 1);
});

loadDeck();

async function loadDeck() {
  try {
    const metadataResponse = await fetch(`/api/decks/${deckId}`);
    const deck = await metadataResponse.json();
    if (!metadataResponse.ok) {
      throw new Error(deck.error?.message ?? "Deck was not found.");
    }

    state.deck = deck;
    elements.deckTitle.textContent = deck.title;
    document.title = `${deck.title} - tada`;
    elements.frameWrap.style.setProperty("--deck-ratio", `${deck.aspectRatio.width} / ${deck.aspectRatio.height}`);

    const fileUrl = `/api/decks/${deckId}/files/index.html`;
    const fileResponse = await fetch(fileUrl);
    if (!fileResponse.ok) {
      throw new Error("Deck content could not be loaded.");
    }
    const baseUrl = new URL(`/api/decks/${deckId}/files/`, location.origin).href;
    state.html = injectBaseElement(await fileResponse.text(), baseUrl);
    const parsed = extractSlides(state.html, { sourceUrl: baseUrl });
    state.slides = parsed.slides;

    if (state.slides.length === 0) {
      elements.originalButton.hidden = false;
      showOriginalMode();
      return;
    }

    renderSlide();
    updateControls();
  } catch (error) {
    renderError(error.message);
  }
}

function renderSlide() {
  state.originalMode = false;
  elements.originalButton.hidden = state.slides.length > 0;
  const slide = state.slides[state.index];
  if (slide.runtimeHtml) {
    if (elements.slideFrame.dataset.runtimeFrame === "true") {
      postSlideIndexToFrame();
      return;
    }
    elements.slideFrame.dataset.runtimeFrame = "true";
    elements.slideFrame.srcdoc = slide.runtimeHtml;
    return;
  }
  elements.slideFrame.dataset.runtimeFrame = "false";
  elements.slideFrame.srcdoc = buildSlideDocument({
    content: slide.html,
    sourceUrl: new URL(`/api/decks/${deckId}/files/`, location.origin).href,
  });
}

function showOriginalMode() {
  state.originalMode = true;
  elements.originalButton.hidden = true;
  elements.slideFrame.dataset.runtimeFrame = "false";
  elements.slideFrame.removeAttribute("srcdoc");
  elements.slideFrame.src = `/api/decks/${deckId}/files/index.html`;
  elements.slidePosition.textContent = "Original";
  elements.prevButton.disabled = true;
  elements.nextButton.disabled = true;
}

function postSlideIndexToFrame() {
  if (!state.slides.length || elements.slideFrame.dataset.runtimeFrame !== "true") {
    return;
  }
  elements.slideFrame.contentWindow?.postMessage(
    {
      type: "tada:set-slide",
      index: state.index,
    },
    "*",
  );
}

function goToSlide(nextIndex) {
  if (!state.slides.length || state.originalMode) {
    return;
  }
  const boundedIndex = Math.max(0, Math.min(nextIndex, state.slides.length - 1));
  if (boundedIndex === state.index) {
    return;
  }
  state.index = boundedIndex;
  renderSlide();
  updateControls();
}

function updateControls() {
  const hasSlides = state.slides.length > 0 && !state.originalMode;
  elements.prevButton.disabled = !hasSlides || state.index === 0;
  elements.nextButton.disabled = !hasSlides || state.index === state.slides.length - 1;
  elements.slidePosition.textContent = hasSlides ? `${state.index + 1} / ${state.slides.length}` : "0 / 0";
}

function renderError(message) {
  elements.deckTitle.textContent = "Deck unavailable";
  elements.slideFrame.srcdoc = `<!doctype html><body style="margin:0;display:grid;place-items:center;min-height:100vh;font-family:system-ui;background:#fff;color:#181715"><main><h1>Deck unavailable</h1><p>${escapeHtml(message)}</p></main></body>`;
  elements.prevButton.disabled = true;
  elements.nextButton.disabled = true;
}

async function submitReport() {
  const reason = elements.reportReason.value.trim();
  if (!reason) {
    showToast("Add a reason first.");
    return;
  }
  const response = await fetch("/api/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deckId,
      reason,
      reporterEmail: elements.reporterEmail.value.trim(),
    }),
  });
  if (!response.ok) {
    showToast("Report could not be submitted.");
    return;
  }
  elements.reportForm.hidden = true;
  elements.reportReason.value = "";
  elements.reporterEmail.value = "";
  showToast("Report recorded.");
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 4200);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
