import { describe, expect, it } from "vitest";
import { DOT_STATS, type TeamState } from "@dungeon-grades/shared";
import { applyDot, tickDots } from "./dots.js";
import { createTeam, selectParty, startFight } from "./combat.js";

function makeAshTeam(seed = 1): TeamState {
  const team = createTeam("dot-esc", "DOT1", "Dot", seed);
  selectParty(team, [
    "vanguard_1",
    "shieldmaiden_1",
    "healer_1",
    "firemage_1",
    "archer_1",
    "necromancer_1",
  ]);
  startFight(team, "ash_wraith", "AAAABBBBCCCCDDDFFF".split("") as never);
  // Clear any fight noise; we only care about DoT ticks
  team.log = [];
  team.partyShield = { active: false, remaining: 0 };
  for (const s of team.roster) {
    if (team.activePartyIds.includes(s.id)) {
      s.block = 0;
      s.statuses = [];
      s.currentHp = s.maxHp;
    }
  }
  team.magnetPosition = 1;
  return team;
}

function partyHp(team: TeamState): number {
  return team.roster
    .filter((s) => s.alive && team.activePartyIds.includes(s.id))
    .reduce((a, s) => a + s.currentHp, 0);
}

function poisonOnFront(team: TeamState) {
  const s = team.roster.find(
    (x) => x.position === 1 && team.activePartyIds.includes(x.id),
  );
  return s?.statuses.find((st) => st.kind === "Dot" && st.type === "Poison");
}

describe("boss DoT escalation", () => {
  it("PoisonCloud-style poison ramps splash each tick", () => {
    const team = makeAshTeam(11);
    for (const s of team.roster) {
      if (s.alive && team.activePartyIds.includes(s.id)) {
        applyDot(s, "Poison", 1, undefined, true);
      }
    }
    const totals: number[] = [];
    for (let i = 0; i < 4; i++) {
      const before = partyHp(team);
      const logs: string[] = [];
      tickDots(team, (t) => logs.push(t));
      totals.push(before - partyHp(team));
      const line = logs.find((l) => l.includes("[Poison]"));
      expect(line).toMatch(new RegExp(`intensity ${i + 1}`));
    }
    // base 8 × intensity 1..4
    expect(totals).toEqual([
      DOT_STATS.Poison.tick * 1,
      DOT_STATS.Poison.tick * 2,
      DOT_STATS.Poison.tick * 3,
      DOT_STATS.Poison.tick * 4,
    ]);
    // Fully consumed
    expect(poisonOnFront(team)).toBeUndefined();
  });

  it("player/ally poison stays flat (no intensity)", () => {
    const team = makeAshTeam(12);
    const front = team.roster.find((s) => s.position === 1)!;
    applyDot(front, "Poison", 1, undefined, false);
    const logs: string[] = [];
    const before = partyHp(team);
    tickDots(team, (t) => logs.push(t));
    const dealt = before - partyHp(team);
    expect(dealt).toBe(DOT_STATS.Poison.tick);
    const line = logs.find((l) => l.includes("[Poison]"));
    expect(line).not.toMatch(/intensity/);
    const st = poisonOnFront(team);
    expect(st?.escalationStep).toBeUndefined();
  });

  it("boss Fire ramps per soldier", () => {
    const team = makeAshTeam(13);
    const mage = team.roster.find((s) => s.archetype === "FireMage")!;
    applyDot(mage, "Fire", 1, undefined, true);
    const hits: number[] = [];
    for (let i = 0; i < 3; i++) {
      const before = mage.currentHp;
      tickDots(team, () => {});
      hits.push(before - mage.currentHp);
    }
    expect(hits).toEqual([
      DOT_STATS.Fire.tick * 1,
      DOT_STATS.Fire.tick * 2,
      DOT_STATS.Fire.tick * 3,
    ]);
  });

  it("re-applying boss poison keeps intensity (does not reset ramp)", () => {
    const team = makeAshTeam(14);
    const front = team.roster.find((s) => s.position === 1)!;
    applyDot(front, "Poison", 1, undefined, true);
    tickDots(team, () => {}); // intensity becomes 2
    applyDot(front, "Poison", 1, undefined, true); // stack + refresh, keep step
    const st = poisonOnFront(team);
    expect(st?.escalationStep).toBe(2);
    expect(st?.stacks).toBe(2);
    const before = partyHp(team);
    tickDots(team, () => {});
    // 8 base × 2 stacks × intensity 2 = 32
    expect(before - partyHp(team)).toBe(DOT_STATS.Poison.tick * 2 * 2);
  });
});
