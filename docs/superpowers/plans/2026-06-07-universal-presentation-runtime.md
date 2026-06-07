# Universal Presentation Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real presenter runtime plus first-pass PowerPoint, Google Slides, and website-to-deck ingestion to TaDa!.

**Architecture:** Add focused shared modules for source classification, deck sessions, image-slide rendering, Google Slides URL handling, PowerPoint conversion detection, and website section scoring. The Electron main process owns privileged loading, conversion, capture, and audience-window lifecycle; the renderer navigates normalized deck sessions only.

**Tech Stack:** Electron main/preload/renderer, vanilla ES modules, CommonJS main-process helpers, Node test runner, Chrome DevTools Protocol smoke tests.

---

### Task 1: Source Classifier And Deck Session Shape

**Files:**
- Create: `src/shared/source-classifier.js`
- Create: `src/shared/deck-session.js`
- Test: `test/source-classifier.test.js`
- Test: `test/deck-session.test.js`

- [ ] **Step 1: Write failing classifier tests**

Create tests that assert `.html`, `.pptx`, `.ppt`, Google Slides URLs, ordinary remote websites, localhost URLs, file URLs, local paths, and pasted HTML are classified with `kind`, `inputType`, and normalized source metadata.

Run: `node --test test/source-classifier.test.js`
Expected: FAIL because `src/shared/source-classifier.js` does not exist.

- [ ] **Step 2: Implement classifier**

Create `classifySourceInput(value, options)` and `classifyFilePath(filePath)`. Return one of `html`, `powerpoint`, `google-slides`, `website`, or `unknown`. Keep local path and URL normalization deterministic.

- [ ] **Step 3: Write failing deck session tests**

Create tests for `createHtmlDeckSession`, `createImageDeckSession`, and `createRemotePresentSession`. Assert session ids, `sourceType`, `renderMode`, slide count, image slide documents, and notes defaults.

Run: `node --test test/deck-session.test.js`
Expected: FAIL because `src/shared/deck-session.js` does not exist.

- [ ] **Step 4: Implement session helpers**

Create helpers that convert existing HTML extraction results and image URLs into a consistent `DeckSession` object. Keep helpers pure and renderer-safe.

- [ ] **Step 5: Verify task**

Run: `node --test test/source-classifier.test.js test/deck-session.test.js`
Expected: PASS.

### Task 2: Real Audience Window Presenter Service

**Files:**
- Create: `electron/audience.html`
- Create: `electron/audience.js`
- Create: `electron/presenter-service.cjs`
- Modify: `electron/main.cjs`
- Modify: `electron/preload.cjs`
- Modify: `electron/renderer/app.js`
- Test: `test/presenter-service.test.cjs`
- Test: `test/electron-security.test.js`

- [ ] **Step 1: Write failing presenter-service tests**

Use fake Electron window factories to assert `startPresentation` opens an audience window, loads the audience file, sends session data after ready, forwards index changes, and closes cleanly on stop.

Run: `node --test test/presenter-service.test.cjs`
Expected: FAIL because `electron/presenter-service.cjs` does not exist.

- [ ] **Step 2: Implement presenter service**

Create a CommonJS service that owns one audience window at a time, accepts session snapshots, sends `presentation:load`, `presentation:set-index`, and `presentation:stop` IPC messages, and falls back to the primary display when no external display exists.

- [ ] **Step 3: Add audience renderer**

Create a minimal audience page that renders only the active slide, supports image/html/remote-present slides, has no toolbar, and emits next/previous/exit intents.

- [ ] **Step 4: Wire IPC**

Expose `startPresentation`, `stopPresentation`, and `setPresentationIndex` in preload. Add main handlers and renderer calls so the Present button starts the audience window rather than toggling only the main window.

- [ ] **Step 5: Verify task**

Run: `node --test test/presenter-service.test.cjs test/electron-security.test.js`
Expected: PASS.

### Task 3: PowerPoint Adapter

**Files:**
- Create: `src/shared/powerpoint-adapter.cjs`
- Modify: `electron/main.cjs`
- Modify: `electron/renderer/app.js`
- Modify: `package.json`
- Test: `test/powerpoint-adapter.test.cjs`
- Test: `test/production-config.test.js`

- [ ] **Step 1: Write failing PowerPoint adapter tests**

Assert `.pptx` and `.ppt` are accepted, converter discovery checks `TADA_SOFFICE_PATH`, and missing converters return a structured failure with an external-open fallback.

