import { useEffect, useRef } from "react";

const PREF_KEY = "dg_combat_log";

export type LogEntry = {
  round: number;
  text: string;
  tags?: string[];
};

export function loadLogVisible(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveLogVisible(value: boolean): void {
  try {
    localStorage.setItem(PREF_KEY, value ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
}

function lineClass(tags?: string[]): string {
  if (tags?.includes("telegraph")) return "text-grade-f font-semibold";
  if (tags?.includes("boss")) return "text-grade-d";
  if (tags?.includes("dot")) return "text-grade-d/90";
  if (tags?.includes("tokens")) return "text-rune";
  if (tags?.includes("campaign") || tags?.includes("system"))
    return "text-parchment";
  return "text-parchment-dim";
}

/** Floating scrollable combat log (bottom-left). Renders nothing when closed. */
export function CombatLogPanel({
  log,
  open,
  className = "",
}: {
  log: LogEntry[];
  open: boolean;
  /** Extra positioning classes (e.g. lobby vs combat bottom offset). */
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log, open]);

  if (!open) return null;

  return (
    <div
      className={`pointer-events-auto flex flex-col rounded-lg border border-parchment/20 bg-navy/95 shadow-lg backdrop-blur-sm ${className}`}
      role="log"
      aria-live="polite"
      aria-label="Combat log"
    >
      <div className="shrink-0 border-b border-parchment/10 px-2 py-1 text-[10px] uppercase tracking-widest text-parchment-dim">
        Log
      </div>
      <div
        ref={scrollRef}
        className="max-h-36 overflow-y-auto overscroll-contain px-2 py-1.5 space-y-0.5 text-[11px] leading-snug font-mono"
      >
        {log.length === 0 ? (
          <div className="text-parchment-dim/60 italic">No entries yet.</div>
        ) : (
          log.map((entry, i) => (
            <div
              key={`${entry.round}-${i}-${entry.text.slice(0, 32)}`}
              className={lineClass(entry.tags)}
            >
              <span className="text-rune/70 select-none">R{entry.round}</span>{" "}
              {entry.text}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function LogToggleButton({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      title={open ? "Hide combat log" : "Show combat log"}
      onClick={() => onToggle(!open)}
      className={`rounded-lg border px-2 py-1.5 text-xs ${
        open
          ? "border-rune text-rune"
          : "border-parchment/20 text-parchment-dim"
      }`}
    >
      Log
    </button>
  );
}
