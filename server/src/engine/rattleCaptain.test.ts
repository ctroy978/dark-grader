import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROOM_BOSSES,
  RATTLE_SPARK_STUN_CHANCE,
  THUNDERCALLER_BOSS_STUN_CHANCE,
  type Grade,
  type Soldier,
  type TeamState,
} from "@dungeon-grades/shared";
import {
  commitFullRound,
  createTeam,
  placeMagnet,
  startFight,
} from "./combat.js";
import { hitEnemies } from "./damage.js";
import { pickBossAttackId, resolveBossPhase } from "./bosses.js";
import { getBossTemplate } from "../seed/bossLoader.js";

const POOL = "AAAABBBBCCCCDDDFFF".split("") as Grade[];

function fieldParty(team: TeamState, n = 6): void {
  const living = team.roster.filter((s) => s.alive).slice(0, n);
  team.activePartyIds = living.map((s) => s.id);
  living.forEach((s, i) => {
    s.position = (i + 1) as 1 | 2 | 3 | 4 | 5 | 6;
    s.currentHp = s.maxHp;
    s.alive = true;
    s.statuses = [];
  });
}

function pickThundercaller(team: TeamState): Soldier {
  const s = team.roster.find((x) => x.archetype === "Thundercaller")!;
  expect(s).toBeTruthy();
  return s;
}

function nonThundercallerAt(
  team: TeamState,
  pos: number,
): Soldier | undefined {
  const s = team.roster.find(
    (x) =>
      team.activePartyIds.includes(x.id) &&
      x.position === pos &&
      x.alive &&
      x.archetype !== "Thundercaller",
  );
  return s;
}

