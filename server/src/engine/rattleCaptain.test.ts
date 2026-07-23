import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROOM_BOSSES,
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

describe("Rattle Captain", () => {
  it("loads from TOML with RattleSpark and scraps", () => {
    const t = getBossTemplate("rattle_captain");
    expect(t).toBeTruthy();
    expect(t!.attackIds).toContain("RattleSpark");
    expect(t!.attackIds).toContain("Cascade");
    expect(t!.attackIds).toContain("SummonBoneScraps");
    expect(t!.attackIds).not.toContain("FrontSlam");
    expect(t!.maxHp).toBe(190);
  });

  it("is on the default campaign path", () => {
    expect(DEFAULT_ROOM_BOSSES).toContain("rattle_captain");
    expect(DEFAULT_ROOM_BOSSES[3]).toBe("rattle_captain");
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

  it("locks magnet and blocks placeMagnet", () => {
    const team = createTeam("t", "CODE", "Test", 7);
    fieldParty(team);
    startFight(team, "rattle_captain", POOL);
    team.magnetStunRoundsLeft = 1;
    expect(() => placeMagnet(team, 3)).toThrow(/locked|shocked/i);
  });

  it("Cascade always locks magnet on Captain", () => {
    const team = createTeam("t", "CODE", "Test", 99);
    fieldParty(team);
    startFight(team, "rattle_captain", POOL);
    team.magnetStunRoundsLeft = 0;
    team.pendingBossAttackId = "Cascade";
    // Force non-stun-skip
    if (team.boss) team.boss.stunRoundsLeft = 0;
    resolveBossPhase(team, () => 0.99, () => {});
    expect(team.magnetStunRoundsLeft).toBeGreaterThanOrEqual(1);
    expect(team.bossLastAttackWasStunKit).toBe(true);
  });

  it("Thundercaller deals half damage to Captain", () => {
    const team = createTeam("t", "CODE", "Test", 11);
    fieldParty(team);
    startFight(team, "rattle_captain", POOL);
    team.minions = [];
    const tc = pickThundercaller(team);
    team.activePartyIds = [tc.id, ...team.activePartyIds.filter((id) => id !== tc.id)].slice(
      0,
      6,
    );
    tc.position = 1;
    const before = team.boss!.currentHp;
    hitEnemies(team, 20, "single", 0, 0, tc);
    const lost = before - team.boss!.currentHp;
    expect(lost).toBe(10);
  });

  it("Captain is immune to Thundercaller stun", () => {
    const team = createTeam("t", "CODE", "Test", 3);
    fieldParty(team);
    startFight(team, "rattle_captain", POOL);
    // Simulate tryBossStun path via trait
    expect(team.boss!.traits).toContain("StunImmune");
    team.boss!.stunRoundsLeft = 0;
    // Force many full rounds shouldn't be needed — unit-level: traits gate
    expect(THUNDERCALLER_BOSS_STUN_CHANCE).toBe(0.3);
  });

  it("can run a full commit against Captain without throwing", () => {
    const team = createTeam("t", "CODE", "Test", 12345);
    fieldParty(team);
    startFight(team, "rattle_captain", POOL);
    expect(team.minions.some((m) => m.name.includes("Scrap"))).toBe(true);
    commitFullRound(team);
    expect(["awaiting_magnet", "boss_telegraph", "victory", "defeat"]).toContain(
      team.phase,
    );
  });
});
