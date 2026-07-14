import { GRADE_COLORS, type Grade } from "@dungeon-grades/shared";
import type { PresentationCue } from "../api";

/** Comic-style short bubble anchored near a unit (absolute within relative parent). */
export function SpeechBubble({
  cue,
  anchor = "top",
}: {
  cue: PresentationCue;
  anchor?: "top" | "bottom";
}) {
  if (!cue.bubble?.text) return null;
  const gradeColor = cue.grade ? GRADE_COLORS[cue.grade as Grade] : undefined;
  const hostile = cue.bubble.side === "boss" || cue.bubble.side === "minion";

  return (
    <div
      className={`speech-bubble pointer-events-none absolute left-1/2 z-20 w-max max-w-[9rem] -translate-x-1/2 px-2 py-1 text-center text-[11px] md:text-xs font-bold leading-tight shadow-lg ${
        anchor === "top" ? "bottom-[100%] mb-1" : "top-[100%] mt-1"
      } ${
        hostile
          ? "bg-crimson text-parchment border border-crimson-bright"
          : "bg-parchment text-navy border border-parchment-dim"
      }`}
      role="status"
      aria-live="polite"
    >
      {cue.grade && (
        <span
          className="inline-block mr-1 font-black"
          style={{ color: hostile ? gradeColor : undefined }}
        >
          [{cue.grade}]
        </span>
      )}
      {cue.bubble.text}
      <span
        className={`speech-tail absolute left-1/2 -translate-x-1/2 ${
          anchor === "top" ? "top-full" : "bottom-full rotate-180"
        }`}
        style={{
          borderLeft: "6px solid transparent",
          borderRight: "6px solid transparent",
          borderTop: hostile
            ? "6px solid var(--color-crimson)"
            : "6px solid var(--color-parchment)",
        }}
      />
    </div>
  );
}

/** Floating stage bubble when speaker isn't a party card (boss center). */
export function StageBubble({ cue }: { cue: PresentationCue }) {
  if (!cue.bubble?.text) return null;
  const hostile = cue.bubble.side !== "party";
  return (
    <div
      className={`speech-bubble pointer-events-none absolute left-1/2 top-2 z-30 -translate-x-1/2 max-w-sm px-3 py-2 text-center text-sm font-bold shadow-xl ${
        hostile
          ? "bg-crimson text-parchment border-2 border-crimson-bright"
          : "bg-parchment text-navy border-2 border-parchment-dim"
      }`}
    >
      {cue.bubble.speakerName && (
        <div className="text-[10px] uppercase tracking-wide opacity-80 mb-0.5">
          {cue.bubble.speakerName}
        </div>
      )}
      {cue.bubble.text}
    </div>
  );
}
