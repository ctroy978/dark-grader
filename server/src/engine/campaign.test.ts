import { describe, expect, it } from "vitest";
import {
  INTER_ROOM_CAMP_HEAL_MISSING_PCT,
  isBacklineSupportArchetype,
  withBacklineSupportLast,
  type Grade,
} from "@dungeon-grades/shared";
import {
  applyInterRoomHealing,
  canFormNextParty,
  commitFullRound,
  createTeam,
  enterBetweenRooms,
  placeMagnet,
  requiredPartySize,
  returnFromDefeat,
  runAway,
  selectParty,
  startFight,
} from "./combat.js";

const POOL: Grade[] = "AAAABBBBBBCCCCCCDDFF".split("") as Grade[];

/**
 * Build a legal line of up to N living soldiers.
 * Healer/Runesinger only in the back seat (at most one).
 */
function livingPartyIds(
  team: ReturnType<typeof createTeam>,
  n = 6,
): string[] {
  const living = team.roster.filter((s) => s.alive);
  const rest = living.filter((s) => !isBacklineSupportArchetype(s.archetype));
  const supports = living.filter((s) => isBacklineSupportArchetype(s.archetype));
  if (supports.length === 0) {
    return living.slice(0, n).map((s) => s.id);
  }
  const line = rest.slice(0, n - 1);
  line.push(supports[0]!);
  return line.slice(0, n).map((s) => s.id);
}

