import type { PartyShield, Soldier, TeamState } from "@dungeon-grades/shared";

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
};

export function applyPartyDamage(
  soldier: Soldier,
  raw: number,
  shield: PartyShield,
  opts?: DamageOpts,
): { hpLost: number; shieldAbsorbed: number; blockAbsorbed: number } {
  if (raw <= 0 || !soldier.alive) {
    return { hpLost: 0, shieldAbsorbed: 0, blockAbsorbed: 0 };
  }
  let remaining = Math.floor(raw);
  let shieldAbsorbed = 0;
  let blockAbsorbed = 0;

  if (!opts?.bypassAbsorb) {
    if (shield.active && shield.remaining > 0) {
      shieldAbsorbed = Math.min(shield.remaining, remaining);
      shield.remaining -= shieldAbsorbed;
      remaining -= shieldAbsorbed;
      if (shield.remaining <= 0) {
        shield.active = false;
        shield.remaining = 0;
      }
    }

    if (remaining > 0 && soldier.block > 0) {
      blockAbsorbed = Math.min(soldier.block, remaining);
      soldier.block -= blockAbsorbed;
      remaining -= blockAbsorbed;
    }
  }

  const hpLost = Math.min(soldier.currentHp, remaining);
  soldier.currentHp -= hpLost;
  if (soldier.currentHp <= 0) {
    soldier.alive = false;
    soldier.currentHp = 0;
  }

  return { hpLost, shieldAbsorbed, blockAbsorbed };
}

export function healSoldier(soldier: Soldier, amount: number): number {
  if (!soldier.alive || amount <= 0) return 0;
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

/** Remove slain minions from the board (after presentation snapshots are captured). */
export function purgeDeadMinions(team: TeamState): void {
  team.minions = team.minions.filter((m) => m.currentHp > 0);
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
 * Deal damage to enemies. Minions first (design §6.6).
 * - single: all damage into first living minion, else boss
 * - chain: hit primary then up to `extraBounces` additional enemies
 *
 * Dead minions stay on the roster at 0 HP until `purgeDeadMinions` so the
 * client can show who killed them during action playback.
 *
 * @param minionBonus Extra damage when the hit lands on a minion (not boss).
 * @param actor If set, consumes their Charge bonus into this hit.
 */
export function hitEnemies(
  team: TeamState,
  baseDamage: number,
  mode: "single" | "chain" = "single",
  extraBounces = 0,
  minionBonus = 0,
  actor?: Soldier | null,
): string {
  const bonus = (team.partyDamageBonus || 0) + consumeCharge(actor);
  const parts: string[] = [];

  const applyToBoss = (amount: number) => {
    if (!team.boss || team.boss.currentHp <= 0) return;
    const mult = team.boss.curseDamageTakenMult || 1;
    const dmg = Math.min(team.boss.currentHp, Math.floor(amount * mult));
    team.boss.currentHp -= dmg;
    parts.push(`${dmg} to ${team.boss.name}`);
  };

  const applyToMinion = (amount: number) => {
    const m = team.minions.find((x) => x.currentHp > 0);
    if (!m) return false;
    const dmg = Math.min(m.currentHp, amount);
    m.currentHp -= dmg;
    parts.push(`${dmg} to ${m.name}`);
    if (m.currentHp <= 0) {
      m.currentHp = 0;
      parts.push(`${m.name} slain`);
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

  // chain: primary full damage, bounces reduced (minion bonus on each hop that hits a minion)
  const base = Math.max(0, Math.floor(baseDamage + bonus));
  const amounts = [base];
  for (let i = 0; i < extraBounces; i++) {
    amounts.push(Math.max(1, Math.floor((baseDamage + bonus) * 0.55)));
  }

  for (const amount of amounts) {
    const livingMinion = team.minions.some((x) => x.currentHp > 0);
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
