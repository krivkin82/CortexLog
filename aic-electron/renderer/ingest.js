const API_BASE = "http://127.0.0.1:8000";
const apiFetch = async (url, options = {}) => {
  const key = window.aic?.getApiKey ? await window.aic.getApiKey() : null;
  const headers = { ...options.headers };
  if (key) headers["X-API-Key"] = key;
  return fetch(url, { ...options, headers });
};

let connectorSettings = {
  local: { enabled: true, folders: [] },
  gmail: { enabled: false },
  facebook: { enabled: false, exportPath: "" },
  youtube: { enabled: false, exportPath: "" },
};

const toggleLocal = document.getElementById("toggle-local");
const toggleGmail = document.getElementById("toggle-gmail");
const toggleFacebook = document.getElementById("toggle-facebook");
const toggleYoutube = document.getElementById("toggle-youtube");
const facebookPath = document.getElementById("facebook-path");
const youtubePath = document.getElementById("youtube-path");
const foldersList = document.getElementById("folders-list");
const runLocalIngestButton = document.getElementById("run-local-ingest");
const ingestProgress = document.getElementById("ingest-progress");
const saveSettingsButton = document.getElementById("save-settings");

const loadSettings = async () => {
  try {
    const res = await apiFetch(`${API_BASE}/settings/connectors`);
    const data = res.ok ? await res.json() : { setting: null };
    if (data.setting && data.setting.value) {
      connectorSettings = data.setting.value;
      if (connectorSettings.gmail && "accessToken" in connectorSettings.gmail) {
        delete connectorSettings.gmail.accessToken;
      }
    }
  } catch (error) {}
  renderSettings();
};

const renderSettings = () => {
  toggleLocal.checked = connectorSettings.local?.enabled ?? true;
  toggleGmail.checked = connectorSettings.gmail?.enabled ?? false;
  toggleFacebook.checked = connectorSettings.facebook?.enabled ?? false;
  toggleYoutube.checked = connectorSettings.youtube?.enabled ?? false;
  facebookPath.value = connectorSettings.facebook?.exportPath ?? "";
  youtubePath.value = connectorSettings.youtube?.exportPath ?? "";
  renderFolders(connectorSettings.local?.folders ?? []);
};

const renderFolders = (folders) => {
  foldersList.innerHTML = "";
  if (!folders.length) {
    foldersList.textContent = "No folders selected.";
    return;
  }
  folders.forEach((folder, index) => {
    const row = document.createElement("div");
    row.className = "folder-row";
    row.textContent = folder;
    const removeBtn = document.createElement("button");
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", () => {
      connectorSettings.local.folders.splice(index, 1);
      renderFolders(connectorSettings.local.folders);
    });
    row.appendChild(removeBtn);
    foldersList.appendChild(row);
  });
};

