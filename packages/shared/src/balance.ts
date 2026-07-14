import type { Archetype, Grade } from "./types.js";

/** Base max HP by archetype (design §6.1) */
export const ARCHETYPE_MAX_HP: Record<Archetype, number> = {
  Vanguard: 55,
  ShieldMaiden: 48,
  FireMage: 38,
  Healer: 40,
  Archer: 36,
  Doomcaller: 42,
  Necromancer: 40,
  Thundercaller: 38,
  Runesinger: 40,
};

/** Roster counts for a new campaign (design §6.0) */
export const ROSTER_COUNTS: { archetype: Archetype; count: number }[] = [
  { archetype: "Vanguard", count: 2 },
  { archetype: "ShieldMaiden", count: 3 },
  { archetype: "FireMage", count: 3 },
  { archetype: "Healer", count: 3 },
  { archetype: "Archer", count: 6 },
  { archetype: "Doomcaller", count: 1 },
  { archetype: "Necromancer", count: 1 },
  { archetype: "Thundercaller", count: 2 },
  { archetype: "Runesinger", count: 1 },
];

/** Full party (6) drops 3 tokens; scales down as the line thins. */
export const TOKENS_PER_ROUND = 3;
export const CLOUD_DISPLAY_SIZE = 6;

/**
 * Tokens dropped per round = floor(living / 2), at least 1 while anyone lives.
 * 6→3, 5→2, 4→2, 3→1, 2→1, 1→1
 */
export function tokensForLivingCount(livingCount: number): number {
  if (livingCount <= 0) return 0;
  return Math.max(1, Math.floor(livingCount / 2));
}

/** Magnet claim weights (design §1.2) */
export const MAGNET_WEIGHT = 0.3;
export const ADJACENT_WEIGHT = 0.2;
export const OTHER_WEIGHT = 0.1;

export const PARTY_SIZE = 6;

/**
 * DoT defaults — tuned so ticks hurt even after floor-split.
 * Poison is one party splash (max stacks); magnet takes the largest share.
 */
export const DOT_STATS = {
  Fire: { tick: 6, duration: 3 },
  Ice: { tick: 3, duration: 3 },
  /** Party splash total per stack (split across living line) */
  Poison: { tick: 9, duration: 4 },
  Slime: { tick: 2, duration: 5 },
} as const;

/** Retain full fight history for classroom review */
export const MAX_LOG_ENTRIES = 800;

export const INTER_ROOM_VANGUARD_HEAL_PCT = 0.2;

/** Display colors for grades */
export const GRADE_COLORS: Record<Grade, string> = {
  A: "#d4af37",
  B: "#e6c84a",
  C: "#e8e6e3",
  D: "#e07a3a",
  F: "#b91c1c",
};

export const ARCHETYPE_ICONS: Record<Archetype, string> = {
  Vanguard: "🛡️",
  ShieldMaiden: "⚔️",
  FireMage: "🔥",
  Healer: "✨",
  Archer: "🏹",
  Doomcaller: "💀",
  Necromancer: "🌑",
  Thundercaller: "⚡",
  Runesinger: "📜",
};
