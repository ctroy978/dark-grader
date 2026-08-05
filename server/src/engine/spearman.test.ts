import { describe, expect, it } from "vitest";
import {
  SPEARMAN_FRONT_VULN_MULT,
  SPEARMAN_PARRY_REDUCTION,
  type Grade,
  type TeamState,
} from "@dungeon-grades/shared";
import { createTeam, resolveBoss, selectParty, startFight } from "./combat.js";
import {
  applySpearmanBossDefense,
  hitEnemies,
  soldierAt,
} from "./damage.js";
import { resolveSpecialistAction } from "./specialists.js";

const POOL: Grade[] = "AAAABBBBBBCCCCCCDDFF".split("") as Grade[];

function spearTeam(seed = 11): TeamState {
  const team = createTeam("spear-t", "SPR", "Spear", seed);
  const spear = team.roster.find((s) => s.archetype === "Spearman")!;
  const rest = team.roster
    .filter((s) => s.alive && s.id !== spear.id)
    .slice(0, 5)
    .map((s) => s.id);
  selectParty(team, [spear.id, ...rest]);
  // Force spearman front
  for (const s of team.roster) {
    if (s.id === spear.id) s.position = 1;
  }
  // Re-normalize positions 1–6 uniquely
  let p = 2;
  for (const id of rest) {
    const s = team.roster.find((r) => r.id === id)!;
    s.position = p as 1 | 2 | 3 | 4 | 5 | 6;
    p += 1;
  }
  team.activePartyIds = [spear.id, ...rest];
  startFight(team, "ash_wraith", POOL);
  team.partyShield = { active: false, remaining: 0 };
  for (const s of team.roster) {
    if (s.position) {
      s.block = 0;
      s.statuses = [];
      s.currentHp = s.maxHp;
    }
  }
  return team;
}

