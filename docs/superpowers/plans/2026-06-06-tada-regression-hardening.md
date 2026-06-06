# TaDa Regression Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove TaDa! handles a broad set of generated and client HTML deck shapes without parser misclassification, stale-stage navigation, or desktop hangs.

**Architecture:** Add reusable synthetic deck fixtures, expand parser/runtime matrix tests, and add a real Electron smoke/load harness that launches the desktop app with generated HTML files and inspects the renderer plus slide iframe through Chrome DevTools Protocol.

**Tech Stack:** Electron, Node test runner, vanilla ESM shared parser, CDP over WebSocket, temporary local HTML fixtures.

---

## File Structure

- `test/deck-fixtures.js`: create representative HTML deck strings for section decks, generated runtimes, Reveal/Remark/Swiper-like decks, fallback boundary decks, and large load decks.
- `test/deck-matrix.test.js`: assert parser mode, slide counts, runtime selection, notes extraction, and large-deck parse timing across fixture variants.
- `test/electron-smoke.test.js`: launch Electron with temp fixtures, inspect the desktop renderer over CDP, navigate slides, and verify the visible stage follows the active slide.
- `src/shared/deckify.js`: only modify if the new failing tests expose parser/runtime bugs.

## Task 1: Deck Fixture Factory

- [ ] **Step 1: Create `test/deck-fixtures.js`**

Export functions with deterministic HTML strings:

```js
export function sectionDeck({ count = 3, includeScripts = true } = {}) { /* complete HTML with <section> slides */ }
export function existingActiveDeck() { /* .deck + .slide.active + inline script */ }
export function revealDeck() { /* .reveal .slides > section */ }
export function remarkDeck() { /* .remark-slide divs */ }
export function swiperDeck() { /* .swiper-slide divs */ }
export function dataSlideDeck() { /* real [data-slide] nodes with data-notes */ }
export function markerCopyDeck() { /* code/copy mentions data-slide and .deck but uses normal sections */ }
export function headingDeck() { /* h1/h2 fallback */ }
export function commentDeck() { /* <!-- slide --> fallback */ }
export function horizontalRuleDeck() { /* <hr> fallback */ }
```

- [ ] **Step 2: Keep fixtures self-contained**

All fixtures must be complete HTML documents with inline CSS/scripts only, no network or external files.

## Task 2: Parser And Runtime Matrix

- [ ] **Step 1: Write failing matrix tests in `test/deck-matrix.test.js`**

Cover:

- Section decks parse as selector mode and runtime hides inactive sections.
- Existing generated decks parse as existing-deck mode and preserve native runtime behavior.
- Reveal, Remark, Swiper, and real `[data-slide]` decks are recognized as existing decks.
- Marker names in copy/code do not trigger existing-deck mode.
- Heading, comment, horizontal-rule, and article fallback modes split into expected slides.
- Large section decks parse within a bounded time and produce the requested slide count.

- [ ] **Step 2: Run targeted RED**

Run:

```bash
npm test -- test/deck-matrix.test.js
```

Expected: failures identify any missing fixture export or current parser gap.

- [ ] **Step 3: Fix parser/runtime bugs only when exposed**

Make minimal changes in `src/shared/deckify.js`; do not change UI styling in this task.

- [ ] **Step 4: Run targeted GREEN**

Run:

```bash
npm test -- test/deck-matrix.test.js
```

Expected: all matrix cases pass.

## Task 3: Desktop Smoke And Load Harness

- [ ] **Step 1: Write `test/electron-smoke.test.js`**

Launch source-mode Electron with:

```bash
node_modules/.bin/electron . --remote-debugging-port=<free-port> --user-data-dir=<tmp-profile> <temp-deck.html>
```

Use CDP to assert:

- Renderer loads a deck source label.
- `#slidePosition` and `#modeLabel` match expected mode/count.
- Thumbnail count equals slide count.
- Clicking a later thumbnail changes both app state and visible slide iframe content.
- Large deck with at least 80 slides reaches the last slide without renderer errors or stale stage content.

- [ ] **Step 2: Run targeted RED/GREEN loop**

Run:

```bash
npm test -- test/electron-smoke.test.js
```

Expected: tests pass after any minimal product fixes discovered by the smoke harness.

## Task 4: Full Verification And Build

- [ ] **Step 1: Run full test suite**

Run:

```bash
npm test
```

Expected: 0 failures.

- [ ] **Step 2: Run package build**

Run:

```bash
npm run pack
```

Expected: exit 0; unsigned mac ARM warnings are acceptable for this local build.

- [ ] **Step 3: Re-open the rebuilt app with a representative deck**

Open:

```bash
open -n dist/mac-arm64/TaDa!.app --args docs/tada-product-presentation.html
```

Expected: deck loads, slide navigation changes both thumbnail state and visible stage.
