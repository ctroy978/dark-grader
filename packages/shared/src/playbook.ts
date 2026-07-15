import type { Archetype, Grade } from "./types.js";

/** Student-facing short effect for each specialist × grade (magnet planning + callouts). */
export function describeGradeEffect(archetype: Archetype, grade: Grade): string {
  const table = PLAYBOOK[archetype];
  return table[grade] ?? "Acts with this grade.";
}

const PLAYBOOK: Record<Archetype, Record<Grade, string>> = {
  Vanguard: {
    A: "Big personal block + strong hit; +3 block whole party",
    B: "Solid personal block + hit; +2 block whole party",
    C: "Some personal block + light hit; +1 block whole party",
    D: "+1 block + light hit (4)",
    F: "No block; weak hit (2)",
  },
  ShieldMaiden: {
    A: "Heavy strike (14) + reroll party shield 1d6",
    B: "Strong strike (11)",
    C: "Solid strike (9)",
    D: "Light strike (7)",
    F: "Shield shorts out → 0 (nothing if already down)",
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
    C: "Heal back +6 each + clear Marks",
    D: "Heal self only",
    F: "Backlash — heals the boss (+8)",
  },
  Archer: {
    A: "Huge volley (18); +3 vs minions",
    B: "Strong volley (13); +2 vs minions",
    C: "Solid shot (9); +2 vs minions",
    D: "Weak shot (4); +1 vs minions",
    F: "Misfire — tiny hit + may hurt an ally",
  },
  Doomcaller: {
    A: "Strip all party DoTs → boss (all stacks, 2 rounds)",
    B: "Strip all party DoTs → boss (one of each type, 3 rounds)",
    C: "Strip all DoTs/Marks from front (1–3)",
    D: "Strip all DoTs/Marks from back (4–6)",
    F: "Copy each DoT type on boss onto self (1 stack each)",
  },
  Necromancer: {
    A: "Drain boss + heal lowest ally",
    B: "Drain + smaller heal",
    C: "Light drain + tiny heal",
    D: "Weak drain, self-damage",
    F: "Backlash — hits highest-HP ally for 10",
  },
  Thundercaller: {
    A: "Hit 14; 30% stun boss; front +3 Charge next attack",
    B: "Hit 11; 30% stun boss; back +3 Charge next attack",
    C: "Hit 9; 30% stun boss",
    D: "Hit 6",
    F: "No hit; 30% stun a remaining (not-yet-acted) token-holder",
  },
  Runesinger: {
    A: "All tokens → A; holders heal +5 (acts first)",
    B: "Tokens below B → B; holders heal +4 (acts first)",
    C: "Lowest token below C → C; holders heal +3 (acts first)",
    D: "Token holders heal +3 (acts first)",
    F: "All tokens shift down one grade (acts first)",
  },
};

/** One-line risk flag for F (and a few Ds) — shown in planning UI. */
export function gradeRiskNote(archetype: Archetype, grade: Grade): string | null {
  if (grade !== "F" && grade !== "D") return null;
  const risky: Partial<Record<Archetype, Partial<Record<Grade, string>>>> = {
    FireMage: { C: "Hurts allies", D: "Hurts allies", F: "Hurts all allies" },
    Healer: { F: "Heals boss" },
    Archer: { F: "May hit ally" },
    Doomcaller: { F: "Takes boss DoT types onto self" },
    Necromancer: { D: "Self damage", F: "Hits highest-HP ally (10)" },
    Thundercaller: { F: "May stun a not-yet-acted claimer" },
    Runesinger: { F: "Downgrades all tokens" },
    ShieldMaiden: { F: "Drops party shield to 0" },
  };
  return risky[archetype]?.[grade] ?? null;
}
