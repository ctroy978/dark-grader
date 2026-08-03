import type { Archetype, Grade } from "./types.js";

/**
 * Art-presenting gender (names + portrait art).
 * Male: Vanguard, Spearman, FireMage, Necromancer, Thundercaller
 * Female: ShieldMaiden, Healer, Archer, Runesinger
 */
export type ArtGender = "male" | "female";

export function archetypeArtGender(archetype: Archetype | string): ArtGender {
  switch (archetype) {
    case "ShieldMaiden":
    case "Healer":
    case "Archer":
    case "Runesinger":
      return "female";
    default:
      return "male";
  }
}

/**
 * Preferred party **attack / cast** SFX catalog id (non-F).
 * Drop matching `server/data/audio/{id}.mp3` files; server falls back if missing.
 */
export const ARCHETYPE_ATTACK_SFX: Record<Archetype, string> = {
  Vanguard: "act_vanguard",
  ShieldMaiden: "act_shieldmaiden",
  FireMage: "act_firemage",
  Healer: "act_healer",
  Archer: "act_archer",
  Spearman: "act_spearman",
  Necromancer: "act_necromancer",
  Thundercaller: "act_thundercaller",
  Runesinger: "act_runesinger",
};

/** Candidates in preference order (first existing file wins on server). */
export function attackSfxCandidates(
  archetype: Archetype | string,
  _grade: Grade | string,
): string[] {
  // F tokens keep full kit identity (same cast as A–D). Target-side FX sells
  // the backfire; comic fizzle made party hits look like the caster "failed."
  const preferred =
    ARCHETYPE_ATTACK_SFX[archetype as Archetype] ?? "hit_light";
  // Healer / Runesinger: prefer act_*; legacy `heal.mp3` still accepted.
  if (preferred === "act_healer" || preferred === "act_runesinger") {
    return [preferred, "heal", "hit_light"];
  }
  return [preferred, "hit_light"];
}

/**
 * Party reaction when hit by boss/minion (hurt bubble beat).
 * Prefer gendered grunts; fall back to generic light hit.
 */
export function partyHurtSfxCandidates(archetype: Archetype | string): string[] {
  return archetypeArtGender(archetype) === "female"
    ? ["hurt_female", "hit_light"]
    : ["hurt_male", "hit_light"];
}
