import {
  GRADE_RANK,
  MAIDEN_DAMAGE,
  MAIDEN_SHIELD,
  SPEARMAN_DAMAGE,
  SPEARMAN_PARRY_REDUCTION,
  downgradeGrade,
  randomInt,
  thundercallerRezHp,
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
  mostLikelyToDie,
  soldierAt,
} from "./damage.js";
import {
  applyBossDot,
  applyMinionDot,
  cleanseDots,
  thawFrozen,
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

export type SpecialistResolveResult = {
  /** False when stun / frozen / death skipped the attack — do not play attack cue. */
  acted: boolean;
  /** Why the attack was skipped (for presentation bubbles). */
  skipReason?: "stun" | "frozen" | "dazed";
  /**
   * Extra unit ids to focus for FX when board HP/status diffs miss the intent
   * (e.g. Thundercaller F aims at an ally who shakes the stun off).
   */
  effectFocusIds?: string[];
};

export function resolveSpecialistAction(
  team: TeamState,
  soldier: Soldier,
  claim: ClaimResult,
  random: () => number,
  log: LogFn,
): SpecialistResolveResult {
  if (!soldier.alive) return { acted: false };

  const g = claim.effectiveGrade;
  const label = `${soldier.name} (${soldier.archetype}) claimed ${claim.token}${
    claim.effectiveGrade !== claim.token ? `→${claim.effectiveGrade}` : ""
  }`;

  // Frozen — token wasted. Soft ice-lock clears after this skip; chain freeze stays.
  const frozen = soldier.statuses.find((s) => s.kind === "Frozen");
  if (frozen && frozen.kind === "Frozen") {
    if (frozen.soft) {
      soldier.statuses = soldier.statuses.filter(
        (st) => !(st.kind === "Frozen" && st.soft),
      );
      log(`${label}: FROZEN — token wasted (ice lock ends)!`);
    } else {
      log(`${label}: FROZEN — token wasted, cannot act!`);
    }
    return { acted: false, skipReason: "frozen" };
  }

  // Party stun (Thundercaller F / Rattle Captain) — lose this attack, then clear stun
  const stun = soldier.statuses.find((s) => s.kind === "Stun");
  if (stun && stun.kind === "Stun" && stun.duration > 0) {
    soldier.statuses = soldier.statuses.filter((s) => s.kind !== "Stun");
    log(`${label}: STUNNED — loses their attack!`);
    return { acted: false, skipReason: "stun" };
  }

  // Dazed after Thundercaller rez — skip one attack, then clear
  const dazed = soldier.statuses.find((s) => s.kind === "Dazed");
  if (dazed && dazed.kind === "Dazed" && dazed.duration > 0) {
    soldier.statuses = soldier.statuses.filter((s) => s.kind !== "Dazed");
    log(`${label}: DAZED — just revived, loses their attack!`);
    return { acted: false, skipReason: "dazed" };
  }

  let effectFocusIds: string[] = [];
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
    case "Spearman":
      spearman(soldier, g, team, log, label);
      break;
    case "Necromancer":
      necromancer(soldier, g, team, random, log, label);
      break;
    case "Thundercaller":
      effectFocusIds = thundercaller(soldier, g, team, random, log, label);
      break;
    case "Runesinger":
      runesinger(soldier, g, team, log, label);
      break;
    default:
      log(`${label}: unknown archetype`);
  }
  return {
    acted: true,
    ...(effectFocusIds.length ? { effectFocusIds } : {}),
  };
}

function vanguard(
  soldier: Soldier,
  g: Grade,
  team: TeamState,
  log: LogFn,
  label: string,
): void {
  // Personal block + hit only — no party-wide pad (frontline redesign Phase 3).
  const table: Record<Grade, { personalBlock: number; dmg: number }> = {
    A: { personalBlock: 6, dmg: 11 },
    B: { personalBlock: 4, dmg: 9 },
    C: { personalBlock: 3, dmg: 6 },
    D: { personalBlock: 1, dmg: 4 },
    F: { personalBlock: 0, dmg: 2 },
  };
  const { personalBlock, dmg } = table[g];

  soldier.block += personalBlock;

  const r = hitEnemies(team, dmg, "single", 0, 0, soldier);
  const parts: string[] = [];
  if (personalBlock > 0) parts.push(`+${personalBlock} personal block`);
  else parts.push("no block");
  parts.push(`hits for ${r}`);
  log(`${label}: ${parts.join(", ")}`);
}

