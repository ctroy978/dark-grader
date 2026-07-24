/**
 * Boss telegraph / impact presentation — threat tiers + durations.
 *
 * Design:
 * - Light attacks stay snappy (classroom pacing).
 * - Heavy / ultimate leave room for *long* wind-up and impact audio
 *   (multi-second stings, not pin-hammer whooshes).
 * - Party groan layers under impact (same beat) — never a second full cue
 *   that steals time from the next magnet phase.
 *
 * Target audio lengths when re-recording (catalog duration_seconds):
 *   light impact  ~0.8–1.2s
 *   heavy wind-up ~1.5–2.2s, impact ~1.5–2.5s
 *   ultimate wind-up ~2.0–3.0s, impact ~2.5–3.5s (Cascade)
 */

export type BossThreatTier = "light" | "heavy" | "ultimate";

/**
 * Visual telegraph palette for wind-up FX (client CSS themes).
 * - ember: fire / slam / cascade (red-orange cinders)
 * - poison: toxin cloud (green bubbles)
 * - summon: calling adds (void / dark)
 * - shock: electric yellow (Rattle Captain)
 * - frost: ice / SpreadingFrost (cyan)
 */
export type BossWindupTheme = "ember" | "poison" | "summon" | "shock" | "frost";

/** Presentation weight of an attack (not damage math). */
export function bossThreatTier(attackId: string): BossThreatTier {
  switch (attackId) {
    case "Cascade":
      return "ultimate";
    case "CrushMagnet":
    case "PoisonCloud":
    case "FireCloud":
    case "SpreadingFrost":
    case "SummonBoneArchers":
    case "SummonCinderImps":
    case "SummonMossMites":
    case "SummonOhms":
      return "heavy";
    case "RattleSpark":
      return "light";
    default:
      // FrontSlam, LineAttack, Light*, Regenerate, …
      return "light";
  }
}

/** Map attack id → wind-up color theme (telegraph FX). */
export function bossWindupTheme(attackId: string): BossWindupTheme {
  switch (attackId) {
    case "PoisonCloud":
      return "poison";
    case "SummonBoneArchers":
    case "SummonCinderImps":
    case "SummonMossMites":
    case "SummonOhms":
      return "summon";
    case "RattleSpark":
      return "shock";
    case "SpreadingFrost":
      return "frost";
    // FireCloud, Cascade, FrontSlam, LineAttack, CrushMagnet, Regenerate, …
    default:
      return "ember";
  }
}

/** Rattle Captain stun-kit attacks (magnet lock / seat stuns). */
export function isRattleStunKitAttack(attackId: string): boolean {
  return attackId === "RattleSpark" || attackId === "Cascade";
}

/** Force electric theme for this boss (all telegraphs). */
export function bossForcesWindupTheme(
  bossId: string | undefined | null,
): BossWindupTheme | null {
  if (bossId === "rattle_captain") return "shock";
  return null;
}

/**
 * Wind-up beat (windup.png + telegraph SFX).
 * Holds longer than the clip so pose + bubble read from the back of the room.
 */
export function bossTelegraphDurationMs(tier: BossThreatTier): number {
  switch (tier) {
    case "ultimate":
      return 4200; // room for ~2.5–3s wind-up sting + hold
    case "heavy":
      return 3200;
    default:
      return 1600; // light still readable but not glacial
  }
}

/**
 * Impact beat (attack.png + attack SFX + optional layered party groan).
 * Ultimate/heavy sized for big hit audio, not 0.7s garbage-can taps.
 */
export function bossImpactDurationMs(tier: BossThreatTier): number {
  switch (tier) {
    case "ultimate":
      return 3600;
    case "heavy":
      return 2800;
    default:
      return 1400;
  }
}

/** Short creature-voice beat before wind-up (grunt / laugh). Optional. */
export const BOSS_VOICE_DURATION_MS = 800;

/**
 * Delay before layered party-hurt SFX under a boss/minion impact
 * (impact lands first, then groan in the same beat).
 */
export const PARTY_HURT_LAYER_DELAY_MS = 200;

/**
 * Default wind-up bubble by attack id (shown with windup pose).
 * Keep short for classroom shared screen.
 */
export function defaultTelegraphLines(attackId: string): string[] {
  switch (attackId) {
    case "Cascade":
      return ["Cascade…", "Front first…", "Charge rising…"];
    case "CrushMagnet":
      return ["The glow…", "Magnet…", "Focusing…"];
    case "PoisonCloud":
      return ["Breathe…", "Mist coils…", "Toxin…"];
    case "FireCloud":
      return ["Heat builds…", "Embers rise…", "Burn…"];
    case "RattleSpark":
      return ["Spark…", "Under the glow…", "Front arcs…"];
    case "FrontSlam":
    case "LightFrontSlam":
      return ["Rising…", "Cinders…", "Front…"];
    case "LineAttack":
    case "LightLineAttack":
      return ["Spreading…", "Wave…", "Line…"];
    case "Regenerate":
      return ["Embers…", "Mending…"];
    case "SummonBoneArchers":
    case "SummonCinderImps":
    case "SummonMossMites":
    case "SummonOhms":
      return ["Calling…", "The gap…", "Ohms…"];
    default:
      return ["…"];
  }
}
