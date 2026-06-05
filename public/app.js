import {
  extractSlides,
  getKeyNavigationIntent,
  normalizeSelector,
  normalizeSourceUrl,
} from "./deckify.js";

const state = {
  slides: [],
  index: 0,
  mode: "section",
  sourceLabel: "No deck loaded",
  deckVersion: 0,
};

const elements = {
  sourceForm: document.querySelector("#sourceForm"),
  urlInput: document.querySelector("#urlInput"),
  selectorInput: document.querySelector("#selectorInput"),
  fileInput: document.querySelector("#fileInput"),
  sourceStatus: document.querySelector("#sourceStatus"),
  presentationShell: document.querySelector("#presentationShell"),
  stage: document.querySelector("#stage"),
  emptyState: document.querySelector("#emptyState"),
  slideFrame: document.querySelector("#slideFrame"),
  prevButton: document.querySelector("#prevButton"),
  nextButton: document.querySelector("#nextButton"),
  prevStageButton: document.querySelector("#prevStageButton"),
  nextStageButton: document.querySelector("#nextStageButton"),
  slidePosition: document.querySelector("#slidePosition"),
  modeLabel: document.querySelector("#modeLabel"),
  fitMode: document.querySelector("#fitMode"),
  fullscreenButton: document.querySelector("#fullscreenButton"),
  dropLayer: document.querySelector("#dropLayer"),
  toast: document.querySelector("#toast"),
};

elements.sourceForm.addEventListener("submit", (event) => {
  event.preventDefault();
  loadFromUrl();
});

elements.fileInput.addEventListener("change", () => {
  const file = elements.fileInput.files?.[0];
  if (file) {
    loadFromFile(file);
  }
});

elements.prevButton.addEventListener("click", () => goToSlide(state.index - 1));
elements.nextButton.addEventListener("click", () => goToSlide(state.index + 1));
elements.prevStageButton.addEventListener("click", () => navigateByIntent("previous"));
elements.nextStageButton.addEventListener("click", () => navigateByIntent("next"));

elements.fitMode.addEventListener("change", () => {
  applyFitMode(elements.fitMode.value);
});

elements.fullscreenButton.addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await elements.presentationShell.requestFullscreen();
  } catch {
    showToast("Fullscreen is not available in this browser.");
  }
});

window.addEventListener("keydown", (event) => {
  const activeElement = document.activeElement;
  const isEditing =
    activeElement instanceof HTMLInputElement ||
    activeElement instanceof HTMLTextAreaElement ||
    activeElement instanceof HTMLSelectElement;

  if (isEditing) {
    return;
  }

  const intent = getKeyNavigationIntent(event.key);
  if (intent !== "none") {
    event.preventDefault();
    navigateByIntent(intent);
  }
});

window.addEventListener("message", (event) => {
  if (event.source === elements.slideFrame.contentWindow && event.data?.type === "tada:navigate") {
    navigateByIntent(event.data.intent);
  }
});

elements.slideFrame.addEventListener("load", () => {
  postSlideIndexToFrame();
});

for (const eventName of ["dragenter", "dragover"]) {
  elements.presentationShell.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropLayer.hidden = false;
  });
}

for (const eventName of ["dragleave", "drop"]) {
  elements.presentationShell.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropLayer.hidden = true;
  });
}

elements.presentationShell.addEventListener("drop", (event) => {
  const file = event.dataTransfer?.files?.[0];
  if (file) {
    loadFromFile(file);
  }
});

updateControls();

async function loadFromUrl() {
  let normalizedUrl;
  try {
    normalizedUrl = normalizeSourceUrl(elements.urlInput.value);
  } catch (error) {
    showToast(error.message);
    return;
  }

  setBusy(true);
  try {
    const response = await fetch(`/api/fetch?url=${encodeURIComponent(normalizedUrl)}`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? "Could not load that URL.");
    }

    loadDeck(payload.html, payload.sourceLabel ?? sourceLabelFromUrl(normalizedUrl));
  } catch (error) {
    showToast(error.message);
  } finally {
    setBusy(false);
  }
}

