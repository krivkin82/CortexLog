export type Mode = "journal" | "explore" | "modify";

type Props = {
  mode: Mode;
  onChange: (m: Mode) => void;
  variant?: "center" | "header";
};

export function ModeToggle({ mode, onChange, variant = "center" }: Props) {
  const modes: Mode[] = ["journal", "explore", "modify"];
  const baseBtn =
    variant === "header"
      ? "text-sm tracking-wide transition-all duration-300 font-sans"
      : "text-sm tracking-wide transition-all duration-300 font-sans";

  return (
    <nav className="flex items-center gap-3">
      {modes.map((m, i) => (
        <span key={m} className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onChange(m)}
            className={`${baseBtn} ${
              mode === m
                ? m === "explore"
                  ? "text-[oklch(0.3_0.02_260)] font-semibold"
                  : variant === "header"
                    ? "text-[oklch(0.3_0.015_200)] font-semibold"
                    : "text-foreground font-medium"
                : variant === "header"
                  ? "text-[oklch(0.6_0.01_200)] hover:text-[oklch(0.4_0.01_200)]"
                  : "text-muted-foreground hover:text-foreground/70"
            }`}
          >
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
          {i < modes.length - 1 && (
            <span
              className={
                variant === "header"
                  ? "text-[oklch(0.75_0.01_200)]"
                  : "text-muted-foreground/40"
              }
            >
              •
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
