import {
  DOT_STATS,
  FROST_LOCKED_TICK_DAMAGE,
  FROST_SHATTER_FROZEN_DAMAGE,
  FROST_SHATTER_SPLASH_DAMAGE,
  MAX_HOT_STREAMS_PER_SOLDIER,
  MAX_PARTY_CHILL_STACKS,
  MAX_PARTY_FIRE_STACKS,
  MAX_PARTY_ICE_STACKS,
  MAX_PARTY_POISON_STACKS,
  MAX_PARTY_SLIME_STACKS,
  MAX_POISON_INTENSITY,
  PURITY_CHARM_DURATION_REDUCTION,
  type BossState,
  type DotType,
  type FrozenStatus,
  type Minion,
  type Soldier,
  type TeamState,
} from "@dungeon-grades/shared";
import { adjacentPositions } from "@dungeon-grades/shared";
import {
  applyPartyDamage,
  damageBoss,
  formatPartyHit,
  healSoldier,
  livingParty,
  noteMinionSlain,
  soldierAt,
} from "./damage.js";

/** True when any living party member is Frozen (chain or soft). */
export function partyHasFrozen(team: TeamState): boolean {
  return livingParty(team).some((s) =>
    s.statuses.some((st) => st.kind === "Frozen"),
  );
}

/** SpreadingFrost chain only — ignores soft Ice-lock freezes. */
export function partyHasChainFrozen(team: TeamState): boolean {
  return livingParty(team).some(isChainFrozen);
}

/** Apply / replace chain Frozen (SpreadingFrost). Replaces soft freeze. */
export function applyFrozen(
  soldier: Soldier,
  origin: number,
  stage: number,
): void {
  soldier.statuses = soldier.statuses.filter((st) => st.kind !== "Frozen");
  soldier.statuses.push({ kind: "Frozen", origin, stage });
}

/**
 * Soft one-turn ice lock after Ice DoT natural expiry.
 * Does not replace a SpreadingFrost chain freeze.
 */
export function applySoftFreeze(soldier: Soldier): void {
  if (!soldier.alive) return;
  if (isChainFrozen(soldier)) return;
  soldier.statuses = soldier.statuses.filter((st) => st.kind !== "Frozen");
  const origin = soldier.position ?? 1;
  soldier.statuses.push({
    kind: "Frozen",
    origin,
    stage: 0,
    soft: true,
  });
}

export function isFrozen(soldier: Soldier): boolean {
  return soldier.statuses.some((st) => st.kind === "Frozen");
}

export function isChainFrozen(soldier: Soldier): boolean {
  return soldier.statuses.some(
    (st) => st.kind === "Frozen" && !st.soft,
  );
}

export function isSoftFrozen(soldier: Soldier): boolean {
  return soldier.statuses.some(
    (st) => st.kind === "Frozen" && !!st.soft,
  );
}

/**
 * Frost path from origin toward center (3 seats).
 * Origin = frontmost living when cast (any seat). Front half walks back;
 * back half walks forward.
 * e.g. 1→2→3, 2→3→4, 3→4→5, 4→3→2, 5→4→3, 6→5→4.
 */
export function frostChainPath(origin: number): readonly number[] {
  const o = Math.max(1, Math.min(6, Math.floor(origin)));
  if (o <= 3) {
    return [o, o + 1, o + 2].filter((p) => p >= 1 && p <= 6);
  }
  return [o, o - 1, o - 2].filter((p) => p >= 1 && p <= 6);
}

/**
 * DoT-phase freeze chain: spread one seat toward center, or shatter after stage 2.
 * Called from tickDots when any Frozen remains.
 */
