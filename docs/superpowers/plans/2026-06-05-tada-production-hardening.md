# TaDa! Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make TaDa! installable and supportable for macOS and Windows teams, with update checks, safer Electron defaults, and repeatable release instructions.

**Architecture:** Use `electron-builder` for distributable macOS/Windows artifacts and `electron-updater` for update checks. Keep the app's privileged operations in the main process/preload bridge, expose only narrow IPC APIs to the renderer, and keep untrusted presentation HTML inside sandboxed iframes.

**Tech Stack:** Electron, electron-builder, electron-updater, Node test runner, plain HTML/CSS/JS.

---

### Task 1: Baseline And Build Configuration

**Files:**
- Modify: `package.json`
- Test: `test/production-config.test.js`
- Create: `build/entitlements.mac.plist`

- [ ] **Step 1: Write failing config tests**

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));

describe("production package configuration", () => {
  it("declares installable macOS and Windows build targets", () => {
    assert.equal(packageJson.name, "tada");
    assert.equal(packageJson.productName, "TaDa!");
    assert.ok(packageJson.build.appId);
    assert.deepEqual(packageJson.build.mac.target, ["dmg", "zip"]);
    assert.deepEqual(packageJson.build.win.target, ["nsis"]);
  });

  it("declares explicit publish metadata for auto updates", () => {
    assert.equal(packageJson.build.publish.provider, "github");
    assert.equal(packageJson.build.publish.owner, "CHANGE_ME_OWNER");
    assert.equal(packageJson.build.publish.repo, "CHANGE_ME_REPO");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/production-config.test.js`
Expected: FAIL because production build metadata is not yet present.

- [ ] **Step 3: Add dependencies, scripts, and build config**

Add `electron-builder` and `electron-updater`, plus scripts for `pack`, `dist`, `dist:mac`, `dist:win`, and `release`. Configure `appId`, artifact names, ASAR, macOS `dmg`+`zip`, Windows `nsis`, publish provider, and app file associations for `.html`/`.htm`.

- [ ] **Step 4: Run config tests**

Run: `npm test -- test/production-config.test.js`
Expected: PASS.

### Task 2: Update Service And IPC Bridge

**Files:**
- Create: `electron/updater.cjs`
- Modify: `electron/main.cjs`
- Modify: `electron/preload.cjs`
- Test: `test/updater.test.cjs`

- [ ] **Step 1: Write failing updater tests**

Test a factory function that exposes status, blocks checks while busy, forwards lifecycle events, and degrades clearly when running unpackaged.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/updater.test.cjs`
Expected: FAIL because `electron/updater.cjs` does not exist.

- [ ] **Step 3: Implement update service**

Create a main-process update service around `electron-updater` that supports:
- `updates:get-status`
- `updates:check`
- `updates:install`
- renderer broadcasts for `checking`, `available`, `not-available`, `downloading`, `downloaded`, and `error`
- safe disabled status when not packaged or when `electron-updater` cannot load

- [ ] **Step 4: Run updater tests**

Run: `node --test test/updater.test.cjs`
Expected: PASS.

### Task 3: Renderer Update UI

**Files:**
- Modify: `electron/renderer/index.html`
- Modify: `electron/renderer/app.js`
- Modify: `electron/renderer/styles.css`

- [ ] **Step 1: Add an Update button and status label**

Add a compact `Update` button in the toolbar and a status line in the presenter panel.

- [ ] **Step 2: Wire renderer update actions**

Use the preload bridge to get initial status, check for updates, react to update status events, and switch the button from `Update` to `Install` after an update downloads.

- [ ] **Step 3: Keep UI resilient**

Disable update actions while checking/downloading and show clear text when updates are unavailable in development builds.

### Task 4: Electron Security Hardening

**Files:**
- Modify: `electron/main.cjs`
- Modify: `electron/renderer/index.html`
- Test: `test/electron-security.test.js`

- [ ] **Step 1: Write failing security tests**

Assert that the renderer HTML has a CSP and that `electron/main.cjs` limits navigation, window creation, permissions, and webview attachment.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/electron-security.test.js`
Expected: FAIL before the guards exist.

- [ ] **Step 3: Add main-process guards**

Add `web-contents-created` handlers to prevent unexpected app navigation, deny untrusted popup windows, deny permissions by default, and prevent webviews from attaching.

- [ ] **Step 4: Add renderer CSP**

Add a CSP meta tag that allows the local app shell to run while preserving the sandboxed presentation iframe behavior.

- [ ] **Step 5: Run security tests**

Run: `npm test -- test/electron-security.test.js`
Expected: PASS.

### Task 5: Release Documentation

**Files:**
- Create: `README.md`
- Create: `docs/release.md`

- [ ] **Step 1: Document installation and release flow**

Document local development, macOS/Windows build commands, update provider setup, signing requirements, and team rollout steps.

- [ ] **Step 2: Document unresolved production prerequisites**

Call out that real production auto-update requires a release host plus signing/notarization credentials.

### Task 6: Verification

**Files:**
- No new files

- [ ] **Step 1: Run syntax checks**

Run:
```bash
node --check electron/main.cjs
node --check electron/preload.cjs
node --check electron/updater.cjs
node --check electron/renderer/app.js
node --check src/shared/deckify.js
node --check src/shared/local-scripts.cjs
```

- [ ] **Step 2: Run full tests**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 3: Validate packaging metadata**

Run: `npx electron-builder --dir --mac --publish never`
Expected: packaged app directory is produced without publishing.

- [ ] **Step 4: Smoke launch Electron**

Run: `npm run electron:dev`
Expected: app opens, loads a local HTML file, and update UI reports development/unpackaged status.
