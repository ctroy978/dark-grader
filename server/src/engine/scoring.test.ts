import { describe, expect, it } from "vitest";
import { scoringSummary, type Grade } from "@dungeon-grades/shared";
import {
  commitFullRound,
  createTeam,
  runAway,
  selectParty,
  startFight,
} from "./combat.js";

const ALL_A: Grade[] = Array.from({ length: 18 }, () => "A" as const);

function legalParty(team: ReturnType<typeof createTeam>): string[] {
  return team.roster
    .filter(
      (soldier) =>
        soldier.alive &&
        soldier.archetype !== "Healer" &&
        soldier.archetype !== "Runesinger",
    )
    .slice(0, 6)
    .map((soldier) => soldier.id);
}

function startEasyWin(team: ReturnType<typeof createTeam>): void {
  selectParty(team, legalParty(team));
  startFight(team, "moss_grub", ALL_A);
  team.minions = [];
  team.boss!.currentHp = 1;
  commitFullRound(team);
  expect(team.phase).toBe("victory");
}

describe("combat scoring lifecycle", () => {
  it("starts an attempt and awards all three tracks on a fast clean victory", () => {
    const team = createTeam("score-clean", "SC001", "Clean", 41);
    startEasyWin(team);

    const room = team.scoring.rooms[0]!;
    expect(room.attempts).toHaveLength(1);
    expect(room.attempts[0]).toMatchObject({
      attemptNumber: 1,
      outcome: "victory",
      endingRound: 1,
    });
    expect(team.lastScoreAwards).toMatchObject({
      campaignAwarded: true,
      preservationAwarded: true,
      tempoAwarded: true,
    });
    expect(scoringSummary(team.scoring, 6).total).toBe(3);
  });

  it("carries a permanent loss across a retreat and retry", () => {
    const team = createTeam("score-retry", "SC002", "Retry", 42);
    selectParty(team, legalParty(team));
    startFight(team, "moss_grub", ALL_A);
    const lost = team.roster.find((soldier) => soldier.id === team.activePartyIds[0])!;
    lost.alive = false;
    lost.currentHp = 0;
    runAway(team);

    const room = team.scoring.rooms[0]!;
    expect(room.permanentLossOccurred).toBe(true);
    expect(room.attempts[0]?.outcome).toBe("retreat");

    startEasyWin(team);
    expect(room.attempts).toHaveLength(2);
    expect(team.lastScoreAwards).toMatchObject({
      campaignAwarded: true,
      preservationAwarded: false,
      tempoAwarded: true,
    });
    expect(scoringSummary(team.scoring, 6).total).toBe(2);
  });

  it("does not count a soldier revived before attempt end as permanently lost", () => {
    const team = createTeam("score-revive", "SC003", "Revive", 43);
    selectParty(team, legalParty(team));
    startFight(team, "moss_grub", ALL_A);
    const revived = team.roster.find((soldier) => soldier.id === team.activePartyIds[0])!;
    revived.alive = false;
    revived.currentHp = 0;
    revived.alive = true;
    revived.currentHp = 1;
    team.minions = [];
    team.boss!.currentHp = 1;
    commitFullRound(team);

    expect(team.scoring.rooms[0]?.permanentLossOccurred).toBe(false);
    expect(team.lastScoreAwards?.preservationAwarded).toBe(true);
  });

  it("uses the configured boss Tempo limit", () => {
    const team = createTeam("score-tempo", "SC004", "Tempo", 44);
    selectParty(team, legalParty(team));
    startFight(team, "moss_grub", ALL_A);
    expect(team.boss?.tempoRoundLimit).toBe(8);
    team.round = 9;
    team.minions = [];
    team.boss!.currentHp = 1;
    commitFullRound(team);

    expect(team.lastScoreAwards?.tempoAwarded).toBe(false);
    expect(team.lastScoreAwards?.victoryRound).toBe(9);
    expect(team.lastScoreAwards?.tempoRoundLimit).toBe(8);
  });
});
