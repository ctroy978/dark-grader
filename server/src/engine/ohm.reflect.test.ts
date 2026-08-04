import { describe, expect, it } from "vitest";
import {
  OHM_REFLECT_RATIO,
  type Grade,
  type Soldier,
  type TeamState,
} from "@dungeon-grades/shared";
import {
  createTeam,
  startFight,
} from "./combat.js";
import { hitEnemies, tickMinionReflect } from "./damage.js";
import { resolveBossPhase } from "./bosses.js";

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

function seat1(team: TeamState): Soldier {
  const s = team.roster.find(
    (x) => team.activePartyIds.includes(x.id) && x.position === 1,
  )!;
  expect(s).toBeTruthy();
  return s;
}

describe("Ohm Reflect", () => {
  it("opens with Ohm damage 4 from TOML", () => {
    const team = createTeam("t", "CODE", "Test", 1);
    fieldParty(team);
    startFight(team, "rattle_captain", POOL);
    const ohm = team.minions.find((m) => m.kind === "ohm" || m.name === "Ohm");
    expect(ohm).toBeTruthy();
    expect(ohm!.damage).toBe(4);
  });

  it("blocks damage and reflects 25% to the attacker", () => {
    const team = createTeam("t", "CODE", "Test", 2);
    fieldParty(team);
    startFight(team, "rattle_captain", POOL);
    team.minions = [
      {
        id: "ohm_test",
        name: "Ohm",
        kind: "ohm",
        maxHp: 20,
        currentHp: 20,
        damage: 4,
        statuses: [{ kind: "Reflect", duration: 1 }],
      },
    ];
    const attacker = seat1(team);
    attacker.currentHp = 40;
    attacker.block = 0;
    team.partyShield = { active: false, remaining: 0, coveredIds: [] };

    const beforeAtk = attacker.currentHp;
    const beforeOhm = team.minions[0]!.currentHp;
    const log = hitEnemies(team, 12, "single", 0, 0, attacker);

    expect(team.minions[0]!.currentHp).toBe(beforeOhm);
    expect(log).toMatch(/reflect/i);
    const bounced = Math.floor(12 * OHM_REFLECT_RATIO);
    expect(attacker.currentHp).toBe(beforeAtk - bounced);
  });

  it("fades after one party-phase tick", () => {
    const team = createTeam("t", "CODE", "Test", 3);
    fieldParty(team);
    startFight(team, "rattle_captain", POOL);
    team.minions = [
      {
        id: "ohm_a",
        name: "Ohm",
        kind: "ohm",
        maxHp: 8,
        currentHp: 8,
        damage: 4,
        statuses: [{ kind: "Reflect", duration: 1 }],
      },
      {
        id: "ohm_b",
        name: "Ohm",
        kind: "ohm",
        maxHp: 8,
        currentHp: 8,
        damage: 4,
        statuses: [{ kind: "Reflect", duration: 1 }],
      },
    ];
    tickMinionReflect(team, () => {});
    expect(team.minions[0]!.statuses?.some((s) => s.kind === "Reflect")).toBe(
      false,
    );
    expect(team.minions[1]!.statuses?.some((s) => s.kind === "Reflect")).toBe(
      false,
    );
  });

  it("can raise Reflect after volley when chance succeeds", () => {
    const team = createTeam("t", "CODE", "Test", 4);
    fieldParty(team);
    startFight(team, "rattle_captain", POOL);
    team.minions = [
      {
        id: "ohm_vol",
        name: "Ohm",
        kind: "ohm",
        maxHp: 8,
        currentHp: 8,
        damage: 4,
        statuses: [],
        shotBubble: "Zap!",
      },
    ];
    team.magnetPosition = 1;
    team.boss!.stunRoundsLeft = 0;
    team.pendingBossAttackId = "LineAttack";
    // random always 0 → always succeeds OHM_REFLECT_CHANCE (0.5)
    resolveBossPhase(team, () => 0, () => {});
    const ohm = team.minions.find((m) => m.id === "ohm_vol")!;
    expect(ohm.statuses?.some((s) => s.kind === "Reflect")).toBe(true);
  });

  it("does not raise Reflect when chance fails", () => {
    const team = createTeam("t", "CODE", "Test", 5);
    fieldParty(team);
    startFight(team, "rattle_captain", POOL);
    team.minions = [
      {
        id: "ohm_vol2",
        name: "Ohm",
        kind: "ohm",
        maxHp: 8,
        currentHp: 8,
        damage: 4,
        statuses: [],
      },
    ];
    team.magnetPosition = 1;
    team.boss!.stunRoundsLeft = 0;
    team.pendingBossAttackId = "LineAttack";
    resolveBossPhase(team, () => 0.99, () => {});
    const ohm = team.minions.find((m) => m.id === "ohm_vol2")!;
    expect(ohm.statuses?.some((s) => s.kind === "Reflect")).toBe(false);
  });
});
