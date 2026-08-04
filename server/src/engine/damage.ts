import {
  OHM_REFLECT_RATIO,
  SPEARMAN_FRONT_VULN_MULT,
  type Minion,
  type PartyShield,
  type Soldier,
  type TeamState,
} from "@dungeon-grades/shared";

/** Short phrase for logs: "3 HP to Name", "2 blocked by shield on Name", etc. */
export function formatPartyHit(
  soldier: Soldier,
  result: { hpLost: number; shieldAbsorbed: number; blockAbsorbed: number },
): string {
  const parts: string[] = [];
  if (result.shieldAbsorbed > 0) {
    parts.push(`${result.shieldAbsorbed} to party shield`);
  }
  if (result.blockAbsorbed > 0) {
    parts.push(`${result.blockAbsorbed} blocked by ${soldier.name}`);
  }
  if (result.hpLost > 0) {
    parts.push(`${result.hpLost} HP to ${soldier.name}`);
  }
  if (!parts.length) return `no effect on ${soldier.name}`;
  return parts.join(", ");
}

export type DamageOpts = {
  /** Friendly fire / self-backfire: ignore party shield and personal block */
  bypassAbsorb?: boolean;
  /**
   * Ice cocoon (Frozen): external damage glances off unless this is set.
   * Use for frost chain chip, boss shatter, and status DoT ticks.
   * Boss attacks, minions, and party friendly-fire stay blocked.
   */
  throughFrozen?: boolean;
};

/**
 * Spearman boss-only defense: Parry reduces the hit; front without Parry is vulnerable.
 * Does **not** apply to minion shots or DoTs — call only on boss direct damage.
 */
export function applySpearmanBossDefense(
  soldier: Soldier,
  amount: number,
): number {
  if (amount <= 0) return 0;
  const parry = soldier.statuses.find((st) => st.kind === "Parry");
  if (parry && parry.kind === "Parry") {
    return Math.max(0, Math.floor(amount * (1 - parry.reduction)));
  }
  if (soldier.archetype === "Spearman" && soldier.position === 1) {
    return Math.floor(amount * SPEARMAN_FRONT_VULN_MULT);
  }
  return amount;
}

/**
 * Ally most likely to die next (for Shield Maiden cover).
 * Lowest HP%, then lowest current HP, then front-most position.
 */
export function mostLikelyToDie(
  team: TeamState,
  excludeId?: string,
): Soldier | undefined {
  const candidates = livingParty(team).filter((s) => s.id !== excludeId);
  if (!candidates.length) return undefined;
  return candidates.slice().sort((a, b) => {
    const ra = a.currentHp / Math.max(1, a.maxHp);
    const rb = b.currentHp / Math.max(1, b.maxHp);
    if (ra !== rb) return ra - rb;
    if (a.currentHp !== b.currentHp) return a.currentHp - b.currentHp;
    return (a.position ?? 99) - (b.position ?? 99);
  })[0];
}

export function applyPartyDamage(
  soldier: Soldier,
  raw: number,
  shield: PartyShield,
  opts?: DamageOpts,
): { hpLost: number; shieldAbsorbed: number; blockAbsorbed: number } {
  if (raw <= 0 || !soldier.alive) {
    return { hpLost: 0, shieldAbsorbed: 0, blockAbsorbed: 0 };
  }
  // Frozen = ice shell: block external hits unless frost/DoT opts through
  if (
    !opts?.throughFrozen &&
    soldier.statuses.some((st) => st.kind === "Frozen")
  ) {
    return { hpLost: 0, shieldAbsorbed: 0, blockAbsorbed: 0 };
  }
  let remaining = Math.floor(raw);
  let shieldAbsorbed = 0;
  let blockAbsorbed = 0;

  if (!opts?.bypassAbsorb) {
    // One-round Maiden cover: only listed seats may spend the pool
    const inCover =
      shield.active &&
      shield.remaining > 0 &&
      Array.isArray(shield.coveredIds) &&
      shield.coveredIds.includes(soldier.id);
    if (inCover) {
      shieldAbsorbed = Math.min(shield.remaining, remaining);
      shield.remaining -= shieldAbsorbed;
      remaining -= shieldAbsorbed;
      if (shield.remaining <= 0) {
        shield.active = false;
        shield.remaining = 0;
        shield.coveredIds = [];
      }
    }

    if (remaining > 0 && soldier.block > 0) {
      blockAbsorbed = Math.min(soldier.block, remaining);
      soldier.block -= blockAbsorbed;
      remaining -= blockAbsorbed;
    }
  }

  const beforeHp = soldier.currentHp;
  const hpLost = Math.min(beforeHp, remaining);
  soldier.currentHp = beforeHp - hpLost;
  if (soldier.currentHp <= 0) {
    // Last Stand: first lethal hit leaves them at 1 HP and consumes the ward
    if (soldier.statuses.some((st) => st.kind === "LastStand")) {
      soldier.currentHp = 1;
      soldier.alive = true;
      soldier.statuses = soldier.statuses.filter((st) => st.kind !== "LastStand");
      return {
        hpLost: Math.max(0, beforeHp - 1),
        shieldAbsorbed,
        blockAbsorbed,
      };
    }
    soldier.alive = false;
    soldier.currentHp = 0;
  }

  return { hpLost, shieldAbsorbed, blockAbsorbed };
}

