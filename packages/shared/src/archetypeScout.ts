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
    "Front leader. A/B grant Last Stand (next lethal hit leaves allies at 1 HP once). Also personal block on weaker grades and steady hits.",
  ShieldMaiden:
    "Strikes hard, one-round cover on herself and the ally most likely to die, and cleanses Fire/Poison (A all, B front, C back). F dumps cover.",
  FireMage:
    "Hits several enemies with fire and can burn the boss. The only class that burns off Frozen (A = front, B = back); those grades also clear Ice and Slime on that half of the line. Weak grades can hurt allies.",
  Healer:
    "Instant triage heals only (no cleanse). A = whole party, B = two lowest, C = one lowest, D = tiny all-party. F heals the boss. Back seat only — not with a Runesinger. Necromancer Life Power can empower her next heal.",
  Archer:
    "Hits multiple foes with arrows; extra damage against minions. One of only two ways to clear the gap (with whoever is in seat 1). F can misfire.",
  Spearman:
    "Front-line striker with Parry. A/B also grant Last Stand (A all living, B front). Seat 1 without parry takes extra boss heat.",
  Necromancer:
    "Drains the boss and grants Life Power to the living Healer or Runesinger — their next heal gets a purple bonus rain. Does not heal allies directly.",
  Thundercaller:
    "Lightning damage with a chance to stun the boss; strong grades grant Charge. A hits for 14 (or, if someone is down, shocks their heart back — ~10% HP). Revived allies skip their next claim (dazed). Each soldier only once per fight.",
  Runesinger:
    "Acts first — rewrites this drop’s claims (A +2, B floors trash to C and lifts C to B, C fixes worst to C, F demotes). Slow gold hymn HoT (no cleanse). Back seat only — not with a Healer. Necromancer Life Power can empower her next hymn.",
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
