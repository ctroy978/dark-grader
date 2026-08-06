import { createRng } from "./rng.js";

export const RELIC_CATALOG_VERSION = 1;
export const BULWARK_SIGIL_REDUCTION = 6;
export const EMBER_WHETSTONE_BONUS = 4;
export const PURITY_CHARM_DURATION_REDUCTION = 1;

export const RELIC_IDS = [
  "bulwark_sigil",
  "ember_whetstone",
  "purity_charm",
] as const;

export type RelicId = (typeof RELIC_IDS)[number];

export interface RelicDefinition {
  id: RelicId;
  name: string;
  shortDescription: string;
  description: string;
  assetPath: string;
}

export interface BoundRelic {
  relicId: RelicId;
  acquiredRoomIndex: number;
  usedThisFight: boolean;
}

export interface PendingRoomReward {
  sourceRoomIndex: number;
  sourceBossId: string;
  relicOfferIds: RelicId[];
}

export type RoomRewardChoice =
  | { kind: "relic"; relicId: RelicId; soldierId: string }
  | { kind: "healing_potion"; soldierId: string; amountHealed: number };

export interface RelicDestructionRecord {
  relicId: RelicId;
  soldierId: string;
  roomIndex: number;
  attemptNumber: number;
  round: number;
  /** Internal delivery marker so reconnect-safe presentation emits once. */
  presented?: boolean;
}

export interface RoomItemRecord {
  roomIndex: number;
  bossId: string;
  relicOfferIds: RelicId[];
  choice: RoomRewardChoice | null;
  destroyedRelics: RelicDestructionRecord[];
}

export interface TeamItemState {
  version: 1;
  catalogVersion: number;
  pendingReward: PendingRoomReward | null;
  rooms: RoomItemRecord[];
}

export const RELIC_DEFINITIONS: Record<RelicId, RelicDefinition> = {
  bulwark_sigil: {
    id: "bulwark_sigil",
    name: "Bulwark Sigil",
    shortDescription: `First direct boss hit each fight deals ${BULWARK_SIGIL_REDUCTION} less damage.`,
    description:
      `Reduces the bearer's first direct boss hit each fight by ${BULWARK_SIGIL_REDUCTION} before cover or block.`,
    assetPath: "/art/relics/bulwark_sigil.png",
  },
  ember_whetstone: {
    id: "ember_whetstone",
    name: "Ember Whetstone",
    shortDescription: `First damaging action each fight adds ${EMBER_WHETSTONE_BONUS} damage.`,
    description:
      `Adds ${EMBER_WHETSTONE_BONUS} damage to the first enemy hit by the bearer's first damaging action each fight.`,
    assetPath: "/art/relics/ember_whetstone.png",
  },
  purity_charm: {
    id: "purity_charm",
    name: "Purity Charm",
    shortDescription: "First timed damaging status each fight loses one tick.",
    description:
      "Shortens the first newly applied finite damaging status on the bearer each fight by one tick.",
    assetPath: "/art/relics/purity_charm.png",
  },
};

export const HEALING_POTION_DEFINITION = {
  id: "healing_potion" as const,
  name: "Healing Potion",
  shortDescription: "Restore one living soldier to maximum HP now.",
  description:
    "Immediately restores one living soldier to maximum HP. Consumed on use and does not occupy a relic slot.",
  assetPath: "/art/relics/healing_potion.png",
};

export function isRelicId(value: unknown): value is RelicId {
  return typeof value === "string" && (RELIC_IDS as readonly string[]).includes(value);
}

export function createEmptyItemState(): TeamItemState {
  return {
    version: 1,
    catalogVersion: RELIC_CATALOG_VERSION,
    pendingReward: null,
    rooms: [],
  };
}

/** Stable 32-bit FNV-1a hash for offer seeds persisted across processes. */
export function stableRelicSeed(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Three classroom-wide offers, sampled without replacement. */
export function relicOffersForRoom(
  classroomId: string,
  roomIndex: number,
  bossId: string,
  catalogVersion = RELIC_CATALOG_VERSION,
  catalog: readonly RelicId[] = RELIC_IDS,
): RelicId[] {
  if (catalog.length < 3) {
    throw new Error("Relic catalog must contain at least three relics");
  }
  const unique = [...new Set(catalog)];
  if (unique.length < 3) {
    throw new Error("Relic catalog must contain at least three distinct relics");
  }
  const seed = stableRelicSeed(
    `${catalogVersion}|${classroomId}|${roomIndex}|${bossId}`,
  );
  const random = createRng(seed);
  const remaining = [...unique];
  const offers: RelicId[] = [];
  while (offers.length < 3) {
    const index = Math.floor(random() * remaining.length);
    offers.push(remaining.splice(index, 1)[0]!);
  }
  return offers;
}

export function relicBindingEligible(soldier: {
  alive: boolean;
  relic?: BoundRelic | null;
}): boolean {
  return soldier.alive && !soldier.relic;
}
