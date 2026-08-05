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
    pick("ShieldMaiden"),
    pick("Thundercaller"),
    pick("Healer"),
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

describe("gap rule (fixed positions 1–3 + Archer hit minions)", () => {
  it("FireMage in position 2 hits minions before the boss", () => {
    const team = teamWithAdds();
    const mage = team.roster.find((s) => s.archetype === "FireMage" && s.position)!;
    expect(mage.position).toBe(2);
    const bossBefore = team.boss!.currentHp;
    resolveSpecialistAction(
      team,
      mage,
      { token: "A", soldierId: mage.id, effectiveGrade: "A" },
      () => 0.5,
      () => {},
    );
    expect(team.minions[0]!.currentHp).toBe(3);
    expect(team.minions[1]!.currentHp).toBe(3);
    expect(team.boss!.currentHp).toBe(bossBefore - 9);
    const bossFire = team.boss!.statuses.find((s) => s.kind === "Dot" && s.type === "Fire");
    expect(bossFire).toMatchObject({ kind: "Dot", type: "Fire", stacks: 1, duration: 2 });
  });

  it("FireMage C in position 2 hits two minions without friendly fire", () => {
    const team = teamWithAdds();
    const mage = team.roster.find((s) => s.archetype === "FireMage" && s.position)!;
    const front = soldierAt(team, 1)!;
    const seat2 = soldierAt(team, 2)!;
    const hp1 = front.currentHp;
    const hp2 = seat2.currentHp;
    const bossBefore = team.boss!.currentHp;
    resolveSpecialistAction(
      team,
      mage,
      { token: "C", soldierId: mage.id, effectiveGrade: "C" },
      () => 0.5,
      () => {},
    );
    expect(front.currentHp).toBe(hp1);
    expect(seat2.currentHp).toBe(hp2);
    expect(team.minions.map((m) => m.currentHp)).toEqual([6, 6]);
    expect(team.boss!.currentHp).toBe(bossBefore);
  });

  it("a non-Archer in position 4 hits only the boss", () => {
    const team = teamWithAdds();
    const maiden = soldierAt(team, 4)!;
    expect(maiden.archetype).toBe("ShieldMaiden");
    const bossBefore = team.boss!.currentHp;
    const minionHp = team.minions.map((m) => m.currentHp);
    resolveSpecialistAction(
      team,
      maiden,
      { token: "A", soldierId: maiden.id, effectiveGrade: "A" },
      () => 0.5,
      () => {},
    );
    expect(team.minions.map((m) => m.currentHp)).toEqual(minionHp);
    expect(team.boss!.currentHp).toBe(bossBefore - 14);
  });

  it("does not collapse the back row forward when positions 1–3 die", () => {
    const team = teamWithAdds();
    for (const position of [1, 2, 3] as const) {
      const soldier = soldierAt(team, position)!;
      soldier.alive = false;
      soldier.currentHp = 0;
    }
    const back = soldierAt(team, 4)!;
    const bossBefore = team.boss!.currentHp;
    const minionHp = team.minions.map((m) => m.currentHp);
    hitEnemies(team, 10, "single", 0, 0, back);
    expect(team.minions.map((m) => m.currentHp)).toEqual(minionHp);
    expect(team.boss!.currentHp).toBe(bossBefore - 10);
  });

  it("Vanguard in pos 1 can hit minions with single-target", () => {
    const team = teamWithAdds();
    const vg = soldierAt(team, 1)!;
    expect(vg.archetype).toBe("Vanguard");
    hitEnemies(team, 12, "single", 0, 0, vg);
    expect(team.minions[0]!.currentHp).toBe(0);
  });

  it("ordinary single-target overkill does not spill into the boss", () => {
    const team = teamWithAdds();
    const vanguard = soldierAt(team, 1)!;
    team.minions = [
      { id: "m1", name: "Mite", maxHp: 5, currentHp: 5, damage: 2 },
    ];
    const bossBefore = team.boss!.currentHp;
    hitEnemies(team, 12, "single", 0, 0, vanguard);
    expect(team.minions[0]!.currentHp).toBe(0);
    expect(team.boss!.currentHp).toBe(bossBefore);
  });

  it("Archer in the back row can still hit minions", () => {
    const team = teamWithAdds();
    const archer = team.roster.find((s) => s.archetype === "Archer" && s.position)!;
    const seatFive = soldierAt(team, 5)!;
    const archerPosition = archer.position!;
    archer.position = 5;
    seatFive.position = archerPosition;
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
