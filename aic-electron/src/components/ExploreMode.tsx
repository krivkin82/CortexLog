import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

const SESSION_KEY = "cortexlog-explore-session";

type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
};

function getSessionId(): string {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function ExploreMode({
  isFocused,
  setIsFocused,
  draft,
  setDraft,
  focusToken,
  fontPercent,
  onFontPercentChange,
  wheelFontResizeEnabled,
}: {
  isFocused: boolean;
  setIsFocused: (v: boolean) => void;
  draft: string;
  setDraft: (v: string) => void;
  focusToken: number;
  fontPercent: number;
  onFontPercentChange: (next: number) => void;
  wheelFontResizeEnabled: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [compactInput, setCompactInput] = useState(false);
  const [showFontIndicator, setShowFontIndicator] = useState(false);
  const exploreInputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const sessionId = useRef(getSessionId());
  const fontIndicatorInitialized = useRef(false);
  const hideFontIndicatorTimer = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const q = new URLSearchParams({ session_id: sessionId.current });
      const res = await apiFetch(`/chat?${q.toString()}`);
      if (!res.ok) return;
      const data = (await res.json()) as { messages?: Message[] };
      setMessages((data.messages || []).filter((m) => m.role !== "system"));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const autoResize = useCallback(() => {
    const ta = exploreInputRef.current;
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
      exploreInputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, [focusToken]);

  useEffect(() => {
    if (!fontIndicatorInitialized.current) {
      fontIndicatorInitialized.current = true;
      return;
    }
    setShowFontIndicator(true);
    if (hideFontIndicatorTimer.current != null) {
      window.clearTimeout(hideFontIndicatorTimer.current);
    }
    hideFontIndicatorTimer.current = window.setTimeout(() => {
      setShowFontIndicator(false);
    }, 2400);
  }, [fontPercent]);

  useEffect(
    () => () => {
      if (hideFontIndicatorTimer.current != null) {
        window.clearTimeout(hideFontIndicatorTimer.current);
      }
    },
    [],
  );

  const submit = async () => {
    const text = draft.trim();
    if (!text) return;
    setError(null);
    try {
      const res = await apiFetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: text,
          mode: "exploration",
          session_id: sessionId.current,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { detail?: string };
        setError(err.detail || "Explore unavailable.");
        return;
      }
      setDraft("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    }
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

  const baseFontRem = compactInput ? 1 : 1.125;
  const baseLineHeightRem = 1.75;
  const scale = fontPercent / 100;

  return (
    <div className="flex min-h-[70vh] flex-col">
      <header
        className={`mb-10 transition-opacity duration-500 ${
          isFocused ? "opacity-40" : "opacity-100"
        } text-center`}
      >
        <time className="font-sans text-sm uppercase tracking-wide text-[oklch(0.5_0.02_260)]">
          Explore
        </time>
      </header>

      {error && (
        <p className="mb-4 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      <div className="flex-1 space-y-6 pb-8">
        {messages.length === 0 && (
          <p className="font-sans text-lg text-[oklch(0.5_0.03_260)]">What&apos;s on your mind?</p>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`whitespace-pre-wrap font-sans leading-relaxed ${
              message.role === "user"
                ? "text-lg font-medium text-[oklch(0.25_0.02_260)]"
                : "border-l-2 border-[oklch(0.7_0.1_280)] pl-4 text-base text-[oklch(0.45_0.05_280)]"
            }`}
          >
            {message.content}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form
        className="mt-auto pt-8"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="relative">
          <textarea
            ref={exploreInputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onWheel={handleWheel}
            placeholder="Type something..."
            className="scrollbar-thin w-full resize-none rounded-lg border-none bg-[oklch(0.99_0.005_260)] px-4 py-3 font-sans text-[oklch(0.25_0.02_260)] shadow-sm outline-none transition-shadow duration-300 placeholder:text-[oklch(0.6_0.02_260)] focus:shadow-md focus:ring-2 focus:ring-[oklch(0.7_0.1_280)]/30"
            style={{
              minHeight: "52px",
              fontSize: `calc(${baseFontRem}rem * ${scale})`,
              lineHeight: `calc(${baseLineHeightRem}rem * ${scale})`,
            }}
            rows={1}
            aria-label="Explore input"
          />
          <div
            className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-border/70 bg-white/80 px-2.5 py-1 text-[11px] font-sans tracking-wide text-[oklch(0.5_0.02_260)] shadow-sm transition-opacity duration-500 ${
              showFontIndicator ? "opacity-100" : "opacity-0"
            }`}
          >
            {fontPercent}
          </div>
        </div>
      </form>
    </div>
  );
}
