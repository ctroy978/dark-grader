import type { Archetype, Grade } from "./types.js";

/** Student-facing short effect for each specialist × grade (magnet planning + callouts). */
export function describeGradeEffect(archetype: Archetype, grade: Grade): string {
  const table = PLAYBOOK[archetype];
  return table[grade] ?? "Acts with this grade.";
}

const PLAYBOOK: Record<Archetype, Record<Grade, string>> = {
  Vanguard: {
    A: "Last Stand on all living (next lethal → 1 HP once) + hit 11 + small self block",
    B: "Last Stand on front (1–3) + hit 9 + small self block",
    C: "Personal block (3) + light hit (6) — self only",
    D: "+1 personal block + light hit (4)",
    F: "No block; weak hit (2)",
  },
  ShieldMaiden: {
    A: "Strike 14 + cover 8; cleanse Fire/Poison on all",
    B: "Strike 11 + cover 6; cleanse Fire/Poison on front (1–3)",
    C: "Strike 9 + cover 4; cleanse Fire/Poison on back (4–6)",
    D: "Strike 7 + cover 3 (no cleanse)",
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
    A: "Heal all living +14 each (no cleanse — Maiden strips Fire/Poison)",
    B: "Heal the two lowest-HP allies +14 each",
    C: "Heal the single lowest-HP ally +18",
    D: "Tiny full-party heal +3 each",
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
    A: "Last Stand on all living + thrust 12 + parry 70% (front w/o parry is vulnerable)",
    B: "Last Stand on front (1–3) + thrust 10 + parry 50%",
    C: "Thrust 7 + parry 30% boss dmg this round",
    D: "Thrust 5 + parry 15% boss dmg this round",
    F: "Weak poke (2); no parry — front takes extra boss heat",
  },
  Necromancer: {
    A: "Drain 12; Life Power +6 on Healer or Runesinger (purple rain after their next heal)",
    B: "Drain 9; Life Power +4 on Healer or Runesinger",
    C: "Drain 6; Life Power +2 on Healer or Runesinger",
    D: "Weak drain, self-damage (no Life Power)",
    F: "Backlash — hits highest-HP ally for 10",
  },
  Thundercaller: {
    A: "Hit 14 + 30% boss stun + front Charge+3 — or if someone is down: shock-restart their heart (~10% HP). They skip their next claim (dazed). Once per soldier per fight; no damage that claim if you rez",
    B: "Hit 11; 30% stun boss; back +3 Charge next attack",
    C: "Hit 9; 30% stun boss",
    D: "Hit 6",
    F: "No hit; 30% stun a remaining (not-yet-acted) token-holder",
  },
  Runesinger: {
    A: "All claims +2 grades; HoT all (~12 over 3 ticks) — acts first; back seat only",
    B: "F/D→C, C→B (B stays B); HoT front (~12 / 3 ticks) — acts first",
    C: "Worst claim → C (front wins ties); HoT back (~9 / 3 ticks) — acts first",
    D: "No rewrite; self HoT only (~9 / 3 ticks) — acts first",
    F: "All claims shift down one grade; no HoT — acts first",
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
    Runesinger: { F: "Downgrades all tokens; no HoT" },
    ShieldMaiden: { F: "Drops cover to 0" },
  };
  return risky[archetype]?.[grade] ?? null;
}