function shieldMaiden(
  soldier: Soldier,
  g: Grade,
  team: TeamState,
  _random: () => number,
  log: LogFn,
  label: string,
): void {
  if (g === "F") {
    if (team.partyShield.active && team.partyShield.remaining > 0) {
      team.partyShield = { remaining: 0, active: false, coveredIds: [] };
      log(`${label}: shield short-circuits — cover drops to 0`);
    } else {
      log(`${label}: no shield to short (nothing happens)`);
    }
    return;
  }

  const dmg = MAIDEN_DAMAGE[g];
  const coverHp = MAIDEN_SHIELD[g];
  const ally = mostLikelyToDie(team, soldier.id);
  const coveredIds = ally
    ? [soldier.id, ally.id]
    : [soldier.id];
  team.partyShield = {
    remaining: coverHp,
    active: true,
    coveredIds,
  };

  const r = hitEnemies(team, dmg, "single", 0, 0, soldier);
  const allyName = ally ? ally.name : "nobody";
  log(
    `${label}: attacks for ${r}; cover ${coverHp} on self + ${allyName} (this round)`,
  );
}

/**
 * FireMage — Wildfire AOE + boss Fire burn.
 * A/B: burn off Frozen and cleanse Ice/Slime on half the line (A front, B back).
 * Does not clear Fire/Poison (Healer).
 * Targets: A/B ≤3, C ≤2, D 1. F unchanged.
 */
function fireMage(
  soldier: Soldier,
  g: Grade,
  team: TeamState,
  log: LogFn,
  label: string,
): void {
  /** Ice + Slime only — Fire/Poison are Healer; Frozen is thawFrozen. */
  const mageCleanse: DotType[] = ["Ice", "Slime"];

  if (g === "F") {
    // F unchanged — party explosion, no enemy hit
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
    return;
  }

  const table: Record<
    Exclude<Grade, "F">,
    { dmg: number; targets: number; fireStacks: number; fireDuration: number }
  > = {
    A: { dmg: 9, targets: 3, fireStacks: 1, fireDuration: 2 },
    B: { dmg: 7, targets: 3, fireStacks: 1, fireDuration: 2 },
    C: { dmg: 6, targets: 2, fireStacks: 1, fireDuration: 2 },
    D: { dmg: 4, targets: 1, fireStacks: 0, fireDuration: 0 },
  };
  const t = table[g];

  // Snapshot so we only light enemies this cast actually touched
  const minionHpBefore = new Map(
    team.minions.map((m) => [m.id, m.currentHp] as const),
  );
  const bossHpBefore = team.boss?.currentHp ?? 0;

  const r = hitEnemies(team, t.dmg, "aoe", t.targets, 0, soldier);

  const burnBits: string[] = [];
  if (t.fireStacks > 0) {
    let touchedAny = false;
    for (const m of team.minions) {
      const prev = minionHpBefore.get(m.id) ?? m.currentHp;
      if (!(prev > 0 && m.currentHp < prev)) continue;
      touchedAny = true;
      // Still living → Fire chip + DoT tick; one-shots skip (already dead)
      if (m.currentHp > 0) {
        applyMinionDot(m, "Fire", t.fireStacks, t.fireDuration);
        burnBits.push(`${m.name} Fire×${t.fireStacks}`);
      }
    }
    const bossHit =
      !!team.boss && bossHpBefore > 0 && team.boss.currentHp < bossHpBefore;
    if (bossHit) touchedAny = true;
    // Boss burns if hit directly, or if the storm only raked adds (embers catch)
    if (team.boss && team.boss.currentHp > 0 && touchedAny) {
      applyBossDot(team.boss, "Fire", t.fireStacks, t.fireDuration);
      burnBits.push(`boss Fire×${t.fireStacks} (${t.fireDuration}r)`);
    }
  }
  const burnNote = burnBits.length ? `; ${burnBits.join(", ")}` : "";

  if (g === "A" || g === "B") {
    // A = front (1–3), B = back (4–6): thaw Frozen + cleanse Ice/Slime
    const seats =
      g === "A"
        ? livingParty(team).filter((s) => s.position && s.position <= 3)
        : livingParty(team).filter((s) => s.position && s.position >= 4);
    const side = g === "A" ? "front" : "back";
    const thawed = thawFrozen(seats);
    const n = cleanseDots(seats, mageCleanse);
    const extras: string[] = [];
    if (thawed) extras.push(`burned off Frozen (${thawed})`);
    if (n) extras.push(`cleansed Ice/Slime (${n})`);
    const extraNote = extras.length ? `; ${side}: ${extras.join(", ")}` : "";
    log(`${label}: Wildfire ${r}${burnNote}${extraNote}`);
    return;
  }
  if (g === "C") {
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
    log(
      `${label}: Wildfire ${r}${burnNote}; friendly fire (ignores shield/block): ${hits.join("; ") || "nobody"}`,
    );
    return;
  }
  // D — single-target ember, no burn, worse friendly fire
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
  log(
    `${label}: ember ${r}; friendly fire (ignores shield/block): ${hits.join("; ") || "nobody"}`,
  );
}

