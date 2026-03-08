const statusEl = document.getElementById("backend-status");
const llmStatusEl = document.getElementById("llm-status");
const llmStatusWrapEl = document.getElementById("llm-status-wrap");
const journalInput = document.getElementById("journal-input");
const journalSave = document.getElementById("journal-save");
const journalFeed = document.getElementById("journal-feed");
const chatInput = document.getElementById("chat-input");
const chatSend = document.getElementById("chat-send");
const chatLog = document.getElementById("chat-log");
const chatCitations = document.getElementById("chat-citations");
const insightsList = document.getElementById("insights-list");
const entitiesList = document.getElementById("entities-list");
const relationsList = document.getElementById("relations-list");
const conflictsList = document.getElementById("conflicts-list");
const sessionNudge = document.getElementById("session-nudge");
const openFilteredButton = document.getElementById("open-filtered");
const filteredCount = document.getElementById("filtered-count");
const refreshKnowledgeButton = document.getElementById("refresh-knowledge");
const knowledgeDetail = document.getElementById("knowledge-detail");
const paneJournal = document.getElementById("pane-journal");
const paneChat = document.getElementById("pane-chat");
const emptyState = document.getElementById("empty-state");
const splitterContent = document.getElementById("splitter-content");
const btnJournal = document.getElementById("btn-journal");
const btnChat = document.getElementById("btn-chat");

const API_BASE = "http://127.0.0.1:8000";
const OLLAMA_TAGS_URL = "http://localhost:11434/api/tags";

/** Fetch with API key header for backend requests. Use for all 127.0.0.1:8000 calls except /health. */
const apiFetch = async (url, options = {}) => {
  const key = window.aic?.getApiKey ? await window.aic.getApiKey() : null;
  const headers = { ...options.headers };
  if (key) headers["X-API-Key"] = key;
  return fetch(url, { ...options, headers });
};
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
    const res = await apiFetch(`${API_BASE}/health`);
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
    const res = await apiFetch(`${API_BASE}/health/llm`);
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

const renderJournalFeed = (entries) => {
  if (!journalFeed) return;
  journalFeed.innerHTML = "";
  (entries || []).forEach((entry) => {
    const entryBlock = document.createElement("div");
    entryBlock.className = "feed-item journal-entry";
    entryBlock.dataset.entryId = entry.id;
    const ts = formatJournalTimestamp(entry.created_at);
    const content = escapeHtml(entry.content || "");
    entryBlock.innerHTML = `<button class="item-delete" title="Delete">&#10005;</button><span class="journal-entry-time">${escapeHtml(ts)}</span><br><div class="entry-content">${content}</div>`;
    entryBlock.querySelector(".item-delete").addEventListener("click", () => deleteJournalEntry(entry.id));
    journalFeed.appendChild(entryBlock);
    if (entry.reflection) {
      const refBlock = document.createElement("div");
      refBlock.className = "feed-item reflection";
      refBlock.dataset.entryId = entry.id;
      refBlock.innerHTML = `<button class="item-delete" title="Delete">&#10005;</button><div class="reflection-content">${renderMessageContent(entry.reflection)}</div>`;
      refBlock.querySelector(".item-delete").addEventListener("click", () => deleteJournalReflection(entry.id));
      journalFeed.appendChild(refBlock);
    }
  });
};

const scrollJournalToBottom = () => {
  if (journalFeed) {
    requestAnimationFrame(() => {
      journalFeed.scrollTop = journalFeed.scrollHeight;
    });
  }
};

const loadJournalFeed = async () => {
  try {
    const res = await apiFetch(`${API_BASE}/journal`);
    if (!res.ok) return;
    const data = await res.json();
    renderJournalFeed(data.entries || []);
    scrollJournalToBottom();
  } catch (error) {}
};

const deleteJournalEntry = async (id) => {
  await apiFetch(`${API_BASE}/journal/${id}`, { method: "DELETE" });
  loadJournalFeed();
};

const deleteJournalReflection = async (entryId) => {
  await apiFetch(`${API_BASE}/journal/${entryId}/reflection`, { method: "DELETE" });
  loadJournalFeed();
};

const saveJournalEntry = async () => {
  const content = journalInput.value.trim();
  if (!content) return;
  const saveRes = await apiFetch(`${API_BASE}/journal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!saveRes.ok) {
    const err = await saveRes.json().catch(() => ({}));
    alert("Could not save entry. " + (err.detail || saveRes.statusText || "Try again."));
    return;
  }
  const saveData = await saveRes.json();
  journalInput.value = "";
  const entryId = saveData.entry?.id;
  if (!entryId) {
    await loadJournalFeed();
    return;
  }
  try {
    await apiFetch(`${API_BASE}/journal/reflect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entry_id: entryId }),
    });
  } catch (e) {}
  await loadJournalFeed();
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
  div.dataset.messageId = message.id;
  const delBtn = document.createElement("button");
  delBtn.className = "item-delete";
  delBtn.title = "Delete";
  delBtn.textContent = "\u2715";
  delBtn.addEventListener("click", () => deleteChatMessage(message.id));
  const inner = document.createElement("div");
  inner.className = "chat-message-content";
  inner.innerHTML = renderMessageContent(message.content);
  div.appendChild(delBtn);
  div.appendChild(inner);
  chatLog.appendChild(div);
  requestAnimationFrame(() => {
    chatLog.scrollTop = chatLog.scrollHeight;
  });
};

