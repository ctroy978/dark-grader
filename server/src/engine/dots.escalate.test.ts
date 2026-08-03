import { describe, expect, it } from "vitest";
import {
  DOT_STATS,
  MAX_PARTY_POISON_STACKS,
  MAX_POISON_INTENSITY,
  type TeamState,
} from "@dungeon-grades/shared";
import { applyDot, tickDots } from "./dots.js";
import { createTeam, selectParty, startFight } from "./combat.js";
import { pickBossAttackId } from "./bosses.js";

function makeAshTeam(seed = 1): TeamState {
  const team = createTeam("dot-esc", "DOT1", "Dot", seed);
  selectParty(team, [
    "vanguard_1",
    "shieldmaiden_1",
    "firemage_1",
    "archer_1",
    "necromancer_1",
    "healer_1",
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
  const st = s?.statuses.find((x) => x.kind === "Dot" && x.type === "Poison");
  return st?.kind === "Dot" ? st : undefined;
}

describe("boss DoT escalation", () => {
  it("PoisonCloud-style poison ramps splash each tick (intensity capped)", () => {
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
      // Intensity 1,2,3 then stays at 3 (cap) for the 4th tick of duration
      const expectedInt = Math.min(MAX_POISON_INTENSITY, i + 1);
      expect(line).toMatch(new RegExp(`intensity ${expectedInt}`));
    }
    // base 8 × intensity 1,2,3,3 (capped) — duration 4 then gone
    expect(totals).toEqual([
      DOT_STATS.Poison.tick * 1,
      DOT_STATS.Poison.tick * 2,
      DOT_STATS.Poison.tick * 3,
      DOT_STATS.Poison.tick * 3,
    ]);
    // Fully consumed
    expect(poisonOnFront(team)).toBeUndefined();
  });

  it("party Poison stacks cap at 2", () => {
    const team = makeAshTeam(16);
    const front = team.roster.find((s) => s.position === 1)!;
    applyDot(front, "Poison", 1, undefined, true);
    applyDot(front, "Poison", 1, undefined, true);
    applyDot(front, "Poison", 1, undefined, true);
    const st = poisonOnFront(team);
    expect(st?.stacks).toBe(MAX_PARTY_POISON_STACKS);
  });

  it("blocks PoisonCloud while party still has Poison", () => {
    const team = makeAshTeam(17);
    const front = team.roster.find((s) => s.position === 1)!;
    applyDot(front, "Poison", 1, undefined, true);
    // Force many picks — none should be PoisonCloud while toxin remains
    for (let i = 0; i < 40; i++) {
      const id = pickBossAttackId(team, () => (i * 0.017) % 1);
      expect(id).not.toBe("PoisonCloud");
    }
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

  it("party Fire stacks cap at 2 (extra Clouds refresh, do not spike)", () => {
    const team = makeAshTeam(15);
    const mage = team.roster.find((s) => s.archetype === "FireMage")!;
    applyDot(mage, "Fire", 1, undefined, true);
    applyDot(mage, "Fire", 1, undefined, true);
    applyDot(mage, "Fire", 1, undefined, true); // would be ×3 without cap
    const st = mage.statuses.find((x) => x.kind === "Dot" && x.type === "Fire");
    expect(st?.kind).toBe("Dot");
    if (st?.kind === "Dot") {
      expect(st.stacks).toBe(2);
      expect(st.escalationStep).toBe(1);
    }
    const before = mage.currentHp;
    tickDots(team, () => {});
    // 4 base × 2 stacks × intensity 1
    expect(before - mage.currentHp).toBe(DOT_STATS.Fire.tick * 2 * 1);
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
