import { describe, expect, it } from "vitest";
import {
  RELIC_DEFINITIONS,
  RELIC_IDS,
  createEmptyItemState,
  relicBindingEligible,
  relicOffersForRoom,
  stableRelicSeed,
} from "./relics.js";

describe("relic rewards", () => {
  it("defines all relic content and asset paths", () => {
    for (const id of RELIC_IDS) {
      expect(RELIC_DEFINITIONS[id].name).toBeTruthy();
      expect(RELIC_DEFINITIONS[id].assetPath).toBe(`/art/relics/${id}.png`);
    }
  });

  it("creates empty versioned item state", () => {
    expect(createEmptyItemState()).toEqual({
      version: 1,
      catalogVersion: 1,
      pendingReward: null,
      rooms: [],
    });
  });

  it("generates stable, distinct classroom offers", () => {
    const first = relicOffersForRoom("period-1", 2, "cinder_herald");
    const second = relicOffersForRoom("period-1", 2, "cinder_herald");
    expect(first).toEqual(second);
    expect(new Set(first).size).toBe(3);
  });

  it("uses stable seed inputs", () => {
    expect(stableRelicSeed("same input")).toBe(stableRelicSeed("same input"));
    expect(stableRelicSeed("same input")).not.toBe(stableRelicSeed("other input"));
  });

  it("rejects a catalog with fewer than three distinct relics", () => {
    expect(() =>
      relicOffersForRoom("period-1", 0, "moss_grub", 1, [
        "bulwark_sigil",
        "bulwark_sigil",
        "ember_whetstone",
      ]),
    ).toThrow(/three distinct relics/i);
  });

  it("allows binding only to a living soldier with an empty slot", () => {
    expect(relicBindingEligible({ alive: true, relic: null })).toBe(true);
    expect(relicBindingEligible({ alive: false, relic: null })).toBe(false);
    expect(
      relicBindingEligible({
        alive: true,
        relic: {
          relicId: "bulwark_sigil",
          acquiredRoomIndex: 0,
          usedThisFight: false,
        },
      }),
    ).toBe(false);
  });
});
