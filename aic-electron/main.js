const { app, BrowserWindow, dialog, ipcMain, Menu, screen } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn, execFileSync } = require("child_process");

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

/** Path to API token file (shared with backend data directory). */
const getApiTokenPath = () => {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "backend", "data", "api_token");
  }
  return path.join(__dirname, "..", "aic-backend", "data", "api_token");
};

ipcMain.handle("aic:get-api-key", async () => {
  const tokenPath = getApiTokenPath();
  // #region agent log
  const tokenExists = fs.existsSync(tokenPath);
  fetch('http://127.0.0.1:7739/ingest/8d7d0d2f-58df-44c1-a19c-9fd5946c237a',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'57d7bc'},body:JSON.stringify({sessionId:'57d7bc',runId:'run2',hypothesisId:'H2',location:'main.js:getApiKey',message:'Reading API token',data:{tokenPath,tokenExists,isPackaged:app.isPackaged,resourcesPath:process.resourcesPath},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  try {
    if (tokenExists) {
      const token = fs.readFileSync(tokenPath, "utf8").trim();
      // #region agent log
      fetch('http://127.0.0.1:7739/ingest/8d7d0d2f-58df-44c1-a19c-9fd5946c237a',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'57d7bc'},body:JSON.stringify({sessionId:'57d7bc',runId:'run2',hypothesisId:'H2',location:'main.js:getApiKey:found',message:'Token read',data:{tokenLength:token.length,tokenPreview:token.slice(0,4)+'...'},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      return token;
    }
  } catch (err) {
    return null;
  }
  return null;
});

const copyRecursiveSync = (src, dest) => {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      if (name === ".git") continue;
      copyRecursiveSync(path.join(src, name), path.join(dest, name));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
};

const getSourceTemplateDir = () => {
  const packaged = path.join(process.resourcesPath, "source-template");
  if (fs.existsSync(packaged)) return packaged;
  const dev = path.join(__dirname, "source-template");
  if (fs.existsSync(dev)) return dev;
  return null;
};

/**
 * Ensure %userData%/source exists with template files and a Git repo (best-effort).
 * @returns {string} absolute path to writable source folder
 */
const ensureWritableSourceCopy = () => {
  const userData = app.getPath("userData");
  const dest = path.join(userData, "source");
  const template = getSourceTemplateDir();
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const marker = path.join(dest, ".cortexlog_source_initialized");
  if (!fs.existsSync(marker) && template) {
    copyRecursiveSync(template, dest);
    try {
      fs.writeFileSync(marker, new Date().toISOString(), "utf8");
    } catch (_) {
      /* ignore */
    }
  }
  let insideGit = false;
  try {
    execFileSync("git", ["-C", dest, "rev-parse", "--is-inside-work-tree"], {
      stdio: "pipe",
      encoding: "utf8",
    });
    insideGit = true;
  } catch (_) {
    insideGit = false;
  }
  if (!insideGit) {
    try {
      execFileSync("git", ["init"], { cwd: dest, stdio: "ignore" });
      execFileSync("git", ["-C", dest, "config", "user.email", "noreply@cortexlog.app"], {
        stdio: "ignore",
      });
      execFileSync("git", ["-C", dest, "config", "user.name", "CortexLog"], { stdio: "ignore" });
      execFileSync("git", ["-C", dest, "add", "-A"], { stdio: "ignore" });
      try {
        execFileSync(
          "git",
          ["-C", dest, "commit", "-m", "Initial CortexLog writable source copy", "--allow-empty"],
          { stdio: "ignore" }
        );
      } catch (_) {
        /* no files or git error */
      }
    } catch (_) {
      /* git not installed */
    }
  }
  return dest;
};

ipcMain.handle("aic:get-modify-source-root", async () => ensureWritableSourceCopy());

const syncModifyEngineSourceFolder = async () => {
  const sourceDir = ensureWritableSourceCopy();
  const tokenPath = getApiTokenPath();
  let key = null;
  try {
    if (fs.existsSync(tokenPath)) {
      key = fs.readFileSync(tokenPath, "utf8").trim();
    }
  } catch (_) {
    key = null;
  }
  const headers = { "Content-Type": "application/json" };
  if (key) headers["X-API-Key"] = key;
  for (let i = 0; i < 40; i += 1) {
    try {
      const h = await fetch("http://127.0.0.1:8000/health");
      if (h.ok) break;
    } catch (_) {
      /* wait for backend */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  try {
    await fetch("http://127.0.0.1:8000/modify/engine/settings", {
      method: "POST",
      headers,
      body: JSON.stringify({ source_folder: sourceDir }),
    });
  } catch (_) {
    /* backend may still be starting */
  }
};

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  const useViteDev = process.env.VITE_DEV === "1";
  if (useViteDev) {
    mainWindow.loadURL("http://127.0.0.1:5173");
  } else {
    const distHtml = path.join(__dirname, "renderer-dist", "index.html");
    if (fs.existsSync(distHtml)) {
      mainWindow.loadFile(distHtml);
    } else {
      mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
    }
  }

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

const setApplicationMenu = () => {
  const template = [
    {
      label: "File",
      submenu: [{ role: "quit" }],
    },
    {
      label: "View",
      submenu: [
        ...(process.env.ELECTRON_DEV === "1"
          ? [{ role: "reload" }, { role: "forceReload" }]
          : []),
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
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
  ensureWritableSourceCopy();
  ensureOllamaRunning();
  ensureBackendRunning();
  monitorBackend();
  monitorOllama();
  setApplicationMenu();
  createWindow();
  setTimeout(() => {
    void syncModifyEngineSourceFolder();
  }, 1200);

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
