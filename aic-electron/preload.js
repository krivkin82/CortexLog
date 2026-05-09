const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("aic", {
  version: "0.1.0",
  selectFolder: () => ipcRenderer.invoke("aic:select-folder"),
  selectPath: () => ipcRenderer.invoke("aic:select-path"),
  getApiKey: () => ipcRenderer.invoke("aic:get-api-key"),
  getModifySourceRoot: () => ipcRenderer.invoke("aic:get-modify-source-root"),
  sendDataDeleted: () => ipcRenderer.send("aic:data-deleted"),
  onDataDeleted: (fn) => {
    ipcRenderer.on("aic:data-deleted", () => fn());
  },
});
