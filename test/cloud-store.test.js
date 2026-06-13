import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { createDeckStore } from "../src/cloud/deck-store.js";

async function withStore(testFn) {
  const storageRoot = await mkdtemp(path.join(os.tmpdir(), "tada-cloud-store-"));
  const store = await createDeckStore({
    storageRoot,
    publicBaseUrl: "http://127.0.0.1:4173",
  });

  try {
    await testFn(store);
  } finally {
    await rm(storageRoot, { force: true, recursive: true });
  }
}

describe("Published Deck store", () => {
  it("creates an ownerless unlisted deck from certified HTML", async () => {
    await withStore(async (store) => {
      const created = await store.createDeck({
        html: "<!doctype html><title>Roadmap</title><section>Launch</section>",
        certifyRights: true,
        uploadSurface: "web",
      });

      assert.match(created.id, /^[a-z0-9]{8,}$/);
      assert.equal(created.viewUrl, `http://127.0.0.1:4173/d/${created.id}`);
      assert.equal(created.title, "Roadmap");
      assert.equal(created.visibility, "unlisted");
      assert.equal(created.manageable, false);
      assert.equal(created.uploadSurface, "web");
      assert.deepEqual(created.aspectRatio, { width: 16, height: 9 });
      assert.equal(created.thumbnailStatus, "pending");
      assert.deepEqual(
        created.notices.map((notice) => notice.code),
        ["source-visible", "anonymous-ownerless"],
      );

      const manifest = await store.getManifest(created.id);
      assert.equal(manifest.entrypoint, "index.html");
      assert.equal(manifest.source.type, "html");
      assert.equal(manifest.uploadSurface, "web");
      assert.equal(manifest.files[0].path, "index.html");
    });
  });

  it("rejects uploads without rights certification", async () => {
    await withStore(async (store) => {
      await assert.rejects(
        () =>
          store.createDeck({
            html: "<section>Nope</section>",
            certifyRights: false,
            uploadSurface: "api",
          }),
        /certify/i,
      );
    });
  });

  it("warns about remote assets and deck runtimes without blocking upload", async () => {
    await withStore(async (store) => {
      const created = await store.createDeck({
        html: `
          <!doctype html>
          <title>Runtime Deck</title>
          <link rel="stylesheet" href="https://cdn.example.com/reveal.css">
          <div class="reveal"><div class="slides"><section>One</section></div></div>
          <script src="https://cdn.example.com/reveal.js"></script>
        `,
        certifyRights: true,
        uploadSurface: "api",
      });

      assert.deepEqual(
        created.warnings.map((warning) => warning.code),
        ["remote-assets", "deck-runtime"],
      );
    });
  });

  it("does not warn about deck runtimes just because title text says deck", async () => {
    await withStore(async (store) => {
      const created = await store.createDeck({
        html: "<!doctype html><title>Browser Smoke Deck</title><section>Plain slide</section>",
        certifyRights: true,
        uploadSurface: "web",
      });

      assert.deepEqual(created.warnings, []);
    });
  });

  it("serves stored bundle files and rejects traversal", async () => {
    await withStore(async (store) => {
      const created = await store.createDeck({
        html: "<!doctype html><title>Bundle</title><section>Safe</section>",
        certifyRights: true,
        uploadSurface: "cli",
      });

      const file = await store.readDeckFile(created.id, "index.html");
      assert.equal(file.contentType, "text/html; charset=utf-8");
      assert.match(file.bytes.toString("utf8"), /Safe/);

      await assert.rejects(() => store.readDeckFile(created.id, "../manifest.json"), /outside/i);
    });
  });
});
