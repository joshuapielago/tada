const { contextBridge, ipcRenderer } = require("electron");

function subscribe(channel, callback) {
  if (typeof callback !== "function") {
    return () => {};
  }

  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("tadaAudience", {
  onLoad(callback) {
    return subscribe("presentation:load", callback);
  },

  onSetIndex(callback) {
    return subscribe("presentation:set-index", callback);
  },

  onStop(callback) {
    return subscribe("presentation:stop", callback);
  },

  sendIntent(intent) {
    ipcRenderer.send("presentation:intent", String(intent ?? "none"));
  },

  ready() {
    ipcRenderer.send("presentation:ready");
  },
});
