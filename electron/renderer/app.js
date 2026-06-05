import {
  buildTadaShowDocument,
  extractSlides,
  getKeyNavigationIntent,
  normalizeSelector,
  normalizeSourceUrl,
} from "../../src/shared/deckify.js";

const api = window.htmlPresenter;
let activeStageDocumentUrl = "";

const state = {
  slides: [],
  index: 0,
  mode: "section",
  sourceLabel: "No deck loaded",
  sourceUrl: "",
  panelOpen: true,
  panelTab: "thumbnails",
  isPresenting: false,
  startedAt: null,
  elapsedTimer: null,
  deckVersion: 0,
  stageRequestVersion: 0,
  updateStatus: {
    status: "unknown",
    message: "Checking availability...",
    canCheck: false,
    canInstall: false,
  },
};

const elements = {
  sourceLabel: document.querySelector("#sourceLabel"),
  sourceForm: document.querySelector("#sourceForm"),
  sourceInput: document.querySelector("#sourceInput"),
  loadSourceButton: document.querySelector("#loadSourceButton"),
  presentButton: document.querySelector("#presentButton"),
  openButton: document.querySelector("#openButton"),
  exportShowButton: document.querySelector("#exportShowButton"),
  updateButton: document.querySelector("#updateButton"),
  emptyOpenButton: document.querySelector("#emptyOpenButton"),
  panelToggle: document.querySelector("#panelToggle"),
  fullscreenButton: document.querySelector("#fullscreenButton"),
  sidePanel: document.querySelector("#sidePanel"),
  thumbnailPanel: document.querySelector("#thumbnailPanel"),
  presenterPanel: document.querySelector("#presenterPanel"),
  currentTitle: document.querySelector("#currentTitle"),
  nextTitle: document.querySelector("#nextTitle"),
  elapsedTime: document.querySelector("#elapsedTime"),
  updateStatusText: document.querySelector("#updateStatusText"),
  notesText: document.querySelector("#notesText"),
  presentationArea: document.querySelector("#presentationArea"),
  exitPresentationButton: document.querySelector("#exitPresentationButton"),
  dropLayer: document.querySelector("#dropLayer"),
  stage: document.querySelector("#stage"),
  emptyState: document.querySelector("#emptyState"),
  slideFrame: document.querySelector("#slideFrame"),
  prevStageButton: document.querySelector("#prevStageButton"),
  nextStageButton: document.querySelector("#nextStageButton"),
  prevButton: document.querySelector("#prevButton"),
  nextButton: document.querySelector("#nextButton"),
  slidePosition: document.querySelector("#slidePosition"),
  modeLabel: document.querySelector("#modeLabel"),
  selectorInput: document.querySelector("#selectorInput"),
  fitMode: document.querySelector("#fitMode"),
  toast: document.querySelector("#toast"),
  tabButtons: Array.from(document.querySelectorAll("[data-panel-tab]")),
};

bindEvents();
render();

window.addEventListener("beforeunload", () => {
  revokeActiveStageDocumentUrl();
});

