import type { Archetype, Grade } from "./types.js";
import { ARCHETYPE_MAX_HP } from "./balance.js";
import { describeGradeEffect, gradeRiskNote } from "./playbook.js";

const GRADES: Grade[] = ["A", "B", "C", "D", "F"];

/** Student-facing display names (spaces where the id is camelCase). */
export const ARCHETYPE_DISPLAY_NAMES: Record<Archetype, string> = {
  Vanguard: "Vanguard",
  ShieldMaiden: "Shield Maiden",
  FireMage: "Fire Mage",
  Healer: "Healer",
  Archer: "Archer",
  Doomcaller: "Doomcaller",
  Necromancer: "Necromancer",
  Thundercaller: "Thundercaller",
  Runesinger: "Runesinger",
};

/** One-line role summary for lobby intel — what they do, not who else to bring. */
const ARCHETYPE_SUMMARIES: Record<Archetype, string> = {
  Vanguard:
    "Blocks damage and hits the boss. Stronger grades also share block with the party.",
  ShieldMaiden:
    "Strikes hard and controls the party shield. A refreshes the shield; F drops it to zero.",
  FireMage:
    "Hits several enemies with fire and can burn the boss. Weak grades can hurt allies.",
  Healer:
    "Heals allies and clears Marks. F heals the boss instead.",
  Archer:
    "Hits multiple foes with arrows; extra damage against minions. F can misfire.",
  Doomcaller:
    "Moves DoTs and Marks between the party and the boss.",
  Necromancer:
    "Drains the boss and heals allies. Weak grades can backfire.",
  Thundercaller:
    "Hits hard with a chance to stun the boss; strong grades grant Charge for the next attack.",
  Runesinger:
    "Acts first — rewrites claimed tokens and heals holders. F downgrades every token.",
};

export interface ArchetypeGradeScout {
  grade: Grade;
  effect: string;
  risk: string | null;
}

export interface ArchetypeScout {
  archetype: Archetype;
  displayName: string;
  maxHp: number;
  summary: string;
  grades: ArchetypeGradeScout[];
}

/** Full student-facing scout card for a specialist class. */
export function getArchetypeScout(archetype: Archetype): ArchetypeScout {
  return {
    archetype,
    displayName: ARCHETYPE_DISPLAY_NAMES[archetype],
    maxHp: ARCHETYPE_MAX_HP[archetype],
    summary: ARCHETYPE_SUMMARIES[archetype],
    grades: GRADES.map((grade) => ({
      grade,
      effect: describeGradeEffect(archetype, grade),
      risk: gradeRiskNote(archetype, grade),
    })),
  };
}
