const statusEl = document.getElementById("backend-status");
const llmStatusEl = document.getElementById("llm-status");
const llmStatusWrapEl = document.getElementById("llm-status-wrap");
const journalInput = document.getElementById("journal-input");
const journalSave = document.getElementById("journal-save");
const journalList = document.getElementById("journal-list");
const chatInput = document.getElementById("chat-input");
const chatSend = document.getElementById("chat-send");
const chatLog = document.getElementById("chat-log");
const chatCitations = document.getElementById("chat-citations");
const insightsList = document.getElementById("insights-list");
const entitiesList = document.getElementById("entities-list");
const relationsList = document.getElementById("relations-list");
const conflictsList = document.getElementById("conflicts-list");
const sessionNudge = document.getElementById("session-nudge");
const settingsToggle = document.getElementById("settings-toggle");
const settingsBody = document.getElementById("settings-body");
const openFilteredButton = document.getElementById("open-filtered");
const filteredCount = document.getElementById("filtered-count");
const refreshKnowledgeButton = document.getElementById("refresh-knowledge");
const knowledgeDetail = document.getElementById("knowledge-detail");
const toggleLocal = document.getElementById("toggle-local");
const toggleGmail = document.getElementById("toggle-gmail");
const toggleFacebook = document.getElementById("toggle-facebook");
const toggleYoutube = document.getElementById("toggle-youtube");
const gmailToken = document.getElementById("gmail-token");
const facebookPath = document.getElementById("facebook-path");
const youtubePath = document.getElementById("youtube-path");
const saveSettingsButton = document.getElementById("save-settings");
const addFolderButton = document.getElementById("add-folder");
const foldersList = document.getElementById("folders-list");
const runLocalIngestButton = document.getElementById("run-local-ingest");
const ingestProgress = document.getElementById("ingest-progress");
const pickFacebookButton = document.getElementById("pick-facebook");
const pickYoutubeButton = document.getElementById("pick-youtube");
const journalReflectBtn = document.getElementById("journal-reflect");

const API_BASE = "http://127.0.0.1:8000";
const OLLAMA_TAGS_URL = "http://localhost:11434/api/tags";
const SESSION_STORAGE_KEY = "aic-chat-session";
const LLM_UNAVAILABLE_MSG =
  "LLM unavailable. Check that Ollama is running and the model is installed.";

const getChatSessionId = () => {
  let id = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : "session-" + Date.now() + "-" + Math.random().toString(36).slice(2);
    localStorage.setItem(SESSION_STORAGE_KEY, id);
  }
  return id;
};

let connectorSettings = {
  local: { enabled: true, folders: [] },
  gmail: { enabled: false, accessToken: "" },
  facebook: { enabled: false, exportPath: "" },
  youtube: { enabled: false, exportPath: "" },
};

const setStatus = (text, ok) => {
  statusEl.textContent = ok ? "Ok" : "Off";
  statusEl.className = ok ? "ok" : "error";
};

const setLLMStatus = (text, ok) => {
  llmStatusEl.textContent = ok ? "Online" : "Offline";
  llmStatusEl.className = ok ? "ok" : "error";
};

const checkBackend = async () => {
  try {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) {
      setStatus("Off", false);
      return;
    }
    const data = await res.json();
    setStatus("Ok", true);
  } catch (error) {
    setStatus("Off", false);
  }
};

const setLLMTooltip = (text) => {
  if (llmStatusWrapEl) llmStatusWrapEl.title = text || "";
};

/** When backend has no /health/llm (404), probe Ollama directly so status still works. */
const checkOllamaDirect = async () => {
  try {
    const r = await fetch(OLLAMA_TAGS_URL);
    if (r.ok) {
      setLLMStatus("Online", true);
      setLLMTooltip("Ollama is running. Restart the backend from the current project for full LLM check.");
    } else {
      setLLMStatus("Offline", false);
      setLLMTooltip("Ollama is offline. Ollama returned " + r.status + ".");
    }
  } catch (e) {
    setLLMStatus("Offline", false);
    setLLMTooltip("Ollama is offline. Start Ollama (ollama serve) to use the LLM.");
  }
};

