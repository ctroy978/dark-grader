import type { Grade, StatusTag } from "./types.js";

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
  } | null;
  minions: Array<{
    id: string;
    name: string;
    currentHp: number;
    maxHp: number;
    damage?: number;
    statuses?: StatusTag[];
  }>;
  partyShield: { remaining: number; active: boolean };
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
    "Vanguard:A": "Party block!",
    "Vanguard:B": "Hold the line!",
    "Vanguard:C": "Shields up!",
    "Vanguard:D": "Brace!",
    "Vanguard:F": "Weak swing!",
    "ShieldMaiden:A": "Strike + shield!",
    "ShieldMaiden:B": "Hit!",
    "ShieldMaiden:C": "Strike!",
    "ShieldMaiden:D": "Tap!",
    "ShieldMaiden:F": "Shield out!",
    "FireMage:A": "Inferno!",
    "FireMage:B": "Burn!",
    "FireMage:C": "Fire—watch out!",
    "FireMage:D": "Sparks!",
    "FireMage:F": "BOOM—sorry!",
    "Healer:A": "Heal all!",
    "Healer:B": "Front heal!",
    "Healer:C": "Back line!",
    "Healer:D": "Self heal…",
    "Healer:F": "Wrong target!",
    "Archer:A": "Volley!",
    "Archer:B": "Loose!",
    "Archer:C": "Shot!",
    "Archer:D": "Pew…",
    "Archer:F": "Misfire!",
    "Doomcaller:A": "Marks… transferred!",
    "Doomcaller:B": "One of each!",
    "Doomcaller:C": "Front cleanse!",
    "Doomcaller:D": "Back cleanse!",
    "Doomcaller:F": "Marks on me!",
    "Necromancer:A": "Drain!",
    "Necromancer:B": "Siphon!",
    "Necromancer:C": "Leech!",
    "Necromancer:D": "Ow—drain…",
    "Necromancer:F": "Wrong life!",
    "Thundercaller:A": "Lightning! Charge front!",
    "Thundercaller:B": "Zap! Charge back!",
    "Thundercaller:C": "Zap!",
    "Thundercaller:D": "Spark!",
    "Thundercaller:F": "Overload!",
    "Runesinger:A": "All A's!",
    "Runesinger:B": "Up to B!",
    "Runesinger:C": "Lift the lowest!",
    "Runesinger:D": "Heal holders!",
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
