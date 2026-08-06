import { describe, expect, it } from "vitest";
import {
  RUNESINGER_DAMAGE,
  type Grade,
  type TeamState,
} from "@dungeon-grades/shared";
import { createTeam, selectParty, startFight } from "./combat.js";
import { livingParty } from "./damage.js";
import { resolveSpecialistAction } from "./specialists.js";

const POOL: Grade[] = "AAAABBBBBBCCCCCCDDFF".split("") as Grade[];

function singerTeam(seed = 11, front = false): TeamState {
  const team = createTeam("rs-t", "RUNE1", "Rune", seed);
  selectParty(
    team,
    front
      ? [
          "runesinger_1",
          "vanguard_1",
          "shieldmaiden_1",
          "firemage_1",
          "archer_1",
          "lifebinder_1",
        ]
      : [
          "vanguard_1",
          "runesinger_1",
          "shieldmaiden_1",
          "firemage_1",
          "archer_1",
          "lifebinder_1",
        ],
  );
  startFight(team, front ? "moss_grub" : "ash_wraith", POOL);
  team.log = [];
  team.playback = [];
  for (const soldier of livingParty(team)) {
    soldier.block = 0;
    soldier.statuses = [];
    soldier.currentHp = soldier.maxHp;
  }
  return team;
}

function setClaims(
  team: TeamState,
  rows: { id: string; token: Grade; effective?: Grade }[],
): void {
  team.lastClaims = rows.map((row) => ({
    token: row.token,
    soldierId: row.id,
    effectiveGrade: row.effective ?? row.token,
  }));
}

function act(team: TeamState, grade: Grade): void {
  const singer = livingParty(team).find(
    (soldier) => soldier.archetype === "Runesinger",
  )!;
  resolveSpecialistAction(
    team,
    singer,
    { token: grade, soldierId: singer.id, effectiveGrade: grade },
    () => 0.5,
    () => {},
  );
}

function actClaim(team: TeamState, soldierId: string): void {
  const singer = livingParty(team).find((soldier) => soldier.id === soldierId)!;
  const claim = team.lastClaims.find((entry) => entry.soldierId === soldierId)!;
  resolveSpecialistAction(team, singer, claim, () => 0.5, () => {});
}

describe("Runesinger rewrite + rune attack", () => {
  it("A upgrades all claims +2 and deals the A attack", () => {
    const team = singerTeam();
    const party = livingParty(team);
    const singer = party.find((soldier) => soldier.archetype === "Runesinger")!;
    setClaims(team, [
      { id: party[0]!.id, token: "F" },
      { id: party[2]!.id, token: "D" },
      { id: singer.id, token: "A" },
    ]);
    const before = team.boss!.currentHp;
    act(team, "A");
    expect(team.lastClaims.map((claim) => claim.effectiveGrade)).toEqual([
      "C",
      "B",
      "A",
    ]);
    expect(before - team.boss!.currentHp).toBe(RUNESINGER_DAMAGE.A);
    expect(
      party.every((soldier) =>
        soldier.statuses.every((status) => status.kind !== "Hot"),
      ),
    ).toBe(true);
  });

  it("B maps grades in parallel and attacks", () => {
    const team = singerTeam();
    const party = livingParty(team);
    setClaims(team, [
      { id: party[0]!.id, token: "F" },
      { id: party[1]!.id, token: "C" },
      { id: party[2]!.id, token: "B" },
    ]);
    const before = team.boss!.currentHp;
    act(team, "B");
    expect(team.lastClaims.map((claim) => claim.effectiveGrade)).toEqual([
      "C",
      "B",
      "B",
    ]);
    expect(before - team.boss!.currentHp).toBe(RUNESINGER_DAMAGE.B);
  });

  it("C fixes the frontmost tied worst claim and attacks", () => {
    const team = singerTeam();
    const party = livingParty(team);
    setClaims(team, [
      { id: party[1]!.id, token: "F" },
      { id: party[4]!.id, token: "F" },
      { id: party[5]!.id, token: "A" },
    ]);
    const before = team.boss!.currentHp;
    act(team, "C");
    expect(team.lastClaims[0]!.effectiveGrade).toBe("C");
    expect(team.lastClaims[1]!.effectiveGrade).toBe("F");
    expect(before - team.boss!.currentHp).toBe(RUNESINGER_DAMAGE.C);
  });

  it("D attacks without rewriting; F demotes and does not attack", () => {
    const team = singerTeam();
    const party = livingParty(team);
    setClaims(team, [
      { id: party[0]!.id, token: "A" },
      { id: party[1]!.id, token: "B" },
    ]);
    let before = team.boss!.currentHp;
    act(team, "D");
    expect(team.lastClaims.map((claim) => claim.effectiveGrade)).toEqual([
      "A",
      "B",
    ]);
    expect(before - team.boss!.currentHp).toBe(RUNESINGER_DAMAGE.D);

    before = team.boss!.currentHp;
    act(team, "F");
    expect(team.lastClaims.map((claim) => claim.effectiveGrade)).toEqual([
      "B",
      "C",
    ]);
    expect(team.boss!.currentHp).toBe(before);
  });

  it("uses the ordinary gap rule from a front seat", () => {
    const team = singerTeam(12, true);
    const minion = team.minions.find((entry) => entry.currentHp > 0)!;
    const bossBefore = team.boss!.currentHp;
    const minionBefore = minion.currentHp;
    act(team, "A");
    expect(minion.currentHp).toBeLessThan(minionBefore);
    expect(team.boss!.currentHp).toBe(bossBefore);
  });

  it("never consumes an obsolete Life Power status", () => {
    const team = singerTeam();
    const singer = livingParty(team).find(
      (soldier) => soldier.archetype === "Runesinger",
    )!;
    singer.statuses.push({ kind: "LifePower", bonus: 6 });
    act(team, "A");
    expect(singer.statuses).toContainEqual({ kind: "LifePower", bonus: 6 });
  });

  it("stacks two Runesinger rewrites deterministically from front to back", () => {
    const team = createTeam("rs-pair", "RUNE2", "Rune Pair", 13);
    selectParty(team, [
      "runesinger_1",
      "vanguard_1",
      "runesinger_2",
      "firemage_1",
      "archer_1",
      "lifebinder_1",
    ]);
    startFight(team, "moss_grub", POOL);
    const party = livingParty(team);
    setClaims(team, [
      { id: "runesinger_1", token: "B" },
      { id: "runesinger_2", token: "C" },
      { id: party[3]!.id, token: "F" },
    ]);

    actClaim(team, "runesinger_1");
    expect(team.lastClaims.map((claim) => claim.effectiveGrade)).toEqual([
      "B",
      "B",
      "C",
    ]);

    // The second singer now acts with the B created by the first rewrite.
    actClaim(team, "runesinger_2");
    expect(team.lastClaims.map((claim) => claim.effectiveGrade)).toEqual([
      "B",
      "B",
      "B",
    ]);
  });
});
