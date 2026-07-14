import {
  ARCHETYPE_MAX_HP,
  ROSTER_COUNTS,
  type Soldier,
} from "@dungeon-grades/shared";
import { NAME_POOLS } from "./names.js";

export function createCampaignRoster(): Soldier[] {
  const roster: Soldier[] = [];
  for (const { archetype, count } of ROSTER_COUNTS) {
    const names = NAME_POOLS[archetype];
    for (let i = 0; i < count; i++) {
      const name = names[i] ?? `${archetype} ${i + 1}`;
      const maxHp = ARCHETYPE_MAX_HP[archetype];
      roster.push({
        id: `${archetype.toLowerCase()}_${i + 1}`,
        name,
        archetype,
        maxHp,
        currentHp: maxHp,
        position: null,
        statuses: [],
        alive: true,
        block: 0,
      });
    }
  }
  return roster;
}
