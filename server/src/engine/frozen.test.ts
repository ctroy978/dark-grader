import { describe, expect, it } from "vitest";
import {
  FROST_SHATTER_FROZEN_DAMAGE,
  FROST_SHATTER_SPLASH_DAMAGE,
  type Grade,
} from "@dungeon-grades/shared";
import {
  createTeam,
  selectParty,
  startFight,
} from "./combat.js";
import { healSoldier, livingParty, soldierAt } from "./damage.js";
import {
  applyDot,
  applyFrozen,
  cleanseDots,
  isFrozen,
  partyHasFrozen,
  stripDotsAndMarks,
  tickDots,
  tickFrozenChain,
} from "./dots.js";
import { pickBossAttackId, resolveBossPhase } from "./bosses.js";
import { resolveSpecialistAction } from "./specialists.js";
import { getBossTemplate } from "../seed/bossLoader.js";

const POOL: Grade[] = "AAAABBBBCCCCDDDFFF".split("") as Grade[];

function wardenTeam(seed = 42) {
  const team = createTeam("warden-t", "WRDN1", "Warden", seed);
  const living = team.roster.filter((s) => s.alive).slice(0, 6);
  selectParty(
    team,
    living.map((s) => s.id),
  );
  startFight(team, "barrow_warden", POOL);
  return team;
}

