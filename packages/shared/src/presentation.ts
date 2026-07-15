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
  boss: { currentHp: number; maxHp: number } | null;
  minions: Array<{
    id: string;
    name: string;
    currentHp: number;
    maxHp: number;
    damage?: number;
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
    "Vanguard:A": "Block up!",
    "Vanguard:B": "Hold the line!",
    "Vanguard:C": "Shield ready!",
    "Vanguard:D": "Tiny block…",
    "Vanguard:F": "…nothing.",
    "ShieldMaiden:A": "Strike!",
    "ShieldMaiden:B": "Hit!",
    "ShieldMaiden:C": "Shield roll!",
    "ShieldMaiden:D": "Tap!",
    "ShieldMaiden:F": "Short-circuit!",
    "FireMage:A": "Inferno!",
    "FireMage:B": "Burn!",
    "FireMage:C": "Fire—watch out!",
    "FireMage:D": "Sparks!",
    "FireMage:F": "BOOM—sorry!",
    "Healer:A": "Heal all!",
    "Healer:B": "Front heal!",
    "Healer:C": "Patch up!",
    "Healer:D": "Self heal…",
    "Healer:F": "Wrong target!",
    "Archer:A": "Volley!",
    "Archer:B": "Loose!",
    "Archer:C": "Shot!",
    "Archer:D": "Pew…",
    "Archer:F": "Misfire!",
    "Doomcaller:A": "Curse!",
    "Doomcaller:B": "Doom…",
    "Doomcaller:C": "Hex!",
    "Doomcaller:D": "Weak curse…",
    "Doomcaller:F": "Bad curse!",
    "Necromancer:A": "Drain!",
    "Necromancer:B": "Siphon!",
    "Necromancer:C": "Leech!",
    "Necromancer:D": "Ow—drain…",
    "Necromancer:F": "Backlash!",
    "Thundercaller:A": "Lightning!",
    "Thundercaller:B": "Zap chain!",
    "Thundercaller:C": "Zap!",
    "Thundercaller:D": "Unstable!",
    "Thundercaller:F": "Overload!",
    "Runesinger:A": "Power rune!",
    "Runesinger:B": "Strong rune!",
    "Runesinger:C": "Rune!",
    "Runesinger:D": "Fizzle…",
    "Runesinger:F": "Corrupted!",
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
