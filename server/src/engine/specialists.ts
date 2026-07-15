import {
  GRADE_RANK,
  downgradeGrade,
  randomInt,
  type ClaimResult,
  type DotType,
  type Grade,
  type Soldier,
  type TeamState,
} from "@dungeon-grades/shared";
import {
  applyCharge,
  applyPartyDamage,
  formatPartyHit,
  healBoss,
  healSoldier,
  hitEnemies,
  livingParty,
  soldierAt,
} from "./damage.js";
import {
  applyBossDot,
  applyDot,
  bossDotTypes,
  cleanseDots,
  stripDotsAndMarks,
} from "./dots.js";

export type LogFn = (text: string, tags?: string[]) => void;

/**
 * Claimer ids still waiting to resolve this drop (Runesinger-first order).
 * Used by Thundercaller F so stun only targets actions that haven't happened.
 */
let unresolvedClaimers: Set<string> | null = null;

/** Call before party action loop with all claimer soldier ids. */
export function beginPartyActionPhase(claimerIds: string[]): void {
  unresolvedClaimers = new Set(claimerIds);
}

/** Call after each claimer's action resolves (or is skipped by stun). */
export function markClaimerResolved(soldierId: string): void {
  unresolvedClaimers?.delete(soldierId);
}

export function endPartyActionPhase(): void {
  unresolvedClaimers = null;
}

export function resolveSpecialistAction(
  team: TeamState,
  soldier: Soldier,
  claim: ClaimResult,
  random: () => number,
  log: LogFn,
): void {
  if (!soldier.alive) return;

  const g = claim.effectiveGrade;
  const label = `${soldier.name} (${soldier.archetype}) claimed ${claim.token}${
    claim.effectiveGrade !== claim.token ? `→${claim.effectiveGrade}` : ""
  }`;

  // Party stun (Thundercaller F) — lose this attack, then clear stun
  const stun = soldier.statuses.find((s) => s.kind === "Stun");
  if (stun && stun.kind === "Stun" && stun.duration > 0) {
    soldier.statuses = soldier.statuses.filter((s) => s.kind !== "Stun");
    log(`${label}: STUNNED — loses their attack!`);
    return;
  }

  switch (soldier.archetype) {
    case "Vanguard":
      vanguard(soldier, g, team, log, label);
      break;
    case "ShieldMaiden":
      shieldMaiden(soldier, g, team, random, log, label);
      break;
    case "FireMage":
      fireMage(soldier, g, team, log, label);
      break;
    case "Healer":
      healer(soldier, g, team, log, label);
      break;
    case "Archer":
      archer(soldier, g, team, random, log, label);
      break;
    case "Doomcaller":
      doomcaller(soldier, g, team, log, label);
      break;
    case "Necromancer":
      necromancer(soldier, g, team, random, log, label);
      break;
    case "Thundercaller":
      thundercaller(soldier, g, team, random, log, label);
      break;
    case "Runesinger":
      runesinger(soldier, g, team, log, label);
      break;
    default:
      log(`${label}: unknown archetype`);
  }
}

function vanguard(
  soldier: Soldier,
  g: Grade,
  team: TeamState,
  log: LogFn,
  label: string,
): void {
  // Personal block + hit unchanged on A/B/C; A–C also grant party-wide block.
  // D/F: weaker personal kit (D hits now; F hits with no block).
  const table: Record<
    Grade,
    { personalBlock: number; partyBlock: number; dmg: number }
  > = {
    A: { personalBlock: 6, partyBlock: 3, dmg: 11 },
    B: { personalBlock: 4, partyBlock: 2, dmg: 9 },
    C: { personalBlock: 3, partyBlock: 1, dmg: 6 },
    D: { personalBlock: 1, partyBlock: 0, dmg: 4 },
    F: { personalBlock: 0, partyBlock: 0, dmg: 2 },
  };
  const { personalBlock, partyBlock, dmg } = table[g];

  soldier.block += personalBlock;
  if (partyBlock > 0) {
    for (const s of livingParty(team)) {
      s.block += partyBlock;
    }
  }

  const r = hitEnemies(team, dmg, "single", 0, 0, soldier);
  const parts: string[] = [];
  if (personalBlock > 0) parts.push(`+${personalBlock} personal block`);
  if (partyBlock > 0) parts.push(`+${partyBlock} block to whole party`);
  if (personalBlock === 0 && partyBlock === 0) parts.push("no block");
  parts.push(`hits for ${r}`);
  log(`${label}: ${parts.join(", ")}`);
}

