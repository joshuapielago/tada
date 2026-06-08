import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const workflow = await readFile(".github/workflows/beta-release.yml", "utf8");
const releaseGuide = await readFile("docs/release.md", "utf8");

describe("unsigned beta GitHub release workflow", () => {
  it("builds macOS and Windows artifacts for GitHub Releases without signing secrets", () => {
    assert.match(workflow, /name:\s*Unsigned Beta Release/);
    assert.match(workflow, /macos-latest/);
    assert.match(workflow, /windows-latest/);
    assert.match(workflow, /CSC_IDENTITY_AUTO_DISCOVERY:\s*false/);
    assert.match(workflow, /npm run dist:mac -- -c\.mac\.identity=null/);
    assert.match(workflow, /npm run dist:win/);
    assert.doesNotMatch(workflow, /CSC_LINK|CSC_KEY_PASSWORD|APPLE_ID|APPLE_APP_SPECIFIC_PASSWORD|WIN_CSC_LINK/);
  });

  it("uploads both platform artifacts and updater metadata into one prerelease", () => {
    assert.match(workflow, /softprops\/action-gh-release@v2/);
    assert.match(workflow, /prerelease:\s*true/);
    assert.match(workflow, /dist\/\*\.dmg/);
    assert.match(workflow, /dist\/\*\.zip/);
    assert.match(workflow, /dist\/\*\.exe/);
    assert.match(workflow, /dist\/\*\.blockmap/);
    assert.match(workflow, /dist\/latest\*\.yml/);
  });

  it("documents unsigned beta limitations and tag flow", () => {
    assert.match(releaseGuide, /Unsigned Beta Channel/);
    assert.match(releaseGuide, /v0\.1\.1-beta\.0/);
    assert.match(releaseGuide, /Mac auto-update is not production-ready until signing and notarization are added/);
    assert.match(releaseGuide, /Windows builds are unsigned and may trigger SmartScreen/);
  });
});
