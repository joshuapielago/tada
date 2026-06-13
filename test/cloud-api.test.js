import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { createPresentationServer } from "../server.js";

async function withCloudServer(testFn) {
  const storageRoot = await mkdtemp(path.join(os.tmpdir(), "tada-cloud-api-"));
  const server = await createPresentationServer({ storageRoot });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const { port } = server.address();
    await testFn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(storageRoot, { force: true, recursive: true });
  }
}

async function uploadDeck(baseUrl, overrides = {}) {
  const response = await fetch(`${baseUrl}/api/decks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      html: "<!doctype html><title>API Deck</title><section>Hello cloud</section>",
      certifyRights: true,
      ...overrides,
    }),
  });
  const payload = await response.json();
  assert.equal(response.status, 201);
  return payload;
}

describe("Tada Cloud HTTP API", () => {
  it("creates a deck and exposes metadata plus stored files", async () => {
    await withCloudServer(async (baseUrl) => {
      const created = await uploadDeck(baseUrl);

      assert.equal(created.viewUrl, `${baseUrl}/d/${created.id}`);
      assert.equal(created.title, "API Deck");
      assert.equal(created.uploadSurface, "api");
      assert.equal(created.thumbnailStatus, "pending");

      const metadataResponse = await fetch(`${baseUrl}/api/decks/${created.id}`);
      const metadata = await metadataResponse.json();
      assert.equal(metadataResponse.status, 200);
      assert.equal(metadata.id, created.id);
      assert.deepEqual(metadata.notices.map((notice) => notice.code), [
        "source-visible",
        "anonymous-ownerless",
      ]);

      const fileResponse = await fetch(`${baseUrl}/api/decks/${created.id}/files/index.html`);
      assert.equal(fileResponse.status, 200);
      assert.match(fileResponse.headers.get("content-type") ?? "", /text\/html/);
      assert.match(await fileResponse.text(), /Hello cloud/);
    });
  });

  it("returns typed API errors for invalid uploads", async () => {
    await withCloudServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/decks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html: "<section>No certify</section>" }),
      });
      const payload = await response.json();

      assert.equal(response.status, 400);
      assert.equal(payload.error.code, "certification-required");
      assert.match(payload.error.message, /certify/i);
    });
  });

  it("serves share viewer and admin stats", async () => {
    await withCloudServer(async (baseUrl) => {
      const created = await uploadDeck(baseUrl, {
        html: "<!doctype html><title>Stats Deck</title><section>Admin</section>",
      });

      const viewerResponse = await fetch(`${baseUrl}/d/${created.id}`);
      assert.equal(viewerResponse.status, 200);
      assert.match(await viewerResponse.text(), /cloud-viewer\.js/);

      const statsResponse = await fetch(`${baseUrl}/api/admin/stats`);
      const stats = await statsResponse.json();
      assert.equal(statsResponse.status, 200);
      assert.equal(stats.deckCount, 1);
      assert.equal(stats.recentDecks[0].id, created.id);
      assert.equal(stats.thumbnail.pending, 1);
    });
  });

  it("records reports without hiding the deck", async () => {
    await withCloudServer(async (baseUrl) => {
      const created = await uploadDeck(baseUrl);
      const reportResponse = await fetch(`${baseUrl}/api/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deckId: created.id, reason: "copyright concern" }),
      });
      const report = await reportResponse.json();
      assert.equal(reportResponse.status, 201);
      assert.equal(report.deckId, created.id);

      const viewerResponse = await fetch(`${baseUrl}/d/${created.id}`);
      assert.equal(viewerResponse.status, 200);
    });
  });

  it("serves minimal API and MCP docs", async () => {
    await withCloudServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/docs/api`);
      const html = await response.text();

      assert.equal(response.status, 200);
      assert.match(html, /POST \/api\/decks/);
      assert.match(html, /\/mcp/);
      assert.match(html, /tada upload/);
    });
  });
});