/** Healer — HP restore + cleanse Fire / Poison (not Ice, Slime, Marks, or Frozen). */
function healer(
  soldier: Soldier,
  g: Grade,
  team: TeamState,
  log: LogFn,
  label: string,
): void {
  // Fire + Poison only — Ice/Slime/Frozen are Fire Mage (color split).
  const healCleanse: DotType[] = ["Fire", "Poison"];

  if (g === "F") {
    const healed = healBoss(team, 8);
    log(`${label}: BACKLASH — boss heals ${healed}`);
    return;
  }
  if (g === "A") {
    const targets = livingParty(team);
    const cleansed = cleanseDots(targets, healCleanse);
    let total = 0;
    for (const s of targets) {
      total += healSoldier(s, 10);
    }
    log(
      `${label}: heals party ${total} total${cleansed ? `, cleanses Fire/Poison (${cleansed})` : ""}`,
    );
    return;
  }
  if (g === "B") {
    const targets = livingParty(team).filter(
      (x) => x.position && x.position <= 3,
    );
    const cleansed = cleanseDots(targets, healCleanse);
    let total = 0;
    for (const s of targets) {
      total += healSoldier(s, 10);
    }
    log(
      `${label}: heals front ${total}${cleansed ? `, cleanses Fire/Poison (${cleansed})` : ""}`,
    );
    return;
  }
  if (g === "C") {
    const targets = livingParty(team).filter(
      (x) => x.position && x.position >= 4,
    );
    const cleansed = cleanseDots(targets, healCleanse);
    let total = 0;
    for (const s of targets) {
      total += healSoldier(s, 6);
    }
    log(
      `${label}: heals back ${total}${cleansed ? `, cleanses Fire/Poison (${cleansed})` : ""}`,
    );
    return;
  }
  // D — self heal only (no cleanse)
  const h = healSoldier(soldier, 8);
  log(`${label}: self-heal ${h}`);
}

/**
 * Archer — Arrow Storm: AOE by grade (A/B≤3, C≤2, D=1), lower per-target damage.
 * Small minion bonus so add-clear stays the job without old single-target boss spikes.
 * F unchanged (misfire).
 */
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
  const table: Record<
    Exclude<Grade, "F">,
    { dmg: number; targets: number; vsMinion: number }
  > = {
    // 10+2=12 vs minion → one-shots Frost Archers; mites (7) die easily
    A: { dmg: 10, targets: 3, vsMinion: 2 },
    B: { dmg: 8, targets: 3, vsMinion: 1 },
    C: { dmg: 6, targets: 2, vsMinion: 1 },
    D: { dmg: 4, targets: 1, vsMinion: 1 },
  };
  const t = table[g as Exclude<Grade, "F">];
  const r = hitEnemies(team, t.dmg, "aoe", t.targets, t.vsMinion, soldier);
  log(`${label}: Arrow Storm ${r}`);
}

/**
 * Spearman — single-target thrust + A–D Parry (boss damage reduce this round).
 * Gap rule: pos 1 prefers minions via hitEnemies; front without Parry is vulnerable
 * to boss hits (see applySpearmanBossDefense).
 */
