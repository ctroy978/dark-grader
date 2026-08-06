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
    "Defensive anchor. A/B grant Last Stand (next lethal hit leaves allies at 1 HP once), while every successful grade adds strong personal block and a steady hit.",
  ShieldMaiden:
    "Raises one-round cover on herself and the ally most likely to die. If her scope has Fire/Poison, she cleanses instead of attacking (A all, B front, C back, D self); otherwise she strikes hard. F dumps cover.",
  FireMage:
    "Hits several enemies with fire and can burn the boss. Seats 1–3 can rake gap minions; back seats hit the boss. A/B cleanse Chill, Ice, and Slime on half the line. D/F can hurt allies.",
  Healer:
    "Instant triage heals (A all, B two lowest, C one, D tiny all). F heals the boss. Back seat only. Uncharged: no cleanse (Maiden primary). With Necromancer Life Power: normal heal still applies; Fire/Poison seats also wash (no purple); clean seats get purple bonus.",
  Archer:
    "Long Shot reaches gap minions from any seat, with multi-target volleys and extra minion damage. F can misfire.",
  Spearman:
    "Front-line striker with Penetrate: minion overkill carries into the boss. A–D grant modest Parry; seat 1 without Parry takes extra boss heat.",
  Necromancer:
    "Drains the boss and grants Life Power to the Healer or Runesinger. Their next heal/hymn still mends normally; Fire/Poison seats also wash (no purple bonus); clean seats get purple bonus. Maiden is still the primary one-token cleanse. Does not heal allies directly.",
  Thundercaller:
    "Lightning damage with a chance to stun the boss; strong grades grant Charge. A hits for 14 (or, if someone is down, shocks their heart back — ~10% HP + Last Stand so one hit cannot re-kill them that turn). Revived allies skip their next claim (dazed). Each soldier only once per fight.",
  Runesinger:
    "Acts first — rewrites this drop’s claims (A +2, B floors trash to C and lifts C to B, C fixes worst to C, F demotes). Slow gold hymn HoT. Back seat only — not with a Healer. With Necromancer Life Power, hymn still applies; dirty seats also wash Fire/Poison (no purple); clean seats get purple bonus.",
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