async function loadFromFile(file) {
  if (!/\.html?$/i.test(file.name) && file.type && file.type !== "text/html") {
    showToast("Choose an HTML file.");
    return;
  }

  setBusy(true);
  try {
    const html = await file.text();
    if (!html.trim()) {
      throw new Error("That file is empty.");
    }
    loadDeck(html, file.name);
  } catch (error) {
    showToast(error.message);
  } finally {
    setBusy(false);
  }
}

function loadDeck(html, sourceLabel) {
  const selector = normalizeSelector(elements.selectorInput.value);
  const parsed = extractSlides(html, { selector });

  state.slides = parsed.slides;
  state.index = 0;
  state.mode = parsed.mode === "selector" ? selector : parsed.mode;
  state.sourceLabel = sourceLabel;
  state.deckVersion += 1;
  elements.slideFrame.removeAttribute("data-deck-version");
  elements.slideFrame.removeAttribute("data-runtime-frame");

  renderSlide();
  updateControls();
  elements.presentationShell.focus({ preventScroll: true });
}

function renderSlide() {
  if (state.slides.length === 0) {
    elements.slideFrame.hidden = true;
    elements.emptyState.hidden = false;
    elements.slideFrame.removeAttribute("srcdoc");
    elements.slideFrame.removeAttribute("data-deck-version");
    elements.slideFrame.removeAttribute("data-runtime-frame");
    return;
  }

  elements.emptyState.hidden = true;
  elements.slideFrame.hidden = false;

  const slide = state.slides[state.index];
  if (slide.runtimeHtml) {
    const deckVersion = String(state.deckVersion);
    if (elements.slideFrame.dataset.deckVersion === deckVersion && elements.slideFrame.dataset.runtimeFrame === "true") {
      postSlideIndexToFrame();
      return;
    }

    elements.slideFrame.dataset.deckVersion = deckVersion;
    elements.slideFrame.dataset.runtimeFrame = "true";
    elements.slideFrame.srcdoc = slide.runtimeHtml;
    return;
  }

  elements.slideFrame.dataset.deckVersion = `${state.deckVersion}:${state.index}`;
  elements.slideFrame.dataset.runtimeFrame = "false";
  elements.slideFrame.srcdoc = slide.html;
}

function goToSlide(nextIndex) {
  if (state.slides.length === 0) {
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

function navigateByIntent(intent) {
  if (intent === "next") {
    goToSlide(state.index + 1);
  }

  if (intent === "previous") {
    goToSlide(state.index - 1);
  }

  if (intent === "first") {
    goToSlide(0);
  }

  if (intent === "last") {
    goToSlide(state.slides.length - 1);
  }
}

function postSlideIndexToFrame() {
  if (state.slides.length === 0 || elements.slideFrame.hidden || elements.slideFrame.dataset.runtimeFrame !== "true") {
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

function updateControls() {
  const hasSlides = state.slides.length > 0;
  elements.prevButton.disabled = !hasSlides || state.index === 0;
  elements.nextButton.disabled = !hasSlides || state.index === state.slides.length - 1;
  elements.prevStageButton.hidden = !hasSlides;
  elements.nextStageButton.hidden = !hasSlides;
  elements.prevStageButton.disabled = state.index === 0;
  elements.nextStageButton.disabled = state.index === state.slides.length - 1;
  elements.slidePosition.textContent = hasSlides ? `${state.index + 1} / ${state.slides.length}` : "0 / 0";
  elements.modeLabel.textContent = hasSlides ? state.mode : normalizeSelector(elements.selectorInput.value);
  elements.sourceStatus.textContent = state.sourceLabel;
}

function applyFitMode(mode) {
  elements.stage.classList.toggle("fit-frame", mode === "fit");
  elements.stage.classList.toggle("fill-frame", mode === "fill");
  elements.stage.classList.toggle("scroll-frame", mode === "scroll");
}

function setBusy(isBusy) {
  elements.sourceForm.toggleAttribute("aria-busy", isBusy);
  elements.sourceForm.querySelectorAll("button, input").forEach((element) => {
    element.disabled = isBusy;
  });
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 4600);
}

function sourceLabelFromUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === "file:") {
      return decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) ?? value);
    }

    return url.hostname || value;
  } catch {
    return value;
  }
}
