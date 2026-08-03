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
  Spearman: "Spearman",
  Necromancer: "Necromancer",
  Thundercaller: "Thundercaller",
  Runesinger: "Runesinger",
};

/** One-line role summary for lobby intel — what they do, not who else to bring. */
const ARCHETYPE_SUMMARIES: Record<Archetype, string> = {
  Vanguard:
    "Personal block and hits the boss. Block protects only himself (not the whole party).",
  ShieldMaiden:
    "Strikes hard and raises a one-round cover over herself and the ally most likely to die. Better grades = bigger cover. F dumps cover.",
  FireMage:
    "Hits several enemies with fire and can burn the boss. The only class that burns off Frozen (A = front, B = back); those grades also clear Ice and Slime on that half of the line. Weak grades can hurt allies.",
  Healer:
    "Heals allies and cleanses Fire and Poison DoTs (A all, B front, C back). Ice, Slime, and Frozen are Fire Mage only. F heals the boss instead.",
  Archer:
    "Hits multiple foes with arrows; extra damage against minions. One of only two ways to clear the gap (with whoever is in seat 1). F can misfire.",
  Spearman:
    "Front-line striker. Claims grant a boss Parry (better grades = stronger). In seat 1 without a parry, boss hits hurt more. Can clear the gap from the front; Archers clear from any seat.",
  Necromancer:
    "Drains the boss and heals allies. Weak grades can backfire.",
  Thundercaller:
    "Hits hard with a chance to stun the boss; A can revive a fallen ally once per fight at low HP (they are dazed). Strong grades grant Charge.",
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
