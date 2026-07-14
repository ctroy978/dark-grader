import { describe, expect, it } from "vitest";
import type { Grade, Position } from "@dungeon-grades/shared";
import {
  commitFullRound,
  createTeam,
  placeMagnet,
  selectParty,
  startFight,
} from "./combat.js";

const POOL: Grade[] = "AAAABBBBBBBCCCCCCCDDDFF".split("") as Grade[];

function livingPositions(team: ReturnType<typeof createTeam>): Position[] {
  return team.roster
    .filter(
      (s) => s.alive && s.position && team.activePartyIds.includes(s.id),
    )
    .map((s) => s.position as Position);
}

function runFight(seed: number, mode: "afk" | "smart") {
  const team = createTeam("sim", "SIM01", "Sim", seed);
  // AFK ≈ distracted class party (glass-heavy). Smart ≈ coherent line with shield.
  const roster =
    mode === "afk"
      ? [
          "vanguard_1",
          "archer_1",
          "doomcaller_1",
          "healer_2",
          "archer_2",
          "firemage_1",
        ]
      : [
          "vanguard_1",
          "vanguard_2",
          "shieldmaiden_1",
          "healer_1",
          "firemage_1",
          "archer_1",
        ];
  selectParty(team, roster);
  // AFK pressure test uses hard boss; smart clear test uses training boss
  startFight(
    team,
    mode === "smart" ? "ash_wraith" : "bone_colossus",
    POOL,
  );

  for (let i = 0; i < 50; i++) {
    if (team.phase !== "awaiting_magnet") break;
    const living = livingPositions(team);
    if (!living.length) break;

    let pos: Position = living[0];
    if (mode === "afk") {
      // Lazy: try front, else first living
      pos = living.includes(1) ? 1 : living[0];
    } else {
      const members = team.roster.filter(
        (s) => s.alive && s.position && team.activePartyIds.includes(s.id),
      );
      const low = members.some((s) => s.currentHp < s.maxHp * 0.45);
      const healer = members.find((s) => s.archetype === "Healer");
      const mage = members.find((s) => s.archetype === "FireMage");
      const maiden = members.find((s) => s.archetype === "ShieldMaiden");
      if (low && healer?.position) pos = healer.position;
      else if (mage?.position) pos = mage.position;
      else if (maiden?.position) pos = maiden.position;
      else pos = living[0];
    }
    placeMagnet(team, pos);
    commitFullRound(team);
  }

  const party = team.roster.filter((s) => team.activePartyIds.includes(s.id));
  return {
    phase: team.phase,
    rounds: team.round,
    alive: party.filter((s) => s.alive).length,
    bossHp: team.boss?.currentHp ?? 0,
  };
}

describe("bone colossus danger", () => {
  it("AFK play is risky (losses or failed clears)", () => {
    const results = [7, 42, 99, 123, 456, 777, 999].map((s) =>
      runFight(s, "afk"),
    );
    // Wipe or still fighting after 50 rounds counts as "not a free win"
    const failures = results.filter(
      (r) => r.phase === "defeat" || r.phase === "awaiting_magnet",
    ).length;
    const wins = results.filter((r) => r.phase === "victory").length;
    // eslint-disable-next-line no-console
    console.log("AFK results", results);
    expect(failures).toBeGreaterThanOrEqual(2);
    // Should not steamroll every AFK seed
    expect(wins).toBeLessThan(results.length);
  });

  it("attentive play can still clear the training room (Ash Wraith)", () => {
    const results = [7, 42, 99, 123, 456, 777, 999].map((s) =>
      runFight(s, "smart"),
    );
    const wins = results.filter((r) => r.phase === "victory").length;
    // eslint-disable-next-line no-console
    console.log("Smart results (Ash Wraith)", results);
    expect(wins).toBeGreaterThanOrEqual(1);
  });
});
