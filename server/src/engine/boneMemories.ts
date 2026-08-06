import {
  adjacentPositions,
  type BoneMemoryState,
  type Minion,
  type TeamState,
} from "@dungeon-grades/shared";
import { getBossTemplate, type BossMemoryDef } from "../seed/bossLoader.js";
import { applyPartyDamage, livingParty, soldierAt } from "./damage.js";
import { applyDot, applyFrozen, partyHasChainFrozen } from "./dots.js";

export const BONE_MEMORY_DETONATION_ATTACK_ID = "BoneMemoryDetonation";
export const BONE_MEMORY_AWAKEN_SFX = "boss_bone_summon";
export const BONE_MEMORY_CHARGE_SFX = "boss_bone_telegraph";
export const BONE_MEMORY_CRITICAL_SFX = "boss_bone_cascade";
export const BONE_MEMORY_BREAK_SFX = "hit_heavy";
export const BONE_MEMORY_EXPOSE_SFX = "ice_break";

export interface BoneMemoryResolution {
  memoryId: string;
  memory: BoneMemoryState;
  outcome: "destroyed" | "detonated";
  finalStand: boolean;
  hasNextMemory: boolean;
}

export interface BoneMemoryDetonationResult extends BoneMemoryResolution {
  victimIds: string[];
  sfxId?: string;
}

function memoryDefinitions(team: TeamState): BossMemoryDef[] {
  if (team.boss?.id !== "bone_colossus") return [];
  return getBossTemplate(team.boss.id)?.memories ?? [];
}

function hpFloor(team: TeamState, def: BossMemoryDef): number {
  return Math.max(1, Math.ceil((team.boss?.maxHp ?? 1) * def.gateHpPct));
}

function minionFromMemory(def: BossMemoryDef, phaseIndex: number): Minion {
  const memory: BoneMemoryState = {
    phaseIndex,
    sourceBossId: def.sourceBossId,
    sourceBossName: def.sourceBossName,
    artKey: def.artKey,
    signatureAttackId: def.signatureAttackId,
    signatureName: def.signatureName,
    theme: def.theme,
    charge: 0,
    maxCharge: def.maxCharge,
    gateHpPct: def.gateHpPct,
    detonationDamage: def.detonationDamage,
    detonationSfx: def.detonationSfx,
  };
  return {
    id: `bone_memory_${phaseIndex + 1}`,
    name: `${def.sourceBossName} Memory`,
    currentHp: def.maxHp,
    maxHp: def.maxHp,
    damage: 0,
    statuses: [],
    kind: def.artKey,
    shotBubble: def.signatureName,
    memory,
  };
}

export function activeBoneMemory(team: TeamState): Minion | undefined {
  const id = team.boneColossus?.activeMemoryId;
  if (!id) return undefined;
  return team.minions.find((minion) => minion.id === id && minion.currentHp > 0);
}

export function spawnNextBoneMemory(team: TeamState): Minion | null {
  const encounter = team.boneColossus;
  const boss = team.boss;
  const definitions = memoryDefinitions(team);
  if (!encounter || !boss || encounter.finalStand) return null;
  const phaseIndex = encounter.nextMemoryIndex;
  const def = definitions[phaseIndex];
  if (!def) {
    encounter.finalStand = true;
    encounter.activeMemoryId = null;
    encounter.spawnAfterBossRound = null;
    boss.damageFloor = 0;
    boss.damageFloorLabel = undefined;
    return null;
  }

  const minion = minionFromMemory(def, phaseIndex);
  team.minions.push(minion);
  encounter.activeMemoryId = minion.id;
  encounter.nextMemoryIndex += 1;
  encounter.spawnAfterBossRound = null;
  boss.damageFloor = hpFloor(team, def);
  boss.damageFloorLabel = `${def.sourceBossName} Bone Ward`;
  return minion;
}

export function initializeBoneColossusEncounter(team: TeamState): Minion | null {
  if (team.boss?.id !== "bone_colossus" || !memoryDefinitions(team).length) {
    team.boneColossus = null;
    return null;
  }
  team.boneColossus = {
    memoriesResolved: 0,
    nextMemoryIndex: 0,
    activeMemoryId: null,
    spawnAfterBossRound: null,
    finalStand: false,
    lastOutcome: null,
  };
  return spawnNextBoneMemory(team);
}

export function boneMemoryIsCritical(team: TeamState): boolean {
  const memory = activeBoneMemory(team)?.memory;
  return !!memory && memory.charge >= memory.maxCharge - 1;
}

export function advanceBoneMemoryCharge(team: TeamState): Minion | null {
  const minion = activeBoneMemory(team);
  if (!minion?.memory) return null;
  minion.memory.charge = Math.min(
    minion.memory.maxCharge - 1,
    minion.memory.charge + 1,
  );
  return minion;
}

