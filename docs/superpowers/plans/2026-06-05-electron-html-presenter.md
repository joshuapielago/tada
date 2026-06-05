# tada Electron HTML Presenter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a macOS-first Electron desktop app that opens local HTML files and presents them as slide decks with fullscreen, thumbnails, presenter view, and generated-deck detection.

**Architecture:** Keep Electron responsibilities split cleanly: `electron/main.cjs` owns windows, menus, fullscreen, and file reads; `electron/preload.cjs` exposes a narrow IPC bridge; renderer files own UI and presentation state; shared ESM helpers parse HTML into slide documents and can be tested with Node. The app should not depend on a localhost server for normal desktop use.

**Tech Stack:** Electron, Node.js ESM tests, vanilla HTML/CSS/JavaScript renderer, iframe `srcdoc`, native macOS file picker through Electron dialog IPC.

---

## File Structure

- Modify `package.json`: add Electron dependency and scripts: `electron`, `electron:dev`, and keep `test`.
- Create `electron/main.cjs`: Electron app lifecycle, BrowserWindow creation, macOS menu, open-file dialog, fullscreen IPC, local HTML file reads.
- Create `electron/preload.cjs`: safe bridge exposing `openFile`, `toggleFullscreen`, and `onFileOpened`.
- Create `electron/renderer/index.html`: desktop app shell.
- Create `electron/renderer/styles.css`: macOS-first presenter styling with stage, controls, thumbnail panel, and presenter panel.
- Create `electron/renderer/app.js`: renderer state, IPC wiring, drag/drop, slide navigation, side-panel toggles, iframe rendering.
- Create `src/shared/deckify.js`: shared pure helpers for URL/path normalization, deck detection, slide extraction, notes extraction, slide-document building, and key navigation mapping.
- Modify `public/deckify.js`: re-export shared helpers so the existing localhost prototype tests and UI can continue working.
- Modify `public/app.js`: call shared slide extraction helpers instead of local parsing so the current web viewer also benefits from the generated-deck fix.
- Create `test/fixtures/generated-active-deck.html`: regression fixture for `.deck .slide.active` generated decks.
- Modify `test/deckify.test.js`: cover deck detection, existing-deck extraction, visibility normalization, notes extraction, generated-page fallback, and keyboard mapping.
- Modify `test/server.test.js`: keep local-file source tests working with shared helpers.

## Tasks

### Task 1: Shared Deck Parser

**Files:**
- Create: `src/shared/deckify.js`
- Modify: `public/deckify.js`
- Modify: `test/deckify.test.js`
- Create: `test/fixtures/generated-active-deck.html`

- [x] **Step 1: Write failing tests**

Add tests that import from `../src/shared/deckify.js` and assert:

```js
assert.equal(analyzeDeckHtml(generatedDeckHtml).mode, "existing-deck");
assert.equal(extractSlides(generatedDeckHtml, { selector: "section", sourceUrl: fixtureUrl }).slides.length, 3);
assert.match(result.slides[1].html, /class="slide active deckify-visible"/);
assert.match(result.slides[1].html, /Second generated slide/);
assert.equal(result.slides[1].notes, "Second note");
assert.equal(getKeyNavigationIntent("Enter"), "next");
assert.equal(getKeyNavigationIntent("Backspace"), "previous");
```

Run: `npm test`
Expected: fail because `src/shared/deckify.js` and generated-deck extraction do not exist.

- [x] **Step 2: Implement shared parser**

Create `src/shared/deckify.js` with:

```js
export function analyzeDeckHtml(html) { /* detects existing-deck, generated-page, fallback */ }
export function extractSlides(html, options = {}) { /* returns { mode, slides } */ }
export function buildSlideDocument({ headHtml, bodyAttributes, content, sourceUrl }) { /* iframe doc */ }
export function getKeyNavigationIntent(key) { /* PPT-like key mapping */ }
export function normalizeSourceUrl(rawUrl) { /* existing URL/path behavior */ }
export function normalizeSelector(selector) { return trimmed || "section"; }
export function injectBaseElement(html, sourceUrl) { /* existing base injection behavior */ }
```

Existing deck mode must:

- Prefer `.deck .slide`, `.reveal .slides > section`, `.remark-slide`, `.swiper-slide`, `[data-slide]`, then `.slide`.
- Extract notes from `data-notes`.
- Add `active deckify-visible` to each extracted slide.
- Inject CSS that forces `.deckify-visible` and its descendants to render visibly when isolated.
- Drop original external navigation UI by rendering only the extracted slide element.
- Avoid copying original `<script>` tags into the slide document.

- [x] **Step 3: Re-export shared helpers**

Replace `public/deckify.js` with re-exports from `../src/shared/deckify.js` so existing tests and the localhost prototype use the same parser.

