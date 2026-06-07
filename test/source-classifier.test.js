import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classifyFilePath,
  classifySourceInput,
} from "../src/shared/source-classifier.js";

describe("classifySourceInput", () => {
  it("classifies pasted HTML as a native HTML deck source", () => {
    assert.deepEqual(classifySourceInput("<section><h1>Slide</h1></section>"), {
      kind: "html",
      inputType: "raw-html",
      html: "<section><h1>Slide</h1></section>",
      sourceLabel: "Pasted HTML",
      sourceUrl: "",
    });
  });

  it("classifies local and file-url HTML inputs as native HTML", () => {
    assert.deepEqual(classifySourceInput("/Users/jp/demo.html"), {
      kind: "html",
      inputType: "file",
      filePath: "/Users/jp/demo.html",
      sourceUrl: "file:///Users/jp/demo.html",
      sourceLabel: "demo.html",
    });

    assert.deepEqual(classifySourceInput("file:///Users/jp/demo.htm"), {
      kind: "html",
      inputType: "file-url",
      filePath: "/Users/jp/demo.htm",
      sourceUrl: "file:///Users/jp/demo.htm",
      sourceLabel: "demo.htm",
    });
  });

  it("classifies PowerPoint files from local paths and file URLs", () => {
    assert.deepEqual(classifySourceInput("/Users/jp/client-deck.pptx"), {
      kind: "powerpoint",
      inputType: "file",
      filePath: "/Users/jp/client-deck.pptx",
      sourceUrl: "file:///Users/jp/client-deck.pptx",
      sourceLabel: "client-deck.pptx",
      extension: ".pptx",
    });

    assert.deepEqual(classifyFilePath("/Users/jp/legacy.ppt").kind, "powerpoint");
    assert.deepEqual(classifyFilePath("/Users/jp/legacy.ppt").extension, ".ppt");
  });

  it("classifies Google Slides URLs with the presentation id", () => {
    assert.deepEqual(classifySourceInput("https://docs.google.com/presentation/d/abc123/edit#slide=id.p1"), {
      kind: "google-slides",
      inputType: "url",
      sourceUrl: "https://docs.google.com/presentation/d/abc123/edit#slide=id.p1",
      sourceLabel: "Google Slides",
      presentationId: "abc123",
    });
  });

  it("keeps localhost URLs in HTML mode for generated local artifacts", () => {
    assert.deepEqual(classifySourceInput("localhost:4173/demo"), {
      kind: "html",
      inputType: "url",
      sourceUrl: "http://localhost:4173/demo",
      sourceLabel: "localhost",
    });
  });

  it("classifies ordinary remote websites for website capture", () => {
    assert.deepEqual(classifySourceInput("example.com/landing"), {
      kind: "website",
      inputType: "url",
      sourceUrl: "https://example.com/landing",
      sourceLabel: "example.com",
    });
  });

  it("classifies remote html-looking URLs as native HTML", () => {
    assert.equal(classifySourceInput("https://example.com/demo.html").kind, "html");
  });

  it("returns unknown for unsupported local files", () => {
    assert.deepEqual(classifyFilePath("/Users/jp/demo.key"), {
      kind: "unknown",
      inputType: "file",
      filePath: "/Users/jp/demo.key",
      sourceUrl: "file:///Users/jp/demo.key",
      sourceLabel: "demo.key",
      extension: ".key",
    });
  });
});
