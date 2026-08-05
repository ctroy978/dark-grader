import { describe, expect, it } from "vitest";
import type { Grade, TeamState } from "@dungeon-grades/shared";
import { createTeam, selectParty, startFight } from "./combat.js";
import {
  activeBoneMemory,
  advanceBoneMemoryCharge,
  boneMemoryIsCritical,
  resolveBoneMemoryDetonation,
  resolveDestroyedBoneMemory,
  spawnNextBoneMemory,
  spawnScheduledBoneMemory,
} from "./boneMemories.js";
import { hitEnemies } from "./damage.js";

const POOL = "AAAABBBBCCCCDDDFFF".split("") as Grade[];

function readyTeam(seed = 1): TeamState {
  const team = createTeam("memory", "MEM01", "Memories", seed);
  selectParty(team, [
    "vanguard_1",
    "shieldmaiden_1",
    "firemage_1",
    "archer_1",
    "spearman_1",
    "healer_1",
  ]);
  startFight(team, "bone_colossus", POOL);
  return team;
}

describe("Bone Colossus memories", () => {
  it("opens with the Moss Grub memory and first HP gate", () => {
    const team = readyTeam();
    const memory = activeBoneMemory(team);
    expect(memory?.memory).toMatchObject({
      phaseIndex: 0,
      sourceBossId: "moss_grub",
      charge: 0,
      maxCharge: 2,
    });
    expect(memory?.maxHp).toBe(18);
    expect(team.boss?.damageFloor).toBe(Math.ceil(230 * 0.84));
    expect(team.boneColossus?.memoriesResolved).toBe(0);
  });

  it("enforces the current HP gate until the memory breaks", () => {
    const team = readyTeam();
    const backline = team.roster.find((soldier) => soldier.position === 5)!;
    hitEnemies(team, 999, "single", 0, 0, backline);
    expect(team.boss?.currentHp).toBe(team.boss?.damageFloor);

    const memory = activeBoneMemory(team)!;
    memory.currentHp = 0;
    const broken = resolveDestroyedBoneMemory(team);
    expect(broken?.outcome).toBe("destroyed");
    expect(team.boss?.damageFloor).toBe(Math.ceil(230 * 0.68));
    expect(team.boss?.curseDamageTakenMult).toBe(1.5);
    expect(team.boss?.curseRoundsLeft).toBe(2);
  });

  it("becomes critical after one charge step", () => {
    const team = readyTeam();
    expect(boneMemoryIsCritical(team)).toBe(false);
    const memory = advanceBoneMemoryCharge(team);
    expect(memory?.memory?.charge).toBe(1);
    expect(boneMemoryIsCritical(team)).toBe(true);
  });

  it("detonates without exposure and advances to the next memory", () => {
    const team = readyTeam();
    advanceBoneMemoryCharge(team);
    const hpBefore = team.roster
      .filter((soldier) => team.activePartyIds.includes(soldier.id))
      .reduce((total, soldier) => total + soldier.currentHp, 0);
    const result = resolveBoneMemoryDetonation(team, () => {});
    const hpAfter = team.roster
      .filter((soldier) => team.activePartyIds.includes(soldier.id))
      .reduce((total, soldier) => total + soldier.currentHp, 0);

    expect(result?.outcome).toBe("detonated");
    expect(hpAfter).toBeLessThan(hpBefore);
    expect(team.boss?.curseRoundsLeft).toBe(0);
    expect(team.boneColossus?.memoriesResolved).toBe(1);
    const next = spawnNextBoneMemory(team);
    expect(next?.memory?.sourceBossId).toBe("ash_wraith");
  });

  it("delays the next memory for one full exposed round after destruction", () => {
    const team = readyTeam();
    activeBoneMemory(team)!.currentHp = 0;
    resolveDestroyedBoneMemory(team);
    expect(spawnScheduledBoneMemory(team)).toBeNull();
    team.round += 1;
    expect(spawnScheduledBoneMemory(team)?.memory?.sourceBossId).toBe("ash_wraith");
  });

  it("resolves all five memories into a final stand at twenty percent HP or less", () => {
    const team = readyTeam();
    const order: string[] = [];
    for (let index = 0; index < 5; index++) {
      const memory = activeBoneMemory(team)!;
      order.push(memory.memory!.sourceBossId);
      memory.currentHp = 0;
      const result = resolveDestroyedBoneMemory(team)!;
      if (!result.finalStand) spawnNextBoneMemory(team);
    }

    expect(order).toEqual([
      "moss_grub",
      "ash_wraith",
      "cinder_herald",
      "rattle_captain",
      "barrow_warden",
    ]);
    expect(team.boneColossus?.finalStand).toBe(true);
    expect(team.boneColossus?.memoriesResolved).toBe(5);
    expect(team.boss?.damageFloor).toBe(0);
    expect(team.boss!.currentHp).toBeLessThanOrEqual(Math.ceil(230 * 0.2));
  });
});
