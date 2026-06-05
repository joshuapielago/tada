const DEFAULT_SELECTOR = "section";
const EXISTING_DECK_SELECTORS = [
  ".deck .slide",
  ".reveal .slides > section",
  ".remark-slide",
  ".swiper-slide",
  "[data-slide]",
  ".slide",
];

export function normalizeSourceUrl(rawUrl) {
  const value = String(rawUrl ?? "").trim();

  if (!value) {
    throw new Error("Enter a URL or local path to present.");
  }

  if (isAbsoluteLocalPath(value)) {
    return localPathToFileUrl(value);
  }

  if (isLoopbackShorthand(value)) {
    return normalizeKnownUrl(`http://${normalizeLoopbackHost(value)}`);
  }

  if (isBareRemoteHost(value)) {
    return normalizeKnownUrl(`https://${value}`);
  }

  return normalizeKnownUrl(value);
}

export function normalizeSelector(selector) {
  const value = String(selector ?? "").trim();
  return value || DEFAULT_SELECTOR;
}

export function analyzeDeckHtml(html) {
  const source = String(html ?? "");

  if (hasExistingDeckIndicators(source)) {
    return { mode: "existing-deck" };
  }

  if (selectorMatchesSource(source, DEFAULT_SELECTOR)) {
    return { mode: "selector" };
  }

  if (/<article(?:\s|>)/i.test(source)) {
    return { mode: "article" };
  }

  if (/<h[12](?:\s|>)/i.test(source)) {
    return { mode: "headings" };
  }

  return { mode: "document" };
}

export function detectBoundaryMode(html, selector = DEFAULT_SELECTOR) {
  const source = String(html ?? "");
  const normalizedSelector = normalizeSelector(selector);

  if (hasExistingDeckIndicators(source)) {
    return "existing-deck";
  }

  if (selectorMatchesSource(source, normalizedSelector)) {
    return "selector";
  }

  if (/<article(?:\s|>)/i.test(source)) {
    return "article";
  }

  if (/<h[12](?:\s|>)/i.test(source)) {
    return "headings";
  }

  return "document";
}

export function extractSlides(html, options = {}) {
  const source = String(html ?? "");
  const selector = normalizeSelector(options.selector);
  const sourceUrl = options.sourceUrl ?? "";

  if (typeof DOMParser !== "undefined") {
    return extractSlidesWithDom(source, { selector, sourceUrl });
  }

  return extractSlidesWithStrings(source, { selector, sourceUrl });
}

export function injectBaseElement(html, sourceUrl) {
  const normalizedUrl = normalizeSourceUrl(sourceUrl);
  const source = String(html ?? "");
  const base = `<base href="${escapeAttribute(normalizedUrl)}">`;
  const withoutExistingBase = source.replace(/<base\b[^>]*>/i, "");

  if (/<head\b[^>]*>/i.test(withoutExistingBase)) {
    return withoutExistingBase.replace(/<head\b([^>]*)>/i, `<head$1>${base}`);
  }

  if (/<html\b[^>]*>/i.test(withoutExistingBase)) {
    return withoutExistingBase.replace(/<html\b([^>]*)>/i, `<html$1><head>${base}</head>`);
  }

  return `<head>${base}</head>${withoutExistingBase}`;
}

export function buildSlideDocument({ headHtml = "", bodyAttributes = "", content = "", sourceUrl = "" } = {}) {
  const base = sourceUrl ? `<base href="${escapeAttribute(sourceUrl)}">` : "";

  return `<!doctype html>
<html>
  <head>
    ${base}
    ${stripScripts(headHtml)}
    <style>
      *, *::before, *::after { box-sizing: border-box; }
      html, body { min-width: 0; min-height: 100%; }
      body[data-deckify-slide] { margin: 0; overflow: auto; }
      img, video, canvas, svg { max-width: 100%; }
      .deckify-visible,
      .deckify-visible.active,
      .deckify-visible.current,
      .deckify-visible.present {
        display: flex !important;
        opacity: 1 !important;
        visibility: visible !important;
        transform: none !important;
        pointer-events: auto !important;
      }
      body[data-deckify-slide] > .deckify-visible {
        position: relative !important;
        inset: auto !important;
        width: 100%;
        min-height: 100vh;
      }
    </style>
  </head>
  <body${bodyAttributes} data-deckify-slide>
    ${stripScripts(content)}
  </body>
</html>`;
}

