import { describe, expect, it } from "vitest";
import {
  DOT_STATS,
  MAX_PARTY_SLIME_STACKS,
  type Grade,
  type TeamState,
} from "@dungeon-grades/shared";
import {
  createTeam,
  selectParty,
  startFight,
} from "./combat.js";
import { applyDot, tickDots } from "./dots.js";
import { livingParty, soldierAt } from "./damage.js";
import { resolveSpecialistAction } from "./specialists.js";
import { tokenDropCount } from "./tokens.js";
import { openingMinionsForBoss } from "./bosses.js";

const POOL: Grade[] = "AAAABBBBBBCCCCCCDDFF".split("") as Grade[];

function makeGrubTeam(seed = 7): TeamState {
  const team = createTeam("slime-t", "SLM", "Slime", seed);
  selectParty(team, [
    "vanguard_1",
    "shieldmaiden_1",
    "healer_1",
    "firemage_1",
    "archer_1",
    "doomcaller_1",
  ]);
  startFight(team, "moss_grub", POOL);
  team.log = [];
  team.partyShield = { active: false, remaining: 0 };
  for (const s of team.roster) {
    if (team.activePartyIds.includes(s.id)) {
      s.block = 0;
      s.statuses = [];
      s.currentHp = s.maxHp;
    }
  }
  return team;
}

describe("party Slime (Moss Mite)", () => {
  it("moss mites open with Slime on-hit kit", () => {
    const mites = openingMinionsForBoss("moss_grub");
    expect(mites.length).toBeGreaterThan(0);
    expect(mites[0]?.onHitDot).toEqual({ type: "Slime", stacks: 1 });
  });

  it("never expires by duration and deals flat tick damage", () => {
    const team = makeGrubTeam(1);
    const front = soldierAt(team, 1)!;
    const hp0 = front.currentHp;
    applyDot(front, "Slime", 1, undefined, true);

    const slime = front.statuses.find((s) => s.kind === "Dot" && s.type === "Slime");
    expect(slime?.kind).toBe("Dot");
    if (slime?.kind !== "Dot") return;
    expect(slime.escalationStep).toBeUndefined();
    expect(slime.stacks).toBe(1);

    for (let i = 0; i < 6; i++) {
      tickDots(team, () => {});
    }

    const still = front.statuses.find((s) => s.kind === "Dot" && s.type === "Slime");
    expect(still?.kind).toBe("Dot");
    if (still?.kind === "Dot") {
      expect(still.stacks).toBe(1);
      expect(still.escalationStep).toBeUndefined();
    }
    // 6 ticks × 2 base, no ramp
    expect(hp0 - front.currentHp).toBe(DOT_STATS.Slime.tick * 6);
  });

  it("caps stacks at MAX_PARTY_SLIME_STACKS", () => {
    const team = makeGrubTeam(2);
    const front = soldierAt(team, 1)!;
    applyDot(front, "Slime", 1, undefined, true);
    applyDot(front, "Slime", 1, undefined, true);
    applyDot(front, "Slime", 3, undefined, true);
    const slime = front.statuses.find((s) => s.kind === "Dot" && s.type === "Slime");
    expect(slime?.kind).toBe("Dot");
    if (slime?.kind === "Dot") {
      expect(slime.stacks).toBe(MAX_PARTY_SLIME_STACKS);
    }
  });

  it("does not reduce token drop count", () => {
    const team = makeGrubTeam(3);
    const baseline = tokenDropCount(team).count;
    for (const s of livingParty(team)) {
      applyDot(s, "Slime", 1, undefined, true);
    }
    tickDots(team, () => {});
    expect(tokenDropCount(team).count).toBe(baseline);
    expect(team).not.toHaveProperty("slimeSlowNextRound");
  });

  it("Fire Mage A cleanses front Slime; Healer A does not", () => {
    const team = makeGrubTeam(4);
    const front = soldierAt(team, 1)!;
    applyDot(front, "Slime", 1, undefined, true);

    const healer = livingParty(team).find((s) => s.archetype === "Healer")!;
    resolveSpecialistAction(
      team,
      healer,
      { token: "A", soldierId: healer.id, effectiveGrade: "A" },
      () => 0.5,
      () => {},
    );
    expect(
      front.statuses.some((s) => s.kind === "Dot" && s.type === "Slime"),
    ).toBe(true);

    const mage = livingParty(team).find((s) => s.archetype === "FireMage")!;
    // Put mage at front so A cleanse covers seat 1
    mage.position = 2;
    resolveSpecialistAction(
      team,
      mage,
      { token: "A", soldierId: mage.id, effectiveGrade: "A" },
      () => 0.5,
      () => {},
    );
    expect(
      front.statuses.some((s) => s.kind === "Dot" && s.type === "Slime"),
    ).toBe(false);
  });
});