const deleteChatMessage = async (id) => {
  await apiFetch(`${API_BASE}/chat/${id}`, { method: "DELETE" });
  const el = chatLog.querySelector(`[data-message-id="${id}"]`);
  if (el) el.remove();
};

const loadChatHistory = async () => {
  const sessionId = getChatSessionId();
  try {
    const res = await apiFetch(`${API_BASE}/chat?session_id=${encodeURIComponent(sessionId)}`);
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
  const res = await apiFetch(`${API_BASE}/chat`, {
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
  chatCitations.innerHTML = "<strong>Sources:</strong> " + citations.map((c) => escapeHtml(c.label)).join(", ");
};

const loadProposedInsights = async () => {
  try {
    const res = await apiFetch("http://127.0.0.1:8000/proposed_insights?status=pending");
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
  await apiFetch("http://127.0.0.1:8000/proposed_insights/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ insight_id: insightId, status, reason }),
  });
  loadProposedInsights();
};

const loadFilteredCount = async () => {
  const res = await apiFetch("http://127.0.0.1:8000/proposed_insights/filtered");
  if (!res.ok) {
    filteredCount.textContent = "";
    return;
  }
  const data = await res.json();
  const count = (data.insights || []).length;
  filteredCount.textContent = count ? `${count} filtered` : "";
};

const openFilteredWindow = async () => {
  const res = await apiFetch("http://127.0.0.1:8000/proposed_insights/filtered");
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
    wrapper.innerHTML = `<div><strong>${escapeHtml(insight.content)}</strong></div><div>Reason: ${escapeHtml(reason)}</div>`;
    const restoreBtn = win.document.createElement("button");
    restoreBtn.textContent = "Restore";
    restoreBtn.onclick = async () => {
      await apiFetch("http://127.0.0.1:8000/proposed_insights/restore", {
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
      await apiFetch("http://127.0.0.1:8000/knowledge/entities/cleanup", {
        method: "POST",
      });
    }
    let [entitiesRes, relationsRes, conflictsRes] = await Promise.all([
      apiFetch("http://127.0.0.1:8000/knowledge/entities?source=llm"),
      apiFetch("http://127.0.0.1:8000/knowledge/relations"),
      apiFetch("http://127.0.0.1:8000/conflicts?status=pending"),
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
    const hint = "Use File > Settings > Ingest to add folders and run Local Ingest to populate the Knowledge Map.";
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
  await apiFetch("http://127.0.0.1:8000/knowledge/entities/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entity_id: entityId, label }),
  });
  loadKnowledgeMap();
};

const deleteEntity = async (entityId) => {
  await apiFetch("http://127.0.0.1:8000/knowledge/entities/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entity_id: entityId }),
  });
  loadKnowledgeMap();
};

const deleteRelation = async (relationId) => {
  await apiFetch("http://127.0.0.1:8000/knowledge/relations/delete", {
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
  await apiFetch("http://127.0.0.1:8000/conflicts/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conflict_id: conflictId, status }),
  });
  loadKnowledgeMap();
};

const showEntityDetails = async (entity) => {
  knowledgeDetail.textContent = "Loading details...";
  try {
    const res = await apiFetch(
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

(function initPaneLayout() {
  const LAYOUT_KEY = "aic-overhaul-layout";
  const MIN_PANE_WIDTH = 200;
  let journalOpen = true;
  let chatOpen = false;
  let knowledgeMapOpen = false;
  let proposedInsightsOpen = false;
  let contentSplit = 0.5;

  try {
    const saved = localStorage.getItem(LAYOUT_KEY);
    if (saved) {
      const p = JSON.parse(saved);
      journalOpen = p.journalOpen !== false;
      chatOpen = !!p.chatOpen;
      knowledgeMapOpen = !!p.knowledgeMapOpen;
      proposedInsightsOpen = !!p.proposedInsightsOpen;
      if (typeof p.contentSplit === "number") contentSplit = p.contentSplit;
    }
  } catch (e) {}

  const saveLayout = () => {
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify({
        journalOpen,
        chatOpen,
        knowledgeMapOpen,
        proposedInsightsOpen,
        contentSplit,
      }));
    } catch (e) {}
  };

  const applyLayout = () => {
    if (!paneJournal || !paneChat || !emptyState || !splitterContent) return;
    paneJournal.classList.toggle("hidden", !journalOpen);
    paneChat.classList.toggle("hidden", !chatOpen);
    splitterContent.classList.toggle("hidden", !(journalOpen && chatOpen));
    emptyState.classList.toggle("hidden", journalOpen || chatOpen);

    if (journalOpen && chatOpen) {
      paneJournal.style.flex = `0 0 ${contentSplit * 100}%`;
      paneChat.style.flex = `0 0 ${(1 - contentSplit) * 100}%`;
    } else {
      paneJournal.style.flex = journalOpen ? "1 1 0" : "0 0 0";
      paneChat.style.flex = chatOpen ? "1 1 0" : "0 0 0";
    }

    const colMid = document.getElementById("col-mid");
    const colRight = document.getElementById("col-right");
    const splitterKm = document.getElementById("splitter-km");
    const splitterPi = document.getElementById("splitter-pi");
    if (colMid) colMid.classList.toggle("collapsed", !knowledgeMapOpen);
    if (colRight) colRight.classList.toggle("collapsed", !proposedInsightsOpen);
    if (splitterKm) splitterKm.classList.toggle("hidden", !knowledgeMapOpen);
    if (splitterPi) splitterPi.classList.toggle("hidden", !proposedInsightsOpen);
    if (colMid && knowledgeMapOpen) colMid.style.flex = "0 0 360px";
    if (colRight && proposedInsightsOpen) colRight.style.flex = "0 0 360px";

    if (btnJournal) btnJournal.textContent = journalOpen ? "Journal" : "Journal";
    if (btnChat) btnChat.textContent = chatOpen ? "Chat" : "Chat";
    const btnKm = document.getElementById("btn-knowledge-map");
    const btnPi = document.getElementById("btn-proposed-insights");
    if (btnKm) btnKm.textContent = knowledgeMapOpen ? "Hide Knowledge Map" : "Knowledge Map";
    if (btnPi) btnPi.textContent = proposedInsightsOpen ? "Hide Proposed Insights" : "Proposed Insights";
  };

  if (splitterContent) {
    splitterContent.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const contentArea = document.getElementById("content-area");
      const startX = e.clientX;
      const startSplit = contentSplit;
      const move = (ev) => {
        const totalW = contentArea.clientWidth;
        if (totalW <= 0) return;
        const delta = ev.clientX - startX;
        let newLeft = startSplit * totalW + delta;
        if (newLeft < MIN_PANE_WIDTH) {
          journalOpen = false;
          chatOpen = true;
          saveLayout();
          applyLayout();
          document.removeEventListener("mousemove", move);
          document.removeEventListener("mouseup", up);
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
          return;
        }
        if (totalW - newLeft < MIN_PANE_WIDTH) {
          journalOpen = true;
          chatOpen = false;
          saveLayout();
          applyLayout();
          document.removeEventListener("mousemove", move);
          document.removeEventListener("mouseup", up);
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
          return;
        }
        contentSplit = newLeft / totalW;
        applyLayout();
      };
      const up = () => {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        saveLayout();
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
      window.addEventListener("blur", up);
    });
  }

  document.getElementById("close-journal")?.addEventListener("click", () => {
    journalOpen = false;
    saveLayout();
    applyLayout();
  });
  document.getElementById("close-chat")?.addEventListener("click", () => {
    chatOpen = false;
    saveLayout();
    applyLayout();
  });

  btnJournal?.addEventListener("click", () => {
    journalOpen = !journalOpen;
    saveLayout();
    applyLayout();
  });
  btnChat?.addEventListener("click", () => {
    chatOpen = !chatOpen;
    saveLayout();
    applyLayout();
  });
  document.getElementById("btn-knowledge-map")?.addEventListener("click", () => {
    knowledgeMapOpen = !knowledgeMapOpen;
    saveLayout();
    applyLayout();
  });
  document.getElementById("btn-proposed-insights")?.addEventListener("click", () => {
    proposedInsightsOpen = !proposedInsightsOpen;
    saveLayout();
    applyLayout();
  });

  applyLayout();
  window.addEventListener("resize", applyLayout);

  window._aicSwitchToJournal = () => {
    journalOpen = true;
    saveLayout();
    applyLayout();
    journalInput?.focus();
  };
  window._aicSwitchToChat = () => {
    chatOpen = true;
    saveLayout();
    applyLayout();
    chatInput?.focus();
  };
})();

(function initAutoExpandTextarea() {
  const setupAutoExpand = (textarea) => {
    if (!textarea) return;
    const adjust = () => {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 400) + "px";
    };
    textarea.addEventListener("input", adjust);
    textarea.addEventListener("focus", adjust);
    adjust();
  };
  setupAutoExpand(journalInput);
  setupAutoExpand(chatInput);
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
chatSend.addEventListener("click", sendChatMessage);

checkBackend();
checkLLM();
loadJournalFeed();
loadChatHistory();
loadProposedInsights();
loadKnowledgeMap(true);

if (window.aic && window.aic.onDataDeleted) {
  window.aic.onDataDeleted(() => {
    loadJournalFeed();
    loadProposedInsights();
    loadKnowledgeMap();
  });
}
openFilteredButton.addEventListener("click", openFilteredWindow);
refreshKnowledgeButton.addEventListener("click", () => loadKnowledgeMap(true));

document.addEventListener("keydown", (e) => {
  if (e.shiftKey && e.key === "Tab") {
    e.preventDefault();
    if (document.activeElement === journalInput && window._aicSwitchToChat) {
      window._aicSwitchToChat();
    } else if (document.activeElement === chatInput && window._aicSwitchToJournal) {
      window._aicSwitchToJournal();
    }
  }
});

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