export function tickFrozenChain(
  team: TeamState,
  log: (text: string) => void,
): void {
  const party = livingParty(team);
  // Soft Ice-locks do not spread or shatter
  const frozenSoldiers = party.filter(isChainFrozen);
  if (!frozenSoldiers.length) return;

  const sample = frozenSoldiers[0]!.statuses.find(
    (st): st is FrozenStatus => st.kind === "Frozen" && !st.soft,
  );
  if (!sample) return;

  const { origin, stage } = sample;

  // Cold bite while locked (makes cleanse urgent even before shatter)
  if (FROST_LOCKED_TICK_DAMAGE > 0 && stage < 2) {
    for (const s of frozenSoldiers) {
      const result = applyPartyDamage(
        s,
        FROST_LOCKED_TICK_DAMAGE,
        team.partyShield,
        { throughFrozen: true, team, source: "dot" },
      );
      log(
        `  [Frost] ${s.name} freezes deeper: ${FROST_LOCKED_TICK_DAMAGE} raw → ${formatPartyHit(s, result)}`,
      );
    }
  }

  // Shatter after two spreads (third seat locked)
  if (stage >= 2) {
    log(
      `  [Frost] The ice SHATTERS! (${frozenSoldiers.length} frozen take the blast)`,
    );
    const frozenIds = new Set(frozenSoldiers.map((s) => s.id));
    for (const s of party) {
      if (frozenIds.has(s.id)) {
        const result = applyPartyDamage(
          s,
          FROST_SHATTER_FROZEN_DAMAGE,
          team.partyShield,
          { throughFrozen: true, team, source: "dot" },
        );
        log(
          `    ${s.name}: shatter ${FROST_SHATTER_FROZEN_DAMAGE} raw → ${formatPartyHit(s, result)}`,
        );
      } else {
        const result = applyPartyDamage(
          s,
          FROST_SHATTER_SPLASH_DAMAGE,
          team.partyShield,
          { throughFrozen: true, team, source: "dot" },
        );
        log(
          `    ${s.name}: ice shards ${FROST_SHATTER_SPLASH_DAMAGE} raw → ${formatPartyHit(s, result)}`,
        );
      }
    }
    for (const s of party) {
      s.statuses = s.statuses.filter((st) => st.kind !== "Frozen");
    }
    return;
  }

  // Spread toward center (skip dead seats in this same step)
  const path = frostChainPath(origin);
  const nextStage = stage + 1;
  let spreadTo: Soldier | undefined;
  for (let i = stage + 1; i < path.length; i++) {
    const seat = soldierAt(team, path[i]!);
    if (seat && !isFrozen(seat)) {
      spreadTo = seat;
      break;
    }
  }
  if (spreadTo) {
    applyFrozen(spreadTo, origin, nextStage);
    log(
      `  [Frost] Ice spreads to ${spreadTo.name} (pos ${spreadTo.position}) — land an A on a frozen hero before it shatters!`,
    );
  } else {
    log(
      `  [Frost] Ice has no living seat left toward center — pressure builds (stage ${nextStage})`,
    );
  }
  // Keep chain stage in sync on every chain-Frozen carrier (not soft locks)
  for (const s of livingParty(team)) {
    for (const st of s.statuses) {
      if (st.kind === "Frozen" && !st.soft) {
        st.stage = nextStage;
        st.origin = origin;
      }
    }
  }
}

/**
 * Apply / stack a DoT on a party soldier.
 * @param fromBoss When true, DoT ramps in damage each tick (boss clouds / Fire minion on-hit).
 * Fire stacks capped at MAX_PARTY_FIRE_STACKS; Poison at MAX_PARTY_POISON_STACKS.
 * Ice / Slime / Chill never ramp; Ice/Chill stack cap 1; Slime never expires by duration.
 * Ice natural expiry → soft one-turn freeze (see tickDots). Chill just ends.
 * Chill re-apply **sets** duration (Warden seat ladder), not max-with-remaining.
 */
