import {
  ADJACENT_WEIGHT,
  MAGNET_WEIGHT,
  OTHER_WEIGHT,
  PARTY_SIZE,
} from "./balance.js";
import type { Position } from "./types.js";

/** Circular adjacency on a 1–6 line. */
export function adjacentPositions(pos: Position): [Position, Position] {
  const left = (pos === 1 ? PARTY_SIZE : pos - 1) as Position;
  const right = (pos === PARTY_SIZE ? 1 : pos + 1) as Position;
  return [left, right];
}

/**
 * Claim probability for each party position given magnet placement.
 * Sums to 1.0 for a full party of 6.
 */
export function claimWeights(magnet: Position): number[] {
  const weights = new Array(PARTY_SIZE).fill(OTHER_WEIGHT);
  weights[magnet - 1] = MAGNET_WEIGHT;
  const [a, b] = adjacentPositions(magnet);
  weights[a - 1] = ADJACENT_WEIGHT;
  weights[b - 1] = ADJACENT_WEIGHT;
  return weights;
}

/**
 * Pick a party position index (0–5) using weights, zeroing out ineligible slots.
 * Returns null if no eligible soldier remains.
 */
export function pickWeightedIndex(
  weights: number[],
  eligible: boolean[],
  random: () => number,
): number | null {
  let total = 0;
  const effective = weights.map((w, i) => {
    const v = eligible[i] ? w : 0;
    total += v;
    return v;
  });
  if (total <= 0) return null;

  let roll = random() * total;
  for (let i = 0; i < effective.length; i++) {
    roll -= effective[i];
    if (roll <= 0) return i;
  }
  // Floating-point edge: last eligible
  for (let i = effective.length - 1; i >= 0; i--) {
    if (effective[i] > 0) return i;
  }
  return null;
}