const checkLLM = async () => {
  setLLMTooltip("");
  try {
    const res = await fetch(`${API_BASE}/health/llm`);
    const data = await res.json().catch(() => ({}));
    const errFromBody = data && typeof data.error === "string" ? data.error : "";
    if (res.status === 404) {
      await checkOllamaDirect();
      return;
    }
    if (!res.ok) {
      setLLMStatus("Offline", false);
      setLLMTooltip(errFromBody ? errFromBody : "Ollama is offline. Backend returned " + res.status);
      return;
    }
    if (data.status === "ok") {
      setLLMStatus("Online", true);
      setLLMTooltip("");
      return;
    }
    setLLMStatus("Offline", false);
    setLLMTooltip(errFromBody ? errFromBody : "Ollama is offline.");
  } catch (error) {
    setLLMStatus("Offline", false);
    setLLMTooltip("Ollama is offline. " + ((error && error.message) ? error.message : "Network or backend unreachable"));
  }
};

const formatJournalTimestamp = (isoString) => {
  if (!isoString) return "";
  try {
    const d = new Date(isoString);
    return isNaN(d.getTime()) ? isoString : d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  } catch {
    return isoString;
  }
};

const renderJournalEntries = (entries) => {
  journalList.innerHTML = "";
  entries.forEach((entry) => {
    const li = document.createElement("li");
    const ts = formatJournalTimestamp(entry.created_at);
    li.innerHTML = ts ? `<span class="journal-entry-time">${escapeHtml(ts)}</span><br>${escapeHtml(entry.content || "")}` : escapeHtml(entry.content || "");
    journalList.appendChild(li);
  });
};

const loadJournalEntries = async () => {
  try {
    const res = await fetch(`${API_BASE}/journal`);
    if (!res.ok) return;
    const data = await res.json();
    renderJournalEntries(data.entries || []);
  } catch (error) {
    // noop
  }
};