describe("Spearman parry + front vulnerability", () => {
  it("uses the reduced A–D Parry ladder", () => {
    expect(SPEARMAN_PARRY_REDUCTION).toEqual({
      A: 0.4,
      B: 0.3,
      C: 0.2,
      D: 0.1,
    });
  });

  it("applySpearmanBossDefense reduces with Parry and amplifies front without", () => {
    const team = spearTeam();
    const sp = soldierAt(team, 1)!;
    expect(sp.archetype).toBe("Spearman");

    expect(applySpearmanBossDefense(sp, 100)).toBe(
      Math.floor(100 * SPEARMAN_FRONT_VULN_MULT),
    );

    sp.statuses.push({
      kind: "Parry",
      reduction: SPEARMAN_PARRY_REDUCTION.A,
    });
    expect(applySpearmanBossDefense(sp, 100)).toBe(
      Math.floor(100 * (1 - SPEARMAN_PARRY_REDUCTION.A)),
    );
  });

  it("A claim grants reduced Parry without Vanguard Last Stand", () => {
    const team = spearTeam();
    const sp = soldierAt(team, 1)!;
    team.minions = [
      {
        id: "m1",
        name: "Test Imp",
        maxHp: 20,
        currentHp: 20,
        damage: 3,
      },
    ];
    const bossBefore = team.boss!.currentHp;
    resolveSpecialistAction(
      team,
      sp,
      { token: "A", soldierId: sp.id, effectiveGrade: "A" },
      () => 0.5,
      () => {},
    );
    expect(sp.statuses.some((st) => st.kind === "Parry")).toBe(true);
    const parry = sp.statuses.find((st) => st.kind === "Parry");
    expect(parry).toMatchObject({
      kind: "Parry",
      reduction: SPEARMAN_PARRY_REDUCTION.A,
    });
    expect(team.minions[0]!.currentHp).toBe(20 - 12);
    expect(team.boss!.currentHp).toBe(bossBefore);
    expect(
      team.roster.some((soldier) =>
        soldier.statuses.some((status) => status.kind === "LastStand"),
      ),
    ).toBe(false);
  });

  it("Penetrate carries only minion overkill into the boss", () => {
    const team = spearTeam();
    const sp = soldierAt(team, 1)!;
    team.minions = [
      { id: "m1", name: "Imp", maxHp: 5, currentHp: 5, damage: 2 },
    ];
    const bossBefore = team.boss!.currentHp;
    const logs: string[] = [];
    resolveSpecialistAction(
      team,
      sp,
      { token: "A", soldierId: sp.id, effectiveGrade: "A" },
      () => 0.5,
      (text) => logs.push(text),
    );
    expect(team.minions[0]!.currentHp).toBe(0);
    expect(team.boss!.currentHp).toBe(bossBefore - 7);
    expect(logs.join(" ")).toMatch(/penetrates 7/);
  });

  it("F poke never penetrates", () => {
    const team = spearTeam();
    const sp = soldierAt(team, 1)!;
    team.minions = [
      { id: "m1", name: "Mite", maxHp: 1, currentHp: 1, damage: 2 },
    ];
    const bossBefore = team.boss!.currentHp;
    resolveSpecialistAction(
      team,
      sp,
      { token: "F", soldierId: sp.id, effectiveGrade: "F" },
      () => 0.5,
      () => {},
    );
    expect(team.minions[0]!.currentHp).toBe(0);
    expect(team.boss!.currentHp).toBe(bossBefore);
  });

  it("F claim grants no Parry; front remains vulnerable", () => {
    const team = spearTeam();
    const sp = soldierAt(team, 1)!;
    resolveSpecialistAction(
      team,
      sp,
      { token: "F", soldierId: sp.id, effectiveGrade: "F" },
      () => 0.5,
      () => {},
    );
    expect(sp.statuses.some((st) => st.kind === "Parry")).toBe(false);
    expect(applySpearmanBossDefense(sp, 100)).toBe(
      Math.floor(100 * SPEARMAN_FRONT_VULN_MULT),
    );
  });

  it("Parry reduces FrontSlam damage and clears after resolveBoss", () => {
    const team = spearTeam();
    const sp = soldierAt(team, 1)!;
    sp.statuses.push({
      kind: "Parry",
      reduction: SPEARMAN_PARRY_REDUCTION.A,
    });
    const hp0 = sp.currentHp;
    // Ash FrontSlam pos1 base 12 — force attack then full resolve (clears parry)
    team.phase = "boss_telegraph";
    team.pendingBossAttackId = "FrontSlam";
    resolveBoss(team);
    const lost = hp0 - sp.currentHp;
    // Reduced A Parry still applies for one boss window.
    expect(lost).toBe(Math.floor(12 * (1 - SPEARMAN_PARRY_REDUCTION.A)));
    expect(sp.statuses.some((st) => st.kind === "Parry")).toBe(false);
  });

  it("not-front Spearman without parry takes normal boss damage (no vuln)", () => {
    const team = spearTeam();
    const sp = soldierAt(team, 1)!;
    const other = soldierAt(team, 2)!;
    // Swap spearman to seat 2
    sp.position = 2;
    other.position = 1;
    expect(applySpearmanBossDefense(sp, 100)).toBe(100);
  });

  it("Spearman in position 3 can hit minions", () => {
    const team = spearTeam();
    const sp = soldierAt(team, 1)!;
    const mid = soldierAt(team, 3)!;
    // Put spearman mid
    const midPos = mid.position!;
    sp.position = midPos;
    mid.position = 1;
    team.minions = [
      {
        id: "m1",
        name: "Imp",
        maxHp: 15,
        currentHp: 15,
        damage: 2,
      },
    ];
    const bossBefore = team.boss!.currentHp;
    hitEnemies(team, 10, "single", 0, 0, sp);
    expect(team.minions[0]!.currentHp).toBe(5);
    expect(team.boss!.currentHp).toBe(bossBefore);
  });

  it("Spearman in position 4 cannot hit or penetrate through minions", () => {
    const team = spearTeam();
    const sp = soldierAt(team, 1)!;
    const back = soldierAt(team, 4)!;
    sp.position = 4;
    back.position = 1;
    team.minions = [
      { id: "m1", name: "Imp", maxHp: 5, currentHp: 5, damage: 2 },
    ];
    const bossBefore = team.boss!.currentHp;
    resolveSpecialistAction(
      team,
      sp,
      { token: "A", soldierId: sp.id, effectiveGrade: "A" },
      () => 0.5,
      () => {},
    );
    expect(team.minions[0]!.currentHp).toBe(5);
    expect(team.boss!.currentHp).toBe(bossBefore - 12);
  });
});
