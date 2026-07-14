import type { Archetype, Grade } from "./types.js";

/** Student-facing short effect for each specialist × grade (magnet planning + callouts). */
export function describeGradeEffect(archetype: Archetype, grade: Grade): string {
  const table = PLAYBOOK[archetype];
  return table[grade] ?? "Acts with this grade.";
}

const PLAYBOOK: Record<Archetype, Record<Grade, string>> = {
  Vanguard: {
    A: "Big block + strong hit",
    B: "Solid block + hit",
    C: "Some block + light hit",
    D: "Tiny block only",
    F: "No block, no attack",
  },
  ShieldMaiden: {
    A: "Heavy strike at the boss",
    B: "Strong strike",
    C: "Reroll party shield (1d6)",
    D: "Light strike",
    F: "Shield short-circuits — may hurt near magnet",
  },
  FireMage: {
    A: "Big fire hit + cleanse party DoTs (not Fire)",
    B: "Fire hit + cleanse front",
    C: "Hit boss + friendly fire on front (ignores shield)",
    D: "Weak hit + worse friendly fire",
    F: "Explodes on the whole party (ignores shield)",
  },
  Healer: {
    A: "Heal all + clear Marks",
    B: "Heal front + clear Marks",
    C: "Heal front a little",
    D: "Heal self only",
    F: "Backlash — heals the boss!",
  },
  Archer: {
    A: "Huge volley",
    B: "Strong volley",
    C: "Solid shot",
    D: "Weak shot",
    F: "Misfire — tiny hit + may hurt an ally",
  },
  Doomcaller: {
    A: "Strong curse: boss takes more damage",
    B: "Good curse on boss",
    C: "Mild curse on boss",
    D: "Weak curse on boss",
    F: "Bad curse — boss hits harder",
  },
  Necromancer: {
    A: "Drain boss + heal lowest ally",
    B: "Drain + smaller heal",
    C: "Light drain + tiny heal",
    D: "Weak drain, self-damage",
    F: "Backlash — boss heal or self-hurt",
  },
  Thundercaller: {
    A: "Chain lightning; chance to stun boss",
    B: "Chain lightning",
    C: "Single lightning hit",
    D: "Unstable — hits boss + may zap ally",
    F: "Overload — zaps whole party",
  },
  Runesinger: {
    A: "Party +3 damage this round",
    B: "Party +2 damage",
    C: "Party +1 damage",
    D: "Almost nothing",
    F: "Corrupted — boss next attack hits harder",
  },
};

/** One-line risk flag for F (and a few Ds) — shown in planning UI. */
export function gradeRiskNote(archetype: Archetype, grade: Grade): string | null {
  if (grade !== "F" && grade !== "D") return null;
  const risky: Partial<Record<Archetype, Partial<Record<Grade, string>>>> = {
    FireMage: { C: "Hurts allies", D: "Hurts allies", F: "Hurts all allies" },
    Healer: { F: "Heals boss" },
    Archer: { F: "May hit ally" },
    Doomcaller: { F: "Buffs boss" },
    Necromancer: { D: "Self damage", F: "Random backlash" },
    Thundercaller: { D: "May hit ally", F: "Hurts all allies" },
    Runesinger: { F: "Buffs boss" },
    ShieldMaiden: { F: "May hurt near magnet" },
  };
  return risky[archetype]?.[grade] ?? null;
}
