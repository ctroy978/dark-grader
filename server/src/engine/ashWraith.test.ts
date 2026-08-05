import { describe, expect, it } from "vitest";
import type { Grade } from "@dungeon-grades/shared";
import { pickBossAttackId, resolveBossPhase } from "./bosses.js";
import {
  createTeam,
  selectParty,
  startFight,
} from "./combat.js";

const POOL: Grade[] = "AAAABBBBCCCCDDDFFF".split("") as Grade[];

function fieldAshParty() {
  const team = createTeam("ash1", "ASH1", "Ash test", 7);
  const ids = team.roster.slice(0, 6).map((s) => s.id);
  selectParty(team, ids);
  startFight(team, "ash_wraith", POOL);
  return team;
}

describe("Ash Wraith attack cadence", () => {
  it("never picks the same attack twice in a row", () => {
    const team = fieldAshParty();
    team.bossLastAttackId = "Cascade";
    for (let i = 0; i < 50; i++) {
      const id = pickBossAttackId(team, () => (i * 0.17 + 0.03) % 1);
      expect(id).not.toBe("Cascade");
    }
  });

  it("blocks each attack after it resolves (not only Cascade)", () => {
    const team = fieldAshParty();
    for (const last of [
      "FrontSlam",
      "LineAttack",
      "CrushMagnet",
      "PoisonCloud",
      "Regenerate",
      "Cascade",
    ]) {
      team.bossLastAttackId = last;
      for (let i = 0; i < 20; i++) {
        const id = pickBossAttackId(team, () => (i * 0.13 + 0.05) % 1);
        expect(id).not.toBe(last);
      }
    }
  });

  it("records last attack after resolveBossPhase", () => {
    const team = fieldAshParty();
    team.pendingBossAttackId = "Cascade";
    resolveBossPhase(team, () => 0.5, () => {});
    expect(team.bossLastAttackId).toBe("Cascade");

    const next = pickBossAttackId(team, () => 0.01);
    expect(next).not.toBe("Cascade");
  });

  it("uses the Ash-specific attack name in combat logs", () => {
    const team = fieldAshParty();
    team.pendingBossAttackId = "FrontSlam";
    const logs: string[] = [];

    resolveBossPhase(team, () => 0.5, (text) => logs.push(text));

    expect(logs.some((text) => text.includes("uses Hammerfall!"))).toBe(true);
    expect(logs.some((text) => text.includes("uses Front Slam!"))).toBe(false);
  });

  it("allows Cascade again after a different attack", () => {
    const team = fieldAshParty();
    team.bossLastAttackId = "FrontSlam";
    // Bias RNG toward Cascade (weight 4 of remaining 13 after FrontSlam zeroed)
    const ids = new Set<string>();
    for (let i = 0; i < 80; i++) {
      ids.add(pickBossAttackId(team, () => (i * 0.11) % 1));
    }
    expect(ids.has("Cascade")).toBe(true);
    expect(ids.has("FrontSlam")).toBe(false);
  });
});