export function buildTadaShowDocument({ title = "tada show", mode = "document", slides = [] } = {}) {
  const safeTitle = escapeHtml(title || "tada show");
  const payload = JSON.stringify({
    title: title || "tada show",
    mode,
    slides: slides.map((slide, index) => ({
      html: String(slide?.runtimeHtml ?? slide?.html ?? ""),
      title: slide?.title || `Slide ${index + 1}`,
      notes: slide?.notes || "",
    })),
  }).replace(/[<>&]/g, (character) => {
    if (character === "<") {
      return "\\u003c";
    }
    if (character === ">") {
      return "\\u003e";
    }
    return "\\u0026";
  });

  return `<!doctype html>
<html lang="en" data-tada-show>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${safeTitle} - tada show</title>
    <style>
      * { box-sizing: border-box; }
      html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #050505; }
      body { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      .app-shell.presenting { position: fixed; inset: 0; display: grid; background: #050505; }
      .stage { position: relative; width: 100vw; height: 100vh; overflow: hidden; background: #050505; }
      iframe { width: 100%; height: 100%; border: 0; background: #fff; }
      .empty { display: grid; place-items: center; width: 100%; height: 100%; color: #fff; }
      .exit-button, .nav-zone, .counter {
        position: fixed;
        z-index: 2;
        opacity: 0;
        transition: opacity 160ms ease;
      }
      body:hover .exit-button, body:hover .counter { opacity: 1; }
      .exit-button {
        top: 16px;
        right: 16px;
        height: 34px;
        padding: 0 12px;
        border: 1px solid rgb(255 255 255 / 30%);
        border-radius: 8px;
        background: rgb(0 0 0 / 54%);
        color: #fff;
        font: inherit;
        cursor: pointer;
      }
      .counter {
        left: 16px;
        bottom: 14px;
        padding: 6px 10px;
        border-radius: 999px;
        background: rgb(0 0 0 / 54%);
        color: #fff;
        font-size: 12px;
      }
      .nav-zone { top: 0; bottom: 0; width: 42%; cursor: pointer; }
      .nav-zone.previous { left: 0; }
      .nav-zone.next { right: 0; }
    </style>
  </head>
  <body data-tada-show>
    <main class="app-shell presenting">
      <section class="stage">
        <div class="empty" id="emptyState">No slides</div>
        <iframe id="slideFrame" title="tada show slide" sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads" hidden></iframe>
        <button class="nav-zone previous" id="previousButton" type="button" aria-label="Previous slide"></button>
        <button class="nav-zone next" id="nextButton" type="button" aria-label="Next slide"></button>
        <button class="exit-button" id="exitButton" type="button">Exit</button>
        <div class="counter" id="counter">0 / 0</div>
      </section>
    </main>
    <script>
      const tadaShowData = ${payload};
      let currentIndex = 0;
      const frame = document.querySelector("#slideFrame");
      const empty = document.querySelector("#emptyState");
      const counter = document.querySelector("#counter");
      const slides = Array.isArray(tadaShowData.slides) ? tadaShowData.slides : [];

      function isRuntimeSlide(slide) {
        return typeof slide?.html === "string" && slide.html.includes("data-tada-runtime-slide");
      }

      function renderSlide() {
        const slide = slides[currentIndex];
        empty.hidden = slides.length > 0;
        frame.hidden = slides.length === 0;
        if (slide && isRuntimeSlide(slide)) {
          if (frame.dataset.runtimeFrame === "true") {
            postSlideIndexToFrame();
          } else {
            frame.dataset.runtimeFrame = "true";
            frame.srcdoc = slide.html;
          }
        } else if (slide) {
          frame.dataset.runtimeFrame = "false";
          frame.srcdoc = slide.html;
        }
        counter.textContent = slides.length ? String(currentIndex + 1) + " / " + String(slides.length) : "0 / 0";
      }

      function postSlideIndexToFrame() {
        if (!slides.length || frame.hidden || frame.dataset.runtimeFrame !== "true") {
          return;
        }

        frame.contentWindow?.postMessage(
          {
            type: "tada:set-slide",
            index: currentIndex,
          },
          "*",
        );
      }

      function goToSlide(index) {
        if (!slides.length) {
          return;
        }
        currentIndex = Math.max(0, Math.min(index, slides.length - 1));
        renderSlide();
      }

      function navigate(intent) {
        if (intent === "next") goToSlide(currentIndex + 1);
        if (intent === "previous") goToSlide(currentIndex - 1);
        if (intent === "first") goToSlide(0);
        if (intent === "last") goToSlide(slides.length - 1);
        if (intent === "exit") exitShow();
      }

      function intentFromKey(key) {
        if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter", "n", "N"].includes(key)) return "next";
        if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace", "p", "P"].includes(key)) return "previous";
        if (key === "Home") return "first";
        if (key === "End") return "last";
        if (key === "Escape") return "exit";
        return "none";
      }

      function exitShow() {
        if (document.fullscreenElement) {
          void document.exitFullscreen();
          return;
        }
        window.close();
      }

      document.querySelector("#previousButton").addEventListener("click", () => navigate("previous"));
      document.querySelector("#nextButton").addEventListener("click", () => navigate("next"));
      document.querySelector("#exitButton").addEventListener("click", exitShow);
      window.addEventListener("message", (event) => {
        if (event.source === frame.contentWindow && event.data?.type === "tada:navigate") {
          navigate(event.data.intent);
        }
      });
      frame.addEventListener("load", postSlideIndexToFrame);
      document.addEventListener("keydown", (event) => {
        const intent = intentFromKey(event.key);
        if (intent !== "none") {
          event.preventDefault();
          navigate(intent);
        }
      });

      renderSlide();
    </script>
  </body>
</html>`;
}

