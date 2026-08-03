import { describe, expect, it } from "vitest";
import type { Grade, TeamState } from "@dungeon-grades/shared";
import { createTeam, selectParty, startFight } from "./combat.js";
import { hitEnemies, soldierAt } from "./damage.js";
import { resolveSpecialistAction } from "./specialists.js";

const POOL: Grade[] = [
  "A",
  "A",
  "B",
  "B",
  "C",
  "C",
  "D",
  "F",
  "A",
  "B",
  "C",
];

function teamWithAdds(): TeamState {
  const team = createTeam("aoe", "AOET1", "AOE", 42);
  // Guarantee FireMage + Archer in the line for kit tests
  const pick = (arch: string) =>
    team.roster.find((s) => s.alive && s.archetype === arch)!;
  const party = [
    pick("Vanguard"),
    pick("FireMage"),
    pick("Archer"),
    pick("Healer"),
    pick("ShieldMaiden"),
    pick("Thundercaller"),
  ].map((s) => s.id);
  selectParty(team, party);
  startFight(team, "bone_colossus", POOL);
  team.minions = [
    {
      id: "m1",
      name: "Frost Archer",
      maxHp: 12,
      currentHp: 12,
      damage: 4,
    },
    {
      id: "m2",
      name: "Frost Archer",
      maxHp: 12,
      currentHp: 12,
      damage: 4,
    },
  ];
  return team;
}

describe("hitEnemies aoe", () => {
  it("hits distinct minions first, then boss, up to max targets", () => {
    const team = teamWithAdds();
    const bossBefore = team.boss!.currentHp;
    const report = hitEnemies(team, 10, "aoe", 3, 2);
    // 12 each to two archers (10+2), then 10 to boss
    expect(team.minions[0]!.currentHp).toBe(0);
    expect(team.minions[1]!.currentHp).toBe(0);
    expect(team.boss!.currentHp).toBe(bossBefore - 10);
    expect(report).toMatch(/slain/);
    expect(report).toMatch(/Bone Colossus|boss/i);
  });

  it("does not multi-hit the boss when no minions", () => {
    const team = teamWithAdds();
    team.minions = [];
    const before = team.boss!.currentHp;
    hitEnemies(team, 9, "aoe", 3, 0);
    expect(team.boss!.currentHp).toBe(before - 9);
  });
});

describe("gap rule (pos 1 + Archer only hit minions)", () => {
  it("FireMage not in front hits boss only (minions untouched)", () => {
    const team = teamWithAdds();
    // party order: Vanguard=1, FireMage=2, Archer=3, …
    const mage = team.roster.find((s) => s.archetype === "FireMage" && s.position)!;
    expect(mage.position).toBe(2);
    const bossBefore = team.boss!.currentHp;
    const minionHp = team.minions.map((m) => m.currentHp);
    resolveSpecialistAction(
      team,
      mage,
      { token: "A", soldierId: mage.id, effectiveGrade: "A" },
      () => 0.5,
      () => {},
    );
    expect(team.minions[0]!.currentHp).toBe(minionHp[0]);
    expect(team.minions[1]!.currentHp).toBe(minionHp[1]);
    expect(team.boss!.currentHp).toBe(bossBefore - 9);
    const bossFire = team.boss!.statuses.find((s) => s.kind === "Dot" && s.type === "Fire");
    expect(bossFire).toMatchObject({ kind: "Dot", type: "Fire", stacks: 1, duration: 2 });
  });

  it("FireMage in pos 1 wildfires adds and applies Fire to survivors + boss", () => {
    const team = teamWithAdds();
    const mage = team.roster.find((s) => s.archetype === "FireMage" && s.position)!;
    const front = soldierAt(team, 1)!;
    // Swap mage into seat 1
    const magePos = mage.position!;
    mage.position = 1;
    front.position = magePos;
    const bossBefore = team.boss!.currentHp;
    resolveSpecialistAction(
      team,
      mage,
      { token: "A", soldierId: mage.id, effectiveGrade: "A" },
      () => 0.5,
      () => {},
    );
    // 9 each to two archers → 3 left each; third hit boss 9 + Fire
    expect(team.minions[0]!.currentHp).toBe(3);
    expect(team.minions[1]!.currentHp).toBe(3);
    expect(team.boss!.currentHp).toBe(bossBefore - 9);
    for (const m of team.minions) {
      const fire = m.statuses?.find((s) => s.kind === "Dot" && s.type === "Fire");
      expect(fire).toMatchObject({ kind: "Dot", type: "Fire", stacks: 1, duration: 2 });
    }
    const bossFire = team.boss!.statuses.find((s) => s.kind === "Dot" && s.type === "Fire");
    expect(bossFire).toMatchObject({ kind: "Dot", type: "Fire", stacks: 1, duration: 2 });
  });

  it("Vanguard in pos 1 can hit minions with single-target", () => {
    const team = teamWithAdds();
    const vg = soldierAt(team, 1)!;
    expect(vg.archetype).toBe("Vanguard");
    hitEnemies(team, 12, "single", 0, 0, vg);
    expect(team.minions[0]!.currentHp).toBe(0);
  });

  it("Archer any seat arrow-storm one-shots bone archers (12 vs minion)", () => {
    const team = teamWithAdds();
    const archer = team.roster.find((s) => s.archetype === "Archer" && s.position)!;
    expect(archer.position).not.toBe(1);
    const bossBefore = team.boss!.currentHp;
    resolveSpecialistAction(
      team,
      archer,
      { token: "A", soldierId: archer.id, effectiveGrade: "A" },
      () => 0.5,
      () => {},
    );
    expect(team.minions.every((m) => m.currentHp === 0)).toBe(true);
    expect(team.boss!.currentHp).toBe(bossBefore - 10);
  });
});