function bindEvents() {
  elements.sourceForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void loadFromSourceInput();
  });

  elements.openButton.addEventListener("click", () => {
    void openFile();
  });

  elements.emptyOpenButton.addEventListener("click", () => {
    void openFile();
  });

  elements.presentButton.addEventListener("click", () => {
    void enterPresentationMode();
  });

  elements.exportShowButton.addEventListener("click", () => {
    void exportShow();
  });

  elements.updateButton.addEventListener("click", () => {
    void handleUpdateButtonClick();
  });

  elements.exitPresentationButton.addEventListener("click", () => {
    void exitPresentationMode();
  });

  elements.panelToggle.addEventListener("click", () => {
    state.panelOpen = !state.panelOpen;
    document.body.classList.toggle("side-collapsed", !state.panelOpen);
    elements.panelToggle.setAttribute("aria-pressed", String(state.panelOpen));
  });

  elements.fullscreenButton.addEventListener("click", () => {
    void toggleFullscreen();
  });

  elements.prevButton.addEventListener("click", () => goToSlide(state.index - 1));
  elements.nextButton.addEventListener("click", () => goToSlide(state.index + 1));
  elements.prevStageButton.addEventListener("click", () => navigateByIntent("previous"));
  elements.nextStageButton.addEventListener("click", () => navigateByIntent("next"));

  elements.fitMode.addEventListener("change", () => {
    applyFitMode(elements.fitMode.value);
  });

  elements.selectorInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && state.sourceUrl) {
      event.preventDefault();
      reloadCurrentPayload();
    }
  });

  for (const button of elements.tabButtons) {
    button.addEventListener("click", () => setPanelTab(button.dataset.panelTab));
  }

  window.addEventListener("keydown", handleKeydown);
  window.addEventListener("message", handleSlideMessage);

  for (const eventName of ["dragenter", "dragover"]) {
    elements.presentationArea.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropLayer.hidden = false;
    });
  }

  for (const eventName of ["dragleave", "drop"]) {
    elements.presentationArea.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropLayer.hidden = true;
    });
  }

  elements.presentationArea.addEventListener("drop", (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      void loadDroppedFile(file);
    }
  });

  elements.slideFrame.addEventListener("load", () => {
    bindFrameNavigation();
    postSlideIndexToFrame();
  });

  api?.onFileOpened?.((payload) => {
    if (payload) {
      loadPayload(payload);
    }
  });

  api?.onSourceError?.((message) => {
    showToast(message);
  });

  api?.onUpdateStatus?.((status) => {
    applyUpdateStatus(status);
  });

  notifyRendererReady();
  window.setTimeout(() => {
    if (state.slides.length === 0 && !state.sourceUrl) {
      notifyRendererReady();
    }
  }, 250);
  void refreshUpdateStatus();
}

async function openFile() {
  if (!api?.openFile) {
    showToast("Desktop file picker is not available.");
    return;
  }

  setBusy(true);
  try {
    const payload = await api.openFile();
    if (payload) {
      loadPayload(payload);
    }
  } catch (error) {
    showToast(error.message);
  } finally {
    setBusy(false);
  }
}

async function loadFromSourceInput() {
  if (!api?.loadSource) {
    showToast("Desktop source loading is not available.");
    return;
  }

  let normalizedSource;
  try {
    normalizedSource = normalizeSourceUrl(elements.sourceInput.value);
  } catch (error) {
    showToast(error.message);
    return;
  }

  setBusy(true);
  try {
    const payload = await api.loadSource(normalizedSource);
    loadPayload(payload);
  } catch (error) {
    showToast(error.message);
  } finally {
    setBusy(false);
  }
}

async function loadDroppedFile(file) {
  setBusy(true);
  try {
    if (api?.readDroppedFile) {
      loadPayload(await api.readDroppedFile(file));
      return;
    }

    if (!/\.html?$/i.test(file.name) && file.type && file.type !== "text/html") {
      throw new Error("Choose an HTML file.");
    }

    loadPayload({
      html: await file.text(),
      sourceLabel: file.name,
      sourceUrl: "",
    });
  } catch (error) {
    showToast(error.message);
  } finally {
    setBusy(false);
  }
}

async function toggleFullscreen() {
  try {
    await api?.toggleFullscreen?.();
  } catch {
    showToast("Fullscreen is not available.");
  }
}

async function enterPresentationMode() {
  if (state.slides.length === 0) {
    showToast("Load a deck before presenting.");
    return;
  }

  setPresentationMode(true);
  try {
    await api?.setFullscreen?.(true);
  } catch {
    showToast("Fullscreen is not available.");
  }
  focusStage();
}

async function exitPresentationMode() {
  if (!state.isPresenting) {
    return;
  }

  setPresentationMode(false);
  try {
    await api?.setFullscreen?.(false);
  } catch {
    showToast("Could not exit fullscreen.");
  }
  focusStage();
}

async function exportShow() {
  if (state.slides.length === 0) {
    showToast("Load a deck before exporting.");
    return;
  }

  if (!api?.saveShowHtml) {
    showToast("Show export is not available.");
    return;
  }

  setBusy(true);
  try {
    const showHtml = buildTadaShowDocument({
      title: state.sourceLabel || "tada show",
      mode: state.mode,
      slides: state.slides,
    });
    const result = await api.saveShowHtml({
      html: showHtml,
      sourceLabel: state.sourceLabel,
    });
    if (result?.sourceLabel) {
      showToast(`Exported ${result.sourceLabel}`);
    }
  } catch (error) {
    showToast(error.message);
  } finally {
    setBusy(false);
  }
}

