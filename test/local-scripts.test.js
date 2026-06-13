import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { inlineLocalScriptTags } = require("../src/shared/local-scripts.cjs");

test("inlines same-directory local script tags for sandboxed presentation frames", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tada-local-scripts-"));
  try {
    const htmlPath = path.join(directory, "deck.html");
    const scriptPath = path.join(directory, "deck.js");
    await writeFile(scriptPath, "window.externalScriptLoaded = true;</script><script>window.notSplit = true;", "utf8");
    const html = '<section><h1>One</h1></section><script defer src="./deck.js"></script>';

    const result = await inlineLocalScriptTags(html, htmlPath, readFile);

    assert.doesNotMatch(result, /src="\.\/deck\.js"/);
    assert.match(result, /<script defer>/);
    assert.ok(result.includes("window.externalScriptLoaded = true;<\\/script><script>window.notSplit = true;"));
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("leaves remote and parent-directory script tags untouched", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tada-local-scripts-"));
  try {
    const htmlPath = path.join(directory, "deck.html");
    const html = [
      '<script src="https://cdn.example.com/deck.js"></script>',
      '<script src="../outside.js"></script>',
    ].join("");

    const result = await inlineLocalScriptTags(html, htmlPath, readFile);

    assert.match(result, /src="https:\/\/cdn\.example\.com\/deck\.js"/);
    assert.match(result, /src="\.\.\/outside\.js"/);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