function completeMemory(
  team: TeamState,
  minion: Minion,
  outcome: "destroyed" | "detonated",
): BoneMemoryResolution | null {
  const encounter = team.boneColossus;
  const boss = team.boss;
  const memory = minion.memory;
  if (!encounter || !boss || !memory) return null;
  if (encounter.activeMemoryId !== minion.id) return null;

  const definitions = memoryDefinitions(team);
  const completedFloor = Math.max(1, Math.ceil(boss.maxHp * memory.gateHpPct));
  boss.currentHp = Math.min(boss.currentHp, completedFloor);

  encounter.activeMemoryId = null;
  encounter.memoriesResolved += 1;
  encounter.lastOutcome = outcome;

  const nextDef = definitions[encounter.nextMemoryIndex];
  const finalStand = !nextDef;
  encounter.finalStand = finalStand;
  boss.damageFloor = nextDef ? hpFloor(team, nextDef) : 0;
  boss.damageFloorLabel = nextDef
    ? `${nextDef.sourceBossName} Bone Ward`
    : undefined;

  if (outcome === "destroyed") {
    boss.curseDamageTakenMult = Math.max(boss.curseDamageTakenMult || 1, 1.5);
    boss.curseRoundsLeft = Math.max(boss.curseRoundsLeft || 0, 2);
    encounter.spawnAfterBossRound = finalStand ? null : team.round + 1;
  } else {
    encounter.spawnAfterBossRound = null;
  }

  return {
    memoryId: minion.id,
    memory: { ...memory },
    outcome,
    finalStand,
    hasNextMemory: Boolean(nextDef),
  };
}

export function resolveDestroyedBoneMemory(
  team: TeamState,
): BoneMemoryResolution | null {
  const id = team.boneColossus?.activeMemoryId;
  if (!id) return null;
  const minion = team.minions.find((candidate) => candidate.id === id);
  if (!minion || minion.currentHp > 0) return null;
  return completeMemory(team, minion, "destroyed");
}

function hitPartyLine(
  team: TeamState,
  amount: number,
  victims: Set<string>,
  log: (text: string) => void,
): void {
  for (const soldier of livingParty(team)) {
    const { hpLost } = applyPartyDamage(soldier, amount, team.partyShield, {
      team,
      source: "memory",
    });
    if (hpLost > 0) victims.add(soldier.id);
    log(`  ${soldier.name} takes ${hpLost}`);
  }
}

function resolveSignature(
  team: TeamState,
  memory: BoneMemoryState,
  victims: Set<string>,
  log: (text: string) => void,
): void {
  switch (memory.signatureAttackId) {
    case "MemorySlimeBurst": {
      hitPartyLine(team, memory.detonationDamage, victims, log);
      for (const soldier of livingParty(team)) {
        applyDot(soldier, "Slime", 1, undefined, true, team);
        victims.add(soldier.id);
      }
      break;
    }
    case "PoisonCloud": {
      hitPartyLine(team, memory.detonationDamage, victims, log);
      for (const soldier of livingParty(team)) {
        applyDot(soldier, "Poison", 1, undefined, true, team);
        victims.add(soldier.id);
      }
      break;
    }
    case "FireCloud": {
      hitPartyLine(team, memory.detonationDamage, victims, log);
      for (const soldier of livingParty(team)) {
        applyDot(soldier, "Fire", 1, undefined, true, team);
        victims.add(soldier.id);
      }
      break;
    }
    case "Grounded": {
      const [left, right] = adjacentPositions(team.magnetPosition);
      const targets = [
        { position: team.magnetPosition, damage: memory.detonationDamage },
        { position: left, damage: Math.ceil(memory.detonationDamage * 0.6) },
        { position: right, damage: Math.ceil(memory.detonationDamage * 0.6) },
      ];
      for (const target of targets) {
        const soldier = soldierAt(team, target.position);
        if (!soldier) continue;
        const { hpLost } = applyPartyDamage(
          soldier,
          target.damage,
          team.partyShield,
          { team, source: "memory" },
        );
        if (hpLost > 0) victims.add(soldier.id);
        log(`  ${soldier.name} takes ${hpLost}`);
      }
      const magnetTarget = soldierAt(team, team.magnetPosition);
      if (magnetTarget && magnetTarget.archetype !== "Thundercaller") {
        magnetTarget.statuses = magnetTarget.statuses.filter(
          (status) => status.kind !== "Stun",
        );
        magnetTarget.statuses.push({ kind: "Stun", duration: 1 });
        victims.add(magnetTarget.id);
        log(`  ${magnetTarget.name} is stunned by the memory shock!`);
      }
      break;
    }
    case "SpreadingFrost": {
      hitPartyLine(team, memory.detonationDamage, victims, log);
      if (!partyHasChainFrozen(team)) {
        const front = livingParty(team).sort(
          (a, b) => (a.position ?? 99) - (b.position ?? 99),
        )[0];
        if (front?.position) {
          applyFrozen(front, front.position, 0);
          victims.add(front.id);
          log(`  ${front.name} is frozen by the Barrow Warden memory!`);
        }
      }
      break;
    }
  }
}

export function resolveBoneMemoryDetonation(
  team: TeamState,
  log: (text: string) => void,
): BoneMemoryDetonationResult | null {
  const minion = activeBoneMemory(team);
  if (!minion?.memory) return null;
  const memory = { ...minion.memory };
  const victims = new Set<string>();
  log(
    `${minion.name} reaches full power and unleashes ${memory.signatureName}!`,
  );
  resolveSignature(team, memory, victims, log);
  minion.currentHp = 0;
  minion.statuses = [];
  const resolution = completeMemory(team, minion, "detonated");
  if (!resolution) return null;
  return {
    ...resolution,
    victimIds: [...victims],
    sfxId: memory.detonationSfx,
  };
}

export function spawnScheduledBoneMemory(team: TeamState): Minion | null {
  const encounter = team.boneColossus;
  if (
    !encounter ||
    encounter.finalStand ||
    encounter.activeMemoryId ||
    encounter.spawnAfterBossRound == null ||
    team.round < encounter.spawnAfterBossRound
  ) {
    return null;
  }
  return spawnNextBoneMemory(team);
}
