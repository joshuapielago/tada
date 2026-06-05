import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));

describe("production package configuration", () => {
  it("declares installable macOS and Windows build targets", () => {
    assert.equal(packageJson.name, "tada");
    assert.equal(packageJson.productName, "TaDa!");
    assert.equal(packageJson.main, "electron/main.cjs");
    assert.match(packageJson.build.appId, /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/);
    assert.equal(packageJson.build.mac.icon, "build/icon.icns");
    assert.equal(packageJson.build.win.icon, "build/icon.ico");
    assert.deepEqual(packageJson.build.mac.target, ["dmg", "zip"]);
    assert.deepEqual(packageJson.build.win.target, ["nsis"]);
  });

  it("declares explicit publish metadata for auto updates", () => {
    assert.equal(packageJson.build.publish.provider, "github");
    assert.equal(packageJson.build.publish.owner, "joshuapielago");
    assert.equal(packageJson.build.publish.repo, "tada");
    assert.equal(packageJson.build.electronUpdaterCompatibility, ">=2.16");
  });

  it("limits packaged files to the runtime app surface", () => {
    assert.ok(packageJson.build.files.includes("electron/**/*"));
    assert.ok(packageJson.build.files.includes("src/shared/**/*"));
    assert.ok(packageJson.build.files.includes("package.json"));
    assert.ok(packageJson.build.asar);
  });

  it("ships platform app icons", async () => {
    await access(packageJson.build.mac.icon);
    await access(packageJson.build.win.icon);
  });
});
