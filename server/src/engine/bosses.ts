import {
  type Minion,
  type Soldier,
  type TeamState,
} from "@dungeon-grades/shared";
import { adjacentPositions } from "@dungeon-grades/shared";
import { applyPartyDamage, livingParty, soldierAt } from "./damage.js";
import { applyDot } from "./dots.js";
import {
  attackDef,
  getBossTemplate,
  pickFromPool,
  type BossSummonDef,
  type BossTemplate,
} from "../seed/bossLoader.js";

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
    damage: 2,
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
  const { hpLost } = applyPartyDamage(target, amount, team.partyShield);
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

function pickWeightedAttack(
  template: BossTemplate,
  random: () => number,
  team: TeamState,
): string {
  const attackIds = template.attackIds;
  const noMinions = livingMinionCount(team) === 0;
  const summonIds = attackIds.filter((id) => isSummonAttackId(template, id));

  // Prefer filling the gap when empty (tutorial mites + Colossus archers)
  if (summonIds.length && noMinions) {
    const force = team.round >= 2 || random() < 0.7;
    if (force) {
      return summonIds[Math.floor(random() * summonIds.length)]!;
    }
  }

  const living = livingMinionCount(team);
  const weights = attackIds.map((id) => {
    const def = attackDef(template, id);
    let w = def?.weight ?? 2;
    const summon = resolveSummonSpec(template, id);
    if (summon) {
      if (noMinions) w *= 4;
      if (living >= summon.maxCount) {
        // Free-volley kits still want occasional full-gap pressure; toy adds drop weight hard
        w = summon.freeVolley ? 0.5 : 0.05;
      }
    }
    return w;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = random() * total;
  for (let i = 0; i < attackIds.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return attackIds[i];
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

function resolveBossAudio(
  template: BossTemplate | undefined,
  attackId: string,
  random: () => number,
): { sfxId?: string; bubbleText?: string } {
  if (!template) return { sfxId: "boss_attack" };
  const def = attackDef(template, attackId);
  let sfxId = def?.sfx ?? template.telegraphSfx ?? "boss_attack";
  // Layer grunt/laugh as primary flavor when no specific sfx — prefer attack sfx,
  // but if use_grunt/laugh, client plays attack sfx; we can swap to grunt occasionally
  if (def?.use_laugh && random() < 0.35) {
    sfxId = pickFromPool(template.laughPool, random) ?? sfxId;
  } else if (def?.use_grunt && random() < 0.45) {
    // Play grunt *instead* of generic hit sometimes; attack sfx still preferred if set
    // Actually: play attack sfx always when set; grunt is alternate for variety
    if (!def.sfx) {
      sfxId = pickFromPool(template.gruntPool, random) ?? sfxId;
    } else if (random() < 0.4) {
      sfxId = pickFromPool(template.gruntPool, random) ?? def.sfx;
    }
  }
  return {
    sfxId,
    bubbleText: pickBubble(def?.bubble_lines ?? [], random),
  };
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

  const attackId =
    boss.sequenceIndex >= 0
      ? boss.attackIds[boss.sequenceIndex % boss.attackIds.length]
      : pickWeightedAttack(
          template ?? {
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
          },
          random,
          team,
        );
  if (boss.sequenceIndex >= 0) boss.sequenceIndex += 1;
  const victims = performAttack(team, attackId, random, log, rage);
  const audio = resolveBossAudio(template, attackId, random);
  present?.onBossAttack?.({
    attackId,
    victimIds: victims,
    bubbleText: audio.bubbleText,
    sfxId: audio.sfxId,
    fx: rage > 1 ? ["enraged"] : [],
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
  const hit = (s: { id: string }, amount: number) => {
    const { hpLost } = applyPartyDamage(s as never, amount, team.partyShield);
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
      for (const pos of [1, 2, 3]) {
        const s = soldierAt(team, pos);
        if (!s) continue;
        const base = pos === 1 ? 12 : pos === 2 ? 9 : 5;
        const hpLost = hit(s, dmg(base));
        log(`  ${s.name} takes ${hpLost}`);
      }
      break;
    }
    case "LightFrontSlam": {
      // Tutorial-tier: ~60% of FrontSlam
      log(`${boss.name} uses a soft Front Slam!`);
      for (const pos of [1, 2, 3]) {
        const s = soldierAt(team, pos);
        if (!s) continue;
        const base = pos === 1 ? 7 : pos === 2 ? 5 : 3;
        const hpLost = hit(s, dmg(base));
        log(`  ${s.name} takes ${hpLost}`);
      }
      break;
    }
    case "LineAttack": {
      log(`${boss.name} uses Line Attack!`);
      for (const s of livingParty(team)) {
        const hpLost = hit(s, dmg(7));
        log(`  ${s.name} takes ${hpLost}`);
      }
      break;
    }
    case "LightLineAttack": {
      log(`${boss.name} uses a light Line Attack!`);
      for (const s of livingParty(team)) {
        const hpLost = hit(s, dmg(4));
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
        const { hpLost, shieldAbsorbed, blockAbsorbed } = applyPartyDamage(
          s,
          dmg(base),
          team.partyShield,
        );
        if (hpLost > 0) victims.add(s.id);
        const extra: string[] = [];
        if (shieldAbsorbed) extra.push(`${shieldAbsorbed} shield`);
        if (blockAbsorbed) extra.push(`${blockAbsorbed} block`);
        const note = extra.length ? ` (${extra.join(", ")})` : "";
        log(`  #${pos} ${s.name}: ${hpLost} HP${note} [raw ${base}]`);
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
  const toSpawn = Math.max(0, spec.maxCount - livingAdds);
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
      const amount = dmg(minion.damage);
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
