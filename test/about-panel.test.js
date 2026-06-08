import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const mainProcess = await readFile("electron/main.cjs", "utf8");
const packageJson = JSON.parse(await readFile("package.json", "utf8"));

describe("About panel identity", () => {
  it("brands TaDa! with Joshua Pielago and LOKAL metadata", () => {
    assert.equal(packageJson.author, "Joshua Pielago / LOKAL");
    assert.match(mainProcess, /app\.setAboutPanelOptions/);
    assert.match(mainProcess, /applicationName:\s*"TaDa!"/);
    assert.match(mainProcess, /authors:\s*\["Joshua Pielago", "LOKAL"\]/);
    assert.match(mainProcess, /copyright:\s*`© 2026 Joshua Pielago \/ LOKAL`/);
    assert.match(mainProcess, /Presentation mode for HTML, PowerPoint, Google Slides, and websites\./);
  });

  it("adds a Help menu About item for non-macOS builds", () => {
    assert.match(mainProcess, /label:\s*"About TaDa!"/);
    assert.match(mainProcess, /showAboutPanel\(\)/);
  });
});
