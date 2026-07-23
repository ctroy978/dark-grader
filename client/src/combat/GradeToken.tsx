import type { Grade } from "@dungeon-grades/shared";

/** Public art paths for Viking-rune grade tokens. */
export const GRADE_TOKEN_SRC: Record<Grade, string> = {
  A: "/art/tokens/grade_A.png",
  B: "/art/tokens/grade_B.png",
  C: "/art/tokens/grade_C.png",
  D: "/art/tokens/grade_D.png",
  F: "/art/tokens/grade_F.png",
};

export const GRADE_RUNE_LABEL: Record<Grade, string> = {
  A: "Rune of Excellence",
  B: "Rune of Merit",
  C: "Rune of Trial",
  D: "Rune of Struggle",
  F: "Rune of Ruin",
};

const SIZE_CLASS = {
  /** Claim badge on party cards */
  xs: "w-5 h-5 md:w-6 md:h-6",
  /** Compact playbook / tables */
  sm: "w-7 h-7 md:w-8 md:h-8",
  /** Pending drop strip (default combat size) */
  md: "w-9 h-9 md:w-11 md:h-11",
  /** Lobby / marketing emphasis */
  lg: "w-14 h-14 md:w-16 md:h-16",
} as const;

export type GradeTokenSize = keyof typeof SIZE_CLASS;

/**
 * Shared Viking-rune grade token — used for pending drops, fall FX, and claims.
 * Always shows the same disc art so pre-drop and pickup match.
 */
export default function GradeToken({
  grade,
  size = "md",
  falling = false,
  bob = false,
  claimed = false,
  delaySec = 0,
  className = "",
  title,
}: {
  grade: Grade;
  size?: GradeTokenSize;
  /** Play the drop animation */
  falling?: boolean;
  /** Idle bob while awaiting magnet */
  bob?: boolean;
  /** Slight “seated” glow after a soldier claims the token */
  claimed?: boolean;
  delaySec?: number;
  className?: string;
  title?: string;
}) {
  const anim = [
    bob && !falling ? "token-bob" : "",
    falling ? "token-fall" : "",
    claimed ? "token-claimed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className={`grade-token relative inline-flex shrink-0 items-center justify-center ${SIZE_CLASS[size]} ${anim} ${className}`}
      style={{ animationDelay: `${delaySec}s` }}
      title={title ?? `${grade} — ${GRADE_RUNE_LABEL[grade]}`}
      role="img"
      aria-label={`Grade ${grade} token`}
    >
      <img
        src={GRADE_TOKEN_SRC[grade]}
        alt=""
        draggable={false}
        className="w-full h-full object-contain select-none pointer-events-none drop-shadow-md"
      />
      {/* Tiny letter hint for classroom readability at a distance */}
      <span
        className={`grade-token-hint absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full bg-navy/90 border border-parchment/25 font-black leading-none text-parchment ${
          size === "xs"
            ? "w-2.5 h-2.5 text-[6px]"
            : size === "sm"
              ? "w-3 h-3 text-[7px]"
              : size === "md"
                ? "w-3.5 h-3.5 text-[8px] md:w-4 md:h-4 md:text-[9px]"
                : "w-4 h-4 text-[9px] md:w-5 md:h-5 md:text-[10px]"
        }`}
        aria-hidden
      >
        {grade}
      </span>
    </span>
  );
}

/** Empty dashed slot in the drop strip (max 3 pending tokens). */
export function GradeTokenSlot({ size = "md" }: { size?: GradeTokenSize }) {
  return (
    <span
      className={`${SIZE_CLASS[size]} rounded-full border-2 border-dashed border-parchment/15 opacity-40 shrink-0`}
      aria-hidden
    />
  );
}
