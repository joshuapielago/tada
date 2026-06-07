import {
  buildTadaShowDocument,
  extractSlides,
  getKeyNavigationIntent,
  normalizeSelector,
  normalizeSourceUrl,
} from "../../src/shared/deckify.js";
import { createHtmlDeckSession } from "../../src/shared/deck-session.js";
import { buildClaudeDeckPrompt, getPastedHtml } from "../../src/shared/ingest.js";

const api = window.htmlPresenter;
let activeStageDocumentUrl = "";
let activeThumbnailIndex = -1;
let thumbnailHydrationVersion = 0;

const state = {
  slides: [],
  index: 0,
  mode: "section",
  sourceLabel: "No deck loaded",
  sourceUrl: "",
  panelOpen: true,
  panelTab: "thumbnails",
  isPresenting: false,
  deckSession: null,
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
  emptyFocusSourceButton: document.querySelector("#emptyFocusSourceButton"),
  copyPromptButton: document.querySelector("#copyPromptButton"),
  panelToggle: document.querySelector("#panelToggle"),
  fullscreenButton: document.querySelector("#fullscreenButton"),
  sidePanel: document.querySelector("#sidePanel"),
  railTitle: document.querySelector("#railTitle"),
  deckCountBadge: document.querySelector("#deckCountBadge"),
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
  slideMeterFill: document.querySelector("#slideMeterFill"),
  modeLabel: document.querySelector("#modeLabel"),
  selectorInput: document.querySelector("#selectorInput"),
  fitMode: document.querySelector("#fitMode"),
  toast: document.querySelector("#toast"),
  tabButtons: Array.from(document.querySelectorAll("[data-panel-tab]")),
};

