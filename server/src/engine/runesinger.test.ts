import { describe, expect, it } from "vitest";
import {
  MAX_HOT_STREAMS_PER_SOLDIER,
  RUNESINGER_HOT_PER_TICK,
  RUNESINGER_HOT_TICKS,
  type Grade,
  type TeamState,
} from "@dungeon-grades/shared";
import { createTeam, selectParty, startFight } from "./combat.js";
import { livingParty } from "./damage.js";
import { applyFrozen, tickDots, tickHots } from "./dots.js";
import { resolveSpecialistAction } from "./specialists.js";

const POOL: Grade[] = "AAAABBBBBBCCCCCCDDFF".split("") as Grade[];

function singerTeam(seed = 11): TeamState {
  const team = createTeam("rs-t", "RUNE1", "Rune", seed);
  selectParty(team, [
    "vanguard_1",
    "shieldmaiden_1",
    "firemage_1",
    "archer_1",
    "thundercaller_1",
    "runesinger_1",
  ]);
  startFight(team, "ash_wraith", POOL);
  team.log = [];
  team.playback = [];
  for (const s of livingParty(team)) {
    s.block = 0;
    s.statuses = [];
    s.currentHp = s.maxHp;
  }
  return team;
}

function setClaims(
  team: TeamState,
  rows: { id: string; token: Grade; effective?: Grade }[],
): void {
  team.lastClaims = rows.map((r) => ({
    token: r.token,
    soldierId: r.id,
    effectiveGrade: r.effective ?? r.token,
  }));
}

function act(
  team: TeamState,
  grade: Grade,
  logs: string[] = [],
): string[] {
  const singer = livingParty(team).find((s) => s.archetype === "Runesinger")!;
  resolveSpecialistAction(
    team,
    singer,
    { token: grade, soldierId: singer.id, effectiveGrade: grade },
    () => 0.5,
    (t) => logs.push(t),
  );
  return logs;
}

