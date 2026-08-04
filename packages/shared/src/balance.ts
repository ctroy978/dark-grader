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
 * Pattern: frontline/support/healer ×2, damage ×3.
 * Display order (lobby): frontline → support → damage → healers.
 * Males: Vanguard, Spearman, FireMage, Necromancer, Thundercaller
 * Females: ShieldMaiden, Healer, Archer, Runesinger
 */
export const ROSTER_COUNTS: { archetype: Archetype; count: number }[] = [
  // Frontline
  { archetype: "Vanguard", count: 2 },
  { archetype: "Spearman", count: 2 },
  // Support
  { archetype: "ShieldMaiden", count: 2 },
  { archetype: "Necromancer", count: 2 },
  // Damage
  { archetype: "FireMage", count: 3 },
  { archetype: "Archer", count: 3 },
  { archetype: "Thundercaller", count: 3 },
  // Healers
  { archetype: "Healer", count: 2 },
  { archetype: "Runesinger", count: 2 },
];

/** Lobby / UI sort key by role group (matches ROSTER_COUNTS order). */
export const ARCHETYPE_LOBBY_ORDER: Record<Archetype, number> =
  Object.fromEntries(
    ROSTER_COUNTS.map(({ archetype }, i) => [archetype, i]),
  ) as Record<Archetype, number>;

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
 * per carrier; magnet takes the largest share. Distinct from Fire (per-seat).
 *
 * Boss-sourced Fire/Poison (see `escalationStep` on DotInstance) tick as:
 *   base × stacks × intensity
 * Intensity starts at 1 and +1 after each tick while the DoT remains (capped
 * for Poison — see MAX_POISON_INTENSITY). Player/ally DoTs stay flat.
 *
 * Fire: tick 4, stack cap 2, per seat — Cloud spam without deleting the line.
 * Poison: tick 8 party splash, stack cap 2, intensity cap 3 — worse if ignored
 * than Fire chip, but not uncapped wipe spirals (max splash 8×2×3 = 48).
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

/**
 * Max Poison stacks per soldier (re-cloud stacks up to this, then refreshes only).
 * With MAX_POISON_INTENSITY, line splash tops out at tick × 2 × 3.
 */
export const MAX_PARTY_POISON_STACKS = 2;

/**
 * Boss Poison intensity ceiling after each tick (+1 until this).
 * Fire is uncapped by duration (shorter + per-seat + stack cap).
 */
export const MAX_POISON_INTENSITY = 3;

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

/**
 * Camp / between-rooms recovery: each living soldier restores this fraction of
 * **missing** HP (max − current). No Vanguard gate. Dead stay dead.
 * e.g. 0.3 → a 7/48 seat regains floor(0.3 × 41) = 12 → 19 HP.
 */
export const INTER_ROOM_CAMP_HEAL_MISSING_PCT = 0.3;

/**
 * Spearman kit (Phase 2).
 * Parry reduces boss damage to self this round; front without parry takes extra boss heat.
 * Minion preference uses the shared gap rule (pos 1 or Archer).
 */
export const SPEARMAN_DAMAGE: Record<Grade, number> = {
  A: 12,
  B: 10,
  C: 7,
  D: 5,
  F: 2,
};

/** Boss damage reduction fraction while Parry is up (A–D only; F/no claim = none). */
export const SPEARMAN_PARRY_REDUCTION: Record<Exclude<Grade, "F">, number> = {
  A: 0.7,
  B: 0.5,
  C: 0.3,
  D: 0.15,
};

/** Boss damage multiplier for Spearman in pos 1 with no active Parry. */
export const SPEARMAN_FRONT_VULN_MULT = 1.35;

/** Shield Maiden hit damage by grade (F dumps cover only). */
export const MAIDEN_DAMAGE: Record<Exclude<Grade, "F">, number> = {
  A: 14,
  B: 11,
  C: 9,
  D: 7,
};

/** One-round cover pool size (Maiden + endangered ally only). */
export const MAIDEN_SHIELD: Record<Exclude<Grade, "F">, number> = {
  A: 8,
  B: 6,
  C: 4,
  D: 3,
};

/**
 * Healer instant heals (no cleanse — Fire/Poison are Shield Maiden).
 * A = all living; B = two lowest; C = one lowest; D = tiny all-party; F = boss.
 */
export const HEALER_HEAL: Record<Exclude<Grade, "F">, number> = {
  A: 14,
  B: 14,
  C: 18,
  D: 3,
};

/** Healer F backlash: heal boss this amount. */
export const HEALER_BOSS_HEAL = 8;

/**
 * Necromancer Life Power flat bonus per healed ally (A–C).
 * Applied as a second purple heal rain after the support’s base heal/hymn.
 */
export const NECRO_LIFE_POWER: Record<Exclude<Grade, "D" | "F">, number> = {
  A: 6,
  B: 4,
  C: 2,
};

/** Necromancer single-target drain damage (ally heal removed — Life Power only). */
export const NECRO_DRAIN: Record<Exclude<Grade, "F">, number> = {
  A: 12,
  B: 9,
  C: 6,
  D: 4,
};

/** Vanguard personal block by grade (C–D identity; A–B still get a little self pad). */
export const VANGUARD_PERSONAL_BLOCK: Record<Grade, number> = {
  A: 4,
  B: 3,
  C: 3,
  D: 1,
  F: 0,
};

/** Vanguard hit damage by grade. */
export const VANGUARD_DAMAGE: Record<Grade, number> = {
  A: 11,
  B: 9,
  C: 6,
  D: 4,
  F: 2,
};

/** Thundercaller A rez: HP floor (at least 1). */
export function thundercallerRezHp(maxHp: number): number {
  return Math.max(1, Math.floor(maxHp * 0.1));
}

/** Runesinger HoT duration (DoT-phase ticks). */
export const RUNESINGER_HOT_TICKS = 3;

/** Max independent hymn streams per soldier. */
export const MAX_HOT_STREAMS_PER_SOLDIER = 2;

/**
 * Heal per DoT-phase tick by grade (× RUNESINGER_HOT_TICKS ≈ Healer band + a bit).
 * A/B: 4×3 = 12; C/D: 3×3 = 9. F: none.
 */
export const RUNESINGER_HOT_PER_TICK: Record<Exclude<Grade, "F">, number> = {
  A: 4,
  B: 4,
  C: 3,
  D: 3,
};

/**
 * 2nd+ minion shot in the same boss-phase volley multiplies damage
 * (all shots still hard-focus the magnet seat).
 */
export const MULTI_MINION_FOCUS_MULT = 1.5;

/**
 * Portrait cleanse color dots (bottom-left). Empty = no cleanse role.
 * Matches DoT chip colors for classroom teaching.
 */
export const ARCHETYPE_CLEANSE_DOTS: Partial<
  Record<Archetype, { type: "Fire" | "Poison" | "Ice" | "Slime"; color: string }[]>
> = {
  /** Fire/Poison cleanse moved from Healer (A all / B front / C back). */
  ShieldMaiden: [
    { type: "Fire", color: "#fb923c" },
    { type: "Poison", color: "#a3e635" },
  ],
  FireMage: [
    { type: "Ice", color: "#7dd3fc" },
    { type: "Slime", color: "#6ee7b7" },
  ],
};

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
