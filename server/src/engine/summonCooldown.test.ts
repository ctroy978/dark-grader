import { describe, expect, it } from "vitest";
import type { Grade, TeamState } from "@dungeon-grades/shared";
import { createTeam, startFight } from "./combat.js";
import { canBossSpawnMinions, pickBossAttackId } from "./bosses.js";
import { hitEnemies, noteMinionSlain } from "./damage.js";

const POOL = "AAAABBBBCCCCDDDFFF".split("") as Grade[];

function fieldParty(team: TeamState): void {
  const living = team.roster.filter((s) => s.alive).slice(0, 6);
  team.activePartyIds = living.map((s) => s.id);
  living.forEach((s, i) => {
    s.position = (i + 1) as 1 | 2 | 3 | 4 | 5 | 6;
    s.currentHp = s.maxHp;
    s.alive = true;
  });
}

describe("global summon cooldown", () => {
  it("sets noSummonBeforeRound when last minion dies", () => {
    const team = createTeam("t", "c", "T", 1);
    fieldParty(team);
    startFight(team, "cinder_herald", POOL);
    team.round = 4;
    // Kill all minions via note path
    for (const m of team.minions) m.currentHp = 0;
    noteMinionSlain(team);
    expect(team.noSummonBeforeRound).toBe(6);
    expect(canBossSpawnMinions(team)).toBe(false);
    team.round = 5;
    expect(canBossSpawnMinions(team)).toBe(false);
    team.round = 6;
    expect(canBossSpawnMinions(team)).toBe(true);
  });

  it("Herald never picks Summon while imps live", () => {
    const team = createTeam("t", "c", "T", 2);
    fieldParty(team);
    startFight(team, "cinder_herald", POOL);
    expect(team.minions.length).toBeGreaterThan(0);
    for (let i = 0; i < 40; i++) {
      const id = pickBossAttackId(team, () => (i * 0.07) % 1);
      expect(id).not.toBe("SummonCinderImps");
    }
  });

  it("killing last minion via hitEnemies arms cooldown", () => {
    const team = createTeam("t", "c", "T", 3);
    fieldParty(team);
    startFight(team, "moss_grub", POOL);
    team.round = 2;
    const actor = team.roster.find((s) => s.id === team.activePartyIds[0])!;
    // Overwhelm mites
    for (let i = 0; i < 6; i++) {
      hitEnemies(team, 50, "single", 0, 0, actor);
    }
    expect(team.minions.every((m) => m.currentHp <= 0)).toBe(true);
    expect(team.noSummonBeforeRound).toBeGreaterThanOrEqual(4);
    expect(canBossSpawnMinions(team)).toBe(false);
  });
});
