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
}: {
  entry: JournalEntryRow;
  showReflecting?: boolean;
}) {
  const stamp = formatEntryStamp(entry.created_at);

  return (
    <div className="flex gap-8 md:gap-12">
      <div className="flex-1">
        {stamp ? (
          <time
            dateTime={entry.created_at}
            className="mb-4 block font-sans text-[0.8125rem] tracking-wide text-muted-foreground/75"
          >
            {stamp}
          </time>
        ) : null}
        <p className="whitespace-pre-wrap font-serif text-xl leading-relaxed text-foreground md:text-2xl">
          {entry.content}
        </p>
      </div>
      <div className="flex-1 border-l border-muted-foreground/15 pl-8 md:pl-12">
        {stamp ? <div className="mb-4 h-[1.125rem]" aria-hidden /> : null}
        {entry.reflection ? (
          <p className="whitespace-pre-wrap font-serif text-lg italic leading-relaxed text-muted-foreground/70">
            {entry.reflection}
          </p>
        ) : (
          <p className="font-serif text-sm text-muted-foreground/50">
            {showReflecting ? "Reflecting…" : "No reflection yet."}
          </p>
        )}
      </div>
    </div>
  );
}

export function JournalMode({
  isFocused,
  setIsFocused,
}: {
  isFocused: boolean;
  setIsFocused: (v: boolean) => void;
}) {
  const [journalContent, setJournalContent] = useState("");
  const [entries, setEntries] = useState<JournalEntryRow[]>([]);
  const [reflectingEntryIds, setReflectingEntryIds] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const journalTextareaRef = useRef<HTMLTextAreaElement>(null);
  const today = new Date();

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
    const maxHeight = lineHeight * 4;
    ta.style.height = "auto";
    const sh = ta.scrollHeight;
    if (sh <= maxHeight) {
      ta.style.height = `${Math.max(sh, lineHeight)}px`;
      ta.style.overflowY = "hidden";
    } else {
      ta.style.height = `${maxHeight}px`;
      ta.style.overflowY = "auto";
    }
  }, []);

  useEffect(() => {
    autoResize();
  }, [journalContent, autoResize]);

  const submitEntry = async () => {
    const content = journalContent.trim();
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
    setJournalContent("");
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

  const wordCount = journalContent.trim()
    ? journalContent.trim().split(/\s+/).length
    : 0;

  // Most recent entry first
  const sortedEntries = [...entries].reverse();
  // The newest entry is always shown as "current"; older ones are behind the toggle
  const currentEntry = sortedEntries[0] ?? null;
  const olderEntries = sortedEntries.slice(1);
  const hasOlderEntries = olderEntries.length > 0;
  const hasJournalHistory = entries.length > 0;

  const historyToggleLabel = hasOlderEntries
    ? showHistory
      ? "Hide entries"
      : "See previous entries"
    : showHistory
      ? "Hide entry"
      : "View last entry";

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
      <textarea
        ref={journalTextareaRef}
        value={journalContent}
        onChange={(e) => setJournalContent(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder="Begin writing..."
        className="scrollbar-thin w-full resize-none border-none bg-transparent font-serif text-xl leading-9 text-foreground outline-none placeholder:italic placeholder:text-muted-foreground/50 selection:bg-accent/30 md:text-2xl"
        style={{ minHeight: "36px" }}
        rows={1}
        spellCheck
        aria-label="Journal entry"
      />

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
            />
          ))}
        </div>
      )}

      {/* Fixed bottom-left — same control, visible whenever this profile has journal history */}
      {hasJournalHistory && (
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
      )}
    </div>
  );
}
