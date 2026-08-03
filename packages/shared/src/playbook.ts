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
    A: "Wildfire ≤3 foes (9) + boss Fire; front: burn Frozen + clear Ice/Slime",
    B: "Wildfire ≤3 foes (7) + boss Fire; back: burn Frozen + clear Ice/Slime",
    C: "Wildfire ≤2 foes (6 each) + Fire burn; friendly fire front (ignores shield)",
    D: "Ember 1 foe (4); worse friendly fire",
    F: "Explodes on the whole party (ignores shield)",
  },
  Healer: {
    A: "Heal all +10; clear Fire/Ice/Poison on all",
    B: "Heal front +10; clear Fire/Ice/Poison on front",
    C: "Heal back +6; clear Fire/Ice/Poison on back",
    D: "Heal self only (no cleanse)",
    F: "Backlash — heals the boss (+8)",
  },
  Archer: {
    A: "Arrow Storm ≤3 foes (10; +2 vs minions)",
    B: "Arrow Storm ≤3 foes (8; +1 vs minions)",
    C: "Arrow Storm ≤2 foes (6; +1 vs minions)",
    D: "Single shot (4; +1 vs minions)",
    F: "Misfire — tiny hit + may hurt an ally",
  },
  Spearman: {
    A: "Strong spear thrust (12) — stub kit; parry comes in a later phase",
    B: "Solid thrust (10)",
    C: "Thrust (7)",
    D: "Light poke (5)",
    F: "Weak poke (2)",
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
    Necromancer: { D: "Self damage", F: "Hits highest-HP ally (10)" },
    Thundercaller: { F: "May stun a not-yet-acted claimer" },
    Runesinger: { F: "Downgrades all tokens" },
    ShieldMaiden: { F: "Drops party shield to 0" },
  };
  return risky[archetype]?.[grade] ?? null;
}
