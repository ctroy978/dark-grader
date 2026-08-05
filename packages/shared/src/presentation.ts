import type {
  BoneColossusEncounterState,
  BoneMemoryState,
  Grade,
  StatusTag,
} from "./types.js";

/**
 * Combatant HP / status snapshot for progressive presentation.
 * Server attaches this to cues after the matching resolve step so the client
 * can show heals/damage when a unit "casts", not all at once on Drop Tokens.
 */
export interface BoardReveal {
  soldiers: Array<{
    id: string;
    currentHp: number;
    maxHp: number;
    alive: boolean;
    block: number;
    statuses: StatusTag[];
  }>;
  boss: {
    currentHp: number;
    maxHp: number;
    statuses?: StatusTag[];
    /**
     * Progressive stun chip — must be snapshotted per cue so Thundercaller
     * stun does not appear on the boss until their action reveal.
     */
    stunRoundsLeft?: number;
    curseDamageTakenMult?: number;
    curseRoundsLeft?: number;
    damageFloor?: number;
    damageFloorLabel?: string;
  } | null;
  minions: Array<{
    id: string;
    name: string;
    currentHp: number;
    maxHp: number;
    damage?: number;
    statuses?: StatusTag[];
    kind?: string;
    memory?: BoneMemoryState;
  }>;
  partyShield: {
    remaining: number;
    active: boolean;
    coveredIds?: string[];
  };
  /** Progressive magnet lock (Rattle Captain shock). */
  magnetStunRoundsLeft?: number;
  /** Progressive Bone Colossus phase state. */
  boneColossus?: BoneColossusEncounterState | null;
}

/**
 * One presentation beat for the client.
 * Prefer short comic bubbles + FX tags over long narration.
 */
export interface PresentationCue {
  id: string;
  kind:
    | "drop"
    | "claim"
    | "action"
    | "hurt"
    | "dot"
    | "death"
    | "boss"
    | "minion"
    | "telegraph"
    | "system";
  /** Party soldier id, minion id, or "boss" */
  focusIds?: string[];
  /** Comic speech bubble (keep text short) */
  bubble?: {
    speakerId?: string;
    speakerName?: string;
    side: "party" | "boss" | "minion";
    text: string;
  };
  grade?: Grade;
  /** Visual FX hooks for client CSS / tints */
  fx?: string[];
  /** Catalog SFX id (always try if present) */
  sfxId?: string;
  /**
   * Second one-shot layered under the primary (e.g. party groan under boss impact).
   * Same beat — does not add a separate hurt cue / wait.
   */
  secondarySfxId?: string;
  /** Delay before secondary SFX (ms). Default client ~200 if omitted. */
  secondarySfxDelayMs?: number;
  /** Catalog VO id — only play when VO enabled / occasional */
  voId?: string;
  /** Whether server wants VO this time (client still respects VO toggle) */
  playVo?: boolean;
  /** Suggested duration; client may clamp */
  durationMs?: number;
  /**
   * Board state *after* this beat's mechanics (action, boss hit, death, …).
   * Client freezes pre-drop HP and applies the latest reveal as cues play.
   */
  reveal?: BoardReveal;
}

/** Short claim yell for a grade token. */
export function claimBubbleText(grade: Grade): string {
  const map: Record<Grade, string> = {
    A: "A! Mine!",
    B: "B — got it!",
    C: "C token!",
    D: "Uh… D?",
    F: "F?! Oh no!",
  };
  return map[grade];
}

/** Very short action yell from playbook concept. */
export function actionBubbleText(archetype: string, grade: Grade): string {
  const key = `${archetype}:${grade}`;
  const table: Record<string, string> = {
    "Vanguard:A": "Last Stand!",
    "Vanguard:B": "Hold the front!",
    "Vanguard:C": "Brace!",
    "Vanguard:D": "Guard…",
    "Vanguard:F": "Weak swing!",
    "ShieldMaiden:A": "Cleanse + cover!",
    "ShieldMaiden:B": "Front cleanse!",
    "ShieldMaiden:C": "Back cleanse!",
    "ShieldMaiden:D": "Cover!",
    "ShieldMaiden:F": "Shield out!",
    "FireMage:A": "Inferno!",
    "FireMage:B": "Burn!",
    "FireMage:C": "Wildfire!",
    "FireMage:D": "Sparks!",
    "FireMage:F": "BOOM—sorry!",
    "Healer:A": "Heal all!",
    "Healer:B": "Mend two!",
    "Healer:C": "Save one!",
    "Healer:D": "Soft rain…",
    "Healer:F": "Wrong target!",
    "Archer:A": "Volley!",
    "Archer:B": "Loose!",
    "Archer:C": "Shot!",
    "Archer:D": "Pew…",
    "Archer:F": "Misfire!",
    "Spearman:A": "Last Stand! Thrust!",
    "Spearman:B": "Front ward! Pierce!",
    "Spearman:C": "Guard… stab!",
    "Spearman:D": "Weak guard…",
    "Spearman:F": "No guard!",
    "Necromancer:A": "Life Power!",
    "Necromancer:B": "Empower!",
    "Necromancer:C": "Leech!",
    "Necromancer:D": "Ow—drain…",
    "Necromancer:F": "Wrong life!",
    "Thundercaller:A": "Lightning! (or clear!)",
    "Thundercaller:B": "Zap! Charge back!",
    "Thundercaller:C": "Zap!",
    "Thundercaller:D": "Spark!",
    "Thundercaller:F": "Overload!",
    "Runesinger:A": "Hymn +2!",
    "Runesinger:B": "Lift the line!",
    "Runesinger:C": "Lift the worst!",
    "Runesinger:D": "Soft hymn…",
    "Runesinger:F": "Tokens fall!",
  };
  return table[key] ?? `${grade}!`;
}

const HURT_LINES = [
  "Ow!",
  "Shield!",
  "I'm hit!",
  "Ugh!",
  "Hold on!",
  "That hurt!",
];

export function hurtBubbleText(random: () => number): string {
  return HURT_LINES[Math.floor(random() * HURT_LINES.length)]!;
}