async function refreshUpdateStatus() {
  if (!api?.getUpdateStatus) {
    applyUpdateStatus({
      status: "unavailable",
      message: "Updates are only available in the desktop app.",
      canCheck: false,
      canInstall: false,
    });
    return;
  }

  try {
    applyUpdateStatus(await api.getUpdateStatus());
  } catch {
    applyUpdateStatus({
      status: "error",
      message: "Could not read update status.",
      canCheck: false,
      canInstall: false,
    });
  }
}

function notifyRendererReady() {
  void api?.rendererReady?.();
}

async function handleUpdateButtonClick() {
  if (!api?.checkForUpdates) {
    showToast("Updates are not available in this build.");
    return;
  }

  const status = state.updateStatus;
  try {
    if (status.canInstall && api?.installUpdate) {
      applyUpdateStatus(await api.installUpdate());
      return;
    }

    applyUpdateStatus(await api.checkForUpdates());
  } catch (error) {
    showToast(error.message);
  }
}

function loadPayload(payload) {
  const html = String(payload?.html ?? "");
  if (!html.trim()) {
    throw new Error("That document is empty.");
  }

  const selector = normalizeSelector(elements.selectorInput.value);
  const parsed = extractSlides(html, {
    selector,
    sourceUrl: payload.sourceUrl ?? "",
  });

  state.slides = parsed.slides;
  state.index = 0;
  state.mode = parsed.mode === "selector" ? selector : parsed.mode;
  state.sourceLabel = payload.sourceLabel || sourceLabelFromUrl(payload.sourceUrl) || "Loaded deck";
  state.sourceUrl = payload.sourceUrl ?? "";
  state.lastPayload = payload;
  state.startedAt = Date.now();
  state.deckVersion += 1;
  elements.slideFrame.removeAttribute("data-deck-version");
  elements.slideFrame.removeAttribute("data-runtime-frame");

  if (state.isPresenting) {
    setPresentationMode(false);
    void api?.setFullscreen?.(false);
  }

  if (state.sourceUrl) {
    elements.sourceInput.value = state.sourceUrl;
  }

  startElapsedTimer();
  render();
  focusStage();

  if (payload.presentOnOpen) {
    void enterPresentationMode();
  }
}

function reloadCurrentPayload() {
  if (!state.lastPayload) {
    return;
  }

  try {
    loadPayload(state.lastPayload);
  } catch (error) {
    showToast(error.message);
  }
}

function render() {
  void renderSlide();
  renderThumbnails();
  renderPresenterPanel();
  renderUpdateStatus();
  updateControls();
}

async function renderSlide() {
  if (state.slides.length === 0) {
    state.stageRequestVersion += 1;
    elements.slideFrame.hidden = true;
    elements.slideFrame.removeAttribute("srcdoc");
    elements.slideFrame.removeAttribute("src");
    elements.slideFrame.removeAttribute("data-deck-version");
    elements.slideFrame.removeAttribute("data-runtime-frame");
    revokeActiveStageDocumentUrl();
    elements.emptyState.hidden = false;
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

    const requestVersion = ++state.stageRequestVersion;
    elements.slideFrame.dataset.deckVersion = deckVersion;
    elements.slideFrame.dataset.runtimeFrame = "true";
    try {
      await setStageFrameDocument(slide.runtimeHtml, requestVersion);
    } catch (error) {
      showToast(error.message);
    }
    return;
  }

  const requestVersion = ++state.stageRequestVersion;
  elements.slideFrame.dataset.deckVersion = `${state.deckVersion}:${state.index}`;
  elements.slideFrame.dataset.runtimeFrame = "false";
  try {
    await setStageFrameDocument(slide.html, requestVersion);
  } catch (error) {
    showToast(error.message);
  }
}

async function setStageFrameDocument(html, requestVersion) {
  const nextUrl = await createStageDocumentUrl(html);
  if (requestVersion !== state.stageRequestVersion) {
    revokeStageDocumentUrl(nextUrl);
    return;
  }

  elements.slideFrame.removeAttribute("srcdoc");
  elements.slideFrame.src = nextUrl;
  revokeActiveStageDocumentUrl();
  activeStageDocumentUrl = nextUrl;
}

