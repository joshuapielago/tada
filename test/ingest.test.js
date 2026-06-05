import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildClaudeDeckPrompt,
  getPastedHtml,
  isLikelyHtmlDocument,
} from "../src/shared/ingest.js";

describe("isLikelyHtmlDocument", () => {
  it("accepts complete documents and useful deck fragments", () => {
    assert.equal(
      isLikelyHtmlDocument("<!doctype html><html><body><h1>Deck</h1></body></html>"),
      true,
    );
    assert.equal(isLikelyHtmlDocument("<section><h1>Slide</h1></section>"), true);
    assert.equal(isLikelyHtmlDocument('<div class="slide">Slide</div>'), true);
    assert.equal(isLikelyHtmlDocument("<main><h2>Report</h2><p>Content</p></main>"), true);
  });

  it("accepts horizontal-rule deck fragments from pasted source", () => {
    assert.equal(isLikelyHtmlDocument("<div>Intro</div><hr><div>Next</div>"), true);
  });

  it("rejects ordinary prose and tiny formatting snippets", () => {
    assert.equal(isLikelyHtmlDocument("please make me a deck"), false);
    assert.equal(isLikelyHtmlDocument("<b>one word</b>"), false);
    assert.equal(isLikelyHtmlDocument(""), false);
  });
});

describe("getPastedHtml", () => {
  it("prefers text/html when it looks like an HTML document", () => {
    const html = "<section><h1>Slide</h1></section>";

    assert.equal(
      getPastedHtml({
        getData(type) {
          return type === "text/html" ? html : "plain";
        },
      }),
      html,
    );
  });

  it("falls back to text/plain for copied source HTML", () => {
    const html = "<!doctype html><html><body><section>Slide</section></body></html>";

    assert.equal(
      getPastedHtml({
        getData(type) {
          return type === "text/plain" ? html : "";
        },
      }),
      html,
    );
  });

  it("returns an empty string when clipboard text is not useful HTML", () => {
    assert.equal(
      getPastedHtml({
        getData(type) {
          return type === "text/plain" ? "ordinary copied text" : "";
        },
      }),
      "",
    );
  });
});

describe("buildClaudeDeckPrompt", () => {
  it("asks for a single-file HTML deck with section.slide boundaries", () => {
    const prompt = buildClaudeDeckPrompt();

    assert.match(prompt, /single-file HTML/i);
    assert.match(prompt, /<section class="slide">/);
    assert.match(prompt, /self-contained CSS/i);
    assert.match(prompt, /scripts/i);
    assert.match(prompt, /TaDa!/);
  });
});