export function applyDot(
  soldier: Soldier,
  type: DotType,
  stacks = 1,
  durationOverride?: number,
  fromBoss = false,
  team?: TeamState,
): void {
  const existing = soldier.statuses.find((s) => s.kind === "Dot" && s.type === type);
  let duration = durationOverride ?? DOT_STATS[type].duration;
  const purity = soldier.relic;
  if (
    !existing &&
    type !== "Slime" &&
    purity?.relicId === "purity_charm" &&
    !purity.usedThisFight
  ) {
    purity.usedThisFight = true;
    duration = Math.max(0, duration - PURITY_CHARM_DURATION_REDUCTION);
    if (team) {
      team.log.push({
        round: team.round,
        text: `${soldier.name}'s Purity Charm shortens the incoming ${type}.`,
        tags: ["relic", "purity_charm", "cleanse"],
      });
    }
    if (duration <= 0) return;
  }
  const addStacks =
    type === "Fire"
      ? Math.min(stacks, MAX_PARTY_FIRE_STACKS)
      : type === "Poison"
        ? Math.min(stacks, MAX_PARTY_POISON_STACKS)
        : type === "Slime"
          ? Math.min(stacks, MAX_PARTY_SLIME_STACKS)
          : type === "Ice"
            ? Math.min(stacks, MAX_PARTY_ICE_STACKS)
            : type === "Chill"
              ? Math.min(stacks, MAX_PARTY_CHILL_STACKS)
              : stacks;
  // Slime + Ice + Chill are flat chip only — never boss-ramp intensity
  const ramp =
    fromBoss && type !== "Slime" && type !== "Ice" && type !== "Chill";
  if (existing && existing.kind === "Dot") {
    if (type === "Fire") {
      existing.stacks = Math.min(
        MAX_PARTY_FIRE_STACKS,
        existing.stacks + addStacks,
      );
    } else if (type === "Poison") {
      existing.stacks = Math.min(
        MAX_PARTY_POISON_STACKS,
        existing.stacks + addStacks,
      );
    } else if (type === "Slime") {
      existing.stacks = Math.min(
        MAX_PARTY_SLIME_STACKS,
        existing.stacks + addStacks,
      );
    } else if (type === "Ice") {
      existing.stacks = Math.min(
        MAX_PARTY_ICE_STACKS,
        existing.stacks + addStacks,
      );
    } else if (type === "Chill") {
      existing.stacks = Math.min(
        MAX_PARTY_CHILL_STACKS,
        existing.stacks + addStacks,
      );
    } else {
      existing.stacks += addStacks;
    }
    // Chill: re-apply resets seat duration; others keep the longer remaining clock
    existing.duration =
      type === "Chill" ? duration : Math.max(existing.duration, duration);
    // Promote or keep ramping — intensity does not reset on re-apply
    if (ramp && existing.escalationStep == null) {
      existing.escalationStep = 1;
    }
  } else {
    soldier.statuses.push({
      kind: "Dot",
      type,
      stacks: addStacks,
      duration,
      ...(ramp ? { escalationStep: 1 } : {}),
    });
  }
}

/** Intensity multiplier for a DoT (1 if not boss-ramping). */
export function dotIntensity(dot: { escalationStep?: number }): number {
  return Math.max(1, dot.escalationStep ?? 1);
}

/** Apply / stack a DoT on the boss (Fire Mage burn, etc.). */
export function applyBossDot(
  boss: BossState,
  type: DotType,
  stacks: number,
  duration: number,
): void {
  if (!boss.statuses) boss.statuses = [];
  const existing = boss.statuses.find((s) => s.kind === "Dot" && s.type === type);
  if (existing && existing.kind === "Dot") {
    existing.stacks += stacks;
    existing.duration = Math.max(existing.duration, duration);
  } else {
    boss.statuses.push({ kind: "Dot", type, stacks, duration });
  }
}

/** Apply / stack a DoT on a living minion (FireMage Wildfire, etc.). */
export function applyMinionDot(
  minion: Minion,
  type: DotType,
  stacks: number,
  duration: number,
): void {
  if (minion.currentHp <= 0 || stacks <= 0) return;
  if (!minion.statuses) minion.statuses = [];
  const existing = minion.statuses.find((s) => s.kind === "Dot" && s.type === type);
  if (existing && existing.kind === "Dot") {
    existing.stacks += stacks;
    existing.duration = Math.max(existing.duration, duration);
  } else {
    minion.statuses.push({ kind: "Dot", type, stacks, duration });
  }
}

/** Unique DoT types currently on the boss. */
export function bossDotTypes(boss: BossState): DotType[] {
  if (!boss.statuses) return [];
  const types = new Set<DotType>();
  for (const st of boss.statuses) {
    if (st.kind === "Dot") types.add(st.type);
  }
  return [...types];
}

