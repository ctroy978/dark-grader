import type { BossState } from "@dungeon-grades/shared";

export interface BossTemplate {
  id: string;
  name: string;
  maxHp: number;
  traits: string[];
  attackIds: string[];
  difficulty: string;
  summary: string;
  recommendedRounds: string;
}

export const BOSS_TEMPLATES: BossTemplate[] = [
  {
    id: "bone_colossus",
    name: "Bone Colossus",
    maxHp: 360,
    traits: ["Undead", "Enrage"],
    attackIds: [
      "FrontSlam",
      "LineAttack",
      "Cascade",
      "CrushMagnet",
      "SummonBoneArchers",
      "PoisonCloud",
      "Regenerate",
    ],
    difficulty: "Hard",
    summary:
      "Cascade (front hard → back soft), Bone Archers, poison, magnet crush. Enrages below 40% HP.",
    recommendedRounds: "10–16",
  },
  {
    id: "ash_wraith",
    name: "Ash Wraith",
    maxHp: 260,
    traits: ["Volatile"],
    attackIds: [
      "LineAttack",
      "FrontSlam",
      "Cascade",
      "CrushMagnet",
      "PoisonCloud",
      "Regenerate",
    ],
    difficulty: "Standard",
    summary:
      "No summons. Cascade punishes soft fronts; poison and crush still hurt.",
    recommendedRounds: "8–12",
  },
];

export function instantiateBoss(templateId: string): BossState {
  const t = BOSS_TEMPLATES.find((b) => b.id === templateId);
  if (!t) throw new Error(`Unknown boss: ${templateId}`);
  return {
    id: t.id,
    name: t.name,
    maxHp: t.maxHp,
    currentHp: t.maxHp,
    traits: [...t.traits],
    attackIds: [...t.attackIds],
    sequenceIndex: -1,
    curseDamageTakenMult: 1,
    curseRoundsLeft: 0,
    outgoingDamageMult: 1,
    outgoingBuffRoundsLeft: 0,
    stunRoundsLeft: 0,
    nextAttackBonus: 0,
  };
}
