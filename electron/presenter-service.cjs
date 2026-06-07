const path = require("node:path");

function createPresenterService({
  BrowserWindow,
  screen,
  audiencePath = path.join(__dirname, "audience.html"),
  preloadPath = path.join(__dirname, "audience-preload.cjs"),
  onAudienceWindowCreated = () => {},
  onStopped = () => {},
} = {}) {
  let audienceWindow = null;
  let activeSession = null;
  let activeIndex = 0;

  async function startPresentation({ session, index = 0 } = {}) {
    stopPresentation({ notifyAudience: false });

    activeSession = sanitizeSession(session);
    activeIndex = normalizeIndex(index, activeSession);
    const display = selectAudienceDisplay(screen);
    const bounds = display?.bounds ?? { x: 0, y: 0, width: 1440, height: 900 };

    audienceWindow = new BrowserWindow({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      backgroundColor: "#050505",
      frame: false,
      show: false,
      fullscreenable: true,
      title: "TaDa! Audience",
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });
    onAudienceWindowCreated(audienceWindow);

    audienceWindow.once("closed", () => {
      audienceWindow = null;
      activeSession = null;
      activeIndex = 0;
      onStopped();
    });

    const remotePresentUrl = getRemotePresentUrl(activeSession);
    if (remotePresentUrl) {
      await audienceWindow.loadURL(remotePresentUrl);
    } else {
      audienceWindow.webContents.once("did-finish-load", () => {
        sendToAudience("presentation:load", {
          session: activeSession,
          index: activeIndex,
        });
      });
      await audienceWindow.loadFile(audiencePath);
    }

    audienceWindow.show();
    audienceWindow.setFullScreen(true);

    return {
      active: true,
      displayId: display?.id ?? null,
    };
  }

  function setPresentationIndex(index) {
    if (!audienceWindow || audienceWindow.isDestroyed()) {
      return false;
    }

    activeIndex = normalizeIndex(index, activeSession);
    sendToAudience("presentation:set-index", activeIndex);
    return true;
  }

  function sendCurrentSession() {
    if (!audienceWindow || audienceWindow.isDestroyed() || !activeSession) {
      return false;
    }

    sendToAudience("presentation:load", {
      session: activeSession,
      index: activeIndex,
    });
    return true;
  }

  function stopPresentation({ notifyAudience = true } = {}) {
    const windowToClose = audienceWindow;
    if (!windowToClose || windowToClose.isDestroyed()) {
      audienceWindow = null;
      activeSession = null;
      activeIndex = 0;
      return false;
    }

    if (notifyAudience) {
      sendToAudience("presentation:stop");
    }

    windowToClose.close();
    return true;
  }

  function isPresenting() {
    return Boolean(audienceWindow && !audienceWindow.isDestroyed());
  }

  function sendToAudience(channel, payload) {
    if (!audienceWindow || audienceWindow.isDestroyed()) {
      return;
    }

    audienceWindow.webContents.send(channel, payload);
  }

  return {
    startPresentation,
    setPresentationIndex,
    sendCurrentSession,
    stopPresentation,
    isPresenting,
  };
}

function selectAudienceDisplay(screen) {
  const displays = screen?.getAllDisplays?.() ?? [];
  const primary = screen?.getPrimaryDisplay?.() ?? displays[0] ?? null;
  return displays.find((display) => display.id !== primary?.id) ?? primary;
}

function sanitizeSession(session) {
  if (!session || typeof session !== "object") {
    return {
      id: "empty",
      title: "TaDa!",
      sourceType: "html",
      renderMode: "html-static",
      slides: [],
    };
  }

  return {
    ...session,
    slides: Array.isArray(session.slides) ? session.slides : [],
  };
}

function normalizeIndex(index, session) {
  const slideCount = session?.slides?.length ?? 0;
  if (slideCount === 0) {
    return 0;
  }

  const numericIndex = Number.isInteger(index) ? index : 0;
  return Math.max(0, Math.min(numericIndex, slideCount - 1));
}

function getRemotePresentUrl(session) {
  if (session?.renderMode !== "remote-present") {
    return "";
  }

  const firstRemoteSlide = session.slides?.find((slide) => slide?.type === "remote" && slide.url);
  return firstRemoteSlide?.url ?? "";
}

module.exports = {
  createPresenterService,
};