describe("Rattle Captain", () => {
  it("loads from TOML with RattleSpark and Ohms", () => {
    const t = getBossTemplate("rattle_captain");
    expect(t).toBeTruthy();
    expect(t!.attackIds).toContain("RattleSpark");
    expect(t!.attackIds).toContain("Cascade");
    expect(t!.attackIds).toContain("SummonOhms");
    expect(t!.attackIds).not.toContain("FrontSlam");
    expect(t!.maxHp).toBe(190);
  });

  it("is on the default campaign path", () => {
    expect(DEFAULT_ROOM_BOSSES).toContain("rattle_captain");
    expect(DEFAULT_ROOM_BOSSES[3]).toBe("rattle_captain");
    expect(DEFAULT_ROOM_BOSSES).toHaveLength(6);
    expect(DEFAULT_ROOM_BOSSES[4]).toBe("barrow_warden");
    expect(DEFAULT_ROOM_BOSSES[5]).toBe("bone_colossus");
  });

  it("never picks two stun-kits in a row", () => {
    const team = createTeam("t", "CODE", "Test", 42);
    fieldParty(team);
    startFight(team, "rattle_captain", POOL);
    team.bossLastAttackWasStunKit = true;
    const ids = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const id = pickBossAttackId(team, () => (i * 0.17) % 1);
      ids.add(id);
      expect(["RattleSpark", "Cascade"]).not.toContain(id);
    }
    expect(ids.size).toBeGreaterThan(0);
  });

  it("does not hard-force summon every empty-gap turn", () => {
    const team = createTeam("t", "CODE", "Test", 42);
    fieldParty(team);
    startFight(team, "rattle_captain", POOL);
    team.minions = [];
    team.round = 5;
    team.noSummonBeforeRound = 0;
    team.bossLastAttackWasStunKit = false;
    const ids: string[] = [];
    for (let i = 0; i < 50; i++) {
      ids.push(pickBossAttackId(team, () => (i * 0.13 + 0.02) % 1));
    }
    const nonSummon = ids.filter((id) => id !== "SummonOhms");
    expect(nonSummon.length).toBeGreaterThan(10);
    expect(new Set(nonSummon).size).toBeGreaterThan(1);
  });

  it("blocks all spawns while a minion lives or during post-clear cooldown", () => {
    const team = createTeam("t", "CODE", "Test", 1);
    fieldParty(team);
    startFight(team, "rattle_captain", POOL);
    // Gap occupied
    expect(team.minions.some((m) => m.currentHp > 0)).toBe(true);
    for (let i = 0; i < 30; i++) {
      expect(pickBossAttackId(team, () => (i * 0.11) % 1)).not.toBe(
        "SummonOhms",
      );
    }
    // Clear gap mid-round 3
    team.round = 3;
    team.minions = [];
    team.noSummonBeforeRound = 5; // as if noteMinionSlain: round+2
    for (let i = 0; i < 30; i++) {
      expect(pickBossAttackId(team, () => (i * 0.11) % 1)).not.toBe(
        "SummonOhms",
      );
    }
    // After cooldown
    team.round = 5;
    team.noSummonBeforeRound = 5;
    const after = new Set(
      Array.from({ length: 40 }, (_, i) =>
        pickBossAttackId(team, () => (i * 0.09) % 1),
      ),
    );
    expect(after.has("SummonOhms") || after.has("RattleSpark")).toBe(true);
  });

  it("does not lock magnet movement", () => {
    const team = createTeam("t", "CODE", "Test", 7);
    fieldParty(team);
    startFight(team, "rattle_captain", POOL);
    team.magnetPosition = 1;
    placeMagnet(team, 3);
    expect(team.magnetPosition).toBe(3);
  });

  it("RattleSpark can stun the magnet-seat soldier", () => {
    const team = createTeam("t", "CODE", "Test", 99);
    fieldParty(team);
    startFight(team, "rattle_captain", POOL);
    // Put a non-TC under magnet seat 2
    const target = nonThundercallerAt(team, 2);
    expect(target).toBeTruthy();
    team.magnetPosition = 2;
    if (team.boss) team.boss.stunRoundsLeft = 0;
    team.pendingBossAttackId = "RattleSpark";
    // random always < 0.3 → guaranteed stun roll success
    resolveBossPhase(team, () => 0.0, () => {});
    const after = team.roster.find((s) => s.id === target!.id)!;
    expect(after.statuses.some((st) => st.kind === "Stun")).toBe(true);
    expect(team.bossLastAttackWasStunKit).toBe(true);
    // Magnet still movable
    placeMagnet(team, 4);
    expect(team.magnetPosition).toBe(4);
  });

  it("Thundercaller deals half damage to Captain", () => {
    const team = createTeam("t", "CODE", "Test", 11);
    fieldParty(team);
    startFight(team, "rattle_captain", POOL);
    team.minions = [];
    const tc = pickThundercaller(team);
    team.activePartyIds = [
      tc.id,
      ...team.activePartyIds.filter((id) => id !== tc.id),
    ].slice(0, 6);
    tc.position = 1;
    const before = team.boss!.currentHp;
    hitEnemies(team, 20, "single", 0, 0, tc);
    const lost = before - team.boss!.currentHp;
    expect(lost).toBe(10);
  });

  it("Captain is immune to stun trait", () => {
    const team = createTeam("t", "CODE", "Test", 3);
    fieldParty(team);
    startFight(team, "rattle_captain", POOL);
    expect(team.boss!.traits).toContain("StunImmune");
    expect(THUNDERCALLER_BOSS_STUN_CHANCE).toBe(0.3);
    expect(RATTLE_SPARK_STUN_CHANCE).toBe(0.6);
  });

  it("weights RattleSpark as the main attack over Crush", () => {
    const t = getBossTemplate("rattle_captain")!;
    const spark = t.attacks.find((a) => a.id === "RattleSpark")!;
    const crush = t.attacks.find((a) => a.id === "CrushMagnet")!;
    const cascade = t.attacks.find((a) => a.id === "Cascade")!;
    expect(spark.weight).toBeGreaterThan(crush.weight);
    expect(cascade.weight).toBe(2);
  });

  it("opens with Ohms and can full-round without throwing", () => {
    const team = createTeam("t", "CODE", "Test", 12345);
    fieldParty(team);
    startFight(team, "rattle_captain", POOL);
    expect(team.minions.some((m) => m.name === "Ohm" || m.kind === "ohm")).toBe(
      true,
    );
    commitFullRound(team);
    expect(["awaiting_magnet", "boss_telegraph", "victory", "defeat"]).toContain(
      team.phase,
    );
  });
});