const saveJournalEntry = async () => {
  const content = journalInput.value.trim();
  if (!content) return;
  const saveRes = await fetch(`${API_BASE}/journal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!saveRes.ok) {
    const err = await saveRes.json().catch(() => ({}));
    alert("Could not save entry. " + (err.detail || saveRes.statusText || "Try again."));
    return;
  }
  journalInput.value = "";
  await loadJournalEntries();
};

const renderMessageContent = (text) => {
  if (!text) return "";
  const raw = String(text);
  let html;
  if (typeof window !== "undefined" && window.marked) {
    try {
      html = window.marked.parse(raw);
    } catch (e) {
      html = escapeHtml(raw);
    }
  } else {
    html = escapeHtml(raw);
  }
  if (typeof window !== "undefined" && window.DOMPurify) {
    html = window.DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ["p", "br", "strong", "em", "b", "i", "ul", "ol", "li", "code", "pre", "h1", "h2", "h3", "h4", "a", "span", "div", "blockquote"],
      ALLOWED_ATTR: ["href", "target"],
    });
  }
  return html;
};

const escapeHtml = (str) => {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
};

const appendChatMessage = (message) => {
  const div = document.createElement("div");
  div.className = `chat-message ${message.role}`;
  const inner = document.createElement("div");
  inner.className = "chat-message-content";
  inner.innerHTML = renderMessageContent(message.content);
  div.appendChild(inner);
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
};

const loadChatHistory = async () => {
  const sessionId = getChatSessionId();
  try {
    const res = await fetch(`${API_BASE}/chat?session_id=${encodeURIComponent(sessionId)}`);
    if (!res.ok) return;
    const data = await res.json();
    (data.messages || []).forEach(appendChatMessage);
  } catch (error) {
    // noop
  }
};

const sendChatMessage = async () => {
  const content = chatInput.value.trim();
  if (!content) return;
  const sessionId = getChatSessionId();
  const res = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, mode: "journal", session_id: sessionId }),
  });
  chatInput.value = "";
  if (res.status === 503) {
    const data = await res.json().catch(() => ({}));
    alert(LLM_UNAVAILABLE_MSG + (data.detail ? " " + data.detail : ""));
    return;
  }
  if (res.ok) {
    const data = await res.json();
    (data.messages || []).forEach(appendChatMessage);
    renderCitations(data.citations || []);
  }
};

const renderCitations = (citations) => {
  if (!citations.length) {
    chatCitations.textContent = "";
    return;
  }
  chatCitations.innerHTML = "<strong>Sources:</strong> " + citations.map((c) => c.label).join(", ");
};

const reflectOnJournal = async () => {
  const unsaved = journalInput.value.trim();
  if (unsaved) {
    const saveRes = await fetch(`${API_BASE}/journal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: unsaved }),
    });
    journalInput.value = "";
    await loadJournalEntries();
    if (!saveRes.ok) {
      alert("Could not save entry. Save an entry first, then use Reflect on this.");
      return;
    }
  }
  const listRes = await fetch(`${API_BASE}/journal`);
  const listData = listRes.ok ? await listRes.json().catch(() => ({})) : {};
  const entries = listData.entries || [];
  const latestId = entries.length ? entries[0].id : null;
  if (!latestId) {
    alert("No journal entry found. Save an entry first.");
    return;
  }
  const res = await fetch(`${API_BASE}/journal/reflect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entry_id: latestId }),
  });
  if (res.status === 503) {
    const data = await res.json().catch(() => ({}));
    alert(LLM_UNAVAILABLE_MSG + (data.detail ? " " + data.detail : ""));
    return;
  }
  if (res.status === 404) {
    alert("No journal entry found. Save an entry first.");
    return;
  }
  if (!res.ok) return;
  const data = await res.json();
  const text = data.text || "";
  if (text) {
    appendChatMessage({
      role: "assistant",
      content: "[Reflection on your journal]\n\n" + text,
    });
  }
};

const loadProposedInsights = async () => {
  try {
    const res = await fetch("http://127.0.0.1:8000/proposed_insights?status=pending");
    if (!res.ok) return;
    const data = await res.json();
    renderProposedInsights(data.insights || []);
    await loadFilteredCount();
  } catch (error) {
    // noop
  }
};

const renderProposedInsights = (insights) => {
  insightsList.innerHTML = "";
  if (!insights.length) {
    insightsList.textContent = "No pending insights.";
    return;
  }
  insights.forEach((insight) => {
    const wrapper = document.createElement("div");
    wrapper.className = "insight-item";

    const content = document.createElement("div");
    content.className = "insight-content";
    content.textContent = insight.content;

    const actions = document.createElement("div");
    actions.className = "insight-actions";

    const acceptBtn = document.createElement("button");
    acceptBtn.textContent = "Accept";
    acceptBtn.addEventListener("click", () => updateInsight(insight.id, "accepted"));

    const rejectBtn = document.createElement("button");
    rejectBtn.textContent = "Reject";
    rejectBtn.addEventListener("click", () => updateInsight(insight.id, "rejected"));

    const laterBtn = document.createElement("button");
    laterBtn.textContent = "Later";
    laterBtn.addEventListener("click", () => updateInsight(insight.id, "later"));

    const irrelevantBtn = document.createElement("button");
    irrelevantBtn.textContent = "Irrelevant";
    irrelevantBtn.addEventListener("click", () => updateInsight(insight.id, "irrelevant", "manual"));

    actions.appendChild(acceptBtn);
    actions.appendChild(rejectBtn);
    actions.appendChild(laterBtn);
    actions.appendChild(irrelevantBtn);

    wrapper.appendChild(content);
    wrapper.appendChild(actions);
    insightsList.appendChild(wrapper);
  });
};

const updateInsight = async (insightId, status, reason = null) => {
  await fetch("http://127.0.0.1:8000/proposed_insights/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ insight_id: insightId, status, reason }),
  });
  loadProposedInsights();
};

const loadFilteredCount = async () => {
  const res = await fetch("http://127.0.0.1:8000/proposed_insights/filtered");
  if (!res.ok) {
    filteredCount.textContent = "";
    return;
  }
  const data = await res.json();
  const count = (data.insights || []).length;
  filteredCount.textContent = count ? `${count} filtered` : "";
};

const openFilteredWindow = async () => {
  const res = await fetch("http://127.0.0.1:8000/proposed_insights/filtered");
  if (!res.ok) return;
  const data = await res.json();
  const list = data.insights || [];
  const win = window.open("", "filtered", "width=900,height=700");
  if (!win) return;
  win.document.write("<h2>Filtered Insights</h2>");
  win.document.write("<div id='filtered-container'></div>");
  const container = win.document.getElementById("filtered-container");
  list.forEach((insight) => {
    const wrapper = win.document.createElement("div");
    wrapper.style.border = "1px solid #ddd";
    wrapper.style.padding = "8px";
    wrapper.style.marginBottom = "8px";
    const reason = (insight.feedback && insight.feedback[0] && insight.feedback[0].reason) || "unknown";
    wrapper.innerHTML = `<div><strong>${insight.content}</strong></div><div>Reason: ${reason}</div>`;
    const restoreBtn = win.document.createElement("button");
    restoreBtn.textContent = "Restore";
    restoreBtn.onclick = async () => {
      await fetch("http://127.0.0.1:8000/proposed_insights/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ insight_id: insight.id }),
      });
      restoreBtn.disabled = true;
      restoreBtn.textContent = "Restored";
    };
    wrapper.appendChild(restoreBtn);
    container.appendChild(wrapper);
  });
};

const loadKnowledgeMap = async (runCleanup = false) => {
  try {
    if (runCleanup) {
      await fetch("http://127.0.0.1:8000/knowledge/entities/cleanup", {
        method: "POST",
      });
    }
    let [entitiesRes, relationsRes, conflictsRes] = await Promise.all([
      fetch("http://127.0.0.1:8000/knowledge/entities?source=llm"),
      fetch("http://127.0.0.1:8000/knowledge/relations"),
      fetch("http://127.0.0.1:8000/conflicts?status=pending"),
    ]);
    const entitiesData = entitiesRes.ok ? await entitiesRes.json() : { entities: [] };
    const relationsData = relationsRes.ok ? await relationsRes.json() : { relations: [] };
    const conflictsData = conflictsRes.ok ? await conflictsRes.json() : { conflicts: [] };
    renderEntities(entitiesData.entities || []);
    renderRelations(relationsData.relations || []);
    renderConflicts(conflictsData.conflicts || []);
  } catch (error) {
    // noop
  }
};

const renderEntities = (entities) => {
  entitiesList.innerHTML = "";
  if (!entities.length) {
    const hint =
      !connectorSettings.local?.folders?.length
        ? "Add a folder in Settings and run Local Ingest to populate the Knowledge Map."
        : "No entities yet. Run Local Ingest to analyze your files.";
    entitiesList.textContent = hint;
    return;
  }
  entities.forEach((entity) => {
    const wrapper = document.createElement("div");
    wrapper.className = "entity-item";

    const labelInput = document.createElement("input");
    labelInput.value = entity.label || "";
    labelInput.className = "entity-input";

    const typeLabel = document.createElement("span");
    typeLabel.textContent = entity.type || "unknown";
    typeLabel.className = "entity-type";

    const saveBtn = document.createElement("button");
    saveBtn.textContent = "Save";
    saveBtn.addEventListener("click", () => updateEntity(entity.id, labelInput.value));

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => deleteEntity(entity.id));

    const viewBtn = document.createElement("button");
    viewBtn.textContent = "View";
    viewBtn.addEventListener("click", () => showEntityDetails(entity));

    wrapper.appendChild(typeLabel);
    wrapper.appendChild(labelInput);
    wrapper.appendChild(saveBtn);
    wrapper.appendChild(deleteBtn);
    wrapper.appendChild(viewBtn);
    entitiesList.appendChild(wrapper);
  });
};

const renderRelations = (relations) => {
  relationsList.innerHTML = "";
  if (!relations.length) {
    relationsList.textContent = "No relations yet.";
    return;
  }
  relations.forEach((relation) => {
    const wrapper = document.createElement("div");
    wrapper.className = "relation-item";
    wrapper.textContent = `${relation.from_entity_id} ${relation.relation_type} ${relation.to_entity_id}`;

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => deleteRelation(relation.id));

    wrapper.appendChild(deleteBtn);
    relationsList.appendChild(wrapper);
  });
};

const updateEntity = async (entityId, label) => {
  await fetch("http://127.0.0.1:8000/knowledge/entities/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entity_id: entityId, label }),
  });
  loadKnowledgeMap();
};

const deleteEntity = async (entityId) => {
  await fetch("http://127.0.0.1:8000/knowledge/entities/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entity_id: entityId }),
  });
  loadKnowledgeMap();
};

const deleteRelation = async (relationId) => {
  await fetch("http://127.0.0.1:8000/knowledge/relations/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ relation_id: relationId }),
  });
  loadKnowledgeMap();
};

const renderConflicts = (conflicts) => {
  conflictsList.innerHTML = "";
  if (!conflicts.length) {
    conflictsList.textContent = "No pending conflicts.";
    return;
  }
  conflicts.forEach((conflict) => {
    const wrapper = document.createElement("div");
    wrapper.className = "conflict-item";
    wrapper.textContent = `${conflict.entity_id} vs ${conflict.conflicting_entity_id} (${conflict.reason})`;

    const keepBtn = document.createElement("button");
    keepBtn.textContent = "Keep both";
    keepBtn.addEventListener("click", () => updateConflict(conflict.id, "resolved_keep_both"));

    const preferBtn = document.createElement("button");
    preferBtn.textContent = "Prefer one";
    preferBtn.addEventListener("click", () => updateConflict(conflict.id, "resolved_prefer_one"));

    const unsureBtn = document.createElement("button");
    unsureBtn.textContent = "Mark uncertain";
    unsureBtn.addEventListener("click", () => updateConflict(conflict.id, "uncertain"));

    wrapper.appendChild(keepBtn);
    wrapper.appendChild(preferBtn);
    wrapper.appendChild(unsureBtn);
    conflictsList.appendChild(wrapper);
  });
};

const updateConflict = async (conflictId, status) => {
  await fetch("http://127.0.0.1:8000/conflicts/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conflict_id: conflictId, status }),
  });
  loadKnowledgeMap();
};

const showEntityDetails = async (entity) => {
  knowledgeDetail.textContent = "Loading details...";
  try {
    const res = await fetch(
      `http://127.0.0.1:8000/knowledge/entities/${entity.id}/provenance`
    );
    const data = res.ok ? await res.json() : { provenance: [] };
    const prov = data.provenance || [];
    const provText = prov.length
      ? prov
          .map((item) => {
            const path = item.source_path || item.source_item_id || "(unknown)";
            return `${item.classification} (${item.confidence}) — ${path}`;
          })
          .join("\n")
      : "No provenance yet.";
    knowledgeDetail.textContent = `Entity: ${entity.label}\nType: ${entity.type}\n\nSources:\n${provText}`;
  } catch (error) {
    knowledgeDetail.textContent = "Failed to load details.";
  }
};

