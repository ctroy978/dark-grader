import { describe, expect, it } from "vitest";
import { INTER_ROOM_CAMP_HEAL_MISSING_PCT } from "@dungeon-grades/shared";
import { createTeam, enterBetweenRooms, startFight } from "./combat.js";
import {
  chooseHealingPotionReward,
  chooseRelicReward,
} from "./rewards.js";

function wonTeam(id = "reward-team") {
  const team = createTeam(id, "RWD01", "Rewards", 10, "classroom-one");
  team.phase = "victory";
  team.boss = {
    id: "moss_grub",
    name: "Moss Grub",
    maxHp: 130,
    currentHp: 0,
    traits: [],
    attackIds: [],
    sequenceIndex: -1,
    statuses: [],
    curseDamageTakenMult: 1,
    curseRoundsLeft: 0,
    outgoingDamageMult: 1,
    outgoingBuffRoundsLeft: 0,
    stunRoundsLeft: 0,
    nextAttackBonus: 0,
  };
  return team;
}

describe("room rewards", () => {
  it("creates one persisted reward after camp recovery", () => {
    const team = wonTeam();
    const target = team.roster[0]!;
    target.currentHp = 10;
    const expectedAfterCamp =
      10 + Math.floor((target.maxHp - 10) * INTER_ROOM_CAMP_HEAL_MISSING_PCT);

    enterBetweenRooms(team, 6);
    expect(team.phase).toBe("reward");
    expect(team.roomIndex).toBe(1);
    expect(target.currentHp).toBe(expectedAfterCamp);
    expect(team.items.pendingReward).toMatchObject({
      sourceRoomIndex: 0,
      sourceBossId: "moss_grub",
    });
    expect(team.items.pendingReward?.relicOfferIds).toHaveLength(3);

    const offers = [...team.items.pendingReward!.relicOfferIds];
    enterBetweenRooms(team, 6);
    expect(team.roomIndex).toBe(1);
    expect(team.items.pendingReward?.relicOfferIds).toEqual(offers);
  });

  it("binds one offered relic to one living empty bearer", () => {
    const team = wonTeam();
    enterBetweenRooms(team, 6);
    const relicId = team.items.pendingReward!.relicOfferIds[0]!;
    const bearer = team.roster[0]!;

    expect(chooseRelicReward(team, relicId, bearer.id)).toBe(true);
    expect(team.phase).toBe("between_rooms");
    expect(team.items.pendingReward).toBeNull();
    expect(bearer.relic).toMatchObject({ relicId, acquiredRoomIndex: 0 });
    expect(team.items.rooms[0]?.choice).toEqual({
      kind: "relic",
      relicId,
      soldierId: bearer.id,
    });
    expect(chooseRelicReward(team, relicId, bearer.id)).toBe(false);
  });

  it("rejects an unoffered relic and an occupied bearer", () => {
    const team = wonTeam();
    enterBetweenRooms(team, 6);
    const bearer = team.roster[0]!;
    bearer.relic = {
      relicId: "bulwark_sigil",
      acquiredRoomIndex: 0,
      usedThisFight: false,
    };
    expect(() =>
      chooseRelicReward(team, team.items.pendingReward!.relicOfferIds[0]!, bearer.id),
    ).toThrow(/already carries/i);
  });

  it("uses the potion after camp recovery and records exact healing", () => {
    const team = wonTeam();
    const target = team.roster[0]!;
    target.currentHp = 1;
    enterBetweenRooms(team, 6);
    const afterCamp = target.currentHp;

    expect(chooseHealingPotionReward(team, target.id)).toBe(true);
    expect(target.currentHp).toBe(target.maxHp);
    expect(team.phase).toBe("between_rooms");
    expect(team.items.rooms[0]?.choice).toEqual({
      kind: "healing_potion",
      soldierId: target.id,
      amountHealed: target.maxHp - afterCamp,
    });
    expect(chooseHealingPotionReward(team, target.id)).toBe(false);
  });

  it("allows a zero-healing potion choice at full HP", () => {
    const team = wonTeam();
    const target = team.roster[0]!;
    enterBetweenRooms(team, 6);
    chooseHealingPotionReward(team, target.id);
    expect(team.items.rooms[0]?.choice).toMatchObject({
      kind: "healing_potion",
      amountHealed: 0,
    });
  });

  it("keeps the potion available when every living soldier has a relic", () => {
    const team = wonTeam();
    for (const soldier of team.roster.filter((candidate) => candidate.alive)) {
      soldier.relic = {
        relicId: "bulwark_sigil",
        acquiredRoomIndex: 0,
        usedThisFight: false,
      };
    }
    enterBetweenRooms(team, 6);
    expect(() =>
      chooseRelicReward(
        team,
        team.items.pendingReward!.relicOfferIds[0]!,
        team.roster[0]!.id,
      ),
    ).toThrow(/already carries/i);
    expect(chooseHealingPotionReward(team, team.roster[0]!.id)).toBe(true);
    expect(team.phase).toBe("between_rooms");
  });

  it("blocks fight start until the pending reward resolves", () => {
    const team = wonTeam();
    enterBetweenRooms(team, 6);
    expect(() => startFight(team, "ash_wraith", ["A", "B", "C"])).toThrow(
      /lobby or camp/i,
    );
  });

  it("does not create a reward after the final room", () => {
    const team = wonTeam();
    team.roomIndex = 5;
    enterBetweenRooms(team, 6);
    expect(team.phase).toBe("campaign_complete");
    expect(team.items.pendingReward).toBeNull();
  });
});
