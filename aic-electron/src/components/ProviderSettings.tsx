import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { CortexLogProfile } from "@/vite-env";

type Props = {
  open: boolean;
  initialTab?: SettingsTab;
  persistUnsentDrafts: boolean;
  onPersistUnsentDraftsChange: (next: boolean) => void;
  enableWheelFontResize: boolean;
  onEnableWheelFontResizeChange: (next: boolean) => void;
  journalInputFontPercent: number;
  onJournalInputFontPercentChange: (next: number) => void;
  exploreInputFontPercent: number;
  onExploreInputFontPercentChange: (next: number) => void;
  journalEntryFontPercent: number;
  onJournalEntryFontPercentChange: (next: number) => void;
  journalResponseFontPercent: number;
  onJournalResponseFontPercentChange: (next: number) => void;
  onClose: () => void;
  onProfileChanged?: () => void;
};

export type SettingsTab = "profile" | "ai" | "modify" | "debug" | "preferences";

type LlmSettings = {
  model_source?: string;
  cloud_provider?: string;
  cloud_model?: string;
  local_model?: string | null;
};

type ProviderMeta = { id: string; label: string; implemented: boolean };

type EngineStatus = {
  cli_detected?: boolean;
  cli_path?: string;
  auth_status?: string;
  source_folder?: string;
  source_folder_exists?: boolean;
  git_available?: boolean;
  is_git_repo?: boolean;
  ready?: boolean;
  message?: string;
};