Run: `node --test test/powerpoint-adapter.test.cjs`
Expected: FAIL because `src/shared/powerpoint-adapter.cjs` does not exist.

- [ ] **Step 2: Implement converter detection and failure path**

Implement converter discovery without installing a new dependency. Return image slide sessions when a converter succeeds and a clear error object when it cannot.

- [ ] **Step 3: Expand file support**

Update file picker filters, drag-and-drop loading, command-line loading, and package file associations to include `.pptx` and `.ppt`.

- [ ] **Step 4: Verify task**

Run: `node --test test/powerpoint-adapter.test.cjs test/production-config.test.js`
Expected: PASS.

### Task 4: Google Slides Adapter

**Files:**
- Create: `src/shared/google-slides.js`
- Modify: `electron/main.cjs`
- Modify: `electron/renderer/app.js`
- Test: `test/google-slides.test.js`

- [ ] **Step 1: Write failing Google Slides tests**

Assert edit/share/present/pub URLs normalize to presentation ids, public export URLs can be generated, and private/non-exportable fallback creates a remote-present session.

Run: `node --test test/google-slides.test.js`
Expected: FAIL because `src/shared/google-slides.js` does not exist.

- [ ] **Step 2: Implement URL normalization**

Create helpers for `isGoogleSlidesUrl`, `normalizeGoogleSlidesUrl`, `buildGoogleSlidesPresentUrl`, and `buildGoogleSlidesExportUrl`.

- [ ] **Step 3: Wire source loading**

When source classification returns `google-slides`, main process attempts an exportable path with bounded timeout and falls back to official present mode.

- [ ] **Step 4: Verify task**

Run: `node --test test/google-slides.test.js`
Expected: PASS.

### Task 5: Website-To-Deck Capture

**Files:**
- Create: `src/shared/website-sectioner.js`
- Modify: `electron/main.cjs`
- Modify: `electron/preload.cjs`
- Modify: `electron/renderer/app.js`
- Test: `test/website-sectioner.test.js`

- [ ] **Step 1: Write failing sectioner tests**

Assert semantic sections, headings, large blocks, and fallback viewport chunks produce stable capture plans while cookie banners and sticky widgets are ignored.

Run: `node --test test/website-sectioner.test.js`
Expected: FAIL because `src/shared/website-sectioner.js` does not exist.

- [ ] **Step 2: Implement pure section scoring**

Create DOM-friendly scoring helpers that can be tested in Node with fixture-like objects and run in a page context in Electron.

- [ ] **Step 3: Implement hidden-page capture**

Use a hidden Electron `BrowserWindow` to load a website, run the sectioner script, capture section rectangles, create image-backed slides, then close the hidden window.

- [ ] **Step 4: Verify task**

Run: `node --test test/website-sectioner.test.js`
Expected: PASS.

### Task 6: Renderer UI And Regression Coverage

**Files:**
- Modify: `electron/renderer/index.html`
- Modify: `electron/renderer/styles.css`
- Modify: `electron/renderer/app.js`
- Modify: `test/electron-smoke.test.js`
- Test: `test/performance-contract.test.js`

- [ ] **Step 1: Write failing smoke assertions**

Extend smoke tests to assert present mode uses an audience page, toolbar chrome is absent from the audience page, and index updates stay synced.

Run: `node --test test/electron-smoke.test.js`
Expected: FAIL until presenter IPC is wired.

- [ ] **Step 2: Update UI copy and progress states**

Update empty state chips to include HTML, PowerPoint, Google Slides, and websites. Add source type labels and loading-progress copy for conversion/capture states.

- [ ] **Step 3: Keep performance constraints**

Preserve incremental thumbnail rendering and avoid rebuilding thumbnails on slide navigation.

- [ ] **Step 4: Verify task**

Run: `node --test test/electron-smoke.test.js test/performance-contract.test.js`
Expected: PASS.

### Task 7: Full Verification And Packaging

**Files:**
- Modify: only files named by a failing test, packager error, or runtime smoke failure observed during this task.

- [ ] **Step 1: Run full tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 2: Run package build**

Run: `npm run pack`
Expected: PASS or a documented external signing warning only.

- [ ] **Step 3: Commit implementation**

Run:

```bash
git status --short
git add .
git commit -m "Add universal presentation runtime"
```

Expected: one focused implementation commit after the previous design commit.
