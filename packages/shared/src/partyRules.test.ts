import { describe, expect, it } from "vitest";
import {
  backlineSupportSeat,
  isBacklineSupportArchetype,
  partyFormationError,
  withBacklineSupportLast,
} from "./partyRules.js";

describe("partyRules — backline support seat", () => {
  it("flags Healer and Runesinger only", () => {
    expect(isBacklineSupportArchetype("Healer")).toBe(true);
    expect(isBacklineSupportArchetype("Runesinger")).toBe(true);
    expect(isBacklineSupportArchetype("Vanguard")).toBe(false);
  });

  it("allows support only in the last seat", () => {
    expect(
      partyFormationError([
        { archetype: "Vanguard" },
        { archetype: "ShieldMaiden" },
        { archetype: "FireMage" },
        { archetype: "Archer" },
        { archetype: "Thundercaller" },
        { archetype: "Healer" },
      ]),
    ).toBeNull();
    expect(
      partyFormationError([
        { archetype: "Vanguard" },
        { archetype: "Healer" },
        { archetype: "Archer" },
        { archetype: "FireMage" },
        { archetype: "Thundercaller" },
        { archetype: "Spearman" },
      ]),
    ).toMatch(/back seat/);
  });

  it("rejects two supports (second cannot be last)", () => {
    expect(
      partyFormationError([
        { archetype: "Vanguard" },
        { archetype: "ShieldMaiden" },
        { archetype: "FireMage" },
        { archetype: "Archer" },
        { archetype: "Healer" },
        { archetype: "Runesinger" },
      ]),
    ).toMatch(/back seat/);
  });

  it("understrength: last seat is party size", () => {
    expect(backlineSupportSeat(4)).toBe(4);
    expect(
      partyFormationError([
        { archetype: "Vanguard" },
        { archetype: "FireMage" },
        { archetype: "Archer" },
        { archetype: "Runesinger" },
      ]),
    ).toBeNull();
  });

  it("withBacklineSupportLast moves and dedupes supports", () => {
    const out = withBacklineSupportLast([
      { id: "h", archetype: "Healer" as const },
      { id: "v", archetype: "Vanguard" as const },
      { id: "r", archetype: "Runesinger" as const },
    ]);
    expect(out.map((s) => s.id)).toEqual(["v", "r"]);
  });
});
