import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { apiFetch } from "@/lib/api";

export type JournalEntryRow = {
  id: string;
  content: string;
  created_at: string;
  reflection?: string | null;
};

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** e.g. January 1, 2026. 12:05 PM */
function formatEntryStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const datePart = d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const timePart = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${datePart}. ${timePart}`;
}

function JournalEntryRow({
  entry,
  showReflecting = false,
  showEntryFontIndicator,
  showResponseFontIndicator,
  wheelFontResizeEnabled,
  entryFontPercent,
  responseFontPercent,
  onEntryFontPercentChange,
  onResponseFontPercentChange,
}: {
  entry: JournalEntryRow;
  showReflecting?: boolean;
  showEntryFontIndicator: boolean;
  showResponseFontIndicator: boolean;
  wheelFontResizeEnabled: boolean;
  entryFontPercent: number;
  responseFontPercent: number;
  onEntryFontPercentChange: (next: number) => void;
  onResponseFontPercentChange: (next: number) => void;
}) {
  const stamp = formatEntryStamp(entry.created_at);
  const entryScale = entryFontPercent / 100;
  const responseScale = responseFontPercent / 100;

  const handleEntryWheel = (e: React.WheelEvent<HTMLParagraphElement>) => {
    if (!wheelFontResizeEnabled || !e.ctrlKey) return;
    e.preventDefault();
    if (e.deltaY < 0) {
      onEntryFontPercentChange(Math.max(70, entryFontPercent - 1));
    } else if (e.deltaY > 0) {
      onEntryFontPercentChange(Math.min(140, entryFontPercent + 1));
    }
  };

  const handleResponseWheel = (e: React.WheelEvent<HTMLParagraphElement>) => {
    if (!wheelFontResizeEnabled || !e.ctrlKey) return;
    e.preventDefault();
    if (e.deltaY < 0) {
      onResponseFontPercentChange(Math.max(70, responseFontPercent - 1));
    } else if (e.deltaY > 0) {
      onResponseFontPercentChange(Math.min(140, responseFontPercent + 1));
    }
  };

  return (
    <div className="flex gap-6 md:gap-10">
      <div className="relative basis-[55%]">
        {stamp ? (
          <time
            dateTime={entry.created_at}
            className="mb-4 block font-sans text-[0.8125rem] tracking-wide text-muted-foreground/75"
          >
            {stamp}
          </time>
        ) : null}
        <p
          onWheel={handleEntryWheel}
          className="whitespace-pre-wrap font-serif text-foreground"
          style={{
            fontSize: `calc(1.25rem * ${entryScale})`,
            lineHeight: `calc(2rem * ${entryScale})`,
          }}
        >
          {entry.content}
        </p>
        <div
          className={`pointer-events-none absolute right-0 top-1 rounded-full border border-border/70 bg-background/70 px-2 py-0.5 text-[10px] font-sans tracking-wide text-muted-foreground/85 shadow-sm transition-opacity duration-500 ${
            showEntryFontIndicator ? "opacity-100" : "opacity-0"
          }`}
        >
          {entryFontPercent}
        </div>
      </div>
      <div className="relative basis-[45%] border-l border-muted-foreground/15 pl-6 md:pl-10">
        {stamp ? <div className="mb-4 h-[1.125rem]" aria-hidden /> : null}
        {entry.reflection ? (
          <p
            onWheel={handleResponseWheel}
            className="whitespace-pre-wrap font-serif italic text-muted-foreground/70"
            style={{
              fontSize: `calc(1.125rem * ${responseScale})`,
              lineHeight: `calc(2rem * ${responseScale})`,
            }}
          >
            {entry.reflection}
          </p>
        ) : (
          <p className="font-serif text-sm text-muted-foreground/50">
            {showReflecting ? "Reflecting…" : "No reflection yet."}
          </p>
        )}
        <div
          className={`pointer-events-none absolute right-0 top-1 rounded-full border border-border/70 bg-background/70 px-2 py-0.5 text-[10px] font-sans tracking-wide text-muted-foreground/85 shadow-sm transition-opacity duration-500 ${
            showResponseFontIndicator ? "opacity-100" : "opacity-0"
          }`}
        >
          {responseFontPercent}
        </div>
      </div>
    </div>
  );
}

export function JournalMode({
  isFocused,
  setIsFocused,
  draft,
  setDraft,
  focusToken,
  fontPercent,
  onFontPercentChange,
  wheelFontResizeEnabled,
  entryFontPercent,
  onEntryFontPercentChange,
  responseFontPercent,
  onResponseFontPercentChange,
}: {
  isFocused: boolean;
  setIsFocused: (v: boolean) => void;
  draft: string;
  setDraft: (v: string) => void;
  focusToken: number;
  fontPercent: number;
  onFontPercentChange: (next: number) => void;
  wheelFontResizeEnabled: boolean;
  entryFontPercent: number;
  onEntryFontPercentChange: (next: number) => void;
  responseFontPercent: number;
  onResponseFontPercentChange: (next: number) => void;
}) {
  const [entries, setEntries] = useState<JournalEntryRow[]>([]);
  const [reflectingEntryIds, setReflectingEntryIds] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compactInput, setCompactInput] = useState(false);
  const [showInputFontIndicator, setShowInputFontIndicator] = useState(false);
  const [showEntryFontIndicator, setShowEntryFontIndicator] = useState(false);
  const [showResponseFontIndicator, setShowResponseFontIndicator] = useState(false);
  const journalTextareaRef = useRef<HTMLTextAreaElement>(null);
  const today = new Date();
  const inputIndicatorInitialized = useRef(false);
  const entryIndicatorInitialized = useRef(false);
  const responseIndicatorInitialized = useRef(false);
  const hideInputIndicatorTimer = useRef<number | null>(null);
  const hideEntryIndicatorTimer = useRef<number | null>(null);
  const hideResponseIndicatorTimer = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/journal");
      if (!res.ok) return;
      const data = (await res.json()) as { entries?: JournalEntryRow[] };
      setEntries(data.entries || []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setEntryReflecting = useCallback((entryId: string, reflecting: boolean) => {
    setReflectingEntryIds((prev) => {
      if (reflecting) {
        if (prev.includes(entryId)) return prev;
        return [...prev, entryId];
      }
      return prev.filter((id) => id !== entryId);
    });
  }, []);

  const reflectEntryInBackground = useCallback(
    async (entryId: string) => {
      setEntryReflecting(entryId, true);
      try {
        await apiFetch("/journal/reflect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entry_id: entryId }),
        });
      } catch {
        /* reflection optional if LLM down */
      } finally {
        setEntryReflecting(entryId, false);
        await load();
      }
    },
    [load, setEntryReflecting],
  );

  const autoResize = useCallback(() => {
    const ta = journalTextareaRef.current;
    if (!ta) return;
    const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 28;
    const compactThreshold = lineHeight * 4;
    const maxHeight = lineHeight * (compactInput ? 6 : 4);
    ta.style.height = "auto";
    const sh = ta.scrollHeight;
    if (!compactInput && sh > compactThreshold) {
      setCompactInput(true);
    } else if (compactInput && sh <= lineHeight * 3.5) {
      setCompactInput(false);
    }
    if (sh <= maxHeight) {
      ta.style.height = `${Math.max(sh, lineHeight)}px`;
      ta.style.overflowY = "hidden";
    } else {
      ta.style.height = `${maxHeight}px`;
      ta.style.overflowY = "auto";
    }
  }, [compactInput]);

  useEffect(() => {
    autoResize();
  }, [draft, autoResize]);

  useEffect(() => {
    if (focusToken <= 0) return;
    const id = window.setTimeout(() => {
      journalTextareaRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, [focusToken]);

  useEffect(() => {
    if (!inputIndicatorInitialized.current) {
      inputIndicatorInitialized.current = true;
      return;
    }
    setShowInputFontIndicator(true);
    if (hideInputIndicatorTimer.current != null) {
      window.clearTimeout(hideInputIndicatorTimer.current);
    }
    hideInputIndicatorTimer.current = window.setTimeout(() => {
      setShowInputFontIndicator(false);
    }, 2400);
  }, [fontPercent]);

  useEffect(() => {
    if (!entryIndicatorInitialized.current) {
      entryIndicatorInitialized.current = true;
      return;
    }
    setShowEntryFontIndicator(true);
    if (hideEntryIndicatorTimer.current != null) {
      window.clearTimeout(hideEntryIndicatorTimer.current);
    }
    hideEntryIndicatorTimer.current = window.setTimeout(() => {
      setShowEntryFontIndicator(false);
    }, 2400);
  }, [entryFontPercent]);

  useEffect(() => {
    if (!responseIndicatorInitialized.current) {
      responseIndicatorInitialized.current = true;
      return;
    }
    setShowResponseFontIndicator(true);
    if (hideResponseIndicatorTimer.current != null) {
      window.clearTimeout(hideResponseIndicatorTimer.current);
    }
    hideResponseIndicatorTimer.current = window.setTimeout(() => {
      setShowResponseFontIndicator(false);
    }, 2400);
  }, [responseFontPercent]);

  useEffect(
    () => () => {
      if (hideInputIndicatorTimer.current != null) {
        window.clearTimeout(hideInputIndicatorTimer.current);
      }
      if (hideEntryIndicatorTimer.current != null) {
        window.clearTimeout(hideEntryIndicatorTimer.current);
      }
      if (hideResponseIndicatorTimer.current != null) {
        window.clearTimeout(hideResponseIndicatorTimer.current);
      }
    },
    [],
  );

  const submitEntry = async () => {
    const content = draft.trim();
    if (!content) return;
    setError(null);
    const saveRes = await apiFetch("/journal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!saveRes.ok) {
      const err = (await saveRes.json().catch(() => ({}))) as { detail?: string };
      setError(err.detail || "Could not save entry.");
      return;
    }
    const saveData = (await saveRes.json()) as { entry?: { id: string } };
    const entryId = saveData.entry?.id;
    setDraft("");
    if (entryId) {
      setEntryReflecting(entryId, true);
    }
    await load();
    if (entryId) {
      void reflectEntryInBackground(entryId);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submitEntry();
    }
  };

  const wordCount = draft.trim()
    ? draft.trim().split(/\s+/).length
    : 0;

  // Most recent entry first
  const sortedEntries = [...entries].reverse();
  // The newest entry is always shown as "current"; older ones are behind the toggle
  const currentEntry = sortedEntries[0] ?? null;
  const olderEntries = sortedEntries.slice(1);
  const hasOlderEntries = olderEntries.length > 0;
  const historyToggleLabel = hasOlderEntries
    ? showHistory
      ? "Hide entries"
      : "See previous entries"
    : currentEntry
      ? showHistory
        ? "Hide entry"
        : "View last entry"
      : "See previous entries";

  const scrollToCurrentEntry = () => {
    document.getElementById("journal-current-entry")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const handleHistoryToggle = () => {
    if (!hasOlderEntries && currentEntry) {
      setShowHistory((v) => {
        const next = !v;
        if (!v) {
          window.requestAnimationFrame(() => scrollToCurrentEntry());
        }
        return next;
      });
      return;
    }
    setShowHistory((v) => !v);
  };

  const handleWheel = (e: React.WheelEvent<HTMLTextAreaElement>) => {
    if (!wheelFontResizeEnabled || !e.ctrlKey) return;
    e.preventDefault();
    if (e.deltaY < 0) {
      onFontPercentChange(Math.max(70, fontPercent - 1));
    } else if (e.deltaY > 0) {
      onFontPercentChange(Math.min(140, fontPercent + 1));
    }
  };

  const baseFontRem = compactInput ? 1.125 : 1.25;
  const baseLineHeightRem = compactInput ? 2 : 2.25;
  const scale = fontPercent / 100;

  return (
    <div className="relative">
      <header
        className={`mb-10 transition-opacity duration-500 ${
          isFocused ? "opacity-40" : "opacity-100"
        }`}
      >
        <time
          dateTime={today.toISOString()}
          className="text-sm font-sans uppercase tracking-wide text-muted-foreground"
        >
          {formatDate(today)}
        </time>
      </header>

      {error && (
        <p className="mb-4 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      {/* Input always at the top */}
      <div className="relative">
        <textarea
          ref={journalTextareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onWheel={handleWheel}
          placeholder="Begin writing..."
          className="scrollbar-thin w-full resize-none border-none bg-transparent font-serif text-foreground outline-none placeholder:italic placeholder:text-muted-foreground/50 selection:bg-accent/30"
          style={{
            minHeight: "36px",
            fontSize: `calc(${baseFontRem}rem * ${scale})`,
            lineHeight: `calc(${baseLineHeightRem}rem * ${scale})`,
          }}
          rows={1}
          spellCheck
          aria-label="Journal entry"
        />
        <div
          className={`pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-[11px] font-sans tracking-wide text-muted-foreground/85 shadow-sm transition-opacity duration-500 ${
            showInputFontIndicator ? "opacity-100" : "opacity-0"
          }`}
        >
          {fontPercent}
        </div>
      </div>

      <footer
        className={`mt-12 flex items-center justify-between gap-4 transition-opacity duration-500 ${
          isFocused ? "opacity-30" : "opacity-60"
        }`}
      >
        <p className="font-sans text-xs tracking-wide text-muted-foreground">
          {wordCount > 0 ? `${wordCount} words` : ""}
        </p>
        <p className="shrink-0 font-sans text-xs text-muted-foreground/50">Press Enter to submit</p>
      </footer>

      {/* Most recent entry — always visible once submitted */}
      {currentEntry && (
        <div
          id="journal-current-entry"
          className="mt-16 border-t border-muted-foreground/10 pt-12"
        >
          <JournalEntryRow
            entry={currentEntry}
            showReflecting={reflectingEntryIds.includes(currentEntry.id)}
            showEntryFontIndicator={showEntryFontIndicator}
            showResponseFontIndicator={showResponseFontIndicator}
            wheelFontResizeEnabled={wheelFontResizeEnabled}
            entryFontPercent={entryFontPercent}
            responseFontPercent={responseFontPercent}
            onEntryFontPercentChange={onEntryFontPercentChange}
            onResponseFontPercentChange={onResponseFontPercentChange}
          />
        </div>
      )}

      {/* Older entries revealed on demand, reverse chronological */}
      {showHistory && olderEntries.length > 0 && (
        <div className="mt-12 space-y-10">
          {olderEntries.map((entry) => (
            <JournalEntryRow
              key={entry.id}
              entry={entry}
              showReflecting={reflectingEntryIds.includes(entry.id)}
              showEntryFontIndicator={showEntryFontIndicator}
              showResponseFontIndicator={showResponseFontIndicator}
              wheelFontResizeEnabled={wheelFontResizeEnabled}
              entryFontPercent={entryFontPercent}
              responseFontPercent={responseFontPercent}
              onEntryFontPercentChange={onEntryFontPercentChange}
              onResponseFontPercentChange={onResponseFontPercentChange}
            />
          ))}
        </div>
      )}

      {/* Fixed bottom-left — always visible for consistency from startup */}
      <div className="fixed bottom-6 left-6 z-10">
        <button
          type="button"
          onClick={handleHistoryToggle}
          className={`font-sans text-xs tracking-wide transition-all duration-300 ${
            isFocused
              ? "opacity-40 hover:opacity-70"
              : "opacity-80 hover:opacity-100"
          } text-muted-foreground`}
        >
          {historyToggleLabel}
        </button>
      </div>
    </div>
  );
}
