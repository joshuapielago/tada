const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { describe, it } = require("node:test");

const { createUpdateService } = require("../electron/updater.cjs");

function createFakeApp({ isPackaged = true } = {}) {
  return {
    isPackaged,
    getVersion() {
      return "0.1.0";
    },
  };
}

function createFakeUpdater() {
  const updater = new EventEmitter();
  updater.autoDownload = null;
  updater.autoInstallOnAppQuit = null;
  updater.checks = 0;
  updater.installs = 0;
  updater.checkForUpdates = async () => {
    updater.checks += 1;
    updater.emit("checking-for-update");
    return { updateInfo: { version: "0.2.0" } };
  };
  updater.quitAndInstall = () => {
    updater.installs += 1;
  };
  return updater;
}

describe("createUpdateService", () => {
  it("reports unavailable status for unpackaged development builds", async () => {
    const service = createUpdateService({
      app: createFakeApp({ isPackaged: false }),
      autoUpdater: createFakeUpdater(),
    });

    assert.equal(service.getStatus().status, "unavailable");
    assert.equal(service.getStatus().canCheck, false);

    const status = await service.checkForUpdates();
    assert.equal(status.status, "unavailable");
    assert.match(status.message, /packaged/i);
  });

  it("reports unavailable status until the release provider is configured", async () => {
    const updater = createFakeUpdater();
    const service = createUpdateService({
      app: createFakeApp(),
      autoUpdater: updater,
      updateProviderConfigured: false,
    });

    assert.equal(service.getStatus().status, "unavailable");
    assert.equal(service.getStatus().canCheck, false);
    assert.match(service.getStatus().message, /release provider/i);

    await service.checkForUpdates();
    assert.equal(updater.checks, 0);
  });

  it("checks for updates and broadcasts update lifecycle events", async () => {
    const events = [];
    const updater = createFakeUpdater();
    const service = createUpdateService({
      app: createFakeApp(),
      autoUpdater: updater,
      broadcast: (status) => events.push(status),
    });

    assert.equal(updater.autoDownload, true);
    assert.equal(updater.autoInstallOnAppQuit, false);

    await service.checkForUpdates();
    updater.emit("update-available", { version: "0.2.0" });
    updater.emit("download-progress", { percent: 42.25, bytesPerSecond: 1200 });
    updater.emit("update-downloaded", { version: "0.2.0" });

    assert.equal(updater.checks, 1);
    assert.equal(service.getStatus().status, "downloaded");
    assert.equal(service.getStatus().canInstall, true);
    assert.deepEqual(
      events.map((event) => event.status),
      ["checking", "available", "downloading", "downloaded"],
    );
  });

  it("installs only after an update has downloaded", async () => {
    const updater = createFakeUpdater();
    const service = createUpdateService({
      app: createFakeApp(),
      autoUpdater: updater,
    });

    assert.equal(service.installUpdate().status, "idle");
    assert.equal(updater.installs, 0);

    updater.emit("update-downloaded", { version: "0.2.0" });
    const status = service.installUpdate();

    assert.equal(status.status, "installing");
    assert.equal(updater.installs, 1);
  });
});
