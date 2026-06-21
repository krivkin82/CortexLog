import { useCallback, useEffect, useState } from "react";
import { ExploreMode } from "./components/ExploreMode";
import { JournalMode } from "./components/JournalMode";
import { ModeToggle, type Mode } from "./components/ModeToggle";
import { ModifyMode } from "./components/ModifyMode";
import { ProviderSettings, type SettingsTab } from "./components/ProviderSettings";
import { fetchLlmStatus, healthCheck } from "./lib/api";
import type { CortexLogProfile } from "./vite-env";

const PREF_PERSIST_DRAFTS_KEY = "cortexlog.persist_unsent_drafts";
const PREF_WHEEL_FONT_RESIZE_KEY = "cortexlog.enable_wheel_font_resize";
const PREF_JOURNAL_FONT_PERCENT_KEY = "cortexlog.journal_input_font_percent";
const PREF_EXPLORE_FONT_PERCENT_KEY = "cortexlog.explore_input_font_percent";
const PREF_JOURNAL_ENTRY_FONT_PERCENT_KEY = "cortexlog.journal_entry_font_percent";
const PREF_JOURNAL_RESPONSE_FONT_PERCENT_KEY = "cortexlog.journal_response_font_percent";

function readFontPercent(key: string, fallback = 100): number {
  const raw = window.localStorage.getItem(key);
  const parsed = raw == null ? fallback : Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(140, Math.max(70, Math.round(parsed)));
}

