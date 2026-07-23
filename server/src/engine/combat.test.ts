import { describe, expect, it } from "vitest";
import type { Grade } from "@dungeon-grades/shared";
import {
  commitFullRound,
  commitRound,
  createTeam,
  placeMagnet,
  resolveBoss,
  selectParty,
  startFight,
} from "./combat.js";

const SAMPLE_POOL: Grade[] = [
  "A",
  "A",
  "B",
  "B",
  "B",
  "C",
  "C",
  "C",
  "C",
  "D",
  "D",
  "F",
  "A",
  "B",
  "C",
];

function readyTeam() {
  const team = createTeam("t1", "ABCDE", "Test Team", 12345);
  const living = team.roster.filter((s) => s.alive).slice(0, 6);
  selectParty(
    team,
    living.map((s) => s.id),
  );
  startFight(team, "bone_colossus", SAMPLE_POOL);
  return team;
}

describe("combat loop", () => {
  it("starts fight with shield only when a Shield Maiden is in the party", () => {
    const withMaiden = readyTeam();
    expect(withMaiden.phase).toBe("awaiting_magnet");
    expect(withMaiden.partyShield.active).toBe(true);
    expect(withMaiden.partyShield.remaining).toBeGreaterThanOrEqual(1);

    const noMaiden = createTeam("t-nm", "NOMDN", "No Maiden", 9);
    selectParty(noMaiden, [
      "vanguard_1",
      "vanguard_2",
      "firemage_1",
      "healer_1",
      "archer_1",
      "archer_2",
    ]);
    startFight(noMaiden, "bone_colossus", SAMPLE_POOL);
    expect(noMaiden.partyShield.active).toBe(false);
    expect(noMaiden.partyShield.remaining).toBe(0);
  });

  it("splits party phase from boss phase", () => {
    const team = readyTeam();
    placeMagnet(team, 3);
    commitRound(team);
    expect(["boss_telegraph", "victory", "defeat"]).toContain(team.phase);
    if (team.phase === "boss_telegraph") {
      const afterPartyHp = team.boss!.currentHp;
      resolveBoss(team);
      expect(["awaiting_magnet", "victory", "defeat"]).toContain(team.phase);
      // boss may heal (Regenerate) so only check we advanced
      expect(team.log.some((l) => l.tags?.includes("telegraph"))).toBe(true);
      expect(afterPartyHp).toBeGreaterThanOrEqual(0);
    }
  });

  it("commitFullRound completes a full cycle", () => {
    const team = readyTeam();
    placeMagnet(team, 3);
    commitFullRound(team);
    expect(["awaiting_magnet", "victory", "defeat"]).toContain(team.phase);
    expect(team.log.length).toBeGreaterThan(3);
  });

  it("runs many full rounds to completion or timeout", () => {
    const team = readyTeam();
    for (let i = 0; i < 40; i++) {
      if (team.phase !== "awaiting_magnet") break;
      const living = team.roster.filter(
        (s) => s.alive && s.position && team.activePartyIds.includes(s.id),
      );
      if (!living.length) break;
      const target = living[i % living.length].position!;
      placeMagnet(team, target);
      commitFullRound(team);
    }
    expect(["awaiting_magnet", "victory", "defeat"]).toContain(team.phase);
  });

  it("rejects commit when not awaiting magnet", () => {
    const team = createTeam("t2", "ZZZZZ", "X", 1);
    expect(() => commitRound(team)).toThrow();
  });

  it("rejects magnet under a dead soldier", () => {
    const team = readyTeam();
    const front = team.roster.find((s) => s.position === 2)!;
    front.currentHp = 0;
    front.alive = false;
    expect(() => placeMagnet(team, 2)).toThrow(/fallen/i);
    placeMagnet(team, 1); // living ok
    expect(team.magnetPosition).toBe(1);
  });

  it("keeps personal block through party phase; expires only after boss resolve", () => {
    const team = readyTeam();
    // Simulate leftover Vanguard block from the prior defensive window
    for (const s of team.roster) {
      if (s.position) s.block = 8;
    }
    placeMagnet(team, 1);
    commitRound(team);
    // Must NOT wipe block at Drop Tokens (presentation needs chips until boss hits)
    if (team.phase === "boss_telegraph") {
      const stillBlocking = team.roster
        .filter((s) => s.alive && s.position)
        .some((s) => s.block > 0);
      expect(stillBlocking).toBe(true);
      resolveBoss(team);
    }
    // Leftover expires after the boss/add volley that can consume it
    for (const s of team.roster.filter((x) => x.position)) {
      expect(s.block).toBe(0);
    }
  });

  it("builds short presentation cues with bubbles on commit", () => {
    const team = readyTeam();
    placeMagnet(team, 1);
    commitRound(team);
    expect(team.playback.length).toBeGreaterThan(0);
    expect(team.playback.some((b) => b.kind === "drop")).toBe(true);
    if (team.lastClaims.length > 0) {
      const claims = team.playback.filter((b) => b.kind === "claim");
      expect(claims.length).toBe(team.lastClaims.length);
      expect(claims.every((c) => c.bubble?.text && c.bubble.text.length < 40)).toBe(
        true,
      );
      expect(team.playback.some((b) => b.kind === "action" && b.bubble)).toBe(
        true,
      );
    }
    expect(team.lastClaims.every((c) => c.soldierId && c.token)).toBe(true);
  });

  it("pre-picks boss attack and wind-up cue for Ash Wraith", () => {
    const team = createTeam("t-ash", "ASH01", "Ash Test", 42);
    const living = team.roster.filter((s) => s.alive).slice(0, 6);
    selectParty(
      team,
      living.map((s) => s.id),
    );
    startFight(team, "ash_wraith", SAMPLE_POOL);
    placeMagnet(team, 1);
    commitRound(team);
    if (team.phase !== "boss_telegraph") return;

    expect(team.pendingBossAttackId).toBeTruthy();
    const windup = team.playback.filter(
      (c) => c.kind === "telegraph" && c.fx?.includes("boss-windup"),
    );
    expect(windup.length).toBe(1);
    expect(windup[0]!.sfxId).toMatch(/telegraph|boss_attack/);
    expect(windup[0]!.durationMs).toBeGreaterThanOrEqual(1600);
    expect(windup[0]!.bubble?.text).toBeTruthy();
    expect(windup[0]!.bubble!.text).not.toBe("…");

    const pending = team.pendingBossAttackId!;
    resolveBoss(team);
    expect(team.pendingBossAttackId == null || team.pendingBossAttackId === null).toBe(
      true,
    );
    // Impact used the pre-picked attack (logged or cue sfx still attack-themed)
    expect(team.log.some((l) => l.tags?.includes(pending))).toBe(true);

    // No separate timed hurt beat after boss — groan layers on impact if any
    expect(team.playback.some((c) => c.kind === "hurt")).toBe(false);
    const bossHit = team.playback.find((c) => c.kind === "boss");
    if (bossHit && (bossHit.focusIds?.length ?? 0) > 1) {
      // Victims present → expect layered secondary groan (or empty if no living)
      // secondary is optional when pick fails; duration still long enough for audio
      expect(bossHit.durationMs ?? 0).toBeGreaterThanOrEqual(1400);
    }
  });
});