describe("SpreadingFrost / Frozen", () => {
  it("loads Barrow Warden frost kit from TOML", () => {
    const w = getBossTemplate("barrow_warden");
    expect(w).toBeDefined();
    expect(w!.maxHp).toBe(210);
    expect(w!.traits).toContain("Frost");
    expect(w!.attackIds).toEqual(
      expect.arrayContaining([
        "NorthWind",
        "SouthWind",
        "SpreadingFrost",
        "Regenerate",
      ]),
    );
    expect(w!.attackIds).not.toContain("FrontSlam");
    expect(w!.attackIds).not.toContain("LineAttack");
    expect(w!.attackIds).not.toContain("PoisonCloud");
    const frost = w!.attacks.find((a) => a.id === "SpreadingFrost");
    expect(frost?.weight).toBe(3);
  });

  it("applies Frozen and blocks heal; non-A wastes attack", () => {
    const team = wardenTeam();
    const s = soldierAt(team, 1)!;
    s.currentHp = 20;
    applyFrozen(s, 1, 0);
    expect(isFrozen(s)).toBe(true);
    expect(healSoldier(s, 10)).toBe(0);
    expect(s.currentHp).toBe(20);

    const result = resolveSpecialistAction(
      team,
      s,
      { token: "B", soldierId: s.id, effectiveGrade: "B" },
      () => 0.5,
      () => {},
    );
    expect(result.acted).toBe(false);
    expect(result.skipReason).toBe("frozen");
    expect(isFrozen(s)).toBe(true);
  });

  it("party friendly fire glances off Frozen; Chill still ticks", () => {
    const team = wardenTeam(13);
    const s = soldierAt(team, 1)!;
    applyFrozen(s, 1, 0);
    const hp0 = s.currentHp;
    const mage = team.roster.find((x) => x.archetype === "FireMage" && x.alive)!;
    if (!team.activePartyIds.includes(mage.id)) {
      team.activePartyIds[2] = mage.id;
    }
    mage.position = 3;
    resolveSpecialistAction(
      team,
      mage,
      { token: "F", soldierId: mage.id, effectiveGrade: "F" },
      () => 0.5,
      () => {},
    );
    expect(s.currentHp).toBe(hp0);
    expect(isFrozen(s)).toBe(true);
  });

  it("boss hits glance off Frozen; Chill DoT still ticks; cleanse skipped", () => {
    const team = wardenTeam(11);
    team.partyShield = { remaining: 0, active: false };
    const s = soldierAt(team, 1)!;
    applyDot(s, "Chill", 1, 3, true);
    applyFrozen(s, 1, 0);
    const hp0 = s.currentHp;

    team.pendingBossAttackId = "NorthWind";
    const logs: string[] = [];
    resolveBossPhase(team, () => 0.5, (t) => logs.push(t));
    expect(s.currentHp).toBe(hp0); // no boss damage through ice
    expect(logs.some((l) => l.includes("encased in ice"))).toBe(true);
    expect(
      s.statuses.some((st) => st.kind === "Dot" && st.type === "Chill"),
    ).toBe(true);

    // Fire Mage A front cleanse cannot strip Chill while frozen
    const mage = team.roster.find((x) => x.archetype === "FireMage" && x.alive)!;
    if (!team.activePartyIds.includes(mage.id)) {
      team.activePartyIds[2] = mage.id;
      mage.position = 2;
    }
    mage.position = 2;
    resolveSpecialistAction(
      team,
      mage,
      { token: "A", soldierId: mage.id, effectiveGrade: "A" },
      () => 0.5,
      () => {},
    );
    expect(
      s.statuses.some((st) => st.kind === "Dot" && st.type === "Chill"),
    ).toBe(true);
    expect(isFrozen(s)).toBe(true);

    // Chill still ticks in DoT phase (frost chain also chips)
    const hp1 = s.currentHp;
    tickDots(team, () => {});
    expect(s.currentHp).toBeLessThan(hp1);
  });

  it("A on a chain-Frozen seat cracks all chain ice (party thaw)", () => {
    const team = wardenTeam();
    applyFrozen(soldierAt(team, 1)!, 1, 1);
    applyFrozen(soldierAt(team, 2)!, 1, 1);
    const breaker = soldierAt(team, 1)!;
    const result = resolveSpecialistAction(
      team,
      breaker,
      { token: "A", soldierId: breaker.id, effectiveGrade: "A" },
      () => 0.5,
      () => {},
    );
    expect(result.acted).toBe(true);
    expect(result.iceBreak).toBe(true);
    expect(isFrozen(soldierAt(team, 1)!)).toBe(false);
    expect(isFrozen(soldierAt(team, 2)!)).toBe(false);
    expect(result.effectFocusIds?.length).toBeGreaterThanOrEqual(2);
  });

  it("spreads front chain 1→2→3 then shatters", () => {
    const team = wardenTeam();
    // Drop party shield so shatter numbers are readable
    team.partyShield = { remaining: 0, active: false };
    const logs: string[] = [];
    const log = (t: string) => logs.push(t);

    applyFrozen(soldierAt(team, 1)!, 1, 0);
    tickFrozenChain(team, log);
    expect(isFrozen(soldierAt(team, 1)!)).toBe(true);
    expect(isFrozen(soldierAt(team, 2)!)).toBe(true);
    expect(
      soldierAt(team, 1)!.statuses.find((st) => st.kind === "Frozen")!.stage,
    ).toBe(1);

    tickFrozenChain(team, log);
    expect(isFrozen(soldierAt(team, 3)!)).toBe(true);
    expect(
      livingParty(team)
        .filter((s) => isFrozen(s))
        .map((s) => s.position),
    ).toEqual([1, 2, 3]);

    const hpBefore = Object.fromEntries(
      livingParty(team).map((s) => [s.id, s.currentHp]),
    );
    tickFrozenChain(team, log);
    expect(partyHasFrozen(team)).toBe(false);
    expect(logs.some((l) => l.includes("SHATTER"))).toBe(true);

    for (const s of livingParty(team)) {
      const lost = hpBefore[s.id]! - s.currentHp;
      if ((s.position ?? 0) <= 3) {
        expect(lost).toBe(FROST_SHATTER_FROZEN_DAMAGE);
      } else {
        expect(lost).toBe(FROST_SHATTER_SPLASH_DAMAGE);
      }
    }
  });

  it("spreads origin-2 chain 2→3→4", () => {
    const team = wardenTeam();
    applyFrozen(soldierAt(team, 2)!, 2, 0);
    tickFrozenChain(team, () => {});
    expect(isFrozen(soldierAt(team, 3)!)).toBe(true);
    tickFrozenChain(team, () => {});
    expect(isFrozen(soldierAt(team, 4)!)).toBe(true);
    expect(
      livingParty(team)
        .filter(isFrozen)
        .map((s) => s.position)
        .sort(),
    ).toEqual([2, 3, 4]);
  });

  it("skips dead seats when spreading", () => {
    const team = wardenTeam();
    const mid = soldierAt(team, 2)!;
    mid.alive = false;
    mid.currentHp = 0;
    applyFrozen(soldierAt(team, 1)!, 1, 0);
    tickFrozenChain(team, () => {});
    expect(isFrozen(soldierAt(team, 3)!)).toBe(true);
    expect(
      soldierAt(team, 1)!.statuses.find((st) => st.kind === "Frozen")!.stage,
    ).toBe(1);
  });

  it("DoT cleanse and stripDotsAndMarks do not remove Frozen", () => {
    const team = wardenTeam();
    applyFrozen(soldierAt(team, 1)!, 1, 0);
    applyFrozen(soldierAt(team, 2)!, 1, 1);

    const front = livingParty(team).filter((s) => (s.position ?? 0) <= 3);
    cleanseDots(front, ["Ice", "Poison", "Slime", "Fire"]);
    expect(partyHasFrozen(team)).toBe(true);

    stripDotsAndMarks(livingParty(team));
    expect(partyHasFrozen(team)).toBe(true);
    expect(isFrozen(soldierAt(team, 1)!)).toBe(true);
  });

  it("does not pick SpreadingFrost while anyone is Frozen", () => {
    const team = wardenTeam(99);
    applyFrozen(soldierAt(team, 1)!, 1, 0);
    for (let i = 0; i < 40; i++) {
      const id = pickBossAttackId(team, () => (i * 0.017) % 1);
      expect(id).not.toBe("SpreadingFrost");
    }
  });

  it("SpreadingFrost always damages the line and freezes the frontmost living", () => {
    const team = wardenTeam(3);
    team.partyShield = { remaining: 0, active: false };
    const hpBefore = Object.fromEntries(
      livingParty(team).map((s) => [s.id, s.currentHp]),
    );
    team.pendingBossAttackId = "SpreadingFrost";
    const logs: string[] = [];
    resolveBossPhase(team, () => 0.9, (t) => logs.push(t));
    expect(logs.some((l) => l.includes("Spreading Frost"))).toBe(true);
    for (const s of livingParty(team)) {
      expect(hpBefore[s.id]! - s.currentHp).toBeGreaterThan(0);
    }
    expect(partyHasFrozen(team)).toBe(true);
    const frozen = livingParty(team).find(isFrozen)!;
    expect(frozen.position).toBe(1);
    expect(logs.some((l) => l.includes("fails to lock"))).toBe(false);
  });

  it("SpreadingFrost freezes frontmost living when seats 1–2 are empty", () => {
    const team = wardenTeam(4);
    team.partyShield = { remaining: 0, active: false };
    // Kill front two seats — freeze must land on next living (pos 3)
    for (const pos of [1, 2] as const) {
      const s = soldierAt(team, pos)!;
      s.alive = false;
      s.currentHp = 0;
    }
    expect(soldierAt(team, 1)).toBeUndefined();
    expect(soldierAt(team, 3)?.alive).toBe(true);

    team.pendingBossAttackId = "SpreadingFrost";
    const logs: string[] = [];
    resolveBossPhase(team, () => 0.5, (t) => logs.push(t));
    expect(logs.some((l) => l.includes("No one in seats 1–2"))).toBe(false);
    expect(partyHasFrozen(team)).toBe(true);
    const frozen = livingParty(team).find(isFrozen)!;
    expect(frozen.position).toBe(3);
    expect(logs.some((l) => l.includes("front of the line"))).toBe(true);
  });

  it("NorthWind hits front and applies Chill 4/3/2; SouthWind mirrors back", () => {
    const team = wardenTeam(7);
    team.partyShield = { remaining: 0, active: false };
    team.pendingBossAttackId = "NorthWind";
    resolveBossPhase(team, () => 0.5, () => {});
    const d1 = soldierAt(team, 1)!.statuses.find(
      (st) => st.kind === "Dot" && st.type === "Chill",
    );
    const d2 = soldierAt(team, 2)!.statuses.find(
      (st) => st.kind === "Dot" && st.type === "Chill",
    );
    const d3 = soldierAt(team, 3)!.statuses.find(
      (st) => st.kind === "Dot" && st.type === "Chill",
    );
    expect(d1?.kind === "Dot" && d1.duration).toBe(4);
    expect(d2?.kind === "Dot" && d2.duration).toBe(3);
    expect(d3?.kind === "Dot" && d3.duration).toBe(2);

    team.pendingBossAttackId = "SouthWind";
    resolveBossPhase(team, () => 0.5, () => {});
    const d6 = soldierAt(team, 6)!.statuses.find(
      (st) => st.kind === "Dot" && st.type === "Chill",
    );
    const d5 = soldierAt(team, 5)!.statuses.find(
      (st) => st.kind === "Dot" && st.type === "Chill",
    );
    const d4 = soldierAt(team, 4)!.statuses.find(
      (st) => st.kind === "Dot" && st.type === "Chill",
    );
    expect(d6?.kind === "Dot" && d6.duration).toBe(4);
    expect(d5?.kind === "Dot" && d5.duration).toBe(3);
    expect(d4?.kind === "Dot" && d4.duration).toBe(2);
  });

  it("tickDots header includes Frozen and advances chain", () => {
    const team = wardenTeam();
    applyFrozen(soldierAt(team, 1)!, 1, 0);
    const logs: string[] = [];
    tickDots(team, (t) => logs.push(t));
    expect(logs.some((l) => l.includes("Frozen"))).toBe(true);
    expect(isFrozen(soldierAt(team, 2)!)).toBe(true);
  });

  it("Healer A does not thaw Frozen (heal still blocked)", () => {
    const team = wardenTeam();
    const s = soldierAt(team, 1)!;
    s.currentHp = 10;
    applyFrozen(s, 1, 0);

    let healer = livingParty(team).find((x) => x.archetype === "Healer");
    if (!healer) {
      const h = team.roster.find((x) => x.archetype === "Healer" && x.alive)!;
      const slot = team.activePartyIds[3]!;
      const old = team.roster.find((x) => x.id === slot)!;
      old.position = null;
      h.position = 4;
      team.activePartyIds[3] = h.id;
      healer = h;
    }

    resolveSpecialistAction(
      team,
      healer,
      { token: "A", soldierId: healer.id, effectiveGrade: "A" },
      () => 0.5,
      () => {},
    );
    expect(isFrozen(s)).toBe(true);
    // Hard Frozen blocks heals; Healer no longer cleanses Fire either
    expect(s.currentHp).toBe(10);
  });

  function seatMageMid(team: ReturnType<typeof wardenTeam>) {
    const mage = team.roster.find((x) => x.archetype === "FireMage" && x.alive)!;
    // Ensure mage is in active party
    if (!team.activePartyIds.includes(mage.id)) {
      const drop = team.activePartyIds[2]!;
      const old = team.roster.find((r) => r.id === drop)!;
      old.position = null;
      team.activePartyIds[2] = mage.id;
    }
    const others = livingParty(team).filter((s) => s.id !== mage.id);
    mage.position = 3;
    const seats: Array<1 | 2 | 4 | 5 | 6> = [1, 2, 4, 5, 6];
    others.forEach((s, i) => {
      s.position = seats[i] ?? 6;
    });
    team.activePartyIds = livingParty(team)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((s) => s.id);
    return mage;
  }

  it("FireMage A does not thaw Frozen and cannot cleanse DoTs under ice", () => {
    const team = wardenTeam();
    const mage = seatMageMid(team);
    applyFrozen(soldierAt(team, 1)!, 1, 0);
    applyFrozen(soldierAt(team, 6)!, 6, 0);
    applyDot(soldierAt(team, 1)!, "Chill", 1, 3, true);

    resolveSpecialistAction(
      team,
      mage,
      { token: "A", soldierId: mage.id, effectiveGrade: "A" },
      () => 0.5,
      () => {},
    );
    expect(isFrozen(soldierAt(team, 1)!)).toBe(true);
    expect(isFrozen(soldierAt(team, 6)!)).toBe(true);
    // Chill sealed under ice until A-break
    expect(
      soldierAt(team, 1)!.statuses.some(
        (st) => st.kind === "Dot" && st.type === "Chill",
      ),
    ).toBe(true);
  });

  it("FireMage B cleanses Chill on unfrozen back seats; skips Frozen", () => {
    const team = wardenTeam();
    const mage = seatMageMid(team);
    applyFrozen(soldierAt(team, 5)!, 2, 0);
    applyDot(soldierAt(team, 5)!, "Chill", 1, 3, true);
    applyDot(soldierAt(team, 6)!, "Chill", 1, 2, true); // unfrozen back seat

    resolveSpecialistAction(
      team,
      mage,
      { token: "B", soldierId: mage.id, effectiveGrade: "B" },
      () => 0.5,
      () => {},
    );
    expect(isFrozen(soldierAt(team, 5)!)).toBe(true);
    // Frozen seat keeps Chill
    expect(
      soldierAt(team, 5)!.statuses.some(
        (st) => st.kind === "Dot" && st.type === "Chill",
      ),
    ).toBe(true);
    // Unfrozen pos6 cleansed
    expect(
      soldierAt(team, 6)!.statuses.some(
        (st) => st.kind === "Dot" && st.type === "Chill",
      ),
    ).toBe(false);
  });
});
