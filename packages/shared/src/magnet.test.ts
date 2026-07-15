import { describe, expect, it } from "vitest";
import {
  proximityClaimWeights,
  pickWeightedIndex,
  adjacentPositions,
} from "./magnet.js";
import { createRng } from "./rng.js";

describe("magnet adjacency", () => {
  it("wraps positions 1 and 6", () => {
    expect(adjacentPositions(1)).toEqual([6, 2]);
    expect(adjacentPositions(6)).toEqual([5, 1]);
    expect(adjacentPositions(3)).toEqual([2, 4]);
  });
});

describe("proximity claim weights (residual tokens)", () => {
  it("zeros magnet; adjacent > other", () => {
    for (let m = 1; m <= 6; m++) {
      const w = proximityClaimWeights(m as 1 | 2 | 3 | 4 | 5 | 6);
      expect(w[m - 1]).toBe(0);
      const [a, b] = adjacentPositions(m as 1 | 2 | 3 | 4 | 5 | 6);
      expect(w[a - 1]).toBe(0.2);
      expect(w[b - 1]).toBe(0.2);
      // Non-adjacent, non-magnet slots
      for (let i = 0; i < 6; i++) {
        if (i === m - 1 || i === a - 1 || i === b - 1) continue;
        expect(w[i]).toBe(0.1);
      }
    }
  });
});

describe("pickWeightedIndex empirical distribution", () => {
  it("favors adjacent positions when magnet slot is ineligible", () => {
    const weights = proximityClaimWeights(3);
    // Magnet (index 2) already claimed — residual only
    const eligible = [true, true, false, true, true, true];
    const counts = new Array(6).fill(0);
    const random = createRng(42);
    const N = 50_000;
    for (let i = 0; i < N; i++) {
      const idx = pickWeightedIndex(weights, eligible, random);
      expect(idx).not.toBeNull();
      counts[idx!]++;
    }
    // adjacent 2 and 4 → indices 1 and 3; weights 0.2 each of total 0.7 ≈ 28.6%
    expect(counts[1] / N).toBeGreaterThan(0.26);
    expect(counts[1] / N).toBeLessThan(0.32);
    expect(counts[3] / N).toBeGreaterThan(0.26);
    expect(counts[3] / N).toBeLessThan(0.32);
    // magnet never
    expect(counts[2]).toBe(0);
    // far positions 0.1/0.7 ≈ 0.143
    expect(counts[0] / N).toBeGreaterThan(0.12);
    expect(counts[0] / N).toBeLessThan(0.18);
  });

  it("returns null when nobody eligible", () => {
    const weights = proximityClaimWeights(1);
    const eligible = [false, false, false, false, false, false];
    expect(pickWeightedIndex(weights, eligible, () => 0.5)).toBeNull();
  });
});
