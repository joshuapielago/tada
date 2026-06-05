# TaDa Ingest Sprint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce HTML ingest friction by supporting paste-to-present, a copyable Claude deck prompt, extra slide boundary formats, and friendlier empty/recovery states.

**Architecture:** Add small shared ingest helpers for clipboard HTML detection and the Claude prompt, extend the existing shared deck parser for `<hr>` and `<!-- slide -->` boundaries, then wire the renderer UI to those helpers. Keep Electron's main process narrow; only add clipboard-write IPC for the explicit user-initiated prompt button.

**Tech Stack:** Electron, vanilla JS modules, Node test runner, shared ESM parser helpers, preload IPC bridge.

---

## File Structure

- `src/shared/ingest.js`: new shared helper module for paste detection, pasted-source labels, and Claude prompt text.
- `src/shared/deckify.js`: add boundary mode and extraction for `<hr>` and `<!-- slide -->`.
- `test/ingest.test.js`: new tests for paste and prompt helpers.
- `test/deckify.test.js`: new tests for `<hr>` and `<!-- slide -->` extraction.
- `electron/main.cjs`: add explicit clipboard-write IPC handler.
- `electron/preload.cjs`: expose `writeClipboardText`.
- `electron/renderer/index.html`: add empty-state actions for open, paste/focus source, and copy prompt.
- `electron/renderer/app.js`: handle paste-to-present, copy prompt, loading/recovery state, and button bindings.
- `electron/renderer/styles.css`: style the focused empty-state additions without changing deck content.

## Task 1: Shared Ingest Helpers

**Files:**
- Create: `src/shared/ingest.js`
- Create: `test/ingest.test.js`

- [x] **Step 1: Write failing tests**

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildClaudeDeckPrompt,
  getPastedHtml,
  isLikelyHtmlDocument,
} from "../src/shared/ingest.js";

describe("isLikelyHtmlDocument", () => {
  it("accepts complete documents and useful fragments", () => {
    assert.equal(isLikelyHtmlDocument("<!doctype html><html><body><h1>Deck</h1></body></html>"), true);
    assert.equal(isLikelyHtmlDocument("<section><h1>Slide</h1></section>"), true);
    assert.equal(isLikelyHtmlDocument("<div class=\"slide\">Slide</div>"), true);
  });

  it("rejects ordinary prose and unsafe tiny fragments", () => {
    assert.equal(isLikelyHtmlDocument("please make me a deck"), false);
    assert.equal(isLikelyHtmlDocument("<b>one word</b>"), false);
  });
});

describe("getPastedHtml", () => {
  it("prefers text/html when it looks like an HTML document", () => {
    const html = "<section><h1>Slide</h1></section>";
    assert.equal(
      getPastedHtml({
        getData(type) {
          return type === "text/html" ? html : "plain";
        },
      }),
      html,
    );
  });

  it("falls back to text/plain for copied source HTML", () => {
    const html = "<!doctype html><html><body><section>Slide</section></body></html>";
    assert.equal(
      getPastedHtml({
        getData(type) {
          return type === "text/plain" ? html : "";
        },
      }),
      html,
    );
  });
});

