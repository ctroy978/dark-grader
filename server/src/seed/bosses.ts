import type { BossScout, BossState } from "@dungeon-grades/shared";
import {
  describeMinionScout,
  scoutAttack,
} from "@dungeon-grades/shared";
import {
  getBossTemplate,
  loadBossTemplates,
  type BossTemplate,
} from "./bossLoader.js";

export type { BossTemplate } from "./bossLoader.js";

/** Teacher dashboard + API list (from TOML content packs). */
export function BOSS_TEMPLATES(): BossTemplate[] {
  return loadBossTemplates();
}

/** @deprecated use BOSS_TEMPLATES() — kept for call-site convenience */
export { loadBossTemplates };

export function listBossTemplatesForApi() {
  return loadBossTemplates().map((t) => ({
    id: t.id,
    name: t.name,
    maxHp: t.maxHp,
    difficulty: t.difficulty,
    summary: t.summary,
    recommendedRounds: t.recommendedRounds,
  }));
}

/**
 * Student lobby scout card for a boss template.
 * Surfaces attacks + minions without party-comp recommendations.
 */
export function buildBossScout(templateId: string): BossScout | null {
  const t = getBossTemplate(templateId);
  if (!t) return null;

  const attacks: BossScout["attacks"] = [];
  const minions: BossScout["minions"] = [];
  const seenMinion = new Set<string>();

  for (const atk of t.attacks) {
    if (atk.summon) {
      const s = atk.summon;
      if (seenMinion.has(s.minionId)) continue;
      seenMinion.add(s.minionId);
      const opensFight = s.openCount > 0;
      minions.push({
        id: s.minionId,
        name: s.minionName,
        maxHp: s.maxHp,
        damage: s.damage,
        maxCount: s.maxCount,
        opensFight,
        freeVolley: s.freeVolley,
        onHitDot: s.onHitDot?.type,
        note: describeMinionScout({
          id: s.minionId,
          name: s.minionName,
          opensFight,
          freeVolley: s.freeVolley,
          onHitDot: s.onHitDot?.type,
        }),
      });
      continue;
    }
    const info = scoutAttack(atk.id);
    attacks.push({
      id: atk.id,
      name: info.name,
      description: info.description,
    });
  }

  for (const memory of t.memories) {
    minions.push({
      id: `bone_memory_${memory.sourceBossId}`,
      name: `${memory.sourceBossName} Memory`,
      maxHp: memory.maxHp,
      damage: memory.detonationDamage,
      maxCount: 1,
      opensFight: memory === t.memories[0],
      freeVolley: false,
      note: `Charges ${memory.signatureName} over ${memory.maxCharge} party opportunities. Destroy it to break the Bone Ward and expose the Colossus.`,
    });
  }

  const enrages =
    t.enrageDamageMult > 1.001 && t.enrageHpPct > 0 && t.enrageHpPct < 1;
  const pctLabel = Math.round(t.enrageHpPct * 100);

  return {
    id: t.id,
    name: t.name,
    maxHp: t.maxHp,
    difficulty: t.difficulty,
    traits: [...t.traits],
    summary: t.summary,
    attacks,
    minions,
    enrageBelowHpPct: enrages ? t.enrageHpPct : null,
    enrageNote: enrages
      ? `Enrages below ${pctLabel}% HP — attacks hit harder.`
      : null,
  };
}

export function instantiateBoss(templateId: string): BossState {
  const t = getBossTemplate(templateId);
  if (!t) throw new Error(`Unknown boss: ${templateId}`);
  return {
    id: t.id,
    name: t.name,
    maxHp: t.maxHp,
    currentHp: t.maxHp,
    traits: [...t.traits],
    attackIds: [...t.attackIds],
    sequenceIndex: -1,
    statuses: [],
    curseDamageTakenMult: 1,
    curseRoundsLeft: 0,
    outgoingDamageMult: 1,
    outgoingBuffRoundsLeft: 0,
    stunRoundsLeft: 0,
    nextAttackBonus: 0,
    enrageHpPct: t.enrageHpPct,
    enrageDamageMult: t.enrageDamageMult,
  };
}
