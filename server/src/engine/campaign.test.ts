import { describe, expect, it } from "vitest";
import type { Grade } from "@dungeon-grades/shared";
import {
  canFormNextParty,
  commitFullRound,
  createTeam,
  enterBetweenRooms,
  placeMagnet,
  requiredPartySize,
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

  it("allows understrength party when fewer than 6 living (no soft-lock)", () => {
    const team = createTeam("c7", "CAMP7", "Short", 7);
    team.phase = "between_rooms";
    team.roomIndex = 1;
    // Leave only 4 living
    for (const s of team.roster) {
      s.alive = false;
      s.currentHp = 0;
    }
    const survivors = team.roster.slice(0, 4);
    for (const s of survivors) {
      s.alive = true;
      s.currentHp = Math.max(1, Math.floor(s.maxHp / 2));
    }

    expect(requiredPartySize(team)).toBe(4);
    expect(canFormNextParty(team)).toBe(true);

    expect(() =>
      selectParty(
        team,
        survivors.slice(0, 3).map((s) => s.id),
      ),
    ).toThrow(/all of them|Understrength/i);

    selectParty(
      team,
      survivors.map((s) => s.id),
    );
    expect(team.activePartyIds).toHaveLength(4);
    expect(
      team.activePartyIds.map(
        (id) => team.roster.find((s) => s.id === id)!.position,
      ),
    ).toEqual([1, 2, 3, 4]);

    startFight(team, "bone_colossus", POOL);
    expect(team.phase).toBe("awaiting_magnet");
    expect(team.activePartyIds).toHaveLength(4);
    expect(team.boss?.id).toBe("bone_colossus");
  });

  it("blocks party formation when the entire roster is dead", () => {
    const team = createTeam("c8", "CAMP8", "Wipe", 8);
    team.phase = "lobby";
    for (const s of team.roster) {
      s.alive = false;
      s.currentHp = 0;
    }
    expect(requiredPartySize(team)).toBe(0);
    expect(canFormNextParty(team)).toBe(false);
    expect(() => selectParty(team, [])).toThrow(/No living/i);
  });

  it("still requires exactly 6 when 6+ living", () => {
    const team = createTeam("c9", "CAMP9", "Full", 9);
    team.phase = "lobby";
    const five = team.roster.filter((s) => s.alive).slice(0, 5);
    expect(() => selectParty(team, five.map((s) => s.id))).toThrow(
      /exactly 6/i,
    );
  });
});
