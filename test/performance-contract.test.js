import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const rendererApp = await readFile("electron/renderer/app.js", "utf8");
const mainProcess = await readFile("electron/main.cjs", "utf8");

describe("desktop performance contract", () => {
  it("keeps slide navigation off the full thumbnail rebuild path", () => {
    assert.match(rendererApp, /function renderDeck\(/);
    assert.match(rendererApp, /function updateActiveThumbnail\(/);
    assert.match(rendererApp, /function renderCurrentSlide\(/);

    const goToSlideBody =
      rendererApp.match(/function goToSlide\(nextIndex\) \{([\s\S]*?)\n\}/)?.[1] ?? "";

    assert.match(goToSlideBody, /renderCurrentSlide\(\)/);
    assert.match(goToSlideBody, /updateActiveThumbnail\(/);
    assert.doesNotMatch(goToSlideBody, /\brender\(\)/);
    assert.doesNotMatch(goToSlideBody, /renderThumbnails\(\)/);
  });

  it("does not instantiate the update service before first window paint", () => {
    const readyBody =
      mainProcess.match(/app\.whenReady\(\)\.then\(\(\) => \{([\s\S]*?)\n\}\);/)?.[1] ?? "";

    assert.doesNotMatch(readyBody, /getUpdateService\(\);/);
    assert.match(mainProcess, /setTimeout\(\(\) => \{\s*sendUpdateStatus\(getUpdateService\(\)\.getStatus\(\)\)/);
  });

  it("reposts the active slide after runtime frame load to survive fast navigation during iframe startup", () => {
    assert.match(rendererApp, /elements\.slideFrame\.addEventListener\("load", syncFrameAfterLoad\)/);
    assert.match(rendererApp, /function syncFrameAfterLoad\(\)/);

    const syncStart = rendererApp.indexOf("function syncFrameAfterLoad()");
    const syncEnd = rendererApp.indexOf("function bindFrameNavigation()", syncStart);
    const syncBody = rendererApp.slice(syncStart, syncEnd);
    assert.match(syncBody, /bindFrameNavigation\(\)/);
    assert.equal(syncBody.match(/postSlideIndexToFrame\(\)/g)?.length ?? 0, 1);
    assert.match(syncBody, /setTimeout\(postSlideIndexToFrame, 0\)/);
    assert.match(syncBody, /setTimeout\(postSlideIndexToFrame, 120\)/);
  });
});