describe("buildClaudeDeckPrompt", () => {
  it("asks for a single-file HTML deck with section.slide boundaries", () => {
    const prompt = buildClaudeDeckPrompt();
    assert.match(prompt, /single-file HTML/i);
    assert.match(prompt, /<section class="slide">/);
    assert.match(prompt, /self-contained CSS/i);
    assert.match(prompt, /scripts/i);
  });
});
```

- [x] **Step 2: Run tests and verify RED**

Run: `npm test -- test/ingest.test.js`

Expected: FAIL because `src/shared/ingest.js` does not exist.

- [x] **Step 3: Implement helpers**

Create `src/shared/ingest.js` with `isLikelyHtmlDocument`, `getPastedHtml`, and `buildClaudeDeckPrompt`. Keep heuristics conservative: full documents, `section`, `article`, `.slide`, `.deck`, `[data-slide]`, `main`, `h1/h2`, or body-bearing HTML count; tiny formatting snippets do not.

- [x] **Step 4: Run tests and verify GREEN**

Run: `npm test -- test/ingest.test.js`

Expected: PASS.

## Task 2: Extra Slide Boundary Formats

**Files:**
- Modify: `src/shared/deckify.js`
- Modify: `test/deckify.test.js`

- [x] **Step 1: Write failing tests**

Add tests asserting that:

```js
assert.equal(detectBoundaryMode("<main><h1>A</h1><hr><h1>B</h1></main>", "section"), "horizontal-rule");
assert.equal(
  detectBoundaryMode("<main><h1>A</h1><!-- slide --><h1>B</h1></main>", "section"),
  "slide-comment",
);
```

Also assert that `extractSlides` returns two slides for each format and preserves the expected content.

- [x] **Step 2: Run targeted test and verify RED**

Run: `npm test -- test/deckify.test.js`

Expected: FAIL because the parser currently falls back to `headings` or `document`, not the new modes.

- [x] **Step 3: Implement parser support**

In `src/shared/deckify.js`, add fallback extraction after `article` and before headings:

- `<!-- slide -->` splits the body HTML into slide chunks.
- `<hr>` splits the body HTML into slide chunks.
- Empty chunks are ignored.
- Runtime HTML can be omitted for these split modes because the source has no reliable selector to target.

- [x] **Step 4: Run targeted test and verify GREEN**

Run: `npm test -- test/deckify.test.js`

Expected: PASS.

## Task 3: Clipboard IPC And Renderer Wiring

**Files:**
- Modify: `electron/main.cjs`
- Modify: `electron/preload.cjs`
- Modify: `electron/renderer/app.js`
- Modify: `electron/renderer/index.html`
- Modify: `electron/renderer/styles.css`
- Modify: `test/electron-security.test.js`

- [x] **Step 1: Write failing checks**

Add test assertions that the preload exposes `writeClipboardText`, the main process registers `clipboard:write-text`, and the renderer imports/uses `getPastedHtml` and `buildClaudeDeckPrompt`.

- [x] **Step 2: Run targeted test and verify RED**

Run: `npm test -- test/electron-security.test.js`

Expected: FAIL because clipboard API and renderer ingest helpers are not wired.

- [x] **Step 3: Implement IPC bridge**

Add Electron `clipboard` import in `electron/main.cjs`, register `ipcMain.handle("clipboard:write-text", ...)`, and expose `writeClipboardText(text)` in `electron/preload.cjs`.

- [x] **Step 4: Implement renderer behavior**

In `electron/renderer/app.js`:

- Import `getPastedHtml` and `buildClaudeDeckPrompt`.
- Add `window.addEventListener("paste", handlePaste)`.
- Ignore paste inside inputs, textareas, selects, and contenteditable elements.
- If clipboard contains likely HTML, prevent default and call `loadPayload({ html, sourceLabel: "Pasted HTML", sourceUrl: "" })`.
- Add `copyClaudePrompt()` that writes the prompt via preload IPC and falls back to `navigator.clipboard.writeText`.
- Add buttons in the empty state for `Open HTML`, source focus, and copy prompt.

- [x] **Step 5: Style the empty-state additions**

Update `electron/renderer/styles.css` so the empty state has a concise action cluster and does not crop at the current minimum app size.

- [x] **Step 6: Run targeted test and verify GREEN**

Run: `npm test -- test/electron-security.test.js`

Expected: PASS.

## Task 4: Full Verification

**Files:**
- No production file changes unless verification reveals a defect.

- [x] **Step 1: Run full tests**

Run: `npm test`

Expected: all tests pass.

- [x] **Step 2: Run package smoke build**

Run: `npm run pack`

Expected: exit 0. Local unsigned macOS signing warnings are acceptable.

- [x] **Step 3: Manual app smoke**

Run the Electron app from this worktree and verify:

- Empty state has Open HTML, Paste URL/focus, and Copy Claude prompt actions.
- Pasting raw HTML outside inputs loads it as `Pasted HTML`.
- Pasting ordinary text does not load a deck.
- `<hr>` and `<!-- slide -->` demo HTML split into multiple slides.
- Ely-HII-Demo still has animations/dots after loading.

## Self-Review

- Spec coverage: This plan covers paste-to-present, copy Claude prompt, `<hr>`/`<!-- slide -->`, empty-state action polish, and preserves runtime/deck behavior.
- Placeholder scan: no TODO/TBD placeholders.
- Type consistency: helper names are `isLikelyHtmlDocument`, `getPastedHtml`, and `buildClaudeDeckPrompt`; renderer uses those exact names.