function shieldMaiden(
  soldier: Soldier,
  g: Grade,
  team: TeamState,
  random: () => number,
  log: LogFn,
  label: string,
): void {
  if (g === "F") {
    if (team.partyShield.active && team.partyShield.remaining > 0) {
      team.partyShield = { remaining: 0, active: false };
      log(`${label}: shield short-circuits — party shield drops to 0`);
    } else {
      log(`${label}: no shield to short (nothing happens)`);
    }
    return;
  }

  const dmgTable: Record<Exclude<Grade, "F">, number> = {
    A: 14,
    B: 11,
    C: 9,
    D: 7,
  };
  const r = hitEnemies(team, dmgTable[g], "single", 0, 0, soldier);

  if (g === "A") {
    const roll = randomInt(random, 1, 6);
    team.partyShield = { remaining: roll, active: true };
    log(`${label}: attacks for ${r}; party shield rerolled to ${roll}`);
    return;
  }

  log(`${label}: attacks for ${r}`);
}

function fireMage(
  soldier: Soldier,
  g: Grade,
  team: TeamState,
  log: LogFn,
  label: string,
): void {
  const cleanseable = ["Ice", "Poison", "Slime"] as const;

  if (g === "A") {
    const r = hitEnemies(team, 20, "single", 0, 0, soldier);
    const n = cleanseDots(livingParty(team), [...cleanseable]);
    log(`${label}: ${r}; cleansed ${n} non-Fire DoTs`);
    return;
  }
  if (g === "B") {
    const r = hitEnemies(team, 16, "single", 0, 0, soldier);
    const front = livingParty(team).filter(
      (s) => s.position && s.position <= 3,
    );
    const n = cleanseDots(front, [...cleanseable]);
    log(`${label}: ${r}; cleansed front (${n})`);
    return;
  }
  if (g === "C") {
    const r = hitEnemies(team, 12, "single", 0, 0, soldier);
    const hits: string[] = [];
    for (const pos of [1, 2] as const) {
      const s = soldierAt(team, pos);
      if (s) {
        hits.push(
          formatPartyHit(
            s,
            applyPartyDamage(s, 2, team.partyShield, { bypassAbsorb: true }),
          ),
        );
      }
    }
    log(`${label}: ${r}; friendly fire (ignores shield/block): ${hits.join("; ") || "nobody"}`);
    return;
  }
  if (g === "D") {
    const r = hitEnemies(team, 5, "single", 0, 0, soldier);
    const hits: string[] = [];
    for (const pos of [1, 2] as const) {
      const s = soldierAt(team, pos);
      if (s) {
        hits.push(
          formatPartyHit(
            s,
            applyPartyDamage(s, 3, team.partyShield, { bypassAbsorb: true }),
          ),
        );
      }
    }
    log(`${label}: ${r}; friendly fire (ignores shield/block): ${hits.join("; ") || "nobody"}`);
    return;
  }
  // F explosion
  const hits: string[] = [];
  for (const s of livingParty(team)) {
    hits.push(
      formatPartyHit(
        s,
        applyPartyDamage(s, 3, team.partyShield, { bypassAbsorb: true }),
      ),
    );
  }
  log(`${label}: EXPLOSION (ignores shield/block)! ${hits.join("; ")}`);
}

function healer(
  soldier: Soldier,
  g: Grade,
  team: TeamState,
  log: LogFn,
  label: string,
): void {
  if (g === "F") {
    const healed = healBoss(team, 8);
    log(`${label}: BACKLASH — boss heals ${healed}`);
    return;
  }
  if (g === "A") {
    let total = 0;
    for (const s of livingParty(team)) {
      total += healSoldier(s, 10);
      s.statuses = s.statuses.filter((st) => st.kind !== "Mark");
    }
    log(`${label}: heals party ${total} total, removes Marks`);
    return;
  }
  if (g === "B") {
    let total = 0;
    for (const s of livingParty(team).filter((x) => x.position && x.position <= 3)) {
      total += healSoldier(s, 10);
      s.statuses = s.statuses.filter((st) => st.kind !== "Mark");
    }
    log(`${label}: heals front ${total}, removes Marks`);
    return;
  }
  if (g === "C") {
    // Back line (pos 4–6): smaller heal + Mark clear
    let total = 0;
    for (const s of livingParty(team).filter(
      (x) => x.position && x.position >= 4,
    )) {
      total += healSoldier(s, 6);
      s.statuses = s.statuses.filter((st) => st.kind !== "Mark");
    }
    log(`${label}: heals back ${total}, removes Marks`);
    return;
  }
  // D
  const h = healSoldier(soldier, 8);
  log(`${label}: self-heal ${h}`);
}