const loadSettings = async () => {
  try {
    const res = await fetch("http://127.0.0.1:8000/settings/connectors");
    const data = res.ok ? await res.json() : { setting: null };
    if (data.setting && data.setting.value) {
      connectorSettings = data.setting.value;
    }
  } catch (error) {
    // noop
  }
  renderSettings();
};

const renderSettings = () => {
  toggleLocal.checked = connectorSettings.local?.enabled ?? true;
  toggleGmail.checked = connectorSettings.gmail?.enabled ?? false;
  toggleFacebook.checked = connectorSettings.facebook?.enabled ?? false;
  toggleYoutube.checked = connectorSettings.youtube?.enabled ?? false;
  gmailToken.value = connectorSettings.gmail?.accessToken ?? "";
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
    local: {
      enabled: toggleLocal.checked,
      folders: connectorSettings.local?.folders ?? [],
    },
    gmail: { enabled: toggleGmail.checked, accessToken: gmailToken.value.trim() },
    facebook: { enabled: toggleFacebook.checked, exportPath: facebookPath.value.trim() },
    youtube: { enabled: toggleYoutube.checked, exportPath: youtubePath.value.trim() },
  };
  await fetch("http://127.0.0.1:8000/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: "connectors", value: connectorSettings }),
  });
};

const addFolder = async () => {
  if (!window.aic || !window.aic.selectFolder) return;
  const folder = await window.aic.selectFolder();
  if (folder) {
    connectorSettings.local.folders.push(folder);
    renderFolders(connectorSettings.local.folders);
  }
};

