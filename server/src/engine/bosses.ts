import { type Minion, type TeamState } from "@dungeon-grades/shared";
import { adjacentPositions } from "@dungeon-grades/shared";
import { applyPartyDamage, livingParty, soldierAt } from "./damage.js";
import { applyDot } from "./dots.js";

export type LogFn = (text: string) => void;

/** Prefer lethal pressure; summon weights high when the field is empty. */
const ATTACK_WEIGHTS: Record<string, number> = {
  FrontSlam: 3,
  LineAttack: 2,
  Cascade: 4, // front-loaded — Vanguards earn their place
  CrushMagnet: 3,
  PoisonCloud: 3,
  SummonBoneArchers: 3,
  Regenerate: 1,
  default: 2,
};

/** Front (1) heavy → back (6) light. Shield/block still apply. */
const CASCADE_BASE: Record<number, number> = {
  1: 16, // was 20 — still hurts; Vanguard/Maiden can hold
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
  attackIds: string[],
  random: () => number,
  team: TeamState,
): string {
  const noMinions = livingMinionCount(team) === 0;
  const hasSummon = attackIds.includes("SummonBoneArchers");

  // Guarantee minion pressure: if this boss can summon and the gap is empty,
  // force a summon often (always after round 2, 70% before that).
  if (hasSummon && noMinions) {
    const force = team.round >= 2 || random() < 0.7;
    if (force) return "SummonBoneArchers";
  }

  const weights = attackIds.map((id) => {
    let w = ATTACK_WEIGHTS[id] ?? ATTACK_WEIGHTS.default;
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

/** Below 40% HP the boss hits harder — punishes slow/careless fights. */
function enrageMult(team: TeamState): number {
  const boss = team.boss;
  if (!boss || boss.maxHp <= 0) return 1;
  if (boss.currentHp / boss.maxHp <= 0.4) return 1.3;
  return 1;
}

export function resolveBossPhase(
  team: TeamState,
  random: () => number,
  log: LogFn,
): void {
  const boss = team.boss;
  if (!boss || boss.currentHp <= 0) return;

  if (boss.curseRoundsLeft > 0) {
    boss.curseRoundsLeft -= 1;
    if (boss.curseRoundsLeft <= 0) boss.curseDamageTakenMult = 1;
  }
  if (boss.outgoingBuffRoundsLeft > 0) {
    boss.outgoingBuffRoundsLeft -= 1;
    if (boss.outgoingBuffRoundsLeft <= 0) boss.outgoingDamageMult = 1;
  }

  const rage = enrageMult(team);
  if (rage > 1) {
    log(`${boss.name} is enraged! (below 40% HP — attacks hit harder)`);
  }

  if (boss.stunRoundsLeft > 0) {
    boss.stunRoundsLeft -= 1;
    log(`${boss.name} is stunned and skips its turn!`);
  } else {
    const attackId =
      boss.sequenceIndex >= 0
        ? boss.attackIds[boss.sequenceIndex % boss.attackIds.length]
        : pickWeightedAttack(boss.attackIds, random, team);
    if (boss.sequenceIndex >= 0) boss.sequenceIndex += 1;
    performAttack(team, attackId, random, log, rage);
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
  }
}

function performAttack(
  team: TeamState,
  attackId: string,
  random: () => number,
  log: LogFn,
  rage: number,
): void {
  const boss = team.boss!;
  const mult = (boss.outgoingDamageMult || 1) * rage;
  const bonus = boss.nextAttackBonus || 0;
  boss.nextAttackBonus = 0;

  const dmg = (base: number) => Math.floor((base + bonus) * mult);

  switch (attackId) {
    case "FrontSlam": {
      log(`${boss.name} uses Front Slam!`);
      for (const pos of [1, 2, 3]) {
        const s = soldierAt(team, pos);
        if (!s) continue;
        const base = pos === 1 ? 12 : pos === 2 ? 9 : 5;
        const { hpLost } = applyPartyDamage(s, dmg(base), team.partyShield);
        log(`  ${s.name} takes ${hpLost}`);
      }
      break;
    }
    case "LineAttack": {
      log(`${boss.name} uses Line Attack!`);
      for (const s of livingParty(team)) {
        const { hpLost } = applyPartyDamage(s, dmg(7), team.partyShield);
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
        const { hpLost } = applyPartyDamage(s, dmg(base), team.partyShield);
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
        const { hpLost } = applyPartyDamage(victim, dmg(5), team.partyShield);
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
          const { hpLost } = applyPartyDamage(
            target,
            dmg(minion.damage),
            team.partyShield,
          );
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
          log(`  ${s.name} is poisoned`);
        }
      }
      break;
    }
    default:
      log(`${boss.name} uses ${attackId}!`);
      for (const s of livingParty(team)) {
        const { hpLost } = applyPartyDamage(s, dmg(8), team.partyShield);
        log(`  ${s.name} takes ${hpLost}`);
      }
  }
}