function fightOneRoom(team: ReturnType<typeof createTeam>, bossId: string) {
  const living = team.roster.filter((s) => s.alive).slice(0, 6);
  selectParty(team, livingPartyIds(team, 6));
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
  it("camp heals 30% of missing HP for all living (no Vanguard gate)", () => {
    const team = createTeam("c-heal", "CAMPHEAL", "Heal", 3);
    // No living Vanguard — old rule would skip entirely
    for (const s of team.roster) {
      if (s.archetype === "Vanguard") {
        s.alive = false;
        s.currentHp = 0;
      }
    }
    const maiden = team.roster.find((s) => s.archetype === "ShieldMaiden")!;
    maiden.alive = true;
    maiden.currentHp = 7;
    const missing = maiden.maxHp - 7;
    const expected = 7 + Math.floor(missing * INTER_ROOM_CAMP_HEAL_MISSING_PCT);

    applyInterRoomHealing(team);
    expect(maiden.currentHp).toBe(expected);
    expect(maiden.currentHp).toBe(7 + Math.floor(missing * 0.3));
    // Dead stay dead
    expect(team.roster.filter((s) => s.archetype === "Vanguard").every((s) => !s.alive)).toBe(
      true,
    );
  });

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

  it("opens Cinder Herald with one real imp and can resolve a fight", () => {
    const team = createTeam("c3h", "CAMP3H", "Camp", 99);
    const living = team.roster.filter((s) => s.alive).slice(0, 6);
    selectParty(team, livingPartyIds(team, 6));
    startFight(team, "cinder_herald", POOL);
    expect(team.boss?.id).toBe("cinder_herald");
    expect(team.boss?.maxHp).toBe(170);
    expect(team.minions.filter((m) => m.currentHp > 0)).toHaveLength(1);
    expect(team.minions[0]?.name).toBe("Cinder Imp");
    expect(team.minions[0]?.maxHp).toBe(11);
    expect(team.minions[0]?.damage).toBe(3);
    expect(team.minions[0]?.onHitDot).toEqual({ type: "Fire", stacks: 1 });

    for (let i = 0; i < 60; i++) {
      if (team.phase === "victory" || team.phase === "defeat") break;
      if (team.phase !== "awaiting_magnet") break;
      const pos = living.find((s) => s.alive && s.position)?.position ?? 1;
      placeMagnet(team, pos as 1 | 2 | 3 | 4 | 5 | 6);
      commitFullRound(team);
    }
    expect(["victory", "defeat", "awaiting_magnet", "boss_telegraph"]).toContain(
      team.phase,
    );
  });

  it("opens Moss Grub with mites that apply Slime on hit", () => {
    const team = createTeam("c3g", "CAMP3G", "Camp", 88);
    selectParty(team, livingPartyIds(team, 6));
    startFight(team, "moss_grub", POOL);
    expect(team.boss?.id).toBe("moss_grub");
    expect(team.minions.filter((m) => m.currentHp > 0)).toHaveLength(1);
    expect(team.minions[0]?.name).toBe("Moss Mite");
    expect(team.minions[0]?.onHitDot).toEqual({ type: "Slime", stacks: 1 });
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
      maxHp: 210,
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
    selectParty(team, livingPartyIds(team, 6));
    startFight(team, "ash_wraith", POOL);
    expect(team.phase).toBe("awaiting_magnet");
    expect(team.roomIndex).toBe(0);
  });

  it("runAway returns living to camp without heal; boss resets; same room", () => {
    const team = createTeam("c6ra", "CAMP6RA", "Flee", 66);
    selectParty(team, livingPartyIds(team, 6));
    startFight(team, "ash_wraith", POOL);
    expect(team.phase).toBe("awaiting_magnet");
    expect(team.boss).not.toBeNull();

    // Damage living party members mid-fight
    const party = team.activePartyIds.map(
      (id) => team.roster.find((s) => s.id === id)!,
    );
    for (const s of party) {
      s.currentHp = Math.max(1, Math.floor(s.maxHp / 2));
      s.statuses = [
        {
          kind: "Dot",
          type: "Poison",
          stacks: 2,
          duration: 3,
          escalationStep: 0,
        },
      ];
    }
    // Kill one — they stay dead after fleeing
    const fallen = party[0]!;
    fallen.alive = false;
    fallen.currentHp = 0;
    const woundedHp = party[1]!.currentHp;

    const roomBefore = team.roomIndex;
    runAway(team);

    expect(team.phase).toBe("lobby");
    expect(team.roomIndex).toBe(roomBefore);
    expect(team.boss).toBeNull();
    expect(team.minions).toEqual([]);
    expect(team.activePartyIds).toEqual([]);
    expect(fallen.alive).toBe(false);
    expect(fallen.currentHp).toBe(0);
    // Living keep wounds — no inter-room heal
    expect(party[1]!.alive).toBe(true);
    expect(party[1]!.currentHp).toBe(woundedHp);
    // Fight statuses cleared (same as defeat return)
    expect(party[1]!.statuses).toEqual([]);

    // Can reform and retry; boss spawns fresh
    selectParty(team, livingPartyIds(team, 6));
    startFight(team, "ash_wraith", POOL);
    expect(team.phase).toBe("awaiting_magnet");
    expect(team.boss?.id).toBe("ash_wraith");
    expect(team.boss?.currentHp).toBe(team.boss?.maxHp);
  });

  it("runAway from mid-campaign uses between_rooms and does not advance", () => {
    const team = createTeam("c6rb", "CAMP6RB", "Flee2", 67);
    team.roomIndex = 2;
    selectParty(team, livingPartyIds(team, 6));
    startFight(team, "bone_colossus", POOL);
    expect(team.phase).toBe("awaiting_magnet");

    runAway(team);
    expect(team.phase).toBe("between_rooms");
    expect(team.roomIndex).toBe(2);
    expect(team.boss).toBeNull();
  });

  it("runAway is rejected outside magnet planning (not mid-boss)", () => {
    const team = createTeam("c6rc", "CAMP6RC", "Flee3", 68);
    team.phase = "boss_telegraph";
    expect(() => runAway(team)).toThrow(/planning the magnet/);
    team.phase = "resolving";
    expect(() => runAway(team)).toThrow(/planning the magnet/);
    team.phase = "victory";
    expect(() => runAway(team)).toThrow(/planning the magnet/);
    team.phase = "defeat";
    expect(() => runAway(team)).toThrow(/planning the magnet/);
    team.phase = "lobby";
    runAway(team); // idempotent
    expect(team.phase).toBe("lobby");
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

    selectParty(team, withBacklineSupportLast(survivors).map((s) => s.id));
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
