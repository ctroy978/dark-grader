import { describe, expect, it } from "vitest";
import type { Grade, TeamState } from "@dungeon-grades/shared";
import { createTeam, selectParty, startFight } from "./combat.js";
import { applyPartyDamage, livingParty } from "./damage.js";
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
    s.statuses = [];
  }
  return team;
}

describe("Vanguard Last Stand + personal block", () => {
  it("A grants Last Stand to all living and some personal block", () => {
    const team = vanguardTeam();
    const vg = livingParty(team).find((s) => s.archetype === "Vanguard")!;

    resolveSpecialistAction(
      team,
      vg,
      { token: "A", soldierId: vg.id, effectiveGrade: "A" },
      () => 0.5,
      () => {},
    );

    expect(vg.block).toBe(4);
    for (const s of livingParty(team)) {
      expect(s.statuses.some((st) => st.kind === "LastStand")).toBe(true);
    }
  });

  it("B grants Last Stand only to front half", () => {
    const team = vanguardTeam();
    const vg = livingParty(team).find((s) => s.archetype === "Vanguard")!;

    resolveSpecialistAction(
      team,
      vg,
      { token: "B", soldierId: vg.id, effectiveGrade: "B" },
      () => 0.5,
      () => {},
    );

    for (const s of livingParty(team)) {
      const has = s.statuses.some((st) => st.kind === "LastStand");
      if (s.position != null && s.position <= 3) {
        expect(has).toBe(true);
      } else {
        expect(has).toBe(false);
      }
    }
  });

  it("Last Stand saves a lethal hit once then is consumed", () => {
    const team = vanguardTeam();
    const ally = livingParty(team).find((s) => s.archetype !== "Vanguard")!;
    ally.statuses.push({ kind: "LastStand" });
    ally.currentHp = 5;
    ally.block = 0;
    team.partyShield = { active: false, remaining: 0, coveredIds: [] };

    const r = applyPartyDamage(ally, 50, team.partyShield);
    expect(ally.alive).toBe(true);
    expect(ally.currentHp).toBe(1);
    expect(ally.statuses.some((st) => st.kind === "LastStand")).toBe(false);
    expect(r.hpLost).toBe(4);

    const r2 = applyPartyDamage(ally, 50, team.partyShield);
    expect(ally.alive).toBe(false);
    expect(ally.currentHp).toBe(0);
    expect(r2.hpLost).toBe(1);
  });

  it("C stays self-only personal block (no Last Stand)", () => {
    const team = vanguardTeam();
    const vg = livingParty(team).find((s) => s.archetype === "Vanguard")!;
    for (const s of livingParty(team)) s.block = 0;

    resolveSpecialistAction(
      team,
      vg,
      { token: "C", soldierId: vg.id, effectiveGrade: "C" },
      () => 0.5,
      () => {},
    );

    expect(vg.block).toBe(3);
    for (const s of livingParty(team)) {
      expect(s.statuses.some((st) => st.kind === "LastStand")).toBe(false);
      if (s.id !== vg.id) expect(s.block).toBe(0);
    }
  });
});