const pickFacebookPath = async () => {
  if (!window.aic || !window.aic.selectPath) return;
  const path = await window.aic.selectPath();
  if (path) {
    facebookPath.value = path;
  }
};

const pickYoutubePath = async () => {
  if (!window.aic || !window.aic.selectFolder) return;
  const path = await window.aic.selectFolder();
  if (path) {
    youtubePath.value = path;
  }
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
    const res = await fetch("http://127.0.0.1:8000/ingest/local/stream", {
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
          if (ev.event === "started") {
            appendProgress(`Starting ingest (${ev.total} files)...`);
          } else if (ev.event === "file_start") {
            appendProgress(`Processing: ${ev.path}`);
          } else if (ev.event === "file_done") {
            const status = ev.status || "?";
            const reason = ev.reason ? ` — ${ev.reason}` : "";
            appendProgress(`  → ${status}${reason}`);
          } else if (ev.event === "error") {
            appendProgress(ev.message || "Error", true);
          } else if (ev.event === "complete") {
            lastResults = ev.results || [];
          }
        } catch (e) {
          // skip parse errors
        }
      }
    }
    const failures = lastResults.filter((r) => r.status === "failed");
    const llmFailure = failures.find((f) => f.reason === "llm_unavailable");
    if (llmFailure) {
      appendProgress("LLM unavailable. Ingestion stopped. Start Ollama (ollama serve) and ensure the model is available.", true);
    } else if (failures.length) {
      failures.forEach((f) => appendProgress(`${f.path} — ${f.reason || "unknown"}`, true));
    } else {
      appendProgress("Ingest complete.");
    }
  } catch (err) {
    appendProgress("Ingest failed: " + (err.message || "Unknown error"), true);
  } finally {
    runLocalIngestButton.disabled = false;
  }
  loadKnowledgeMap();
};