export function getKeyNavigationIntent(key) {
  if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter", "n", "N"].includes(key)) {
    return "next";
  }

  if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace", "p", "P"].includes(key)) {
    return "previous";
  }

  if (key === "Home") {
    return "first";
  }

  if (key === "End") {
    return "last";
  }

  if (key === "Escape") {
    return "exit";
  }

  return "none";
}

function extractSlidesWithDom(html, { selector, sourceUrl }) {
  const parser = new DOMParser();
  const document = parser.parseFromString(html, "text/html");
  const parserError = document.querySelector("parsererror");

  if (parserError) {
    throw new Error("That HTML could not be parsed.");
  }

  const headHtml = document.head?.innerHTML ?? "";
  const bodyAttributes = serializeAttributes(document.body);

  if (hasExistingDeckIndicators(html)) {
    const nodes = getExistingDeckNodes(document);
    if (nodes.length > 0) {
      return {
        mode: "existing-deck",
        slides: nodes.map((node, index) => {
          const clone = node.cloneNode(true);
          clone.querySelectorAll("script").forEach((script) => script.remove());
          normalizeVisibleDeckNode(clone);
          return {
            html: buildSlideDocument({
              headHtml,
              bodyAttributes,
              content: clone.outerHTML,
              sourceUrl,
            }),
            runtimeHtml: buildExistingDeckRuntimeDocument({
              html,
              index,
              sourceUrl,
            }),
            notes: extractNodeNotes(node),
            title: extractNodeTitle(node),
          };
        }),
      };
    }
  }

  let selected = [];
  let mode = "selector";
  let runtimeSlideSelectors = [selector];

  try {
    selected = Array.from(document.body.querySelectorAll(selector));
  } catch {
    throw new Error("That slide selector is not valid.");
  }

  if (selected.length === 0) {
    selected = Array.from(document.body.querySelectorAll("article"));
    mode = selected.length > 0 ? "article" : mode;
    runtimeSlideSelectors = selected.length > 0 ? ["article"] : runtimeSlideSelectors;
  }

  if (selected.length === 0) {
    selected = groupSlidesByHeading(document).map((content) => ({ outerHTML: content }));
    mode = selected.length > 0 ? "headings" : mode;
    runtimeSlideSelectors = null;
  }

  if (selected.length === 0) {
    selected = [{ outerHTML: document.body?.innerHTML || document.documentElement.outerHTML || html }];
    mode = "document";
    runtimeSlideSelectors = [];
  }

  return {
    mode,
    slides: selected.map((node, index) => ({
      html: buildSlideDocument({
        headHtml,
        bodyAttributes,
        content: node.outerHTML,
        sourceUrl,
      }),
      runtimeHtml: runtimeSlideSelectors
        ? buildRuntimeDocument({
            html,
            index,
            sourceUrl,
            slideSelectors: runtimeSlideSelectors,
          })
        : undefined,
      notes: extractNodeNotes(node),
      title: extractNodeTitle(node),
    })),
  };
}