export default function App() {
  const [mode, setMode] = useState<Mode>("journal");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [llmOk, setLlmOk] = useState<boolean | null>(null);
  const [llmLabel, setLlmLabel] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab>("profile");
  const [activeProfile, setActiveProfile] = useState<CortexLogProfile>({
    id: "private",
    label: "Private",
  });
  const [profileEpoch, setProfileEpoch] = useState(0);
  const [journalDraft, setJournalDraft] = useState("");
  const [exploreDraft, setExploreDraft] = useState("");
  const [journalFocusToken, setJournalFocusToken] = useState(0);
  const [exploreFocusToken, setExploreFocusToken] = useState(0);
  const [persistUnsentDrafts, setPersistUnsentDrafts] = useState<boolean>(() => {
    const raw = window.localStorage.getItem(PREF_PERSIST_DRAFTS_KEY);
    if (raw == null) return true;
    return raw === "true";
  });
  const [enableWheelFontResize, setEnableWheelFontResize] = useState<boolean>(() => {
    const raw = window.localStorage.getItem(PREF_WHEEL_FONT_RESIZE_KEY);
    if (raw == null) return true;
    return raw === "true";
  });
  const [journalInputFontPercent, setJournalInputFontPercent] = useState<number>(() =>
    readFontPercent(PREF_JOURNAL_FONT_PERCENT_KEY, 100),
  );
  const [exploreInputFontPercent, setExploreInputFontPercent] = useState<number>(() =>
    readFontPercent(PREF_EXPLORE_FONT_PERCENT_KEY, 100),
  );
  const [journalEntryFontPercent, setJournalEntryFontPercent] = useState<number>(() =>
    readFontPercent(PREF_JOURNAL_ENTRY_FONT_PERCENT_KEY, 100),
  );
  const [journalResponseFontPercent, setJournalResponseFontPercent] = useState<number>(() =>
    readFontPercent(PREF_JOURNAL_RESPONSE_FONT_PERCENT_KEY, 100),
  );

  const switchMode = useCallback((next: Mode) => {
    if (next === mode) return;
    if (!persistUnsentDrafts) {
      if (mode === "journal") setJournalDraft("");
      if (mode === "explore") setExploreDraft("");
    }
    setIsTransitioning(true);
    window.setTimeout(() => {
      setMode(next);
      window.setTimeout(() => setIsTransitioning(false), 150);
    }, 150);
  }, [mode, persistUnsentDrafts]);

  useEffect(() => {
    if (mode === "journal") setJournalFocusToken((n) => n + 1);
    if (mode === "explore") setExploreFocusToken((n) => n + 1);
  }, [mode]);

  useEffect(() => {
    window.localStorage.setItem(PREF_PERSIST_DRAFTS_KEY, String(persistUnsentDrafts));
  }, [persistUnsentDrafts]);

  useEffect(() => {
    window.localStorage.setItem(PREF_WHEEL_FONT_RESIZE_KEY, String(enableWheelFontResize));
  }, [enableWheelFontResize]);

  useEffect(() => {
    window.localStorage.setItem(PREF_JOURNAL_FONT_PERCENT_KEY, String(journalInputFontPercent));
  }, [journalInputFontPercent]);

  useEffect(() => {
    window.localStorage.setItem(PREF_EXPLORE_FONT_PERCENT_KEY, String(exploreInputFontPercent));
  }, [exploreInputFontPercent]);

  useEffect(() => {
    window.localStorage.setItem(PREF_JOURNAL_ENTRY_FONT_PERCENT_KEY, String(journalEntryFontPercent));
  }, [journalEntryFontPercent]);

  useEffect(() => {
    window.localStorage.setItem(
      PREF_JOURNAL_RESPONSE_FONT_PERCENT_KEY,
      String(journalResponseFontPercent),
    );
  }, [journalResponseFontPercent]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === "Tab") {
        e.preventDefault();
        const order: Mode[] = ["journal", "explore"];
        const idx = order.indexOf(mode);
        const nextIdx = idx >= 0 ? (idx + 1) % order.length : 0;
        switchMode(order[nextIdx]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, switchMode]);

  const pollStatus = useCallback(async () => {
    const ok = await healthCheck();
    setBackendOk(ok);
    if (ok) {
      const llm = await fetchLlmStatus();
      setLlmOk(llm.ok);
      setLlmLabel(llm.data?.active_label ?? null);
    } else {
      setLlmOk(false);
      setLlmLabel(null);
    }
  }, []);

  useEffect(() => {
    void pollStatus();
    const id = window.setInterval(() => void pollStatus(), 8000);
    return () => window.clearInterval(id);
  }, [pollStatus]);

  const loadActiveProfile = useCallback(async () => {
    if (!window.aic?.getActiveProfile) return;
    try {
      const profile = await window.aic.getActiveProfile();
      setActiveProfile(profile);
    } catch {
      /* ignore */
    }
  }, []);

  const onProfileChanged = useCallback(() => {
    setProfileEpoch((n) => n + 1);
    setJournalDraft("");
    setExploreDraft("");
    void loadActiveProfile();
    void pollStatus();
  }, [loadActiveProfile, pollStatus]);

  useEffect(() => {
    void loadActiveProfile();
  }, [loadActiveProfile]);

  useEffect(() => {
    const offOpenSettings = window.aic?.onOpenSettings?.((tab) => {
      setSettingsInitialTab(tab ?? "profile");
      setSettingsOpen(true);
    });
    const offSwitchMode = window.aic?.onSwitchMode?.((nextMode) => {
      if (nextMode === "journal" || nextMode === "explore" || nextMode === "modify") {
        switchMode(nextMode);
      }
    });
    const offProfileChanged = window.aic?.onProfileChanged?.((profile) => {
      setActiveProfile(profile);
      onProfileChanged();
    });
    return () => {
      offOpenSettings?.();
      offSwitchMode?.();
      offProfileChanged?.();
    };
  }, [onProfileChanged, switchMode]);

  const bgClass =
    mode === "journal"
      ? "bg-background"
      : mode === "explore"
        ? "bg-[oklch(0.97_0.01_260)]"
        : "bg-[oklch(0.975_0.008_200)]";

  const llmLine =
    llmLabel != null && llmLabel.length > 0 ? `AI: ${llmLabel}` : "AI: …";

  return (
    <>
      <main
        className={`flex min-h-screen flex-col items-center px-6 py-12 transition-colors duration-500 md:py-20 ${bgClass} ${
          isTransitioning ? "opacity-0" : "opacity-100"
        }`}
      >
        <div
          className={`w-full transition-all duration-300 ${
            mode === "journal"
              ? "max-w-[960px]"
              : mode === "modify"
                ? "max-w-[1100px]"
                : "max-w-[800px]"
          }`}
        >
          {mode !== "modify" && (
            <div className="mb-6 flex flex-wrap items-center justify-center gap-4">
              <nav className="flex items-center justify-center gap-3">
                <ModeToggle
                  mode={mode}
                  onChange={switchMode}
                  variant="center"
                  visibleModes={["journal", "explore"]}
                />
              </nav>
              <span className="hidden text-muted-foreground sm:inline">|</span>
              <div className="flex flex-wrap items-center justify-center gap-3 font-sans text-xs text-muted-foreground">
                <span className="font-medium text-foreground/80">
                  Profile: {activeProfile.label}
                </span>
                <span className="hidden text-muted-foreground sm:inline">|</span>
                <span>
                  Backend:{" "}
                  <span className={backendOk ? "text-green-700" : "text-red-700"}>
                    {backendOk === null ? "…" : backendOk ? "Ok" : "Off"}
                  </span>
                </span>
                <span title={llmLine}>
                  {llmLine}{" "}
                  <span className={llmOk ? "text-green-700" : "text-red-700"}>
                    ({llmOk === null ? "…" : llmOk ? "ready" : "needs setup"})
                  </span>
                </span>
                <button
                  type="button"
                  className="rounded-md border border-border px-2 py-1 text-foreground hover:bg-muted/50"
                  onClick={() => setSettingsOpen(true)}
                >
                  Settings
                </button>
              </div>
            </div>
          )}

          {mode === "modify" && (
            <div className="mb-6 flex justify-end">
              <button
                type="button"
                className="rounded-md border border-border px-3 py-1.5 font-sans text-xs text-foreground hover:bg-white/50"
                onClick={() => setSettingsOpen(true)}
              >
                Settings
              </button>
            </div>
          )}

          {mode === "journal" && (
            <JournalMode
              key={`journal-${profileEpoch}`}
              isFocused={isFocused}
              setIsFocused={setIsFocused}
              draft={journalDraft}
              setDraft={setJournalDraft}
              focusToken={journalFocusToken}
              fontPercent={journalInputFontPercent}
              onFontPercentChange={setJournalInputFontPercent}
              wheelFontResizeEnabled={enableWheelFontResize}
              entryFontPercent={journalEntryFontPercent}
              onEntryFontPercentChange={setJournalEntryFontPercent}
              responseFontPercent={journalResponseFontPercent}
              onResponseFontPercentChange={setJournalResponseFontPercent}
            />
          )}
          {mode === "explore" && (
            <ExploreMode
              key={`explore-${profileEpoch}`}
              isFocused={isFocused}
              setIsFocused={setIsFocused}
              draft={exploreDraft}
              setDraft={setExploreDraft}
              focusToken={exploreFocusToken}
              fontPercent={exploreInputFontPercent}
              onFontPercentChange={setExploreInputFontPercent}
              wheelFontResizeEnabled={enableWheelFontResize}
            />
          )}
          {mode === "modify" && <ModifyMode mode={mode} switchMode={switchMode} />}
        </div>

        {mode !== "modify" && (
          <div
            className={`fixed bottom-6 right-6 font-sans text-xs ${
              mode === "explore"
                ? "text-[oklch(0.6_0.02_260)]"
                : "text-muted-foreground/30"
            }`}
          >
            <kbd
              className={`rounded px-1.5 py-0.5 text-[10px] ${
                mode === "explore" ? "bg-[oklch(0.92_0.01_260)]" : "bg-muted/50"
              }`}
            >
              Shift
            </kbd>
            {" + "}
            <kbd
              className={`rounded px-1.5 py-0.5 text-[10px] ${
                mode === "explore" ? "bg-[oklch(0.92_0.01_260)]" : "bg-muted/50"
              }`}
            >
              Tab
            </kbd>
            <span className="ml-1.5">to switch modes</span>
          </div>
        )}
      </main>

      <ProviderSettings
        open={settingsOpen}
        initialTab={settingsInitialTab}
        persistUnsentDrafts={persistUnsentDrafts}
        onPersistUnsentDraftsChange={setPersistUnsentDrafts}
        enableWheelFontResize={enableWheelFontResize}
        onEnableWheelFontResizeChange={setEnableWheelFontResize}
        journalInputFontPercent={journalInputFontPercent}
        onJournalInputFontPercentChange={setJournalInputFontPercent}
        exploreInputFontPercent={exploreInputFontPercent}
        onExploreInputFontPercentChange={setExploreInputFontPercent}
        journalEntryFontPercent={journalEntryFontPercent}
        onJournalEntryFontPercentChange={setJournalEntryFontPercent}
        journalResponseFontPercent={journalResponseFontPercent}
        onJournalResponseFontPercentChange={setJournalResponseFontPercent}
        onClose={() => {
          setSettingsOpen(false);
          setSettingsInitialTab("profile");
          void pollStatus();
        }}
        onProfileChanged={onProfileChanged}
      />
    </>
  );
}
