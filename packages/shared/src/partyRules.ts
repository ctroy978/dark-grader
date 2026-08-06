import type { Archetype } from "./types.js";

/** Healer and Lifebinder are the two last-seat-only healing archetypes. */
export function isBacklineHealerArchetype(archetype: Archetype): boolean {
  return archetype === "Healer" || archetype === "Lifebinder";
}

/** Position number (1–6) of the back seat for a formed line of this size. */
export function backlineHealerSeat(partySize: number): number {
  return Math.max(1, Math.min(6, partySize));
}

/**
 * Largest legal line from a living roster. At most one Healer/Lifebinder may
 * deploy; every unrestricted-seat survivor remains required while under six.
 */
export function largestLegalPartySize(
  living: readonly { archetype: Archetype }[],
): number {
  const unrestricted = living.filter(
    (soldier) => !isBacklineHealerArchetype(soldier.archetype),
  ).length;
  const hasHealer = living.some((soldier) =>
    isBacklineHealerArchetype(soldier.archetype),
  );
  return Math.min(6, unrestricted + (hasHealer ? 1 : 0));
}

/**
 * Validate party order: index 0 = position 1 (front), last = back.
 * Returns an error message, or null if valid.
 */
export function partyFormationError(
  orderedFrontToBack: readonly { archetype: Archetype }[],
): string | null {
  const n = orderedFrontToBack.length;
  if (n === 0) return null;
  const last = n - 1;
  const seat = backlineHealerSeat(n);
  for (let i = 0; i < n; i++) {
    const archetype = orderedFrontToBack[i]!.archetype;
    if (!isBacklineHealerArchetype(archetype)) continue;
    if (i !== last) {
      return `${archetype} can only stand in the back seat (position ${seat}).`;
    }
  }
  return null;
}

/**
 * Move one Healer/Lifebinder to the end. If more than one is present, keep only
 * the last healer listed; Runesingers remain in their original any-seat order.
 */
export function withBacklineHealerLast<
  T extends { archetype: Archetype },
>(soldiers: readonly T[]): T[] {
  const healers = soldiers.filter((soldier) =>
    isBacklineHealerArchetype(soldier.archetype),
  );
  const rest = soldiers.filter(
    (soldier) => !isBacklineHealerArchetype(soldier.archetype),
  );
  if (healers.length === 0) return [...soldiers];
  return [...rest, healers[healers.length - 1]!];
}
