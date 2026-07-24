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
    expect(w!.maxHp).toBe(270);
    expect(w!.traits).toContain("Frost");
    expect(w!.attackIds).toEqual(
      expect.arrayContaining([
        "FrontSlam",
        "LineAttack",
        "SpreadingFrost",
        "Regenerate",
      ]),
    );
    expect(w!.attackIds).not.toContain("PoisonCloud");
    const frost = w!.attacks.find((a) => a.id === "SpreadingFrost");
    expect(frost?.weight).toBe(4);
  });

  it("applies Frozen and blocks heal + attack", () => {
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
      { token: "A", soldierId: s.id, effectiveGrade: "A" },
      () => 0.5,
      () => {},
    );
    expect(result.acted).toBe(false);
    expect(result.skipReason).toBe("frozen");
    expect(isFrozen(s)).toBe(true);
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

  it("Ice cleanse and Doomcaller strip do not remove Frozen", () => {
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

  it("SpreadingFrost always damages the line and may freeze pos 1 or 2", () => {
    const team = wardenTeam(3);
    team.partyShield = { remaining: 0, active: false };
    const hpBefore = Object.fromEntries(
      livingParty(team).map((s) => [s.id, s.currentHp]),
    );
    team.pendingBossAttackId = "SpreadingFrost";
    const logs: string[] = [];
    // random 0: freeze roll succeeds (< 0.65), seat pick = first of [1,2] = 1
    resolveBossPhase(team, () => 0, (t) => logs.push(t));
    expect(logs.some((l) => l.includes("Spreading Frost"))).toBe(true);
    for (const s of livingParty(team)) {
      expect(hpBefore[s.id]! - s.currentHp).toBeGreaterThan(0);
    }
    expect(partyHasFrozen(team)).toBe(true);
    const frozen = livingParty(team).find(isFrozen)!;
    expect(frozen.position === 1 || frozen.position === 2).toBe(true);
  });

  it("SpreadingFrost can miss the freeze while still dealing line damage", () => {
    const team = wardenTeam(5);
    team.partyShield = { remaining: 0, active: false };
    const hpBefore = Object.fromEntries(
      livingParty(team).map((s) => [s.id, s.currentHp]),
    );
    team.pendingBossAttackId = "SpreadingFrost";
    const logs: string[] = [];
    // Freeze check uses random() >= 0.65 to miss — return 0.9 after voice rolls
    let i = 0;
    resolveBossPhase(
      team,
      () => {
        // First rolls may be voice; keep returning high until freeze roll
        i += 1;
        return 0.9;
      },
      (t) => logs.push(t),
    );
    expect(logs.some((l) => l.includes("Spreading Frost"))).toBe(true);
    expect(logs.some((l) => l.includes("fails to lock"))).toBe(true);
    expect(partyHasFrozen(team)).toBe(false);
    for (const s of livingParty(team)) {
      expect(hpBefore[s.id]! - s.currentHp).toBeGreaterThan(0);
    }
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

  it("FireMage A burns Frozen on front only", () => {
    const team = wardenTeam();
    const mage = seatMageMid(team);
    applyFrozen(soldierAt(team, 1)!, 1, 0);
    applyFrozen(soldierAt(team, 6)!, 6, 0);
    expect(isFrozen(mage)).toBe(false);

    resolveSpecialistAction(
      team,
      mage,
      { token: "A", soldierId: mage.id, effectiveGrade: "A" },
      () => 0.5,
      () => {},
    );
    expect(isFrozen(soldierAt(team, 1)!)).toBe(false);
    expect(isFrozen(soldierAt(team, 6)!)).toBe(true);
  });

  it("FireMage B burns Frozen on back only", () => {
    const team = wardenTeam();
    const mage = seatMageMid(team);
    applyFrozen(soldierAt(team, 2)!, 2, 0);
    applyFrozen(soldierAt(team, 5)!, 5, 0);

    resolveSpecialistAction(
      team,
      mage,
      { token: "B", soldierId: mage.id, effectiveGrade: "B" },
      () => 0.5,
      () => {},
    );
    expect(isFrozen(soldierAt(team, 2)!)).toBe(true);
    expect(isFrozen(soldierAt(team, 5)!)).toBe(false);
  });
});