(function initSplitters() {
  const SPLITTER_KEY = "aic-pane-sizes";
  const PANELS_KEY = "aic-panels-folded";
  const sizes = {
    colLeft: 320,
    colRight: 360,
    paneJournal: 260,
    paneInsights: 260,
  };
  let knowledgeMapOpen = false;
  let proposedInsightsOpen = false;
  try {
    const saved = localStorage.getItem(SPLITTER_KEY);
    if (saved) Object.assign(sizes, JSON.parse(saved));
  } catch (e) {}
  try {
    const panels = localStorage.getItem(PANELS_KEY);
    if (panels) {
      const p = JSON.parse(panels);
      knowledgeMapOpen = !!p.knowledgeMapOpen;
      proposedInsightsOpen = !!p.proposedInsightsOpen;
    }
  } catch (e) {}

  const saveSizes = () => {
    try {
      localStorage.setItem(SPLITTER_KEY, JSON.stringify(sizes));
    } catch (e) {}
  };

  const savePanels = () => {
    try {
      localStorage.setItem(
        PANELS_KEY,
        JSON.stringify({ knowledgeMapOpen, proposedInsightsOpen })
      );
    } catch (e) {}
  };

  const updatePanelButtonLabels = () => {
    const btnKm = document.getElementById("btn-knowledge-map");
    const btnPi = document.getElementById("btn-proposed-insights");
    if (btnKm) btnKm.textContent = knowledgeMapOpen ? "Hide Knowledge Map" : "Knowledge Map";
    if (btnPi) btnPi.textContent = proposedInsightsOpen ? "Hide Proposed Insights" : "Proposed Insights";
  };

  let chatAccordionCollapsed = false;
  const CHAT_PANE_MIN_HEIGHT = 280;

  const applySizes = () => {
    const main = document.getElementById("app-main");
    if (!main) return;
    const totalW = main.clientWidth - 24 - 8;
    const leftW = Math.max(200, Math.min(totalW - 420, sizes.colLeft));
    const rightW = Math.max(200, Math.min(totalW - 420, sizes.colRight));

    const colLeft = document.getElementById("col-left");
    const colMid = document.getElementById("col-mid");
    const colRight = document.getElementById("col-right");
    const splitterBeforeMid = document.querySelector('.splitter-col[data-after="col-mid"]');
    const splitterBeforeRight = document.querySelector('.splitter-col[data-after="col-right"]');
    const paneChat = document.getElementById("pane-chat");
    const sendBtn = document.getElementById("chat-send");

    if (colMid) {
      colMid.classList.toggle("collapsed", !knowledgeMapOpen);
      if (knowledgeMapOpen) colMid.style.flex = "1 1 0";
    }
    if (colRight) {
      colRight.classList.toggle("collapsed", !proposedInsightsOpen);
      if (proposedInsightsOpen) colRight.style.flex = `0 0 ${rightW}px`;
    }
    if (splitterBeforeMid) splitterBeforeMid.classList.toggle("hidden", !knowledgeMapOpen);
    if (splitterBeforeRight) splitterBeforeRight.classList.toggle("hidden", !proposedInsightsOpen);

    if (colLeft) {
      colLeft.style.flex = !knowledgeMapOpen && !proposedInsightsOpen ? "1 1 0" : `0 0 ${leftW}px`;
    }

    const jh = Math.max(120, sizes.paneJournal);
    const paneJournal = document.getElementById("pane-journal");
    if (paneJournal) {
      paneJournal.style.flex = `0 0 ${jh}px`;
      paneJournal.style.maxHeight = jh + "px";
    }
    if (paneChat && !chatAccordionCollapsed) paneChat.style.flex = "1 1 0";

    const ih = Math.max(120, sizes.paneInsights);
    document.getElementById("pane-insights").style.flex = `0 0 ${ih}px`;
    document.getElementById("pane-settings").style.flex = `1 1 0`;

    if (sendBtn && paneChat && colLeft) {
      const bottom = sendBtn.getBoundingClientRect().bottom;
      const threshold = window.innerHeight - 8;
      if (!chatAccordionCollapsed && bottom > threshold) {
        chatAccordionCollapsed = true;
        paneChat.classList.add("accordion-collapsed");
        paneChat.style.flex = "0 0 48px";
      } else if (chatAccordionCollapsed) {
        paneChat.style.flex = "0 0 48px";
      }
    }
  };

  const DEFAULT_PANE_JOURNAL = 260;
  const expandChatAccordion = () => {
    if (!chatAccordionCollapsed) return;
    const paneChat = document.getElementById("pane-chat");
    if (!paneChat) return;
    sizes.paneJournal = DEFAULT_PANE_JOURNAL;
    saveSizes();
    chatAccordionCollapsed = false;
    paneChat.classList.remove("accordion-collapsed");
    paneChat.style.flex = "1 1 0";
    applySizes();
  };

  document.querySelectorAll(".splitter").forEach((splitter) => {
    splitter.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const beforeId = splitter.dataset.before;
      const afterId = splitter.dataset.after;
      const isCol = splitter.classList.contains("splitter-col");
      const main = document.getElementById("app-main");
      const before = document.getElementById(beforeId);
      const after = document.getElementById(afterId);
      if (!before || !after) return;

      let startX = e.clientX;
      let startY = e.clientY;
      let startBeforeW = before.getBoundingClientRect().width;
      let startAfterW = after.getBoundingClientRect().width;
      let startBeforeH = before.getBoundingClientRect().height;
      let startAfterH = after.getBoundingClientRect().height;

      const move = (ev) => {
        if (isCol) {
          const delta = ev.clientX - startX;
          const totalW = main.clientWidth - 24 - 8;
          if (beforeId === "col-left") {
            const newLeft = Math.max(200, Math.min(totalW - 420, startBeforeW + delta));
            sizes.colLeft = newLeft;
          } else {
            const newRight = Math.max(200, Math.min(totalW - 420, startAfterW - delta));
            sizes.colRight = newRight;
          }
        } else {
          const delta = ev.clientY - startY;
          const parent = before.parentElement;
          const ph = parent.clientHeight - 4;
          if (beforeId === "pane-journal") {
            const newH = Math.max(120, Math.min(ph - 120, startBeforeH + delta));
            sizes.paneJournal = newH;
          } else {
            const newH = Math.max(120, Math.min(ph - 120, startBeforeH + delta));
            sizes.paneInsights = newH;
          }
        }
        applySizes();
      };

      const resetBodyStyle = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      const up = () => {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
        window.removeEventListener("blur", up);
        resetBodyStyle();
        saveSizes();
      };

      document.body.style.cursor = isCol ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
      window.addEventListener("blur", up);
    });
  });

  const paneChatEl = document.getElementById("pane-chat");
  if (paneChatEl) {
    paneChatEl.addEventListener("click", (e) => {
      if (paneChatEl.classList.contains("accordion-collapsed")) {
        e.preventDefault();
        expandChatAccordion();
      }
    });
  }

  applySizes();
  updatePanelButtonLabels();
  window.addEventListener("resize", applySizes);

  const btnKm = document.getElementById("btn-knowledge-map");
  const btnPi = document.getElementById("btn-proposed-insights");
  if (btnKm) {
    btnKm.addEventListener("click", () => {
      knowledgeMapOpen = !knowledgeMapOpen;
      savePanels();
      updatePanelButtonLabels();
      applySizes();
    });
  }
  if (btnPi) {
    btnPi.addEventListener("click", () => {
      proposedInsightsOpen = !proposedInsightsOpen;
      savePanels();
      updatePanelButtonLabels();
      applySizes();
    });
  }
})();

