import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { pathToFileURL } from "node:url";

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
    const htmlPath = path.resolve("/Users/jp/demo.html");
    const htmPath = path.resolve("/Users/jp/demo.htm");

    assert.deepEqual(classifySourceInput(htmlPath), {
      kind: "html",
      inputType: "file",
      filePath: htmlPath,
      sourceUrl: pathToFileURL(htmlPath).href,
      sourceLabel: "demo.html",
    });

    assert.deepEqual(classifySourceInput(pathToFileURL(htmPath).href), {
      kind: "html",
      inputType: "file-url",
      filePath: htmPath,
      sourceUrl: pathToFileURL(htmPath).href,
      sourceLabel: "demo.htm",
    });
  });

  it("classifies PowerPoint files from local paths and file URLs", () => {
    const pptxPath = path.resolve("/Users/jp/client-deck.pptx");
    const pptPath = path.resolve("/Users/jp/legacy.ppt");

    assert.deepEqual(classifySourceInput(pptxPath), {
      kind: "powerpoint",
      inputType: "file",
      filePath: pptxPath,
      sourceUrl: pathToFileURL(pptxPath).href,
      sourceLabel: "client-deck.pptx",
      extension: ".pptx",
    });

    assert.deepEqual(classifyFilePath(pptPath).kind, "powerpoint");
    assert.deepEqual(classifyFilePath(pptPath).extension, ".ppt");
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
    const keyPath = path.resolve("/Users/jp/demo.key");

    assert.deepEqual(classifyFilePath(keyPath), {
      kind: "unknown",
      inputType: "file",
      filePath: keyPath,
      sourceUrl: pathToFileURL(keyPath).href,
      sourceLabel: "demo.key",
      extension: ".key",
    });
  });
});
