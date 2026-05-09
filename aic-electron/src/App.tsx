import { useCallback, useEffect, useState } from "react";
import { ExploreMode } from "./components/ExploreMode";
import { JournalMode } from "./components/JournalMode";
import { ModeToggle, type Mode } from "./components/ModeToggle";
import { ModifyMode } from "./components/ModifyMode";
import { ProviderSettings } from "./components/ProviderSettings";
import { fetchLlmStatus, healthCheck } from "./lib/api";

export default function App() {
  const [mode, setMode] = useState<Mode>("journal");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [llmOk, setLlmOk] = useState<boolean | null>(null);
  const [llmLabel, setLlmLabel] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const switchMode = useCallback((next: Mode) => {
    if (next === mode) return;
    setIsTransitioning(true);
    window.setTimeout(() => {
      setMode(next);
      window.setTimeout(() => setIsTransitioning(false), 150);
    }, 150);
  }, [mode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === "Tab") {
        e.preventDefault();
        const order: Mode[] = ["journal", "explore", "modify"];
        const idx = order.indexOf(mode);
        switchMode(order[(idx + 1) % order.length]);
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
                <ModeToggle mode={mode} onChange={switchMode} variant="center" />
              </nav>
              <span className="hidden text-muted-foreground sm:inline">|</span>
              <div className="flex flex-wrap items-center justify-center gap-3 font-sans text-xs text-muted-foreground">
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
            <JournalMode isFocused={isFocused} setIsFocused={setIsFocused} />
          )}
          {mode === "explore" && (
            <ExploreMode isFocused={isFocused} setIsFocused={setIsFocused} />
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
        onClose={() => {
          setSettingsOpen(false);
          void pollStatus();
        }}
      />
    </>
  );
}
