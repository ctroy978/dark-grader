export * from "./types.js";
export * from "./balance.js";
export * from "./magnet.js";
export * from "./grades.js";
export * from "./rng.js";
export * from "./playbook.js";
export * from "./statusUi.js";
export * from "./presentation.js";

export function currentRoomNumber(roomsCleared: number): number {
  return roomsCleared + 1;
}

export function isFinalRoom(roomsCleared: number, campaignLength: number): boolean {
  return roomsCleared + 1 >= campaignLength;
}
