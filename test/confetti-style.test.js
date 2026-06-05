import assert from "node:assert/strict";
import { stat, readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const rendererHtml = await readFile("electron/renderer/index.html", "utf8");
const rendererApp = await readFile("electron/renderer/app.js", "utf8");
const rendererStyles = await readFile("electron/renderer/styles.css", "utf8");
const deckify = await readFile("src/shared/deckify.js", "utf8");

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

describe("Confetti Studio visual system", () => {
  it("uses bundled display and UI fonts with Confetti Studio tokens", async () => {
    assert.equal(
      await exists("electron/renderer/assets/fonts/bricolage-grotesque-latin.woff2"),
      true,
    );
    assert.equal(await exists("electron/renderer/assets/fonts/dm-sans-latin.woff2"), true);
    assert.match(rendererStyles, /@font-face[\s\S]*Bricolage Grotesque/);
    assert.match(rendererStyles, /@font-face[\s\S]*DM Sans/);
    assert.match(rendererStyles, /--font-display:\s*"Bricolage Grotesque"/);
    assert.match(rendererStyles, /--font-ui:\s*"DM Sans"/);
    assert.match(rendererStyles, /--confetti-coral:\s*#ff4f68/i);
    assert.match(rendererStyles, /--confetti-mint:\s*#32c6b1/i);
    assert.match(rendererStyles, /--confetti-yellow:\s*#ffd24f/i);
    assert.match(rendererStyles, /--confetti-violet:\s*#7c4dff/i);
    assert.doesNotMatch(rendererStyles, /--accent:\s*#2d6cdf/i);
  });

  it("makes the toolbar icon-first while preserving accessible names", () => {
    const toolbarActions =
      rendererHtml.match(/<div class="toolbar-actions">([\s\S]*?)<\/div>\s*<\/header>/)?.[1] ?? "";

    for (const id of ["presentButton", "openButton", "exportShowButton", "updateButton"]) {
      assert.match(toolbarActions, new RegExp(`id="${id}"[\\s\\S]*?aria-label="[^"]+"`));
      assert.match(toolbarActions, new RegExp(`id="${id}"[\\s\\S]*?<svg`));
    }

    assert.doesNotMatch(toolbarActions, />\s*(Present|Open|Export|Update)\s*</);
    assert.match(rendererHtml, /id="icon-sparkles"/);
    assert.match(rendererHtml, /id="icon-presentation"/);
    assert.match(rendererHtml, /id="icon-folder-open"/);
  });

  it("renders the approved celebratory empty state without stale copy", () => {
    assert.match(rendererHtml, /class="empty-state-illustration"/);
    assert.match(rendererHtml, /icon-wand/);
    assert.match(rendererStyles, /\.stage::before/);
    assert.match(rendererStyles, /\.empty-state::before/);
    assert.match(rendererStyles, /confetti/i);
    assert.match(rendererApp, /No slides yet/);
    assert.doesNotMatch(rendererApp, /thumbnail-empty">No slides</);
  });

  it("uses TaDa! casing in exported show chrome", () => {
    assert.match(deckify, /TaDa! show/);
    assert.match(deckify, /title="TaDa! show slide"/);
    assert.doesNotMatch(deckify, /tada show slide/);
  });
});
