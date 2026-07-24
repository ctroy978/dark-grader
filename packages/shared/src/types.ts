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
  /**
   * Boss-sourced party DoTs only (PoisonCloud, FireCloud, minion on-hit, …).
   * Intensity starts at 1 and rises by 1 after each DoT phase tick while the
   * status remains. Tick damage multiplies by this value — light at first,
   * punishing if left unchecked. Absent / undefined = flat player-side DoT.
   */
  escalationStep?: number;
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

/**
 * Barrow Warden SpreadingFrost lock.
 * Cannot attack or be healed until cleansed; spreads toward center each DoT phase,
 * then shatters (see docs/BOSS_PLAN.md §5.5).
 */
export interface FrozenStatus {
  kind: "Frozen";
  /**
   * Seat that started the chain (Warden: pos 1 or 2).
   * Spread walks toward the center along frostChainPath(origin).
   */
  origin: number;
  /**
   * 0 = just applied (origin seat only).
   * 1 = one spread done.
   * 2 = two spreads done (third seat frozen) — next DoT phase shatters.
   */
  stage: number;
}

export type StatusTag =
  | DotInstance
  | MarkStatus
  | StunStatus
  | WeakenStatus
  | ChargeStatus
  | FrozenStatus;

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
  /** DoTs on adds (e.g. FireMage Wildfire). Optional for older saves. */
  statuses?: StatusTag[];
  /**
   * Optional on-hit DoT applied to the party soldier this minion strikes
   * (e.g. Cinder Imps apply Fire). Optional for older saves / plain adds.
   */
  onHitDot?: { type: DotType; stacks: number };
  /**
   * Stable kind key from TOML `minion_id` (e.g. moss_mite) — art + default SFX.
   * Optional for older saves; fall back to parsing `id` / generic shot.
   */
  kind?: string;
  /** Catalog SFX id when this minion volleys (e.g. minion_moss_mite). */
  shotSfx?: string;
  /** Short comic bubble on volley (e.g. "Nibble!"). */
  shotBubble?: string;
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
  /** Classroom (period) this team belongs to — set on create / migration. */
  classroomId: string;
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
  /**
   * Attack id chosen at boss_telegraph (so wind-up can name the threat).
   * Consumed in resolveBoss; null when idle / stunned / after resolve.
   */
  pendingBossAttackId?: string | null;
  /**
   * Magnet cannot be repositioned while &gt; 0 (Rattle Captain shock lock).
   * Counts remaining locked magnet phases; decremented when tokens drop.
   */
  magnetStunRoundsLeft?: number;
  /**
   * Rattle Captain: previous boss attack was a stun-kit (Spark/Cascade).
   * Forces the next pick into the non-stun pool.
   */
  bossLastAttackWasStunKit?: boolean;
  /**
   * Boss may not *spawn* minions while team.round &lt; this.
   * Set when the gap is cleared (last minion dies) to round+2 so the party
   * gets this boss phase + one full turn of boss access before a re-summon.
   * Free-volley when already at max count is unaffected.
   */
  noSummonBeforeRound?: number;
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

/** Per-room grade pool + teacher open gate for one classroom. */
export interface ClassroomRoomSlot {
  /** Letter grades that seed the token bag when a team starts this room. */
  tokenPool: Grade[];
  /** When true, teams in this classroom may start this room (if grades present). */
  open: boolean;
}

export interface ClassroomState {
  classroomId: string;
  /** Display name e.g. "Period 1" */
  name: string;
  /**
   * @deprecated Legacy single pool. Migrated into rooms[0].tokenPool.
   * Kept optional so old JSON still parses during migration.
   */
  masterTokenPool?: Grade[];
  /** Fallback boss if room sequence missing */
  bossTemplateId: string | null;
  teamIds: string[];
  /** Total rooms in the campaign (default 6) */
  campaignLength: number;
  /**
   * Boss template id per room index 0..campaignLength-1.
   * Shorter arrays fall back to bossTemplateId / bone_colossus.
   */
  roomBossIds: string[];
  /**
   * When true, students in this classroom cannot join or advance play.
   * Existing team state is kept; only blocked at the API.
   */
  paused: boolean;
  /**
   * Grade pool + open flag per room index 0..campaignLength-1.
   * Teacher enters grades, then opens the room; next room stays locked until next test.
   */
  rooms: ClassroomRoomSlot[];
}

/** Summary card for teacher classroom list. */
export interface ClassroomSummary {
  classroomId: string;
  name: string;
  teamCount: number;
  paused: boolean;
  campaignLength: number;
  openRoomCount: number;
}

/** Default dungeon path for a class period (6-room plan; room 5 is a stub until designed). */
export const DEFAULT_CAMPAIGN_LENGTH = 6;
export const DEFAULT_ROOM_BOSSES = [
  "moss_grub",
  "ash_wraith",
  "cinder_herald",
  "rattle_captain",
  "barrow_warden",
  "bone_colossus",
] as const;

/** Thundercaller boss-stun chance; also Rattle Cascade magnet-seat baseline. */
export const THUNDERCALLER_BOSS_STUN_CHANCE = 0.3;
/** Rattle Spark magnet-seat party stun (main kit — meant to land often). */
export const RATTLE_SPARK_STUN_CHANCE = 0.6;
/** Cascade neighbor seat stun = magnet seat chance − this. */
export const RATTLE_NEIGHBOR_STUN_PENALTY = 0.1;

export const GRADES: Grade[] = ["A", "B", "C", "D", "F"];

export const GRADE_RANK: Record<Grade, number> = {
  A: 0,
  B: 1,
  C: 2,
  D: 3,
  F: 4,
};

export const RANK_TO_GRADE: Grade[] = ["A", "B", "C", "D", "F"];
