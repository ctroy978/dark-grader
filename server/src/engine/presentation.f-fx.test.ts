import { describe, expect, it } from "vitest";
import type { Grade, TeamState } from "@dungeon-grades/shared";
import {
  createTeam,
  selectParty,
  startFight,
} from "./combat.js";
import { cueAction, ensurePlayback } from "./presentation.js";
import {
  beginPartyActionPhase,
  endPartyActionPhase,
  resolveSpecialistAction,
} from "./specialists.js";

const POOL: Grade[] = "AAAABBBBBBCCCCCCDDFF".split("") as Grade[];

function makeParty(seed: number): TeamState {
  const team = createTeam(`fx-${seed}`, "FX01", "FX", seed);
  selectParty(team, [
    "vanguard_1",
    "thundercaller_1",
    "firemage_1",
    "archer_1",
    "necromancer_1",
    "healer_1",
  ]);
  startFight(team, "bone_colossus", POOL);
  team.playback = [];
  team.log = [];
  for (const s of team.roster) {
    if (team.activePartyIds.includes(s.id)) {
      s.block = 0;
      s.statuses = [];
      s.currentHp = s.maxHp;
    }
  }
  if (team.boss) team.boss.currentHp = team.boss.maxHp;
  return team;
}

describe("F-token presentation targets (real cast, correct panels)", () => {
  it("cueAction still plays full cast charge/blast on F (not a silent fizzle)", () => {
    const team = makeParty(1);
    const tc = team.roster.find((s) => s.archetype === "Thundercaller")!;
    ensurePlayback(team);
    cueAction(
      team,
      tc.id,
      tc.name,
      "Thundercaller",
      "F",
      () => 0.5,
      ["shock-flash"],
      { hitFocusIds: ["vanguard_1"] },
    );
    const kinds = team.playback.map((c) => c.kind);
    expect(kinds).toContain("telegraph");
    expect(kinds).toContain("action");
    const tel = team.playback.find((c) => c.kind === "telegraph")!;
    const act = team.playback.find((c) => c.kind === "action")!;
    expect(tel.fx).toContain("thunder-charge");
    expect(act.fx).toContain("thunder-blast");
    expect(act.focusIds).toContain("vanguard_1");
    expect(act.focusIds).not.toContain("boss");
    // Kit attack SFX — not comic fizzle
    expect(act.sfxId).not.toBe("fizzle");
    expect(act.sfxId).toMatch(/thunder|act_|hit_/);
  });

  it("Healer F heals boss HP and focus should include boss for heal FX", () => {
    const team = makeParty(2);
    const healer = team.roster.find((s) => s.archetype === "Healer")!;
    const before = team.boss!.currentHp;
    // Chip boss so heal is visible
    team.boss!.currentHp = Math.max(1, before - 20);
    const bossHp = team.boss!.currentHp;

    resolveSpecialistAction(
      team,
      healer,
      { token: "F", soldierId: healer.id, effectiveGrade: "F" },
      () => 0.5,
      () => {},
    );
    expect(team.boss!.currentHp).toBeGreaterThan(bossHp);

    ensurePlayback(team);
    cueAction(
      team,
      healer.id,
      healer.name,
      "Healer",
      "F",
      () => 0.5,
      ["heal-glow"],
      { hitFocusIds: ["boss"] },
    );
    const act = team.playback.find((c) => c.kind === "action")!;
    expect(act.focusIds).toContain("boss");
    expect(act.fx).toContain("heal-blast");
    expect(act.sfxId).not.toBe("fizzle");
  });

  it("Thundercaller F always reports the aimed ally for shock FX (even on stun miss)", () => {
    const team = makeParty(3);
    const tc = team.roster.find((s) => s.archetype === "Thundercaller")!;
    const others = team.activePartyIds.filter((id) => id !== tc.id);
    beginPartyActionPhase([tc.id, ...others]);
    try {
      // First random: target pick; second: stun roll (>= 0.3 → miss)
      let n = 0;
      const random = () => {
        n += 1;
        return n === 1 ? 0 : 0.99;
      };
      const result = resolveSpecialistAction(
        team,
        tc,
        { token: "F", soldierId: tc.id, effectiveGrade: "F" },
        random,
        () => {},
      );
      expect(result.acted).toBe(true);
      expect(result.effectFocusIds?.length).toBe(1);
      const aimed = result.effectFocusIds![0]!;
      expect(others).toContain(aimed);
      // Stun missed
      const ally = team.roster.find((s) => s.id === aimed)!;
      expect(ally.statuses.some((s) => s.kind === "Stun")).toBe(false);
    } finally {
      endPartyActionPhase();
    }
  });

  it("FireMage F damages living party (focus should be party, not empty→boss default)", () => {
    const team = makeParty(4);
    const mage = team.roster.find((s) => s.archetype === "FireMage")!;
    const before = new Map(
      team.roster
        .filter((s) => team.activePartyIds.includes(s.id))
        .map((s) => [s.id, s.currentHp] as const),
    );
    resolveSpecialistAction(
      team,
      mage,
      { token: "F", soldierId: mage.id, effectiveGrade: "F" },
      () => 0.5,
      () => {},
    );
    const damaged = [...before.entries()]
      .filter(([id, hp]) => {
        const now = team.roster.find((s) => s.id === id)!;
        return now.currentHp < hp;
      })
      .map(([id]) => id);
    expect(damaged.length).toBeGreaterThan(0);

    ensurePlayback(team);
    cueAction(
      team,
      mage.id,
      mage.name,
      "FireMage",
      "F",
      () => 0.5,
      ["fire-flash", "fire-tint", "hurt-flash"],
      { hitFocusIds: damaged },
    );
    const act = team.playback.find((c) => c.kind === "action")!;
    for (const id of damaged) {
      expect(act.focusIds).toContain(id);
    }
    // No phantom boss focus when only the party was hurt
    expect(act.focusIds).not.toContain("boss");
    expect(act.fx).toContain("fire-blast");
  });
});
