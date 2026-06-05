# tada Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a localhost presentation-mode viewer for existing HTML files, local paths, and URLs.

**Architecture:** Use a dependency-free Node server for static files and URL fetching, with a vanilla browser client for parsing, splitting, and rendering slides in iframes. Keep all state in memory and avoid any save/export path.

**Tech Stack:** Node.js ESM, Node built-in `node:test`, vanilla HTML/CSS/JavaScript, browser `DOMParser`, iframe `srcdoc`.

---

## File Structure

- `package.json`: scripts for test and localhost server.
- `server.js`: static file server, `/api/fetch` source endpoint, and local asset route.
- `public/index.html`: app shell.
- `public/styles.css`: presentation shell styling.
- `public/deckify.js`: pure helper functions shared by the browser and Node tests.
- `public/app.js`: browser UI, file/url loading, parsing, navigation, rendering.
- `test/deckify.test.js`: Node tests for helper behavior.
- `test/fixtures/sample-deck.html`: sample presentation input for manual/browser checks.

## Tasks

### Task 1: Helper Tests

- [ ] Write tests in `test/deckify.test.js` for valid URL normalization, rejected URL schemes, default selector behavior, heading fallback detection, and fetched HTML base injection.
- [ ] Run `node --test test/deckify.test.js` and confirm it fails because `public/deckify.js` does not exist yet.
- [ ] Create `public/deckify.js` with minimal helper implementations.
- [ ] Re-run `node --test test/deckify.test.js` and confirm the tests pass.

### Task 2: Localhost Server

- [ ] Create `package.json` with `start` and `test` scripts.
- [ ] Create `server.js` to serve `public/`, serve shared files, and implement `/api/fetch?url=...`.
- [ ] Run `npm test` and confirm helper tests still pass.
- [ ] Start `npm run start -- --port 4173` and confirm the server prints a localhost URL.

### Task 3: Viewer Interface

- [ ] Create `public/index.html` with source controls, stage, and presentation controls.
- [ ] Create `public/styles.css` with responsive, restrained presentation UI.
- [ ] Create `public/app.js` to handle file upload, URL loading, selector selection, slide parsing, iframe rendering, keyboard navigation, and fullscreen.
- [ ] Add PowerPoint-like previous/next controls through stage rails and common clicker keyboard mappings.
- [ ] Add `test/fixtures/sample-deck.html` for visual checks.
- [ ] Run `npm test` and confirm helper tests pass.

### Task 4: Browser Verification

- [ ] Open `http://localhost:4173` in the in-app browser.
- [ ] Load the sample fixture through the URL field using `http://localhost:4173/test/fixtures/sample-deck.html`.
- [ ] Confirm the viewer shows multiple slides, next/previous controls work, and keyboard arrows navigate.
- [ ] Check a narrow viewport for no horizontal overflow or broken controls.
