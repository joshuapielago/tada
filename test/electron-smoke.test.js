import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import electronPath from "electron";

import {
  bundledStandaloneDeck,
  existingActiveDeck,
  horizontalRuleDeck,
  sectionDeck,
} from "./deck-fixtures.js";

const repoRoot = process.cwd();
const waitTimeoutMs = process.env.CI ? 60000 : 12000;
const mediumTestTimeoutMs = process.env.CI ? 60000 : 45000;
const heavyTestTimeoutMs = process.env.CI ? 150000 : 45000;

describe("Electron desktop smoke and load coverage", () => {
  it("loads a section deck and keeps the visible stage in sync with thumbnail navigation", async () => {
    const app = await launchTadaWithDeck(sectionDeck({ count: 6 }), "section-smoke.html");

    try {
      const page = await connectToRenderer(app.port);
      assert.deepEqual(await readPageState(page), {
        source: "section-smoke.html",
        position: "1 / 6",
        mode: "section",
        thumbnails: 6,
        activeThumb: "0",
      });

      assert.match((await readFrameState(app.port)).bodyText, /Section slide 1/);

      await clickThumbnail(page, 4);
      await waitFor(async () => (await readPageState(page)).position === "5 / 6");
      const frameState = await waitForFrameState(app.port, (state) => isOnlyVisibleSlide(state, 4, /Section slide 5/));

      assert.equal(frameState.visibleIndexes.length, 1);
      assert.equal(frameState.visibleIndexes[0], 4);
      assert.match(frameState.bodyText, /Section slide 5/);
      assert.doesNotMatch(frameState.bodyText, /Section slide 1/);
      await page.close();
    } finally {
      await app.close();
    }
  }, { timeout: 30000 });

  it("loads an existing generated deck without losing its runtime script", async () => {
    const app = await launchTadaWithDeck(existingActiveDeck(), "generated-runtime.html");

    try {
      const page = await connectToRenderer(app.port);
      assert.deepEqual(await readPageState(page), {
        source: "generated-runtime.html",
        position: "1 / 3",
        mode: "existing-deck",
        thumbnails: 3,
        activeThumb: "0",
      });

      let frameState = await readFrameState(app.port);
      assert.equal(frameState.generatedBooted, true);

      await clickThumbnail(page, 2);
      await waitFor(async () => (await readPageState(page)).position === "3 / 3");
      frameState = await waitForFrameState(app.port, (state) => isOnlyVisibleSlide(state, 2, /Generated three/));

      assert.equal(frameState.generatedBooted, true);
      assert.match(frameState.bodyText, /Generated three/);
      await page.close();
    } finally {
      await app.close();
    }
  }, { timeout: 30000 });

  it("loads a bundled standalone deck as first-class slides instead of one embedded deck", async () => {
    const app = await launchTadaWithDeck(bundledStandaloneDeck(), "bundled-standalone.html");

    try {
      const page = await connectToRenderer(app.port);
      assert.deepEqual(await readPageState(page), {
        source: "bundled-standalone.html",
        position: "1 / 2",
        mode: "existing-deck",
        thumbnails: 2,
        activeThumb: "0",
      });

      let frameState = await waitForFrameState(
        app.port,
        (state) => state.deckStageNoRail && isOnlyVisibleSlide(state, 0, /Bundled one/),
        { timeoutMs: waitTimeoutMs },
      );
      assert.equal(frameState.deckStageNoRail, true);
      assert.doesNotMatch(frameState.bodyText, /Loading preview/);

      await clickThumbnail(page, 1);
      await waitFor(async () => (await readPageState(page)).position === "2 / 2", { timeoutMs: waitTimeoutMs });
      frameState = await waitForFrameState(
        app.port,
        (state) => state.deckStageNoRail && isOnlyVisibleSlide(state, 1, /Bundled two/),
        { timeoutMs: waitTimeoutMs },
      );

      assert.equal(frameState.visibleIndexes.length, 1);
      assert.equal(frameState.visibleIndexes[0], 1);
      assert.match(frameState.bodyText, /Bundled two/);
      await page.close();
    } finally {
      await app.close();
    }
  }, { timeout: 30000 });

  it("loads fallback boundary decks and swaps static slide documents", async () => {
    const app = await launchTadaWithDeck(horizontalRuleDeck(), "rule-fallback.html");

    try {
      const page = await connectToRenderer(app.port);
      assert.deepEqual(await readPageState(page), {
        source: "rule-fallback.html",
        position: "1 / 2",
        mode: "horizontal-rule",
        thumbnails: 2,
        activeThumb: "0",
      });

      assert.match((await readFrameState(app.port)).bodyText, /Rule one/);

      await clickThumbnail(page, 1);
      await waitFor(async () => (await readPageState(page)).position === "2 / 2");
      const frameState = await waitForFrameState(app.port, (state) => /Rule two/.test(state.bodyText));

      assert.match(frameState.bodyText, /Rule two/);
      assert.doesNotMatch(frameState.bodyText, /Rule one/);
      await page.close();
    } finally {
      await app.close();
    }
  }, { timeout: 30000 });

  it("starts a chrome-free audience window and keeps it synced with presenter navigation", async () => {
    const app = await launchTadaWithDeck(sectionDeck({ count: 5 }), "audience-smoke.html");

    try {
      const page = await connectToRenderer(app.port);
      await evalValue(page, `document.querySelector("#presentButton")?.click()`);
      const audience = await connectToAudience(app.port);
      await waitFor(async () => (await readAudienceState(audience)).counter === "1 / 5", { timeoutMs: waitTimeoutMs });

      assert.deepEqual(await readAudienceState(audience), {
        hasToolbar: false,
        hasSidePanel: false,
        frameVisible: true,
        counter: "1 / 5",
      });

      await clickThumbnail(page, 3);
      await waitFor(async () => (await readPageState(page)).position === "4 / 5");
      await waitFor(async () => (await readAudienceState(audience)).counter === "4 / 5", { timeoutMs: waitTimeoutMs });

      await page.close();
      await audience.close();
    } finally {
      await app.close();
    }
  }, { timeout: mediumTestTimeoutMs });

  it("can load and navigate a large client deck without stale stage content", async () => {
    const app = await launchTadaWithDeck(sectionDeck({ count: 80, includeScripts: false }), "large-client.html");

    try {
      const page = await connectToRenderer(app.port);
      await waitFor(async () => (await readPageState(page)).thumbnails === 80, { timeoutMs: waitTimeoutMs });
      assert.deepEqual(await readPageState(page), {
        source: "large-client.html",
        position: "1 / 80",
        mode: "section",
        thumbnails: 80,
        activeThumb: "0",
      });

      await clickThumbnail(page, 79);
      await waitFor(async () => (await readPageState(page)).position === "80 / 80", { timeoutMs: waitTimeoutMs });
      const frameState = await waitForFrameState(app.port, (state) => isOnlyVisibleSlide(state, 79, /Section slide 80/), {
        timeoutMs: waitTimeoutMs,
      });

      assert.equal(frameState.visibleIndexes.length, 1);
      assert.equal(frameState.visibleIndexes[0], 79);
      assert.match(frameState.bodyText, /Section slide 80/);
      assert.doesNotMatch(frameState.bodyText, /Section slide 1/);
      await page.close();
    } finally {
      await app.close();
    }
  }, { timeout: heavyTestTimeoutMs });

  it("loads the TaDa product deck and shows the Ely sample slide when selected", async () => {
    const deckPath = path.join(repoRoot, "docs", "tada-product-presentation.html");
    const app = await launchTadaWithPath(deckPath);

    try {
      const page = await connectToRenderer(app.port);
      await waitFor(async () => (await readPageState(page)).thumbnails >= 8, { timeoutMs: waitTimeoutMs });

      await assertProductDeckSlidesFit(page, app.port);

      await clickThumbnail(page, 1);
      await waitFor(async () => (await readPageState(page)).position === "2 / 10", { timeoutMs: waitTimeoutMs });
      const layoutState = await waitForFrameState(
        app.port,
        (state) =>
          isOnlyVisibleSlide(state, 1, /AI writes HTML/) &&
          state.activeSlideDisplay === "grid" &&
          state.activeSlideScrollWidth <= state.viewportWidth + 2,
        { timeoutMs: waitTimeoutMs },
      );

      assert.equal(layoutState.activeSlideDisplay, "grid");
      assert.ok(
        layoutState.activeSlideScrollWidth <= layoutState.viewportWidth + 2,
        `slide overflowed horizontally: ${layoutState.activeSlideScrollWidth}px > ${layoutState.viewportWidth}px`,
      );

      await clickThumbnail(page, 4);
      await waitFor(async () => (await readPageState(page)).position === "5 / 10", { timeoutMs: waitTimeoutMs });
      const frameState = await waitForFrameState(
        app.port,
        (state) => isOnlyVisibleSlide(state, 4, /A real client deck becomes a show/),
        { timeoutMs: waitTimeoutMs },
      );

      assert.equal(frameState.visibleIndexes.length, 1);
      assert.equal(frameState.visibleIndexes[0], 4);
      assert.match(frameState.bodyText, /A real client deck becomes a show/);
      assert.doesNotMatch(frameState.bodyText, /Present HTML like a deck/);
      await page.close();
    } finally {
      await app.close();
    }
  }, { timeout: heavyTestTimeoutMs });
});

