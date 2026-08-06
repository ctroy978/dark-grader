import { describe, expect, it } from "vitest";
import type { Grade, Minion } from "@dungeon-grades/shared";
import {
  applyPartyDamage,
  hitEnemies,
} from "./damage.js";
import { applyDot } from "./dots.js";
import {
  createTeam,
  selectParty,
  startFight,
} from "./combat.js";
import { flushRelicDestructionCues } from "./rewards.js";

const POOL: Grade[] = ["A", "A", "B", "B", "C", "C", "D", "F"];

function equip(
  soldier: ReturnType<typeof createTeam>["roster"][number],
  relicId: "bulwark_sigil" | "ember_whetstone" | "purity_charm",
) {
  soldier.relic = { relicId, acquiredRoomIndex: 0, usedThisFight: false };
}

function attackingTeam(relicId: "ember_whetstone" = "ember_whetstone") {
  const team = createTeam("relic-hit", "RH001", "Relic Hit", 31, "class-one");
  const party = team.roster
    .filter((soldier) => soldier.archetype !== "Healer" && soldier.archetype !== "Lifebinder")
    .slice(0, 6);
  equip(party[0]!, relicId);
  selectParty(team, party.map((soldier) => soldier.id));
  startFight(team, "moss_grub", POOL);
  team.minions = [];
  team.boss!.currentHp = 100;
  return { team, actor: party[0]! };
}

