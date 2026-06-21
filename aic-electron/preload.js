const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("aic", {
  version: "0.1.0",
  selectFolder: () => ipcRenderer.invoke("aic:select-folder"),
  selectPath: () => ipcRenderer.invoke("aic:select-path"),
  getApiKey: () => ipcRenderer.invoke("aic:get-api-key"),
  getModifySourceRoot: () => ipcRenderer.invoke("aic:get-modify-source-root"),
  getProfiles: () => ipcRenderer.invoke("aic:get-profiles"),
  getActiveProfile: () => ipcRenderer.invoke("aic:get-active-profile"),
  createProfile: (label) => ipcRenderer.invoke("aic:create-profile", label),
  renameProfile: (payload) => ipcRenderer.invoke("aic:rename-profile", payload),
  switchProfile: (profileId) => ipcRenderer.invoke("aic:switch-profile", profileId),
  sendDataDeleted: () => ipcRenderer.send("aic:data-deleted"),
  onDataDeleted: (fn) => {
    const handler = () => fn();
    ipcRenderer.on("aic:data-deleted", handler);
    return () => ipcRenderer.removeListener("aic:data-deleted", handler);
  },
  onOpenSettings: (fn) => {
    const handler = (_event, tab) => fn(tab);
    ipcRenderer.on("aic:open-settings", handler);
    return () => ipcRenderer.removeListener("aic:open-settings", handler);
  },
  onSwitchMode: (fn) => {
    const handler = (_event, mode) => fn(mode);
    ipcRenderer.on("aic:switch-mode", handler);
    return () => ipcRenderer.removeListener("aic:switch-mode", handler);
  },
  onProfileChanged: (fn) => {
    const handler = (_event, profile) => fn(profile);
    ipcRenderer.on("aic:profile-changed", handler);
    return () => ipcRenderer.removeListener("aic:profile-changed", handler);
  },
});
