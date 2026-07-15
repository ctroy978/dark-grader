import {
  DOT_STATS,
  type BossState,
  type DotType,
  type Soldier,
  type TeamState,
} from "@dungeon-grades/shared";
import { adjacentPositions } from "@dungeon-grades/shared";
import {
  applyPartyDamage,
  formatPartyHit,
  livingParty,
  soldierAt,
} from "./damage.js";

export function applyDot(
  soldier: Soldier,
  type: DotType,
  stacks = 1,
  durationOverride?: number,
): void {
  const existing = soldier.statuses.find((s) => s.kind === "Dot" && s.type === type);
  const duration = durationOverride ?? DOT_STATS[type].duration;
  if (existing && existing.kind === "Dot") {
    existing.stacks += stacks;
    existing.duration = Math.max(existing.duration, duration);
  } else {
    soldier.statuses.push({ kind: "Dot", type, stacks, duration });
  }
}

/** Apply / stack a DoT on the boss (Doomcaller transfer, death poison). */
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

export function cleanseDots(
  soldiers: Soldier[],
  types: DotType[],
): number {
  let removed = 0;
  for (const s of soldiers) {
    const before = s.statuses.length;
    s.statuses = s.statuses.filter(
      (st) => !(st.kind === "Dot" && types.includes(st.type)),
    );
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
  let slimeActive = false;

  // Snapshot active DoTs for a readable header
  const summary: string[] = [];
  for (const soldier of party) {
    for (const st of soldier.statuses) {
      if (st.kind === "Dot") {
        summary.push(
          `${soldier.name}:${st.type}×${st.stacks}(${st.duration}r left)`,
        );
      }
    }
  }

  const bossHasDots =
    !!team.boss?.statuses?.some((s) => s.kind === "Dot") &&
    (team.boss?.currentHp ?? 0) > 0;

  if (!summary.length && !bossHasDots) {
    log(`— DoT phase: none active —`);
    return;
  }

  if (summary.length) {
    log(`— DoT phase — ${summary.join(" · ")}`);
  } else {
    log(`— DoT phase — boss marks only —`);
  }

  // --- Poison: single party splash ---
  let maxPoisonStacks = 0;
  const poisonCarriers: Soldier[] = [];
  for (const soldier of party) {
    const poison = soldier.statuses.find((s) => s.kind === "Dot" && s.type === "Poison");
    if (poison && poison.kind === "Dot") {
      maxPoisonStacks = Math.max(maxPoisonStacks, poison.stacks);
      poisonCarriers.push(soldier);
    }
  }
  if (maxPoisonStacks > 0) {
    const total = DOT_STATS.Poison.tick * maxPoisonStacks;
    log(
      `  [Poison] ${maxPoisonStacks} stack(s) → ${total} splash dmg (magnet-weighted)`,
    );
    distributePoison(team, total, log);
    for (const soldier of poisonCarriers) {
      const poison = soldier.statuses.find((s) => s.kind === "Dot" && s.type === "Poison");
      if (poison && poison.kind === "Dot") {
        poison.duration -= 1;
      }
    }
  }

  // --- Other DoTs: per-soldier ---
  for (const soldier of party) {
    const dots = soldier.statuses.filter(
      (s) => s.kind === "Dot" && s.type !== "Poison",
    );
    for (const dot of dots) {
      if (dot.kind !== "Dot") continue;
      const perTick = DOT_STATS[dot.type].tick * dot.stacks;
      const result = applyPartyDamage(soldier, perTick, team.partyShield);
      log(
        `  [${dot.type}] ${soldier.name}: ${perTick} raw → ${formatPartyHit(soldier, result)} · ${dot.duration - 1}r left after tick`,
      );
      if (dot.type === "Slime") slimeActive = true;
      dot.duration -= 1;
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

  if (slimeActive) {
    team.slimeSlowNextRound = true;
    log(`  [Slime] Party slowed — fewer tokens next drop`);
  }

  // --- Boss DoTs (Doomcaller transfers, death poison) ---
  tickBossDots(team, log);

  log(`— End DoT phase —`);
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
    const dmg = Math.min(boss.currentHp, perTick);
    boss.currentHp -= dmg;
    log(
      `  [Boss ${dot.type}×${dot.stacks}] ${dmg} to ${boss.name} · ${dot.duration - 1}r left`,
    );
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
    const result = applyPartyDamage(p.soldier, p.floor, team.partyShield);
    log(`    ${p.soldier.name} (pos ${p.pos}): ${formatPartyHit(p.soldier, result)}`);
  }
}
