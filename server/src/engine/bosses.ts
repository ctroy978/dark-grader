import {
  isRattleStunKitAttack,
  RATTLE_NEIGHBOR_STUN_PENALTY,
  RATTLE_SPARK_STUN_CHANCE,
  SPREADING_FROST_CHANCE,
  SPREADING_FROST_LINE_DAMAGE,
  THUNDERCALLER_BOSS_STUN_CHANCE,
  type Minion,
  type Soldier,
  type TeamState,
} from "@dungeon-grades/shared";
import { adjacentPositions } from "@dungeon-grades/shared";
import { applyPartyDamage, livingParty, soldierAt } from "./damage.js";
import { applyDot, applyFrozen, partyHasFrozen } from "./dots.js";
import {
  attackDef,
  getBossTemplate,
  pickFromPool,
  type BossSummonDef,
  type BossTemplate,
} from "../seed/bossLoader.js";

/** Half damage vs Thundercaller while fighting Rattle Captain. */
function scaleBossDamageToSoldier(
  team: TeamState,
  soldier: Soldier,
  amount: number,
): number {
  if (
    team.boss?.id === "rattle_captain" &&
    soldier.archetype === "Thundercaller"
  ) {
    return Math.floor(amount * 0.5);
  }
  return amount;
}

/** Party stun on a line seat (Rattle Captain). Magnet still moves freely. */
function trySeatStun(
  team: TeamState,
  pos: number,
  chance: number,
  random: () => number,
  log: LogFn,
  always = false,
): boolean {
  const s = soldierAt(team, pos);
  if (!s) return false;
  // Thundercaller is immune to Rattle Captain seat stuns
  if (s.archetype === "Thundercaller") {
    log(`  ${s.name} (Thundercaller) shrugs off the arc`);
    return false;
  }
  if (!always && random() >= chance) return false;
  s.statuses = s.statuses.filter((st) => st.kind !== "Stun");
  s.statuses.push({ kind: "Stun", duration: 1 });
  log(`  ${s.name} is stunned by the arc!`);
  return true;
}

function fallbackTemplateFromBoss(team: TeamState): BossTemplate {
  const boss = team.boss!;
  return {
    id: boss.id,
    name: boss.name,
    maxHp: boss.maxHp,
    traits: boss.traits,
    attackIds: boss.attackIds,
    difficulty: "",
    summary: "",
    recommendedRounds: "",
    enrageHpPct: 0.4,
    enrageDamageMult: 1.3,
    gruntPool: [],
    laughPool: [],
    attacks: boss.attackIds.map((id) => ({
      id,
      weight: 2,
      bubble_lines: [],
    })),
    audio: [],
  };
}

export type LogFn = (text: string) => void;

/** Legacy defaults when TOML has no summon block (older content packs). */
const DEFAULT_SUMMONS: Record<string, BossSummonDef> = {
  SummonBoneArchers: {
    minionId: "bone_archer",
    minionName: "Bone Archer",
    maxHp: 12,
    damage: 4,
    maxCount: 2,
    freeVolley: true,
    openCount: 0,
    shotSfx: "minion_bone_archer",
    shotBubble: "Loose!",
  },
  SummonMossMites: {
    minionId: "moss_mite",
    minionName: "Moss Mite",
    maxHp: 7,
    damage: 3,
    maxCount: 2,
    freeVolley: false,
    openCount: 1,
    shotSfx: "minion_moss_mite",
    shotBubble: "Nibble!",
  },
  SummonCinderImps: {
    minionId: "cinder_imp",
    minionName: "Cinder Imp",
    maxHp: 11,
    damage: 3,
    maxCount: 2,
    freeVolley: false,
    openCount: 1,
    onHitDot: { type: "Fire", stacks: 1 },
    shotSfx: "minion_cinder_imp",
    shotBubble: "Spit!",
  },
  SummonOhms: {
    minionId: "ohm",
    minionName: "Ohm",
    maxHp: 8,
    damage: 2,
    maxCount: 2,
    freeVolley: false,
    openCount: 1,
    shotSfx: "minion_bone_archer",
    shotBubble: "Zap!",
  },
};

