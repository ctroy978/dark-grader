import type { Archetype } from "@dungeon-grades/shared";

/**
 * Display names per archetype (aligned with art gender).
 *
 * Male-presenting art: Vanguard, Spearman, FireMage, Necromancer, Thundercaller
 * Female-presenting art: ShieldMaiden, Healer, Archer, Runesinger, Lifebinder
 *
 * Pool length must cover ROSTER_COUNTS for each archetype.
 */
export const NAME_POOLS: Record<Archetype, string[]> = {
  // Male
  Vanguard: ["Brannok", "Cedric Shield"],
  Spearman: ["Pike", "Halberd"],
  FireMage: ["Emberwick", "Cindrel", "Ashford"],
  Necromancer: ["Ashbone", "Vesperil"],
  Thundercaller: ["Volta", "Stormfen", "Skyrend"],

  // Female
  ShieldMaiden: ["Sigrid", "Thyra"],
  Healer: ["Lumen", "Mercy Vale"],
  Archer: ["Quill", "Hawke", "Sparrow"],
  Runesinger: ["Glyph", "Lyra Rune"],
  Lifebinder: ["Rowan", "Briar"],
};
