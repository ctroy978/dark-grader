import type { BossState } from "@dungeon-grades/shared";
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
  };
}