export function healSoldier(soldier: Soldier, amount: number): number {
  if (!soldier.alive || amount <= 0) return 0;
  // Chain Frozen solid — heals bounce (SpreadingFrost). Soft ice-lock allows heals.
  if (
    soldier.statuses.some((st) => st.kind === "Frozen" && !st.soft)
  ) {
    return 0;
  }
  const before = soldier.currentHp;
  soldier.currentHp = Math.min(soldier.maxHp, soldier.currentHp + amount);
  return soldier.currentHp - before;
}

export function activeParty(team: TeamState): Soldier[] {
  return team.activePartyIds
    .map((id) => team.roster.find((s) => s.id === id))
    .filter((s): s is Soldier => !!s)
    .sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
}

export function livingParty(team: TeamState): Soldier[] {
  return activeParty(team).filter((s) => s.alive);
}

export function soldierAt(team: TeamState, position: number): Soldier | undefined {
  return livingParty(team).find((s) => s.position === position);
}

/** Ohm electric field — immune + bounce for this party phase. */
export function minionHasReflect(m: Minion): boolean {
  return !!m.statuses?.some(
    (st) => st.kind === "Reflect" && st.duration > 0,
  );
}

/**
 * After party resolve: Reflect lasts one party turn, then fades.
 * Each Ohm’s field ticks independently. Fading sets `reflectCooldown` so the
 * next volley cannot raise Reflect again (no back-to-back fields).
 */
export function tickMinionReflect(
  team: TeamState,
  log: (text: string, tags?: string[]) => void,
): void {
  for (const m of team.minions) {
    if (m.currentHp <= 0 || !m.statuses?.length) continue;
    const ref = m.statuses.find((st) => st.kind === "Reflect");
    if (!ref || ref.kind !== "Reflect" || ref.duration <= 0) continue;
    ref.duration -= 1;
    if (ref.duration <= 0) {
      m.statuses = m.statuses.filter((st) => st.kind !== "Reflect");
      m.reflectCooldown = true;
      log(`${m.name}'s reflect fades`, ["boss", "reflect"]);
    }
  }
}

/** Remove slain minions from the board (after presentation snapshots are captured). */
export function purgeDeadMinions(team: TeamState): void {
  team.minions = team.minions.filter((m) => m.currentHp > 0);
}

/**
 * Call when a minion is reduced to 0 HP. If the gap is now empty, start the
 * global re-summon cooldown (no spawn this round or the next full round).
 */
export function noteMinionSlain(team: TeamState): void {
  const living = team.minions.filter((m) => m.currentHp > 0).length;
  if (living > 0) return;
  // round R clear → noSummonBeforeRound = R+2 → first spawn opportunity round R+2
  team.noSummonBeforeRound = Math.max(
    team.noSummonBeforeRound ?? 0,
    team.round + 2,
  );
}

/** Consume Thundercaller charge on a soldier (extra damage on next hit). */
export function consumeCharge(soldier: Soldier | undefined | null): number {
  if (!soldier) return 0;
  const idx = soldier.statuses.findIndex((s) => s.kind === "Charge");
  if (idx < 0) return 0;
  const st = soldier.statuses[idx];
  const amount = st && st.kind === "Charge" ? st.amount : 0;
  soldier.statuses.splice(idx, 1);
  return amount;
}

export function applyCharge(soldier: Soldier, amount: number): void {
  if (amount <= 0) return;
  const existing = soldier.statuses.find((s) => s.kind === "Charge");
  if (existing && existing.kind === "Charge") {
    existing.amount += amount;
  } else {
    soldier.statuses.push({ kind: "Charge", amount });
  }
}

/**
 * True when this actor may damage gap minions.
 * Only the front seat (pos 1) and Archers can hit minions; others hit boss only.
 * No actor → unrestricted (legacy / internal callers).
 */
export function actorCanHitMinions(actor?: Soldier | null): boolean {
  if (!actor) return true;
  return actor.position === 1 || actor.archetype === "Archer";
}

/**
 * Deal damage to enemies.
 * - single: first living minion (if allowed), else boss
 * - chain: primary then up to `extraBounces` hops (minions if allowed, else boss)
 * - aoe: up to `extraBounces` distinct targets — minions first when allowed, then
 *   one boss hit for leftover slots (non-gap actors never multi-hit the boss)
 *
 * Dead minions stay on the roster at 0 HP until `purgeDeadMinions` so the
 * client can show who killed them during action playback.
 *
 * @param minionBonus Extra damage when the hit lands on a minion (not boss).
 * @param actor If set, consumes their Charge bonus; also applies the gap rule.
 */
