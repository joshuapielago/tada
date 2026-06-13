function loadAutoUpdater() {
  try {
    return require("electron-updater").autoUpdater;
  } catch {
    return null;
  }
}

function createUpdateService({
  app,
  autoUpdater = loadAutoUpdater(),
  broadcast = () => {},
  updateProviderConfigured = true,
}) {
  const appVersion = typeof app?.getVersion === "function" ? app.getVersion() : "0.0.0";
  const isPackaged = Boolean(app?.isPackaged);
  const canUseUpdater = Boolean(isPackaged && autoUpdater && updateProviderConfigured);
  const state = {
    status: canUseUpdater ? "idle" : "unavailable",
    message: initialUnavailableMessage({ isPackaged, autoUpdater, updateProviderConfigured }),
    version: appVersion,
    isPackaged,
    canCheck: canUseUpdater,
    canInstall: false,
    updateInfo: null,
    progress: null,
  };

  if (canUseUpdater) {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = false;

    autoUpdater.on("checking-for-update", () => {
      setStatus("checking", {
        message: "Checking for updates...",
        canCheck: false,
        canInstall: false,
        progress: null,
      });
    });

    autoUpdater.on("update-available", (info) => {
      setStatus("available", {
        message: `Downloading Tada ${formatVersion(info)}...`,
        canCheck: false,
        canInstall: false,
        updateInfo: normalizeUpdateInfo(info),
      });
    });

    autoUpdater.on("update-not-available", (info) => {
      setStatus("not-available", {
        message: "Tada is up to date.",
        canCheck: true,
        canInstall: false,
        updateInfo: normalizeUpdateInfo(info),
        progress: null,
      });
    });

    autoUpdater.on("download-progress", (progress) => {
      const percent = Number(progress?.percent ?? 0);
      setStatus("downloading", {
        message: `Downloading update ${Math.max(0, Math.min(100, percent)).toFixed(0)}%...`,
        canCheck: false,
        canInstall: false,
        progress: normalizeProgress(progress),
      });
    });

    autoUpdater.on("update-downloaded", (info) => {
      setStatus("downloaded", {
        message: `Tada ${formatVersion(info)} is ready to install.`,
        canCheck: true,
        canInstall: true,
        updateInfo: normalizeUpdateInfo(info),
        progress: null,
      });
    });

    autoUpdater.on("error", (error) => {
      setStatus("error", {
        message: errorMessage(error, "Could not check for updates."),
        canCheck: true,
        canInstall: false,
        progress: null,
      });
    });
  }

  function getStatus() {
    return {
      ...state,
      updateInfo: state.updateInfo ? { ...state.updateInfo } : null,
      progress: state.progress ? { ...state.progress } : null,
    };
  }

  function setStatus(status, patch = {}) {
    const previousStatus = state.status;
    const previousMessage = state.message;
    Object.assign(state, patch, { status });
    if (previousStatus !== state.status || previousMessage !== state.message) {
      broadcast(getStatus());
    }
    return getStatus();
  }

  async function checkForUpdates() {
    if (!canUseUpdater) {
      return getStatus();
    }

    if (["checking", "available", "downloading"].includes(state.status)) {
      return getStatus();
    }

    setStatus("checking", {
      message: "Checking for updates...",
      canCheck: false,
      canInstall: false,
      progress: null,
    });

    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      setStatus("error", {
        message: errorMessage(error, "Could not check for updates."),
        canCheck: true,
        canInstall: false,
        progress: null,
      });
    }

    return getStatus();
  }

  function installUpdate() {
    if (!canUseUpdater || !state.canInstall) {
      return getStatus();
    }

    setStatus("installing", {
      message: "Installing update...",
      canCheck: false,
      canInstall: false,
    });
    autoUpdater.quitAndInstall(false, true);
    return getStatus();
  }

  return {
    getStatus,
    checkForUpdates,
    installUpdate,
  };
}

function initialUnavailableMessage({ isPackaged, autoUpdater, updateProviderConfigured }) {
  if (!isPackaged) {
    return "Updates are available in packaged builds.";
  }

  if (!autoUpdater) {
    return "Update support is not bundled in this build.";
  }

  if (!updateProviderConfigured) {
    return "Configure the release provider before checking for updates.";
  }

  return "Ready to check for updates.";
}

function normalizeUpdateInfo(info) {
  if (!info || typeof info !== "object") {
    return null;
  }

  return {
    version: typeof info.version === "string" ? info.version : "",
    releaseName: typeof info.releaseName === "string" ? info.releaseName : "",
    releaseDate: typeof info.releaseDate === "string" ? info.releaseDate : "",
  };
}

function normalizeProgress(progress) {
  return {
    percent: Number(progress?.percent ?? 0),
    bytesPerSecond: Number(progress?.bytesPerSecond ?? 0),
    transferred: Number(progress?.transferred ?? 0),
    total: Number(progress?.total ?? 0),
  };
}

function formatVersion(info) {
  return normalizeUpdateInfo(info)?.version || "update";
}

function errorMessage(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}

module.exports = {
  createUpdateService,
  loadAutoUpdater,
};
