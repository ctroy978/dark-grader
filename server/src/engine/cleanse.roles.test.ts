import { describe, expect, it } from "vitest";
import type { Grade } from "@dungeon-grades/shared";
import {
  createTeam,
  selectParty,
  startFight,
} from "./combat.js";
import { applyDot } from "./dots.js";
import { livingParty, soldierAt } from "./damage.js";
import { resolveSpecialistAction } from "./specialists.js";

const POOL: Grade[] = "AAAABBBBBBCCCCCCDDFF".split("") as Grade[];

function partyWith(
  archetypes: {
    at: 1 | 2 | 3 | 4 | 5 | 6;
    archetype:
      | "Healer"
      | "FireMage"
      | "Doomcaller"
      | "Vanguard"
      | "Archer"
      | "ShieldMaiden";
  }[],
) {
  const team = createTeam("cleanse", "CLN", "Cleanse", 42);
  const used = new Set<string>();
  const ids: string[] = [];
  for (const slot of archetypes) {
    const s = team.roster.find(
      (r) => r.archetype === slot.archetype && r.alive && !used.has(r.id),
    )!;
    used.add(s.id);
    ids.push(s.id);
  }
  // Fill remaining seats
  while (ids.length < 6) {
    const s = team.roster.find((r) => r.alive && !used.has(r.id))!;
    used.add(s.id);
    ids.push(s.id);
  }
  selectParty(team, ids);
  // Force positions to match request order for first N
  for (let i = 0; i < archetypes.length; i++) {
    const s = team.roster.find((r) => r.id === ids[i])!;
    s.position = archetypes[i]!.at;
  }
  // Ensure all six have positions 1-6 uniquely
  const taken = new Set(
    archetypes.map((a) => a.at as number),
  );
  let p = 1 as 1 | 2 | 3 | 4 | 5 | 6;
  for (let i = archetypes.length; i < 6; i++) {
    while (taken.has(p)) p = (p + 1) as 1 | 2 | 3 | 4 | 5 | 6;
    const s = team.roster.find((r) => r.id === ids[i])!;
    s.position = p;
    taken.add(p);
    p = (p + 1) as 1 | 2 | 3 | 4 | 5 | 6;
  }
  team.activePartyIds = [...ids].sort((a, b) => {
    const pa = team.roster.find((r) => r.id === a)!.position!;
    const pb = team.roster.find((r) => r.id === b)!.position!;
    return pa - pb;
  });
  startFight(team, "ash_wraith", POOL);
  return team;
}

describe("cleanse role split", () => {
  it("Healer A cleanses Fire/Poison but not Slime", () => {
    const team = partyWith([
      { at: 1, archetype: "Vanguard" },
      { at: 2, archetype: "Healer" },
      { at: 3, archetype: "Archer" },
    ]);
    const v = soldierAt(team, 1)!;
    applyDot(v, "Poison", 1, undefined, true);
    applyDot(v, "Fire", 1, undefined, true);
    applyDot(v, "Slime", 1);

    const healer = livingParty(team).find((s) => s.archetype === "Healer")!;
    resolveSpecialistAction(
      team,
      healer,
      { token: "A", soldierId: healer.id, effectiveGrade: "A" },
      () => 0.5,
      () => {},
    );

    const types = v.statuses
      .filter((st) => st.kind === "Dot")
      .map((st) => (st.kind === "Dot" ? st.type : ""));
    expect(types).not.toContain("Poison");
    expect(types).not.toContain("Fire");
    expect(types).toContain("Slime");
  });

  it("Doomcaller A transfers DoTs only and strips Marks; leaves Frozen", () => {
    const team = partyWith([
      { at: 1, archetype: "Doomcaller" },
      { at: 2, archetype: "Vanguard" },
      { at: 3, archetype: "Archer" },
    ]);
    const v = soldierAt(team, 2)!;
    applyDot(v, "Poison", 2, undefined, true);
    v.statuses.push({ kind: "Mark" });
    v.statuses.push({ kind: "Frozen", origin: 2, stage: 0 });

    const doom = livingParty(team).find((s) => s.archetype === "Doomcaller")!;
    resolveSpecialistAction(
      team,
      doom,
      { token: "A", soldierId: doom.id, effectiveGrade: "A" },
      () => 0.5,
      () => {},
    );

    expect(v.statuses.some((st) => st.kind === "Dot")).toBe(false);
    expect(v.statuses.some((st) => st.kind === "Mark")).toBe(false);
    expect(v.statuses.some((st) => st.kind === "Frozen")).toBe(true);
    const bossPoison = team.boss?.statuses.find(
      (st) => st.kind === "Dot" && st.type === "Poison",
    );
    expect(bossPoison).toMatchObject({
      kind: "Dot",
      type: "Poison",
      stacks: 2,
      duration: 2,
    });
    // Mark must not appear on boss
    expect(team.boss?.statuses.some((st) => st.kind === "Mark")).toBeFalsy();
  });
});