/**
 * Strip DoTs and plain Marks from soldiers; return collected DoT stacks
 * (each soldier's stacks counted — A transfer can sum to many stacks).
 * Marks are removed but never transferred. Frozen is left alone (FireMage only).
 */
export function stripDotsAndMarks(
  soldiers: Soldier[],
): { type: DotType; stacks: number }[] {
  const collected: { type: DotType; stacks: number }[] = [];
  for (const s of soldiers) {
    for (const st of s.statuses) {
      if (st.kind === "Dot") {
        collected.push({ type: st.type, stacks: st.stacks });
      }
    }
    s.statuses = s.statuses.filter(
      (st) => st.kind !== "Dot" && st.kind !== "Mark",
    );
  }
  return collected;
}

/** Count of Marks removed (does not touch DoTs or Frozen). */
export function stripMarks(soldiers: Soldier[]): number {
  let removed = 0;
  for (const s of soldiers) {
    const before = s.statuses.length;
    s.statuses = s.statuses.filter((st) => st.kind !== "Mark");
    removed += before - s.statuses.length;
  }
  return removed;
}

/** Clear Frozen on listed soldiers (any source). Returns count thawed. */
export function thawFrozen(soldiers: Soldier[]): number {
  let thawed = 0;
  for (const s of soldiers) {
    if (!s.statuses.some((st) => st.kind === "Frozen")) continue;
    s.statuses = s.statuses.filter((st) => st.kind !== "Frozen");
    thawed += 1;
  }
  return thawed;
}

/**
 * Party thaw for A-on-Frozen: clear **chain** Frozen on every living seat.
 * Soft Ice-locks are left alone (they still clear on their own wasted claim).
 * Returns soldier ids that lost chain Frozen (for focus / FX).
 */
export function crackAllChainFrozen(team: TeamState): string[] {
  const cracked: string[] = [];
  for (const s of livingParty(team)) {
    if (!isChainFrozen(s)) continue;
    s.statuses = s.statuses.filter(
      (st) => !(st.kind === "Frozen" && !st.soft),
    );
    cracked.push(s.id);
  }
  return cracked;
}

/**
 * Remove matching DoT types. Does **not** affect Frozen (A-break or soft skip)
 * or Marks (no dedicated strip class currently).
 * **Frozen seats are skipped** — ice seals DoTs in; thaw first, then cleanse.
 */
export function cleanseDots(
  soldiers: Soldier[],
  types: DotType[],
): number {
  let removed = 0;
  for (const s of soldiers) {
    if (isFrozen(s)) continue;
    const before = s.statuses.length;
    s.statuses = s.statuses.filter((st) => {
      if (st.kind === "Dot" && types.includes(st.type)) return false;
      return true;
    });
    removed += before - s.statuses.length;
  }
  return removed;
}

/**
 * Tick DoTs after party actions — logged in a clear separate block.
 * Poison: one party splash using max stacks among carriers.
 */
