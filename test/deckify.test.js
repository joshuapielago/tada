import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import { pathToFileURL } from "node:url";

import {
  analyzeDeckHtml,
  buildTadaShowDocument,
  detectBoundaryMode,
  extractSlides,
  getKeyNavigationIntent,
  injectBaseElement,
  normalizeSelector,
  normalizeSourceUrl,
} from "../src/shared/deckify.js";

const generatedDeckPath = path.resolve("test/fixtures/generated-active-deck.html");

describe("normalizeSourceUrl", () => {
  it("normalizes full http and https URLs", () => {
    assert.equal(
      normalizeSourceUrl(" https://example.com/report.html "),
      "https://example.com/report.html",
    );
    assert.equal(
      normalizeSourceUrl("http://localhost:3000/client-demo"),
      "http://localhost:3000/client-demo",
    );
  });

  it("normalizes URL-like shorthand for local and remote pages", () => {
    assert.equal(
      normalizeSourceUrl("localhost:3000/client-demo"),
      "http://localhost:3000/client-demo",
    );
    assert.equal(
      normalizeSourceUrl("127.0.0.1:5173/report.html"),
      "http://127.0.0.1:5173/report.html",
    );
    assert.equal(
      normalizeSourceUrl("example.com/report.html"),
      "https://example.com/report.html",
    );
  });

  it("normalizes local file URLs and absolute local paths", () => {
    assert.equal(
      normalizeSourceUrl("file:///Users/jp/Documents/Playground/demo.html"),
      "file:///Users/jp/Documents/Playground/demo.html",
    );
    assert.equal(
      normalizeSourceUrl("/Users/jp/Documents/Playground/My Deck.html"),
      "file:///Users/jp/Documents/Playground/My%20Deck.html",
    );
  });

  it("rejects unsafe URL schemes", () => {
    assert.throws(() => normalizeSourceUrl("javascript:alert(1)"), /cannot be loaded/i);
    assert.throws(() => normalizeSourceUrl("data:text/html,<h1>Hi</h1>"), /cannot be loaded/i);
  });

  it("rejects blank and malformed URLs", () => {
    assert.throws(() => normalizeSourceUrl("   "), /Enter a URL or local path/i);
    assert.throws(() => normalizeSourceUrl("not a url"), /valid URL/i);
  });
});

describe("normalizeSelector", () => {
  it("uses section as the default slide selector", () => {
    assert.equal(normalizeSelector(""), "section");
    assert.equal(normalizeSelector("   "), "section");
  });

  it("keeps custom selectors intact after trimming", () => {
    assert.equal(normalizeSelector(" .client-slide "), ".client-slide");
    assert.equal(normalizeSelector("[data-slide]"), "[data-slide]");
  });
});

describe("detectBoundaryMode", () => {
  it("prefers the configured selector when matching elements exist", () => {
    assert.equal(
      detectBoundaryMode("<main><section>One</section><section>Two</section></main>", "section"),
      "selector",
    );
    assert.equal(
      detectBoundaryMode('<article><div class="client-slide">One</div></article>', ".client-slide"),
      "selector",
    );
  });

  it("falls back to headings when the selector does not match", () => {
    assert.equal(
      detectBoundaryMode("<main><h1>One</h1><p>A</p><h2>Two</h2><p>B</p></main>", "section"),
      "headings",
    );
  });

  it("falls back to explicit slide comments before headings", () => {
    assert.equal(
      detectBoundaryMode("<main><h1>One</h1><!-- slide --><h1>Two</h1></main>", "section"),
      "slide-comment",
    );
  });

  it("falls back to horizontal rules before headings", () => {
    assert.equal(
      detectBoundaryMode("<main><h1>One</h1><hr><h1>Two</h1></main>", "section"),
      "horizontal-rule",
    );
  });

  it("falls back to a single document slide when no boundaries are visible", () => {
    assert.equal(detectBoundaryMode("<main><p>One continuous page</p></main>", "section"), "document");
  });

  it("does not classify deck marker names in copy as an existing deck runtime", () => {
    const html = `<!doctype html>
      <html>
        <body>
          <main>
            <section>
              <h1>Import anything</h1>
              <p>TaDa! recognizes markers such as <code>data-slide</code>, <code>data-notes</code>, and <code>.deck</code> when they appear as real HTML structure.</p>
            </section>
            <section>
              <h1>Present instantly</h1>
            </section>
          </main>
        </body>
      </html>`;

    assert.equal(analyzeDeckHtml(html).mode, "selector");
    assert.equal(detectBoundaryMode(html, "section"), "selector");

    const result = extractSlides(html, { selector: "section" });
    assert.equal(result.mode, "selector");
    assert.equal(result.slides.length, 2);
  });
});