bindEvents();
renderDeck();

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

  elements.emptyFocusSourceButton.addEventListener("click", () => {
    focusSourceInput();
  });

  elements.copyPromptButton.addEventListener("click", () => {
    void copyClaudePrompt();
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
  window.addEventListener("paste", handlePaste);
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

  elements.slideFrame.addEventListener("load", syncFrameAfterLoad);

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

  api?.onPresentationIntent?.((intent) => {
    navigateByIntent(intent);
  });

  api?.onPresentationStopped?.(() => {
    if (state.isPresenting) {
      setPresentationMode(false);
    }
  });

  notifyRendererReady();
  window.setTimeout(() => {
    if (state.slides.length === 0 && !state.sourceUrl) {
      notifyRendererReady();
    }
  }, 250);
  window.setTimeout(() => {
    void refreshUpdateStatus();
  }, 650);
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

async function copyClaudePrompt() {
  const prompt = buildClaudeDeckPrompt();
  try {
    if (api?.writeClipboardText) {
      await api.writeClipboardText(prompt);
    } else {
      await navigator.clipboard.writeText(prompt);
    }
    showToast("Copied Claude deck prompt.");
  } catch {
    showToast("Could not copy the prompt.");
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

  if (api?.startPresentation) {
    try {
      await api.startPresentation({
        session: buildPresentationSession(),
        index: state.index,
      });
      setPresentationMode(true);
      setPanelTab("presenter");
      focusStage();
      return;
    } catch (error) {
      showToast(error.message || "Could not start presentation.");
    }
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
    await api?.stopPresentation?.();
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
      title: state.sourceLabel || "TaDa! show",
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
  if (payload?.session) {
    loadSessionPayload(payload);
    return;
  }

  const html = String(payload?.html ?? "");
  if (!html.trim()) {
    throw new Error("That document is empty.");
  }

  const selector = normalizeSelector(elements.selectorInput.value);
  const parsed = extractSlides(html, {
    selector,
    sourceUrl: payload.sourceUrl ?? "",
  });

  const sourceLabel = payload.sourceLabel || sourceLabelFromUrl(payload.sourceUrl) || "Loaded deck";
  const deckSession = createHtmlDeckSession({
    title: sourceLabel,
    sourceLabel,
    sourceUrl: payload.sourceUrl ?? "",
    mode: parsed.mode === "selector" ? selector : parsed.mode,
    slides: parsed.slides,
  });

  state.deckSession = deckSession;
  state.slides = deckSession.slides;
  state.index = 0;
  state.mode = deckSession.mode;
  state.sourceLabel = sourceLabel;
  state.sourceUrl = payload.sourceUrl ?? "";
  state.lastPayload = payload;
  state.startedAt = Date.now();
  state.deckVersion += 1;
  elements.slideFrame.removeAttribute("data-deck-version");
  elements.slideFrame.removeAttribute("data-runtime-frame");

  if (state.isPresenting) {
    setPresentationMode(false);
    void api?.stopPresentation?.();
    void api?.setFullscreen?.(false);
  }

  if (state.sourceUrl) {
    elements.sourceInput.value = state.sourceUrl;
  }

  startElapsedTimer();
  renderDeck();
  focusStage();

  if (payload.presentOnOpen) {
    void enterPresentationMode();
  }
}

function loadSessionPayload(payload) {
  const session = normalizeDeckSession(payload.session);
  if (session.slides.length === 0) {
    throw new Error("That source did not produce any slides.");
  }

  state.deckSession = session;
  state.slides = session.slides;
  state.index = Math.max(0, Math.min(Number(session.currentIndex ?? 0) || 0, session.slides.length - 1));
  state.mode = session.mode || session.renderMode || payload.sourceType || "deck";
  state.sourceLabel = payload.sourceLabel || session.sourceLabel || session.title || "Loaded deck";
  state.sourceUrl = payload.sourceUrl ?? session.sourceUrl ?? "";
  state.lastPayload = payload;
  state.startedAt = Date.now();
  state.deckVersion += 1;
  elements.slideFrame.removeAttribute("data-deck-version");
  elements.slideFrame.removeAttribute("data-runtime-frame");

  if (state.isPresenting) {
    setPresentationMode(false);
    void api?.stopPresentation?.();
    void api?.setFullscreen?.(false);
  }

  if (state.sourceUrl) {
    elements.sourceInput.value = state.sourceUrl;
  }

  startElapsedTimer();
  renderDeck();
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

function renderDeck() {
  renderCurrentSlide();
  renderThumbnails();
}

function renderCurrentSlide() {
  void renderSlide();
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
    await setStageFrameDocument(getSlideDisplayHtml(slide), requestVersion);
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
  thumbnailHydrationVersion += 1;
  if (state.slides.length === 0) {
    activeThumbnailIndex = -1;
    elements.thumbnailPanel.innerHTML = '<div class="thumbnail-empty">No slides yet</div>';
    return;
  }

  const list = document.createElement("div");
  list.className = "thumbnail-list";
  const deferredPreviewFrames = [];

  state.slides.forEach((slide, index) => {
    const button = document.createElement("button");
    button.className = `thumbnail-button${index === state.index ? " is-active" : ""}`;
    button.type = "button";
    button.dataset.slideIndex = String(index);
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
    frame.loading = "lazy";
    frame.setAttribute("sandbox", "allow-same-origin");
    frame.dataset.previewIndex = String(index);
    if (index <= 1) {
      frame.srcdoc = getSlideDisplayHtml(slide);
    } else {
      deferredPreviewFrames.push(frame);
    }
    preview.append(frame);

    const meta = document.createElement("div");
    meta.className = "thumbnail-meta";

    const indexMark = document.createElement("span");
    indexMark.className = "thumbnail-index";
    indexMark.textContent = String(index + 1).padStart(2, "0");

    const title = document.createElement("strong");
    title.textContent = slide.title || `Slide ${index + 1}`;

    const detail = document.createElement("span");
    detail.textContent = `${index + 1} of ${state.slides.length}`;

    meta.append(title, detail);
    button.append(indexMark, preview, meta);
    list.append(button);
  });

  elements.thumbnailPanel.replaceChildren(list);
  activeThumbnailIndex = -1;
  updateActiveThumbnail(state.index);
  scheduleThumbnailPreviewHydration(deferredPreviewFrames, thumbnailHydrationVersion);
}

function updateActiveThumbnail(nextIndex = state.index) {
  if (activeThumbnailIndex === nextIndex && elements.thumbnailPanel.querySelector(".thumbnail-button.is-active")) {
    return;
  }

  const previousButton = elements.thumbnailPanel.querySelector(".thumbnail-button.is-active");
  previousButton?.classList.remove("is-active");
  previousButton?.removeAttribute("aria-current");

  const nextButton = elements.thumbnailPanel.querySelector(`[data-slide-index="${nextIndex}"]`);
  if (nextButton) {
    nextButton.classList.add("is-active");
    nextButton.setAttribute("aria-current", "true");
    nextButton.scrollIntoView({ block: "nearest" });
  }

  activeThumbnailIndex = nextIndex;
}

function scheduleThumbnailPreviewHydration(frames, version) {
  const queue = Array.from(frames);
  if (queue.length === 0) {
    return;
  }

  const hydrateNext = (deadline = { timeRemaining: () => 0 }) => {
    if (version !== thumbnailHydrationVersion) {
      return;
    }

    let hydrated = 0;
    while (queue.length > 0 && (hydrated < 2 || deadline.timeRemaining() > 8)) {
      const frame = queue.shift();
      const slideIndex = Number(frame?.dataset?.previewIndex ?? -1);
      const html = getSlideDisplayHtml(state.slides[slideIndex]);
      if (frame && html && !frame.srcdoc) {
        frame.srcdoc = html;
      }
      hydrated += 1;
    }

    if (queue.length > 0) {
      scheduleIdle(hydrateNext);
    }
  };

  scheduleIdle(hydrateNext);
}

function scheduleIdle(callback) {
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(callback, { timeout: 600 });
    return;
  }

  window.setTimeout(() => callback({ timeRemaining: () => 12 }), 16);
}

function renderPresenterPanel() {
  const currentSlide = state.slides[state.index];
  const nextSlide = state.slides[state.index + 1];

  elements.currentTitle.textContent = currentSlide?.title || (currentSlide ? `Slide ${state.index + 1}` : "No deck loaded");
  elements.nextTitle.textContent = nextSlide?.title || (nextSlide ? `Slide ${state.index + 2}` : "None");
  const notes = currentSlide?.notes?.trim() ?? "";
  elements.notesText.textContent = notes || "No speaker notes for this slide.";
  elements.notesText.classList.toggle("presenter-panel-empty", !notes);
  elements.elapsedTime.textContent = formatElapsed();
}

function renderUpdateStatus() {
  elements.updateStatusText.textContent = state.updateStatus.message || "Updates unavailable.";
}

function updateControls() {
  const hasSlides = state.slides.length > 0;
  document.body.classList.toggle("has-deck", hasSlides);
  elements.sourceLabel.textContent = state.sourceLabel;
  elements.railTitle.textContent = hasSlides ? "Ready to present" : "No deck loaded";
  elements.deckCountBadge.textContent = String(state.slides.length);
  elements.deckCountBadge.setAttribute(
    "aria-label",
    hasSlides ? `${state.slides.length} slides loaded` : "No slides loaded",
  );
  elements.slidePosition.textContent = hasSlides ? `${state.index + 1} / ${state.slides.length}` : "0 / 0";
  elements.slideMeterFill.style.width = hasSlides ? `${((state.index + 1) / state.slides.length) * 100}%` : "0%";
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
  updateUpdateButtonLabel();
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
  renderCurrentSlide();
  updateActiveThumbnail(boundedIndex);
  if (state.isPresenting) {
    void api?.setPresentationIndex?.(boundedIndex);
  }
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

function handlePaste(event) {
  if (isEditing(event.target)) {
    return;
  }

  const html = getPastedHtml(event.clipboardData);
  if (!html) {
    return;
  }

  event.preventDefault();
  try {
    loadPayload({
      html,
      sourceLabel: "Pasted HTML",
      sourceUrl: "",
    });
    showToast("Loaded pasted HTML.");
  } catch (error) {
    showToast(error.message);
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

function syncFrameAfterLoad() {
  bindFrameNavigation();
  postSlideIndexToFrame();
  setTimeout(postSlideIndexToFrame, 0);
  setTimeout(postSlideIndexToFrame, 120);
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
  const usingAudienceWindow = Boolean(api?.startPresentation);
  document.body.classList.toggle("presenting", isPresenting && !usingAudienceWindow);
  elements.exitPresentationButton.hidden = !isPresenting || usingAudienceWindow;
  elements.presentationArea.setAttribute(
    "aria-label",
    isPresenting ? "Presentation mode" : "Presentation stage",
  );
  updateControls();
}

function buildPresentationSession() {
  const session = state.deckSession || createHtmlDeckSession({
    title: state.sourceLabel || "TaDa! deck",
    sourceLabel: state.sourceLabel || "TaDa! deck",
    sourceUrl: state.sourceUrl,
    mode: state.mode,
    slides: state.slides,
  });

  return {
    ...session,
    currentIndex: state.index,
    slides: session.slides.map((slide) => ({ ...slide })),
  };
}

function normalizeDeckSession(session) {
  return {
    ...session,
    slides: Array.isArray(session.slides) ? session.slides.map((slide, index) => ({
      id: slide.id || `${session.id || "session"}-slide-${index + 1}`,
      title: slide.title || `Slide ${index + 1}`,
      notes: slide.notes || "",
      ...slide,
    })) : [],
  };
}

function getSlideDisplayHtml(slide) {
  if (!slide) {
    return "";
  }

  if (slide.html) {
    return slide.html;
  }

  if (slide.type === "remote" && slide.url) {
    return buildRemotePlaceholderDocument(slide);
  }

  if (slide.type === "image" && slide.src) {
    return buildImagePlaceholderDocument(slide);
  }

  return "";
}

function buildRemotePlaceholderDocument(slide) {
  const title = escapeHtml(slide.title || "Remote presentation");
  const url = escapeHtml(slide.url || "");
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{width:100%;height:100%;margin:0;background:#fff;color:#25162f;font-family:system-ui,sans-serif}body{display:grid;place-items:center;text-align:center}.box{max-width:720px;padding:48px}strong{display:block;font-size:44px;margin-bottom:14px}p{font-size:20px;color:#716676;overflow-wrap:anywhere}</style></head><body><div class="box"><strong>${title}</strong><p>${url}</p></div></body></html>`;
}

function buildImagePlaceholderDocument(slide) {
  const title = escapeHtml(slide.title || "Slide");
  const src = escapeAttribute(slide.src || "");
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{width:100%;height:100%;margin:0;background:#050505;overflow:hidden}body{display:grid;place-items:center}img{display:block;width:100vw;height:100vh;object-fit:contain}</style></head><body><img src="${src}" alt="${title}"></body></html>`;
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
  elements.emptyFocusSourceButton.disabled = isBusy;
  elements.copyPromptButton.disabled = isBusy;
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

function focusSourceInput() {
  elements.sourceInput.focus();
  elements.sourceInput.select();
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

function updateUpdateButtonLabel() {
  const label = updateButtonLabel(state.updateStatus);
  const accessibleLabel =
    label === "Install" ? "Install TaDa! update" :
    label === "Updating" ? "Checking for TaDa! updates" :
    "Check for TaDa! updates";
  elements.updateButton.dataset.commandLabel = label;
  elements.updateButton.setAttribute("aria-label", accessibleLabel);
  elements.updateButton.title = accessibleLabel;
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
