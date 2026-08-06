import {
  MAX_LOG_ENTRIES,
  RELIC_CATALOG_VERSION,
  RELIC_DEFINITIONS,
  relicBindingEligible,
  relicOffersForRoom,
  type RelicDestructionRecord,
  type RelicId,
  type RoomItemRecord,
  type Soldier,
  type TeamState,
} from "@dungeon-grades/shared";
import { pushCue } from "./presentation.js";

function pushRewardLog(team: TeamState, text: string, tags = ["system", "reward"]): void {
  team.log.push({ round: team.round, text, tags });
  if (team.log.length > MAX_LOG_ENTRIES) {
    team.log = team.log.slice(-MAX_LOG_ENTRIES);
  }
}

export function ensureRoomItemRecord(
  team: TeamState,
  roomIndex: number,
  bossId: string,
): RoomItemRecord {
  let room = team.items.rooms.find((candidate) => candidate.roomIndex === roomIndex);
  if (!room) {
    room = {
      roomIndex,
      bossId,
      relicOfferIds: [],
      choice: null,
      destroyedRelics: [],
    };
    team.items.rooms.push(room);
  } else if (!room.bossId) {
    room.bossId = bossId;
  }
  return room;
}

export function preparePendingRoomReward(
  team: TeamState,
  sourceRoomIndex: number,
  sourceBossId: string,
): void {
  if (team.items.pendingReward) return;
  const catalogVersion = team.items.catalogVersion || RELIC_CATALOG_VERSION;
  const relicOfferIds = relicOffersForRoom(
    team.classroomId,
    sourceRoomIndex,
    sourceBossId,
    catalogVersion,
  );
  const room = ensureRoomItemRecord(team, sourceRoomIndex, sourceBossId);
  room.relicOfferIds = [...relicOfferIds];
  team.items.pendingReward = {
    sourceRoomIndex,
    sourceBossId,
    relicOfferIds: [...relicOfferIds],
  };
}

function pendingRewardForChoice(team: TeamState) {
  if (team.phase !== "reward") {
    if (!team.items.pendingReward) return null;
    throw new Error("Reward can only be chosen during the reward phase");
  }
  const pending = team.items.pendingReward;
  if (!pending) throw new Error("No pending reward");
  return pending;
}

function completeReward(team: TeamState): void {
  team.items.pendingReward = null;
  team.phase = "between_rooms";
}

/** Returns false only for an idempotent duplicate after the reward already resolved. */
export function chooseRelicReward(
  team: TeamState,
  relicId: RelicId,
  soldierId: string,
): boolean {
  const pending = pendingRewardForChoice(team);
  if (!pending) return false;
  if (!pending.relicOfferIds.includes(relicId)) {
    throw new Error("That relic was not offered for this room");
  }
  const soldier = team.roster.find((candidate) => candidate.id === soldierId);
  if (!soldier) throw new Error("Soldier not found");
  if (!relicBindingEligible(soldier)) {
    throw new Error(
      soldier.alive
        ? `${soldier.name} already carries a relic`
        : "Relics can only be bound to a living soldier",
    );
  }
  const room = ensureRoomItemRecord(
    team,
    pending.sourceRoomIndex,
    pending.sourceBossId,
  );
  if (room.choice) return false;
  soldier.relic = {
    relicId,
    acquiredRoomIndex: pending.sourceRoomIndex,
    usedThisFight: false,
  };
  room.choice = { kind: "relic", relicId, soldierId };
  pushRewardLog(
    team,
    `${RELIC_DEFINITIONS[relicId].name} bound to ${soldier.name}.`,
  );
  completeReward(team);
  return true;
}

/** Returns false only for an idempotent duplicate after the reward already resolved. */
export function chooseHealingPotionReward(
  team: TeamState,
  soldierId: string,
): boolean {
  const pending = pendingRewardForChoice(team);
  if (!pending) return false;
  const soldier = team.roster.find((candidate) => candidate.id === soldierId);
  if (!soldier) throw new Error("Soldier not found");
  if (!soldier.alive) throw new Error("The Healing Potion cannot revive the fallen");
  const room = ensureRoomItemRecord(
    team,
    pending.sourceRoomIndex,
    pending.sourceBossId,
  );
  if (room.choice) return false;
  const amountHealed = Math.max(0, soldier.maxHp - soldier.currentHp);
  soldier.currentHp = soldier.maxHp;
  room.choice = { kind: "healing_potion", soldierId, amountHealed };
  pushRewardLog(
    team,
    amountHealed > 0
      ? `${soldier.name} drinks the Healing Potion and recovers ${amountHealed} HP.`
      : `${soldier.name} drinks the Healing Potion at full health.`,
  );
  completeReward(team);
  return true;
}

function activeAttemptNumber(team: TeamState, roomIndex: number): number {
  const room = team.scoring.rooms.find((candidate) => candidate.roomIndex === roomIndex);
  if (!room?.attempts.length) return 1;
  return room.attempts[room.attempts.length - 1]?.attemptNumber ?? 1;
}

export function recordRelicDestruction(
  team: TeamState,
  soldier: Soldier,
  roomIndex = team.roomIndex,
): RelicDestructionRecord | null {
  const relic = soldier.relic;
  if (!relic) return null;
  const bossId = team.boss?.id ?? `room_${roomIndex + 1}`;
  const record: RelicDestructionRecord = {
    relicId: relic.relicId,
    soldierId: soldier.id,
    roomIndex,
    attemptNumber: activeAttemptNumber(team, roomIndex),
    round: team.round,
  };
  ensureRoomItemRecord(team, roomIndex, bossId).destroyedRelics.push(record);
  soldier.relic = null;
  pushRewardLog(
    team,
    `${soldier.name}'s ${RELIC_DEFINITIONS[record.relicId].name} shatters as they fall!`,
    ["relic", "relic-destroyed", "death"],
  );
  return record;
}

/** Emit destruction beats after the action/impact that caused them. */
export function flushRelicDestructionCues(team: TeamState): void {
  const pending = team.items.rooms
    .flatMap((room) => room.destroyedRelics)
    .filter((record) => !record.presented);
  for (const record of pending) {
    record.presented = true;
    const soldier = team.roster.find((candidate) => candidate.id === record.soldierId);
    pushCue(team, {
      kind: "system",
      focusIds: [record.soldierId],
      bubble: {
        speakerId: record.soldierId,
        speakerName: soldier?.name ?? "Soldier",
        side: "party",
        text: `${RELIC_DEFINITIONS[record.relicId].name} shattered!`,
      },
      fx: ["relic-break", "hurt-flash"],
      sfxId: "fizzle",
      durationMs: 850,
    });
  }
}
