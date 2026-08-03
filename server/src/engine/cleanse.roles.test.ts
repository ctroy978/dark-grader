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
      | "Spearman"
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
  // Formation rule: Healer/Runesinger only in back seat for selectParty
  const supportIds = ids.filter((id) => {
    const a = team.roster.find((r) => r.id === id)!.archetype;
    return a === "Healer" || a === "Runesinger";
  });
  const restIds = ids.filter((id) => !supportIds.includes(id));
  const orderedIds =
    supportIds.length > 0
      ? [...restIds, supportIds[supportIds.length - 1]!].slice(0, 6)
      : ids;
  selectParty(team, orderedIds);
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
  it("Healer A cleanses Fire/Poison but not Slime or Ice", () => {
    const team = partyWith([
      { at: 1, archetype: "Vanguard" },
      { at: 2, archetype: "Healer" },
      { at: 3, archetype: "Archer" },
    ]);
    const v = soldierAt(team, 1)!;
    applyDot(v, "Poison", 1, undefined, true);
    applyDot(v, "Fire", 1, undefined, true);
    applyDot(v, "Slime", 1);
    applyDot(v, "Ice", 1);

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
    expect(types).toContain("Ice");
  });

  it("Fire Mage A front clears Ice/Slime and thaws Frozen; Healer does not thaw", () => {
    const team = partyWith([
      { at: 1, archetype: "Vanguard" },
      { at: 2, archetype: "FireMage" },
      { at: 3, archetype: "Healer" },
    ]);
    const front = soldierAt(team, 1)!;
    const mid = soldierAt(team, 3)!; // Healer at 3 (front half)
    const mage = livingParty(team).find((s) => s.archetype === "FireMage")!;
    // Do not freeze the mage — Frozen would waste their token
    applyDot(front, "Ice", 1);
    applyDot(front, "Slime", 1);
    front.statuses.push({ kind: "Frozen", origin: 1, stage: 0 });
    mid.statuses.push({ kind: "Frozen", origin: 3, stage: 0 });

    resolveSpecialistAction(
      team,
      mage,
      { token: "A", soldierId: mage.id, effectiveGrade: "A" },
      () => 0.5,
      () => {},
    );

    // A = front half (1–3)
    expect(front.statuses.some((st) => st.kind === "Frozen")).toBe(false);
    expect(mid.statuses.some((st) => st.kind === "Frozen")).toBe(false);
    expect(
      front.statuses.some((st) => st.kind === "Dot" && st.type === "Ice"),
    ).toBe(false);
    expect(
      front.statuses.some((st) => st.kind === "Dot" && st.type === "Slime"),
    ).toBe(false);

    // Ally (Vanguard) re-frozen; Healer must be free to act
    front.statuses.push({ kind: "Frozen", origin: 1, stage: 0 });
    applyDot(front, "Fire", 1, undefined, true);
    const healer = livingParty(team).find((s) => s.archetype === "Healer")!;
    resolveSpecialistAction(
      team,
      healer,
      { token: "A", soldierId: healer.id, effectiveGrade: "A" },
      () => 0.5,
      () => {},
    );
    expect(front.statuses.some((st) => st.kind === "Frozen")).toBe(true);
    expect(
      front.statuses.some((st) => st.kind === "Dot" && st.type === "Fire"),
    ).toBe(false);
  });

  it("Marks are not cleared by Healer A", () => {
    const team = partyWith([
      { at: 1, archetype: "Vanguard" },
      { at: 2, archetype: "Healer" },
      { at: 3, archetype: "Archer" },
    ]);
    const v = soldierAt(team, 1)!;
    v.statuses.push({ kind: "Mark" });
    applyDot(v, "Poison", 1, undefined, true);

    const healer = livingParty(team).find((s) => s.archetype === "Healer")!;
    resolveSpecialistAction(
      team,
      healer,
      { token: "A", soldierId: healer.id, effectiveGrade: "A" },
      () => 0.5,
      () => {},
    );

    expect(v.statuses.some((st) => st.kind === "Mark")).toBe(true);
    expect(v.statuses.some((st) => st.kind === "Dot" && st.type === "Poison")).toBe(
      false,
    );
  });
});
