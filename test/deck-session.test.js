import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createHtmlDeckSession,
  createImageDeckSession,
  createRemotePresentSession,
} from "../src/shared/deck-session.js";

describe("createHtmlDeckSession", () => {
  it("normalizes extracted HTML slides into a runtime deck session", () => {
    const session = createHtmlDeckSession({
      id: "fixed-html",
      title: "Client Demo",
      sourceLabel: "demo.html",
      sourceUrl: "file:///tmp/demo.html",
      mode: "existing-deck",
      slides: [
        {
          title: "Intro",
          notes: "Say hello",
          html: "<!doctype html><h1>Intro</h1>",
          runtimeHtml: "<!doctype html><h1>Runtime Intro</h1>",
        },
      ],
    });

    assert.equal(session.id, "fixed-html");
    assert.equal(session.sourceType, "html");
    assert.equal(session.renderMode, "html-runtime");
    assert.equal(session.mode, "existing-deck");
    assert.equal(session.currentIndex, 0);
    assert.equal(session.slides.length, 1);
    assert.deepEqual(session.slides[0], {
      id: "fixed-html-slide-1",
      type: "html",
      title: "Intro",
      notes: "Say hello",
      html: "<!doctype html><h1>Intro</h1>",
      runtimeHtml: "<!doctype html><h1>Runtime Intro</h1>",
    });
  });

  it("uses static HTML mode when slides do not have runtime documents", () => {
    const session = createHtmlDeckSession({
      id: "static",
      slides: [{ html: "<section>One</section>" }],
    });

    assert.equal(session.renderMode, "html-static");
    assert.equal(session.slides[0].title, "Slide 1");
    assert.equal(session.slides[0].notes, "");
  });
});

describe("createImageDeckSession", () => {
  it("normalizes image slides for PowerPoint, Google Slides, and websites", () => {
    const session = createImageDeckSession({
      id: "ppt",
      title: "Board Deck",
      sourceType: "powerpoint",
      sourceLabel: "board.pptx",
      slides: [
        {
          src: "data:image/png;base64,AAA",
          title: "Financials",
          notes: "Pause here",
          width: 1920,
          height: 1080,
        },
      ],
    });

    assert.equal(session.sourceType, "powerpoint");
    assert.equal(session.renderMode, "image");
    assert.equal(session.slides[0].type, "image");
    assert.equal(session.slides[0].aspectRatio, "16:9");
    assert.match(session.slides[0].html, /<img/);
    assert.match(session.slides[0].html, /Financials/);
  });
});

describe("createRemotePresentSession", () => {
  it("creates a single-slide remote present session", () => {
    const session = createRemotePresentSession({
      id: "google",
      title: "Shared Deck",
      sourceType: "google-slides",
      sourceUrl: "https://docs.google.com/presentation/d/abc123/present",
      sourceLabel: "Google Slides",
    });

    assert.equal(session.renderMode, "remote-present");
    assert.equal(session.slides.length, 1);
    assert.deepEqual(session.slides[0], {
      id: "google-slide-1",
      type: "remote",
      title: "Shared Deck",
      notes: "",
      url: "https://docs.google.com/presentation/d/abc123/present",
    });
  });
});
