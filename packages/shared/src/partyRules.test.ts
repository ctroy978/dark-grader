import { describe, expect, it } from "vitest";
import {
  backlineHealerSeat,
  isBacklineHealerArchetype,
  largestLegalPartySize,
  partyFormationError,
  withBacklineHealerLast,
} from "./partyRules.js";

describe("partyRules — backline healer seat", () => {
  it("flags Healer and Lifebinder but not Runesinger", () => {
    expect(isBacklineHealerArchetype("Healer")).toBe(true);
    expect(isBacklineHealerArchetype("Lifebinder")).toBe(true);
    expect(isBacklineHealerArchetype("Runesinger")).toBe(false);
    expect(isBacklineHealerArchetype("Vanguard")).toBe(false);
  });

  it("allows a backline healer only in the last seat", () => {
    expect(
      partyFormationError([
        { archetype: "Vanguard" },
        { archetype: "ShieldMaiden" },
        { archetype: "FireMage" },
        { archetype: "Archer" },
        { archetype: "Runesinger" },
        { archetype: "Lifebinder" },
      ]),
    ).toBeNull();
    expect(
      partyFormationError([
        { archetype: "Vanguard" },
        { archetype: "Lifebinder" },
        { archetype: "Archer" },
        { archetype: "FireMage" },
        { archetype: "Thundercaller" },
        { archetype: "Spearman" },
      ]),
    ).toMatch(/back seat/);
  });

  it("rejects Healer and Lifebinder together", () => {
    expect(
      partyFormationError([
        { archetype: "Vanguard" },
        { archetype: "ShieldMaiden" },
        { archetype: "FireMage" },
        { archetype: "Archer" },
        { archetype: "Healer" },
        { archetype: "Lifebinder" },
      ]),
    ).toMatch(/back seat/);
  });

  it("allows Runesinger in every seat", () => {
    for (let runeSeat = 0; runeSeat < 6; runeSeat++) {
      const line = [
        "Vanguard",
        "ShieldMaiden",
        "FireMage",
        "Archer",
        "Thundercaller",
        "Spearman",
      ].map((archetype) => ({ archetype })) as { archetype: import("./types.js").Archetype }[];
      line[runeSeat] = { archetype: "Runesinger" };
      expect(partyFormationError(line)).toBeNull();
    }
  });

  it("uses the current line size as the back seat", () => {
    expect(backlineHealerSeat(4)).toBe(4);
    expect(
      partyFormationError([
        { archetype: "Vanguard" },
        { archetype: "FireMage" },
        { archetype: "Runesinger" },
        { archetype: "Lifebinder" },
      ]),
    ).toBeNull();
  });

  it("calculates the largest legal understrength line", () => {
    expect(
      largestLegalPartySize([
        { archetype: "Vanguard" },
        { archetype: "FireMage" },
        { archetype: "Archer" },
        { archetype: "Runesinger" },
        { archetype: "Healer" },
        { archetype: "Lifebinder" },
      ]),
    ).toBe(5);
    expect(
      largestLegalPartySize([
        { archetype: "Healer" },
        { archetype: "Lifebinder" },
      ]),
    ).toBe(1);
  });

  it("moves and dedupes only backline healers", () => {
    const out = withBacklineHealerLast([
      { id: "h", archetype: "Healer" as const },
      { id: "v", archetype: "Vanguard" as const },
      { id: "r", archetype: "Runesinger" as const },
      { id: "l", archetype: "Lifebinder" as const },
    ]);
    expect(out.map((soldier) => soldier.id)).toEqual(["v", "r", "l"]);
  });
});