export function hitEnemies(
  team: TeamState,
  baseDamage: number,
  mode: "single" | "chain" | "aoe" = "single",
  extraBounces = 0,
  minionBonus = 0,
  actor?: Soldier | null,
): string {
  const charge = consumeCharge(actor);
  const bonus = (team.partyDamageBonus || 0) + charge;
  const parts: string[] = [];
  const canMinions = actorCanHitMinions(actor);

  const applyToBoss = (amount: number) => {
    if (!team.boss || team.boss.currentHp <= 0) return false;
    let raw = amount;
    // Mutual resistance: Thundercaller ↔ Rattle Captain
    if (
      actor?.archetype === "Thundercaller" &&
      team.boss.id === "rattle_captain"
    ) {
      raw = Math.floor(raw * 0.5);
    }
    const mult = team.boss.curseDamageTakenMult || 1;
    const dmg = Math.min(team.boss.currentHp, Math.floor(raw * mult));
    team.boss.currentHp -= dmg;
    parts.push(`${dmg} to ${team.boss.name}`);
    return true;
  };

  /** Hit first living minion (or a specific one for aoe). */
  const applyToMinion = (amount: number, minionId?: string) => {
    if (!canMinions) return false;
    const m = minionId
      ? team.minions.find((x) => x.id === minionId && x.currentHp > 0)
      : team.minions.find((x) => x.currentHp > 0);
    if (!m) return false;
    // Ohm Reflect: immune; bounce a slice of intended damage to the attacker
    if (minionHasReflect(m)) {
      parts.push(`0 to ${m.name} (reflect)`);
      const bounce = Math.floor(amount * OHM_REFLECT_RATIO);
      if (bounce > 0 && actor && actor.alive) {
        const { hpLost } = applyPartyDamage(actor, bounce, team.partyShield);
        if (hpLost > 0) {
          parts.push(`${hpLost} reflected to ${actor.name}`);
        } else {
          parts.push(`reflect glances off ${actor.name}`);
        }
      }
      return true;
    }
    const dmg = Math.min(m.currentHp, amount);
    m.currentHp -= dmg;
    parts.push(`${dmg} to ${m.name}`);
    if (m.currentHp <= 0) {
      m.currentHp = 0;
      parts.push(`${m.name} slain`);
      noteMinionSlain(team);
    }
    // Do not remove yet — presentation needs the corpse for the kill beat
    return true;
  };

  if (mode === "single") {
    const vsBoss = Math.max(0, Math.floor(baseDamage + bonus));
    const vsMinion = Math.max(0, Math.floor(baseDamage + bonus + minionBonus));
    if (!applyToMinion(vsMinion)) applyToBoss(vsBoss);
    return parts.join("; ") || "no target";
  }

  if (mode === "aoe") {
    // extraBounces carries max target count for aoe (A/B=3, C=2, D=1)
    const maxTargets = Math.max(1, extraBounces);
    const base = Math.max(0, Math.floor(baseDamage + (team.partyDamageBonus || 0)));
    // Charge only on the first target so multi-hit kits don't explode with Thundercaller buffs
    let chargeLeft = charge;

    const livingMinionIds = canMinions
      ? team.minions.filter((m) => m.currentHp > 0).map((m) => m.id)
      : [];
    let hits = 0;
    for (const id of livingMinionIds) {
      if (hits >= maxTargets) break;
      const amount = base + minionBonus + chargeLeft;
      chargeLeft = 0;
      if (applyToMinion(amount, id)) hits += 1;
    }
    // Non-gap actors: one boss hit only (no multi-hit on boss for leftover AOE slots)
    if (
      hits < maxTargets &&
      team.boss &&
      team.boss.currentHp > 0
    ) {
      applyToBoss(base + chargeLeft);
      hits += 1;
    }
    return parts.join("; ") || "no target";
  }

  // chain: primary full damage, bounces reduced (minion bonus on each hop that hits a minion)
  const base = Math.max(0, Math.floor(baseDamage + bonus));
  const amounts = [base];
  for (let i = 0; i < extraBounces; i++) {
    amounts.push(Math.max(1, Math.floor((baseDamage + bonus) * 0.55)));
  }

  for (const amount of amounts) {
    const livingMinion =
      canMinions && team.minions.some((x) => x.currentHp > 0);
    if (livingMinion) {
      applyToMinion(amount + minionBonus);
    } else {
      applyToBoss(amount);
    }
  }
  return parts.join("; ") || "no target";
}

export function healBoss(team: TeamState, amount: number): number {
  if (!team.boss) return 0;
  const before = team.boss.currentHp;
  team.boss.currentHp = Math.min(team.boss.maxHp, team.boss.currentHp + amount);
  return team.boss.currentHp - before;
}
