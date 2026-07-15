import { ADJACENT_WEIGHT, OTHER_WEIGHT, PARTY_SIZE } from "./balance.js";
import type { Position } from "./types.js";

/** Circular adjacency on a 1–6 line. */
export function adjacentPositions(pos: Position): [Position, Position] {
  const left = (pos === 1 ? PARTY_SIZE : pos - 1) as Position;
  const right = (pos === PARTY_SIZE ? 1 : pos + 1) as Position;
  return [left, right];
}

/**
 * Weights for residual tokens after the magnet soldier already claimed.
 * Magnet slot is 0 (they always get exactly one random token first).
 * Adjacent (circular) > other living slots. Relative ratio 2:1 (0.2 vs 0.1).
 */
export function proximityClaimWeights(magnet: Position): number[] {
  const weights = new Array(PARTY_SIZE).fill(OTHER_WEIGHT);
  weights[magnet - 1] = 0;
  const [a, b] = adjacentPositions(magnet);
  weights[a - 1] = ADJACENT_WEIGHT;
  weights[b - 1] = ADJACENT_WEIGHT;
  return weights;
}

/**
 * @deprecated Prefer proximityClaimWeights — magnet now always claims first.
 * Kept for any UI that still wants a full-line “who is near?” display.
 */
export function claimWeights(magnet: Position): number[] {
  return proximityClaimWeights(magnet);
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
