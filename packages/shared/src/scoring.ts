export const SCORE_TRACKS = ["campaign", "preservation", "tempo"] as const;

export type ScoreTrack = (typeof SCORE_TRACKS)[number];
export type ScoreRank = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type AttemptOutcome = "active" | "victory" | "defeat" | "retreat";

export interface AttemptScoreRecord {
  attemptNumber: number;
  startingPartyIds: string[];
  startingLivingIds: string[];
  endingLivingIds: string[] | null;
  endingRound: number | null;
  outcome: AttemptOutcome;
}

export interface RoomScoreRecord {
  roomIndex: number;
  bossId: string;
  firstEntryLivingIds: string[];
  attempts: AttemptScoreRecord[];
  cleared: boolean;
  permanentLossOccurred: boolean;
  campaignAwarded: boolean;
  preservationAwarded: boolean;
  tempoAwarded: boolean;
  victoryRound: number | null;
  tempoRoundLimit: number | null;
}

export interface TeamScoringState {
  version: 1;
  campaignRank: number;
  preservationRank: number;
  tempoRank: number;
  rooms: RoomScoreRecord[];
}

export interface ScoreAwardResult {
  roomIndex: number;
  campaignAwarded: boolean;
  preservationAwarded: boolean;
  tempoAwarded: boolean;
  victoryRound: number;
  tempoRoundLimit: number | null;
  campaignRank: ScoreRank;
  preservationRank: ScoreRank;
  tempoRank: ScoreRank;
}

export interface ScoringSummary {
  campaignRank: ScoreRank;
  preservationRank: ScoreRank;
  tempoRank: ScoreRank;
  campaignTitle: string;
  preservationTitle: string;
  tempoTitle: string;
  total: number;
  maximum: number;
}

export const SCORE_TITLES: Record<ScoreTrack, readonly string[]> = {
  campaign: [
    "Unranked",
    "Commended",
    "Merit Scholar",
    "Honor Roll",
    "Dean's List",
    "Salutatorian",
    "Valedictorian",
  ],
  preservation: [
    "Unranked",
    "Merit",
    "Citation",
    "Commendation",
    "Cum Laude",
    "Magna Cum Laude",
    "Summa Cum Laude",
  ],
  tempo: [
    "Unranked",
    "Hall Monitor's Medal",
    "Teacher's Medal",
    "Counselor's Medal",
    "Dean's Medal",
    "Provost's Medal",
    "Chancellor's Medal",
  ],
};

export const SCORE_TRACK_LABELS: Record<ScoreTrack, string> = {
  campaign: "Campaign Honors",
  preservation: "Preservation Honors",
  tempo: "Tempo Honors",
};

export function clampScoreRank(value: number): ScoreRank {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(6, Math.trunc(value))) as ScoreRank;
}

export function scoreTitle(track: ScoreTrack, rank: number): string {
  return SCORE_TITLES[track][clampScoreRank(rank)]!;
}

export function badgeAssetPath(track: ScoreTrack, rank: number): string {
  const file = clampScoreRank(rank) === 0 ? "base" : String(clampScoreRank(rank));
  return `/art/badges/${track}/${file}.png`;
}

export function createEmptyScoringState(): TeamScoringState {
  return {
    version: 1,
    campaignRank: 0,
    preservationRank: 0,
    tempoRank: 0,
    rooms: [],
  };
}

export function scoringSummary(
  state: TeamScoringState,
  campaignLength: number,
): ScoringSummary {
  const campaignRank = clampScoreRank(state.campaignRank);
  const preservationRank = clampScoreRank(state.preservationRank);
  const tempoRank = clampScoreRank(state.tempoRank);
  return {
    campaignRank,
    preservationRank,
    tempoRank,
    campaignTitle: scoreTitle("campaign", campaignRank),
    preservationTitle: scoreTitle("preservation", preservationRank),
    tempoTitle: scoreTitle("tempo", tempoRank),
    total: campaignRank + preservationRank + tempoRank,
    maximum: Math.max(1, Math.min(6, Math.trunc(campaignLength))) * 3,
  };
}

export function roomScoreRecord(
  state: TeamScoringState,
  roomIndex: number,
): RoomScoreRecord | undefined {
  return state.rooms.find((room) => room.roomIndex === roomIndex);
}

/**
 * Award a cleared room exactly once. Mutates the persisted scoring state and
 * returns only the upgrades earned by this call for victory presentation.
 */
export function awardRoomVictory(
  state: TeamScoringState,
  room: RoomScoreRecord,
  victoryRound: number,
  tempoRoundLimit: number | null,
): ScoreAwardResult {
  const campaignAwarded = !room.campaignAwarded;
  const preservationAwarded =
    !room.preservationAwarded && !room.permanentLossOccurred;
  const tempoAwarded =
    !room.tempoAwarded &&
    tempoRoundLimit != null &&
    victoryRound <= tempoRoundLimit;

  room.cleared = true;
  room.victoryRound = victoryRound;
  room.tempoRoundLimit = tempoRoundLimit;
  if (campaignAwarded) {
    room.campaignAwarded = true;
    state.campaignRank = clampScoreRank(state.campaignRank + 1);
  }
  if (preservationAwarded) {
    room.preservationAwarded = true;
    state.preservationRank = clampScoreRank(state.preservationRank + 1);
  }
  if (tempoAwarded) {
    room.tempoAwarded = true;
    state.tempoRank = clampScoreRank(state.tempoRank + 1);
  }

  return {
    roomIndex: room.roomIndex,
    campaignAwarded,
    preservationAwarded,
    tempoAwarded,
    victoryRound,
    tempoRoundLimit,
    campaignRank: clampScoreRank(state.campaignRank),
    preservationRank: clampScoreRank(state.preservationRank),
    tempoRank: clampScoreRank(state.tempoRank),
  };
}
