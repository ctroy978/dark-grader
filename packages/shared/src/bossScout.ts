/**
 * Student-facing boss intel for lobby scouting.
 * Describes threats (attacks / minions) without prescribing party composition.
 */

export interface AttackScoutInfo {
  /** Short display name shown in the lobby tooltip */
  name: string;
  /** What the attack does — actionable, no "bring X class" advice */
  description: string;
}

/** Known attack ids from TOML content packs + engine registry. */
export const ATTACK_SCOUT: Record<string, AttackScoutInfo> = {
  FrontSlam: {
    name: "Front Slam",
    description: "Heavy smash aimed at the front of the line.",
  },
  RattleSpark: {
    name: "Rattle Spark",
    description:
      "Her usual strike: shocks the front of the line and often stuns whoever is standing on the token magnet so they miss their next turn. You can still move the magnet afterward.",
  },
  LightFrontSlam: {
    name: "Front Slam",
    description: "A slam aimed at the front of the line.",
  },
  LineAttack: {
    name: "Line Attack",
    description: "A sweep across the whole party line.",
  },
  ArcAttack: {
    name: "Arc Attack",
    description: "A crackling arc of lightning across the whole party line.",
  },
  LightLineAttack: {
    name: "Line Sweep",
    description: "A sweep across the whole party line.",
  },
  Cascade: {
    name: "Cascade",
    description:
      "Hits the entire line — hardest on the front, lightest on the back.",
  },
  Grounded: {
    name: "Grounded",
    description:
      "A big charge through the token magnet — hardest on that seat, softer farther down the line. Fighters near the magnet may get stunned too.",
  },
  CrushMagnet: {
    name: "Magnet Crush",
    description: "Focuses a hard blow on (or near) the token magnet.",
  },
  PoisonCloud: {
    name: "Poison Cloud",
    description:
      "Blankets the party in Poison that ticks every round and hits harder each tick if left up.",
  },
  FireCloud: {
    name: "Fire Cloud",
    description:
      "Blankets the party in Fire burn that ticks every round and hits harder each tick if left up.",
  },
  SpreadingFrost: {
    name: "Spreading Frost",
    description:
      "A hard frost wave across the whole line. May also freeze seat 1 or 2 — frozen soldiers cannot attack or be healed; the ice spreads toward the center and shatters if not burned off. Only a Fire Mage can clear Frozen (A = front, B = back). Seat Fire mid/back so they can still act. Only one freeze chain at a time.",
  },
  Regenerate: {
    name: "Regenerate",
    description: "Mends its own wounds a little (stalls less well).",
  },
  // Summon attacks are usually surfaced as minion cards, but keep labels
  // for combat logs / telegraphs that use the attack id.
  SummonMossMites: {
    name: "Summon Mites",
    description: "Summons Moss Mites to fight alongside the boss.",
  },
  SummonCinderImps: {
    name: "Summon Imps",
    description: "Summons Cinder Imps to fight alongside the boss.",
  },
  SummonBoneArchers: {
    name: "Summon Frost Archers",
    description: "Summons Frost Archers to fight alongside the boss.",
  },
  SummonOhms: {
    name: "Summon Ohms",
    description:
      "Summons weak Ohms into the gap. They zap the party — and can reflect damage back at whoever hits them.",
  },
};

/** Humanize an unknown attack id (e.g. FutureAttack → "Future Attack"). */
function humanizeAttackId(id: string): string {
  return id
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function scoutAttack(attackId: string): AttackScoutInfo {
  const known = ATTACK_SCOUT[attackId];
  if (known) return known;
  return {
    name: humanizeAttackId(attackId),
    description: "A special boss attack.",
  };
}

/** True when the attack is a minion summon. */
export function isSummonAttackId(attackId: string): boolean {
  return (
    attackId.startsWith("Summon") ||
    Boolean(ATTACK_SCOUT[attackId]?.name.startsWith("Summon "))
  );
}

/** Payload shape delivered on team state for lobby hover intel. */
export interface BossMinionScout {
  id: string;
  name: string;
  maxHp: number;
  damage: number;
  maxCount: number;
  /** Some are already summoned when the fight opens. */
  opensFight: boolean;
  /** When at max count, free shots instead of more spawns. */
  freeVolley: boolean;
  /** Optional on-hit DoT label (e.g. "Fire"). */
  onHitDot?: string;
  /** One-line student note. */
  note: string;
}

export interface BossAttackScout {
  id: string;
  name: string;
  description: string;
}

export interface BossScout {
  id: string;
  name: string;
  maxHp: number;
  difficulty: string;
  traits: string[];
  /** Short fight flavor from content pack (no party-comp advice). */
  summary: string;
  attacks: BossAttackScout[];
  minions: BossMinionScout[];
  /**
   * Enrage threshold as a fraction of max HP (e.g. 0.4 = below 40%).
   * Null when the boss does not meaningfully enrage.
   */
  enrageBelowHpPct: number | null;
  enrageNote: string | null;
}

/** Build a student-facing minion note from summon kit fields. */
export function describeMinionScout(opts: {
  name: string;
  /** Minion template id when known (e.g. "ohm"). */
  id?: string;
  opensFight: boolean;
  freeVolley: boolean;
  onHitDot?: string;
}): string {
  const parts: string[] = [];
  parts.push(`Summoned during the fight; attacks the party.`);
  if (opts.opensFight) {
    parts.push(`Some may already be summoned when the fight starts.`);
  }
  if (opts.freeVolley) {
    parts.push(`When at max count they keep firing instead of more spawning.`);
  }
  if (opts.onHitDot) {
    if (opts.onHitDot === "Slime") {
      parts.push(
        `Hits leave sticky Slime until cleansed (Fire Mage A/B).`,
      );
    } else if (opts.onHitDot === "Fire") {
      parts.push(`Hits can apply Fire burn (ramps if left up).`);
    } else if (opts.onHitDot === "Ice") {
      parts.push(
        `Frost arrows apply Ice (3 rounds). If it runs out uncleansed, they lock solid for one turn.`,
      );
    } else {
      parts.push(`Hits can apply ${opts.onHitDot}.`);
    }
  }
  const isOhm =
    opts.id === "ohm" ||
    opts.name === "Ohm" ||
    opts.name === "Ohms";
  if (isOhm) {
    parts.push(`Can reflect damage back at whoever attacks them.`);
  }
  return parts.join(" ");
}
