import type { Archetype, Grade } from "./types.js";
import { ARCHETYPE_MAX_HP } from "./balance.js";
import { describeGradeEffect, gradeRiskNote } from "./playbook.js";

const GRADES: Grade[] = ["A", "B", "C", "D", "F"];

/** Student-facing display names (spaces where the id is camelCase). */
export const ARCHETYPE_DISPLAY_NAMES: Record<Archetype, string> = {
  Vanguard: "Vanguard",
  ShieldMaiden: "Shield Maiden",
  FireMage: "Fire Mage",
  Healer: "Thornmender",
  Archer: "Archer",
  Spearman: "Spearman",
  Necromancer: "Necromancer",
  Thundercaller: "Thundercaller",
  Runesinger: "Runesinger",
  Lifebinder: "Grovekeeper",
};

/** One-line role summary for lobby intel — what they do, not who else to bring. */
const ARCHETYPE_SUMMARIES: Record<Archetype, string> = {
  Vanguard:
    "Defensive anchor. A/B grant Last Stand (next lethal hit leaves allies at 1 HP once), while every successful grade adds strong personal block and a steady hit.",
  ShieldMaiden:
    "Raises one-round cover on herself and the ally most likely to die. If her scope has Fire/Poison, she cleanses instead of attacking (A all, B front, C back, D self); otherwise she strikes hard. F dumps cover.",
  FireMage:
    "Hits several enemies with fire and can burn the boss. Seats 1–3 can rake gap minions; back seats hit the boss. A/B cleanse Chill, Ice, and Slime on half the line. D/F can hurt allies.",
  Healer:
    "Thornmender is the rescue-healing Lifebinder: instant triage heals (A all, B two lowest, C one, D tiny all). F heals the boss. Back seat only. With Necromancer Life Power, normal healing still applies; Fire/Poison seats wash and clean seats gain purple bonus.",
  Archer:
    "Long Shot reaches gap minions from any seat, with multi-target volleys and extra minion damage. F can misfire.",
  Spearman:
    "Front-line striker with Penetrate: minion overkill carries into the boss. A–D grant modest Parry; seat 1 without Parry takes extra boss heat.",
  Necromancer:
    "Drains the boss and grants Life Power to the deployed Thornmender or Grovekeeper. Their next heal or renewal still mends normally; Fire/Poison seats also wash (no purple bonus); clean seats get purple bonus. Maiden remains the primary one-token cleanse.",
  Thundercaller:
    "Lightning damage with a chance to stun the boss; strong grades grant Charge. A hits for 14 (or, if someone is down, shocks their heart back — ~10% HP + Last Stand so one hit cannot re-kill them that turn). Revived allies skip their next claim (dazed). Each soldier only once per fight.",
  Runesinger:
    "Any-seat support that acts first: rewrites this drop’s claims, then launches a positional rune attack. Front seats hit gap minions first; back seats strike the boss. She no longer heals or receives Life Power.",
  Lifebinder:
    "Grovekeeper is the healing-over-time Lifebinder: three-tick renewal streams reach all, front, back, or self by grade. Back seat only, exclusive with Thornmender. Necromancer Life Power adds Fire/Poison wash or purple bonus healing.",
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
