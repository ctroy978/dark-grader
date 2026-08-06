import { describe, expect, it } from "vitest";
import {
  HEALER_HEAL,
  NECRO_LIFE_POWER,
  type Grade,
  type TeamState,
} from "@dungeon-grades/shared";
import { createTeam, selectParty, startFight } from "./combat.js";
import { livingParty } from "./damage.js";
import { applyDot } from "./dots.js";
import { resolveSpecialistAction } from "./specialists.js";

const POOL: Grade[] = "AAAABBBBBBCCCCCCDDFF".split("") as Grade[];

function supportParty(withHealer: boolean): TeamState {
  const team = createTeam("lp-t", "LPT", "Life", 7);
  const tank = team.roster.find((s) => s.archetype === "Vanguard")!;
  const necro = team.roster.find((s) => s.archetype === "Necromancer")!;
  const support = team.roster.find(
    (s) => s.archetype === (withHealer ? "Healer" : "Lifebinder"),
  )!;
  const rest = team.roster
    .filter(
      (s) =>
        s.alive &&
        s.id !== tank.id &&
        s.id !== necro.id &&
        s.id !== support.id &&
        s.archetype !== "Healer" &&
        s.archetype !== "Lifebinder",
    )
    .slice(0, 3)
    .map((s) => s.id);
  const ids = [tank.id, ...rest.slice(0, 3), necro.id, support.id].slice(0, 6);
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
    const after = livingParty(team).filter((s) => s.id !== necro.id);
    after.forEach((s, i) => {
      expect(s.currentHp).toBe(allyHp[i]);
    });
  });

  it("empowers Lifebinder when no Healer is on the line", () => {
    const team = supportParty(false);
    const necro = livingParty(team).find((s) => s.archetype === "Necromancer")!;
    const lifebinder = livingParty(team).find(
      (s) => s.archetype === "Lifebinder",
    )!;

    resolveSpecialistAction(
      team,
      necro,
      { token: "B", soldierId: necro.id, effectiveGrade: "B" },
      () => 0.5,
      () => {},
    );

    const lp = lifebinder.statuses.find((st) => st.kind === "LifePower");
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
    expect(powers[0]).toMatchObject({
      kind: "LifePower",
      bonus: NECRO_LIFE_POWER.C,
    });
  });

  it("charged Healer: base heal on all; dirty seats also wash; purple only on clean", () => {
    const team = supportParty(true);
    const healer = livingParty(team).find((s) => s.archetype === "Healer")!;
    healer.statuses.push({ kind: "LifePower", bonus: 6 });
    const living = livingParty(team);
    for (const s of living) {
      s.currentHp = 10;
      s.statuses = s.statuses.filter((st) => st.kind !== "Dot");
    }
    const dirty = living.filter((s) => s.id !== healer.id).slice(0, 2);
    for (const s of dirty) {
      applyDot(s, "Poison", 1, undefined, true);
      applyDot(s, "Fire", 1, undefined, true);
    }
    const clean = living.filter((s) => !dirty.some((d) => d.id === s.id));
    const dirtyIds = new Set(dirty.map((s) => s.id));

    const result = resolveSpecialistAction(
      team,
      healer,
      { token: "A", soldierId: healer.id, effectiveGrade: "A" },
      () => 0.5,
      () => {},
    );

    for (const s of livingParty(team)) {
      // Base triage heal always applies — Life Power does not cancel it.
      expect(s.currentHp).toBe(10 + HEALER_HEAL.A);
      if (dirtyIds.has(s.id)) {
        expect(
          s.statuses.some(
            (st) =>
              st.kind === "Dot" && (st.type === "Poison" || st.type === "Fire"),
          ),
        ).toBe(false);
      }
    }

    // Purple bonus seats = clean only; washed seats get FX only.
    expect(result.lifePowerFollowUp?.healTargetIds.sort()).toEqual(
      clean.map((s) => s.id).sort(),
    );
    expect(result.lifePowerFollowUp?.cleanseTargetIds.sort()).toEqual(
      dirty.map((s) => s.id).sort(),
    );
    expect(result.lifePowerFollowUp?.bonus).toBe(6);
  });

  it("uncharged Healer does not cleanse Fire/Poison", () => {
    const team = supportParty(true);
    const healer = livingParty(team).find((s) => s.archetype === "Healer")!;
    const ally = livingParty(team).find((s) => s.id !== healer.id)!;
    ally.currentHp = 10;
    applyDot(ally, "Poison", 1, undefined, true);

    resolveSpecialistAction(
      team,
      healer,
      { token: "A", soldierId: healer.id, effectiveGrade: "A" },
      () => 0.5,
      () => {},
    );

    expect(
      ally.statuses.some((st) => st.kind === "Dot" && st.type === "Poison"),
    ).toBe(true);
    expect(ally.currentHp).toBe(10 + HEALER_HEAL.A);
  });

  it("Necro then Healer on clean line: base heal + purple bonus", () => {
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

    const r = resolveSpecialistAction(
      team,
      healer,
      { token: "A", soldierId: healer.id, effectiveGrade: "A" },
      () => 0.5,
      () => {},
    );
    expect(r.lifePowerFollowUp?.bonus).toBe(6);
    expect(r.lifePowerFollowUp?.cleanseTargetIds).toEqual([]);

    if (r.lifePowerFollowUp) {
      healer.statuses = healer.statuses.filter((st) => st.kind !== "LifePower");
      for (const id of r.lifePowerFollowUp.healTargetIds) {
        const t = team.roster.find((s) => s.id === id)!;
        t.currentHp = Math.min(
          t.maxHp,
          t.currentHp + r.lifePowerFollowUp.bonus,
        );
      }
    }

    for (const prev of before) {
      const s = team.roster.find((x) => x.id === prev.id)!;
      if (!s.alive) continue;
      const expected = Math.min(s.maxHp, prev.hp + HEALER_HEAL.A + 6);
      expect(s.currentHp).toBe(expected);
    }
  });

  it("charged Lifebinder: renewal still applies; dirty seats wash; purple only on clean", () => {
    const team = supportParty(false);
    const necro = livingParty(team).find((s) => s.archetype === "Necromancer")!;
    const lifebinder = livingParty(team).find(
      (s) => s.archetype === "Lifebinder",
    )!;
    resolveSpecialistAction(
      team,
      necro,
      { token: "B", soldierId: necro.id, effectiveGrade: "B" },
      () => 0.5,
      () => {},
    );
    const front = livingParty(team).filter(
      (s) => s.position != null && s.position <= 3,
    );
    for (const s of front) {
      applyDot(s, "Poison", 1, undefined, true);
      s.statuses = s.statuses.filter((st) => st.kind !== "Hot");
    }

    // B = front renewal
    const result = resolveSpecialistAction(
      team,
      lifebinder,
      { token: "B", soldierId: lifebinder.id, effectiveGrade: "B" },
      () => 0.5,
      () => {},
    );

    for (const s of front) {
      expect(
        s.statuses.some((st) => st.kind === "Dot" && st.type === "Poison"),
      ).toBe(false);
      // Base renewal always lands — Life Power does not cancel it.
      expect(s.statuses.some((st) => st.kind === "Hot")).toBe(true);
    }
    expect(result.lifePowerFollowUp?.cleanseTargetIds.length).toBe(
      front.length,
    );
    // All front were dirty → no purple bonus seats.
    expect(result.lifePowerFollowUp?.healTargetIds.length).toBe(0);
  });
});
