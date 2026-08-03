import { describe, expect, it } from "vitest";
import {
  thundercallerRezHp,
  type Grade,
  type TeamState,
} from "@dungeon-grades/shared";
import { createTeam, selectParty, startFight } from "./combat.js";
import { applyPartyDamage, livingParty } from "./damage.js";
import { resolveSpecialistAction } from "./specialists.js";

const POOL: Grade[] = "AAAABBBBBBCCCCCCDDFF".split("") as Grade[];

function thunderTeam(): TeamState {
  const team = createTeam("tc-t", "THN", "Thunder", 44);
  const tc = team.roster.find((s) => s.archetype === "Thundercaller")!;
  const rest = team.roster
    .filter((s) => s.alive && s.id !== tc.id)
    .slice(0, 5)
    .map((s) => s.id);
  selectParty(team, [tc.id, ...rest]);
  startFight(team, "ash_wraith", POOL);
  team.revivedSoldierIdsThisFight = [];
  return team;
}

describe("Thundercaller A rez", () => {
  it("revives a dead party member at low HP with Dazed and Last Stand", () => {
    const team = thunderTeam();
    const tc = livingParty(team).find((s) => s.archetype === "Thundercaller")!;
    const ally = livingParty(team).find((s) => s.id !== tc.id)!;
    ally.alive = false;
    ally.currentHp = 0;
    (ally as typeof ally & { deathLogged?: boolean }).deathLogged = true;

    resolveSpecialistAction(
      team,
      tc,
      { token: "A", soldierId: tc.id, effectiveGrade: "A" },
      () => 0.5,
      () => {},
    );

    expect(ally.alive).toBe(true);
    expect(ally.currentHp).toBe(thundercallerRezHp(ally.maxHp));
    expect(ally.statuses.some((st) => st.kind === "Dazed")).toBe(true);
    expect(ally.statuses.some((st) => st.kind === "LastStand")).toBe(true);
    expect(team.revivedSoldierIdsThisFight).toContain(ally.id);
  });

  it("Last Stand on rez soaks one lethal boss hit this phase", () => {
    const team = thunderTeam();
    const tc = livingParty(team).find((s) => s.archetype === "Thundercaller")!;
    const ally = livingParty(team).find((s) => s.id !== tc.id)!;
    ally.alive = false;
    ally.currentHp = 0;

    resolveSpecialistAction(
      team,
      tc,
      { token: "A", soldierId: tc.id, effectiveGrade: "A" },
      () => 0.5,
      () => {},
    );
    const rezHp = ally.currentHp;
    expect(rezHp).toBeLessThan(10);

    // Simulate a boss hit that would kill at rez HP
    applyPartyDamage(ally, rezHp + 20, team.partyShield);

    expect(ally.alive).toBe(true);
    expect(ally.currentHp).toBe(1);
    expect(ally.statuses.some((st) => st.kind === "LastStand")).toBe(false);
    expect(ally.statuses.some((st) => st.kind === "Dazed")).toBe(true);
  });

  it("cannot rez the same soldier twice in one fight", () => {
    const team = thunderTeam();
    const tc = livingParty(team).find((s) => s.archetype === "Thundercaller")!;
    const ally = livingParty(team).find((s) => s.id !== tc.id)!;
    ally.alive = false;
    ally.currentHp = 0;

    resolveSpecialistAction(
      team,
      tc,
      { token: "A", soldierId: tc.id, effectiveGrade: "A" },
      () => 0.5,
      () => {},
    );
    expect(ally.alive).toBe(true);

    ally.alive = false;
    ally.currentHp = 0;
    ally.statuses = [];
    const bossBefore = team.boss!.currentHp;
    resolveSpecialistAction(
      team,
      tc,
      { token: "A", soldierId: tc.id, effectiveGrade: "A" },
      () => 0.5,
      () => {},
    );
    // Second A falls through to attack (no second rez)
    expect(ally.alive).toBe(false);
    expect(team.boss!.currentHp).toBeLessThan(bossBefore);
  });

  it("dazed skip wastes the revived soldier's next claim", () => {
    const team = thunderTeam();
    const tc = livingParty(team).find((s) => s.archetype === "Thundercaller")!;
    const ally = livingParty(team).find(
      (s) => s.id !== tc.id && s.archetype === "Vanguard",
    )!;
    ally.alive = false;
    ally.currentHp = 0;
    resolveSpecialistAction(
      team,
      tc,
      { token: "A", soldierId: tc.id, effectiveGrade: "A" },
      () => 0.5,
      () => {},
    );
    expect(ally.statuses.some((st) => st.kind === "Dazed")).toBe(true);

    const result = resolveSpecialistAction(
      team,
      ally,
      { token: "A", soldierId: ally.id, effectiveGrade: "A" },
      () => 0.5,
      () => {},
    );
    expect(result.acted).toBe(false);
    expect(result.skipReason).toBe("dazed");
    expect(ally.statuses.some((st) => st.kind === "Dazed")).toBe(false);
    expect(ally.block).toBe(0); // did not gain Vanguard A block
  });

  it("A with no corpses uses normal lightning kit", () => {
    const team = thunderTeam();
    const tc = livingParty(team).find((s) => s.archetype === "Thundercaller")!;
    const bossBefore = team.boss!.currentHp;
    resolveSpecialistAction(
      team,
      tc,
      { token: "A", soldierId: tc.id, effectiveGrade: "A" },
      () => 0.99, // fail stun roll
      () => {},
    );
    expect(team.boss!.currentHp).toBe(bossBefore - 14);
  });
});
