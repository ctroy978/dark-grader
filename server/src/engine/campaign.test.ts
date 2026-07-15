import { describe, expect, it } from "vitest";
import type { Grade } from "@dungeon-grades/shared";
import {
  commitFullRound,
  createTeam,
  enterBetweenRooms,
  placeMagnet,
  returnFromDefeat,
  selectParty,
  startFight,
} from "./combat.js";

const POOL: Grade[] = "AAAABBBBBBCCCCCCDDFF".split("") as Grade[];

function fightOneRoom(team: ReturnType<typeof createTeam>, bossId: string) {
  const living = team.roster.filter((s) => s.alive).slice(0, 6);
  selectParty(
    team,
    living.map((s) => s.id),
  );
  startFight(team, bossId, POOL);
  for (let i = 0; i < 60; i++) {
    if (team.phase === "victory" || team.phase === "defeat") break;
    if (team.phase !== "awaiting_magnet") break;
    const pos = living.find((s) => s.alive && s.position)?.position ?? 1;
    placeMagnet(team, pos as 1 | 2 | 3 | 4 | 5 | 6);
    commitFullRound(team);
  }
}

describe("campaign progression", () => {
  it("increments rooms once and is idempotent on double continue", () => {
    const team = createTeam("c1", "CAMP1", "Camp", 1);
    // Fake a victory state
    team.phase = "victory";
    team.boss = {
      id: "x",
      name: "Test Boss",
      maxHp: 10,
      currentHp: 0,
      traits: [],
      attackIds: [],
      sequenceIndex: -1,
      statuses: [],
      curseDamageTakenMult: 1,
      curseRoundsLeft: 0,
      outgoingDamageMult: 1,
      outgoingBuffRoundsLeft: 0,
      stunRoundsLeft: 0,
      nextAttackBonus: 0,
    };
    team.roomIndex = 0;

    enterBetweenRooms(team, 3);
    expect(team.phase).toBe("between_rooms");
    expect(team.roomIndex).toBe(1);
    expect(team.activePartyIds).toEqual([]);
    expect(team.boss).toBeNull();

    // Double continue must not skip a room
    enterBetweenRooms(team, 3);
    expect(team.roomIndex).toBe(1);
    expect(team.phase).toBe("between_rooms");
  });

  it("completes campaign after final room", () => {
    const team = createTeam("c2", "CAMP2", "Camp", 2);
    team.phase = "victory";
    team.roomIndex = 2; // about to clear 3rd room's continue
    team.boss = {
      id: "x",
      name: "Final",
      maxHp: 10,
      currentHp: 0,
      traits: [],
      attackIds: [],
      sequenceIndex: -1,
      statuses: [],
      curseDamageTakenMult: 1,
      curseRoundsLeft: 0,
      outgoingDamageMult: 1,
      outgoingBuffRoundsLeft: 0,
      stunRoundsLeft: 0,
      nextAttackBonus: 0,
    };
    enterBetweenRooms(team, 3);
    expect(team.phase).toBe("campaign_complete");
    expect(team.roomIndex).toBe(3);
  });

  it("can run room 1 against ash wraith without crashing", () => {
    const team = createTeam("c3", "CAMP3", "Camp", 99);
    fightOneRoom(team, "ash_wraith");
    expect(["victory", "defeat", "awaiting_magnet", "boss_telegraph"]).toContain(
      team.phase,
    );
  });

  it("returns from defeat to lobby without advancing room", () => {
    const team = createTeam("c4", "CAMP4", "Camp", 4);
    team.phase = "defeat";
    team.roomIndex = 0;
    team.round = 12;
    team.activePartyIds = team.roster.slice(0, 6).map((s) => s.id);
    // Wipe the active party
    for (const id of team.activePartyIds) {
      const s = team.roster.find((x) => x.id === id)!;
      s.alive = false;
      s.currentHp = 0;
      s.position = 1;
    }
    team.boss = {
      id: "ash_wraith",
      name: "Ash Wraith",
      maxHp: 260,
      currentHp: 40,
      traits: [],
      attackIds: [],
      sequenceIndex: -1,
      statuses: [],
      curseDamageTakenMult: 1,
      curseRoundsLeft: 0,
      outgoingDamageMult: 1,
      outgoingBuffRoundsLeft: 0,
      stunRoundsLeft: 0,
      nextAttackBonus: 0,
    };

    returnFromDefeat(team);
    expect(team.phase).toBe("lobby");
    expect(team.roomIndex).toBe(0);
    expect(team.boss).toBeNull();
    expect(team.activePartyIds).toEqual([]);
    expect(team.round).toBe(0);
    // Fallen stay dead
    expect(team.roster.filter((s) => !s.alive).length).toBe(6);
    expect(team.roster.filter((s) => s.alive).length).toBeGreaterThanOrEqual(6);

    // Idempotent
    returnFromDefeat(team);
    expect(team.phase).toBe("lobby");
    expect(team.roomIndex).toBe(0);
  });

  it("returns from mid-campaign defeat to between_rooms, same room", () => {
    const team = createTeam("c5", "CAMP5", "Camp", 5);
    team.phase = "defeat";
    team.roomIndex = 1;
    team.boss = {
      id: "bone_colossus",
      name: "Bone Colossus",
      maxHp: 100,
      currentHp: 10,
      traits: [],
      attackIds: [],
      sequenceIndex: -1,
      statuses: [],
      curseDamageTakenMult: 1,
      curseRoundsLeft: 0,
      outgoingDamageMult: 1,
      outgoingBuffRoundsLeft: 0,
      stunRoundsLeft: 0,
      nextAttackBonus: 0,
    };

    returnFromDefeat(team);
    expect(team.phase).toBe("between_rooms");
    expect(team.roomIndex).toBe(1);
    expect(team.boss).toBeNull();
  });

  it("can reform and start fight after returnFromDefeat", () => {
    const team = createTeam("c6", "CAMP6", "Camp", 6);
    team.phase = "defeat";
    team.roomIndex = 0;
    // Kill 6 soldiers so they cannot reuse them
    for (const s of team.roster.slice(0, 6)) {
      s.alive = false;
      s.currentHp = 0;
    }
    returnFromDefeat(team);
    const living = team.roster.filter((s) => s.alive).slice(0, 6);
    selectParty(
      team,
      living.map((s) => s.id),
    );
    startFight(team, "ash_wraith", POOL);
    expect(team.phase).toBe("awaiting_magnet");
    expect(team.roomIndex).toBe(0);
  });
});
