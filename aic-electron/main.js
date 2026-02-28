const { app, BrowserWindow, dialog, ipcMain, Menu, screen } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

let backendProcess = null;
let ollamaProcess = null;
let backendStarting = false;
let backendStartedByApp = false;
let ollamaStarting = false;

const startBackendIfAvailable = () => {
  const backendPath = path.join(process.resourcesPath, "backend", "aic-backend.exe");
  if (!fs.existsSync(backendPath)) {
    return;
  }
  backendProcess = spawn(backendPath, [], { stdio: "ignore" });
  backendProcess.on("exit", () => {
    backendProcess = null;
    backendStartedByApp = false;
  });
  backendStartedByApp = true;
};

const startBackendForDev = () => {
  const override = process.env.AIC_BACKEND_CMD;
  const backendRoot = path.join(__dirname, "..", "aic-backend");
  const batPath = path.join(backendRoot, "run_dev.bat");
  const command = override || `cmd.exe /c "${batPath}"`;
  backendProcess = spawn(command, {
    shell: true,
    cwd: backendRoot,
    stdio: "ignore",
  });
  backendProcess.on("exit", () => {
    backendProcess = null;
    backendStartedByApp = false;
  });
  backendStartedByApp = true;
};

const checkBackendHealth = async () => {
  try {
    const res = await fetch("http://127.0.0.1:8000/health");
    return res.ok;
  } catch (error) {
    return false;
  }
};

const checkOllamaHealth = async () => {
  try {
    const res = await fetch("http://localhost:11434/api/tags");
    return res.ok;
  } catch (error) {
    return false;
  }
};

const startOllama = () => {
  const cmd = process.platform === "win32" ? "ollama.exe" : "ollama";
  ollamaProcess = spawn(cmd, ["serve"], {
    detached: true,
    stdio: "ignore",
  });
  ollamaProcess.unref();
};

const ensureOllamaRunning = async () => {
  if (ollamaStarting) return;
  const healthy = await checkOllamaHealth();
  if (healthy) return;
  ollamaStarting = true;
  startOllama();
  setTimeout(() => {
    ollamaStarting = false;
  }, 3000);
};

const ensureBackendRunning = async () => {
  if (backendStarting) return;
  const healthy = await checkBackendHealth();
  if (healthy) return;
  backendStarting = true;
  if (app.isPackaged) {
    startBackendIfAvailable();
  } else {
    startBackendForDev();
  }
  backendStarting = false;
};

const monitorBackend = () => {
  setInterval(async () => {
    const healthy = await checkBackendHealth();
    if (healthy) return;
    if (backendProcess && !backendProcess.killed) {
      backendProcess.kill();
      backendProcess = null;
      backendStartedByApp = false;
    }
    await ensureBackendRunning();
  }, 5000);
};

const monitorOllama = () => {
  setInterval(async () => {
    const healthy = await checkOllamaHealth();
    if (!healthy) {
      await ensureOllamaRunning();
    }
  }, 10000);
};

ipcMain.handle("aic:select-folder", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"],
  });
  if (result.canceled || !result.filePaths.length) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle("aic:select-path", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile", "openDirectory"],
  });
  if (result.canceled || !result.filePaths.length) {
    return null;
  }
  return result.filePaths[0];
});

let mainWindow = null;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  mainWindow.on("maximize", () => {
    const display = screen.getDisplayMatching(mainWindow.getBounds());
    if (display && display.workArea) {
      mainWindow.setBounds(display.workArea);
    }
  });

  if (process.env.ELECTRON_DEV === "1") {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
};

const openSettingsWindow = () => {
  const win = new BrowserWindow({
    width: 400,
    height: 200,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });
  win.loadFile(path.join(__dirname, "renderer", "settings.html"));
};

const setApplicationMenu = () => {
  const template = [
    {
      label: "File",
      submenu: [
        { label: "Settings", click: openSettingsWindow },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

ipcMain.on("aic:data-deleted", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("aic:data-deleted");
  }
});

app.whenReady().then(() => {
  ensureOllamaRunning();
  ensureBackendRunning();
  monitorBackend();
  monitorOllama();
  setApplicationMenu();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (backendProcess) {
    backendProcess.kill();
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});
