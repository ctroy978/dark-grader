import { describe, expect, it } from "vitest";
import { MAIDEN_SHIELD, type Grade, type TeamState } from "@dungeon-grades/shared";
import {
  createTeam,
  resolveBoss,
  selectParty,
  startFight,
} from "./combat.js";
import {
  applyPartyDamage,
  livingParty,
  mostLikelyToDie,
} from "./damage.js";
import { resolveSpecialistAction } from "./specialists.js";

const POOL: Grade[] = "AAAABBBBBBCCCCCCDDFF".split("") as Grade[];

function maidenTeam(): TeamState {
  const team = createTeam("mdn-t", "MDN", "Maiden", 33);
  const maiden = team.roster.find((s) => s.archetype === "ShieldMaiden")!;
  const rest = team.roster
    .filter((s) => s.alive && s.id !== maiden.id)
    .slice(0, 5)
    .map((s) => s.id);
  selectParty(team, [maiden.id, ...rest]);
  startFight(team, "ash_wraith", POOL);
  team.partyShield = { remaining: 0, active: false, coveredIds: [] };
  for (const s of livingParty(team)) {
    s.block = 0;
    s.statuses = [];
    s.currentHp = s.maxHp;
  }
  return team;
}

describe("Shield Maiden one-round cover", () => {
  it("starts with no free cover", () => {
    const team = maidenTeam();
    expect(team.partyShield.active).toBe(false);
    expect(team.partyShield.remaining).toBe(0);
  });

  it("A covers self + most likely to die; uncovered ally takes full hit", () => {
    const team = maidenTeam();
    const maiden = livingParty(team).find((s) => s.archetype === "ShieldMaiden")!;
    // Damage one ally so they are the endangered seat
    const others = livingParty(team).filter((s) => s.id !== maiden.id);
    others[0]!.currentHp = 5;
    others[1]!.currentHp = others[1]!.maxHp;

    resolveSpecialistAction(
      team,
      maiden,
      { token: "A", soldierId: maiden.id, effectiveGrade: "A" },
      () => 0.5,
      () => {},
    );

    const endangered = mostLikelyToDie(team, maiden.id)!;
    expect(endangered.currentHp).toBe(5);
    expect(team.partyShield.active).toBe(true);
    expect(team.partyShield.remaining).toBe(MAIDEN_SHIELD.A);
    expect(team.partyShield.coveredIds).toEqual(
      expect.arrayContaining([maiden.id, endangered.id]),
    );
    expect(team.partyShield.coveredIds).toHaveLength(2);

    const safe = others.find((s) => s.id !== endangered.id)!;
    const safeHp = safe.currentHp;
    applyPartyDamage(safe, 10, team.partyShield);
    expect(safe.currentHp).toBe(safeHp - 10);
    expect(team.partyShield.remaining).toBe(MAIDEN_SHIELD.A);

    const maidHp = maiden.currentHp;
    applyPartyDamage(maiden, 5, team.partyShield);
    expect(maiden.currentHp).toBe(maidHp);
    expect(team.partyShield.remaining).toBe(MAIDEN_SHIELD.A - 5);
  });

  it("cover expires after resolveBoss", () => {
    const team = maidenTeam();
    const maiden = livingParty(team).find((s) => s.archetype === "ShieldMaiden")!;
    resolveSpecialistAction(
      team,
      maiden,
      { token: "B", soldierId: maiden.id, effectiveGrade: "B" },
      () => 0.5,
      () => {},
    );
    expect(team.partyShield.active).toBe(true);
    team.phase = "boss_telegraph";
    team.pendingBossAttackId = "LineAttack";
    resolveBoss(team);
    expect(team.partyShield.active).toBe(false);
    expect(team.partyShield.remaining).toBe(0);
  });

  it("F dumps cover", () => {
    const team = maidenTeam();
    const maiden = livingParty(team).find((s) => s.archetype === "ShieldMaiden")!;
    team.partyShield = {
      remaining: 6,
      active: true,
      coveredIds: [maiden.id],
    };
    resolveSpecialistAction(
      team,
      maiden,
      { token: "F", soldierId: maiden.id, effectiveGrade: "F" },
      () => 0.5,
      () => {},
    );
    expect(team.partyShield.active).toBe(false);
    expect(team.partyShield.remaining).toBe(0);
  });
});
