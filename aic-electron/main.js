const { app, BrowserWindow, dialog, ipcMain, Menu, screen } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn, execFileSync, execSync } = require("child_process");

let backendProcess = null;
let ollamaProcess = null;
let backendStarting = false;
let backendStartedByApp = false;
let ollamaStarting = false;
let mainWindow = null;

const BACKEND_HOST = "127.0.0.1";
const BACKEND_PORT = 8000;
const BACKEND_HEALTH_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}/health`;
const CORTEXLOG_SERVICE = "cortexlog-backend";

const DEFAULT_PROFILES = [
  { id: "private", label: "Private" },
  { id: "demo", label: "Demo" },
];

/** True when APPDATA resolves to Local\\Temp (portable Electron can mis-route). */
function isWindowsRoamingLikelyMisrouted(candidate) {
  if (process.platform !== "win32" || !candidate) return false;
  const norm = path.resolve(candidate).replace(/\//g, "\\").toLowerCase();
  return norm.includes("\\appdata\\local\\temp\\") || norm.endsWith("\\appdata\\local\\temp");
}

function getStableRoamingBase() {
  if (process.platform === "win32") {
    const fromEnv = (process.env.APPDATA || "").trim();
    if (!isWindowsRoamingLikelyMisrouted(fromEnv)) return fromEnv || app.getPath("appData");
    return path.join(os.homedir(), "AppData", "Roaming");
  }
  return app.getPath("appData");
}

function getCortexLogAppRoot() {
  if (process.platform === "win32") {
    return path.join(getStableRoamingBase(), "CortexLog");
  }
  const xdg = (process.env.XDG_DATA_HOME || "").trim();
  const baseDir = xdg || path.join(os.homedir(), ".local", "share");
  return path.join(baseDir, "CortexLog");
}

function getGlobalAppSettingsPath() {
  return path.join(getCortexLogAppRoot(), "app_settings.json");
}

function getLegacyFlatDataDir() {
  return path.join(getCortexLogAppRoot(), "data");
}

function slugifyProfileId(label) {
  let s = String(label || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  s = s.replace(/[^a-z0-9_-]/g, "").replace(/_+/g, "_").replace(/^_|_$/g, "");
  if (!s || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(s)) {
    return `profile_${Date.now()}`;
  }
  return s;
}

function readAppSettings() {
  const settingsPath = getGlobalAppSettingsPath();
  try {
    if (fs.existsSync(settingsPath)) {
      const raw = fs.readFileSync(settingsPath, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    }
  } catch (_) {
    /* ignore */
  }
  return { active_profile_id: "private", profiles: [...DEFAULT_PROFILES] };
}

function writeAppSettings(settings) {
  const root = getCortexLogAppRoot();
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(getGlobalAppSettingsPath(), JSON.stringify(settings, null, 2), "utf8");
}

function ensureDefaultProfiles() {
  const settings = readAppSettings();
  if (!Array.isArray(settings.profiles) || settings.profiles.length === 0) {
    settings.profiles = [...DEFAULT_PROFILES];
  }
  const ids = new Set(settings.profiles.map((p) => p.id));
  for (const def of DEFAULT_PROFILES) {
    if (!ids.has(def.id)) {
      settings.profiles.push({ ...def });
    }
  }
  if (!settings.active_profile_id || !settings.profiles.some((p) => p.id === settings.active_profile_id)) {
    settings.active_profile_id = "private";
  }
  writeAppSettings(settings);
  for (const p of settings.profiles) {
    fs.mkdirSync(getProfileDataDir(p.id), { recursive: true });
  }
  return settings;
}

function getActiveProfileId() {
  const settings = ensureDefaultProfiles();
  return settings.active_profile_id || "private";
}

function getActiveProfile() {
  const settings = ensureDefaultProfiles();
  const id = settings.active_profile_id || "private";
  const found = settings.profiles.find((p) => p.id === id);
  return found || { id: "private", label: "Private" };
}

function getProfileDataDir(profileId) {
  const pid = slugifyProfileId(profileId);
  return path.join(getCortexLogAppRoot(), "profiles", pid, "data");
}

function getProfileBackendEnv() {
  return { ...process.env, AIC_PROFILE_ID: getActiveProfileId() };
}

function getApiTokenPath() {
  return path.join(getProfileDataDir(getActiveProfileId()), "api_token");
}

function migrateLegacyApiTokenIfNeeded() {
  try {
    const privateToken = path.join(getProfileDataDir("private"), "api_token");
    if (fs.existsSync(privateToken)) return;
    const candidates = [
      path.join(getLegacyFlatDataDir(), "api_token"),
      path.join(__dirname, "..", "aic-backend", "data", "api_token"),
    ];
    if (app.isPackaged) {
      candidates.unshift(
        path.join(process.resourcesPath, "backend", "data", "api_token"),
      );
    }
    for (const legacyPath of candidates) {
      if (!legacyPath || !fs.existsSync(legacyPath)) continue;
      fs.mkdirSync(path.dirname(privateToken), { recursive: true });
      fs.copyFileSync(legacyPath, privateToken);
      return;
    }
  } catch (_) {
    /* ignore */
  }
}

function notifyProfileChanged() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("aic:profile-changed", getActiveProfile());
  }
}

function killProcessTree(proc) {
  if (!proc || proc.killed || !proc.pid) return;
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: "ignore", windowsHide: true });
      return;
    }
  } catch (_) {
    /* fallback to direct kill below */
  }
  try {
    proc.kill();
  } catch (_) {
    /* ignore */
  }
}

function killOwnedBackend() {
  killProcessTree(backendProcess);
  backendProcess = null;
  backendStartedByApp = false;
}

function attachBackendProcessHandlers(proc, label) {
  if (!proc) return;
  proc.on("error", (err) => {
    console.error(`${label} failed to start:`, err);
    if (backendProcess === proc) {
      backendProcess = null;
      backendStartedByApp = false;
    }
  });
  proc.on("exit", () => {
    if (backendProcess === proc) {
      backendProcess = null;
      backendStartedByApp = false;
    }
  });
}

function attachOllamaProcessHandlers(proc) {
  if (!proc) return;
  proc.on("error", (err) => {
    console.error("Ollama failed to start:", err);
    if (ollamaProcess === proc) {
      ollamaProcess = null;
      ollamaStarting = false;
    }
  });
  proc.on("exit", () => {
    if (ollamaProcess === proc) {
      ollamaProcess = null;
      ollamaStarting = false;
    }
  });
}

const startBackendIfAvailable = () => {
  const backendPath = path.join(process.resourcesPath, "backend", "aic-backend.exe");
  if (!fs.existsSync(backendPath)) {
    return;
  }
  backendProcess = spawn(backendPath, [], {
    stdio: "ignore",
    env: getProfileBackendEnv(),
  });
  attachBackendProcessHandlers(backendProcess, "Backend");
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
    env: getProfileBackendEnv(),
  });
  attachBackendProcessHandlers(backendProcess, "Backend");
  backendStartedByApp = true;
};

function shouldForceOwnBackend() {
  return (
    process.env.ELECTRON_DEV === "1" ||
    process.env.VITE_DEV === "1" ||
    !app.isPackaged
  );
}

async function fetchBackendHealth() {
  try {
    const res = await fetch(BACKEND_HEALTH_URL);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function isCortexLogHealth(data) {
  if (!data || data.status !== "ok") return false;
  if (data.service === CORTEXLOG_SERVICE) return true;
  return data.profile_id != null && data.data_dir != null;
}

async function getBackendHealthState() {
  const data = await fetchBackendHealth();
  if (!isCortexLogHealth(data)) {
    return { running: false, profileMatch: false, data: null };
  }
  return {
    running: true,
    profileMatch: String(data.profile_id || "") === getActiveProfileId(),
    data,
  };
}

function getListeningPidsOnPort(port) {
  const pids = new Set();
  try {
    const out = execSync("netstat -ano -p tcp", { encoding: "utf8", windowsHide: true });
    const needle = `:${port}`;
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes("LISTENING") || !line.includes(needle)) continue;
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (/^\d+$/.test(pid)) pids.add(parseInt(pid, 10));
    }
  } catch (_) {
    /* ignore */
  }
  return [...pids];
}

function killPidTree(pid) {
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore", windowsHide: true });
    } else {
      process.kill(pid, "SIGTERM");
    }
    return true;
  } catch (_) {
    return false;
  }
}

async function killCortexLogBackendOnPort() {
  const health = await fetchBackendHealth();
  if (health && !isCortexLogHealth(health)) {
    return { killed: false, reason: "foreign_service" };
  }
  if (health) {
    const pids = getListeningPidsOnPort(BACKEND_PORT);
    for (const pid of pids) {
      killPidTree(pid);
    }
  }
  killOwnedBackend();
  for (let i = 0; i < 30; i += 1) {
    if (!(await fetchBackendHealth())) {
      return { killed: true };
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return { killed: false, reason: "still_running" };
}

const checkBackendHealth = async () => {
  const state = await getBackendHealthState();
  return state.running && state.profileMatch;
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
  attachOllamaProcessHandlers(ollamaProcess);
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

const waitForBackendProfileMatch = async (maxAttempts = 40) => {
  for (let i = 0; i < maxAttempts; i += 1) {
    if (await checkBackendHealth()) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
};

function spawnOwnedBackend() {
  if (app.isPackaged) {
    startBackendIfAvailable();
  } else {
    startBackendForDev();
  }
}

const ensureBackendRunning = async () => {
  if (backendStarting) return;
  backendStarting = true;
  try {
    const force = shouldForceOwnBackend();
    const state = await getBackendHealthState();

    if (force) {
      if (state.running && state.profileMatch && backendStartedByApp) {
        return;
      }
      if (state.running) {
        const killResult = await killCortexLogBackendOnPort();
        if (killResult.reason === "foreign_service") {
          console.error(
            `Port ${BACKEND_PORT} is in use by a non-CortexLog service. Stop it and retry.`,
          );
          return;
        }
      } else if (backendProcess) {
        killOwnedBackend();
      }
      spawnOwnedBackend();
      await waitForBackendProfileMatch();
      return;
    }

    if (state.running && state.profileMatch) {
      return;
    }
    if (state.running && !state.profileMatch) {
      await restartOwnedBackend();
      return;
    }
    spawnOwnedBackend();
    await waitForBackendProfileMatch();
  } finally {
    backendStarting = false;
  }
};

async function restartOwnedBackend() {
  if (shouldForceOwnBackend()) {
    const killResult = await killCortexLogBackendOnPort();
    if (killResult.reason === "foreign_service") {
      throw new Error(
        `Port ${BACKEND_PORT} is in use by another service. Cannot switch CortexLog profile.`,
      );
    }
  } else {
    killOwnedBackend();
    await new Promise((r) => setTimeout(r, 500));
  }
  spawnOwnedBackend();
  const ok = await waitForBackendProfileMatch();
  if (!ok) {
    throw new Error("Backend did not restart for the selected profile.");
  }
  await syncModifyEngineSourceFolder();
}

const monitorBackend = () => {
  setInterval(async () => {
    const state = await getBackendHealthState();
    if (state.running && state.profileMatch) return;
    if (backendStartedByApp || shouldForceOwnBackend()) {
      try {
        await restartOwnedBackend();
      } catch (e) {
        console.error("Backend monitor restart failed:", e);
      }
    }
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

ipcMain.handle("aic:get-api-key", async () => {
  const tokenPath = getApiTokenPath();
  try {
    if (fs.existsSync(tokenPath)) {
      return fs.readFileSync(tokenPath, "utf8").trim();
    }
  } catch (err) {
    return null;
  }
  return null;
});

ipcMain.handle("aic:get-profiles", async () => {
  const settings = ensureDefaultProfiles();
  return {
    active_profile_id: settings.active_profile_id,
    profiles: settings.profiles,
    active_profile: getActiveProfile(),
  };
});

ipcMain.handle("aic:get-active-profile", async () => getActiveProfile());

ipcMain.handle("aic:create-profile", async (_event, label) => {
  const title = String(label || "").trim();
  if (!title) {
    return { ok: false, detail: "Profile name is required." };
  }
  const settings = ensureDefaultProfiles();
  let id = slugifyProfileId(title);
  const existing = new Set(settings.profiles.map((p) => p.id));
  if (existing.has(id)) {
    let n = 2;
    while (existing.has(`${id}_${n}`)) n += 1;
    id = `${id}_${n}`;
  }
  settings.profiles.push({ id, label: title });
  writeAppSettings(settings);
  fs.mkdirSync(getProfileDataDir(id), { recursive: true });
  return { ok: true, profile: { id, label: title } };
});

ipcMain.handle("aic:rename-profile", async (_event, payload) => {
  const profileId = payload?.id;
  const label = String(payload?.label || "").trim();
  if (!profileId || !label) {
    return { ok: false, detail: "Profile id and name are required." };
  }
  const settings = ensureDefaultProfiles();
  const profile = settings.profiles.find((p) => p.id === profileId);
  if (!profile) {
    return { ok: false, detail: "Profile not found." };
  }
  profile.label = label;
  writeAppSettings(settings);
  return { ok: true, profile: { id: profile.id, label: profile.label } };
});

ipcMain.handle("aic:switch-profile", async (_event, profileId) => {
  const settings = ensureDefaultProfiles();
  const target = settings.profiles.find((p) => p.id === profileId);
  if (!target) {
    return { ok: false, detail: "Profile not found." };
  }
  if (settings.active_profile_id === profileId) {
    return { ok: true, active_profile: target, restarted: false };
  }

  settings.active_profile_id = profileId;
  writeAppSettings(settings);
  fs.mkdirSync(getProfileDataDir(profileId), { recursive: true });

  try {
    await restartOwnedBackend();
  } catch (e) {
    return {
      ok: false,
      detail: e instanceof Error ? e.message : "Could not restart backend for profile switch.",
    };
  }

  notifyProfileChanged();
  return {
    ok: true,
    active_profile: target,
    restarted: true,
  };
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
          { stdio: "ignore" },
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
  await waitForBackendProfileMatch();
  try {
    await fetch(`http://${BACKEND_HOST}:${BACKEND_PORT}/modify/engine/settings`, {
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
    if (!fs.existsSync(distHtml)) {
      dialog.showErrorBox(
        "CortexLog renderer missing",
        "renderer-dist/index.html was not found. Run npm run renderer:build or npm run dev.",
      );
      app.quit();
      return;
    }
    mainWindow.loadFile(distHtml);
  }

  mainWindow.on("maximize", () => {
    const display = screen.getDisplayMatching(mainWindow.getBounds());
    if (display && display.workArea) {
      mainWindow.setBounds(display.workArea);
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
};

const openSettingsWindow = (tab = "profile") => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("aic:open-settings", tab);
    mainWindow.focus();
  }
};

const openModifyMode = () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("aic:switch-mode", "modify");
    mainWindow.focus();
  }
};

const setApplicationMenu = () => {
  const template = [
    {
      label: "File",
      submenu: [
        {
          label: "Modify",
          accelerator: "CmdOrCtrl+M",
          click: () => openModifyMode(),
        },
        {
          label: "Preferences",
          accelerator: "CmdOrCtrl+,",
          click: () => openSettingsWindow("preferences"),
        },
        {
          label: "Settings",
          click: () => openSettingsWindow(),
        },
        { type: "separator" },
        { role: "quit" },
      ],
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
  ensureDefaultProfiles();
  migrateLegacyApiTokenIfNeeded();
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

app.on("before-quit", () => {
  killOwnedBackend();
});

app.on("window-all-closed", () => {
  killOwnedBackend();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
