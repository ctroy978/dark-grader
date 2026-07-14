import { describe, expect, it } from "vitest";
import { claimWeights, pickWeightedIndex, adjacentPositions } from "./magnet.js";
import { createRng } from "./rng.js";

describe("magnet adjacency", () => {
  it("wraps positions 1 and 6", () => {
    expect(adjacentPositions(1)).toEqual([6, 2]);
    expect(adjacentPositions(6)).toEqual([5, 1]);
    expect(adjacentPositions(3)).toEqual([2, 4]);
  });
});

describe("claim weights", () => {
  it("sums to 1.0", () => {
    for (let m = 1; m <= 6; m++) {
      const w = claimWeights(m as 1 | 2 | 3 | 4 | 5 | 6);
      const sum = w.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 10);
      expect(w[m - 1]).toBeCloseTo(0.3);
    }
  });
});

describe("pickWeightedIndex empirical distribution", () => {
  it("favors magnet position (~30%)", () => {
    const weights = claimWeights(3);
    const eligible = [true, true, true, true, true, true];
    const counts = new Array(6).fill(0);
    const random = createRng(42);
    const N = 50_000;
    for (let i = 0; i < N; i++) {
      const idx = pickWeightedIndex(weights, eligible, random);
      expect(idx).not.toBeNull();
      counts[idx!]++;
    }
    // magnet at 3 → index 2
    expect(counts[2] / N).toBeGreaterThan(0.28);
    expect(counts[2] / N).toBeLessThan(0.32);
    // adjacent 2 and 4
    expect(counts[1] / N).toBeGreaterThan(0.18);
    expect(counts[1] / N).toBeLessThan(0.22);
  });

  it("returns null when nobody eligible", () => {
    const weights = claimWeights(1);
    const eligible = [false, false, false, false, false, false];
    expect(pickWeightedIndex(weights, eligible, () => 0.5)).toBeNull();
  });
});