function revokeActiveStageDocumentUrl() {
  if (!activeStageDocumentUrl) {
    return;
  }

  revokeStageDocumentUrl(activeStageDocumentUrl);
  activeStageDocumentUrl = "";
}

async function createStageDocumentUrl(html) {
  if (api?.createSlideDocument) {
    return api.createSlideDocument(html);
  }

  return URL.createObjectURL(new Blob([html], { type: "text/html" }));
}

function revokeStageDocumentUrl(sourceUrl) {
  if (!sourceUrl) {
    return;
  }

  if (String(sourceUrl).startsWith("tada-slide:") && api?.revokeSlideDocument) {
    void api.revokeSlideDocument(sourceUrl);
    return;
  }

  if (String(sourceUrl).startsWith("blob:")) {
    URL.revokeObjectURL(sourceUrl);
  }
}

function renderThumbnails() {
  if (state.slides.length === 0) {
    elements.thumbnailPanel.innerHTML = '<div class="thumbnail-empty">No slides</div>';
    return;
  }

  const list = document.createElement("div");
  list.className = "thumbnail-list";

  state.slides.forEach((slide, index) => {
    const button = document.createElement("button");
    button.className = `thumbnail-button${index === state.index ? " is-active" : ""}`;
    button.type = "button";
    button.setAttribute("aria-label", `Go to slide ${index + 1}`);
    if (index === state.index) {
      button.setAttribute("aria-current", "true");
    }
    button.addEventListener("click", () => goToSlide(index));

    const preview = document.createElement("div");
    preview.className = "thumbnail-preview";

    const frame = document.createElement("iframe");
    frame.title = `Slide ${index + 1} preview`;
    frame.tabIndex = -1;
    frame.setAttribute("sandbox", "allow-same-origin");
    frame.srcdoc = slide.html;
    preview.append(frame);

    const meta = document.createElement("div");
    meta.className = "thumbnail-meta";

    const title = document.createElement("strong");
    title.textContent = slide.title || `Slide ${index + 1}`;

    const detail = document.createElement("span");
    detail.textContent = `${index + 1} of ${state.slides.length}`;

    meta.append(title, detail);
    button.append(preview, meta);
    list.append(button);
  });

  elements.thumbnailPanel.replaceChildren(list);
}

function renderPresenterPanel() {
  const currentSlide = state.slides[state.index];
  const nextSlide = state.slides[state.index + 1];

  elements.currentTitle.textContent = currentSlide?.title || (currentSlide ? `Slide ${state.index + 1}` : "No deck loaded");
  elements.nextTitle.textContent = nextSlide?.title || (nextSlide ? `Slide ${state.index + 2}` : "None");
  elements.notesText.textContent = currentSlide?.notes || "";
  elements.elapsedTime.textContent = formatElapsed();
}

function renderUpdateStatus() {
  elements.updateStatusText.textContent = state.updateStatus.message || "Updates unavailable.";
}

function updateControls() {
  const hasSlides = state.slides.length > 0;
  elements.sourceLabel.textContent = state.sourceLabel;
  elements.slidePosition.textContent = hasSlides ? `${state.index + 1} / ${state.slides.length}` : "0 / 0";
  elements.modeLabel.textContent = hasSlides ? state.mode : normalizeSelector(elements.selectorInput.value);
  elements.prevButton.disabled = !hasSlides || state.index === 0;
  elements.nextButton.disabled = !hasSlides || state.index === state.slides.length - 1;
  elements.prevStageButton.hidden = !hasSlides;
  elements.nextStageButton.hidden = !hasSlides;
  elements.prevStageButton.disabled = state.index === 0;
  elements.nextStageButton.disabled = state.index === state.slides.length - 1;
  elements.presentButton.disabled = !hasSlides;
  elements.exportShowButton.disabled = !hasSlides;
  elements.fullscreenButton.disabled = state.isPresenting;
  elements.updateButton.textContent = updateButtonLabel(state.updateStatus);
  elements.updateButton.disabled = !state.updateStatus.canCheck && !state.updateStatus.canInstall;
  elements.panelToggle.setAttribute("aria-pressed", String(state.panelOpen));
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
  render();
  focusStage();
}

