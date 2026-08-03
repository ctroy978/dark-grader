import { describe, expect, it } from "vitest";
import { MULTI_MINION_FOCUS_MULT, type Grade } from "@dungeon-grades/shared";
import { createTeam, selectParty, startFight } from "./combat.js";
import { livingParty, soldierAt } from "./damage.js";
import { magnetHardTarget, resolveBossPhase } from "./bosses.js";

const POOL: Grade[] = "AAAABBBBBBCCCCCCDDFF".split("") as Grade[];

describe("minion magnet hard focus", () => {
  it("magnetHardTarget always returns the living magnet seat", () => {
    const team = createTeam("mf", "MF1", "MinionFocus", 5);
    selectParty(
      team,
      team.roster.filter((s) => s.alive).slice(0, 6).map((s) => s.id),
    );
    startFight(team, "moss_grub", POOL);
    team.magnetPosition = 4;
    const t = magnetHardTarget(team);
    expect(t?.position).toBe(4);
  });

  it("all minions hit the magnet; 2nd shot is harder", () => {
    const team = createTeam("mf2", "MF2", "MinionFocus2", 6);
    selectParty(
      team,
      team.roster.filter((s) => s.alive).slice(0, 6).map((s) => s.id),
    );
    startFight(team, "cinder_herald", POOL);
    team.partyShield = { remaining: 0, active: false, coveredIds: [] };
    for (const s of livingParty(team)) {
      s.block = 0;
      s.statuses = [];
      s.currentHp = s.maxHp;
    }
    team.magnetPosition = 3;
    const target = soldierAt(team, 3)!;
    const others = livingParty(team).filter((s) => s.position !== 3);
    const otherHp = others.map((s) => s.currentHp);

    team.minions = [
      {
        id: "m1",
        name: "Imp A",
        maxHp: 10,
        currentHp: 10,
        damage: 4,
      },
      {
        id: "m2",
        name: "Imp B",
        maxHp: 10,
        currentHp: 10,
        damage: 4,
      },
    ];
    team.boss!.stunRoundsLeft = 0;
    // Skip boss attack damage by using a stun skip? Use LineAttack with shield
    // Easier: force boss to be stunned so only minions would fire — but stun skips minions too.
    // Call perform path via resolveBossPhase with LineAttack — line hits everyone.
    // Instead unit-test volley by running a custom approach: set boss stun and...
    // Minions only fire after a *real* boss attack. So LineAttack then minions.
    const hp0 = target.currentHp;
    team.pendingBossAttackId = "LineAttack";
    const logs: string[] = [];
    resolveBossPhase(team, () => 0.5, (t) => logs.push(t));

    // Target took line damage + two minion shots (second ×1.5)
    // Line attack base 7 for non-warden
    const line = 7;
    const m1 = 4;
    const m2 = Math.floor(4 * MULTI_MINION_FOCUS_MULT);
    expect(hp0 - target.currentHp).toBe(line + m1 + m2);

    for (let i = 0; i < others.length; i++) {
      // Others only take line damage
      expect(otherHp[i]! - others[i]!.currentHp).toBe(line);
    }
    expect(logs.some((l) => /focus fire|heavy fire/i.test(l))).toBe(true);
  });
});
