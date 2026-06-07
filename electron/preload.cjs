const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("htmlPresenter", {
  openFile() {
    return ipcRenderer.invoke("dialog:open-file");
  },

  loadSource(source) {
    return ipcRenderer.invoke("source:load", source);
  },

  readDroppedFile(file) {
    const filePath =
      typeof webUtils?.getPathForFile === "function" ? webUtils.getPathForFile(file) : file?.path;
    return ipcRenderer.invoke("file:read-dropped", filePath);
  },

  writeClipboardText(text) {
    return ipcRenderer.invoke("clipboard:write-text", text);
  },

  toggleFullscreen() {
    return ipcRenderer.invoke("app:toggle-fullscreen");
  },

  setFullscreen(value) {
    return ipcRenderer.invoke("app:set-fullscreen", value);
  },

  startPresentation(payload) {
    return ipcRenderer.invoke("presentation:start", payload);
  },

  setPresentationIndex(index) {
    return ipcRenderer.invoke("presentation:set-index", index);
  },

  stopPresentation() {
    return ipcRenderer.invoke("presentation:stop");
  },

  saveShowHtml(payload) {
    return ipcRenderer.invoke("show:save-html", payload);
  },

  createSlideDocument(html) {
    return ipcRenderer.invoke("slide-document:create", html);
  },

  revokeSlideDocument(sourceUrl) {
    return ipcRenderer.invoke("slide-document:revoke", sourceUrl);
  },

  rendererReady() {
    return ipcRenderer.invoke("app:renderer-ready");
  },

  getUpdateStatus() {
    return ipcRenderer.invoke("updates:get-status");
  },

  checkForUpdates() {
    return ipcRenderer.invoke("updates:check");
  },

  installUpdate() {
    return ipcRenderer.invoke("updates:install");
  },

  onFileOpened(callback) {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("file:opened", listener);
    return () => ipcRenderer.removeListener("file:opened", listener);
  },

  onSourceError(callback) {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, message) => callback(message);
    ipcRenderer.on("source:error", listener);
    return () => ipcRenderer.removeListener("source:error", listener);
  },

  onUpdateStatus(callback) {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, status) => callback(status);
    ipcRenderer.on("updates:status", listener);
    return () => ipcRenderer.removeListener("updates:status", listener);
  },

  onPresentationIntent(callback) {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, intent) => callback(intent);
    ipcRenderer.on("presentation:intent", listener);
    return () => ipcRenderer.removeListener("presentation:intent", listener);
  },

  onPresentationStopped(callback) {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = () => callback();
    ipcRenderer.on("presentation:stopped", listener);
    return () => ipcRenderer.removeListener("presentation:stopped", listener);
  },
});
