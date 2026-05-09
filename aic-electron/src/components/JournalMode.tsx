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

export function JournalMode({
  isFocused,
  setIsFocused,
}: {
  isFocused: boolean;
  setIsFocused: (v: boolean) => void;
}) {
  const [journalContent, setJournalContent] = useState("");
  const [entries, setEntries] = useState<JournalEntryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const journalTextareaRef = useRef<HTMLTextAreaElement>(null);
  const today = new Date();

  const isSplitView = entries.length > 0;

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
      try {
        await apiFetch("/journal/reflect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entry_id: entryId }),
        });
      } catch {
        /* reflection optional if LLM down */
      }
    }
    await load();
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

  return (
    <div className="relative">
      <header
        className={`mb-10 transition-opacity duration-500 ${
          isFocused ? "opacity-40" : "opacity-100"
        } ${isSplitView ? "text-center" : ""}`}
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

      {isSplitView && (
        <div className="mb-12 space-y-8">
          {entries.map((entry) => (
            <div key={entry.id} className="flex gap-8 md:gap-12">
              <div className="flex-1">
                <p className="font-serif text-xl leading-relaxed text-foreground md:text-2xl">
                  {entry.content}
                </p>
              </div>
              <div className="flex-1 border-l border-muted-foreground/15 pl-8 md:pl-12">
                {entry.reflection ? (
                  <p className="font-serif text-lg italic leading-relaxed text-muted-foreground/70">
                    {entry.reflection}
                  </p>
                ) : (
                  <p className="font-serif text-sm text-muted-foreground/50">No reflection yet.</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={isSplitView ? "flex gap-8 md:gap-12" : ""}>
        <div className={isSplitView ? "flex-1" : ""}>
          <textarea
            ref={journalTextareaRef}
            value={journalContent}
            onChange={(e) => setJournalContent(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={isSplitView ? "Continue writing..." : "Begin writing..."}
            className="scrollbar-thin w-full resize-none border-none bg-transparent font-serif text-xl leading-9 text-foreground outline-none placeholder:italic placeholder:text-muted-foreground/50 selection:bg-accent/30 md:text-2xl"
            style={{ minHeight: "36px" }}
            rows={1}
            spellCheck
            aria-label="Journal entry"
          />
        </div>
        {isSplitView && (
          <div className="flex-1 border-l border-muted-foreground/15 pl-8 md:pl-12">
            {journalContent.trim() && (
              <p className="font-serif text-lg italic leading-relaxed text-muted-foreground/40">
                AI response will appear here after you submit…
              </p>
            )}
          </div>
        )}
      </div>

      <footer
        className={`mt-12 flex items-center justify-between transition-opacity duration-500 ${
          isFocused ? "opacity-30" : "opacity-60"
        }`}
      >
        <p className="font-sans text-xs tracking-wide text-muted-foreground">
          {wordCount > 0 ? `${wordCount} words` : ""}
        </p>
        <p className="font-sans text-xs text-muted-foreground/50">Press Enter to submit</p>
      </footer>
    </div>
  );
}
