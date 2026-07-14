import {
  createRng,
  shuffleInPlace,
  tokensForLivingCount,
  type Grade,
  type TeamState,
  type TokenPool,
} from "@dungeon-grades/shared";
import { livingParty } from "./damage.js";

export function createTokenPool(grades: Grade[], random: () => number): TokenPool {
  const remaining = [...grades];
  shuffleInPlace(remaining, random);
  return { remaining, discard: [] };
}

/**
 * Draw tokens from the fight pool (reshuffle discard when empty).
 */
export function drawTokens(
  pool: TokenPool,
  count: number,
  random: () => number,
): Grade[] {
  const drawn: Grade[] = [];
  for (let i = 0; i < count; i++) {
    if (pool.remaining.length === 0) {
      if (pool.discard.length === 0) break;
      pool.remaining = shuffleInPlace([...pool.discard], random);
      pool.discard = [];
    }
    const t = pool.remaining.shift();
    if (t) {
      drawn.push(t);
    }
  }
  return drawn;
}

/**
 * How many tokens drop this round based on living party size.
 * Slime reduces by 1 more (min 1 while anyone lives).
 */
export function tokenDropCount(team: TeamState): {
  count: number;
  living: number;
  slimeReduced: boolean;
} {
  const living = livingParty(team).length;
  let count = tokensForLivingCount(living);
  let slimeReduced = false;
  if (team.slimeSlowNextRound && count > 0) {
    const before = count;
    count = Math.max(living > 0 ? 1 : 0, count - 1);
    slimeReduced = count < before;
  }
  return { count, living, slimeReduced };
}

/**
 * Telegraph the next drop: pull grades out of the pool into pendingTokens.
 */
export function preparePendingTokens(
  team: TeamState,
  random: () => number,
  count: number,
): Grade[] {
  const drawn = drawTokens(team.tokens, count, random);
  team.pendingTokens = drawn;
  return drawn;
}

/** Commit pending into discard after they resolve (claims done). */
export function consumePendingTokens(team: TeamState): Grade[] {
  const dropped = [...(team.pendingTokens ?? [])];
  for (const g of dropped) {
    team.tokens.discard.push(g);
  }
  team.pendingTokens = [];
  return dropped;
}

/** UI cloud: only the telegraphed drop. */
export function cloudPreview(team: TeamState): Grade[] {
  return [...(team.pendingTokens ?? [])];
}

/** Seeded helper for prepare after a round number is known */
export function preparePendingForRound(team: TeamState): {
  tokens: Grade[];
  living: number;
  slimeReduced: boolean;
} {
  const random = createRng(
    team.rngSeed + team.round * 9001 + team.roomIndex * 17 + 3,
  );
  const { count, living, slimeReduced } = tokenDropCount(team);
  if (team.slimeSlowNextRound) {
    team.slimeSlowNextRound = false;
  }
  const tokens = preparePendingTokens(team, random, count);
  return { tokens, living, slimeReduced };
}
