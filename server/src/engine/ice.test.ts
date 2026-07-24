import { describe, expect, it } from "vitest";
import {
  DOT_STATS,
  MAX_PARTY_ICE_STACKS,
  type Grade,
  type TeamState,
} from "@dungeon-grades/shared";
import {
  createTeam,
  selectParty,
  startFight,
} from "./combat.js";
import {
  applyDot,
  applySoftFreeze,
  isChainFrozen,
  isFrozen,
  isSoftFrozen,
  tickDots,
  tickFrozenChain,
} from "./dots.js";
import { healSoldier, livingParty, soldierAt } from "./damage.js";
import { resolveSpecialistAction } from "./specialists.js";
import { getBossTemplate } from "../seed/bossLoader.js";

const POOL: Grade[] = "AAAABBBBBBCCCCCCDDFF".split("") as Grade[];

function makeColossusTeam(seed = 9): TeamState {
  const team = createTeam("ice-t", "ICE1", "Ice", seed);
  selectParty(team, [
    "vanguard_1",
    "shieldmaiden_1",
    "healer_1",
    "firemage_1",
    "archer_1",
    "doomcaller_1",
  ]);
  startFight(team, "bone_colossus", POOL);
  team.log = [];
  team.partyShield = { active: false, remaining: 0 };
  for (const s of team.roster) {
    if (team.activePartyIds.includes(s.id)) {
      s.block = 0;
      s.statuses = [];
      s.currentHp = s.maxHp;
    }
  }
  return team;
}

describe("Ice DoT / soft freeze (Frost Archer)", () => {
  it("bone archers have Ice on-hit kit", () => {
    const team = makeColossusTeam(1);
    expect(team.boss?.id).toBe("bone_colossus");
    const tpl = getBossTemplate("bone_colossus");
    const summon = tpl?.attacks.find((a) => a.id === "SummonBoneArchers")?.summon;
    expect(summon?.onHitDot).toEqual({ type: "Ice", stacks: 1 });
  });

  it("ticks flat for 3 rounds then soft-freezes", () => {
    const team = makeColossusTeam(2);
    const front = soldierAt(team, 1)!;
    const hp0 = front.currentHp;
    applyDot(front, "Ice", 1, undefined, true);

    const ice = front.statuses.find((s) => s.kind === "Dot" && s.type === "Ice");
    expect(ice?.kind).toBe("Dot");
    if (ice?.kind === "Dot") {
      expect(ice.duration).toBe(DOT_STATS.Ice.duration);
      expect(ice.escalationStep).toBeUndefined();
      expect(ice.stacks).toBe(1);
    }

    tickDots(team, () => {});
    expect(isFrozen(front)).toBe(false);
    expect(
      front.statuses.some((s) => s.kind === "Dot" && s.type === "Ice"),
    ).toBe(true);

    tickDots(team, () => {});
    expect(isFrozen(front)).toBe(false);

    tickDots(team, () => {});
    // After 3rd tick, Ice expires → soft freeze
    expect(
      front.statuses.some((s) => s.kind === "Dot" && s.type === "Ice"),
    ).toBe(false);
    expect(isSoftFrozen(front)).toBe(true);
    expect(isChainFrozen(front)).toBe(false);
    expect(hp0 - front.currentHp).toBe(DOT_STATS.Ice.tick * 3);
  });

  it("caps Ice stacks at 1 and does not ramp", () => {
    const team = makeColossusTeam(3);
    const front = soldierAt(team, 1)!;
    applyDot(front, "Ice", 1, undefined, true);
    applyDot(front, "Ice", 2, undefined, true);
    const ice = front.statuses.find((s) => s.kind === "Dot" && s.type === "Ice");
    expect(ice?.kind).toBe("Dot");
    if (ice?.kind === "Dot") {
      expect(ice.stacks).toBe(MAX_PARTY_ICE_STACKS);
      expect(ice.escalationStep).toBeUndefined();
      expect(ice.duration).toBe(DOT_STATS.Ice.duration);
    }
  });

  it("cleanse before expiry prevents soft freeze", () => {
    const team = makeColossusTeam(4);
    const front = soldierAt(team, 1)!;
    applyDot(front, "Ice", 1, undefined, true);
    tickDots(team, () => {});
    tickDots(team, () => {});

    const healer = livingParty(team).find((s) => s.archetype === "Healer")!;
    resolveSpecialistAction(
      team,
      healer,
      { token: "A", soldierId: healer.id, effectiveGrade: "A" },
      () => 0.5,
      () => {},
    );
    expect(
      front.statuses.some((s) => s.kind === "Dot" && s.type === "Ice"),
    ).toBe(false);

    tickDots(team, () => {});
    expect(isFrozen(front)).toBe(false);
  });

  it("soft freeze blocks attack once then clears; heals still work", () => {
    const team = makeColossusTeam(5);
    const front = soldierAt(team, 1)!;
    front.currentHp = 20;
    applySoftFreeze(front);
    expect(isSoftFrozen(front)).toBe(true);
    expect(healSoldier(front, 5)).toBe(5);
    expect(front.currentHp).toBe(25);

    const result = resolveSpecialistAction(
      team,
      front,
      { token: "A", soldierId: front.id, effectiveGrade: "A" },
      () => 0.5,
      () => {},
    );
    expect(result.acted).toBe(false);
    expect(result.skipReason).toBe("frozen");
    expect(isFrozen(front)).toBe(false);
  });

  it("soft freeze does not run SpreadingFrost chain", () => {
    const team = makeColossusTeam(6);
    const front = soldierAt(team, 1)!;
    applySoftFreeze(front);
    const logs: string[] = [];
    tickFrozenChain(team, (t) => logs.push(t));
    expect(logs.some((l) => l.includes("spreads") || l.includes("SHATTER"))).toBe(
      false,
    );
    expect(isSoftFrozen(front)).toBe(true);
    expect(isFrozen(soldierAt(team, 2)!)).toBe(false);
  });
});
