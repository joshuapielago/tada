import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { pathToFileURL } from "node:url";

import { createLocalFilePayload, resolveLocalAssetPath } from "../server.js";

describe("local file source loading", () => {
  it("creates an HTML payload for a local file URL", async () => {
    const fixturePath = path.resolve("test/fixtures/sample-deck.html");
    const payload = await createLocalFilePayload(
      new URL(pathToFileURL(fixturePath).href),
      "127.0.0.1:4173",
    );

    assert.equal(payload.sourceLabel, "sample-deck.html");
    assert.equal(payload.sourceUrl, pathToFileURL(fixturePath).href);
    assert.match(payload.html, /Client Review/);
    assert.match(payload.html, /<base href="http:\/\/127\.0\.0\.1:4173\/api\/local-assets\/[^"]+\/">/);
  });

  it("resolves local assets inside the source file directory", async () => {
    const fixturePath = path.resolve("test/fixtures/sample-deck.html");
    const payload = await createLocalFilePayload(
      new URL(pathToFileURL(fixturePath).href),
      "127.0.0.1:4173",
    );
    const encodedRoot = payload.html.match(/\/api\/local-assets\/([^/]+)\//)[1];

    assert.equal(
      resolveLocalAssetPath(encodedRoot, "sample-deck.html"),
      fixturePath,
    );
  });

  it("rejects local asset traversal outside the source file directory", async () => {
    const fixturePath = path.resolve("test/fixtures/sample-deck.html");
    const payload = await createLocalFilePayload(
      new URL(pathToFileURL(fixturePath).href),
      "127.0.0.1:4173",
    );
    const encodedRoot = payload.html.match(/\/api\/local-assets\/([^/]+)\//)[1];

    assert.throws(
      () => resolveLocalAssetPath(encodedRoot, "../sample-deck.html"),
      /outside the source directory/i,
    );
  });
});
