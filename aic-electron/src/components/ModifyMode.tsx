import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ModeToggle, type Mode } from "./ModeToggle";

type ImpactItem = { label: string; value: string };

const EXAMPLES = [
  "Add document upload to Explore mode",
  "Add dark mode",
  "Let me search for entries based on keywords",
];

const SAMPLE = {
  title: "Add document upload to Explore mode",
  description:
    "This change would let you attach documents during Explore conversations so the AI can discuss, summarize, or reason about the file in context.",
  impact: [
    { label: "UI", value: "adds upload button" },
    { label: "Data", value: "stores file locally" },
    { label: "Safety", value: "no existing data modified" },
  ] as ImpactItem[],
};

export function ModifyMode({
  mode,
  switchMode,
}: {
  mode: Mode;
  switchMode: (m: Mode) => void;
}) {
  const [modifyRequest, setModifyRequest] = useState("");
  const [modifyEngineMessage, setModifyEngineMessage] = useState<string | null>(null);
  const [isImpactEditable, setIsImpactEditable] = useState(false);
  const [proposedChange, setProposedChange] = useState(SAMPLE);
  const modifyRequestRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = useCallback(() => {
    const ta = modifyRequestRef.current;
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
  }, [modifyRequest, autoResize]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await apiFetch("/modify/engine/status");
        if (!r.ok || cancelled) return;
        const d = (await r.json()) as { ready?: boolean; message?: string };
        if (!d.ready && d.message) setModifyEngineMessage(d.message);
        else setModifyEngineMessage(null);
      } catch {
        if (!cancelled) setModifyEngineMessage(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col py-2">
      <div className="mb-10 flex items-center justify-between">
        <div>
          <h1 className="font-sans text-xl font-medium tracking-tight text-[oklch(0.3_0.015_200)]">
            Modify
          </h1>
          <p className="mt-0.5 font-sans text-sm text-[oklch(0.55_0.01_200)]">
            Shape your app without writing code
          </p>
        </div>
        <ModeToggle mode={mode} onChange={switchMode} variant="header" />
      </div>

      <p className="mb-6 rounded-lg border border-dashed border-[oklch(0.85_0.02_200)] bg-white/40 px-4 py-3 font-sans text-sm text-[oklch(0.45_0.02_200)]">
        Local modification engine (restore points, Cursor CLI, safety checks) ships in a later
        milestone. For now, use this space to capture what you want CortexLog to become next.
      </p>
      {modifyEngineMessage && (
        <p className="mb-4 rounded-lg border border-amber-200/80 bg-amber-50/90 px-4 py-2 font-sans text-xs text-amber-950">
          <span className="font-semibold">Modify Engine: </span>
          {modifyEngineMessage} Open Settings → Modify Engine to run checks.
        </p>
      )}

      <div className="flex flex-1 gap-8">
        <div className="flex flex-1 flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h2 className="font-sans text-xs font-semibold uppercase tracking-widest text-[oklch(0.55_0.01_200)]">
              Request
            </h2>
            <textarea
              ref={modifyRequestRef}
              value={modifyRequest}
              onChange={(e) => setModifyRequest(e.target.value)}
              placeholder="What would you like to change?"
              className="scrollbar-thin w-full resize-none rounded-xl border-none bg-white/60 px-5 py-4 font-sans text-lg leading-7 text-[oklch(0.25_0.015_200)] shadow-sm outline-none transition-shadow duration-300 placeholder:text-[oklch(0.65_0.01_200)] focus:shadow-md focus:ring-2 focus:ring-[oklch(0.7_0.06_200)]/40"
              style={{ minHeight: "56px" }}
              rows={1}
              spellCheck
              aria-label="Modify request"
            />
            <p className="mt-1 px-1 font-sans text-xs text-[oklch(0.6_0.01_200)]">
              Describe the outcome, not the implementation
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <p className="font-sans text-xs font-medium uppercase tracking-widest text-[oklch(0.65_0.01_200)]">
              Examples
            </p>
            <ul className="flex flex-col gap-2">
              {EXAMPLES.map((example) => (
                <li key={example}>
                  <button
                    type="button"
                    onClick={() => setModifyRequest(example)}
                    className="w-full rounded-lg py-2 px-3 text-left font-sans text-sm text-[oklch(0.45_0.02_200)] transition-colors duration-200 hover:bg-white/50 hover:text-[oklch(0.3_0.02_200)]"
                  >
                    &ldquo;{example}&rdquo;
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              disabled
              title="Modify harness not enabled yet"
              className="rounded-lg bg-[oklch(0.3_0.015_200)] px-4 py-2 font-sans text-sm font-medium text-white opacity-50"
            >
              Generate proposal
            </button>
            <button type="button" disabled className="rounded-lg px-4 py-2 font-sans text-sm opacity-50">
              Edit request
            </button>
          </div>
        </div>

        <div className="w-px bg-[oklch(0.85_0.01_200)]" aria-hidden />

        <div className="flex flex-1 flex-col gap-5">
          <h2 className="font-sans text-xs font-semibold uppercase tracking-widest text-[oklch(0.55_0.01_200)]">
            Proposed change (preview)
          </h2>
          <div className="flex flex-col gap-5 rounded-xl bg-white/60 px-6 py-5 shadow-sm">
            <h3 className="font-sans text-base font-semibold text-[oklch(0.28_0.015_200)]">
              {proposedChange.title}
            </h3>
            <p className="font-sans text-sm leading-relaxed text-[oklch(0.45_0.01_200)]">
              {proposedChange.description}
            </p>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="font-sans text-xs font-semibold uppercase tracking-widest text-[oklch(0.55_0.01_200)]">
                  Impact
                </p>
                <button
                  type="button"
                  onClick={() => setIsImpactEditable((v) => !v)}
                  className={`rounded-md px-2.5 py-1 font-sans text-xs transition-colors duration-200 ${
                    isImpactEditable
                      ? "bg-[oklch(0.7_0.06_200)]/20 font-medium text-[oklch(0.35_0.06_200)]"
                      : "text-[oklch(0.6_0.01_200)] hover:bg-[oklch(0.9_0.01_200)]"
                  }`}
                >
                  {isImpactEditable ? "Done" : "Edit"}
                </button>
              </div>
              <ul className="flex flex-col gap-2">
                {proposedChange.impact.map((item, i) => (
                  <li key={item.label} className="flex items-start gap-3 font-sans text-sm">
                    <span className="w-20 shrink-0 font-medium text-[oklch(0.55_0.01_200)]">
                      {item.label}
                    </span>
                    {isImpactEditable ? (
                      <input
                        type="text"
                        value={item.value}
                        onChange={(e) => {
                          const next = [...proposedChange.impact];
                          next[i] = { ...next[i], value: e.target.value };
                          setProposedChange((p) => ({ ...p, impact: next }));
                        }}
                        className="flex-1 rounded border-none bg-[oklch(0.96_0.008_200)] px-2 py-0.5 text-[oklch(0.35_0.01_200)] outline-none focus:ring-1 focus:ring-[oklch(0.7_0.06_200)]/40"
                      />
                    ) : (
                      <span className="text-[oklch(0.4_0.01_200)]">{item.value}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                disabled
                title="Harness not enabled"
                className="rounded-lg bg-[oklch(0.3_0.015_200)] px-4 py-2 font-sans text-sm font-medium text-white opacity-50"
              >
                Apply
              </button>
              <button type="button" disabled className="rounded-lg px-4 py-2 font-sans text-sm opacity-50">
                Reject
              </button>
            </div>
          </div>
        </div>
      </div>

      <footer className="mt-12 flex items-center gap-6 border-t border-[oklch(0.88_0.01_200)] pt-5">
        {["Create restore point", "Undo last change", "View history"].map((label) => (
          <button
            key={label}
            type="button"
            disabled
            title="Coming with Modify harness"
            className="flex items-center gap-2 font-sans text-xs text-[oklch(0.6_0.01_200)] opacity-50"
          >
            {label}
          </button>
        ))}
      </footer>

    </div>
  );
}
