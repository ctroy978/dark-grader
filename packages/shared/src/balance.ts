import type { Archetype, Grade } from "./types.js";

/** Base max HP by archetype (design §6.1) */
export const ARCHETYPE_MAX_HP: Record<Archetype, number> = {
  Vanguard: 55,
  Spearman: 52,
  ShieldMaiden: 48,
  FireMage: 38,
  Healer: 40,
  Archer: 36,
  Necromancer: 40,
  Thundercaller: 38,
  Runesinger: 40,
};

/**
 * Roster counts for a new campaign.
 * Total 21: art-aligned gender pools (see server/src/seed/names.ts).
 * Males: Vanguard, Spearman, FireMage, Necromancer, Thundercaller
 * Females: ShieldMaiden, Healer, Archer, Runesinger
 */
export const ROSTER_COUNTS: { archetype: Archetype; count: number }[] = [
  { archetype: "Vanguard", count: 2 },
  { archetype: "Spearman", count: 2 },
  { archetype: "ShieldMaiden", count: 2 },
  { archetype: "FireMage", count: 3 },
  { archetype: "Healer", count: 3 },
  { archetype: "Archer", count: 3 },
  { archetype: "Necromancer", count: 2 },
  { archetype: "Thundercaller", count: 2 },
  { archetype: "Runesinger", count: 2 },
];

/** Full party (6) drops 3 tokens; scales down as the line thins. */
export const TOKENS_PER_ROUND = 3;
export const CLOUD_DISPLAY_SIZE = 6;

/**
 * Tokens dropped per round by living party size.
 * Holds three tokens through 4 living so understrength parties stay active longer.
 * 6→3, 5→3, 4→3, 3→2, 2→1, 1→1
 */
export function tokensForLivingCount(livingCount: number): number {
  if (livingCount <= 0) return 0;
  if (livingCount >= 4) return 3;
  if (livingCount === 3) return 2;
  return 1;
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
  /**
   * Flat chip (no ramp). After natural expiry without cleanse → soft one-turn
   * freeze (see applySoftFreeze). Claim downgrade while Ice is up.
   */
  Ice: { tick: 3, duration: 3 },
  /** Party splash total per stack at intensity 1 (split across living line) */
  Poison: { tick: 8, duration: 4 },
  /**
   * Flat chip only (no token slow). Duration field is unused for expiry —
   * party Slime never times out; Fire Mage A/B removes it.
   */
  Slime: { tick: 2, duration: 99 },
} as const;

/** Max Fire stacks on a party soldier (Clouds / imp hits stop piling past this). */
export const MAX_PARTY_FIRE_STACKS = 2;

/** Moss Mite (etc.) slime: re-hits do not pile stacks. */
export const MAX_PARTY_SLIME_STACKS = 1;

/** Frost Archer (id bone_archer) Ice on-hit: re-hits refresh duration, do not pile stacks. */
export const MAX_PARTY_ICE_STACKS = 1;

/**
 * Barrow Warden SpreadingFrost:
 * Always hits the whole line for LINE damage, then may freeze pos 1 or 2.
 */
export const SPREADING_FROST_LINE_DAMAGE = 11;
/** Chance that the frost wave also locks pos 1 or 2 (else nobody freezes). */
export const SPREADING_FROST_CHANCE = 0.65;
/** Shatter damage to each currently Frozen soldier. */
export const FROST_SHATTER_FROZEN_DAMAGE = 18;
/** Shatter chip to each living non-Frozen party member. */
export const FROST_SHATTER_SPLASH_DAMAGE = 6;
/** Per-DoT-phase chip on each Frozen soldier (before spread/shatter). */
export const FROST_LOCKED_TICK_DAMAGE = 3;

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
  Spearman: "🗡️",
  ShieldMaiden: "⚔️",
  FireMage: "🔥",
  Healer: "✨",
  Archer: "🏹",
  Necromancer: "🌑",
  Thundercaller: "⚡",
  Runesinger: "📜",
};