function navigateByIntent(intent) {
  if (intent === "exit") {
    void exitPresentationMode();
    return;
  }

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

function handleKeydown(event) {
  if (isEditing(event.target)) {
    return;
  }

  const intent = getKeyNavigationIntent(event.key);
  if (intent === "exit" && !state.isPresenting) {
    return;
  }

  if (intent !== "none") {
    event.preventDefault();
    navigateByIntent(intent);
  }
}

function handleSlideMessage(event) {
  if (event.source !== elements.slideFrame.contentWindow) {
    return;
  }

  if (event.data?.type === "tada:navigate") {
    navigateByIntent(event.data.intent);
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

function bindFrameNavigation() {
  try {
    const frameDocument = elements.slideFrame.contentDocument;
    frameDocument?.addEventListener("keydown", handleKeydown, true);
  } catch {
    // Sandboxed or remote-origin content can block access; parent keyboard handling still works.
  }
}

function isEditing(target) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target?.isContentEditable
  );
}

function setPanelTab(tabName) {
  if (!tabName) {
    return;
  }

  state.panelTab = tabName;
  const showingPresenter = tabName === "presenter";
  elements.thumbnailPanel.hidden = showingPresenter;
  elements.presenterPanel.hidden = !showingPresenter;

  for (const button of elements.tabButtons) {
    const isActive = button.dataset.panelTab === tabName;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  }
}

function applyFitMode(mode) {
  elements.stage.classList.toggle("fit-frame", mode === "fit");
  elements.stage.classList.toggle("fill-frame", mode === "fill");
  elements.stage.classList.toggle("scroll-frame", mode === "scroll");
}

function setPresentationMode(isPresenting) {
  state.isPresenting = isPresenting;
  document.body.classList.toggle("presenting", isPresenting);
  elements.exitPresentationButton.hidden = !isPresenting;
  elements.presentationArea.setAttribute(
    "aria-label",
    isPresenting ? "Presentation mode" : "Presentation stage",
  );
  updateControls();
}

function startElapsedTimer() {
  if (state.elapsedTimer) {
    window.clearInterval(state.elapsedTimer);
  }

  state.elapsedTimer = window.setInterval(() => {
    elements.elapsedTime.textContent = formatElapsed();
  }, 1000);
}

function formatElapsed() {
  if (!state.startedAt) {
    return "00:00";
  }

  const totalSeconds = Math.max(0, Math.floor((Date.now() - state.startedAt) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function setBusy(isBusy) {
  const hasSlides = state.slides.length > 0;
  elements.sourceForm.toggleAttribute("aria-busy", isBusy);
  elements.loadSourceButton.disabled = isBusy;
  elements.openButton.disabled = isBusy;
  elements.presentButton.disabled = isBusy || !hasSlides;
  elements.exportShowButton.disabled = isBusy || !hasSlides;
  elements.emptyOpenButton.disabled = isBusy;
  elements.updateButton.disabled =
    isBusy || (!state.updateStatus.canCheck && !state.updateStatus.canInstall);
}

function showToast(message) {
  elements.toast.textContent = message || "Something went wrong.";
  elements.toast.hidden = false;
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 4600);
}

function focusStage() {
  requestAnimationFrame(() => {
    elements.presentationArea.focus({ preventScroll: true });
  });
}

function applyUpdateStatus(status) {
  state.updateStatus = normalizeUpdateStatus(status);
  renderUpdateStatus();
  updateControls();
}

function normalizeUpdateStatus(status) {
  return {
    status: String(status?.status ?? "unknown"),
    message: String(status?.message ?? "Updates unavailable."),
    canCheck: Boolean(status?.canCheck),
    canInstall: Boolean(status?.canInstall),
  };
}

function updateButtonLabel(status) {
  if (status.canInstall) return "Install";
  if (["checking", "available", "downloading"].includes(status.status)) return "Updating";
  return "Update";
}

function sourceLabelFromUrl(value) {
  if (!value) {
    return "";
  }

  try {
    const url = new URL(value);
    if (url.protocol === "file:") {
      return decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) ?? value);
    }

    return decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) ?? "") || url.hostname;
  } catch {
    return value;
  }
}
