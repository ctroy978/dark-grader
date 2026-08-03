import { describe, expect, it } from "vitest";
import {
  HEALER_HEAL,
  NECRO_LIFE_POWER,
  type Grade,
  type TeamState,
} from "@dungeon-grades/shared";
import { createTeam, selectParty, startFight } from "./combat.js";
import { livingParty } from "./damage.js";
import { resolveSpecialistAction } from "./specialists.js";

const POOL: Grade[] = "AAAABBBBBBCCCCCCDDFF".split("") as Grade[];

function supportParty(withHealer: boolean): TeamState {
  const team = createTeam("lp-t", "LPT", "Life", 7);
  const tank = team.roster.find((s) => s.archetype === "Vanguard")!;
  const necro = team.roster.find((s) => s.archetype === "Necromancer")!;
  const support = team.roster.find(
    (s) => s.archetype === (withHealer ? "Healer" : "Runesinger"),
  )!;
  const rest = team.roster
    .filter(
      (s) =>
        s.alive &&
        s.id !== tank.id &&
        s.id !== necro.id &&
        s.id !== support.id &&
        s.archetype !== "Healer" &&
        s.archetype !== "Runesinger",
    )
    .slice(0, 3)
    .map((s) => s.id);
  // Back seat = support
  selectParty(team, [tank.id, ...rest, necro.id, support.id].slice(0, 6));
  // Ensure necro + support in party
  const ids = [
    tank.id,
    ...rest.slice(0, 3),
    necro.id,
    support.id,
  ].slice(0, 6);
  selectParty(team, ids);
  startFight(team, "moss_grub", POOL);
  for (const s of livingParty(team)) {
    s.block = 0;
    s.statuses = [];
    s.currentHp = Math.max(5, Math.floor(s.maxHp / 2));
  }
  return team;
}

describe("Necromancer Life Power", () => {
  it("A applies Life Power +6 to living Healer (no direct ally heal)", () => {
    const team = supportParty(true);
    const necro = livingParty(team).find((s) => s.archetype === "Necromancer")!;
    const healer = livingParty(team).find((s) => s.archetype === "Healer")!;
    const allyHp = livingParty(team)
      .filter((s) => s.id !== necro.id)
      .map((s) => s.currentHp);

    resolveSpecialistAction(
      team,
      necro,
      { token: "A", soldierId: necro.id, effectiveGrade: "A" },
      () => 0.5,
      () => {},
    );

    const lp = healer.statuses.find((st) => st.kind === "LifePower");
    expect(lp?.kind).toBe("LifePower");
    if (lp?.kind === "LifePower") {
      expect(lp.bonus).toBe(NECRO_LIFE_POWER.A);
    }
    // No direct ally heal from Necro
    const after = livingParty(team).filter((s) => s.id !== necro.id);
    after.forEach((s, i) => {
      // boss drain may not change ally HP
      expect(s.currentHp).toBe(allyHp[i]);
    });
  });

  it("empowers Runesinger when no Healer on the line", () => {
    const team = supportParty(false);
    const necro = livingParty(team).find((s) => s.archetype === "Necromancer")!;
    const rs = livingParty(team).find((s) => s.archetype === "Runesinger")!;

    resolveSpecialistAction(
      team,
      necro,
      { token: "B", soldierId: necro.id, effectiveGrade: "B" },
      () => 0.5,
      () => {},
    );

    const lp = rs.statuses.find((st) => st.kind === "LifePower");
    expect(lp?.kind).toBe("LifePower");
    if (lp?.kind === "LifePower") expect(lp.bonus).toBe(NECRO_LIFE_POWER.B);
  });

  it("does not stack — second apply replaces bonus", () => {
    const team = supportParty(true);
    const necro = livingParty(team).find((s) => s.archetype === "Necromancer")!;
    const healer = livingParty(team).find((s) => s.archetype === "Healer")!;

    resolveSpecialistAction(
      team,
      necro,
      { token: "A", soldierId: necro.id, effectiveGrade: "A" },
      () => 0.5,
      () => {},
    );
    resolveSpecialistAction(
      team,
      necro,
      { token: "C", soldierId: necro.id, effectiveGrade: "C" },
      () => 0.5,
      () => {},
    );

    const powers = healer.statuses.filter((st) => st.kind === "LifePower");
    expect(powers).toHaveLength(1);
    expect(powers[0]).toMatchObject({ kind: "LifePower", bonus: NECRO_LIFE_POWER.C });
  });

  it("Healer A schedules Life Power follow-up; stays until used", () => {
    const team = supportParty(true);
    const healer = livingParty(team).find((s) => s.archetype === "Healer")!;
    healer.statuses.push({ kind: "LifePower", bonus: 6 });
    for (const s of livingParty(team)) {
      s.currentHp = 10;
    }

    const result = resolveSpecialistAction(
      team,
      healer,
      { token: "A", soldierId: healer.id, effectiveGrade: "A" },
      () => 0.5,
      () => {},
    );

    // Base heal applied; Life Power still on until combat follow-up consumes it
    expect(result.lifePowerFollowUp).toEqual({
      bonus: 6,
      targetIds: expect.arrayContaining(livingParty(team).map((s) => s.id)),
      supportId: healer.id,
    });
    expect(healer.statuses.some((st) => st.kind === "LifePower")).toBe(true);

    // Base amounts landed
    for (const s of livingParty(team)) {
      expect(s.currentHp).toBe(10 + HEALER_HEAL.A);
    }
  });

  it("Necro then Healer: base heal + purple Life Power totals", () => {
    const team = supportParty(true);
    const necro = livingParty(team).find((s) => s.archetype === "Necromancer")!;
    const healer = livingParty(team).find((s) => s.archetype === "Healer")!;
    const before = livingParty(team).map((s) => ({
      id: s.id,
      hp: s.currentHp,
    }));

    resolveSpecialistAction(
      team,
      necro,
      { token: "A", soldierId: necro.id, effectiveGrade: "A" },
      () => 0.5,
      () => {},
    );
    expect(healer.statuses.some((st) => st.kind === "LifePower")).toBe(true);

    const r = resolveSpecialistAction(
      team,
      healer,
      { token: "A", soldierId: healer.id, effectiveGrade: "A" },
      () => 0.5,
      () => {},
    );
    expect(r.lifePowerFollowUp?.bonus).toBe(6);

    // Apply follow-up as combat.ts would
    if (r.lifePowerFollowUp) {
      healer.statuses = healer.statuses.filter((st) => st.kind !== "LifePower");
      for (const id of r.lifePowerFollowUp.targetIds) {
        const t = team.roster.find((s) => s.id === id)!;
        t.currentHp = Math.min(
          t.maxHp,
          t.currentHp + r.lifePowerFollowUp.bonus,
        );
      }
    }

    expect(healer.statuses.some((st) => st.kind === "LifePower")).toBe(false);
    for (const prev of before) {
      const s = team.roster.find((x) => x.id === prev.id)!;
      if (!s.alive) continue;
      const expected = Math.min(s.maxHp, prev.hp + HEALER_HEAL.A + 6);
      expect(s.currentHp).toBe(expected);
    }
  });
});
