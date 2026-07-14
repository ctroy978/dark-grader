import {
  claimWeights,
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

/**
 * Resolve claims for drawn tokens. Each soldier may claim at most one.
 * Conflicts re-roll among still-eligible living party members.
 */
export function resolveClaims(
  team: TeamState,
  tokens: Grade[],
  random: () => number,
): ClaimResult[] {
  const party = livingParty(team);
  const byPosition = new Array<Soldier | null>(6).fill(null);
  for (const s of party) {
    if (s.position) byPosition[s.position - 1] = s;
  }

  const claimed = new Set<string>();
  const results: ClaimResult[] = [];
  const weights = claimWeights(team.magnetPosition);

  for (const token of tokens) {
    const eligible = byPosition.map((s) => !!s && s.alive && !claimed.has(s.id));
    let idx = pickWeightedIndex(weights, eligible, random);

    // Re-roll a few times if needed (should be rare with zeroed weights)
    let attempts = 0;
    while (idx === null && eligible.some(Boolean) && attempts < 10) {
      idx = pickWeightedIndex(weights, eligible, random);
      attempts++;
    }
    if (idx === null) continue;

    const soldier = byPosition[idx];
    if (!soldier) continue;

    claimed.add(soldier.id);
    let effective: Grade = token;
    if (hasIce(soldier)) {
      effective = downgradeGrade(token);
    }
    results.push({
      token,
      soldierId: soldier.id,
      effectiveGrade: effective,
    });
  }

  return results;
}

export function setMagnet(team: TeamState, position: Position): void {
  team.magnetPosition = position;
}
