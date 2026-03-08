const API_BASE = "http://127.0.0.1:8000";
const GMAIL_SECRET_KEY = "gmail_access_token";

const apiFetch = async (url, options = {}) => {
  const key = window.aic?.getApiKey ? await window.aic.getApiKey() : null;
  const headers = { ...options.headers };
  if (key) headers["X-API-Key"] = key;
  return fetch(url, { ...options, headers });
};

const passwordPrompt = document.getElementById("password-prompt");
const unlockPassword = document.getElementById("unlock-password");
const unlockBtn = document.getElementById("unlock-btn");
const unlockError = document.getElementById("unlock-error");
const tokenSection = document.getElementById("token-section");
const gmailTokenInput = document.getElementById("gmail-token");
const toggleShow = document.getElementById("toggle-show");
const saveTokenBtn = document.getElementById("save-token");
const saveStatus = document.getElementById("save-status");

let currentDerivedKey = null;

const showError = (msg) => {
  unlockError.textContent = msg;
  unlockError.classList.remove("hidden");
};

const hideError = () => {
  unlockError.classList.add("hidden");
};

const unlock = async () => {
  const password = unlockPassword.value.trim();
  if (!password) {
    showError("Please enter your password.");
    return;
  }
  hideError();
  unlockBtn.disabled = true;
  try {
    const saltRes = await apiFetch(`${API_BASE}/auth/salt`);
    if (!saltRes.ok) {
      showError("Failed to get salt.");
      return;
    }
    const { salt } = await saltRes.json();
    const passwordHash = await hashPasswordForVerify(password, salt);
    const verifyRes = await apiFetch(`${API_BASE}/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password_hash: passwordHash }),
    });
    const verifyData = await verifyRes.json().catch(() => ({}));
    if (!verifyData.ok) {
      showError("Incorrect password.");
      return;
    }
    currentDerivedKey = await deriveFernetKey(password, salt);
    const getRes = await apiFetch(`${API_BASE}/secrets/get-with-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: GMAIL_SECRET_KEY, derived_key: currentDerivedKey }),
    });
    const getData = await getRes.json().catch(() => ({}));
    const value = getData.value ?? null;
    gmailTokenInput.value = value || "";
    passwordPrompt.classList.add("hidden");
    tokenSection.classList.remove("hidden");
    unlockPassword.value = "";
  } catch (err) {
    showError(err?.message || "Failed to unlock.");
  } finally {
    unlockBtn.disabled = false;
  }
};

unlockBtn.addEventListener("click", unlock);
unlockPassword.addEventListener("keydown", (e) => {
  if (e.key === "Enter") unlock();
});

let showingToken = false;
toggleShow.addEventListener("click", () => {
  showingToken = !showingToken;
  gmailTokenInput.type = showingToken ? "text" : "password";
  toggleShow.textContent = showingToken ? "Hide" : "Show";
});

const saveToken = async () => {
  if (!currentDerivedKey) {
    saveStatus.textContent = "Please unlock first.";
    saveStatus.classList.remove("hidden");
    saveStatus.className = "status error";
    return;
  }
  const value = gmailTokenInput.value.trim();
  saveTokenBtn.disabled = true;
  saveStatus.classList.remove("hidden");
  saveStatus.className = "status";
  try {
    const res = await apiFetch(`${API_BASE}/secrets/store-with-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: GMAIL_SECRET_KEY,
        value,
        derived_key: currentDerivedKey,
      }),
    });
    if (res.ok) {
      saveStatus.textContent = "Saved.";
      saveStatus.className = "status ok";
    } else {
      saveStatus.textContent = "Save failed.";
      saveStatus.className = "status error";
    }
  } catch (err) {
    saveStatus.textContent = err?.message || "Save failed.";
    saveStatus.className = "status error";
  } finally {
    saveTokenBtn.disabled = false;
  }
};

saveTokenBtn.addEventListener("click", saveToken);
