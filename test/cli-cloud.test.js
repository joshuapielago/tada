import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, it } from "node:test";

import { createPresentationServer } from "../server.js";

const execFileAsync = promisify(execFile);

async function withCloudServer(testFn) {
  const storageRoot = await mkdtemp(path.join(os.tmpdir(), "tada-cli-server-"));
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

async function withDeckFixture(testFn) {
  const root = await mkdtemp(path.join(os.tmpdir(), "tada-cli-deck-"));
  const htmlPath = path.join(root, "deck.html");
  const imagePath = path.join(root, "cover.svg");
  await writeFile(
    htmlPath,
    '<!doctype html><title>CLI Deck</title><section><h1>CLI</h1><img src="./cover.svg"></section>',
  );
  await writeFile(imagePath, '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>');

  try {
    await testFn({ root, htmlPath });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

describe("tada upload CLI", () => {
  it("uploads an HTML file with referenced same-root assets and prints the share URL last", async () => {
    await withCloudServer(async (baseUrl) => {
      await withDeckFixture(async ({ htmlPath }) => {
        const { stdout, stderr } = await execFileAsync(process.execPath, [
          "bin/tada.js",
          "upload",
          htmlPath,
          "--api-url",
          baseUrl,
        ]);
        const stdoutLines = stdout.trim().split(/\r?\n/);
        const shareUrl = stdoutLines.at(-1);

        assert.match(shareUrl, new RegExp(`^${baseUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/d/[a-z0-9]+$`));
        assert.match(stderr, /public-unlisted|inspect/i);

        const deckId = shareUrl.split("/").at(-1);
        const assetResponse = await fetch(`${baseUrl}/api/decks/${deckId}/files/cover.svg`);
        assert.equal(assetResponse.status, 200);
        assert.match(await assetResponse.text(), /<svg/);
      });
    });
  });

  it("emits structured JSON when requested", async () => {
    await withCloudServer(async (baseUrl) => {
      await withDeckFixture(async ({ htmlPath }) => {
        const { stdout, stderr } = await execFileAsync(process.execPath, [
          "bin/tada.js",
          "upload",
          htmlPath,
          "--api-url",
          baseUrl,
          "--json",
        ]);
        const payload = JSON.parse(stdout);

        assert.equal(stderr, "");
        assert.match(payload.viewUrl, new RegExp(`^${baseUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/d/[a-z0-9]+$`));
        assert.equal(payload.title, "CLI Deck");
        assert.equal(payload.notices.length, 2);
      });
    });
  });
});
