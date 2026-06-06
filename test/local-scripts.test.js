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

test("reads multiple local scripts in parallel while preserving document order", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tada-local-scripts-"));
  try {
    const htmlPath = path.join(directory, "deck.html");
    await writeFile(path.join(directory, "one.js"), "window.one = true;", "utf8");
    await writeFile(path.join(directory, "two.js"), "window.two = true;", "utf8");
    await writeFile(path.join(directory, "three.js"), "window.three = true;", "utf8");

    let activeReads = 0;
    let maxActiveReads = 0;
    const delayedReadFile = async (filePath, encoding) => {
      activeReads += 1;
      maxActiveReads = Math.max(maxActiveReads, activeReads);
      await new Promise((resolve) => setTimeout(resolve, 25));
      activeReads -= 1;
      return readFile(filePath, encoding);
    };

    const html = [
      '<script src="./one.js"></script>',
      '<script src="./two.js"></script>',
      '<script src="./three.js"></script>',
    ].join("");

    const result = await inlineLocalScriptTags(html, htmlPath, delayedReadFile);

    assert.ok(maxActiveReads > 1);
    assert.ok(result.indexOf("window.one") < result.indexOf("window.two"));
    assert.ok(result.indexOf("window.two") < result.indexOf("window.three"));
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