async function launchTadaWithDeck(html, fileName) {
  const root = await mkdtemp(path.join(os.tmpdir(), "tada-electron-smoke-"));
  const deckPath = path.join(root, fileName);
  await writeFile(deckPath, html, "utf8");
  return launchTadaWithPath(deckPath, { root });
}

async function launchTadaWithPath(deckPath, options = {}) {
  const root = options.root ?? (await mkdtemp(path.join(os.tmpdir(), "tada-electron-smoke-")));
  const profilePath = path.join(root, "profile");
  const port = await getFreePort();
  const child = spawn(
    electronPath,
    [`--remote-debugging-port=${port}`, `--user-data-dir=${profilePath}`, ".", deckPath],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });

  const close = async () => {
    if (!child.killed) {
      child.kill();
    }
    await waitForProcessExit(child);
    await rm(root, { force: true, recursive: true });
  };

  try {
    await waitFor(async () => {
      const targets = await getTargets(port).catch(() => []);
      return targets.some((target) => target.type === "page" && target.url.includes("/electron/renderer/index.html"));
    }, { timeoutMs: 15000 });
  } catch (error) {
    await close();
    throw new Error(`Electron renderer did not start.\n${output}\n${error.message}`);
  }

  return { child, close, output: () => output, port, root };
}

