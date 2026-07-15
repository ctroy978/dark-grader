import type { Archetype } from "@dungeon-grades/shared";

/**
 * Display names per archetype (aligned with art gender).
 *
 * Male-presenting art: Vanguard, FireMage, Doomcaller, Necromancer, Thundercaller
 * Female-presenting art: ShieldMaiden, Healer, Archer, Runesinger
 *
 * Pool length must cover ROSTER_COUNTS for each archetype.
 */
export const NAME_POOLS: Record<Archetype, string[]> = {
  // Male
  Vanguard: ["Brannok", "Cedric Shield"],
  FireMage: ["Emberwick", "Cindrel", "Ashford"],
  Doomcaller: ["Morgrave", "Dreadwyn"],
  Necromancer: ["Ashbone", "Vesperil"],
  Thundercaller: ["Volta", "Stormfen"],

  // Female
  ShieldMaiden: ["Sigrid", "Thyra", "Astrid"],
  Healer: ["Lumen", "Mercy Vale", "Solace"],
  Archer: ["Quill", "Hawke", "Sparrow"],
  Runesinger: ["Glyph", "Lyra Rune"],
};
