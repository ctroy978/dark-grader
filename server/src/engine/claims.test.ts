import { describe, expect, it } from "vitest";
import type { Grade, Position } from "@dungeon-grades/shared";
import { createRng } from "@dungeon-grades/shared";
import {
  createTeam,
  placeMagnet,
  selectParty,
  startFight,
} from "./combat.js";
import { resolveClaims } from "./claims.js";

function prepTeam(magnet: Position) {
  const team = createTeam("claims", "CLM01", "Claims", 1);
  selectParty(team, [
    "vanguard_1",
    "shieldmaiden_1",
    "firemage_1",
    "archer_1",
    "thundercaller_1",
    "runesinger_1",
  ]);
  startFight(team, "ash_wraith", "AAAABBBBCCCCDDFF".split("") as Grade[]);
  placeMagnet(team, magnet);
  return team;
}

describe("resolveClaims — magnet guarantee", () => {
  it("always gives the magnet soldier exactly one of the drawn tokens", () => {
    const team = prepTeam(3);
    const magnetId = team.roster.find((s) => s.position === 3)!.id;
    const tokens: Grade[] = ["A", "F", "C"];
    const random = createRng(99);

    for (let i = 0; i < 40; i++) {
      const claims = resolveClaims(team, tokens, random);
      const magnetClaims = claims.filter((c) => c.soldierId === magnetId);
      expect(magnetClaims).toHaveLength(1);
      expect(tokens).toContain(magnetClaims[0]!.token);
      // At most one claim per soldier
      const ids = claims.map((c) => c.soldierId);
      expect(new Set(ids).size).toBe(ids.length);
      // All claim tokens come from the drop
      for (const c of claims) {
        expect(tokens).toContain(c.token);
      }
      expect(claims.length).toBe(Math.min(3, 6));
    }
  });

  it("distributes which grade the magnet gets across the drop (random)", () => {
    const team = prepTeam(2);
    const magnetId = team.roster.find((s) => s.position === 2)!.id;
    const tokens: Grade[] = ["A", "B", "F"];
    const random = createRng(7);
    const counts: Record<Grade, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    const N = 300;
    for (let i = 0; i < N; i++) {
      const claims = resolveClaims(team, tokens, random);
      const m = claims.find((c) => c.soldierId === magnetId)!;
      counts[m.token]++;
    }
    // Each of the three grades should appear as magnet's token sometimes
    expect(counts.A).toBeGreaterThan(40);
    expect(counts.B).toBeGreaterThan(40);
    expect(counts.F).toBeGreaterThan(40);
  });

  it("never gives magnet a second residual token", () => {
    const team = prepTeam(1);
    const magnetId = team.roster.find((s) => s.position === 1)!.id;
    const random = createRng(1);
    for (let i = 0; i < 50; i++) {
      const claims = resolveClaims(team, ["A", "A", "A"], random);
      expect(claims.filter((c) => c.soldierId === magnetId)).toHaveLength(1);
    }
  });

  it("favors adjacent soldiers for residual tokens", () => {
    const team = prepTeam(3);
    const random = createRng(123);
    // pos 2 and 4 are adjacent to magnet 3
    const adjIds = new Set(
      team.roster
        .filter((s) => s.position === 2 || s.position === 4)
        .map((s) => s.id),
    );
    let adjHits = 0;
    let farHits = 0;
    const N = 400;
    for (let i = 0; i < N; i++) {
      const claims = resolveClaims(team, ["A", "B", "C"], random);
      for (const c of claims) {
        const s = team.roster.find((x) => x.id === c.soldierId)!;
        if (s.position === 3) continue; // magnet's guaranteed token
        if (adjIds.has(c.soldierId)) adjHits++;
        else farHits++;
      }
    }
    // 2 residual tokens per drop × N; adjacent should win more than half
    expect(adjHits).toBeGreaterThan(farHits);
  });
});
