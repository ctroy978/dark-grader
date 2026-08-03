import type { Archetype } from "./types.js";

/**
 * Healer and Runesinger may only occupy the back seat of the line.
 * That single slot also prevents dual-support / Healer+Runesinger overlap.
 */
export function isBacklineSupportArchetype(archetype: Archetype): boolean {
  return archetype === "Healer" || archetype === "Runesinger";
}

/** Position number (1–6) of the back seat for a formed line of this size. */
export function backlineSupportSeat(partySize: number): number {
  return Math.max(1, Math.min(6, partySize));
}

/**
 * Validate party order: index 0 = position 1 (front), last = back.
 * Returns an error message, or null if OK.
 */
export function partyFormationError(
  orderedFrontToBack: readonly { archetype: Archetype }[],
): string | null {
  const n = orderedFrontToBack.length;
  if (n === 0) return null;
  const last = n - 1;
  const seat = backlineSupportSeat(n);
  for (let i = 0; i < n; i++) {
    const a = orderedFrontToBack[i]!.archetype;
    if (!isBacklineSupportArchetype(a)) continue;
    if (i !== last) {
      return `${a === "Healer" ? "Healer" : "Runesinger"} can only stand in the back seat (position ${seat}).`;
    }
  }
  return null;
}

/**
 * Move Healer/Runesinger to the end. If more than one support is present,
 * keep only the last one listed (others drop out of the returned list).
 */
export function withBacklineSupportLast<
  T extends { archetype: Archetype },
>(soldiers: readonly T[]): T[] {
  const supports = soldiers.filter((s) =>
    isBacklineSupportArchetype(s.archetype),
  );
  const rest = soldiers.filter((s) => !isBacklineSupportArchetype(s.archetype));
  if (supports.length === 0) return [...soldiers];
  return [...rest, supports[supports.length - 1]!];
}