function spearman(
  soldier: Soldier,
  g: Grade,
  team: TeamState,
  log: LogFn,
  label: string,
): void {
  const dmg = SPEARMAN_DAMAGE[g];
  // Replace any prior parry this round
  soldier.statuses = soldier.statuses.filter((st) => st.kind !== "Parry");
  const parts: string[] = [];

  if (g !== "F") {
    const reduction = SPEARMAN_PARRY_REDUCTION[g];
    soldier.statuses.push({ kind: "Parry", reduction });
    const pct = Math.round(reduction * 100);
    parts.push(`parry ${pct}% boss damage this round`);
  } else {
    parts.push("no parry");
  }

  const r = hitEnemies(team, dmg, "single", 0, 0, soldier);
  parts.push(`thrust hits for ${r}`);
  log(`${label}: ${parts.join("; ")}`);
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
/**
 * @returns Extra focus ids for presentation (F overload always aims someone).
 */
function thundercaller(
  soldier: Soldier,
  g: Grade,
  team: TeamState,
  random: () => number,
  log: LogFn,
  label: string,
): string[] {
  const tryBossStun = (): string => {
    if (!team.boss || team.boss.currentHp <= 0) return "";
    // Rattle Captain (and any StunImmune trait) cannot be stunned
    if (
      team.boss.id === "rattle_captain" ||
      team.boss.traits?.includes("StunImmune")
    ) {
      return "; sparks skitter off — boss immune to stun";
    }
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
        `${label}: OVERLOAD crackles with nowhere to land — no remaining token-holders`,
      );
      return [];
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
    // Always FX the aimed ally (even when stun fails — shock still hits the panel)
    return [target.id];
  }

  if (g === "A") {
    // Rez first if an eligible corpse exists (once per soldier per fight)
    const revived = tryThundercallerRez(team, soldier, log, label);
    if (revived) return revived;

    const r = hitEnemies(team, 14, "single", 0, 0, soldier);
    const stun = tryBossStun();
    for (const s of livingParty(team).filter(
      (x) => x.position && x.position <= 3,
    )) {
      applyCharge(s, 3);
    }
    log(`${label}: lightning ${r}${stun}; front line charged +3 next attack`);
    return [];
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
    return [];
  }
  if (g === "C") {
    const r = hitEnemies(team, 9, "single", 0, 0, soldier);
    const stun = tryBossStun();
    log(`${label}: lightning ${r}${stun}`);
    return [];
  }
  // D
  const r = hitEnemies(team, 6, "single", 0, 0, soldier);
  log(`${label}: lightning ${r}`);
  return [];
}

/**
 * Thundercaller A: revive one dead party soldier at low HP + Dazed.
 * Once per soldier id per boss fight. Prefer lowest position / party order.
 * @returns focus ids if rez happened, else null (caller falls through to attack).
 */
function tryThundercallerRez(
  team: TeamState,
  _caster: Soldier,
  log: LogFn,
  label: string,
): string[] | null {
  const already = new Set(team.revivedSoldierIdsThisFight ?? []);
  // Prefer active-party corpses that still have a seat, then any roster dead
  const partyDead = team.activePartyIds
    .map((id) => team.roster.find((s) => s.id === id))
    .filter((s): s is Soldier => !!s && !s.alive && !already.has(s.id));
  const benchDead = team.roster.filter(
    (s) =>
      !s.alive &&
      !already.has(s.id) &&
      !team.activePartyIds.includes(s.id),
  );
  const candidates = [...partyDead, ...benchDead];
  if (!candidates.length) return null;

  candidates.sort(
    (a, b) => (a.position ?? 99) - (b.position ?? 99) || a.id.localeCompare(b.id),
  );
  const target = candidates[0]!;
  const hp = thundercallerRezHp(target.maxHp);
  target.alive = true;
  target.currentHp = hp;
  target.statuses = [{ kind: "Dazed", duration: 1 }];
  target.block = 0;
  // Clear death presentation flag if present
  (target as Soldier & { deathLogged?: boolean }).deathLogged = false;

  if (!team.revivedSoldierIdsThisFight) team.revivedSoldierIdsThisFight = [];
  team.revivedSoldierIdsThisFight.push(target.id);

  log(
    `${label}: REVIVE — ${target.name} returns at ${hp} HP (dazed next action; once per fight)`,
  );
  return [target.id];
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
