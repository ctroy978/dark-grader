import { describe, expect, it } from "vitest";
import {
  LIFEBINDER_F_SELF_DAMAGE,
  LIFEBINDER_HOT_PER_TICK,
  LIFEBINDER_HOT_TICKS,
  MAX_HOT_STREAMS_PER_SOLDIER,
  type Grade,
  type TeamState,
} from "@dungeon-grades/shared";
import { createTeam, selectParty, startFight } from "./combat.js";
import { livingParty } from "./damage.js";
import { applyFrozen, tickDots, tickHots } from "./dots.js";
import { resolveSpecialistAction } from "./specialists.js";

const POOL: Grade[] = "AAAABBBBBBCCCCCCDDFF".split("") as Grade[];

function lifebinderTeam(seed = 13): TeamState {
  const team = createTeam("lb-t", "LIFE1", "Life", seed);
  selectParty(team, [
    "vanguard_1",
    "shieldmaiden_1",
    "firemage_1",
    "archer_1",
    "runesinger_1",
    "lifebinder_1",
  ]);
  startFight(team, "ash_wraith", POOL);
  for (const soldier of livingParty(team)) {
    soldier.block = 0;
    soldier.statuses = [];
    soldier.currentHp = soldier.maxHp;
  }
  return team;
}

function act(team: TeamState, grade: Grade) {
  const lifebinder = livingParty(team).find(
    (soldier) => soldier.archetype === "Lifebinder",
  )!;
  return resolveSpecialistAction(
    team,
    lifebinder,
    { token: grade, soldierId: lifebinder.id, effectiveGrade: grade },
    () => 0.5,
    () => {},
  );
}

describe("Lifebinder renewal HoT", () => {
  it("A renews the full living line", () => {
    const team = lifebinderTeam();
    act(team, "A");
    for (const soldier of livingParty(team)) {
      expect(soldier.statuses).toContainEqual({
        kind: "Hot",
        healPerTick: LIFEBINDER_HOT_PER_TICK.A,
        duration: LIFEBINDER_HOT_TICKS,
        source: "Lifebinder",
      });
    }
  });

  it("B renews front, C renews back, and D renews self", () => {
    const team = lifebinderTeam();
    act(team, "B");
    for (const soldier of livingParty(team)) {
      expect(soldier.statuses.some((status) => status.kind === "Hot")).toBe(
        (soldier.position ?? 99) <= 3,
      );
      soldier.statuses = [];
    }

    act(team, "C");
    for (const soldier of livingParty(team)) {
      expect(soldier.statuses.some((status) => status.kind === "Hot")).toBe(
        (soldier.position ?? 0) >= 4,
      );
      soldier.statuses = [];
    }

    act(team, "D");
    const lifebinder = livingParty(team).find(
      (soldier) => soldier.archetype === "Lifebinder",
    )!;
    expect(lifebinder.statuses.some((status) => status.kind === "Hot")).toBe(true);
    expect(
      livingParty(team)
        .filter((soldier) => soldier.id !== lifebinder.id)
        .every((soldier) =>
          soldier.statuses.every((status) => status.kind !== "Hot"),
        ),
    ).toBe(true);
  });

  it("F deals self-damage, applies no HoT, and preserves Life Power", () => {
    const team = lifebinderTeam();
    const lifebinder = livingParty(team).find(
      (soldier) => soldier.archetype === "Lifebinder",
    )!;
    lifebinder.statuses.push({ kind: "LifePower", bonus: 4 });
    const before = lifebinder.currentHp;
    act(team, "F");
    expect(before - lifebinder.currentHp).toBe(LIFEBINDER_F_SELF_DAMAGE);
    expect(lifebinder.statuses.some((status) => status.kind === "Hot")).toBe(false);
    expect(lifebinder.statuses).toContainEqual({ kind: "LifePower", bonus: 4 });
  });

  it("ticks over three phases, caps streams at two, and respects hard Frozen", () => {
    const team = lifebinderTeam();
    const lifebinder = livingParty(team).find(
      (soldier) => soldier.archetype === "Lifebinder",
    )!;
    lifebinder.currentHp = 10;
    act(team, "A");
    act(team, "A");
    act(team, "A");
    expect(
      lifebinder.statuses.filter((status) => status.kind === "Hot"),
    ).toHaveLength(MAX_HOT_STREAMS_PER_SOLDIER);

    applyFrozen(lifebinder, 6, 0);
    const before = lifebinder.currentHp;
    tickHots(team, () => {});
    expect(lifebinder.currentHp).toBe(before);
    lifebinder.statuses = lifebinder.statuses.filter(
      (status) => status.kind !== "Frozen",
    );
    tickHots(team, () => {});
    tickHots(team, () => {});
    expect(
      lifebinder.statuses.filter((status) => status.kind === "Hot"),
    ).toHaveLength(0);
  });

  it("ticks after the damaging DoT phase as a separate renewal beat", () => {
    const team = lifebinderTeam();
    const lifebinder = livingParty(team).find(
      (soldier) => soldier.archetype === "Lifebinder",
    )!;
    lifebinder.currentHp = 10;
    act(team, "D");
    const logs: string[] = [];
    tickDots(team, (text) => logs.push(text));
    expect(logs.some((line) => line.includes("[Renewal]"))).toBe(false);
    const healed = tickHots(team, (text) => logs.push(text));
    expect(logs.some((line) => line.includes("[Renewal]"))).toBe(true);
    expect(healed).toContain(lifebinder.id);
  });
});
