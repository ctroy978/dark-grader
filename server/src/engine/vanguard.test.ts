import { describe, expect, it } from "vitest";
import type { Grade, TeamState } from "@dungeon-grades/shared";
import { createTeam, selectParty, startFight } from "./combat.js";
import { livingParty } from "./damage.js";
import { resolveSpecialistAction } from "./specialists.js";

const POOL: Grade[] = "AAAABBBBBBCCCCCCDDFF".split("") as Grade[];

function vanguardTeam(): TeamState {
  const team = createTeam("vg-t", "VGT", "Vanguard", 21);
  const vg = team.roster.find((s) => s.archetype === "Vanguard")!;
  const rest = team.roster
    .filter((s) => s.alive && s.id !== vg.id)
    .slice(0, 5)
    .map((s) => s.id);
  selectParty(team, [vg.id, ...rest]);
  startFight(team, "ash_wraith", POOL);
  for (const s of livingParty(team)) {
    s.block = 0;
  }
  return team;
}

describe("Vanguard personal block only", () => {
  it("A grants personal block to self only, not allies", () => {
    const team = vanguardTeam();
    const vg = livingParty(team).find((s) => s.archetype === "Vanguard")!;
    const ally = livingParty(team).find((s) => s.id !== vg.id)!;
    const allyBlockBefore = ally.block;

    resolveSpecialistAction(
      team,
      vg,
      { token: "A", soldierId: vg.id, effectiveGrade: "A" },
      () => 0.5,
      () => {},
    );

    expect(vg.block).toBe(6);
    expect(ally.block).toBe(allyBlockBefore);
  });

  it("B and C also stay self-only", () => {
    const team = vanguardTeam();
    const vg = livingParty(team).find((s) => s.archetype === "Vanguard")!;
    for (const grade of ["B", "C"] as const) {
      for (const s of livingParty(team)) s.block = 0;
      resolveSpecialistAction(
        team,
        vg,
        { token: grade, soldierId: vg.id, effectiveGrade: grade },
        () => 0.5,
        () => {},
      );
      const expected = grade === "B" ? 4 : 3;
      expect(vg.block).toBe(expected);
      for (const s of livingParty(team)) {
        if (s.id !== vg.id) expect(s.block).toBe(0);
      }
    }
  });
});
