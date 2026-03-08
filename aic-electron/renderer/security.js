const API_BASE = "http://127.0.0.1:8000";

const apiFetch = async (url, options = {}) => {
  const key = window.aic?.getApiKey ? await window.aic.getApiKey() : null;
  const headers = { ...options.headers };
  if (key) headers["X-API-Key"] = key;
  return fetch(url, { ...options, headers });
};

const passwordField = document.getElementById("password-field");
const savePasswordBtn = document.getElementById("save-password");
const saveToast = document.getElementById("save-toast");
const resetPasswordBtn = document.getElementById("reset-password");
const resetMessage = document.getElementById("reset-message");

const showToast = () => {
  saveToast.classList.remove("hidden");
  setTimeout(() => saveToast.classList.add("hidden"), 3000);
};

savePasswordBtn.addEventListener("click", async () => {
  const password = passwordField.value;
  if (!password) return;
  savePasswordBtn.disabled = true;
  try {
    const saltRes = await apiFetch(`${API_BASE}/auth/salt`);
    if (!saltRes.ok) {
      return;
    }
    const { salt } = await saltRes.json();
    const passwordHash = await hashPasswordForVerify(password, salt);
    const res = await apiFetch(`${API_BASE}/auth/set-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password_hash: passwordHash }),
    });
    if (res.ok) {
      showToast();
      passwordField.value = "";
    }
  } catch (err) {
    // noop
  } finally {
    savePasswordBtn.disabled = false;
  }
});

resetPasswordBtn.addEventListener("click", () => {
  const msg = "A reset link would be sent to krivkin82@gmail.com. After reset you will need to re-enter your Gmail key.";
  resetMessage.textContent = msg;
  resetMessage.classList.remove("hidden");
});
