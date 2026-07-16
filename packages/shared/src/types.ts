import type { PresentationCue } from "./presentation.js";

export type Grade = "A" | "B" | "C" | "D" | "F";

export type Archetype =
  | "Vanguard"
  | "ShieldMaiden"
  | "FireMage"
  | "Healer"
  | "Archer"
  | "Doomcaller"
  | "Necromancer"
  | "Thundercaller"
  | "Runesinger";

export type DotType = "Fire" | "Ice" | "Poison" | "Slime";

export type Position = 1 | 2 | 3 | 4 | 5 | 6;

export interface DotInstance {
  kind: "Dot";
  type: DotType;
  stacks: number;
  duration: number;
}

export interface MarkStatus {
  kind: "Mark";
}

export interface StunStatus {
  kind: "Stun";
  duration: number;
}

export interface WeakenStatus {
  kind: "Weaken";
  duration: number;
}

/** Thundercaller charge — extra damage on this soldier’s next enemy hit. */
export interface ChargeStatus {
  kind: "Charge";
  amount: number;
}

export type StatusTag =
  | DotInstance
  | MarkStatus
  | StunStatus
  | WeakenStatus
  | ChargeStatus;

export interface Soldier {
  id: string;
  name: string;
  archetype: Archetype;
  maxHp: number;
  currentHp: number;
  /** 1–6 in combat; null if not in active party */
  position: Position | null;
  statuses: StatusTag[];
  alive: boolean;
  /** One-round personal absorb (Vanguard) */
  block: number;
}

export interface PartyShield {
  remaining: number;
  active: boolean;
}

export interface TokenPool {
  remaining: Grade[];
  discard: Grade[];
}

export interface ClaimResult {
  token: Grade;
  soldierId: string;
  effectiveGrade: Grade;
}

export interface RoundLogEntry {
  round: number;
  text: string;
  tags?: string[];
}

export interface Minion {
  id: string;
  name: string;
  currentHp: number;
  maxHp: number;
  damage: number;
}

export interface BossState {
  id: string;
  name: string;
  maxHp: number;
  currentHp: number;
  traits: string[];
  attackIds: string[];
  sequenceIndex: number;
  /**
   * DoTs / marks on the boss (Doomcaller transfer, death poison, etc.).
   * Ticked after party DoTs; damage goes to boss HP.
   */
  statuses: StatusTag[];
  /** Incoming damage multiplier (legacy curse; kept for enrage tools / old saves) */
  curseDamageTakenMult: number;
  curseRoundsLeft: number;
  /** Outgoing damage mult from Runesinger F / old F curse */
  outgoingDamageMult: number;
  outgoingBuffRoundsLeft: number;
  /** Stunned for this many boss phases */
  stunRoundsLeft: number;
  /** Next attack bonus damage (Runesinger F default) */
  nextAttackBonus: number;
}

export type FightPhase =
  | "lobby"
  | "awaiting_magnet"
  | "resolving"
  /** Party finished; client shows telegraph, then calls resolve-boss */
  | "boss_telegraph"
  /** Cleared current room (not yet advanced) */
  | "victory"
  | "defeat"
  /** Camp between rooms — reform party */
  | "between_rooms"
  /** Cleared entire campaign */
  | "campaign_complete";

export interface TeamState {
  teamId: string;
  inviteCode: string;
  name: string;
  roster: Soldier[];
  activePartyIds: string[];
  magnetPosition: Position;
  partyShield: PartyShield;
  tokens: TokenPool;
  /**
   * Tokens telegraphed for the current magnet phase — exactly what will drop
   * on Commit. Drawn from the pool when the phase begins; empty during resolve.
   */
  pendingTokens: Grade[];
  boss: BossState | null;
  minions: Minion[];
  phase: FightPhase;
  round: number;
  log: RoundLogEntry[];
  /**
   * Short presentation cues (bubbles, FX, SFX/VO) for the client.
   * Replaced each resolve step — keep timings snappy.
   */
  playback: PresentationCue[];
  /** Claims from the last drop — grade badges on cards until next magnet phase. */
  lastClaims: ClaimResult[];
  /**
   * Rooms already cleared. Current fight is room (roomsCleared + 1).
   * Kept as roomIndex for save compatibility (same meaning).
   */
  roomIndex: number;
  /** Party-wide outgoing damage bonus this round (Runesinger) */
  partyDamageBonus: number;
  /** Slime slow: next round drops 2 tokens */
  slimeSlowNextRound: boolean;
  /** Seed for reproducible fights (optional) */
  rngSeed: number;
  /** Last cleared boss name (for summary UI) */
  lastClearedBossName?: string | null;
}

export interface ClassroomState {
  masterTokenPool: Grade[];
  /** Fallback boss if room sequence missing */
  bossTemplateId: string | null;
  teamIds: string[];
  /** Total rooms in the campaign (default 3) */
  campaignLength: number;
  /**
   * Boss template id per room index 0..campaignLength-1.
   * Shorter arrays fall back to bossTemplateId / bone_colossus.
   */
  roomBossIds: string[];
}

/** Default dungeon path for a class period */
export const DEFAULT_CAMPAIGN_LENGTH = 3;
export const DEFAULT_ROOM_BOSSES = [
  "moss_grub",
  "ash_wraith",
  "bone_colossus",
] as const;

export const GRADES: Grade[] = ["A", "B", "C", "D", "F"];

export const GRADE_RANK: Record<Grade, number> = {
  A: 0,
  B: 1,
  C: 2,
  D: 3,
  F: 4,
};

export const RANK_TO_GRADE: Grade[] = ["A", "B", "C", "D", "F"];