export function tickDots(team: TeamState, log: (text: string) => void): void {
  const party = livingParty(team);

  // Snapshot active DoTs / Frozen / HoTs for a readable header
  const summary: string[] = [];
  let partyHasHot = false;
  for (const soldier of party) {
    for (const st of soldier.statuses) {
      if (st.kind === "Dot") {
        const left =
          st.type === "Slime" ? "until cleansed" : `${st.duration}r left`;
        summary.push(`${soldier.name}:${st.type}×${st.stacks}(${left})`);
      } else if (st.kind === "Frozen") {
        summary.push(`${soldier.name}:Frozen(s${st.stage})`);
      } else if (st.kind === "Hot") {
        partyHasHot = true;
      }
    }
  }

  const bossHasDots =
    !!team.boss?.statuses?.some((s) => s.kind === "Dot") &&
    (team.boss?.currentHp ?? 0) > 0;

  const minionDotSummary: string[] = [];
  for (const m of team.minions) {
    if (m.currentHp <= 0) continue;
    for (const st of m.statuses ?? []) {
      if (st.kind === "Dot") {
        minionDotSummary.push(
          `${m.name}:${st.type}×${st.stacks}(${st.duration}r left)`,
        );
      }
    }
  }
  const minionsHaveDots = minionDotSummary.length > 0;

  if (!summary.length && !bossHasDots && !minionsHaveDots && !partyHasHot) {
    log(`— DoT phase: none active —`);
    return;
  }

  if (summary.length || minionDotSummary.length) {
    const bits = [...summary, ...minionDotSummary.map((s) => `add ${s}`)];
    log(`— DoT phase — ${bits.join(" · ")}`);
  } else if (partyHasHot) {
    log(`— DoT phase — hymn HoT —`);
  } else {
    log(`— DoT phase — boss marks only —`);
  }

  // --- Poison: single party splash (max stacks × intensity among carriers) ---
  let maxPoisonWeight = 0;
  let reportStacks = 0;
  let reportIntensity = 1;
  const poisonCarriers: Soldier[] = [];
  for (const soldier of party) {
    const poison = soldier.statuses.find((s) => s.kind === "Dot" && s.type === "Poison");
    if (poison && poison.kind === "Dot") {
      const intensity = dotIntensity(poison);
      const weight = poison.stacks * intensity;
      if (weight > maxPoisonWeight) {
        maxPoisonWeight = weight;
        reportStacks = poison.stacks;
        reportIntensity = intensity;
      }
      poisonCarriers.push(soldier);
    }
  }
  if (maxPoisonWeight > 0) {
    const total = DOT_STATS.Poison.tick * maxPoisonWeight;
    const anyBossPoison = poisonCarriers.some((s) => {
      const p = s.statuses.find((st) => st.kind === "Dot" && st.type === "Poison");
      return p?.kind === "Dot" && p.escalationStep != null;
    });
    const rampNote =
      reportIntensity > 1 || anyBossPoison
        ? ` · intensity ${reportIntensity}`
        : "";
    log(
      `  [Poison] ${reportStacks} stack(s)${rampNote} → ${total} splash dmg (magnet-weighted)`,
    );
    distributePoison(team, total, log);
    for (const soldier of poisonCarriers) {
      const poison = soldier.statuses.find((s) => s.kind === "Dot" && s.type === "Poison");
      if (poison && poison.kind === "Dot") {
        poison.duration -= 1;
        if (poison.escalationStep != null) {
          // Cap intensity so stack×ramp cannot wipe after a partial cleanse
          poison.escalationStep = Math.min(
            MAX_POISON_INTENSITY,
            poison.escalationStep + 1,
          );
        }
      }
    }
  }

  // --- Other DoTs: per-soldier (Fire/Ice/Slime; boss Fire ramps via escalationStep) ---
  // Slime never expires by duration and never ramps — cleanse only.
  // Ice natural expiry → soft one-turn freeze (if not already chain-frozen).
  const iceExpiredIds: string[] = [];
  for (const soldier of party) {
    const dots = soldier.statuses.filter(
      (s) => s.kind === "Dot" && s.type !== "Poison",
    );
    for (const dot of dots) {
      if (dot.kind !== "Dot") continue;
      const intensity = dotIntensity(dot);
      const perTick = DOT_STATS[dot.type].tick * dot.stacks * intensity;
      const result = applyPartyDamage(soldier, perTick, team.partyShield, {
        throughFrozen: true,
        team,
        source: "dot",
      });
      const rampNote =
        dot.escalationStep != null ? ` · intensity ${intensity}` : "";
      const leftNote =
        dot.type === "Slime"
          ? "until cleansed"
          : `${dot.duration - 1}r left after tick`;
      log(
        `  [${dot.type}] ${soldier.name}: ${perTick} raw${rampNote} → ${formatPartyHit(soldier, result)} · ${leftNote}`,
      );
      if (dot.type !== "Slime") {
        dot.duration -= 1;
      }
      if (dot.type === "Ice" && dot.duration <= 0) {
        iceExpiredIds.push(soldier.id);
      }
      if (dot.escalationStep != null) {
        dot.escalationStep += 1;
      }
    }

    soldier.statuses = soldier.statuses.filter(
      (s) => !(s.kind === "Dot" && s.duration <= 0),
    );
  }

  // Expire poison after tick
  for (const soldier of party) {
    soldier.statuses = soldier.statuses.filter(
      (s) => !(s.kind === "Dot" && s.duration <= 0),
    );
  }

  // Ice ran its course uncleansed → soft freeze (one wasted action)
  for (const id of iceExpiredIds) {
    const s = party.find((x) => x.id === id);
    if (!s?.alive) continue;
    if (isChainFrozen(s)) continue;
    applySoftFreeze(s);
    log(
      `  [Ice] ${s.name}: frost hardens — FROZEN solid for one turn!`,
    );
  }

  // --- Boss DoTs (Fire Mage burn, etc.) ---
  tickBossDots(team, log);

  // --- Minion DoTs (FireMage Wildfire on adds) ---
  tickMinionDots(team, log);

  // --- SpreadingFrost chain (Barrow Warden) — after other ticks so cleanse same round wins ---
  // Note: cleanse happens during party actions before this phase. Soft freezes ignored.
  if (partyHasChainFrozen(team)) {
    tickFrozenChain(team, log);
  }

  // Hymn HoTs tick after this function returns (combat pushes a separate FX beat
  // so +HP floats are not netted against Fire/Poison on the same reveal).

  log(`— End DoT phase —`);
}