describe("Runesinger rewrite + HoT", () => {
  it("A upgrades all claims +2 and applies all-line HoT", () => {
    const team = singerTeam();
    const [v, sm, fm, ar, th, rs] = livingParty(team).sort(
      (a, b) => (a.position ?? 0) - (b.position ?? 0),
    );
    setClaims(team, [
      { id: v!.id, token: "F" },
      { id: sm!.id, token: "D" },
      { id: rs!.id, token: "B" },
    ]);
    act(team, "A");
    expect(team.lastClaims!.map((c) => c.effectiveGrade)).toEqual([
      "C",
      "B",
      "A",
    ]);
    for (const s of livingParty(team)) {
      const hot = s.statuses.find((st) => st.kind === "Hot");
      expect(hot).toMatchObject({
        kind: "Hot",
        healPerTick: RUNESINGER_HOT_PER_TICK.A,
        duration: RUNESINGER_HOT_TICKS,
      });
    }
    expect(ar!.statuses.some((st) => st.kind === "Hot")).toBe(true);
    expect(th!.statuses.some((st) => st.kind === "Hot")).toBe(true);
    expect(fm!.statuses.some((st) => st.kind === "Hot")).toBe(true);
  });

  it("B parallel map: F/D→C, C→B, B stays B", () => {
    const team = singerTeam();
    const sorted = livingParty(team).sort(
      (a, b) => (a.position ?? 0) - (b.position ?? 0),
    );
    setClaims(team, [
      { id: sorted[0]!.id, token: "F" },
      { id: sorted[1]!.id, token: "C" },
      { id: sorted[5]!.id, token: "B" },
    ]);
    act(team, "B");
    expect(team.lastClaims!.map((c) => c.effectiveGrade)).toEqual([
      "C",
      "B",
      "B",
    ]);
    // Front HoT only
    for (const s of livingParty(team)) {
      const has = s.statuses.some((st) => st.kind === "Hot");
      if ((s.position ?? 99) <= 3) expect(has).toBe(true);
      else expect(has).toBe(false);
    }
  });

  it("C sets worst claim to C; front wins ties", () => {
    const team = singerTeam();
    const sorted = livingParty(team).sort(
      (a, b) => (a.position ?? 0) - (b.position ?? 0),
    );
    // Two F's at pos 2 and pos 5 — front (pos 2) wins
    setClaims(team, [
      { id: sorted[1]!.id, token: "F" },
      { id: sorted[4]!.id, token: "F" },
      { id: sorted[5]!.id, token: "A" },
    ]);
    act(team, "C");
    const c2 = team.lastClaims!.find((c) => c.soldierId === sorted[1]!.id)!;
    const c5 = team.lastClaims!.find((c) => c.soldierId === sorted[4]!.id)!;
    expect(c2.effectiveGrade).toBe("C");
    expect(c5.effectiveGrade).toBe("F");
  });

  it("D is self HoT only; F demotes with no HoT", () => {
    const team = singerTeam();
    const sorted = livingParty(team).sort(
      (a, b) => (a.position ?? 0) - (b.position ?? 0),
    );
    const rs = sorted[5]!;
    setClaims(team, [
      { id: sorted[0]!.id, token: "A" },
      { id: sorted[1]!.id, token: "B" },
      { id: rs.id, token: "D" },
    ]);
    act(team, "D");
    expect(team.lastClaims!.map((c) => c.effectiveGrade)).toEqual([
      "A",
      "B",
      "D",
    ]);
    expect(rs.statuses.filter((st) => st.kind === "Hot")).toHaveLength(1);
    expect(
      livingParty(team)
        .filter((s) => s.id !== rs.id)
        .every((s) => !s.statuses.some((st) => st.kind === "Hot")),
    ).toBe(true);

    for (const s of livingParty(team)) s.statuses = [];
    setClaims(team, [
      { id: sorted[0]!.id, token: "A" },
      { id: sorted[1]!.id, token: "B" },
      { id: rs.id, token: "F" },
    ]);
    act(team, "F");
    expect(team.lastClaims!.map((c) => c.effectiveGrade)).toEqual([
      "B",
      "C",
      "F",
    ]);
    expect(
      livingParty(team).every((s) => !s.statuses.some((st) => st.kind === "Hot")),
    ).toBe(true);
  });

  it("HoT ticks heal over 3 phases and caps streams at 2", () => {
    const team = singerTeam();
    const rs = livingParty(team).find((s) => s.archetype === "Runesinger")!;
    rs.currentHp = 10;
    setClaims(team, [{ id: rs.id, token: "A" }]);
    act(team, "A");
    act(team, "A");
    act(team, "A");
    const hots = rs.statuses.filter((st) => st.kind === "Hot");
    expect(hots.length).toBe(MAX_HOT_STREAMS_PER_SOLDIER);

    const logs: string[] = [];
    tickHots(team, (t) => logs.push(t));
    expect(logs.some((l) => l.includes("Hymn"))).toBe(true);
    expect(rs.currentHp).toBeGreaterThan(10);

    // Two more ticks finish streams
    tickHots(team, () => {});
    tickHots(team, () => {});
    expect(rs.statuses.filter((st) => st.kind === "Hot")).toHaveLength(0);
  });

  it("hard Frozen blocks HoT tick heal", () => {
    const team = singerTeam();
    const v = livingParty(team).find((s) => s.position === 1)!;
    v.currentHp = 10;
    setClaims(team, [
      { id: v.id, token: "C" },
      {
        id: livingParty(team).find((s) => s.archetype === "Runesinger")!.id,
        token: "A",
      },
    ]);
    act(team, "A");
    applyFrozen(v, 1, 0);
    const before = v.currentHp;
    tickHots(team, () => {});
    expect(v.currentHp).toBe(before);
  });

  it("hymn ticks after damage DoT phase (separate beat)", () => {
    const team = singerTeam();
    const rs = livingParty(team).find((s) => s.archetype === "Runesinger")!;
    setClaims(team, [{ id: rs.id, token: "D" }]);
    act(team, "D");
    const logs: string[] = [];
    tickDots(team, (t) => logs.push(t));
    // HoT is no longer inside tickDots — combat runs tickHots as its own beat
    expect(logs.some((l) => l.includes("[Hymn]"))).toBe(false);
    const healed = tickHots(team, (t) => logs.push(t));
    expect(logs.some((l) => l.includes("[Hymn]"))).toBe(true);
    expect(healed).toContain(rs.id);
  });
});
