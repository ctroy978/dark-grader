import { describe, expect, it } from "vitest";
import { HEALER_HEAL, type Grade } from "@dungeon-grades/shared";
import { createTeam, selectParty, startFight } from "./combat.js";
import { livingParty } from "./damage.js";
import { resolveSpecialistAction } from "./specialists.js";

const POOL: Grade[] = "AAAABBBBBBCCCCCCDDFF".split("") as Grade[];

function healerTeam() {
  const team = createTeam("hl-t", "HLT", "Heal", 3);
  const healer = team.roster.find((s) => s.archetype === "Healer")!;
  const rest = team.roster
    .filter(
      (s) =>
        s.alive &&
        s.id !== healer.id &&
        s.archetype !== "Healer" &&
        s.archetype !== "Runesinger",
    )
    .slice(0, 5)
    .map((s) => s.id);
  selectParty(team, [...rest, healer.id]);
  startFight(team, "moss_grub", POOL);
  const living = livingParty(team);
  // Distinct HP so lowest sort is stable
  living.forEach((s, i) => {
    s.currentHp = 5 + i * 3;
    s.block = 0;
    s.statuses = [];
  });
  return { team, healer: livingParty(team).find((s) => s.archetype === "Healer")! };
}

describe("Healer triage ladder", () => {
  it("A heals all living by HEALER_HEAL.A", () => {
    const { team, healer } = healerTeam();
    const before = Object.fromEntries(
      livingParty(team).map((s) => [s.id, s.currentHp]),
    );
    resolveSpecialistAction(
      team,
      healer,
      { token: "A", soldierId: healer.id, effectiveGrade: "A" },
      () => 0.5,
      () => {},
    );
    for (const s of livingParty(team)) {
      expect(s.currentHp).toBe(
        Math.min(s.maxHp, before[s.id]! + HEALER_HEAL.A),
      );
    }
  });

  it("B heals exactly the two lowest", () => {
    const { team, healer } = healerTeam();
    const sorted = livingParty(team)
      .slice()
      .sort(
        (a, b) =>
          a.currentHp - b.currentHp ||
          (a.position ?? 99) - (b.position ?? 99),
      );
    const top2 = new Set(sorted.slice(0, 2).map((s) => s.id));
    const before = Object.fromEntries(
      livingParty(team).map((s) => [s.id, s.currentHp]),
    );

    resolveSpecialistAction(
      team,
      healer,
      { token: "B", soldierId: healer.id, effectiveGrade: "B" },
      () => 0.5,
      () => {},
    );

    for (const s of livingParty(team)) {
      if (top2.has(s.id)) {
        expect(s.currentHp).toBe(
          Math.min(s.maxHp, before[s.id]! + HEALER_HEAL.B),
        );
      } else {
        expect(s.currentHp).toBe(before[s.id]);
      }
    }
  });

  it("C heals only the single lowest", () => {
    const { team, healer } = healerTeam();
    const lowest = livingParty(team)
      .slice()
      .sort(
        (a, b) =>
          a.currentHp - b.currentHp ||
          (a.position ?? 99) - (b.position ?? 99),
      )[0]!;
    const before = Object.fromEntries(
      livingParty(team).map((s) => [s.id, s.currentHp]),
    );

    resolveSpecialistAction(
      team,
      healer,
      { token: "C", soldierId: healer.id, effectiveGrade: "C" },
      () => 0.5,
      () => {},
    );

    for (const s of livingParty(team)) {
      if (s.id === lowest.id) {
        expect(s.currentHp).toBe(
          Math.min(s.maxHp, before[s.id]! + HEALER_HEAL.C),
        );
      } else {
        expect(s.currentHp).toBe(before[s.id]);
      }
    }
  });

  it("D is a tiny full-party heal", () => {
    const { team, healer } = healerTeam();
    const before = Object.fromEntries(
      livingParty(team).map((s) => [s.id, s.currentHp]),
    );
    resolveSpecialistAction(
      team,
      healer,
      { token: "D", soldierId: healer.id, effectiveGrade: "D" },
      () => 0.5,
      () => {},
    );
    for (const s of livingParty(team)) {
      expect(s.currentHp).toBe(
        Math.min(s.maxHp, before[s.id]! + HEALER_HEAL.D),
      );
    }
    expect(HEALER_HEAL.D).toBeLessThan(HEALER_HEAL.A);
  });
});