(function initTextareaTopResize() {
  const MIN_H = 80;
  const MAX_H = 600;

  function setupHandle(handleId, wrapId) {
    const handle = document.getElementById(handleId);
    const wrap = document.getElementById(wrapId);
    if (!handle || !wrap) return;
    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const startY = e.clientY;
      const startH = wrap.offsetHeight;

      const move = (ev) => {
        const dy = startY - ev.clientY;
        const newH = Math.max(MIN_H, Math.min(MAX_H, startH + dy));
        wrap.style.height = newH + "px";
      };

      const resetBodyStyle = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      const up = () => {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
        window.removeEventListener("blur", up);
        resetBodyStyle();
      };

      document.body.style.cursor = "ns-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
      window.addEventListener("blur", up);
    });
  }

  setupHandle("journal-resize-handle", "journal-textarea-wrap");
  setupHandle("chat-resize-handle", "chat-textarea-wrap");
})();

(function ensureInputFocusRestored() {
  window.addEventListener("blur", () => {
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
  });
})();

if (journalInput) {
  journalInput.addEventListener("mousedown", (e) => {
    if (e.target === journalInput) journalInput.focus();
  });
  journalInput.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key === "Enter") {
      e.preventDefault();
      saveJournalEntry();
    }
  });
}

journalSave.addEventListener("click", saveJournalEntry);
if (journalReflectBtn) journalReflectBtn.addEventListener("click", reflectOnJournal);
chatSend.addEventListener("click", sendChatMessage);

