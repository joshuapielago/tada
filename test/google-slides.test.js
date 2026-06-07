import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildGoogleSlidesExportUrl,
  buildGoogleSlidesPresentUrl,
  createGoogleSlidesRemoteSession,
  isGoogleSlidesUrl,
  normalizeGoogleSlidesUrl,
} from "../src/shared/google-slides.js";

describe("Google Slides URL helpers", () => {
  it("detects supported Google Slides presentation URLs", () => {
    assert.equal(isGoogleSlidesUrl("https://docs.google.com/presentation/d/abc123/edit"), true);
    assert.equal(isGoogleSlidesUrl("https://docs.google.com/presentation/u/1/d/abc123/present"), true);
    assert.equal(isGoogleSlidesUrl("https://example.com/presentation/d/abc123/edit"), false);
  });

  it("normalizes edit, present, and published URLs to a presentation id", () => {
    assert.deepEqual(normalizeGoogleSlidesUrl("https://docs.google.com/presentation/d/abc123/edit#slide=id.p1"), {
      id: "abc123",
      sourceUrl: "https://docs.google.com/presentation/d/abc123/edit#slide=id.p1",
      editUrl: "https://docs.google.com/presentation/d/abc123/edit",
      presentUrl: "https://docs.google.com/presentation/d/abc123/present",
      exportPptxUrl: "https://docs.google.com/presentation/d/abc123/export/pptx",
    });

    assert.equal(
      normalizeGoogleSlidesUrl("https://docs.google.com/presentation/u/1/d/def456/present").id,
      "def456",
    );
  });

  it("builds present and export URLs from ids", () => {
    assert.equal(buildGoogleSlidesPresentUrl("abc123"), "https://docs.google.com/presentation/d/abc123/present");
    assert.equal(buildGoogleSlidesExportUrl("abc123", "pptx"), "https://docs.google.com/presentation/d/abc123/export/pptx");
  });

  it("creates a remote-present session for private or blocked decks", () => {
    const session = createGoogleSlidesRemoteSession("https://docs.google.com/presentation/d/abc123/edit");

    assert.equal(session.sourceType, "google-slides");
    assert.equal(session.renderMode, "remote-present");
    assert.equal(session.sourceUrl, "https://docs.google.com/presentation/d/abc123/present");
    assert.equal(session.slides[0].url, "https://docs.google.com/presentation/d/abc123/present");
  });
});
