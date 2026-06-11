import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  analyzeDeckHtml,
  detectBoundaryMode,
  extractSlides,
} from "../src/shared/deckify.js";
import {
  articleDeck,
  bundledStandaloneDeck,
  commentDeck,
  customClassDeck,
  dataSlideDeck,
  existingActiveDeck,
  headingDeck,
  horizontalRuleDeck,
  markerCopyDeck,
  remarkDeck,
  revealDeck,
  sectionDeck,
  swiperDeck,
} from "./deck-fixtures.js";

describe("deck fixture matrix", () => {
  it("keeps ordinary section decks in selector mode with runtime slide isolation", () => {
    const result = extractSlides(sectionDeck({ count: 4 }), {
      selector: "section",
      sourceUrl: "file:///tmp/section-fixture.html",
    });

    assert.equal(analyzeDeckHtml(sectionDeck()).mode, "selector");
    assert.equal(result.mode, "selector");
    assert.equal(result.slides.length, 4);
    assert.match(result.slides[2].html, /Section slide 3/);
    assert.match(result.slides[2].runtimeHtml, /window\.sectionDeckBooted = true/);
    assert.match(result.slides[2].runtimeHtml, /const slideSelectors = \["section"\]/);
    assert.match(result.slides[2].runtimeHtml, /const hideInactiveSlides = true;/);
  });

  it("honors custom class selectors in the string parser fallback", () => {
    const result = extractSlides(customClassDeck(), {
      selector: ".client-slide",
      sourceUrl: "file:///tmp/custom-class.html",
    });

    assert.equal(detectBoundaryMode(customClassDeck(), ".client-slide"), "selector");
    assert.equal(result.mode, "selector");
    assert.equal(result.slides.length, 3);
    assert.match(result.slides[1].html, /Custom two/);
    assert.doesNotMatch(result.slides[1].html, /Custom one/);
  });

  it("keeps generated active decks in existing-deck mode without selector isolation", () => {
    const result = extractSlides(existingActiveDeck(), {
      selector: "section",
      sourceUrl: "file:///tmp/generated.html",
    });

    assert.equal(analyzeDeckHtml(existingActiveDeck()).mode, "existing-deck");
    assert.equal(result.mode, "existing-deck");
    assert.equal(result.slides.length, 3);
    assert.equal(result.slides[1].notes, "Second note");
    assert.match(result.slides[1].runtimeHtml, /window\.generatedBooted = true/);
    assert.match(result.slides[1].runtimeHtml, /const hideInactiveSlides = false;/);
  });

  it("recognizes common deck runtimes created by AI tools and web libraries", () => {
    const cases = [
      { name: "Reveal", html: revealDeck(), expectedTitle: /Reveal two/ },
      { name: "Remark", html: remarkDeck(), expectedTitle: /Remark two/ },
      { name: "Swiper", html: swiperDeck(), expectedTitle: /Swiper two/ },
      { name: "Data slide", html: dataSlideDeck(), expectedTitle: /Data two/ },
      { name: "Bundled standalone", html: bundledStandaloneDeck(), expectedTitle: /Bundled two/ },
    ];

    for (const testCase of cases) {
      const result = extractSlides(testCase.html, {
        selector: "section",
        sourceUrl: `file:///tmp/${testCase.name}.html`,
      });

      assert.equal(result.mode, "existing-deck", testCase.name);
      assert.equal(result.slides.length, 2, testCase.name);
      assert.match(result.slides[1].html, testCase.expectedTitle, testCase.name);
      assert.match(result.slides[1].runtimeHtml, /const hideInactiveSlides = false;/, testCase.name);
    }
  });

  it("does not let deck marker names in copy trip the existing runtime detector", () => {
    const result = extractSlides(markerCopyDeck(), {
      selector: "section",
      sourceUrl: "file:///tmp/marker-copy.html",
    });

    assert.equal(analyzeDeckHtml(markerCopyDeck()).mode, "selector");
    assert.equal(result.mode, "selector");
    assert.equal(result.slides.length, 2);
    assert.match(result.slides[0].html, /data-slide/);
    assert.match(result.slides[0].runtimeHtml, /const slideSelectors = \["section"\]/);
  });

  it("covers non-section fallback boundaries without bleeding adjacent content", () => {
    const cases = [
      { mode: "article", html: articleDeck(), selector: ".missing", first: /Article one/, second: /Article two/ },
      { mode: "headings", html: headingDeck(), selector: ".missing", first: /First heading payload/, second: /Second heading payload/ },
      { mode: "slide-comment", html: commentDeck(), selector: ".missing", first: /First comment payload/, second: /Second comment payload/ },
      { mode: "horizontal-rule", html: horizontalRuleDeck(), selector: ".missing", first: /First rule payload/, second: /Second rule payload/ },
    ];

    for (const testCase of cases) {
      const result = extractSlides(testCase.html, { selector: testCase.selector });

      assert.equal(result.mode, testCase.mode);
      assert.equal(result.slides.length >= 2, true, testCase.mode);
      assert.match(result.slides[0].html, testCase.first, testCase.mode);
      assert.doesNotMatch(result.slides[0].html, testCase.second, testCase.mode);
      assert.match(result.slides[1].html, testCase.second, testCase.mode);
    }
  });

  it("parses a large generated section deck within a bounded budget", () => {
    const startedAt = performance.now();
    const result = extractSlides(sectionDeck({ count: 150, includeScripts: false }), {
      selector: "section",
      sourceUrl: "file:///tmp/large-section.html",
    });
    const elapsedMs = performance.now() - startedAt;

    assert.equal(result.mode, "selector");
    assert.equal(result.slides.length, 150);
    assert.match(result.slides.at(-1).html, /Section slide 150/);
    assert.ok(elapsedMs < 500, `large section parse took ${elapsedMs.toFixed(1)}ms`);
  });
});