function minionFromSpec(
  spec: BossSummonDef,
  id: string,
): Minion {
  return {
    id,
    name: spec.minionName,
    maxHp: spec.maxHp,
    currentHp: spec.maxHp,
    damage: spec.damage,
    kind: spec.minionId,
    shotSfx: spec.shotSfx ?? `minion_${spec.minionId}`,
    shotBubble: spec.shotBubble,
    ...(spec.onHitDot ? { onHitDot: { ...spec.onHitDot } } : {}),
  };
}

/** Direct damage + optional on-hit DoT for a minion volley shot. */
function resolveMinionShot(
  team: TeamState,
  minion: Minion,
  target: Soldier,
  amount: number,
  log: LogFn,
): number {
  const scaled = scaleBossDamageToSoldier(team, target, amount);
  const { hpLost } = applyPartyDamage(target, scaled, team.partyShield);
  log(`${minion.name} fires at ${target.name} for ${hpLost} HP`);
  if (minion.onHitDot && minion.onHitDot.stacks > 0) {
    applyDot(target, minion.onHitDot.type, minion.onHitDot.stacks, undefined, true);
    log(
      `  ${target.name} catches fire (${minion.onHitDot.type} ×${minion.onHitDot.stacks}, ramps)`,
    );
  }
  return hpLost;
}

export function resolveSummonSpec(
  template: BossTemplate | undefined,
  attackId: string,
): BossSummonDef | undefined {
  const fromToml = template ? attackDef(template, attackId)?.summon : undefined;
  if (fromToml) return fromToml;
  return DEFAULT_SUMMONS[attackId];
}

function isSummonAttackId(
  template: BossTemplate | undefined,
  attackId: string,
): boolean {
  return resolveSummonSpec(template, attackId) != null;
}

/** Opening minions for a boss (sum of open_count across summon attacks). */
export function openingMinionsForBoss(bossTemplateId: string): Minion[] {
  const template = getBossTemplate(bossTemplateId);
  if (!template) return [];
  const out: Minion[] = [];
  for (const atk of template.attacks) {
    const spec = resolveSummonSpec(template, atk.id);
    if (!spec || spec.openCount <= 0) continue;
    const n = Math.min(spec.openCount, spec.maxCount);
    for (let i = 0; i < n; i++) {
      out.push(minionFromSpec(spec, `${spec.minionId}_open_${i}`));
    }
  }
  return out;
}

export interface BossAttackPresent {
  attackId: string;
  victimIds: string[];
  bubbleText?: string;
  sfxId?: string;
  fx?: string[];
}

export interface MinionAttackPresent {
  minionId: string;
  minionName: string;
  targetId: string;
  /** Preferred catalog SFX (per minion kind); client/server fall back to minion_shot */
  sfxId?: string;
  bubbleText?: string;
}

export interface BossPresentHooks {
  onBossAttack?: (info: BossAttackPresent) => void;
  onMinionAttack?: (info: MinionAttackPresent) => void;
}

/** Front (1) heavy → back (6) light. Shield/block still apply. */
const CASCADE_BASE: Record<number, number> = {
  1: 16,
  2: 13,
  3: 10,
  4: 7,
  5: 4,
  6: 2,
};

function livingMinionCount(team: TeamState): number {
  return team.minions.filter((m) => m.currentHp > 0).length;
}

function magnetBiasedTarget(team: TeamState, random: () => number) {
  const living = livingParty(team);
  if (!living.length) return undefined;
  const magnet = team.magnetPosition;
  const [a, b] = adjacentPositions(magnet);
  const weights = living.map((s) => {
    if (s.position === magnet) return 0.45;
    if (s.position === a || s.position === b) return 0.2;
    return 0.15 / Math.max(1, living.length - 3);
  });
  const total = weights.reduce((x, y) => x + y, 0);
  let roll = random() * total;
  for (let i = 0; i < living.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return living[i];
  }
  return living[living.length - 1];
}

