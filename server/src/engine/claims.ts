import {
  proximityClaimWeights,
  pickWeightedIndex,
  type ClaimResult,
  type Grade,
  type Position,
  type Soldier,
  type TeamState,
  downgradeGrade,
} from "@dungeon-grades/shared";
import { livingParty } from "./damage.js";

function hasIce(soldier: Soldier): boolean {
  return soldier.statuses.some((s) => s.kind === "Dot" && s.type === "Ice");
}

function makeClaim(
  soldier: Soldier,
  token: Grade,
): ClaimResult {
  let effective: Grade = token;
  if (hasIce(soldier)) {
    effective = downgradeGrade(token);
  }
  return {
    token,
    soldierId: soldier.id,
    effectiveGrade: effective,
  };
}

/**
 * Resolve claims for drawn tokens.
 *
 * 1. Soldier under the magnet **always** gets one token; **which grade** is random
 *    among the drawn tokens.
 * 2. Remaining tokens go to other living party members, weighted by proximity
 *    to the magnet (adjacent higher, far lower). Magnet cannot claim a second.
 * 3. Each soldier still claims at most one token. Conflicts re-roll among eligible.
 */
export function resolveClaims(
  team: TeamState,
  tokens: Grade[],
  random: () => number,
): ClaimResult[] {
  if (!tokens.length) return [];

  const party = livingParty(team);
  const byPosition = new Array<Soldier | null>(6).fill(null);
  for (const s of party) {
    if (s.position) byPosition[s.position - 1] = s;
  }

  const claimed = new Set<string>();
  const results: ClaimResult[] = [];
  const magnetPos = team.magnetPosition;
  const magnetSoldier = byPosition[magnetPos - 1];

  // Remaining pool of grades still unassigned
  const pool = [...tokens];

  // --- Step 1: magnet always claims one random token ---
  if (magnetSoldier?.alive) {
    const pick = Math.floor(random() * pool.length);
    const token = pool.splice(pick, 1)[0]!;
    claimed.add(magnetSoldier.id);
    results.push(makeClaim(magnetSoldier, token));
  }

  // --- Step 2: residual tokens by proximity (not the magnet) ---
  const weights = proximityClaimWeights(magnetPos);

  for (const token of pool) {
    const eligible = byPosition.map(
      (s) => !!s && s.alive && !claimed.has(s.id),
    );
    let idx = pickWeightedIndex(weights, eligible, random);

    let attempts = 0;
    while (idx === null && eligible.some(Boolean) && attempts < 10) {
      idx = pickWeightedIndex(weights, eligible, random);
      attempts++;
    }
    if (idx === null) continue;

    const soldier = byPosition[idx];
    if (!soldier) continue;

    claimed.add(soldier.id);
    results.push(makeClaim(soldier, token));
  }

  return results;
}

export function setMagnet(team: TeamState, position: Position): void {
  team.magnetPosition = position;
}