checkBackend();
checkLLM();
loadJournalEntries();
loadChatHistory();
loadProposedInsights();
loadKnowledgeMap(true);
loadSettings();

if (window.aic && window.aic.onDataDeleted) {
  window.aic.onDataDeleted(() => {
    loadJournalEntries();
    loadProposedInsights();
    loadKnowledgeMap();
  });
}
openFilteredButton.addEventListener("click", openFilteredWindow);

settingsToggle.addEventListener("click", () => {
  settingsBody.classList.toggle("hidden");
});
refreshKnowledgeButton.addEventListener("click", () => loadKnowledgeMap(true));
saveSettingsButton.addEventListener("click", saveSettings);
addFolderButton.addEventListener("click", addFolder);
runLocalIngestButton.addEventListener("click", runLocalIngest);
pickFacebookButton.addEventListener("click", pickFacebookPath);
pickYoutubeButton.addEventListener("click", pickYoutubePath);

const SESSION_NUDGE_MS = 30 * 60 * 1000;
setTimeout(() => {
  sessionNudge.classList.remove("hidden");
}, SESSION_NUDGE_MS);

const KNOWLEDGE_REFRESH_MS = 10000;
setInterval(() => {
  loadKnowledgeMap();
}, KNOWLEDGE_REFRESH_MS);

const STATUS_REFRESH_MS = 5000;
setInterval(() => {
  checkBackend();
  checkLLM();
}, STATUS_REFRESH_MS);