function archer(
  soldier: Soldier,
  g: Grade,
  team: TeamState,
  random: () => number,
  log: LogFn,
  label: string,
): void {
  if (g === "F") {
    const r = hitEnemies(team, 3, "single", 0, 0, soldier);
    const allies = livingParty(team);
    if (allies.length) {
      const victim = allies[Math.floor(random() * allies.length)];
      const dmg = randomInt(random, 1, 2);
      const hit = applyPartyDamage(victim, dmg, team.partyShield, {
        bypassAbsorb: true,
      });
      log(
        `${label}: MISFIRE — ${r}, and ${formatPartyHit(victim, hit)} (ignores shield/block)`,
      );
    } else {
      log(`${label}: MISFIRE — ${r}`);
    }
    return;
  }
  // Base damage unchanged; extra only when the shot lands on a minion
  const table: Record<Exclude<Grade, "F">, { dmg: number; vsMinion: number }> =
    {
      A: { dmg: 18, vsMinion: 3 },
      B: { dmg: 13, vsMinion: 2 },
      C: { dmg: 9, vsMinion: 2 },
      D: { dmg: 4, vsMinion: 1 },
    };
  const t = table[g as Exclude<Grade, "F">];
  const r = hitEnemies(team, t.dmg, "single", 0, t.vsMinion, soldier);
  log(`${label}: volley ${r}`);
}

/**
 * Doomcaller — strip / transfer party DoTs ("marks") to the boss.
 * Death leaves poison based on last claim grade (Weaken duration encodes tier).
 */
function doomcaller(
  soldier: Soldier,
  g: Grade,
  team: TeamState,
  log: LogFn,
  label: string,
): void {
  // Always tag death tier from this claim (5=A … 1=F)
  soldier.statuses = soldier.statuses.filter((s) => s.kind !== "Weaken");
  soldier.statuses.push({
    kind: "Weaken",
    duration: g === "A" ? 5 : g === "B" ? 4 : g === "C" ? 3 : g === "D" ? 2 : 1,
  });

  if (g === "C") {
    const front = livingParty(team).filter(
      (s) => s.position && s.position <= 3,
    );
    const n = stripDotsAndMarks(front).length;
    log(`${label}: strips DoTs/Marks from front (${n} removed)`);
    return;
  }
  if (g === "D") {
    const back = livingParty(team).filter(
      (s) => s.position && s.position >= 4,
    );
    const n = stripDotsAndMarks(back).length;
    log(`${label}: strips DoTs/Marks from back (${n} removed)`);
    return;
  }

  if (!team.boss) {
    log(`${label}: no boss on the field`);
    return;
  }

  if (g === "F") {
    const types = bossDotTypes(team.boss);
    if (!types.length) {
      log(`${label}: boss has no marks — nothing to copy`);
      return;
    }
    for (const type of types) {
      applyDot(soldier, type, 1);
    }
    log(
      `${label}: copies boss mark types onto self — ${types.join(", ")}`,
    );
    return;
  }

  // A / B — strip whole living party, transfer to boss
  const party = livingParty(team);
  const collected = stripDotsAndMarks(party);
  if (!collected.length) {
    log(`${label}: party has no DoTs/Marks to transfer`);
    return;
  }

  if (g === "A") {
    // All stacks summed by type, duration 2 on boss
    const byType = new Map<DotType, number>();
    for (const c of collected) {
      byType.set(c.type, (byType.get(c.type) ?? 0) + c.stacks);
    }
    const parts: string[] = [];
    for (const [type, stacks] of byType) {
      applyBossDot(team.boss, type, stacks, 2);
      parts.push(`${type}×${stacks}`);
    }
    log(
      `${label}: transfers all stacks to boss for 2 rounds — ${parts.join(", ")}`,
    );
    return;
  }

  // B — one of each distinct type, duration 3
  const unique = new Set(collected.map((c) => c.type));
  for (const type of unique) {
    applyBossDot(team.boss, type, 1, 3);
  }
  log(
    `${label}: transfers one of each type to boss for 3 rounds — ${[...unique].join(", ")}`,
  );
}