const saveSettings = async () => {
  connectorSettings = {
    local: { enabled: toggleLocal.checked, folders: connectorSettings.local?.folders ?? [] },
    gmail: { enabled: toggleGmail.checked },
    facebook: { enabled: toggleFacebook.checked, exportPath: facebookPath.value.trim() },
    youtube: { enabled: toggleYoutube.checked, exportPath: youtubePath.value.trim() },
  };
  await apiFetch(`${API_BASE}/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: "connectors", value: connectorSettings }),
  });
};

const addFolder = async () => {
  if (!window.aic?.selectFolder) return;
  const folder = await window.aic.selectFolder();
  if (folder) {
    connectorSettings.local.folders.push(folder);
    renderFolders(connectorSettings.local.folders);
  }
};

const pickFacebookPath = async () => {
  if (!window.aic?.selectPath) return;
  const path = await window.aic.selectPath();
  if (path) facebookPath.value = path;
};

const pickYoutubePath = async () => {
  if (!window.aic?.selectFolder) return;
  const path = await window.aic.selectFolder();
  if (path) youtubePath.value = path;
};

const appendProgress = (text, isError = false) => {
  const line = document.createElement("div");
  line.textContent = text;
  if (isError) line.className = "ingest-error";
  ingestProgress.appendChild(line);
  ingestProgress.scrollTop = ingestProgress.scrollHeight;
};

const runLocalIngest = async () => {
  ingestProgress.innerHTML = "";
  ingestProgress.className = "ingest-progress";
  const folders = connectorSettings.local?.folders ?? [];
  if (!folders.length) {
    appendProgress("Add at least one folder.", true);
    return;
  }
  runLocalIngestButton.disabled = true;
  let lastResults = [];
  try {
    const res = await apiFetch(`${API_BASE}/ingest/local/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths: folders }),
    });
    if (!res.ok) {
      appendProgress("Ingest failed.", true);
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const ev = JSON.parse(line);
          if (ev.event === "started") appendProgress(`Starting ingest (${ev.total} files)...`);
          else if (ev.event === "file_start") appendProgress(`Processing: ${ev.path}`);
          else if (ev.event === "file_done") appendProgress(`  → ${ev.status || "?"}${ev.reason ? " — " + ev.reason : ""}`);
          else if (ev.event === "error") appendProgress(ev.message || "Error", true);
          else if (ev.event === "complete") lastResults = ev.results || [];
        } catch (e) {}
      }
    }
    const failures = lastResults.filter((r) => r.status === "failed");
    if (failures.length) failures.forEach((f) => appendProgress(`${f.path} — ${f.reason || "unknown"}`, true));
    else appendProgress("Ingest complete.");
  } catch (err) {
    appendProgress("Ingest failed: " + (err?.message || "Unknown error"), true);
  } finally {
    runLocalIngestButton.disabled = false;
  }
};

const runGmailIngest = async () => {
  const password = window.prompt("Enter your application password:");
  if (!password) return;
  runGmailIngestButton.disabled = true;
  ingestProgress.innerHTML = "";
  ingestProgress.className = "ingest-progress";
  try {
    const saltRes = await apiFetch(`${API_BASE}/auth/salt`);
    if (!saltRes.ok) { appendProgress("Failed to get salt.", true); return; }
    const { salt } = await saltRes.json();
    const passwordHash = await hashPasswordForVerify(password, salt);
    const verifyRes = await apiFetch(`${API_BASE}/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password_hash: passwordHash }),
    });
    const verifyData = await verifyRes.json().catch(() => ({}));
    if (!verifyData.ok) { appendProgress("Incorrect password.", true); return; }
    const derivedKey = await deriveFernetKey(password, salt);
    const getRes = await apiFetch(`${API_BASE}/secrets/get-with-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "gmail_access_token", derived_key: derivedKey }),
    });
    const getData = await getRes.json().catch(() => ({}));
    const token = getData.value;
    if (!token) { appendProgress("No Gmail token stored. Add it in File > Settings > Connections > Gmail.", true); return; }
    appendProgress("Running Gmail ingest...");
    const ingestRes = await apiFetch(`${API_BASE}/ingest/gmail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: token, user_id: "me", include_body: false, max_results: 50 }),
    });
    if (!ingestRes.ok) { appendProgress("Gmail ingest failed.", true); return; }
    const results = await ingestRes.json().catch(() => ({}));
    const count = Array.isArray(results.results) ? results.results.length : 0;
    appendProgress(`Gmail ingest complete. ${count} messages processed.`);
  } catch (err) {
    appendProgress("Gmail ingest failed: " + (err?.message || "Unknown error"), true);
  } finally {
    runGmailIngestButton.disabled = false;
  }
};

const runGmailIngestButton = document.getElementById("run-gmail-ingest");
document.getElementById("add-folder").addEventListener("click", addFolder);
document.getElementById("pick-facebook").addEventListener("click", pickFacebookPath);
document.getElementById("pick-youtube").addEventListener("click", pickYoutubePath);
saveSettingsButton.addEventListener("click", saveSettings);
runLocalIngestButton.addEventListener("click", runLocalIngest);
runGmailIngestButton.addEventListener("click", runGmailIngest);

loadSettings();
