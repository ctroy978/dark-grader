import type { Archetype, Grade } from "./types.js";

/** Student-facing short effect for each specialist × grade (magnet planning + callouts). */
export function describeGradeEffect(archetype: Archetype, grade: Grade): string {
  const table = PLAYBOOK[archetype];
  return table[grade] ?? "Acts with this grade.";
}

const PLAYBOOK: Record<Archetype, Record<Grade, string>> = {
  Vanguard: {
    A: "Big personal block (6) + strong hit (11) — self only",
    B: "Solid personal block (4) + hit (9) — self only",
    C: "Some personal block (3) + light hit (6) — self only",
    D: "+1 personal block + light hit (4)",
    F: "No block; weak hit (2)",
  },
  ShieldMaiden: {
    A: "Strike 14 + cover 8 (self + most endangered) this round",
    B: "Strike 11 + cover 6 (self + most endangered) this round",
    C: "Strike 9 + cover 4 (self + most endangered) this round",
    D: "Strike 7 + cover 3 (self + most endangered) this round",
    F: "Cover shorts out → 0 (nothing if already down)",
  },
  FireMage: {
    A: "Wildfire ≤3 foes (9) + boss Fire; front: burn Frozen + clear Ice/Slime",
    B: "Wildfire ≤3 foes (7) + boss Fire; back: burn Frozen + clear Ice/Slime",
    C: "Wildfire ≤2 foes (6 each) + Fire burn; friendly fire front (ignores shield)",
    D: "Ember 1 foe (4); worse friendly fire",
    F: "Explodes on the whole party (ignores shield)",
  },
  Healer: {
    A: "Heal all +10; clear Fire/Poison on all (not Ice/Slime/Frozen)",
    B: "Heal front +10; clear Fire/Poison on front",
    C: "Heal back +6; clear Fire/Poison on back",
    D: "Heal self only (no cleanse)",
    F: "Backlash — heals the boss (+8)",
  },
  Archer: {
    A: "Arrow Storm ≤3 foes (10; +2 vs minions) — can hit the gap from any seat",
    B: "Arrow Storm ≤3 foes (8; +1 vs minions) — gap from any seat",
    C: "Arrow Storm ≤2 foes (6; +1 vs minions) — gap from any seat",
    D: "Single shot (4; +1 vs minions) — gap from any seat",
    F: "Misfire — tiny hit + may hurt an ally",
  },
  Spearman: {
    A: "Thrust 12 + parry 70% boss dmg this round (front w/o parry is vulnerable)",
    B: "Thrust 10 + parry 50% boss dmg this round",
    C: "Thrust 7 + parry 30% boss dmg this round",
    D: "Thrust 5 + parry 15% boss dmg this round",
    F: "Weak poke (2); no parry — front takes extra boss heat",
  },
  Necromancer: {
    A: "Drain boss + heal lowest ally",
    B: "Drain + smaller heal",
    C: "Light drain + tiny heal",
    D: "Weak drain, self-damage",
    F: "Backlash — hits highest-HP ally for 10",
  },
  Thundercaller: {
    A: "If someone is dead: revive at low HP (dazed, once/fight). Else hit 14; 30% stun; front Charge+3",
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
    ShieldMaiden: { F: "Drops cover to 0" },
  };
  return risky[archetype]?.[grade] ?? null;
}