async function connectToRenderer(port) {
  const target = await waitForTarget(
    port,
    (candidate) => candidate.type === "page" && candidate.url.includes("/electron/renderer/index.html"),
  );
  const client = await connect(target.webSocketDebuggerUrl);
  await client.cmd("Runtime.enable");
  await client.cmd("Page.enable");
  await waitFor(async () => (await readPageState(client)).thumbnails > 0, { timeoutMs: 15000 });
  return client;
}

async function connectToAudience(port) {
  const target = await waitForTarget(
    port,
    (candidate) => candidate.type === "page" && candidate.url.includes("/electron/audience.html"),
    { timeoutMs: 15000 },
  );
  const client = await connect(target.webSocketDebuggerUrl);
  await client.cmd("Runtime.enable");
  await client.cmd("Page.enable");
  return client;
}

async function readPageState(client) {
  return evalValue(
    client,
    `(() => ({
      source: document.querySelector("#sourceLabel")?.textContent?.trim(),
      position: document.querySelector("#slidePosition")?.textContent?.trim(),
      mode: document.querySelector("#modeLabel")?.textContent?.trim(),
      thumbnails: document.querySelectorAll("[data-slide-index]").length,
      activeThumb: document.querySelector(".thumbnail-button.is-active")?.dataset?.slideIndex ?? null,
    }))()`,
  );
}

async function clickThumbnail(client, index) {
  await evalValue(client, `document.querySelector('[data-slide-index="${index}"]')?.click()`);
}

async function readAudienceState(client) {
  return evalValue(
    client,
    `(() => ({
      hasToolbar: Boolean(document.querySelector(".toolbar")),
      hasSidePanel: Boolean(document.querySelector(".side-panel")),
      frameVisible: !document.querySelector("#slideFrame")?.hidden,
      counter: document.querySelector("#counter")?.textContent?.trim(),
    }))()`,
  );
}

