import { describe, expect, it } from "vitest";
import type { Grade } from "@dungeon-grades/shared";
import { createRng, tokensForLivingCount } from "@dungeon-grades/shared";
import {
  cloudPreview,
  consumePendingTokens,
  createTokenPool,
  preparePendingTokens,
  tokenDropCount,
} from "./tokens.js";
import { createTeam, selectParty, startFight } from "./combat.js";

describe("token telegraph", () => {
  it("pending tokens are exactly what gets consumed on drop", () => {
    const team = createTeam("t", "ABCDE", "T", 1);
    const pool: Grade[] = ["A", "B", "C", "D", "F", "A", "B", "C"];
    const random = createRng(99);
    team.tokens = createTokenPool(pool, random);
    const pending = preparePendingTokens(team, random, 3);
    expect(pending).toHaveLength(3);
    expect(team.pendingTokens).toEqual(pending);
    expect(team.tokens.discard).toHaveLength(0);
    expect(team.tokens.remaining.length).toBe(pool.length - 3);

    const dropped = consumePendingTokens(team);
    expect(dropped).toEqual(pending);
    expect(team.pendingTokens).toEqual([]);
    expect(team.tokens.discard).toEqual(pending);
  });

  it("cloud is only pending, never extra filler", () => {
    const team = createTeam("t2", "ABCDE", "T", 2);
    team.tokens = createTokenPool(["A", "B", "C", "D", "F"], createRng(1));
    team.pendingTokens = ["A", "F"];
    expect(cloudPreview(team)).toEqual(["A", "F"]);
  });
});

describe("tokens scale with living count", () => {
  it("matches floor(n/2) min 1", () => {
    expect(tokensForLivingCount(6)).toBe(3);
    expect(tokensForLivingCount(5)).toBe(2);
    expect(tokensForLivingCount(4)).toBe(2);
    expect(tokensForLivingCount(3)).toBe(1);
    expect(tokensForLivingCount(2)).toBe(1);
    expect(tokensForLivingCount(1)).toBe(1);
    expect(tokensForLivingCount(0)).toBe(0);
  });

  it("drop count uses living party size after deaths", () => {
    const team = createTeam("t3", "LIVE", "Live", 3);
    const pool = "AAAABBBBCCCCDDFF".split("") as Grade[];
    selectParty(team, [
      "vanguard_1",
      "vanguard_2",
      "firemage_1",
      "healer_1",
      "archer_1",
      "archer_2",
    ]);
    startFight(team, "ash_wraith", pool);
    // Kill half the party
    for (const s of team.roster) {
      if (s.position && s.position >= 4) {
        s.currentHp = 0;
        s.alive = false;
      }
    }
    // 3 living → 1 token
    const { count, living } = tokenDropCount(team);
    expect(living).toBe(3);
    expect(count).toBe(1);
  });
});