function extractSlidesWithStrings(html, { selector, sourceUrl }) {
  const headHtml = extractHeadHtml(html);
  const bodyAttributes = extractBodyAttributes(html);

  if (hasExistingDeckIndicators(html)) {
    const slides = extractExistingDeckSlideStrings(html);
    if (slides.length > 0) {
      return {
        mode: "existing-deck",
        slides: slides.map((slide, index) => ({
          html: buildSlideDocument({
            headHtml,
            bodyAttributes,
            content: normalizeVisibleDeckHtml(slide.html),
            sourceUrl,
          }),
          runtimeHtml: buildExistingDeckRuntimeDocument({
            html,
            index,
            sourceUrl,
          }),
          notes: slide.notes,
          title: extractTitleFromHtml(slide.html),
        })),
      };
    }
  }

  let mode = "selector";
  let slideHtml = extractSimpleSelectorHtml(html, selector);
  let runtimeSlideSelectors = [selector];

  if (slideHtml.length === 0) {
    slideHtml = extractSimpleSelectorHtml(html, "article");
    mode = slideHtml.length > 0 ? "article" : mode;
    runtimeSlideSelectors = slideHtml.length > 0 ? ["article"] : runtimeSlideSelectors;
  }

  if (slideHtml.length === 0) {
    slideHtml = extractHeadingGroupsFromHtml(html);
    mode = slideHtml.length > 0 ? "headings" : mode;
    runtimeSlideSelectors = null;
  }

  if (slideHtml.length === 0) {
    slideHtml = [extractBodyHtml(html) || html];
    mode = "document";
    runtimeSlideSelectors = [];
  }

  return {
    mode,
    slides: slideHtml.map((content, index) => ({
      html: buildSlideDocument({
        headHtml,
        bodyAttributes,
        content,
        sourceUrl,
      }),
      runtimeHtml: runtimeSlideSelectors
        ? buildRuntimeDocument({
            html,
            index,
            sourceUrl,
            slideSelectors: runtimeSlideSelectors,
          })
        : undefined,
      notes: extractDataNotes(content),
      title: extractTitleFromHtml(content),
    })),
  };
}

function getExistingDeckNodes(document) {
  for (const selector of EXISTING_DECK_SELECTORS) {
    const nodes = Array.from(document.querySelectorAll(selector)).filter((node) => !isNestedSlideNode(node));
    if (nodes.length > 0) {
      return nodes;
    }
  }

  return [];
}

function isNestedSlideNode(node) {
  const parentSlide = node.parentElement?.closest(".slide, [data-slide], .remark-slide, .swiper-slide");
  return Boolean(parentSlide);
}

function normalizeVisibleDeckNode(node) {
  if (node.classList) {
    node.classList.add("active");
    node.classList.add("deckify-visible");
    node.classList.remove("hidden");
  }

  node.removeAttribute?.("hidden");
  node.setAttribute?.("aria-hidden", "false");
}

