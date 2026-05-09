const API_BASE = "http://127.0.0.1:8000";

export async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const key = window.aic?.getApiKey ? await window.aic.getApiKey() : null;
  const headers = new Headers(options.headers);
  if (key) headers.set("X-API-Key", key);
  return fetch(`${API_BASE}${path}`, { ...options, headers });
}

export async function healthCheck(): Promise<boolean> {
  try {
    const r = await fetch(`${API_BASE}/health`);
    return r.ok;
  } catch {
    return false;
  }
}

export type LlmStatusResponse = {
  active_label?: string;
  model_source?: string;
  cloud_provider?: string;
  cloud_model?: string;
  ollama_reachable?: boolean;
  openai_key_configured?: boolean;
};

/** True when the currently selected source appears usable (key for cloud OpenAI, Ollama for local). */
export async function fetchLlmStatus(): Promise<{
  ok: boolean;
  data?: LlmStatusResponse;
  error?: string;
}> {
  try {
    const r = await apiFetch("/llm/status");
    const data = (await r.json().catch(() => ({}))) as LlmStatusResponse;
    if (!r.ok) return { ok: false, error: "bad response" };
    let online = false;
    if (data.model_source === "cloud") {
      const prov = (data.cloud_provider || "openai").toLowerCase();
      if (prov === "openai") {
        online = Boolean(data.openai_key_configured);
      } else {
        online = false;
      }
    } else {
      online = Boolean(data.ollama_reachable);
    }
    return { ok: online, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "error" };
  }
}

export async function llmHealthCheck(): Promise<{ ok: boolean; detail?: string }> {
  try {
    const r = await apiFetch("/health/llm");
    const data = (await r.json().catch(() => ({}))) as {
      status?: string;
      error?: string;
    };
    if (!r.ok) return { ok: false, detail: data.error || r.statusText };
    return { ok: data.status === "ok", detail: data.error };
  } catch (e) {
    return {
      ok: false,
      detail: e instanceof Error ? e.message : "unreachable",
    };
  }
}
