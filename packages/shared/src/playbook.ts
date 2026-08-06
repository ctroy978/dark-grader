import type { Archetype, Grade } from "./types.js";

/** Student-facing short effect for each specialist × grade (magnet planning + callouts). */
export function describeGradeEffect(archetype: Archetype, grade: Grade): string {
  const table = PLAYBOOK[archetype];
  return table[grade] ?? "Acts with this grade.";
}

const PLAYBOOK: Record<Archetype, Record<Grade, string>> = {
  Vanguard: {
    A: "Last Stand on all living (next lethal → 1 HP once) + hit 11 + 8 self block",
    B: "Last Stand on front (1–3) + hit 9 + 6 self block",
    C: "Personal block (5) + light hit (6) — self only",
    D: "+3 personal block + light hit (4)",
    F: "No block; weak hit (2)",
  },
  ShieldMaiden: {
    A: "Cover 8; cleanse Fire/Poison on all instead of striking, otherwise strike 14",
    B: "Cover 6; cleanse Fire/Poison on front (1–3) instead of striking, otherwise strike 11",
    C: "Cover 4; cleanse Fire/Poison on back (4–6) instead of striking, otherwise strike 9",
    D: "Cover 3; cleanse Fire/Poison on self instead of striking, otherwise strike 7",
    F: "Cover shorts out → 0 (nothing if already down)",
  },
  FireMage: {
    A: "Wildfire ≤3 (9) + boss Fire; front: cleanse Chill/Ice/Slime — seats 1–3 hit minions, back hits boss",
    B: "Wildfire ≤3 (7) + boss Fire; back: cleanse Chill/Ice/Slime — seats 1–3 hit minions, back hits boss",
    C: "Wildfire ≤2 foes (6 each) + boss Fire burn — no friendly fire",
    D: "Ember 1 foe (4); friendly fire pos 1–2 (ignores shield)",
    F: "Explodes on the whole party (ignores shield)",
  },
  Healer: {
    A: "Heal all living +14 each",
    B: "Heal the two lowest-HP allies +14 each",
    C: "Heal the single lowest-HP ally +18",
    D: "Tiny full-party heal +3 each",
    F: "Backlash — heals the boss (+8)",
  },
  Archer: {
    A: "Long Shot: Arrow Storm ≤3 foes (10; +2 vs minions) — hits the gap from any seat",
    B: "Long Shot: Arrow Storm ≤3 foes (8; +1 vs minions) — gap from any seat",
    C: "Long Shot: Arrow Storm ≤2 foes (6; +1 vs minions) — gap from any seat",
    D: "Long Shot: single shot (4; +1 vs minions) — gap from any seat",
    F: "Misfire — tiny hit + may hurt an ally",
  },
  Spearman: {
    A: "Penetrate thrust 12 + parry 40% (minion overkill carries into boss)",
    B: "Penetrate thrust 10 + parry 30%",
    C: "Penetrate thrust 7 + parry 20% boss dmg this round",
    D: "Penetrate thrust 5 + parry 10% boss dmg this round",
    F: "Weak poke (2); no parry — front takes extra boss heat",
  },
  Necromancer: {
    A: "Drain 12; Life Power +6 on Healer/Lifebinder — next heal/renewal still mends; dirty seats wash (no purple); clean get purple",
    B: "Drain 9; Life Power +4 on Healer/Lifebinder (mend + wash or purple)",
    C: "Drain 6; Life Power +2 on Healer/Lifebinder (mend + wash or purple)",
    D: "Weak drain, self-damage (no Life Power)",
    F: "Backlash — hits highest-HP ally for 10",
  },
  Thundercaller: {
    A: "Hit 14 + 30% boss stun + front Charge+3 — or if someone is down: shock-restart their heart (~10% HP + Last Stand). They skip their next claim (dazed). Once per soldier per fight; no damage that claim if you rez",
    B: "Hit 11; 30% stun boss; back +3 Charge next attack",
    C: "Hit 9; 30% stun boss",
    D: "Hit 6",
    F: "No hit; 30% stun a remaining (not-yet-acted) token-holder",
  },
  Runesinger: {
    A: "All claims +2 grades, then rune attack 12 — acts first; any seat",
    B: "F/D→C, C→B (B stays B), then rune attack 9 — acts first",
    C: "Worst claim → C (front wins ties), then rune attack 6 — acts first",
    D: "No rewrite; rune attack 4 — acts first",
    F: "All claims shift down one grade; no attack — acts first",
  },
  Lifebinder: {
    A: "Renew all living for 4 HP × 3 ticks — last seat only",
    B: "Renew front positions 1–3 for 4 HP × 3 ticks",
    C: "Renew back positions 4–6 for 3 HP × 3 ticks",
    D: "Renew self for 3 HP × 3 ticks",
    F: "No renewal; thorn backlash deals 3 self-damage",
  },
};

/** One-line risk flag for F (and a few Ds) — shown in planning UI. */
export function gradeRiskNote(archetype: Archetype, grade: Grade): string | null {
  if (grade !== "F" && grade !== "D") return null;
  const risky: Partial<Record<Archetype, Partial<Record<Grade, string>>>> = {
    FireMage: { D: "Hurts allies", F: "Hurts all allies" },
    Healer: { F: "Heals boss" },
    Archer: { F: "May hit ally" },
    Necromancer: { D: "Self damage", F: "Hits highest-HP ally (10)" },
    Thundercaller: { F: "May stun a not-yet-acted claimer" },
    Runesinger: { F: "Downgrades all tokens; no attack" },
    Lifebinder: { F: "Takes 3 self-damage; no renewal" },
    ShieldMaiden: { F: "Drops cover to 0" },
  };
  return risky[archetype]?.[grade] ?? null;
}