function normalizeVisibleDeckHtml(html) {
  return html.replace(/<([a-z][\w:-]*)(\s[^>]*)?>/i, (match, tagName, attributes = "") => {
    const classMatch = attributes.match(/\sclass=(["'])(.*?)\1/i);
    let nextAttributes = attributes;

    if (classMatch) {
      const classes = classMatch[2].split(/\s+/).filter(Boolean);
      for (const className of ["active", "deckify-visible"]) {
        if (!classes.includes(className)) {
          classes.push(className);
        }
      }
      nextAttributes = nextAttributes.replace(classMatch[0], ` class="${classes.join(" ")}"`);
    } else {
      nextAttributes += ' class="active deckify-visible"';
    }

    nextAttributes = nextAttributes
      .replace(/\shidden(?:=(["']).*?\1)?/i, "")
      .replace(/\saria-hidden=(["'])true\1/i, ' aria-hidden="false"');

    return `<${tagName}${nextAttributes}>`;
  });
}

function buildExistingDeckRuntimeDocument({ html, index, sourceUrl }) {
  return buildRuntimeDocument({
    html,
    index,
    sourceUrl,
    slideSelectors: EXISTING_DECK_SELECTORS,
  });
}

function buildRuntimeDocument({ html, index, sourceUrl, slideSelectors }) {
  let documentHtml = sourceUrl ? injectBaseElement(html, sourceUrl) : String(html ?? "");
  documentHtml = injectRuntimeStyle(documentHtml);
  return injectRuntimeScript(documentHtml, index, { slideSelectors });
}

function injectRuntimeStyle(html) {
  const style = `<style data-tada-runtime-style>
    .nav,
    .hint,
    .progress,
    .notes {
      display: none !important;
    }
    html,
    body {
      margin: 0 !important;
      width: 100% !important;
      height: 100% !important;
      overflow: hidden !important;
    }
  </style>`;

  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${style}</head>`);
  }

  return `${style}${html}`;
}

function injectRuntimeScript(html, index, { slideSelectors = EXISTING_DECK_SELECTORS } = {}) {
  const serializedSlideSelectors = JSON.stringify(Array.isArray(slideSelectors) ? slideSelectors : EXISTING_DECK_SELECTORS);
  const script = `<script data-tada-runtime-slide="${index}">
(() => {
  const targetIndex = ${index};
  const slideSelectors = ${serializedSlideSelectors};
  let restoreTransitionTimer = 0;
  let forwardingNativeNavigation = false;

  function getSlides() {
    for (const selector of slideSelectors) {
      const nodes = Array.from(document.querySelectorAll(selector)).filter((node) => {
        const parent = node.parentElement?.closest(".slide, [data-slide], .remark-slide, .swiper-slide");
        return !parent;
      });
      if (nodes.length > 0) return nodes;
    }
    return [];
  }

  function clampSlideIndex(index, slides) {
    if (!Number.isInteger(index) || slides.length === 0) return -1;
    return Math.max(0, Math.min(index, slides.length - 1));
  }

  function findActiveSlideIndex(slides) {
    const ariaIndex = slides.findIndex((slide) => slide.getAttribute("aria-hidden") === "false");
    if (ariaIndex >= 0) return ariaIndex;

    const classIndex = slides.findIndex((slide) =>
      slide.classList.contains("deckify-visible") ||
      slide.classList.contains("present") ||
      slide.classList.contains("current") ||
      slide.classList.contains("active")
    );
    if (classIndex >= 0) return classIndex;

    return slides.findIndex((slide) => {
      const style = window.getComputedStyle(slide);
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || "1") > 0;
    });
  }

  function dispatchNativeKey(key) {
    forwardingNativeNavigation = true;
    try {
      document.dispatchEvent(new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
      }));
    } catch {
      return false;
    } finally {
      forwardingNativeNavigation = false;
    }
    return true;
  }

  function dispatchNativeNavigation(index, slides = getSlides()) {
    const target = clampSlideIndex(index, slides);
    if (target < 0) return false;

    let current = findActiveSlideIndex(slides);
    if (current === target) return true;
    if (current < 0) return false;

    if (target === 0 || target === slides.length - 1) {
      dispatchNativeKey(target === 0 ? "Home" : "End");
      current = findActiveSlideIndex(getSlides());
      if (current === target) return true;
      if (current < 0) return false;
    }

    let remainingSteps = slides.length + 2;
    while (current !== target && remainingSteps > 0) {
      const previous = current;
      dispatchNativeKey(current < target ? "ArrowRight" : "ArrowLeft");
      current = findActiveSlideIndex(getSlides());
      if (current === target) return true;
      if (current < 0 || current === previous) return false;
      remainingSteps -= 1;
    }

    return current === target;
  }

  function forceActiveSlide(index, slides = getSlides()) {
    const activeIndex = clampSlideIndex(index, slides);
    if (activeIndex < 0) return;

    slides.forEach((slide, slideIndex) => {
      const active = slideIndex === activeIndex;
      slide.classList.toggle("active", active);
      slide.classList.toggle("current", active);
      slide.classList.toggle("present", active);
      slide.classList.toggle("deckify-visible", active);
      slide.toggleAttribute("hidden", false);
      slide.setAttribute("aria-hidden", active ? "false" : "true");
      slide.style.setProperty("transition", "none", "important");
      if (active) {
        slide.style.setProperty("display", "flex", "important");
        slide.style.setProperty("opacity", "1", "important");
        slide.style.setProperty("visibility", "visible", "important");
        slide.style.setProperty("transform", "none", "important");
        slide.style.setProperty("z-index", "2", "important");
      } else {
        slide.style.removeProperty("display");
        slide.style.removeProperty("opacity");
        slide.style.removeProperty("visibility");
        slide.style.removeProperty("transform");
        slide.style.removeProperty("z-index");
      }
    });
    restoreSlideTransitions(slides);

    const activeSlide = slides[activeIndex];
    if (activeSlide) {
      window.tadaReplayActiveSlideAnimations(activeSlide, activeIndex);
    }
  }

  window.tadaSetActiveSlide = function tadaSetActiveSlide(index, options = {}) {
    const slides = getSlides();
    const activeIndex = clampSlideIndex(index, slides);
    if (activeIndex < 0) return;
    if (!options.force && dispatchNativeNavigation(activeIndex, slides)) return;
    forceActiveSlide(activeIndex, slides);
  };

  function restoreSlideTransitions(slides) {
    clearTimeout(restoreTransitionTimer);
    restoreTransitionTimer = setTimeout(() => {
      slides.forEach((slide) => {
        if (slide.style.getPropertyValue("transition") === "none") {
          slide.style.removeProperty("transition");
        }
      });
    }, 80);
  }

  window.tadaReplayActiveSlideAnimations = function tadaReplayActiveSlideAnimations(activeSlide, index) {
    activeSlide.querySelectorAll(".grow[data-w]").forEach((element) => {
      const width = element.dataset.w;
      element.style.transition = "none";
      element.style.width = "0";
      void element.offsetWidth;
      element.style.transition = "";
      requestAnimationFrame(() => {
        element.style.width = width;
      });
      setTimeout(() => {
        element.style.width = width;
      }, 16);
    });

    activeSlide.querySelectorAll(".donut .fg[data-off], .rdonut .fg[data-off]").forEach((element) => {
      const offset = element.dataset.off;
      element.style.transition = "none";
      element.style.strokeDashoffset = "326.7";
      void element.getBoundingClientRect();
      element.style.transition = "";
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          element.style.strokeDashoffset = offset;
        });
      });
      setTimeout(() => {
        element.style.strokeDashoffset = offset;
      }, 32);
    });

    const chat = activeSlide.querySelector?.(".chat");
    if (chat?.__play) chat.__play();
    if (index === 0 && window.__htRestart) window.__htRestart();
  };

  function intentFromKey(key) {
    if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter", "n", "N"].includes(key)) return "next";
    if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace", "p", "P"].includes(key)) return "previous";
    if (key === "Home") return "first";
    if (key === "End") return "last";
    if (key === "Escape") return "exit";
    return "none";
  }

  document.addEventListener("keydown", (event) => {
    if (forwardingNativeNavigation) return;
    const intent = intentFromKey(event.key);
    if (intent === "none") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.parent?.postMessage({ type: "tada:navigate", intent }, "*");
  }, true);

  document.addEventListener("click", (event) => {
    if (event.target?.closest?.("a, input, textarea, select, [contenteditable], .chat, .creplay")) return;
    const intent = event.clientX < window.innerWidth * 0.35 ? "previous" : "next";
    event.preventDefault();
    event.stopImmediatePropagation();
    window.parent?.postMessage({ type: "tada:navigate", intent }, "*");
  }, true);

  window.addEventListener("message", (event) => {
    if (event.data?.type !== "tada:set-slide") return;
    const index = Number(event.data.index);
    if (!Number.isInteger(index)) return;
    window.tadaSetActiveSlide(index);
  });

  function applyActiveSlide() {
    window.tadaSetActiveSlide(targetIndex);
  }

  applyActiveSlide();
  setTimeout(applyActiveSlide, 0);
  setTimeout(applyActiveSlide, 120);
})();
</script>`;

  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${script}</body>`);
  }

  return `${html}${script}`;
}

function extractExistingDeckSlideStrings(html) {
  const patterns = [
    /<section\b(?=[^>]*\bclass=(["'])[^"']*\bslide\b[^"']*\1)([^>]*)>[\s\S]*?<\/section>/gi,
    /<div\b(?=[^>]*\bclass=(["'])[^"']*(?:\bslide\b|\bremark-slide\b|\bswiper-slide\b)[^"']*\1)([^>]*)>[\s\S]*?<\/div>/gi,
    /<[^>]+\bdata-slide\b[^>]*>[\s\S]*?<\/[^>]+>/gi,
  ];

  for (const pattern of patterns) {
    const slides = Array.from(html.matchAll(pattern)).map((match) => ({
      html: stripScripts(match[0]),
      notes: extractDataNotes(match[0]),
    }));
    if (slides.length > 0) {
      return slides;
    }
  }

  return [];
}

function hasExistingDeckIndicators(html) {
  const source = String(html ?? "");
  return (
    /\bclass=(["'])[^"']*\bdeck\b[^"']*\1/i.test(source) ||
    /\bclass=(["'])[^"']*\bslide\b[^"']*\bactive\b[^"']*\1/i.test(source) ||
    /\bclass=(["'])[^"']*\bactive\b[^"']*\bslide\b[^"']*\1/i.test(source) ||
    /\bclass=(["'])[^"']*\breveal\b[^"']*\1[\s\S]*\bclass=(["'])[^"']*\bslides\b[^"']*\2/i.test(source) ||
    /\bclass=(["'])[^"']*\bremark-slide\b[^"']*\1/i.test(source) ||
    /\bclass=(["'])[^"']*\bswiper-slide\b[^"']*\1/i.test(source) ||
    /\bdata-slide\b/i.test(source) ||
    /\bdata-notes=/i.test(source) ||
    /\bclass=(["'])[^"']*\bnotes\b[^"']*\1/i.test(source)
  );
}

function selectorMatchesSource(html, selector) {
  if (typeof DOMParser !== "undefined") {
    try {
      const document = new DOMParser().parseFromString(html, "text/html");
      return Boolean(document.querySelector(selector));
    } catch {
      return false;
    }
  }

  return selector
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .some((part) => simpleSelectorMatchesSource(html, part));
}

function simpleSelectorMatchesSource(html, selector) {
  if (/^\.[\w-]+$/.test(selector)) {
    const className = escapeRegExp(selector.slice(1));
    return new RegExp(`\\bclass\\s*=\\s*["'][^"']*\\b${className}\\b`, "i").test(html);
  }

  if (/^#[\w-]+$/.test(selector)) {
    const id = escapeRegExp(selector.slice(1));
    return new RegExp(`\\bid\\s*=\\s*["']${id}["']`, "i").test(html);
  }

  if (/^\[[\w:-]+(?:=(?:"[^"]*"|'[^']*'|[^\]]+))?\]$/.test(selector)) {
    const attribute = selector.slice(1, -1).split("=")[0].trim();
    return new RegExp(`\\s${escapeRegExp(attribute)}(?:\\s*=|\\s|>)`, "i").test(html);
  }

  if (/^[a-z][\w-]*$/i.test(selector)) {
    return new RegExp(`<${escapeRegExp(selector)}(?:\\s|>)`, "i").test(html);
  }

  const tagClassMatch = selector.match(/^([a-z][\w-]*)\.([\w-]+)$/i);
  if (tagClassMatch) {
    const [, tagName, className] = tagClassMatch;
    return new RegExp(
      `<${escapeRegExp(tagName)}\\b[^>]*\\bclass\\s*=\\s*["'][^"']*\\b${escapeRegExp(className)}\\b`,
      "i",
    ).test(html);
  }

  return false;
}

function extractSimpleSelectorHtml(html, selector) {
  if (/^[a-z][\w-]*$/i.test(selector)) {
    const tag = escapeRegExp(selector);
    return Array.from(html.matchAll(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi"))).map(
      (match) => match[0],
    );
  }

  return [];
}

function groupSlidesByHeading(document) {
  const container = findHeadingContainer(document.body);
  if (!container) {
    return [];
  }

  const slides = [];
  let current = [];

  for (const child of Array.from(container.children)) {
    const startsSlide = /^H[12]$/i.test(child.tagName);

    if (startsSlide && current.length > 0) {
      slides.push(current.map((node) => node.outerHTML).join(""));
      current = [];
    }

    current.push(child);
  }

  if (current.length > 0) {
    slides.push(current.map((node) => node.outerHTML).join(""));
  }

  return slides;
}

function findHeadingContainer(root) {
  if (!root) {
    return null;
  }

  const candidates = [root, ...Array.from(root.querySelectorAll("main, article, section, div"))];
  return candidates
    .map((element) => ({
      element,
      count: Array.from(element.children).filter((child) => /^H[12]$/i.test(child.tagName)).length,
    }))
    .filter((candidate) => candidate.count > 0)
    .sort((a, b) => b.count - a.count)[0]?.element;
}

function extractHeadingGroupsFromHtml(html) {
  const body = extractBodyHtml(html) || html;
  const pieces = body.split(/(?=<h[12](?:\s|>))/i).map((piece) => piece.trim()).filter(Boolean);
  return pieces.filter((piece) => /^<h[12](?:\s|>)/i.test(piece));
}

function extractNodeNotes(node) {
  if (!node?.getAttribute) {
    return "";
  }

  return node.getAttribute("data-notes") ?? node.querySelector?.("[data-notes]")?.getAttribute("data-notes") ?? "";
}

function extractNodeTitle(node) {
  if (!node?.querySelector) {
    return "";
  }

  return node.querySelector("h1, h2, h3")?.textContent?.trim() ?? "";
}

function extractTitleFromHtml(html) {
  return decodeEntities(html.match(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i)?.[1]?.replace(/<[^>]*>/g, "").trim() ?? "");
}

function extractDataNotes(html) {
  const match = html.match(/\bdata-notes=(["'])(.*?)\1/i);
  return decodeEntities(match?.[2] ?? "");
}

function extractHeadHtml(html) {
  return html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? "";
}

function extractBodyHtml(html) {
  return html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? "";
}

function extractBodyAttributes(html) {
  return html.match(/<body\b([^>]*)>/i)?.[1] ?? "";
}

function serializeAttributes(element) {
  if (!element) {
    return "";
  }

  return Array.from(element.attributes)
    .filter((attribute) => attribute.name !== "data-deckify-slide")
    .map((attribute) => ` ${attribute.name}="${escapeAttribute(attribute.value)}"`)
    .join("");
}

function stripScripts(value) {
  return String(value ?? "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
}

function normalizeKnownUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a valid URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:" && url.protocol !== "file:") {
    throw new Error("That URL scheme cannot be loaded.");
  }

  return url.href;
}

function escapeAttribute(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeEntities(value) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function isAbsoluteLocalPath(value) {
  return value.startsWith("/") || /^[a-z]:[\\/]/i.test(value);
}

function localPathToFileUrl(value) {
  const normalizedPath = value.replaceAll("\\", "/");

  if (/^[a-z]:\//i.test(normalizedPath)) {
    return `file:///${encodePath(normalizedPath)}`;
  }

  return `file://${encodePath(normalizedPath)}`;
}

function encodePath(value) {
  return value
    .split("/")
    .map((part, index) => (index === 0 && part === "" ? "" : encodeURIComponent(part)))
    .join("/");
}

function isLoopbackShorthand(value) {
  return /^(?:localhost|0\.0\.0\.0|127(?:\.\d{1,3}){3}|\[::1\]|::1)(?::\d+)?(?:[/?#].*)?$/i.test(value);
}

function normalizeLoopbackHost(value) {
  if (value.startsWith("::1")) {
    return `[::1]${value.slice(3)}`;
  }

  return value;
}

function isBareRemoteHost(value) {
  if (/\s/.test(value) || /^[a-z][a-z\d+.-]*:/i.test(value)) {
    return false;
  }

  return /^[a-z\d-]+(?:\.[a-z\d-]+)+(?:\:\d+)?(?:[/?#].*)?$/i.test(value);
}
