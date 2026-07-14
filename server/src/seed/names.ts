import type { Archetype } from "@dungeon-grades/shared";

/** Fantasy placeholder names per archetype. */
export const NAME_POOLS: Record<Archetype, string[]> = {
  Vanguard: ["Brannok", "Helga Ironline"],
  ShieldMaiden: ["Sigrid", "Thyra", "Astrid"],
  FireMage: ["Pyra", "Emberwick", "Cindrel"],
  Healer: ["Lumen", "Mercy Vale", "Solace"],
  Archer: ["Quill", "Hawke", "Nest", "Fletch", "Rook", "Sparrow"],
  Doomcaller: ["Morgrave"],
  Necromancer: ["Ashbone"],
  Thundercaller: ["Volta", "Stormfen"],
  Runesinger: ["Glyph"],
};