/**
 * Apply a Runesinger hymn stream. Independent instances; cap MAX_HOT_STREAMS_PER_SOLDIER
 * (drop oldest when over cap).
 */
export function applyHot(
  soldier: Soldier,
  healPerTick: number,
  duration: number,
  source: "Runesinger" = "Runesinger",
): void {
  if (!soldier.alive || healPerTick <= 0 || duration <= 0) return;
  soldier.statuses.push({
    kind: "Hot",
    healPerTick,
    duration,
    source,
  });
  const hots = soldier.statuses.filter((st) => st.kind === "Hot");
  if (hots.length > MAX_HOT_STREAMS_PER_SOLDIER) {
    const drop = hots.length - MAX_HOT_STREAMS_PER_SOLDIER;
    let removed = 0;
    soldier.statuses = soldier.statuses.filter((st) => {
      if (st.kind !== "Hot") return true;
      if (removed < drop) {
        removed += 1;
        return false;
      }
      return true;
    });
  }
}

/**
 * Tick all party HoTs; uses healSoldier (hard Frozen blocks).
 * @returns soldier ids that received any HP (for presentation focus).
 */
export function tickHots(
  team: TeamState,
  log: (text: string) => void,
): string[] {
  const party = livingParty(team);
  const lines: string[] = [];
  const healedIds: string[] = [];
  for (const soldier of party) {
    const hots = soldier.statuses.filter((st) => st.kind === "Hot");
    if (!hots.length) continue;
    let gained = 0;
    let streams = 0;
    for (const hot of hots) {
      if (hot.kind !== "Hot") continue;
      gained += healSoldier(soldier, hot.healPerTick);
      hot.duration -= 1;
      streams += 1;
    }
    soldier.statuses = soldier.statuses.filter(
      (st) => !(st.kind === "Hot" && st.duration <= 0),
    );
    if (streams > 0) {
      lines.push(
        `${soldier.name}: Hymn +${gained}${streams > 1 ? ` (${streams} streams)` : ""}`,
      );
      // Still focus seats that tried to tick (Frozen = 0 gain) so FX reads
      if (gained > 0 || streams > 0) healedIds.push(soldier.id);
    }
  }
  if (lines.length) {
    log(`  [Hymn] ${lines.join(" · ")}`);
  }
  return healedIds;
}