/**
 * Choose the next boss attack id (weighted / summon pressure / sequence).
 * Call at telegraph time so wind-up can name the threat; resolve reuses the id.
 */
export function pickBossAttackId(
  team: TeamState,
  random: () => number,
): string {
  const boss = team.boss;
  if (!boss) return "LineAttack";
  if (boss.sequenceIndex >= 0) {
    return boss.attackIds[boss.sequenceIndex % boss.attackIds.length] ?? "LineAttack";
  }
  const template = getBossTemplate(boss.id) ?? fallbackTemplateFromBoss(team);
  return pickWeightedAttack(template, random, team);
}

/**
 * May the boss *spawn* new minions this pick?
 * - Never while any living minion holds the gap
 * - Never until noSummonBeforeRound (set when gap clears: +1 full turn of boss access)
 */
export function canBossSpawnMinions(team: TeamState): boolean {
  if (livingMinionCount(team) > 0) return false;
  return team.round >= (team.noSummonBeforeRound ?? 0);
}

/** Whether a Summon* attack is a legal pick (spawn or free-volley only). */
function canPickSummonAttack(
  team: TeamState,
  summon: BossSummonDef,
): boolean {
  const living = livingMinionCount(team);
  if (living > 0) {
    // No top-ups. Free-volley only when already at cap (no new spawns).
    return summon.freeVolley && living >= summon.maxCount;
  }
  return canBossSpawnMinions(team);
}

