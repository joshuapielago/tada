import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const rendererHtml = await readFile("electron/renderer/index.html", "utf8");
const rendererApp = await readFile("electron/renderer/app.js", "utf8");
const mainProcess = await readFile("electron/main.cjs", "utf8");

describe("Electron production security hardening", () => {
  it("sets a renderer content security policy", () => {
    assert.match(rendererHtml, /http-equiv="Content-Security-Policy"/);
    assert.match(rendererHtml, /default-src 'self'/);
    assert.match(rendererHtml, /object-src 'none'/);
  });

  it("keeps untrusted presentation frames sandboxed without popup or download privileges", () => {
    const sandbox = rendererHtml.match(/<iframe[\s\S]*?id="slideFrame"[\s\S]*?sandbox="([^"]+)"/)?.[1] ?? "";

    assert.match(sandbox, /allow-scripts/);
    assert.doesNotMatch(sandbox, /allow-popups/);
    assert.doesNotMatch(sandbox, /allow-downloads/);
  });

  it("loads live presentation documents through the sandboxed presentation protocol instead of CSP-bound srcdoc", () => {
    assert.match(rendererHtml, /frame-src 'self' about: data: blob: tada-slide:/);
    assert.match(mainProcess, /protocol\.registerSchemesAsPrivileged/);
    assert.match(mainProcess, /protocol\.handle\("tada-slide"/);
    assert.match(rendererApp, /api\?\.createSlideDocument/);
    assert.match(rendererApp, /elements\.slideFrame\.src = nextUrl/);
    assert.doesNotMatch(rendererApp, /elements\.slideFrame\.srcdoc = slide\.(runtimeHtml|html)/);
  });

  it("guards navigation, permissions, webviews, and new windows in the main process", () => {
    assert.match(mainProcess, /web-contents-created/);
    assert.match(mainProcess, /will-navigate/);
    assert.match(mainProcess, /setWindowOpenHandler/);
    assert.match(mainProcess, /setPermissionRequestHandler/);
    assert.match(mainProcess, /will-attach-webview/);
  });
});