describe("injectBaseElement", () => {
  it("adds a base element inside an existing head", () => {
    const html = '<!doctype html><html><head><title>Deck</title></head><body><img src="hero.png"></body></html>';
    assert.match(
      injectBaseElement(html, "https://example.com/path/deck.html"),
      /<head><base href="https:\/\/example\.com\/path\/deck\.html"><title>Deck<\/title><\/head>/,
    );
  });

  it("creates a head when the document does not have one", () => {
    assert.match(
      injectBaseElement("<html><body><section>One</section></body></html>", "https://example.com/deck.html"),
      /<html><head><base href="https:\/\/example\.com\/deck\.html"><\/head><body>/,
    );
  });
});

describe("getKeyNavigationIntent", () => {
  it("maps common presentation keys to next slide", () => {
    for (const key of ["ArrowRight", "ArrowDown", "PageDown", " ", "Enter", "n", "N"]) {
      assert.equal(getKeyNavigationIntent(key), "next");
    }
  });

  it("maps common presentation keys to previous slide", () => {
    for (const key of ["ArrowLeft", "ArrowUp", "PageUp", "Backspace", "p", "P"]) {
      assert.equal(getKeyNavigationIntent(key), "previous");
    }
  });

  it("maps home and end to absolute navigation", () => {
    assert.equal(getKeyNavigationIntent("Home"), "first");
    assert.equal(getKeyNavigationIntent("End"), "last");
  });

  it("ignores keys that are not presentation controls", () => {
    assert.equal(getKeyNavigationIntent("a"), "none");
  });

  it("maps escape to presentation exit", () => {
    assert.equal(getKeyNavigationIntent("Escape"), "exit");
  });
});