describe("relic combat effects", () => {
  it("Bulwark reduces only the first direct boss hit", () => {
    const team = createTeam("bulwark", "BLW01", "Bulwark", 1);
    const soldier = team.roster[0]!;
    equip(soldier, "bulwark_sigil");
    soldier.currentHp = soldier.maxHp;

    const first = applyPartyDamage(soldier, 10, team.partyShield, {
      team,
      source: "boss",
    });
    const second = applyPartyDamage(soldier, 10, team.partyShield, {
      team,
      source: "boss",
    });
    expect(first.hpLost).toBe(4);
    expect(second.hpLost).toBe(10);
    expect(soldier.relic?.usedThisFight).toBe(true);
  });

  it("Bulwark applies before party cover and ignores non-boss damage", () => {
    const team = createTeam("bulwark-cover", "BLW02", "Bulwark", 2);
    const soldier = team.roster[0]!;
    equip(soldier, "bulwark_sigil");
    team.partyShield = {
      active: true,
      remaining: 5,
      coveredIds: [soldier.id],
    };

    const minion = applyPartyDamage(soldier, 3, team.partyShield, {
      team,
      source: "minion",
    });
    expect(minion.shieldAbsorbed).toBe(3);
    expect(soldier.relic?.usedThisFight).toBe(false);

    team.partyShield.remaining = 5;
    team.partyShield.active = true;
    const boss = applyPartyDamage(soldier, 10, team.partyShield, {
      team,
      source: "boss",
    });
    expect(boss.hpLost).toBe(0);
    expect(boss.shieldAbsorbed).toBe(4);
    expect(team.partyShield.remaining).toBe(1);
  });

  it("Ember adds four damage to the first actual enemy hit only", () => {
    const { team, actor } = attackingTeam();
    const before = team.boss!.currentHp;
    hitEnemies(team, 5, "single", 0, 0, actor);
    expect(before - team.boss!.currentHp).toBe(9);
    const afterFirst = team.boss!.currentHp;
    hitEnemies(team, 5, "single", 0, 0, actor);
    expect(afterFirst - team.boss!.currentHp).toBe(5);
  });

  it("Ember buffs only one target of an AoE action", () => {
    const { team, actor } = attackingTeam();
    const minions: Minion[] = [
      { id: "m1", name: "One", maxHp: 20, currentHp: 20, damage: 1, statuses: [] },
      { id: "m2", name: "Two", maxHp: 20, currentHp: 20, damage: 1, statuses: [] },
    ];
    team.minions = minions;
    hitEnemies(team, 5, "aoe", 2, 0, actor);
    expect(minions[0]!.currentHp).toBe(11);
    expect(minions[1]!.currentHp).toBe(15);
  });

  it("Ember is not consumed by a reflected immune hit", () => {
    const { team, actor } = attackingTeam();
    team.minions = [
      {
        id: "ohm",
        name: "Ohm",
        maxHp: 20,
        currentHp: 20,
        damage: 1,
        statuses: [{ kind: "Reflect", duration: 1 }],
      },
    ];
    hitEnemies(team, 5, "single", 0, 0, actor);
    expect(actor.relic?.usedThisFight).toBe(false);
    team.minions[0]!.statuses = [];
    hitEnemies(team, 5, "single", 0, 0, actor);
    expect(team.minions[0]!.currentHp).toBe(11);
    expect(actor.relic?.usedThisFight).toBe(true);
  });

  it("Purity shortens the first new timed DoT and not later applications", () => {
    const team = createTeam("purity", "PUR01", "Purity", 3);
    const soldier = team.roster[0]!;
    equip(soldier, "purity_charm");
    applyDot(soldier, "Fire", 1, 3, true, team);
    const fire = soldier.statuses.find((status) => status.kind === "Dot" && status.type === "Fire");
    expect(fire?.kind === "Dot" ? fire.duration : null).toBe(2);
    applyDot(soldier, "Ice", 1, 3, true, team);
    const ice = soldier.statuses.find((status) => status.kind === "Dot" && status.type === "Ice");
    expect(ice?.kind === "Dot" ? ice.duration : null).toBe(3);
  });

  it("Purity ignores Slime and can prevent a one-tick DoT", () => {
    const team = createTeam("purity-slime", "PUR02", "Purity", 4);
    const soldier = team.roster[0]!;
    equip(soldier, "purity_charm");
    applyDot(soldier, "Slime", 1, undefined, true, team);
    expect(soldier.relic?.usedThisFight).toBe(false);
    applyDot(soldier, "Fire", 1, 1, true, team);
    expect(
      soldier.statuses.some((status) => status.kind === "Dot" && status.type === "Fire"),
    ).toBe(false);
    expect(soldier.relic?.usedThisFight).toBe(true);
  });

  it("resets deployed relic use at the start of the next fight", () => {
    const team = createTeam("reset-relic", "RST01", "Reset", 5);
    const party = team.roster
      .filter((soldier) => soldier.archetype !== "Healer" && soldier.archetype !== "Lifebinder")
      .slice(0, 6);
    equip(party[0]!, "bulwark_sigil");
    party[0]!.relic!.usedThisFight = true;
    selectParty(team, party.map((soldier) => soldier.id));
    startFight(team, "moss_grub", POOL);
    expect(party[0]!.relic?.usedThisFight).toBe(false);
  });

  it("destroys a relic immediately on lethal damage and emits one cue", () => {
    const team = createTeam("break-relic", "BRK01", "Break", 6);
    const soldier = team.roster[0]!;
    equip(soldier, "bulwark_sigil");
    soldier.currentHp = 3;
    applyPartyDamage(soldier, 20, team.partyShield, {
      team,
      source: "minion",
    });
    expect(soldier.alive).toBe(false);
    expect(soldier.relic).toBeNull();
    expect(team.items.rooms[0]?.destroyedRelics).toHaveLength(1);

    // A later revival restores the soldier, never the destroyed item.
    soldier.alive = true;
    soldier.currentHp = 1;
    expect(soldier.relic).toBeNull();
    flushRelicDestructionCues(team);
    flushRelicDestructionCues(team);
    expect(team.playback.filter((cue) => cue.fx?.includes("relic-break"))).toHaveLength(1);
  });

  it("Last Stand prevents both death and relic destruction", () => {
    const team = createTeam("stand-relic", "STD01", "Stand", 7);
    const soldier = team.roster[0]!;
    equip(soldier, "purity_charm");
    soldier.currentHp = 3;
    soldier.statuses.push({ kind: "LastStand" });
    applyPartyDamage(soldier, 20, team.partyShield, {
      team,
      source: "boss",
    });
    expect(soldier.alive).toBe(true);
    expect(soldier.currentHp).toBe(1);
    expect(soldier.relic?.relicId).toBe("purity_charm");
    expect(team.items.rooms).toHaveLength(0);
  });
});
