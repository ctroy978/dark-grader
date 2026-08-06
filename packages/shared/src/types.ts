import type { PresentationCue } from "./presentation.js";
import type { ScoreAwardResult, TeamScoringState } from "./scoring.js";

export type Grade = "A" | "B" | "C" | "D" | "F";

export type Archetype =
  | "Vanguard"
  | "ShieldMaiden"
  | "FireMage"
  | "Healer"
  | "Archer"
  | "Spearman"
  | "Necromancer"
  | "Thundercaller"
  | "Runesinger";

/** Chill = Warden weather DoT (no token demotion). Ice = Frost Archer DoT. */
export type DotType = "Fire" | "Ice" | "Poison" | "Slime" | "Chill";

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

/**
 * Party stun (Rattle seat arc / Thundercaller F).
 * `duration` = remaining **party rounds** that waste a claim.
 * Ticks down after each party phase (`tickPartyStuns`); not claim-clear only.
 * Always **1** party round max (including enraged Rattle / Thundercaller F).
 */
export interface StunStatus {
  kind: "Stun";
  duration: number;
}

/** Post-rez fog — skip attack (like Stun) for `duration` claims. */
export interface DazedStatus {
  kind: "Dazed";
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
 * Spearman parry — reduces **boss** damage to this soldier until end of boss phase.
 * `reduction` is a fraction in [0, 1] (e.g. 0.7 → take 30% of the hit).
 */
export interface ParryStatus {
  kind: "Parry";
  reduction: number;
}

/**
 * Vanguard Last Stand — next lethal hit leaves the soldier at 1 HP
 * once, then the ward is consumed. Cleared after the boss phase if unused.
 */
export interface LastStandStatus {
  kind: "LastStand";
}

/**
 * Necromancer Life Power on the back-seat support (Healer or Runesinger).
 * No stacking; stays until that support’s next healing action spends it.
 * Flat bonus HP per ally they heal (instant purple follow-up rain).
 */
export interface LifePowerStatus {
  kind: "LifePower";
  /** Flat HP added per healed ally when the support acts */
  bonus: number;
}

/**
 * Runesinger hymn heal-over-time (independent streams; max 2 per soldier).
 * Ticks in DoT phase after damage DoTs; uses healSoldier (blocked by hard Frozen).
 */
export interface HotStatus {
  kind: "Hot";
  /** HP restored each DoT-phase tick */
  healPerTick: number;
  /** Remaining ticks (including upcoming) */
  duration: number;
  source?: "Runesinger";
}

/**
 * Freeze lock.
 *
 * **Chain (default):** Barrow Warden SpreadingFrost — cannot attack or be healed;
 * boss attacks glance off; existing DoTs keep ticking but cannot be cleansed
 * until free. Spreads toward center, then boss-shatters. Exit: land effective
 * grade **A** on any chain-Frozen seat to crack **all** chain ice (party thaw).
 *
 * **Soft (`soft: true`):** Ice DoT natural expiry (Frost Archer arrows) —
 * cannot attack for **one** action (token wasted), heals still work, no spread/
 * shatter; clears after that skip (or any thaw that clears Frozen).
 */
export interface FrozenStatus {
  kind: "Frozen";
  /**
   * Seat that started the chain (Warden: frontmost living at cast).
   * Spread walks toward the center along frostChainPath(origin).
   * Soft freeze: usually the locked seat's position.
   */
  origin: number;
  /**
   * 0 = just applied (origin seat only).
   * 1 = one spread done.
   * 2 = two spreads done (third seat frozen) — next DoT phase shatters.
   * Soft freeze: unused (keep 0).
   */
  stage: number;
  /**
   * Soft one-turn ice lock (Ice DoT expiry). No heal block, no chain.
   * Omitted / false = SpreadingFrost chain freeze.
   */
  soft?: boolean;
}

/**
 * Ohm electric field — immune to damage for `duration` party rounds;
 * attack hits bounce a fraction back to the striker (see OHM_REFLECT_RATIO).
 * Applied on the Ohm’s volley; ticks after the next party phase.
 */
export interface ReflectStatus {
  kind: "Reflect";
  duration: number;
}

export type StatusTag =
  | DotInstance
  | MarkStatus
  | StunStatus
  | DazedStatus
  | WeakenStatus
  | ChargeStatus
  | ParryStatus
  | LastStandStatus
  | LifePowerStatus
  | HotStatus
  | FrozenStatus
  | ReflectStatus;

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
  /**
   * Soldier ids protected this round (Maiden + most-likely-to-die).
   * Empty when inactive. Only these seats may spend `remaining`.
   */
  coveredIds?: string[];
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
  /**
   * Ohm: after Reflect fades, the next volley cannot raise Reflect again
   * (no back-to-back fields). Cleared when the skip is consumed.
   */
  reflectCooldown?: boolean;
  /** Bone Colossus: a charging remnant of an earlier campaign boss. */
  memory?: BoneMemoryState;
}

