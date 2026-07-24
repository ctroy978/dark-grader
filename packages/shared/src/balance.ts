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

/**
 * Roster counts for a new campaign.
 * Total 22: art-aligned gender pools (see server/src/seed/names.ts).
 * Males: Vanguard, FireMage, Doomcaller, Necromancer, Thundercaller
 * Females: ShieldMaiden, Healer, Archer, Runesinger
 */
export const ROSTER_COUNTS: { archetype: Archetype; count: number }[] = [
  { archetype: "Vanguard", count: 2 },
  { archetype: "ShieldMaiden", count: 3 },
  { archetype: "FireMage", count: 3 },
  { archetype: "Healer", count: 3 },
  { archetype: "Archer", count: 3 },
  { archetype: "Doomcaller", count: 2 },
  { archetype: "Necromancer", count: 2 },
  { archetype: "Thundercaller", count: 2 },
  { archetype: "Runesinger", count: 2 },
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

/**
 * Residual claim weights after magnet’s guaranteed token.
 * Adjacent (to magnet) vs other living soldiers — relative ratio 2:1.
 * Magnet soldier is excluded (weight 0) and always receives one random token first.
 */
export const ADJACENT_WEIGHT = 0.2;
export const OTHER_WEIGHT = 0.1;
/** @deprecated Magnet always claims; no probabilistic magnet weight. */
export const MAGNET_WEIGHT = 0;

export const PARTY_SIZE = 6;

/**
 * DoT defaults — base per stack before boss escalation.
 *
 * Party Poison is one splash (max stacks × intensity across the line), not
 * per carrier; magnet takes the largest share.
 *
 * Boss-sourced party DoTs (see `escalationStep` on DotInstance) tick as:
 *   base × stacks × intensity
 * Intensity starts at 1 and +1 after each tick while the DoT remains.
 * Example Poison (base 8, 4 rounds, intensity 1→4): 8 + 16 + 24 + 32 = 80
 * if never cleansed. Player/ally DoTs stay flat (intensity 1 forever).
 *
 * Fire is softer than early prototypes: tick 4 + party stack cap 2 so Cloud
 * spam buys response time without deleting the burn threat (intensity still ramps).
 */
export const DOT_STATS = {
  Fire: { tick: 4, duration: 3 },
  Ice: { tick: 3, duration: 3 },
  /** Party splash total per stack at intensity 1 (split across living line) */
  Poison: { tick: 8, duration: 4 },
  Slime: { tick: 2, duration: 5 },
} as const;

/** Max Fire stacks on a party soldier (Clouds / imp hits stop piling past this). */
export const MAX_PARTY_FIRE_STACKS = 2;

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