- [x] **Step 4: Verify parser tests**

Run: `npm test`
Expected: parser and existing source tests pass.

### Task 2: Current Web Viewer Uses The Parser

**Files:**
- Modify: `public/app.js`

- [x] **Step 1: Replace local parsing**

Remove local `parseSlides`, heading grouping, and slide document construction from `public/app.js`. Use:

```js
const parsed = extractSlides(html, {
  selector: normalizeSelector(elements.selectorInput.value),
  sourceUrl,
});
```

Then render `parsed.slides[index].html` and display `parsed.mode`.

- [x] **Step 2: Keep web viewer behavior intact**

Retain URL loading, file loading, fit modes, keyboard navigation, side rail controls, and fullscreen controls.

- [x] **Step 3: Verify web parser integration**

Run: `npm test`
Expected: all tests pass.

Run: `node --check public/app.js`
Expected: exit code 0.

### Task 3: Electron Shell

**Files:**
- Modify: `package.json`
- Create: `electron/main.cjs`
- Create: `electron/preload.cjs`

- [x] **Step 1: Add Electron dependency and scripts**

Update scripts:

```json
{
  "electron": "electron .",
  "electron:dev": "electron .",
  "test": "node --test test/*.test.js"
}
```

Set `"main": "electron/main.cjs"` and add Electron as a dev dependency.

- [x] **Step 2: Implement Electron main process**

`electron/main.cjs` must:

- create a `BrowserWindow` with preload script
- load `electron/renderer/index.html`
- expose `dialog:open-file`
- expose `app:toggle-fullscreen`
- read selected HTML files with `fs.promises.readFile`
- send file payloads to renderer for macOS open-file events
- keep a macOS app menu with Open, Toggle Full Screen, and Quit

- [x] **Step 3: Implement preload bridge**

`electron/preload.cjs` must expose:

```js
window.htmlPresenter.openFile()
window.htmlPresenter.toggleFullscreen()
window.htmlPresenter.onFileOpened(callback)
```

No direct Node APIs should be exposed to the renderer.

- [x] **Step 4: Verify shell syntax**

Run: `node --check electron/main.cjs`
Run: `node --check electron/preload.cjs`
Expected: both exit code 0.

### Task 4: Electron Renderer

**Files:**
- Create: `electron/renderer/index.html`
- Create: `electron/renderer/styles.css`
- Create: `electron/renderer/app.js`

- [x] **Step 1: Build renderer shell**

Create an app surface with:

- top toolbar with Open, side-panel toggle, fullscreen
- left side panel with Thumbnail and Presenter tabs
- central presentation stage
- bottom controls with previous, slide count, next, fit mode
- empty state drop zone

- [x] **Step 2: Implement renderer behavior**

`electron/renderer/app.js` must:

- call `window.htmlPresenter.openFile()`
- support drag/drop HTML files
- call `extractSlides`
- render current slide iframe
- render thumbnail buttons for all slides
- render presenter mode with current slide title, next slide title, notes, and elapsed time
- support keyboard/clicker controls from `getKeyNavigationIntent`
- call `window.htmlPresenter.toggleFullscreen()`

- [x] **Step 3: Verify renderer syntax**

Run: `node --check electron/renderer/app.js`
Expected: exit code 0.

### Task 5: Verification

**Files:**
- No new files unless a verification fixture is needed.

- [x] **Step 1: Run automated checks**

Run:

```bash
npm test
node --check server.js
node --check public/app.js
node --check public/deckify.js
node --check src/shared/deckify.js
node --check electron/main.cjs
node --check electron/preload.cjs
node --check electron/renderer/app.js
```

Expected: all exit code 0.

- [x] **Step 2: Launch Electron**

Run: `npm run electron`
Expected: desktop window opens.

- [x] **Step 3: Manual generated-deck verification**

Open `test/fixtures/generated-active-deck.html`.

Expected:

- mode shows existing deck
- slide count is 3
- each slide renders its own content
- next/previous keyboard controls work
- thumbnail panel jumps between slides
- presenter panel shows notes
- fullscreen command works

- [x] **Step 4: Manual previous failure verification**

Open the previously failing `Ely-HII-Demo-Deck.html` if present.

Expected:

- mode shows existing deck
- slide count is 10
- slide 2 and later render their own content, not the first slide
- original deck navigation script does not control our shell

## Self-Review

Spec coverage: this plan covers the Electron architecture, macOS-first local file flow, both side-panel modes, fullscreen, generated deck detection, the `.deck .slide.active` issue, no-save behavior, and testing.

Placeholder scan: no placeholders remain.

Type consistency: the plan consistently uses `extractSlides`, `analyzeDeckHtml`, `buildSlideDocument`, and `getKeyNavigationIntent`.
