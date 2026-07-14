import { type Minion, type TeamState } from "@dungeon-grades/shared";
import { adjacentPositions } from "@dungeon-grades/shared";
import { applyPartyDamage, livingParty, soldierAt } from "./damage.js";
import { applyDot } from "./dots.js";
import {
  attackDef,
  getBossTemplate,
  pickFromPool,
  type BossTemplate,
} from "../seed/bossLoader.js";

export type LogFn = (text: string) => void;

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
  const hasSummon = attackIds.includes("SummonBoneArchers");

  if (hasSummon && noMinions) {
    const force = team.round >= 2 || random() < 0.7;
    if (force) return "SummonBoneArchers";
  }

  const weights = attackIds.map((id) => {
    const def = attackDef(template, id);
    let w = def?.weight ?? 2;
    if (id === "SummonBoneArchers" && noMinions) w *= 4;
    if (id === "SummonBoneArchers" && livingMinionCount(team) >= 2) w = 0.5;
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

  if (boss.stunRoundsLeft > 0) {
    boss.stunRoundsLeft -= 1;
    log(`${boss.name} is stunned and skips its turn!`);
    present?.onBossAttack?.({
      attackId: "StunSkip",
      victimIds: [],
      bubbleText: "…",
      sfxId: pickFromPool(template?.gruntPool ?? [], random) ?? "boss_attack",
      fx: ["stunned"],
    });
  } else {
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
  }

  // Adds always act after boss
  for (const minion of [...team.minions]) {
    if (minion.currentHp <= 0) continue;
    const target = magnetBiasedTarget(team, random);
    if (!target) break;
    const dmg = Math.floor(
      minion.damage * (boss.outgoingDamageMult || 1) * rage,
    );
    const { hpLost } = applyPartyDamage(target, dmg, team.partyShield);
    log(`${minion.name} fires at ${target.name} for ${hpLost} HP`);
    present?.onMinionAttack?.({
      minionId: minion.id,
      minionName: minion.name,
      targetId: target.id,
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
    case "LineAttack": {
      log(`${boss.name} uses Line Attack!`);
      for (const s of livingParty(team)) {
        const hpLost = hit(s, dmg(7));
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
      const heal = 14;
      boss.currentHp = Math.min(boss.maxHp, boss.currentHp + heal);
      log(`${boss.name} regenerates ${heal} HP (${boss.currentHp}/${boss.maxHp})`);
      const victim = magnetBiasedTarget(team, random);
      if (victim) {
        const hpLost = hit(victim, dmg(5));
        log(`  Regenerative pulse hits ${victim.name} for ${hpLost}`);
      }
      break;
    }
    case "SummonBoneArchers": {
      const livingAdds = livingMinionCount(team);
      const toSpawn = Math.max(0, 2 - livingAdds);
      for (let i = 0; i < toSpawn; i++) {
        const m: Minion = {
          id: `bone_archer_${Date.now()}_${i}_${Math.floor(random() * 9999)}`,
          name: "Bone Archer",
          maxHp: 20,
          currentHp: 20,
          damage: 7,
        };
        team.minions.push(m);
      }
      if (toSpawn > 0) {
        log(`${boss.name} summons ${toSpawn} Bone Archer(s) into the gap!`);
      } else {
        log(`${boss.name} rallies the archers — free volley!`);
        for (const minion of team.minions) {
          if (minion.currentHp <= 0) continue;
          const target = magnetBiasedTarget(team, random);
          if (!target) break;
          const hpLost = hit(target, dmg(minion.damage));
          log(`  ${minion.name} free-fires at ${target.name} for ${hpLost}`);
        }
      }
      break;
    }
    case "PoisonCloud": {
      log(`${boss.name} exhales a Poison Cloud!`);
      for (const pos of [1, 2, 3, 4, 5, 6]) {
        const s = soldierAt(team, pos);
        if (s) {
          applyDot(s, "Poison", 1);
          victims.add(s.id);
          log(`  ${s.name} is poisoned`);
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