/** Called when a Doomcaller dies — Weaken duration encodes last claim 5=A … 1=F */
export function triggerDoomcallerDeath(
  team: TeamState,
  soldier: Soldier,
  log: LogFn,
): void {
  const tag = soldier.statuses.find((s) => s.kind === "Weaken");
  const tier = tag && tag.kind === "Weaken" ? tag.duration : 3;

  if (tier >= 5) {
    // A death — boss poison 3 rounds
    if (team.boss) {
      applyBossDot(team.boss, "Poison", 1, 3);
      log(`${soldier.name}'s death curse: Poison on ${team.boss.name} (3 rounds)`);
    } else {
      log(`${soldier.name}'s death curse fades (no boss)`);
    }
  } else if (tier === 4) {
    if (team.boss) {
      applyBossDot(team.boss, "Poison", 1, 2);
      log(`${soldier.name}'s death curse: Poison on ${team.boss.name} (2 rounds)`);
    }
  } else if (tier === 3) {
    if (team.boss) {
      applyBossDot(team.boss, "Poison", 1, 1);
      log(`${soldier.name}'s death curse: Poison on ${team.boss.name} (1 round)`);
    }
  } else if (tier === 2) {
    // D — poison first living ally (DoT applies directly; ticks use normal absorb)
    const allies = livingParty(team);
    if (allies.length) {
      applyDot(allies[0], "Poison", 1);
      log(
        `${soldier.name}'s risky death: Poison on ${allies[0].name}`,
      );
    }
  } else {
    // F — poison full party
    for (const s of livingParty(team)) {
      applyDot(s, "Poison", 1);
    }
    log(`${soldier.name}'s backfire death: Poison on the whole party`);
  }
}

function necromancer(
  soldier: Soldier,
  g: Grade,
  team: TeamState,
  _random: () => number,
  log: LogFn,
  label: string,
): void {
  if (g === "F") {
    // Hit highest-HP living ally for 10 (ignores shield/block)
    const allies = livingParty(team)
      .slice()
      .sort((a, b) => b.currentHp - a.currentHp || a.position! - b.position!);
    const target = allies[0];
    if (!target) {
      log(`${label}: BACKLASH — no allies to hit`);
      return;
    }
    const hit = applyPartyDamage(target, 10, team.partyShield, {
      bypassAbsorb: true,
    });
    log(
      `${label}: BACKLASH — drains ${formatPartyHit(target, hit)} (highest HP, ignores shield/block)`,
    );
    return;
  }
  const table: Record<Exclude<Grade, "F">, { dmg: number; heal: number; self?: number }> = {
    A: { dmg: 12, heal: 10 },
    B: { dmg: 9, heal: 6 },
    C: { dmg: 6, heal: 3 },
    D: { dmg: 4, heal: 0, self: 3 },
  };
  const t = table[g as Exclude<Grade, "F">];
  const r = hitEnemies(team, t.dmg, "single", 0, 0, soldier);
  const allies = livingParty(team).slice().sort((a, b) => a.currentHp - b.currentHp);
  let healed = 0;
  if (t.heal > 0 && allies.length) {
    healed = healSoldier(allies[0], t.heal);
  }
  if (t.self) {
    applyPartyDamage(soldier, t.self, team.partyShield, { bypassAbsorb: true });
  }
  log(`${label}: drain ${r}${healed ? `, heal ${allies[0].name} ${healed}` : ""}`);
}

/**
 * Thundercaller — single-target lightning, boss stun chance, Charge buffs.
 * No chain. Stun on boss skips that round’s boss attack.
 * F: no damage; 30% stun a random other token-holder (they lose their attack).
 */