describe("generated deck extraction", () => {
  it("detects existing AI-generated deck indicators", async () => {
    const html = await readFile(generatedDeckPath, "utf8");
    assert.equal(analyzeDeckHtml(html).mode, "existing-deck");
  });

  it("extracts every generated deck slide and keeps non-first slides visible", async () => {
    const html = await readFile(generatedDeckPath, "utf8");
    const result = extractSlides(html, {
      selector: "section",
      sourceUrl: pathToFileURL(generatedDeckPath).href,
    });

    assert.equal(result.mode, "existing-deck");
    assert.equal(result.slides.length, 3);
    assert.match(result.slides[1].html, /Second generated slide/);
    assert.match(result.slides[1].html, /class="slide active deckify-visible"/);
    assert.match(result.slides[1].html, /deckify-visible[^}]*visibility:\s*visible/i);
    assert.doesNotMatch(result.slides[1].html, /<script/i);
  });

  it("extracts speaker notes from generated deck slides", async () => {
    const html = await readFile(generatedDeckPath, "utf8");
    const result = extractSlides(html, {
      selector: "section",
      sourceUrl: pathToFileURL(generatedDeckPath).href,
    });

    assert.equal(result.slides[0].notes, "First note");
    assert.equal(result.slides[1].notes, "Second note");
    assert.equal(result.slides[2].notes, "Third note");
  });

  it("falls back to generated page sections when no deck indicators exist", () => {
    const html = "<main><section><h1>One</h1></section><section><h1>Two</h1></section></main>";
    const result = extractSlides(html, { selector: "section" });

    assert.equal(result.mode, "selector");
    assert.equal(result.slides.length, 2);
    assert.match(result.slides[1].html, /<h1>Two<\/h1>/);
  });

  it("preserves the authored slide display model instead of forcing active slides to flex", () => {
    const html = `<!doctype html>
      <html>
        <head>
          <style>
            section.product-slide {
              display: grid;
              grid-template-columns: 1fr 1fr;
            }
          </style>
        </head>
        <body>
          <section class="product-slide"><h1>Grid title</h1><p>Grid body</p></section>
          <section class="product-slide"><h1>Second</h1></section>
        </body>
      </html>`;
    const result = extractSlides(html, { selector: "section" });

    assert.equal(result.mode, "selector");
    assert.equal(result.slides.length, 2);
    assert.match(result.slides[0].html, /section\.product-slide/);
    assert.doesNotMatch(result.slides[0].html, /deckify-visible[\s\S]*display:\s*flex\s*!important/);
    assert.doesNotMatch(result.slides[0].runtimeHtml, /slide\.style\.setProperty\("display", "flex", "important"\)/);
  });

  it("splits Claude-style slide comments when no selector matches", () => {
    const html = `<!doctype html>
      <html>
        <head><title>Comment Deck</title></head>
        <body>
          <main>
            <h1>One</h1>
            <p>First slide</p>
            <!-- slide -->
            <h1>Two</h1>
            <p>Second slide</p>
          </main>
        </body>
      </html>`;
    const result = extractSlides(html, { selector: ".missing" });

    assert.equal(result.mode, "slide-comment");
    assert.equal(result.slides.length, 2);
    assert.match(result.slides[0].html, /First slide/);
    assert.doesNotMatch(result.slides[0].html, /Second slide/);
    assert.match(result.slides[1].html, /Second slide/);
  });

  it("splits horizontal-rule decks when no selector matches", () => {
    const html = `<!doctype html>
      <html>
        <head><title>HR Deck</title></head>
        <body>
          <main>
            <h1>One</h1>
            <p>First slide</p>
            <hr>
            <h1>Two</h1>
            <p>Second slide</p>
          </main>
        </body>
      </html>`;
    const result = extractSlides(html, { selector: ".missing" });

    assert.equal(result.mode, "horizontal-rule");
    assert.equal(result.slides.length, 2);
    assert.match(result.slides[0].html, /First slide/);
    assert.doesNotMatch(result.slides[0].html, /Second slide/);
    assert.match(result.slides[1].html, /Second slide/);
  });

  it("keeps runtime scripts for ordinary sectioned HTML pages", () => {
    const html = `<!doctype html>
      <html>
        <head><title>Plain sections</title></head>
        <body>
          <main>
            <section><h1>One</h1><button id="one">One</button></section>
            <section><h1>Two</h1><button id="two">Two</button></section>
          </main>
          <script>
            window.sectionScriptLoaded = true;
            document.querySelector("#two").dataset.ready = "yes";
          </script>
        </body>
      </html>`;
    const result = extractSlides(html, { selector: "section", sourceUrl: "file:///tmp/plain.html" });

    assert.equal(result.mode, "selector");
    assert.equal(result.slides.length, 2);
    assert.doesNotMatch(result.slides[1].html, /sectionScriptLoaded/);
    assert.match(result.slides[1].runtimeHtml, /sectionScriptLoaded/);
    assert.match(result.slides[1].runtimeHtml, /document\.querySelector\("#two"\)/);
    assert.match(result.slides[1].runtimeHtml, /const slideSelectors = \["section"/);
    assert.match(result.slides[1].runtimeHtml, /const hideInactiveSlides = true;/);
    assert.match(result.slides[1].runtimeHtml, /slide\.style\.setProperty\("display", "none", "important"\)/);
    assert.match(result.slides[1].runtimeHtml, /data-tada-runtime-slide="1"/);
  });

  it("keeps a runtime document for scripted generated deck canvases", () => {
    const html = `<!doctype html>
      <html>
        <head><style>.slide{display:none}.slide.active{display:block}</style></head>
        <body>
          <div class="deck">
            <section class="slide active"><canvas id="dotCanvas"></canvas><h1>One</h1></section>
            <section class="slide"><h1>Two</h1></section>
          </div>
          <div class="nav"><div class="dots" id="dots"></div></div>
          <script>
            document.querySelector("#dotCanvas").getContext("2d").fillRect(0,0,10,10);
            document.querySelector("#dots").appendChild(document.createElement("i"));
          </script>
        </body>
      </html>`;
    const result = extractSlides(html, { selector: "section" });

    assert.equal(result.mode, "existing-deck");
    assert.equal(result.slides.length, 2);
    assert.match(result.slides[0].html, /<canvas id="dotCanvas">/);
    assert.doesNotMatch(result.slides[0].html, /<script/i);
    assert.match(result.slides[0].runtimeHtml, /<script>/i);
    assert.match(result.slides[0].runtimeHtml, /dotCanvas/);
    assert.match(result.slides[0].runtimeHtml, /data-tada-runtime-slide="0"/);
    assert.match(result.slides[1].runtimeHtml, /data-tada-runtime-slide="1"/);
    assert.match(result.slides[1].runtimeHtml, /const targetIndex = 1;/);
    assert.match(result.slides[1].runtimeHtml, /const hideInactiveSlides = false;/);
    assert.match(result.slides[1].runtimeHtml, /tadaSetActiveSlide\(targetIndex\)/);
    assert.match(result.slides[1].runtimeHtml, /applyActiveSlide\(\);/);
    assert.doesNotMatch(result.slides[1].runtimeHtml, /requestAnimationFrame\(applyActiveSlide\)/);
    assert.match(result.slides[1].runtimeHtml, /tadaReplayActiveSlideAnimations/);
    assert.match(result.slides[1].runtimeHtml, /transition", "none", "important"/);
    assert.match(result.slides[1].runtimeHtml, /restoreSlideTransitions/);
    assert.match(result.slides[1].runtimeHtml, /tada:set-slide/);
    assert.match(result.slides[1].runtimeHtml, /dispatchNativeNavigation/);
    assert.match(result.slides[1].runtimeHtml, /forwardingNativeNavigation/);
    assert.match(result.slides[1].runtimeHtml, /\.grow\[data-w\]/);
    assert.match(result.slides[1].runtimeHtml, /setTimeout\(\(\) => \{\s*element\.style\.width = width;\s*\}, 16\)/);
    assert.match(result.slides[1].runtimeHtml, /\.donut \.fg\[data-off\], \.rdonut \.fg\[data-off\]/);
    assert.match(result.slides[1].runtimeHtml, /setTimeout\(\(\) => \{\s*element\.style\.strokeDashoffset = offset;\s*\}, 32\)/);
    assert.match(result.slides[0].runtimeHtml, /tada:navigate/);
  });
});

describe("TaDa! show export", () => {
  it("builds a standalone show document that starts in presentation mode", () => {
    const result = buildTadaShowDocument({
      title: "Client demo",
      mode: "existing-deck",
      slides: [
        {
          html: "<!doctype html><html><body><section><h1>Static one</h1></section></body></html>",
          runtimeHtml: "<!doctype html><html><body><section><h1>Runtime one</h1></section></body></html>",
          title: "One",
          notes: "",
        },
        { html: "<!doctype html><html><body><section><h1>Two</h1></section></body></html>", title: "Two", notes: "Second note" },
      ],
    });

    assert.match(result, /<title>Client demo - TaDa! show<\/title>/);
    assert.match(result, /Runtime one/);
    assert.doesNotMatch(result, /Static one/);
    assert.match(result, /data-tada-show/);
    assert.match(result, /class="app-shell presenting"/);
    assert.match(result, /"mode":"existing-deck"/);
    assert.match(result, /Second note/);
    assert.match(result, /addEventListener\("keydown"/);
    assert.match(result, /tada:set-slide/);
    assert.match(result, /runtimeFrame/);
    assert.doesNotMatch(result, /<\/script>.*<\/script>/s);
  });
});
