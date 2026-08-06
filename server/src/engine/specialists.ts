import {
  GRADE_RANK,
  HEALER_BOSS_HEAL,
  HEALER_HEAL,
  MAIDEN_DAMAGE,
  MAIDEN_SHIELD,
  NECRO_DRAIN,
  NECRO_LIFE_POWER,
  RUNESINGER_HOT_PER_TICK,
  RUNESINGER_HOT_TICKS,
  SPEARMAN_DAMAGE,
  SPEARMAN_PARRY_REDUCTION,
  VANGUARD_DAMAGE,
  VANGUARD_PERSONAL_BLOCK,
  downgradeGrade,
  randomInt,
  runesingerBGrade,
  thundercallerRezHp,
  upgradeGrade,
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
  applyHot,
  applyMinionDot,
  cleanseDots,
  crackAllChainFrozen,
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

/**
 * After Healer/Runesinger base action: purple rain cue.
 * Base heal/HoT always applies first. Purple rain then:
 * - clean seats → bonus HP
 * - dirty seats (Fire/Poison washed) → purple FX only (no extra HP)
 */
export type LifePowerFollowUp = {
  bonus: number;
  /** Clean seats — purple rain adds bonus HP (base heal/HoT already applied) */
  healTargetIds: string[];
  /** Dirty seats washed of Fire/Poison — purple FX only, no purple bonus HP */
  cleanseTargetIds: string[];
  /** Support soldier id (Healer/Runesinger) — Life Power is stripped after pulse */
  supportId: string;
};

const LIFE_POWER_CLEANSE: DotType[] = ["Fire", "Poison"];

function hasFireOrPoison(s: Soldier): boolean {
  return s.statuses.some(
    (st) => st.kind === "Dot" && (st.type === "Fire" || st.type === "Poison"),
  );
}

/** Remove matching DoTs and retain the seats that visibly changed. */
function cleanseDotsWithTargets(
  soldiers: Soldier[],
  types: DotType[],
): { removed: number; targetIds: string[] } {
  const before = new Map(
    soldiers.map((soldier) => [
      soldier.id,
      soldier.statuses.filter(
        (status) => status.kind === "Dot" && types.includes(status.type),
      ).length,
    ]),
  );
  const removed = cleanseDots(soldiers, types);
  const targetIds = soldiers
    .filter((soldier) => {
      const after = soldier.statuses.filter(
        (status) => status.kind === "Dot" && types.includes(status.type),
      ).length;
      return after < (before.get(soldier.id) ?? 0);
    })
    .map((soldier) => soldier.id);
  return { removed, targetIds };
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
  /** Party seats that actually had one or more DoTs removed by this action. */
  cleanseTargetIds?: string[];
  /**
   * Healer/Runesinger spent a heal while holding Life Power — combat applies
   * bonus heals and a second purple-rain cue after the base action beat.
   */
  lifePowerFollowUp?: LifePowerFollowUp;
  /**
   * Chain Frozen cracked with an A — combat plays ice-break FX on cracked seats
   * instead of a normal kit action.
   */
  iceBreak?: boolean;
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

  // Frozen — soft: waste claim and clear. Chain: A cracks all ice; else waste.
  const frozen = soldier.statuses.find((s) => s.kind === "Frozen");
  if (frozen && frozen.kind === "Frozen") {
    if (frozen.soft) {
      soldier.statuses = soldier.statuses.filter(
        (st) => !(st.kind === "Frozen" && st.soft),
      );
      log(`${label}: FROZEN — token wasted (ice lock ends)!`);
      return { acted: false, skipReason: "frozen" };
    }
    // Chain Frozen: effective A cracks every chain ice block on the party
    if (g === "A") {
      const crackedIds = crackAllChainFrozen(team);
      const n = crackedIds.length;
      log(
        `${label}: cracks the ice free! (${n} ice block${n === 1 ? "" : "s"} shatter — no boss shatter)`,
      );
      return {
        acted: true,
        iceBreak: true,
        effectFocusIds: crackedIds.length ? crackedIds : [soldier.id],
      };
    }
    log(`${label}: FROZEN — token wasted, cannot act!`);
    return { acted: false, skipReason: "frozen" };
  }

  // Party stun (Thundercaller F / Rattle Captain) — waste this claim.
  // Duration is in party rounds; cleared by tickPartyStuns after the party phase
  // (sitting out a round still counts down — no infinite carry if they never claim).
  const stun = soldier.statuses.find((s) => s.kind === "Stun");
  if (stun && stun.kind === "Stun" && stun.duration > 0) {
    const left = stun.duration;
    log(
      `${label}: STUNNED — loses their attack! (${left} round${left === 1 ? "" : "s"} left)`,
    );
    return { acted: false, skipReason: "stun" };
  }

  // Dazed after Thundercaller rez — skip one attack, then clear
  const dazed = soldier.statuses.find((s) => s.kind === "Dazed");
  if (dazed && dazed.kind === "Dazed" && dazed.duration > 0) {
    soldier.statuses = soldier.statuses.filter((s) => s.kind !== "Dazed");
    log(`${label}: DAZED — heart still reeling from the shock, loses their claim!`);
    return { acted: false, skipReason: "dazed" };
  }

  let effectFocusIds: string[] = [];
  let cleanseTargetIds: string[] = [];
  let lifePowerFollowUp: LifePowerFollowUp | undefined;
  switch (soldier.archetype) {
    case "Vanguard":
      vanguard(soldier, g, team, log, label);
      break;
    case "ShieldMaiden":
      cleanseTargetIds = shieldMaiden(soldier, g, team, random, log, label);
      break;
    case "FireMage":
      cleanseTargetIds = fireMage(soldier, g, team, log, label);
      break;
    case "Healer":
      lifePowerFollowUp = healer(soldier, g, team, log, label);
      break;
    case "Archer":
      archer(soldier, g, team, random, log, label);
      break;
    case "Spearman":
      spearman(soldier, g, team, log, label);
      break;
    case "Necromancer":
      effectFocusIds = necromancer(soldier, g, team, random, log, label);
      break;
    case "Thundercaller":
      effectFocusIds = thundercaller(soldier, g, team, random, log, label);
      break;
    case "Runesinger":
      lifePowerFollowUp = runesinger(soldier, g, team, log, label);
      break;
    default:
      log(`${label}: unknown archetype`);
  }
  return {
    acted: true,
    ...(effectFocusIds.length ? { effectFocusIds } : {}),
    ...(cleanseTargetIds.length ? { cleanseTargetIds } : {}),
    ...(lifePowerFollowUp ? { lifePowerFollowUp } : {}),
  };
}

/**
 * After party resolve: count down Stun by 1 round on every living soldier.
 * Removes stun at 0 even if they never claimed a token this round.
 */
export function tickPartyStuns(team: TeamState, log: LogFn): void {
  for (const s of livingParty(team)) {
    const stun = s.statuses.find((st) => st.kind === "Stun");
    if (!stun || stun.kind !== "Stun" || stun.duration <= 0) continue;
    stun.duration -= 1;
    if (stun.duration <= 0) {
      s.statuses = s.statuses.filter((st) => st.kind !== "Stun");
      log(`${s.name}'s stun wears off`, ["party", "stun"]);
    }
  }
}

/** Living Healer or Runesinger on the line (back-seat support for Life Power). */
function livingBackSupport(team: TeamState): Soldier | undefined {
  return livingParty(team).find(
    (s) => s.archetype === "Healer" || s.archetype === "Runesinger",
  );
}

/** Grant Last Stand (replace any existing). */
function grantLastStand(targets: Soldier[]): number {
  let n = 0;
  for (const t of targets) {
    if (!t.alive) continue;
    t.statuses = t.statuses.filter((st) => st.kind !== "LastStand");
    t.statuses.push({ kind: "LastStand" });
    n += 1;
  }
  return n;
}

/**
 * If this support holds Life Power and affected at least one ally (heal and/or
 * cleanse), schedule purple rain (bonus HP only on heal seats).
 */
function lifePowerFollowUpIfReady(
  support: Soldier,
  healTargetIds: string[],
  cleanseTargetIds: string[] = [],
): LifePowerFollowUp | undefined {
  const heals = [...new Set(healTargetIds)];
  const cleanses = [...new Set(cleanseTargetIds)];
  if (!heals.length && !cleanses.length) return undefined;
  const lp = support.statuses.find((st) => st.kind === "LifePower");
  if (!lp || lp.kind !== "LifePower" || lp.bonus <= 0) return undefined;
  return {
    bonus: lp.bonus,
    healTargetIds: heals,
    cleanseTargetIds: cleanses,
    supportId: support.id,
  };
}

/** Sort living party by lowest current HP, then front-most. */
function byLowestHp(a: Soldier, b: Soldier): number {
  if (a.currentHp !== b.currentHp) return a.currentHp - b.currentHp;
  return (a.position ?? 99) - (b.position ?? 99);
}

function vanguard(
  soldier: Soldier,
  g: Grade,
  team: TeamState,
  log: LogFn,
  label: string,
): void {
  const personalBlock = VANGUARD_PERSONAL_BLOCK[g];
  const dmg = VANGUARD_DAMAGE[g];
  const parts: string[] = [];

  // A/B — Last Stand (party emergency ward for the next boss window)
  if (g === "A") {
    const n = grantLastStand(livingParty(team));
    parts.push(`Last Stand on all (${n})`);
  } else if (g === "B") {
    const front = livingParty(team).filter(
      (s) => s.position != null && s.position <= 3,
    );
    const n = grantLastStand(front);
    parts.push(`Last Stand on front (${n})`);
  }

  if (personalBlock > 0) {
    soldier.block += personalBlock;
    parts.push(`+${personalBlock} personal block`);
  } else {
    parts.push("no block");
  }

  const r = hitEnemies(team, dmg, "single", 0, 0, soldier);
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
): string[] {
  if (g === "F") {
    if (team.partyShield.active && team.partyShield.remaining > 0) {
      team.partyShield = { remaining: 0, active: false, coveredIds: [] };
      log(`${label}: shield short-circuits — cover drops to 0`);
    } else {
      log(`${label}: no shield to short (nothing happens)`);
    }
    return [];
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

  // Fire/Poison cleanse: A all / B front / C back / D self only
  const maidenCleanse: DotType[] = ["Fire", "Poison"];
  let cleanseTargetIds: string[] = [];
  let cleansedCount = 0;
  if (g === "A" || g === "B" || g === "C" || g === "D") {
    const seats =
      g === "A"
        ? livingParty(team)
        : g === "B"
          ? livingParty(team).filter((s) => s.position != null && s.position <= 3)
          : g === "C"
            ? livingParty(team).filter((s) => s.position != null && s.position >= 4)
            : [soldier]; // D — always cleanse herself
    const result = cleanseDotsWithTargets(seats, maidenCleanse);
    cleansedCount = result.removed;
    cleanseTargetIds = result.targetIds;
  }

  const allyName = ally ? ally.name : "nobody";
  if (cleanseTargetIds.length) {
    const scope = g === "D" ? " on self" : "";
    log(
      `${label}: cleanses Fire/Poison${scope} (${cleansedCount}); no attack; cover ${coverHp} on self + ${allyName} (this round)`,
    );
  } else {
    const r = hitEnemies(team, dmg, "single", 0, 0, soldier);
    log(
      `${label}: attacks for ${r}; cover ${coverHp} on self + ${allyName} (this round)`,
    );
  }
  return cleanseTargetIds;
}

/**
 * FireMage — Wildfire AOE + boss Fire burn.
 * Gap rule: fixed seats 1–3 hit minions first; back seats hit the boss.
 * A/B: cleanse Chill/Ice/Slime on half the line (A front, B back).
 * Does not thaw chain Frozen (A on a frozen hero cracks ice). Does not clear Fire/Poison.
 * Targets: A/B ≤3, C ≤2, D 1. C has no friendly fire; D/F still punish the party.
 */
function fireMage(
  soldier: Soldier,
  g: Grade,
  team: TeamState,
  log: LogFn,
  label: string,
): string[] {
  /** Chill + Ice + Slime — Fire/Poison are Shield Maiden; chain Frozen is A-break. */
  const mageCleanse: DotType[] = ["Chill", "Ice", "Slime"];

  if (g === "F") {
    // F unchanged — party explosion, no enemy hit (Frozen ice still blocks)
    const hits: string[] = [];
    for (const s of livingParty(team)) {
      const r = applyPartyDamage(s, 3, team.partyShield, {
        bypassAbsorb: true,
        team,
        source: "friendly_fire",
      });
      hits.push(
        r.hpLost === 0 &&
          s.statuses.some((st) => st.kind === "Frozen")
          ? `${s.name} ice shell`
          : formatPartyHit(s, r),
      );
    }
    log(`${label}: EXPLOSION (ignores shield/block)! ${hits.join("; ")}`);
    return [];
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

  // Gap rule applied inside hitEnemies (fixed seats 1–3 or Archer → minions)
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
    // A = front (1–3), B = back (4–6): cleanse Chill/Ice/Slime (not Frozen)
    const seats =
      g === "A"
        ? livingParty(team).filter((s) => s.position && s.position <= 3)
        : livingParty(team).filter((s) => s.position && s.position >= 4);
    const side = g === "A" ? "front" : "back";
    const result = cleanseDotsWithTargets(seats, mageCleanse);
    const n = result.removed;
    const extras: string[] = [];
    if (n) extras.push(`cleansed Chill/Ice/Slime (${n})`);
    const extraNote = extras.length ? `; ${side}: ${extras.join(", ")}` : "";
    log(`${label}: Wildfire ${r}${burnNote}${extraNote}`);
    return result.targetIds;
  }
  if (g === "C") {
    // Solid mid grade: multi-hit + boss Fire, no friendly fire
    log(`${label}: Wildfire ${r}${burnNote}`);
    return [];
  }
  // D — single-target ember, no burn, friendly fire front (Frozen ice still blocks)
  const hits: string[] = [];
  for (const pos of [1, 2] as const) {
    const s = soldierAt(team, pos);
    if (s) {
      const res = applyPartyDamage(s, 3, team.partyShield, {
        bypassAbsorb: true,
        team,
        source: "friendly_fire",
      });
      hits.push(
        res.hpLost === 0 && s.statuses.some((st) => st.kind === "Frozen")
          ? `${s.name} ice shell`
          : formatPartyHit(s, res),
      );
    }
  }
  log(
    `${label}: ember ${r}; friendly fire (ignores shield/block): ${hits.join("; ") || "nobody"}`,
  );
  return [];
}

/**
 * Healer — instant triage (A all / B two lowest / C one / D tiny all / F boss).
 * Uncharged: heal only (Maiden is primary Fire/Poison strip).
 * Life Power charge: base heal still applies to every target; dirty seats also
 * wash Fire/Poison. Purple rain: bonus HP on clean seats only; wash FX on dirty.
 */
function healer(
  soldier: Soldier,
  g: Grade,
  team: TeamState,
  log: LogFn,
  label: string,
): LifePowerFollowUp | undefined {
  if (g === "F") {
    const healed = healBoss(team, HEALER_BOSS_HEAL);
    log(`${label}: BACKLASH — boss heals ${healed}`);
    return undefined;
  }

  const amount = HEALER_HEAL[g];
  let targets: Soldier[] = [];
  if (g === "A" || g === "D") {
    targets = livingParty(team);
  } else if (g === "B") {
    targets = livingParty(team).slice().sort(byLowestHp).slice(0, 2);
  } else {
    // C — single lowest
    const one = livingParty(team).slice().sort(byLowestHp)[0];
    targets = one ? [one] : [];
  }

  const charged = soldier.statuses.some((st) => st.kind === "LifePower");
  let total = 0;
  let stripCount = 0;
  /** Clean seats → purple bonus HP */
  const healIds: string[] = [];
  /** Dirty seats washed → purple FX only */
  const cleanseIds: string[] = [];

  for (const t of targets) {
    const dirty = charged && hasFireOrPoison(t);
    if (dirty) {
      stripCount += cleanseDots([t], LIFE_POWER_CLEANSE);
      cleanseIds.push(t.id);
    }
    // Base triage heal always lands — Life Power never cancels it.
    const got = healSoldier(t, amount);
    total += got;
    if (t.alive && !dirty) healIds.push(t.id);
  }

  const who =
    g === "A" || g === "D"
      ? "party"
      : g === "B"
        ? targets.map((t) => t.name).join(" + ") || "nobody"
        : targets[0]?.name ?? "nobody";
  const wash =
    stripCount > 0
      ? `; Life Power wash Fire/Poison (${stripCount}, no purple bonus on those)`
      : "";
  log(`${label}: heals ${who} +${amount} each (${total} total HP)${wash}`);
  return lifePowerFollowUpIfReady(soldier, healIds, cleanseIds);
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
        team,
        source: "friendly_fire",
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
 * Spearman — single-target thrust + A–D Parry and Penetrate.
 * Fixed seats 1–3 prefer minions; front without Parry is vulnerable
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

  const r = hitEnemies(team, dmg, "single", 0, 0, soldier, {
    penetrateMinionOverkill: g !== "F",
  });
  parts.push(`thrust hits for ${r}`);
  log(`${label}: ${parts.join("; ")}`);
}

/**
 * Necromancer — drain + Life Power on Healer or Runesinger (A–C).
 * No direct ally heal. D self-risk; F hits highest ally.
 * @returns focus ids (support empowered) for presentation.
 */
function necromancer(
  soldier: Soldier,
  g: Grade,
  team: TeamState,
  _random: () => number,
  log: LogFn,
  label: string,
): string[] {
  if (g === "F") {
    const allies = livingParty(team)
      .slice()
      .sort((a, b) => b.currentHp - a.currentHp || a.position! - b.position!);
    const target = allies[0];
    if (!target) {
      log(`${label}: BACKLASH — no allies to hit`);
      return [];
    }
    const hit = applyPartyDamage(target, 10, team.partyShield, {
      bypassAbsorb: true,
      team,
      source: "friendly_fire",
    });
    log(
      `${label}: BACKLASH — drains ${formatPartyHit(target, hit)} (highest HP, ignores shield/block)`,
    );
    return [target.id];
  }

  const dmg = NECRO_DRAIN[g];
  const r = hitEnemies(team, dmg, "single", 0, 0, soldier);
  const focus: string[] = [];

  if (g === "D") {
    applyPartyDamage(soldier, 3, team.partyShield, {
      bypassAbsorb: true,
      team,
      source: "friendly_fire",
    });
    log(`${label}: drain ${r}; self-damage 3`);
    return focus;
  }

  // A–C: Life Power on living back-seat support (Healer or Runesinger)
  const bonus = NECRO_LIFE_POWER[g];
  const support = livingBackSupport(team);
  if (support) {
    // No stacking — replace existing Life Power
    support.statuses = support.statuses.filter((st) => st.kind !== "LifePower");
    support.statuses.push({ kind: "LifePower", bonus });
    focus.push(support.id);
    log(
      `${label}: drain ${r}; Life Power +${bonus} on ${support.name} (${support.archetype}) — next heal/hymn: normal mend still applies; dirty seats also wash Fire/Poison (no purple); clean seats get purple +${bonus}`,
    );
  } else {
    log(`${label}: drain ${r}; no Healer/Runesinger to empower`);
  }
  return focus;
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
  // Dazed: skip next claim. Last Stand: survive one lethal hit this boss phase
  // so a healer can top them up (without it, ~10% HP is a free boss kill).
  target.statuses = [
    { kind: "Dazed", duration: 1 },
    { kind: "LastStand" },
  ];
  target.block = 0;
  // Clear death presentation flag if present
  (target as Soldier & { deathLogged?: boolean }).deathLogged = false;

  if (!team.revivedSoldierIdsThisFight) team.revivedSoldierIdsThisFight = [];
  team.revivedSoldierIdsThisFight.push(target.id);

  log(
    `${label}: shock restarts ${target.name}'s heart — ${hp} HP + Last Stand; skips next claim (dazed; once per soldier per fight)`,
  );
  return [target.id];
}

/**
 * Runesinger — always resolves first (see combat action order).
 * Rewrites this drop’s claim grades, then applies slow gold HoT (no cleanse).
 * Mutates `team.lastClaims` / shared ClaimResult objects in place.
 * Life Power (Necro) adds a purple instant bonus on hymn targets after the cast beat.
 */
function runesinger(
  soldier: Soldier,
  g: Grade,
  team: TeamState,
  log: LogFn,
  label: string,
): LifePowerFollowUp | undefined {
  const claims = team.lastClaims ?? [];

  const describeClaims = (): string =>
    claims
      .map((c) => {
        const s = team.roster.find((x) => x.id === c.soldierId);
        return `${s?.name ?? "?"}:${c.effectiveGrade}`;
      })
      .join(", ");

  const charged = soldier.statuses.some((st) => st.kind === "LifePower");

  /**
   * Life Power: base hymn HoT always applies; dirty seats also wash Fire/Poison.
   * Purple rain: bonus on clean seats only; wash FX on dirty.
   * Returns purple-bonus ids and cleanse ids (not "who got HoT").
   */
  const applyHymnHot = (
    targets: Soldier[],
    perTick: number,
  ): { healIds: string[]; cleanseIds: string[]; stripCount: number; hotCount: number } => {
    const healIds: string[] = [];
    const cleanseIds: string[] = [];
    let stripCount = 0;
    let hotCount = 0;
    for (const t of targets) {
      if (!t.alive) continue;
      const dirty = charged && hasFireOrPoison(t);
      if (dirty) {
        stripCount += cleanseDots([t], LIFE_POWER_CLEANSE);
        cleanseIds.push(t.id);
      }
      // Base hymn always lands — Life Power never cancels it.
      applyHot(t, perTick, RUNESINGER_HOT_TICKS, "Runesinger");
      hotCount += 1;
      if (!dirty) healIds.push(t.id);
    }
    return { healIds, cleanseIds, stripCount, hotCount };
  };

  if (g === "A") {
    for (const c of claims) {
      c.effectiveGrade = upgradeGrade(c.effectiveGrade, 2);
    }
    const targets = livingParty(team);
    const { healIds, cleanseIds, stripCount, hotCount } = applyHymnHot(
      targets,
      RUNESINGER_HOT_PER_TICK.A,
    );
    const wash =
      stripCount > 0
        ? `; Life Power wash Fire/Poison (${stripCount}, no purple on those)`
        : "";
    log(
      `${label}: all claims +2 — [${describeClaims()}]; hymn HoT all (+${RUNESINGER_HOT_PER_TICK.A}×${RUNESINGER_HOT_TICKS} on ${hotCount})${wash}`,
    );
    return lifePowerFollowUpIfReady(soldier, healIds, cleanseIds);
  }

  if (g === "B") {
    for (const c of claims) {
      c.effectiveGrade = runesingerBGrade(c.effectiveGrade);
    }
    const targets = livingParty(team).filter(
      (x) => x.position != null && x.position <= 3,
    );
    const { healIds, cleanseIds, stripCount, hotCount } = applyHymnHot(
      targets,
      RUNESINGER_HOT_PER_TICK.B,
    );
    const wash =
      stripCount > 0
        ? `; Life Power wash Fire/Poison (${stripCount}, no purple on those)`
        : "";
    log(
      `${label}: F/D→C, C→B — [${describeClaims()}]; hymn HoT front (+${RUNESINGER_HOT_PER_TICK.B}×${RUNESINGER_HOT_TICKS} on ${hotCount})${wash}`,
    );
    return lifePowerFollowUpIfReady(soldier, healIds, cleanseIds);
  }

  if (g === "C") {
    // Worst claim → C; ties → front-most (lowest position)
    if (claims.length) {
      let worst = claims[0]!;
      for (const c of claims) {
        const wr = GRADE_RANK[worst.effectiveGrade];
        const cr = GRADE_RANK[c.effectiveGrade];
        if (cr > wr) {
          worst = c;
          continue;
        }
        if (cr < wr) continue;
        const wPos =
          team.roster.find((s) => s.id === worst.soldierId)?.position ?? 99;
        const cPos =
          team.roster.find((s) => s.id === c.soldierId)?.position ?? 99;
        if (cPos < wPos) worst = c;
      }
      const before = worst.effectiveGrade;
      if (GRADE_RANK[before] > GRADE_RANK.C) {
        worst.effectiveGrade = "C";
        const who =
          team.roster.find((s) => s.id === worst.soldierId)?.name ?? "?";
        const targets = livingParty(team).filter(
          (x) => x.position != null && x.position >= 4,
        );
        const { healIds, cleanseIds, stripCount, hotCount } = applyHymnHot(
          targets,
          RUNESINGER_HOT_PER_TICK.C,
        );
        const wash =
          stripCount > 0
            ? `; Life Power wash Fire/Poison (${stripCount}, no purple on those)`
            : "";
        log(
          `${label}: worst claim ${who} ${before}→C — [${describeClaims()}]; hymn HoT back (+${RUNESINGER_HOT_PER_TICK.C}×${RUNESINGER_HOT_TICKS} on ${hotCount})${wash}`,
        );
        return lifePowerFollowUpIfReady(soldier, healIds, cleanseIds);
      }
    }
    const targets = livingParty(team).filter(
      (x) => x.position != null && x.position >= 4,
    );
    const { healIds, cleanseIds, stripCount, hotCount } = applyHymnHot(
      targets,
      RUNESINGER_HOT_PER_TICK.C,
    );
    const wash =
      stripCount > 0
        ? `; Life Power wash Fire/Poison (${stripCount}, no purple on those)`
        : "";
    log(
      `${label}: no claim worse than C — [${describeClaims()}]; hymn HoT back (+${RUNESINGER_HOT_PER_TICK.C}×${RUNESINGER_HOT_TICKS} on ${hotCount})${wash}`,
    );
    return lifePowerFollowUpIfReady(soldier, healIds, cleanseIds);
  }

  if (g === "D") {
    const { healIds, cleanseIds, stripCount } = applyHymnHot(
      [soldier],
      RUNESINGER_HOT_PER_TICK.D,
    );
    const wash =
      stripCount > 0
        ? `; Life Power wash Fire/Poison (${stripCount}, no purple on self)`
        : "";
    log(
      `${label}: soft hymn — self HoT +${RUNESINGER_HOT_PER_TICK.D}×${RUNESINGER_HOT_TICKS} (no rewrite)${wash}`,
    );
    return lifePowerFollowUpIfReady(soldier, healIds, cleanseIds);
  }

  // F — every token shifts down one grade (F stays F); no HoT — Life Power not spent
  for (const c of claims) {
    c.effectiveGrade = downgradeGrade(c.effectiveGrade);
  }
  log(`${label}: corrupted hymn — all claims shift down — [${describeClaims()}]`);
  return undefined;
}
