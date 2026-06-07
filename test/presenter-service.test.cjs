const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const { createPresenterService } = require("../electron/presenter-service.cjs");

test("starts an audience window on the external display and sends the session after load", async () => {
  const windows = [];
  const service = createPresenterService({
    BrowserWindow: createFakeBrowserWindowClass(windows),
    screen: createFakeScreen([
      { id: 1, bounds: { x: 0, y: 0, width: 1440, height: 900 }, workArea: { x: 0, y: 0, width: 1440, height: 860 } },
      { id: 2, bounds: { x: 1440, y: 0, width: 1920, height: 1080 }, workArea: { x: 1440, y: 0, width: 1920, height: 1080 } },
    ]),
    audiencePath: path.join(__dirname, "..", "electron", "audience.html"),
  });

  const result = await service.startPresentation({
    session: sampleSession(),
    index: 1,
  });

  assert.deepEqual(result, { active: true, displayId: 2 });
  assert.equal(windows.length, 1);
  assert.equal(windows[0].options.x, 1440);
  assert.equal(windows[0].options.y, 0);
  assert.equal(windows[0].loadedFile.endsWith("audience.html"), true);
  assert.equal(windows[0].shown, true);
  assert.equal(windows[0].fullScreen, true);

  windows[0].emitWebContents("did-finish-load");

  assert.deepEqual(windows[0].sentMessages.at(-1), {
    channel: "presentation:load",
    payload: {
      session: sampleSession(),
      index: 1,
    },
  });
});

test("updates and stops the active audience window", async () => {
  const windows = [];
  const service = createPresenterService({
    BrowserWindow: createFakeBrowserWindowClass(windows),
    screen: createFakeScreen([{ id: 1, bounds: { x: 0, y: 0, width: 1440, height: 900 } }]),
    audiencePath: path.join(__dirname, "..", "electron", "audience.html"),
  });

  await service.startPresentation({ session: sampleSession(), index: 0 });
  service.setPresentationIndex(2);
  service.stopPresentation();

  assert.deepEqual(windows[0].sentMessages.map((message) => message.channel), [
    "presentation:set-index",
    "presentation:stop",
  ]);
  assert.equal(windows[0].closed, true);
  assert.equal(service.isPresenting(), false);
});

test("replaces an existing audience window when a new presentation starts", async () => {
  const windows = [];
  const service = createPresenterService({
    BrowserWindow: createFakeBrowserWindowClass(windows),
    screen: createFakeScreen([{ id: 1, bounds: { x: 0, y: 0, width: 1440, height: 900 } }]),
    audiencePath: path.join(__dirname, "..", "electron", "audience.html"),
  });

  await service.startPresentation({ session: sampleSession(), index: 0 });
  await service.startPresentation({ session: { ...sampleSession(), id: "next" }, index: 0 });

  assert.equal(windows.length, 2);
  assert.equal(windows[0].closed, true);
  assert.equal(windows[1].closed, false);
});

test("loads remote-present sessions directly in the audience window", async () => {
  const windows = [];
  const service = createPresenterService({
    BrowserWindow: createFakeBrowserWindowClass(windows),
    screen: createFakeScreen([{ id: 1, bounds: { x: 0, y: 0, width: 1440, height: 900 } }]),
    audiencePath: path.join(__dirname, "..", "electron", "audience.html"),
  });
  const session = {
    id: "google",
    renderMode: "remote-present",
    slides: [
      {
        id: "google-slide-1",
        type: "remote",
        title: "Google Slides",
        url: "https://docs.google.com/presentation/d/abc123/present",
      },
    ],
  };

  await service.startPresentation({ session, index: 0 });

  assert.equal(windows[0].loadedFile, "");
  assert.equal(windows[0].loadedUrl, "https://docs.google.com/presentation/d/abc123/present");
});

test("notifies the host when an audience window is created", async () => {
  const windows = [];
  const created = [];
  const service = createPresenterService({
    BrowserWindow: createFakeBrowserWindowClass(windows),
    screen: createFakeScreen([{ id: 1, bounds: { x: 0, y: 0, width: 1440, height: 900 } }]),
    audiencePath: path.join(__dirname, "..", "electron", "audience.html"),
    onAudienceWindowCreated: (window) => created.push(window),
  });

  await service.startPresentation({ session: sampleSession(), index: 0 });

  assert.equal(created[0], windows[0]);
});

function createFakeScreen(displays) {
  return {
    getAllDisplays() {
      return displays;
    },
    getPrimaryDisplay() {
      return displays[0];
    },
  };
}

function createFakeBrowserWindowClass(windows) {
  return class FakeBrowserWindow {
    constructor(options) {
      this.options = options;
      this.closed = false;
      this.shown = false;
      this.fullScreen = false;
      this.loadedFile = "";
      this.loadedUrl = "";
      this.listeners = new Map();
      this.webContentsListeners = new Map();
      this.sentMessages = [];
      this.webContents = {
        send: (channel, payload) => {
          this.sentMessages.push({ channel, payload });
        },
        once: (eventName, callback) => {
          this.webContentsListeners.set(eventName, callback);
        },
      };
      windows.push(this);
    }

    async loadFile(filePath) {
      this.loadedFile = filePath;
    }

    async loadURL(sourceUrl) {
      this.loadedUrl = sourceUrl;
    }

    once(eventName, callback) {
      this.listeners.set(eventName, callback);
    }

    show() {
      this.shown = true;
    }

    setFullScreen(value) {
      this.fullScreen = Boolean(value);
    }

    isDestroyed() {
      return this.closed;
    }

    close() {
      this.closed = true;
      this.listeners.get("closed")?.();
    }

    emitWebContents(eventName) {
      this.webContentsListeners.get(eventName)?.();
    }
  };
}

function sampleSession() {
  return {
    id: "deck",
    title: "Deck",
    sourceType: "html",
    renderMode: "html-static",
    slides: [
      { id: "deck-slide-1", type: "html", title: "One", html: "<h1>One</h1>", notes: "" },
      { id: "deck-slide-2", type: "html", title: "Two", html: "<h1>Two</h1>", notes: "" },
      { id: "deck-slide-3", type: "html", title: "Three", html: "<h1>Three</h1>", notes: "" },
    ],
  };
}