function pickWeightedAttack(
  template: BossTemplate,
  random: () => number,
  team: TeamState,
): string {
  const attackIds = template.attackIds;
  const living = livingMinionCount(team);
  const noMinions = living === 0;
  const summonIds = attackIds.filter((id) => isSummonAttackId(template, id));
  const spawnOk = canBossSpawnMinions(team);

  /**
   * Empty gap + spawn allowed: only *hard-force* free-volley kits (Colossus).
   * Weak adds get a weight boost only — never a guaranteed summon loop.
   */
  if (summonIds.length && spawnOk) {
    const freeVolleyIds = summonIds.filter(
      (id) => resolveSummonSpec(template, id)?.freeVolley,
    );
    if (freeVolleyIds.length) {
      const force = team.round >= 2 || random() < 0.7;
      if (force) {
        return freeVolleyIds[Math.floor(random() * freeVolleyIds.length)]!;
      }
    }
  }

  // Rattle Captain: never two stun-kits in a row
  const blockStunKit =
    template.id === "rattle_captain" && !!team.bossLastAttackWasStunKit;

  const freezeActive = partyHasFrozen(team);

  const weights = attackIds.map((id) => {
    const def = attackDef(template, id);
    let w = def?.weight ?? 2;
    if (blockStunKit && isRattleStunKitAttack(id)) {
      w = 0;
    }
    // One freeze chain at a time — no re-cast while anyone is Frozen
    if (id === "SpreadingFrost" && freezeActive) {
      w = 0;
    }
    const summon = resolveSummonSpec(template, id);
    if (summon) {
      if (!canPickSummonAttack(team, summon)) {
        w = 0;
      } else if (noMinions) {
        // Empty gap + cooldown clear: prefer summon moderately
        w *= summon.freeVolley ? 4 : 2.2;
      } else if (living >= summon.maxCount && summon.freeVolley) {
        // Full gap free-volley pressure (no spawn)
        w = 0.5;
      }
    }
    return w;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) {
    // Fallback if weights zeroed — any non-stun or any attack
    const safe = attackIds.find((id) => !isRattleStunKitAttack(id));
    return safe ?? attackIds[0] ?? "LineAttack";
  }
  let roll = random() * total;
  for (let i = 0; i < attackIds.length; i++) {
    const w = weights[i]!;
    if (w <= 0) continue;
    roll -= w;
    if (roll <= 0) return attackIds[i]!;
  }
  return attackIds[attackIds.length - 1] ?? "LineAttack";
}

function enrageMult(team: TeamState, template: BossTemplate | undefined): number {
  const boss = team.boss;
  if (!boss || boss.maxHp <= 0) return 1;
  const pct = template?.enrageHpPct ?? 0.4;
  const mult = template?.enrageDamageMult ?? 1.3;
  if (boss.currentHp / boss.maxHp <= pct) return mult;
  return 1;
}

function pickBubble(lines: string[], random: () => number): string | undefined {
  if (!lines.length) return undefined;
  return lines[Math.floor(random() * lines.length)];
}

/**
 * Impact SFX only — never replace with grunt/laugh (those are a separate voice beat).
 */
function resolveBossImpactAudio(
  template: BossTemplate | undefined,
  attackId: string,
  random: () => number,
): { sfxId?: string; bubbleText?: string } {
  if (!template) return { sfxId: "boss_attack" };
  const def = attackDef(template, attackId);
  return {
    sfxId: def?.sfx ?? template.telegraphSfx ?? "boss_attack",
    bubbleText: pickBubble(def?.bubble_lines ?? [], random),
  };
}

/**
 * Optional creature voice (grunt/laugh) before wind-up.
 * ~32% of non-stun turns. Laugh favored when attack asks for use_laugh.
 * Returns undefined when silent (no pool or roll fails).
 */
export function pickBossVoiceSfx(
  template: BossTemplate | undefined,
  attackId: string,
  random: () => number,
): string | undefined {
  if (!template) return undefined;
  if (random() >= 0.32) return undefined;
  const def = attackDef(template, attackId);
  if (def?.use_laugh && template.laughPool.length) {
    return pickFromPool(template.laughPool, random);
  }
  if (template.gruntPool.length) {
    return pickFromPool(template.gruntPool, random);
  }
  if (template.laughPool.length) {
    return pickFromPool(template.laughPool, random);
  }
  return undefined;
}

export function resolveBossPhase(
  team: TeamState,
  random: () => number,
  log: LogFn,
  present?: BossPresentHooks,
): void {
  const boss = team.boss;
  if (!boss || boss.currentHp <= 0) return;

  const template = getBossTemplate(boss.id);

  if (boss.curseRoundsLeft > 0) {
    boss.curseRoundsLeft -= 1;
    if (boss.curseRoundsLeft <= 0) boss.curseDamageTakenMult = 1;
  }
  if (boss.outgoingBuffRoundsLeft > 0) {
    boss.outgoingBuffRoundsLeft -= 1;
    if (boss.outgoingBuffRoundsLeft <= 0) boss.outgoingDamageMult = 1;
  }

  const rage = enrageMult(team, template);
  if (rage > 1) {
    log(`${boss.name} is enraged! (below 40% HP — attacks hit harder)`);
  }

  // Boss stun: boss and minions both skip (stun should feel like a full turn of safety)
  if (boss.stunRoundsLeft > 0) {
    boss.stunRoundsLeft -= 1;
    team.pendingBossAttackId = null;
    log(`${boss.name} is stunned and skips its turn!`);
    if (livingMinionCount(team) > 0) {
      log(`Minions falter while ${boss.name} is stunned — no volley this round.`);
    }
    // Not an attack — empty victims, no attack SFX (client uses "stunned" fx, not windup)
    present?.onBossAttack?.({
      attackId: "StunSkip",
      victimIds: [],
      bubbleText: "Stunned!",
      // soft / no SFX — avoid attack horn on skip
      sfxId: undefined,
      fx: ["stunned", "stun-skip"],
    });
    return;
  }

  // Prefer attack pre-picked at telegraph (threat-aware wind-up). Fall back if missing.
  let attackId = team.pendingBossAttackId ?? undefined;
  if (!attackId) {
    attackId = pickBossAttackId(team, random);
  }
  team.pendingBossAttackId = null;
  if (boss.sequenceIndex >= 0) boss.sequenceIndex += 1;
  const victims = performAttack(team, attackId, random, log, rage);
  // Track stun-kit cadence (Rattle Captain)
  if (boss.id === "rattle_captain") {
    team.bossLastAttackWasStunKit = isRattleStunKitAttack(attackId);
  } else {
    team.bossLastAttackWasStunKit = false;
  }
  const audio = resolveBossImpactAudio(template, attackId, random);
  present?.onBossAttack?.({
    attackId,
    victimIds: victims,
    bubbleText: audio.bubbleText,
    sfxId: audio.sfxId,
    fx: [
      ...(rage > 1 ? ["enraged"] : []),
      ...(boss.id === "rattle_captain" ? ["shock-flash"] : []),
      ...(attackId === "SpreadingFrost" ? ["ice-tint", "frost-flash"] : []),
    ],
  });

  // Adds act after a real boss attack (not on stun skip)
  for (const minion of [...team.minions]) {
    if (minion.currentHp <= 0) continue;
    const target = magnetBiasedTarget(team, random);
    if (!target) break;
    const dmg = Math.floor(
      minion.damage * (boss.outgoingDamageMult || 1) * rage,
    );
    resolveMinionShot(team, minion, target, dmg, log);
    present?.onMinionAttack?.({
      minionId: minion.id,
      minionName: minion.name,
      targetId: target.id,
      sfxId: minion.shotSfx,
      bubbleText: minion.shotBubble,
    });
  }
}

/** Returns party soldier ids that took HP damage this attack. */
function performAttack(
  team: TeamState,
  attackId: string,
  random: () => number,
  log: LogFn,
  rage: number,
): string[] {
  const boss = team.boss!;
  const mult = (boss.outgoingDamageMult || 1) * rage;
  const bonus = boss.nextAttackBonus || 0;
  boss.nextAttackBonus = 0;
  const victims = new Set<string>();

  const dmg = (base: number) => Math.floor((base + bonus) * mult);
  const hit = (s: Soldier, amount: number) => {
    const scaled = scaleBossDamageToSoldier(team, s, amount);
    const { hpLost } = applyPartyDamage(s, scaled, team.partyShield);
    if (hpLost > 0) victims.add(s.id);
    return hpLost;
  };

  // Parameterized summons (Moss Mites, Bone Archers, future adds)
  const summonSpec = resolveSummonSpec(getBossTemplate(boss.id), attackId);
  if (summonSpec) {
    performSummon(team, summonSpec, random, log, dmg, victims);
    return [...victims];
  }

  switch (attackId) {
    case "FrontSlam": {
      log(`${boss.name} uses Front Slam!`);
      // Warden: heavier front tax (room-5 pressure without Cascade)
      const warden = boss.id === "barrow_warden";
      for (const pos of [1, 2, 3]) {
        const s = soldierAt(team, pos);
        if (!s) continue;
        const base = warden
          ? pos === 1
            ? 15
            : pos === 2
              ? 11
              : 7
          : pos === 1
            ? 12
            : pos === 2
              ? 9
              : 5;
        const hpLost = hit(s, dmg(base));
        log(`  ${s.name} takes ${hpLost}`);
      }
      break;
    }
    case "RattleSpark": {
      // Electric front slam + chance to stun the soldier under the magnet
      log(`${boss.name} unleashes Rattle Spark!`);
      for (const pos of [1, 2, 3]) {
        const s = soldierAt(team, pos);
        if (!s) continue;
        const base = pos === 1 ? 12 : pos === 2 ? 9 : 5;
        const hpLost = hit(s, dmg(base));
        log(`  ${s.name} takes ${hpLost}`);
      }
      const magnet = team.magnetPosition;
      log(`  Sparks hunt the magnet seat (#${magnet})…`);
      if (
        !trySeatStun(
          team,
          magnet,
          RATTLE_SPARK_STUN_CHANCE,
          random,
          log,
        )
      ) {
        const under = soldierAt(team, magnet);
        if (under && under.archetype !== "Thundercaller") {
          log(`  ${under.name} shakes off the stun`);
        } else if (!under) {
          log(`  No one under the magnet to stun`);
        }
      }
      break;
    }
    case "LightFrontSlam": {
      // Tutorial-tier: ~85% of FrontSlam — can kill 1–2 if ignored / unhealed
      log(`${boss.name} uses Front Slam!`);
      for (const pos of [1, 2, 3]) {
        const s = soldierAt(team, pos);
        if (!s) continue;
        const base = pos === 1 ? 10 : pos === 2 ? 8 : 4;
        const hpLost = hit(s, dmg(base));
        log(`  ${s.name} takes ${hpLost}`);
      }
      break;
    }
    case "LineAttack": {
      log(`${boss.name} uses Line Attack!`);
      const lineBase = boss.id === "barrow_warden" ? 9 : 7;
      for (const s of livingParty(team)) {
        const hpLost = hit(s, dmg(lineBase));
        log(`  ${s.name} takes ${hpLost}`);
      }
      break;
    }
    case "LightLineAttack": {
      // Tutorial-tier: ~85% of LineAttack (7)
      log(`${boss.name} uses a light Line Attack!`);
      for (const s of livingParty(team)) {
        const hpLost = hit(s, dmg(6));
        log(`  ${s.name} takes ${hpLost}`);
      }
      break;
    }
    case "Cascade": {
      log(`${boss.name} uses Cascade! (front hard → back soft)`);
      for (const pos of [1, 2, 3, 4, 5, 6] as const) {
        const s = soldierAt(team, pos);
        if (!s) continue;
        const base = CASCADE_BASE[pos] ?? 2;
        const scaled = scaleBossDamageToSoldier(team, s, dmg(base));
        const { hpLost, shieldAbsorbed, blockAbsorbed } = applyPartyDamage(
          s,
          scaled,
          team.partyShield,
        );
        if (hpLost > 0) victims.add(s.id);
        const extra: string[] = [];
        if (shieldAbsorbed) extra.push(`${shieldAbsorbed} shield`);
        if (blockAbsorbed) extra.push(`${blockAbsorbed} block`);
        const note = extra.length ? ` (${extra.join(", ")})` : "";
        log(`  #${pos} ${s.name}: ${hpLost} HP${note} [raw ${base}]`);
      }
      // Rattle Captain: stun rolls on magnet seat + wrap neighbors (magnet still moves)
      if (boss.id === "rattle_captain") {
        const magnet = team.magnetPosition;
        const [left, right] = adjacentPositions(magnet);
        const magnetChance = THUNDERCALLER_BOSS_STUN_CHANCE;
        const neighborChance = Math.max(
          0,
          magnetChance - RATTLE_NEIGHBOR_STUN_PENALTY,
        );
        log(
          `  Lightning fans across seats #${left}, #${magnet}, #${right}…`,
        );
        trySeatStun(team, magnet, magnetChance, random, log);
        trySeatStun(team, left, neighborChance, random, log);
        trySeatStun(team, right, neighborChance, random, log);
      }
      break;
    }
    case "CrushMagnet": {
      log(`${boss.name} focuses the Token Magnet!`);
      const [a, b] = adjacentPositions(team.magnetPosition);
      const targets = [
        { pos: team.magnetPosition, base: 13 },
        { pos: a, base: 7 },
        { pos: b, base: 7 },
      ];
      for (const { pos, base } of targets) {
        const s = soldierAt(team, pos);
        if (!s) continue;
        const hpLost = hit(s, dmg(base));
        log(`  ${s.name} takes ${hpLost}`);
      }
      break;
    }
    case "Regenerate": {
      const heal = 10;
      boss.currentHp = Math.min(boss.maxHp, boss.currentHp + heal);
      log(`${boss.name} regenerates ${heal} HP (${boss.currentHp}/${boss.maxHp})`);
      const victim = magnetBiasedTarget(team, random);
      if (victim) {
        const hpLost = hit(victim, dmg(5));
        log(`  Regenerative pulse hits ${victim.name} for ${hpLost}`);
      }
      break;
    }
    case "PoisonCloud": {
      log(`${boss.name} exhales a Poison Cloud!`);
      for (const pos of [1, 2, 3, 4, 5, 6]) {
        const s = soldierAt(team, pos);
        if (s) {
          applyDot(s, "Poison", 1, undefined, true);
          victims.add(s.id);
          log(`  ${s.name} is poisoned (ramps each round if left up)`);
        }
      }
      break;
    }
    case "FireCloud": {
      // Fire-themed party DoT (Cinder Herald, future fire bosses). Same shape as PoisonCloud.
      log(`${boss.name} unleashes a Fire Cloud!`);
      for (const pos of [1, 2, 3, 4, 5, 6]) {
        const s = soldierAt(team, pos);
        if (s) {
          applyDot(s, "Fire", 1, undefined, true);
          victims.add(s.id);
          log(`  ${s.name} is burning (ramps each round if left up)`);
        }
      }
      break;
    }
    case "SpreadingFrost": {
      // Big frost wave across the line, then a chance to freeze front seat 1 or 2
      log(`${boss.name} casts Spreading Frost!`);
      for (const s of livingParty(team)) {
        const hpLost = hit(s, dmg(SPREADING_FROST_LINE_DAMAGE));
        log(`  ${s.name} takes ${hpLost}`);
      }
      if (partyHasFrozen(team)) {
        log(`  Frost already grips the line — no new freeze locks on`);
        break;
      }
      const frontSeats = ([1, 2] as const).filter((pos) => soldierAt(team, pos));
      if (!frontSeats.length) {
        log(`  No one in seats 1–2 to freeze`);
        break;
      }
      // Chance nobody freezes — damage already landed
      if (random() >= SPREADING_FROST_CHANCE) {
        log(`  The ice fails to lock anyone solid`);
        break;
      }
      const origin = frontSeats[Math.floor(random() * frontSeats.length)]!;
      const target = soldierAt(team, origin);
      if (!target) break;
      applyFrozen(target, origin, 0);
      log(
        `  ${target.name} (pos ${origin}) is FROZEN solid — cleanse or the ice spreads toward the center!`,
      );
      break;
    }
    default: {
      log(`${boss.name} uses ${attackId}!`);
      for (const s of livingParty(team)) {
        const hpLost = hit(s, dmg(8));
        log(`  ${s.name} takes ${hpLost}`);
      }
    }
  }
  return [...victims];
}

function performSummon(
  team: TeamState,
  spec: BossSummonDef,
  random: () => number,
  log: LogFn,
  dmg: (base: number) => number,
  victims: Set<string>,
): void {
  const boss = team.boss!;
  const livingAdds = livingMinionCount(team);
  // Global rule: no new spawns while gap occupied or during post-clear cooldown
  const toSpawn = canBossSpawnMinions(team)
    ? Math.max(0, spec.maxCount - livingAdds)
    : 0;
  for (let i = 0; i < toSpawn; i++) {
    team.minions.push(
      minionFromSpec(
        spec,
        `${spec.minionId}_${Date.now()}_${i}_${Math.floor(random() * 9999)}`,
      ),
    );
  }
  if (toSpawn > 0) {
    log(
      `${boss.name} summons ${toSpawn} ${spec.minionName}(s) into the gap!`,
    );
    return;
  }
  if (spec.freeVolley) {
    log(`${boss.name} rallies the ${spec.minionName}s — free volley!`);
    for (const minion of team.minions) {
      if (minion.currentHp <= 0) continue;
      const target = magnetBiasedTarget(team, random);
      if (!target) break;
      // free-volley still uses enraged/outgoing scaling via dmg()
      const amount = scaleBossDamageToSoldier(team, target, dmg(minion.damage));
      const { hpLost } = applyPartyDamage(target, amount, team.partyShield);
      if (hpLost > 0) victims.add(target.id);
      log(`  ${minion.name} free-fires at ${target.name} for ${hpLost}`);
      if (minion.onHitDot && minion.onHitDot.stacks > 0) {
        applyDot(target, minion.onHitDot.type, minion.onHitDot.stacks, undefined, true);
        log(
          `  ${target.name} catches fire (${minion.onHitDot.type} ×${minion.onHitDot.stacks}, ramps)`,
        );
        victims.add(target.id);
      }
    }
  } else {
    log(
      `${boss.name} thrashing — the gap is already full of ${spec.minionName}s!`,
    );
  }
}
