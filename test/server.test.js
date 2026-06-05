import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { pathToFileURL } from "node:url";

import { createLocalFilePayload, createPresentationServer, resolveLocalAssetPath } from "../server.js";

async function fetchFromTestServer(pathname) {
  const server = createPresentationServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const { port } = server.address();
    return await fetch(`http://127.0.0.1:${port}${pathname}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

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

  it("serves the shared deckify module needed by the browser prototype", async () => {
    const response = await fetchFromTestServer("/src/shared/deckify.js");
    const text = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/javascript/);
    assert.match(text, /export function normalizeSourceUrl/);
  });
});