export interface BoneMemoryState {
  phaseIndex: number;
  sourceBossId: string;
  sourceBossName: string;
  artKey: string;
  signatureAttackId: string;
  signatureName: string;
  theme: "slime" | "poison" | "fire" | "shock" | "frost";
  charge: number;
  maxCharge: number;
  gateHpPct: number;
  detonationDamage: number;
  detonationSfx?: string;
}

export interface BoneColossusEncounterState {
  memoriesResolved: number;
  nextMemoryIndex: number;
  activeMemoryId: string | null;
  spawnAfterBossRound: number | null;
  finalStand: boolean;
  lastOutcome: "destroyed" | "detonated" | null;
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
   * DoTs on the boss (Fire Mage burn, etc.).
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
  /**
   * Enrage when currentHp/maxHp ≤ this fraction (from boss TOML).
   * Optional for older saves — UI falls back to 0.4 when missing.
   */
  enrageHpPct?: number;
  /** Outgoing damage mult while enraged; ≤1 means no meaningful enrage */
  enrageDamageMult?: number;
  /** Lowest HP this boss can reach while a phase gate is active. */
  damageFloor?: number;
  damageFloorLabel?: string;
  /** Numeric upper round bound used by Tempo Honors scoring. */
  tempoRoundLimit?: number;
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
   * Rattle Captain: previous boss attack was a stun-kit (Spark/Grounded).
   * Forces the next pick into the non-stun pool.
   */
  bossLastAttackWasStunKit?: boolean;
  /**
   * Attack id from the previous resolved boss turn (not stun skips).
   * Ash Wraith uses this to never cast the same move twice in a row.
   */
  bossLastAttackId?: string | null;
  /**
   * Boss may not *spawn* minions while team.round &lt; this.
   * Set when the gap is cleared (last minion dies) to round+2 so the party
   * gets this boss phase + one full turn of boss access before a re-summon.
   * Free-volley when already at max count is unaffected.
   */
  noSummonBeforeRound?: number;
  boss: BossState | null;
  minions: Minion[];
  /** Present only during the Bone Colossus five-memory encounter. */
  boneColossus?: BoneColossusEncounterState | null;
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
  /** Seed for reproducible fights (optional) */
  rngSeed: number;
  /** Last cleared boss name (for summary UI) */
  lastClearedBossName?: string | null;
  /**
   * Soldier ids revived by Thundercaller this boss fight (once each).
   * Cleared on startFight.
   */
  revivedSoldierIdsThisFight?: string[];
  /** Persistent academic badge progress and room-attempt history. */
  scoring: TeamScoringState;
  /** Upgrades earned on the latest victory; cleared when the next fight starts. */
  lastScoreAwards?: ScoreAwardResult | null;
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

/** Thundercaller boss-stun chance; also Rattle Grounded magnet-seat baseline. */
export const THUNDERCALLER_BOSS_STUN_CHANCE = 0.3;
/** Rattle Spark magnet-seat party stun (main kit — meant to land often). */
export const RATTLE_SPARK_STUN_CHANCE = 0.6;
/** Grounded neighbor seat stun = magnet seat chance − this. */
export const RATTLE_NEIGHBOR_STUN_PENALTY = 0.1;

/**
 * Chance each Ohm raises Reflect after its volley (when not on cooldown).
 * Kept modest; also blocked back-to-back via `minion.reflectCooldown`.
 */
export const OHM_REFLECT_CHANCE = 0.28;
/** Fraction of intended hit damage bounced to the attacker while Reflect is up. */
export const OHM_REFLECT_RATIO = 0.25;

export const GRADES: Grade[] = ["A", "B", "C", "D", "F"];

export const GRADE_RANK: Record<Grade, number> = {
  A: 0,
  B: 1,
  C: 2,
  D: 3,
  F: 4,
};

export const RANK_TO_GRADE: Grade[] = ["A", "B", "C", "D", "F"];