async function readFrameState(port) {
  const target = await waitForTarget(port, (candidate) => candidate.type === "iframe" && candidate.url.startsWith("tada-slide://"));
  const client = await connect(target.webSocketDebuggerUrl);
  try {
    await client.cmd("Runtime.enable");
    return await evalValue(
      client,
      `(() => {
        const selectorGroups = [
          ".deck .slide",
          ".reveal .slides > section",
          ".remark-slide",
          ".swiper-slide",
          "[data-slide]",
          "section",
          "article",
          ".slide",
        ];
        let candidates = [];
        for (const selector of selectorGroups) {
          candidates = Array.from(document.querySelectorAll(selector)).filter((node) => {
            const parent = node.parentElement?.closest(".slide, [data-slide], .remark-slide, .swiper-slide, section, article");
            return !parent;
          });
          if (candidates.length > 0) break;
        }
        const visibleIndexes = candidates
          .map((element, index) => ({ element, index, style: getComputedStyle(element) }))
          .filter(({ element, style }) => element.getAttribute("aria-hidden") === "false" || (style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || "1") > 0))
          .map(({ index }) => index);
        const activeSlide = visibleIndexes.length === 1 ? candidates[visibleIndexes[0]] : null;
        const activeStyle = activeSlide ? getComputedStyle(activeSlide) : null;
        return {
          bodyText: document.body.innerText,
          generatedBooted: Boolean(window.generatedBooted),
          sectionBooted: Boolean(window.sectionDeckBooted),
          deckStageNoRail: Boolean(document.querySelector("deck-stage[no-rail]")),
          activeSlideDisplay: activeStyle?.display ?? "",
          activeSlideScrollWidth: activeSlide?.scrollWidth ?? 0,
          activeSlideScrollHeight: activeSlide?.scrollHeight ?? 0,
          viewportWidth: document.documentElement.clientWidth,
          viewportHeight: document.documentElement.clientHeight,
          visibleIndexes,
        };
      })()`,
    );
  } finally {
    client.close();
  }
}

function waitForFrameState(port, predicate, options = {}) {
  return waitFor(async () => {
    const state = await readFrameState(port);
    return predicate(state) ? state : false;
  }, options);
}

function isOnlyVisibleSlide(state, index, textPattern) {
  return state.visibleIndexes.length === 1 && state.visibleIndexes[0] === index && textPattern.test(state.bodyText);
}

async function assertProductDeckSlidesFit(page, port) {
  const { thumbnails } = await readPageState(page);
  for (let index = 0; index < thumbnails; index += 1) {
    await clickThumbnail(page, index);
    await waitFor(async () => (await readPageState(page)).activeThumb === String(index), { timeoutMs: waitTimeoutMs });
    const frameState = await waitForFrameState(
      port,
      (state) => state.visibleIndexes.length === 1 && state.visibleIndexes[0] === index,
      { timeoutMs: waitTimeoutMs },
    );

    assert.ok(
      frameState.activeSlideScrollWidth <= frameState.viewportWidth + 2,
      `product deck slide ${index + 1} overflowed horizontally: ${frameState.activeSlideScrollWidth}px > ${frameState.viewportWidth}px`,
    );
    assert.ok(
      frameState.activeSlideScrollHeight <= frameState.viewportHeight + 2,
      `product deck slide ${index + 1} overflowed vertically: ${frameState.activeSlideScrollHeight}px > ${frameState.viewportHeight}px`,
    );
  }
}

async function waitForTarget(port, predicate, options = {}) {
  return waitFor(async () => {
    const targets = await getTargets(port);
    return targets.find(predicate) ?? false;
  }, options);
}

async function getTargets(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!response.ok) {
    throw new Error(`DevTools returned ${response.status}`);
  }
  return response.json();
}

async function connect(webSocketDebuggerUrl) {
  const ws = new WebSocket(webSocketDebuggerUrl);
  let commandId = 0;
  const pending = new Map();

  ws.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id || !pending.has(message.id)) {
      return;
    }

    const callbacks = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) {
      callbacks.reject(new Error(JSON.stringify(message.error)));
    } else {
      callbacks.resolve(message);
    }
  });

  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  return {
    cmd(method, params = {}) {
      commandId += 1;
      ws.send(JSON.stringify({ id: commandId, method, params }));
      return new Promise((resolve, reject) => pending.set(commandId, { resolve, reject }));
    },
    close() {
      ws.close();
    },
  };
}

async function evalValue(client, expression) {
  const message = await client.cmd("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout: 30000,
  });
  if (message.result.exceptionDetails) {
    throw new Error(JSON.stringify(message.result.exceptionDetails));
  }
  return message.result.result.value;
}

async function waitFor(callback, { timeoutMs = 8000, intervalMs = 100 } = {}) {
  const startedAt = Date.now();
  let lastError;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const value = await callback();
      if (value) {
        return value;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Timed out after ${timeoutMs}ms${lastError ? `: ${lastError.message}` : ""}`);
}

async function getFreePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForProcessExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);

  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await new Promise((resolve) => child.once("exit", resolve));
  }
}