function thundercaller(
  soldier: Soldier,
  g: Grade,
  team: TeamState,
  random: () => number,
  log: LogFn,
  label: string,
): void {
  const tryBossStun = (): string => {
    if (!team.boss || team.boss.currentHp <= 0) return "";
    if (random() >= 0.3) return "";
    team.boss.stunRoundsLeft = Math.max(team.boss.stunRoundsLeft, 1);
    return "; boss stunned (skips attack this round)!";
  };

  if (g === "F") {
    // Option A: only claimers who have not resolved yet this drop (never Runesinger after she acted)
    const pending = unresolvedClaimers
      ? [...unresolvedClaimers].filter((id) => id !== soldier.id)
      : (team.lastClaims ?? [])
          .map((c) => c.soldierId)
          .filter((id) => id !== soldier.id);
    const candidates = livingParty(team).filter((s) => pending.includes(s.id));
    if (!candidates.length) {
      log(
        `${label}: overload fizzles — no remaining token-holders left to stun`,
      );
      return;
    }
    const target = candidates[Math.floor(random() * candidates.length)]!;
    if (random() < 0.3) {
      target.statuses = target.statuses.filter((s) => s.kind !== "Stun");
      target.statuses.push({ kind: "Stun", duration: 1 });
      log(
        `${label}: OVERLOAD — ${target.name} is stunned and will lose their attack!`,
      );
    } else {
      log(
        `${label}: OVERLOAD crackles at ${target.name} but they shake it off`,
      );
    }
    return;
  }

  if (g === "A") {
    const r = hitEnemies(team, 14, "single", 0, 0, soldier);
    const stun = tryBossStun();
    for (const s of livingParty(team).filter(
      (x) => x.position && x.position <= 3,
    )) {
      applyCharge(s, 3);
    }
    log(`${label}: lightning ${r}${stun}; front line charged +3 next attack`);
    return;
  }
  if (g === "B") {
    const r = hitEnemies(team, 11, "single", 0, 0, soldier);
    const stun = tryBossStun();
    for (const s of livingParty(team).filter(
      (x) => x.position && x.position >= 4,
    )) {
      applyCharge(s, 3);
    }
    log(`${label}: lightning ${r}${stun}; back line charged +3 next attack`);
    return;
  }
  if (g === "C") {
    const r = hitEnemies(team, 9, "single", 0, 0, soldier);
    const stun = tryBossStun();
    log(`${label}: lightning ${r}${stun}`);
    return;
  }
  // D
  const r = hitEnemies(team, 6, "single", 0, 0, soldier);
  log(`${label}: lightning ${r}`);
}

/**
 * Runesinger — always resolves first (see combat action order).
 * Rewrites this drop’s claim grades for the whole group, then heals holders.
 * Mutates `team.lastClaims` / shared ClaimResult objects in place.
 */
function runesinger(
  _soldier: Soldier,
  g: Grade,
  team: TeamState,
  log: LogFn,
  label: string,
): void {
  const claims = team.lastClaims ?? [];
  const holders = claims
    .map((c) => team.roster.find((s) => s.id === c.soldierId))
    .filter((s): s is Soldier => !!s && s.alive);

  const healHolders = (amount: number): number => {
    let total = 0;
    for (const s of holders) {
      total += healSoldier(s, amount);
    }
    return total;
  };

  const describeClaims = (): string =>
    claims
      .map((c) => {
        const s = team.roster.find((x) => x.id === c.soldierId);
        return `${s?.name ?? "?"}:${c.effectiveGrade}`;
      })
      .join(", ");

  if (g === "A") {
    // All tokens worse than A → A
    for (const c of claims) {
      if (GRADE_RANK[c.effectiveGrade] > GRADE_RANK.A) {
        c.effectiveGrade = "A";
      }
    }
    const healed = healHolders(5);
    log(
      `${label}: all tokens become A — [${describeClaims()}]; token holders heal +5 (total ${healed})`,
    );
    return;
  }

  if (g === "B") {
    // All tokens worse than B → B
    for (const c of claims) {
      if (GRADE_RANK[c.effectiveGrade] > GRADE_RANK.B) {
        c.effectiveGrade = "B";
      }
    }
    const healed = healHolders(4);
    log(
      `${label}: tokens below B promoted to B — [${describeClaims()}]; holders heal +4 (total ${healed})`,
    );
    return;
  }

  if (g === "C") {
    // Promote only the single lowest token that is worse than C
    const below = claims.filter(
      (c) => GRADE_RANK[c.effectiveGrade] > GRADE_RANK.C,
    );
    if (below.length) {
      let worst = below[0]!;
      for (const c of below) {
        if (GRADE_RANK[c.effectiveGrade] > GRADE_RANK[worst.effectiveGrade]) {
          worst = c;
        }
      }
      const before = worst.effectiveGrade;
      worst.effectiveGrade = "C";
      const who =
        team.roster.find((s) => s.id === worst.soldierId)?.name ?? "?";
      const healed = healHolders(3);
      log(
        `${label}: promotes lowest token (${who} ${before}→C); holders heal +3 (total ${healed}) — [${describeClaims()}]`,
      );
    } else {
      const healed = healHolders(3);
      log(
        `${label}: no token below C to promote; holders heal +3 (total ${healed})`,
      );
    }
    return;
  }

  if (g === "D") {
    const healed = healHolders(3);
    log(`${label}: soft hymn — token holders heal +3 (total ${healed})`);
    return;
  }

  // F — every token shifts down one grade (F stays F)
  for (const c of claims) {
    c.effectiveGrade = downgradeGrade(c.effectiveGrade);
  }
  log(`${label}: corrupted hymn — all tokens shift down — [${describeClaims()}]`);
}
