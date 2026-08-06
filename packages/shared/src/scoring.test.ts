import { describe, expect, it } from "vitest";
import {
  awardRoomVictory,
  badgeAssetPath,
  clampScoreRank,
  createEmptyScoringState,
  scoreTitle,
  scoringSummary,
  type RoomScoreRecord,
} from "./scoring.js";

function room(overrides: Partial<RoomScoreRecord> = {}): RoomScoreRecord {
  return {
    roomIndex: 0,
    bossId: "moss_grub",
    firstEntryLivingIds: ["a", "b"],
    attempts: [],
    cleared: false,
    permanentLossOccurred: false,
    campaignAwarded: false,
    preservationAwarded: false,
    tempoAwarded: false,
    victoryRound: null,
    tempoRoundLimit: null,
    ...overrides,
  };
}

describe("academic scoring", () => {
  it("locks rank titles and badge paths", () => {
    expect(scoreTitle("campaign", 6)).toBe("Valedictorian");
    expect(scoreTitle("preservation", 5)).toBe("Magna Cum Laude");
    expect(scoreTitle("tempo", 2)).toBe("Teacher's Medal");
    expect(badgeAssetPath("tempo", 0)).toBe("/art/badges/tempo/base.png");
    expect(badgeAssetPath("tempo", 6)).toBe("/art/badges/tempo/6.png");
  });

  it("clamps ranks and derives the running score", () => {
    expect(clampScoreRank(-2)).toBe(0);
    expect(clampScoreRank(99)).toBe(6);
    const state = createEmptyScoringState();
    state.campaignRank = 4;
    state.preservationRank = 2;
    state.tempoRank = 3;
    expect(scoringSummary(state, 6)).toMatchObject({ total: 9, maximum: 18 });
    expect(scoringSummary(state, 4).maximum).toBe(12);
  });

  it("awards all eligible tracks at the tempo limit", () => {
    const state = createEmptyScoringState();
    const record = room();
    state.rooms.push(record);
    expect(awardRoomVictory(state, record, 8, 8)).toMatchObject({
      campaignAwarded: true,
      preservationAwarded: true,
      tempoAwarded: true,
    });
    expect(scoringSummary(state, 6).total).toBe(3);
  });

  it("denies preservation after permanent loss and tempo beyond the limit", () => {
    const state = createEmptyScoringState();
    const record = room({ permanentLossOccurred: true });
    state.rooms.push(record);
    expect(awardRoomVictory(state, record, 9, 8)).toMatchObject({
      campaignAwarded: true,
      preservationAwarded: false,
      tempoAwarded: false,
    });
  });

  it("does not award a room twice", () => {
    const state = createEmptyScoringState();
    const record = room();
    state.rooms.push(record);
    awardRoomVictory(state, record, 5, 8);
    const second = awardRoomVictory(state, record, 5, 8);
    expect(second).toMatchObject({
      campaignAwarded: false,
      preservationAwarded: false,
      tempoAwarded: false,
    });
    expect(scoringSummary(state, 6).total).toBe(3);
  });
});
