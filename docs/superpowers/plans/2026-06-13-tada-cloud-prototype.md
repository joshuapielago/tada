# Tada Cloud Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local, PR-ready Tada Cloud prototype that can upload HTML decks through the web UI, CLI, raw API, and MCP, then share them through hosted `/d/:id` URLs.

**Architecture:** Add a small local Published Deck service backed by filesystem storage under `.tada-cloud/`, wire it into the existing Node HTTP server, and keep the existing desktop/presenter code intact. The prototype uses the same contracts across upload UI, CLI, API, and MCP so product feedback happens against the intended shape.

**Tech Stack:** Node.js HTTP server, node:test, existing shared `deckify.js`, `@modelcontextprotocol/sdk` Streamable HTTP transport, Zod.

---

### Task 1: Local Published Deck Store And Upload Contract

**Files:**
- Create: `src/cloud/deck-store.js`
- Test: `test/cloud-store.test.js`

- [ ] Write failing tests for creating a Published Deck from raw HTML, rejecting missing Upload Certification, preserving remote-asset warnings, and serving stored files by safe normalized path.
- [ ] Implement `createDeckStore({ storageRoot, publicBaseUrl })` with `createDeck`, `getDeck`, `readDeckFile`, `getManifest`, `getStats`, and report recording.
- [ ] Store each deck as `storageRoot/decks/<id>/index.html` plus `manifest.json`; keep metadata in memory loaded from manifests at startup.
- [ ] Add warning and notice detection for `remote-assets`, `deck-runtime`, `source-visible`, and `anonymous-ownerless`.
- [ ] Run `node --test test/cloud-store.test.js` and then the full suite.

### Task 2: Upload API, Viewer Routes, And Admin Stats

**Files:**
- Modify: `server.js`
- Create: `public/cloud-viewer.html`
- Create: `public/cloud-viewer.js`
- Create: `public/upload.html`
- Create: `public/upload.js`
- Create: `public/admin.html`
- Create: `public/admin.js`
- Test: `test/cloud-api.test.js`

- [ ] Write failing API tests for `POST /api/decks`, `GET /api/decks/:id`, `GET /api/decks/:id/files/index.html`, `GET /d/:id`, and `GET /api/admin/stats`.
- [ ] Add JSON body parsing, typed JSON error envelopes, and cloud routes while preserving the existing local presenter endpoints.
- [ ] Make `/` and `/upload` serve the upload UI; keep the existing local presenter accessible at `/presenter`.
- [ ] Build the upload UI around paste HTML, one `.html` file, and public URL upload.
- [ ] Build the share viewer around `Deck Metadata`, stored `index.html`, the shared Deck Engine, contain-fit display, Original Mode fallback, and a report link outside presentation mode.
- [ ] Build a read-only admin page showing counts, recent decks, warning counts, thumbnail status, and reports.
- [ ] Run `node --test test/cloud-api.test.js` and then the full suite.

### Task 3: CLI Upload Path

**Files:**
- Create: `bin/tada.js`
- Modify: `package.json`
- Test: `test/cli-cloud.test.js`

- [ ] Write failing CLI tests for uploading raw HTML from a file to a running local server and printing the Share URL as the final stdout line.
- [ ] Implement `tada upload <path-or-url> [--api-url] [--title] [--json]` for HTML files and URLs.
- [ ] For file uploads, package referenced same-root assets into a JSON `files` payload so local images/CSS work in the share viewer.
- [ ] Print human warnings/notices to stderr and keep stdout script-readable.
- [ ] Run `node --test test/cli-cloud.test.js` and then the full suite.

### Task 4: Server-Side MCP Endpoint

**Files:**
- Create: `src/cloud/mcp-server.js`
- Modify: `server.js`
- Modify: `package.json`
- Test: `test/mcp-cloud.test.js`

- [ ] Install `@modelcontextprotocol/sdk` and `zod`.
- [ ] Write failing tests that initialize the Streamable HTTP MCP endpoint, list tools, and call `upload_html_deck`.
- [ ] Register `upload_html_deck`, `upload_html_url`, and `upload_html_file` tools against the same deck store and response contract as the API.
- [ ] Mount a stateless `/mcp` endpoint using the official MCP SDK Streamable HTTP transport.
- [ ] Run `node --test test/mcp-cloud.test.js` and then the full suite.

### Task 5: Local QA And PR

**Files:**
- Modify docs only if implementation exposes a changed local command or route.

- [ ] Run `npm test`.
- [ ] Start the server locally and verify web upload, `/d/:id` viewing, `/admin`, CLI upload, and MCP upload.
- [ ] Use the in-app browser to inspect the upload UI and a shared deck URL.
- [ ] Commit only the prototype files and relevant spec/context changes.
- [ ] Push the branch and open a draft PR.

### Self-Review

- Spec coverage: Covers web upload, raw API, CLI, server-side MCP, share URL, viewer, admin stats, warnings/notices, and ownerless anonymous behavior.
- Explicit non-goals for this PR: Cloudflare deployment, OAuth, real thumbnail screenshots, deletion, public moderation actioning, and durable production database migration.
- Risk: The prototype uses local filesystem storage so users can play immediately; the Cloudflare R2/D1 move remains the next implementation slice.