/** Tick Fire/etc. on living adds; remove dead after burn kills. */
export function tickMinionDots(
  team: TeamState,
  log: (text: string) => void,
): void {
  for (const m of team.minions) {
    if (m.currentHp <= 0 || !m.statuses?.length) continue;
    const dots = m.statuses.filter((s) => s.kind === "Dot");
    const reflecting = m.statuses.some(
      (st) => st.kind === "Reflect" && st.duration > 0,
    );
    for (const dot of dots) {
      if (dot.kind !== "Dot") continue;
      if (reflecting) {
        // Field still ticks duration down but no HP loss while Reflect is up
        log(
          `  [Add ${dot.type}×${dot.stacks}] 0 to ${m.name} (reflect) · ${dot.duration - 1}r left`,
        );
        dot.duration -= 1;
        continue;
      }
      const perTick = DOT_STATS[dot.type].tick * dot.stacks;
      const dmg = Math.min(m.currentHp, perTick);
      m.currentHp -= dmg;
      log(
        `  [Add ${dot.type}×${dot.stacks}] ${dmg} to ${m.name} · ${dot.duration - 1}r left`,
      );
      dot.duration -= 1;
      if (m.currentHp <= 0) {
        m.currentHp = 0;
        log(`  ${m.name} burns out!`);
        noteMinionSlain(team);
        break;
      }
    }
    m.statuses = (m.statuses ?? []).filter(
      (s) => !(s.kind === "Dot" && s.duration <= 0),
    );
    if (m.currentHp <= 0) m.statuses = [];
  }
}

/** Damage the boss for each DoT stack, then expire. */
export function tickBossDots(
  team: TeamState,
  log: (text: string) => void,
): void {
  const boss = team.boss;
  if (!boss || boss.currentHp <= 0) return;
  if (!boss.statuses?.length) return;

  const dots = boss.statuses.filter((s) => s.kind === "Dot");
  if (!dots.length) return;

  for (const dot of dots) {
    if (dot.kind !== "Dot") continue;
    // Flat tick on boss HP (Poison is not a party splash when on the boss)
    const perTick = DOT_STATS[dot.type].tick * dot.stacks;
    const result = damageBoss(team, perTick);
    const dmg = result.damage;
    log(
      `  [Boss ${dot.type}×${dot.stacks}] ${dmg} to ${boss.name} · ${dot.duration - 1}r left`,
    );
    if (result.warded) {
      log(`  ${boss.damageFloorLabel ?? "Bone Ward"} prevents further damage`);
    }
    dot.duration -= 1;
  }

  boss.statuses = boss.statuses.filter(
    (s) => !(s.kind === "Dot" && s.duration <= 0),
  );

  if (boss.currentHp <= 0) {
    boss.currentHp = 0;
    log(`  ${boss.name} collapses under DoT pressure!`);
  }
}

function distributePoison(
  team: TeamState,
  total: number,
  log: (text: string) => void,
): void {
  const magnet = team.magnetPosition;
  const [a, b] = adjacentPositions(magnet);
  // Build shares only for living soldiers so damage is not wasted on empty slots
  type Share = { pos: number; weight: number; soldier: NonNullable<ReturnType<typeof soldierAt>> };
  const raw: Share[] = [];
  const add = (pos: number, weight: number) => {
    const s = soldierAt(team, pos);
    if (s) raw.push({ pos, weight, soldier: s });
  };
  add(magnet, 0.35);
  add(a, 0.2);
  add(b, 0.2);
  for (const p of [1, 2, 3, 4, 5, 6]) {
    if (p !== magnet && p !== a && p !== b) add(p, 0.25 / 3);
  }
  if (!raw.length || total <= 0) return;

  const weightSum = raw.reduce((s, x) => s + x.weight, 0);
  // Largest-remainder so floors don't erase most of the splash
  const parts = raw.map((x) => {
    const exact = (total * x.weight) / weightSum;
    return { ...x, floor: Math.floor(exact), frac: exact - Math.floor(exact) };
  });
  let assigned = parts.reduce((s, p) => s + p.floor, 0);
  let left = total - assigned;
  parts.sort((a, b) => b.frac - a.frac);
  for (const p of parts) {
    if (left <= 0) break;
    p.floor += 1;
    left -= 1;
  }
  // Magnet always feels it if any poison damage exists
  const mag = parts.find((p) => p.pos === magnet);
  if (mag && mag.floor < 1 && total >= 1) {
    mag.floor = 1;
  }

  for (const p of parts) {
    if (p.floor <= 0) continue;
    const result = applyPartyDamage(p.soldier, p.floor, team.partyShield, {
      throughFrozen: true,
      team,
      source: "dot",
    });
    log(`    ${p.soldier.name} (pos ${p.pos}): ${formatPartyHit(p.soldier, result)}`);
  }
}