export function ProviderSettings({
  open,
  initialTab = "profile",
  persistUnsentDrafts,
  onPersistUnsentDraftsChange,
  enableWheelFontResize,
  onEnableWheelFontResizeChange,
  journalInputFontPercent,
  onJournalInputFontPercentChange,
  exploreInputFontPercent,
  onExploreInputFontPercentChange,
  journalEntryFontPercent,
  onJournalEntryFontPercentChange,
  journalResponseFontPercent,
  onJournalResponseFontPercentChange,
  onClose,
  onProfileChanged,
}: Props) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [profiles, setProfiles] = useState<CortexLogProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState("private");
  const [newProfileName, setNewProfileName] = useState("");
  const [renameLabel, setRenameLabel] = useState("");
  const [modelSource, setModelSource] = useState<"cloud" | "local">("local");
  const [cloudProvider, setCloudProvider] = useState("openai");
  const [cloudModel, setCloudModel] = useState("gpt-4o-mini");
  const [localModel, setLocalModel] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [secretsConfigured, setSecretsConfigured] = useState({
    openai: false,
    anthropic: false,
    gemini: false,
  });
  const [providers, setProviders] = useState<ProviderMeta[]>([]);

  const [engineCli, setEngineCli] = useState("agent");
  const [engineSource, setEngineSource] = useState("");
  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);
  const [defaultSourceRoot, setDefaultSourceRoot] = useState("");

  const [testReply, setTestReply] = useState<string | null>(null);
  const [engineTestSummary, setEngineTestSummary] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const [debugLogOn, setDebugLogOn] = useState(true);
  const [debugLogPath, setDebugLogPath] = useState("");

  const loadAi = useCallback(async () => {
    const r = await apiFetch("/llm/settings");
    if (!r.ok) return;
    const d = (await r.json()) as {
      settings?: LlmSettings;
      secrets_configured?: typeof secretsConfigured;
    };
    const s = d.settings;
    if (s?.model_source === "cloud" || s?.model_source === "local") {
      setModelSource(s.model_source);
    }
    if (s?.cloud_provider) setCloudProvider("openai");
    if (s?.cloud_model) setCloudModel(s.cloud_model);
    setLocalModel(typeof s?.local_model === "string" ? s.local_model : "");
    if (d.secrets_configured) setSecretsConfigured(d.secrets_configured);
  }, []);

  const loadProviders = useCallback(async () => {
    const r = await apiFetch("/llm/providers");
    if (!r.ok) return;
    const d = (await r.json()) as { providers?: ProviderMeta[] };
    if (d.providers) setProviders(d.providers);
  }, []);

  const loadProfiles = useCallback(async () => {
    if (!window.aic?.getProfiles) return;
    const data = await window.aic.getProfiles();
    setProfiles(data.profiles || []);
    setActiveProfileId(data.active_profile_id || "private");
    const active = data.active_profile || data.profiles?.find((p) => p.id === data.active_profile_id);
    if (active) setRenameLabel(active.label);
  }, []);

  const loadDebug = useCallback(async () => {
    const r = await apiFetch("/debug/settings");
    if (!r.ok) return;
    const d = (await r.json()) as {
      settings?: { response_contract_log_enabled?: boolean };
      log_file?: string;
    };
    if (typeof d.settings?.response_contract_log_enabled === "boolean") {
      setDebugLogOn(d.settings.response_contract_log_enabled);
    }
    if (d.log_file) setDebugLogPath(d.log_file);
  }, []);

  const loadEngine = useCallback(async () => {
    const [st, cfg] = await Promise.all([
      apiFetch("/modify/engine/status"),
      apiFetch("/modify/engine/settings"),
    ]);
    if (st.ok) {
      const e = (await st.json()) as EngineStatus;
      setEngineStatus(e);
    }
    if (cfg.ok) {
      const j = (await cfg.json()) as { settings?: { cli_path?: string; source_folder?: string } };
      const s = j.settings;
      if (s?.cli_path) setEngineCli(s.cli_path);
      if (s?.source_folder != null) setEngineSource(s.source_folder);
    }
    const root =
      window.aic?.getModifySourceRoot != null ? await window.aic.getModifySourceRoot() : "";
    setDefaultSourceRoot(root);
  }, []);

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    void loadProfiles();
    void loadProviders();
    void loadAi();
    void loadEngine();
    void loadDebug();
  }, [open, initialTab, loadAi, loadDebug, loadEngine, loadProfiles, loadProviders]);

  const refreshEngineStatus = async () => {
    const st = await apiFetch("/modify/engine/status");
    if (st.ok) setEngineStatus((await st.json()) as EngineStatus);
  };

  const handleSwitchProfile = async (profileId: string) => {
    if (!window.aic?.switchProfile) return;
    setBusy(true);
    setStatus(null);
    try {
      const result = await window.aic.switchProfile(profileId);
      if (!result.ok) {
        setStatus(result.detail || "Could not switch profile.");
        setBusy(false);
        return;
      }
      await loadProfiles();
      setStatus(`Switched to ${result.active_profile?.label || profileId}.`);
      onProfileChanged?.();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not switch profile.");
    }
    setBusy(false);
  };

  const handleCreateProfile = async () => {
    const name = newProfileName.trim();
    if (!name || !window.aic?.createProfile) return;
    setBusy(true);
    setStatus(null);
    try {
      const result = await window.aic.createProfile(name);
      if (!result.ok) {
        setStatus(result.detail || "Could not create profile.");
        setBusy(false);
        return;
      }
      setNewProfileName("");
      await loadProfiles();
      if (result.profile?.id) {
        await handleSwitchProfile(result.profile.id);
      } else {
        setStatus("Profile created.");
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not create profile.");
    }
    setBusy(false);
  };

  const handleRenameProfile = async () => {
    const label = renameLabel.trim();
    if (!label || !window.aic?.renameProfile) return;
    setBusy(true);
    setStatus(null);
    try {
      const result = await window.aic.renameProfile({ id: activeProfileId, label });
      if (!result.ok) {
        setStatus(result.detail || "Could not rename profile.");
        setBusy(false);
        return;
      }
      await loadProfiles();
      setStatus("Profile name updated.");
      onProfileChanged?.();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not rename profile.");
    }
    setBusy(false);
  };

  const saveDebugLog = async (enabled: boolean) => {
    setBusy(true);
    setStatus(null);
    try {
      const r = await apiFetch("/debug/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response_contract_log_enabled: enabled }),
      });
      if (!r.ok) {
        const err = (await r.json().catch(() => ({}))) as { detail?: string };
        setStatus(err.detail || "Save failed");
        setBusy(false);
        return;
      }
      const d = (await r.json()) as {
        settings?: { response_contract_log_enabled?: boolean };
        log_file?: string;
      };
      if (typeof d.settings?.response_contract_log_enabled === "boolean") {
        setDebugLogOn(d.settings.response_contract_log_enabled);
      }
      if (d.log_file) setDebugLogPath(d.log_file);
      setStatus(enabled ? "Debug log on." : "Debug log off.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Save failed");
    }
    setBusy(false);
  };

  if (!open) return null;

  const saveAi = async () => {
    setBusy(true);
    setStatus(null);
    setTestReply(null);
    try {
      const body: Record<string, string | undefined> = {
        model_source: modelSource,
        cloud_provider: cloudProvider,
        cloud_model: cloudModel,
        local_model: localModel.trim() || undefined,
      };
      if (openaiKey.trim()) body.openai_api_key = openaiKey.trim();
      const r = await apiFetch("/llm/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = (await r.json().catch(() => ({}))) as { detail?: string };
        setStatus(err.detail || "Save failed");
        setBusy(false);
        return;
      }
      setOpenaiKey("");
      setStatus("AI settings saved.");
      await loadAi();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Save failed");
    }
    setBusy(false);
  };

  const testAi = async () => {
    setBusy(true);
    setStatus(null);
    setTestReply(null);
    try {
      const signal =
        typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
          ? AbortSignal.timeout(15000)
          : undefined;
      const r = await apiFetch("/llm/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
          model_source: modelSource,
          cloud_provider: cloudProvider,
          cloud_model: cloudModel,
          local_model: localModel.trim() || undefined,
          api_key: openaiKey.trim() || undefined,
        }),
      });
      const d = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        response_text?: string;
        detail?: string;
      };
      if (!r.ok) {
        setStatus(typeof d.detail === "string" ? d.detail : "Test failed");
        return;
      }
      if (d.response_text) setTestReply(d.response_text);
      setStatus("Test completed.");
    } catch (e) {
      if (e instanceof Error && e.name === "TimeoutError") {
        setStatus("Test timed out. Verify the selected provider is running, then try again.");
      } else {
        setStatus(e instanceof Error ? e.message : "Test failed");
      }
    } finally {
      setBusy(false);
    }
  };

  const saveEngine = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const r = await apiFetch("/modify/engine/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cli_path: engineCli.trim() || "agent",
          source_folder: engineSource.trim(),
        }),
      });
      if (!r.ok) {
        const err = (await r.json().catch(() => ({}))) as { detail?: string };
        setStatus(err.detail || "Save failed");
        setBusy(false);
        return;
      }
      setStatus("Modify Engine settings saved.");
      await refreshEngineStatus();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Save failed");
    }
    setBusy(false);
  };

  const testEngine = async () => {
    setBusy(true);
    setEngineTestSummary(null);
    setStatus(null);
    try {
      const r = await apiFetch("/modify/engine/test", { method: "POST" });
      const d = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        engine_status?: EngineStatus;
        cli_version_output?: string;
        detail?: string;
      };
      if (!r.ok) {
        setStatus(typeof d.detail === "string" ? d.detail : "Test failed");
        setBusy(false);
        return;
      }
      if (d.engine_status) setEngineStatus(d.engine_status);
      const bits = [
        d.cli_version_output ? `CLI: ${d.cli_version_output.slice(0, 200)}` : null,
        d.engine_status?.message,
      ].filter(Boolean);
      setEngineTestSummary(bits.join(" — "));
      setStatus("Modify Engine test finished (read-only).");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Test failed");
    }
    setBusy(false);
  };

  const browseCli = async () => {
    const p = await window.aic?.selectPath?.();
    if (p) setEngineCli(p);
  };

  const browseSource = async () => {
    const p = await window.aic?.selectFolder?.();
    if (p) setEngineSource(p);
  };

  const useAppDataSource = async () => {
    const root =
      window.aic?.getModifySourceRoot != null ? await window.aic.getModifySourceRoot() : "";
    if (root) setEngineSource(root);
  };

  const cloudConfigured =
    cloudProvider === "openai"
      ? secretsConfigured.openai
      : cloudProvider === "anthropic"
        ? secretsConfigured.anthropic
        : cloudProvider === "gemini"
          ? secretsConfigured.gemini
          : false;

  const aiStatusLabel =
    modelSource === "local"
      ? "Local model (Ollama)"
      : `${cloudProvider} — ${cloudConfigured ? "key stored" : "not configured"}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[oklch(0.86_0.015_80)] bg-[oklch(0.9_0.02_82)]/96 p-6 shadow-xl backdrop-blur-sm">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id="settings-title" className="text-lg font-semibold text-foreground">
              Settings
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              CortexLog&apos;s AI brain and the Modify Engine (Cursor CLI) are separate: provider
              keys power reasoning; Cursor signs in for local code changes.
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="mb-4 flex flex-wrap gap-2 border-b border-border pb-2">
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-sm ${tab === "profile" ? "bg-muted font-medium" : ""}`}
            onClick={() => {
              setTab("profile");
              void loadProfiles();
            }}
          >
            Profile
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-sm ${tab === "ai" ? "bg-muted font-medium" : ""}`}
            onClick={() => setTab("ai")}
          >
            AI provider
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-sm ${tab === "modify" ? "bg-muted font-medium" : ""}`}
            onClick={() => {
              setTab("modify");
              void refreshEngineStatus();
            }}
          >
            Modify Engine
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-sm ${tab === "debug" ? "bg-muted font-medium" : ""}`}
            onClick={() => setTab("debug")}
          >
            Backend debug log
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-sm ${tab === "preferences" ? "bg-muted font-medium" : ""}`}
            onClick={() => setTab("preferences")}
          >
            Preferences
          </button>
        </div>

        {tab === "profile" && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Profiles keep journal entries, AI settings, and retrieved context separate on this
              computer. They are workspaces, not secure user accounts.
            </p>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Active profile
              </label>
              <select
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                value={activeProfileId}
                onChange={(e) => void handleSwitchProfile(e.target.value)}
                disabled={busy}
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Profile display name
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  className="flex-1 rounded-lg border border-border px-3 py-2 text-sm"
                  value={renameLabel}
                  onChange={(e) => setRenameLabel(e.target.value)}
                  disabled={busy}
                />
                <button
                  type="button"
                  className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted/50"
                  onClick={() => void handleRenameProfile()}
                  disabled={busy}
                >
                  Save name
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                New profile
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  className="flex-1 rounded-lg border border-border px-3 py-2 text-sm"
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  placeholder="e.g. Demo, Client preview"
                  disabled={busy}
                />
                <button
                  type="button"
                  className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted/50"
                  onClick={() => void handleCreateProfile()}
                  disabled={busy || !newProfileName.trim()}
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === "ai" && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">Status: {aiStatusLabel}</p>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Model source
              </label>
              <select
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                value={modelSource}
                onChange={(e) => setModelSource(e.target.value as "cloud" | "local")}
              >
                <option value="cloud">Cloud AI</option>
                <option value="local">Local model (Ollama)</option>
              </select>
            </div>

            {modelSource === "cloud" && (
              <>
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Cloud provider
                  </label>
                  <select
                    className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                    value={cloudProvider}
                    onChange={(e) => setCloudProvider(e.target.value)}
                  >
                    <option value="openai">OpenAI</option>
                  </select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {providers
                      .filter((p) => ["anthropic", "gemini"].includes(p.id))
                      .map((p) => p.label)
                      .join(" · ")}{" "}
                    — planned; not selectable yet.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Model
                  </label>
                  <input
                    className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                    value={cloudModel}
                    onChange={(e) => setCloudModel(e.target.value)}
                    placeholder="gpt-4o-mini"
                    disabled={cloudProvider !== "openai"}
                  />
                </div>
                {cloudProvider === "openai" && (
                  <>
                    <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      OpenAI API key
                    </label>
                    <input
                      type="password"
                      className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                      value={openaiKey}
                      onChange={(e) => setOpenaiKey(e.target.value)}
                      placeholder={
                        secretsConfigured.openai ? "•••• (enter to replace)" : "sk-…"
                      }
                      autoComplete="off"
                    />
                  </>
                )}
                {!["openai"].includes(cloudProvider) && (
                  <p className="text-sm text-amber-800">
                    This provider is not available yet. Choose OpenAI or switch to Local model.
                  </p>
                )}
              </>
            )}

            {modelSource === "local" && (
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Ollama model
                </label>
                <input
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                  value={localModel}
                  onChange={(e) => setLocalModel(e.target.value)}
                  placeholder="Leave blank to use server default"
                />
              </div>
            )}

            {testReply && (
              <div className="rounded-lg bg-muted/40 p-3 text-sm">
                <p className="text-xs font-medium uppercase text-muted-foreground">Model reply</p>
                <p className="mt-1 whitespace-pre-wrap text-foreground">{testReply}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
                onClick={() => void saveAi()}
                disabled={busy}
              >
                Save AI settings
              </button>
              <button
                type="button"
                className="rounded-lg border border-border px-4 py-2 text-sm disabled:opacity-50"
                onClick={() => void testAi()}
                disabled={
                  busy ||
                  (modelSource === "cloud" &&
                    cloudProvider === "openai" &&
                    !secretsConfigured.openai &&
                    !openaiKey.trim())
                }
              >
                Test AI
              </button>
            </div>
          </div>
        )}

        {tab === "debug" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Controls backend LLM debug logging. Useful for troubleshooting local inference and
              request flow details; persists across restarts.
            </p>
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
              <div>
                <p className="font-medium text-foreground">Debug log</p>
                <p className="text-xs text-muted-foreground">
                  {debugLogOn ? "On — writing to log file and backend console" : "Off"}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={debugLogOn}
                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                  debugLogOn ? "bg-foreground" : "bg-muted"
                }`}
                disabled={busy}
                onClick={() => void saveDebugLog(!debugLogOn)}
              >
                <span
                  className={`absolute top-0.5 h-6 w-6 rounded-full bg-background shadow transition-transform ${
                    debugLogOn ? "left-5" : "left-0.5"
                  }`}
                />
              </button>
            </div>
            {debugLogPath && (
              <p className="text-xs text-muted-foreground break-all">
                Log file: {debugLogPath}
              </p>
            )}
          </div>
        )}

        {tab === "modify" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Uses your local Cursor CLI to prepare changes to a writable copy of CortexLog source.
              You review impact before anything is applied.
            </p>

            <div className="rounded-lg border border-border p-3 text-xs space-y-1">
              <Row ok={engineStatus?.cli_detected} label="Cursor CLI detected" />
              <Row ok={engineStatus?.auth_status === "signed_in"} label="Cursor signed in" />
              <Row ok={engineStatus?.source_folder_exists} label="Source folder exists" />
              <Row ok={engineStatus?.git_available} label="Git available" />
              <Row ok={engineStatus?.is_git_repo} label="Git repo in source folder" />
              <p className="pt-2 font-medium text-foreground">
                {engineStatus?.ready ? "Ready to prepare changes" : "Modify Engine needs setup"}
              </p>
              {engineStatus?.message && (
                <p className="text-muted-foreground">{engineStatus.message}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Cursor CLI path
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  className="flex-1 rounded-lg border border-border px-3 py-2 text-sm"
                  value={engineCli}
                  onChange={(e) => setEngineCli(e.target.value)}
                  placeholder="agent"
                />
                <button
                  type="button"
                  className="shrink-0 rounded-lg border border-border px-2 py-1 text-xs"
                  onClick={() => void browseCli()}
                >
                  Browse
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                CortexLog source folder
              </label>
              <input
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                value={engineSource}
                onChange={(e) => setEngineSource(e.target.value)}
                placeholder={defaultSourceRoot || "App-managed folder (synced on launch)"}
              />
              <div className="mt-1 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-md border border-border px-2 py-1 text-xs"
                  onClick={() => void useAppDataSource()}
                >
                  Use app data copy
                </button>
                <button
                  type="button"
                  className="rounded-md border border-border px-2 py-1 text-xs"
                  onClick={() => void browseSource()}
                >
                  Browse folder
                </button>
              </div>
            </div>

            {engineTestSummary && (
              <p className="text-xs text-muted-foreground">{engineTestSummary}</p>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
                onClick={() => void saveEngine()}
                disabled={busy}
              >
                Save Modify Engine
              </button>
              <button
                type="button"
                className="rounded-lg border border-border px-4 py-2 text-sm disabled:opacity-50"
                onClick={() => void testEngine()}
                disabled={busy}
              >
                Test Modify Engine
              </button>
            </div>
          </div>
        )}

        {tab === "preferences" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Tune writing and switching behavior for Journal and Explore.
            </p>
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
              <div>
                <p className="font-medium text-foreground">Persist unsent drafts across mode switches</p>
                <p className="text-xs text-muted-foreground">
                  Keeps unsent text in both Journal and Explore until you submit it or clear it.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={persistUnsentDrafts}
                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                  persistUnsentDrafts ? "bg-foreground" : "bg-muted"
                }`}
                onClick={() => onPersistUnsentDraftsChange(!persistUnsentDrafts)}
              >
                <span
                  className={`absolute top-0.5 h-6 w-6 rounded-full bg-background shadow transition-transform ${
                    persistUnsentDrafts ? "left-5" : "left-0.5"
                  }`}
                />
              </button>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
              <div>
                <p className="font-medium text-foreground">Ctrl + mouse wheel adjusts input font size</p>
                <p className="text-xs text-muted-foreground">
                  While hovering the Journal/Explore input, hold Ctrl and scroll to resize text.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={enableWheelFontResize}
                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                  enableWheelFontResize ? "bg-foreground" : "bg-muted"
                }`}
                onClick={() => onEnableWheelFontResizeChange(!enableWheelFontResize)}
              >
                <span
                  className={`absolute top-0.5 h-6 w-6 rounded-full bg-background shadow transition-transform ${
                    enableWheelFontResize ? "left-5" : "left-0.5"
                  }`}
                />
              </button>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="font-medium text-foreground">Journal input font size</p>
              <p className="mt-1 text-xs text-muted-foreground">Default is 100.</p>
              <div className="mt-3 flex items-center gap-3">
                <input
                  type="range"
                  min={70}
                  max={140}
                  step={1}
                  value={journalInputFontPercent}
                  onChange={(e) => onJournalInputFontPercentChange(Number(e.target.value))}
                  className="w-full"
                />
                <input
                  type="number"
                  min={70}
                  max={140}
                  step={1}
                  value={journalInputFontPercent}
                  onChange={(e) =>
                    onJournalInputFontPercentChange(
                      Math.min(140, Math.max(70, Number(e.target.value) || 100)),
                    )
                  }
                  className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm"
                />
              </div>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="font-medium text-foreground">Explore input font size</p>
              <p className="mt-1 text-xs text-muted-foreground">Default is 100.</p>
              <div className="mt-3 flex items-center gap-3">
                <input
                  type="range"
                  min={70}
                  max={140}
                  step={1}
                  value={exploreInputFontPercent}
                  onChange={(e) => onExploreInputFontPercentChange(Number(e.target.value))}
                  className="w-full"
                />
                <input
                  type="number"
                  min={70}
                  max={140}
                  step={1}
                  value={exploreInputFontPercent}
                  onChange={(e) =>
                    onExploreInputFontPercentChange(
                      Math.min(140, Math.max(70, Number(e.target.value) || 100)),
                    )
                  }
                  className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm"
                />
              </div>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="font-medium text-foreground">Journal previous entry font size</p>
              <p className="mt-1 text-xs text-muted-foreground">Default is 100.</p>
              <div className="mt-3 flex items-center gap-3">
                <input
                  type="range"
                  min={70}
                  max={140}
                  step={1}
                  value={journalEntryFontPercent}
                  onChange={(e) => onJournalEntryFontPercentChange(Number(e.target.value))}
                  className="w-full"
                />
                <input
                  type="number"
                  min={70}
                  max={140}
                  step={1}
                  value={journalEntryFontPercent}
                  onChange={(e) =>
                    onJournalEntryFontPercentChange(
                      Math.min(140, Math.max(70, Number(e.target.value) || 100)),
                    )
                  }
                  className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm"
                />
              </div>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="font-medium text-foreground">Journal response font size</p>
              <p className="mt-1 text-xs text-muted-foreground">Default is 100.</p>
              <div className="mt-3 flex items-center gap-3">
                <input
                  type="range"
                  min={70}
                  max={140}
                  step={1}
                  value={journalResponseFontPercent}
                  onChange={(e) => onJournalResponseFontPercentChange(Number(e.target.value))}
                  className="w-full"
                />
                <input
                  type="number"
                  min={70}
                  max={140}
                  step={1}
                  value={journalResponseFontPercent}
                  onChange={(e) =>
                    onJournalResponseFontPercentChange(
                      Math.min(140, Math.max(70, Number(e.target.value) || 100)),
                    )
                  }
                  className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm"
                />
              </div>
            </div>
          </div>
        )}

        {status && <p className="mt-4 text-sm text-foreground">{status}</p>}

        <div className="mt-6 flex justify-end border-t border-border pt-4">
          <button type="button" className="rounded-lg px-4 py-2 text-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ ok, label }: { ok?: boolean; label: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span>{label}</span>
      <span className={ok ? "text-green-700" : "text-amber-700"}>{ok ? "yes" : "no"}</span>
    </div>
  );
}
