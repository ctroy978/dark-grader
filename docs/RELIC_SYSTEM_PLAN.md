# Relic Reward System Plan

**Status:** Initial vertical slice implemented; awaiting relic art and classroom tuning  
**Created:** 2026-08-06  
**Branch:** `relic-system`  
**Scope:** Post-victory relic offers, one-time lobby healing potion, binding,
combat effects, destruction, persistence, and presentation

This document is the source of truth for the first relic-system implementation.
It follows the Academic Honors scoring work and refines the broader direction in
[`GAMEPLAY_EXPANSION_PLAN.md`](./GAMEPLAY_EXPANSION_PLAN.md).

## 1. System summary

After every non-final boss victory, the team receives four reward choices:

1. Three relics selected deterministically for that classroom and room.
2. One Healing Potion.

The team chooses exactly one option.

- A relic is permanently bound to one living soldier who does not already carry
  a relic.
- The Healing Potion immediately restores one living soldier to maximum HP in
  the lobby and is then consumed. It never occupies a relic slot.
- The potion is always offered, even when relic binding is still possible.
- The final boss does not offer a combat reward because there is no later fight
  in which to use it. A final trophy or epilogue collectible remains deferred.

The reward system must not add a new combat button. Relics are passive, and the
Healing Potion is resolved before the next party is formed.

## 2. Locked rules

### 2.1 Relic ownership

- Each soldier can carry at most one relic.
- Relic binding is permanent; relics cannot be transferred or removed in camp.
- A relic is active only while its bearer is deployed and alive.
- Different soldiers may carry relics of the same type.
- Classroom offers are not filtered against an individual team's inventory.
  This preserves identical offers for every team in that classroom.
- If no living soldier has an empty relic slot, all three relic choices are
  disabled and the Healing Potion remains available.

### 2.2 Relic destruction

- A relic is destroyed immediately the first time its bearer reaches 0 HP.
- Destruction occurs at lethal-damage resolution, before any later
  Thundercaller revival can occur.
- Last Stand preventing lethal damage does not destroy the relic.
- Reviving the bearer does not restore the destroyed relic.
- Destruction receives a combat log entry and a clear presentation cue.
- The destroyed relic, bearer, room, attempt, and round are recorded for the
  teacher's room history.

### 2.3 Healing Potion

- The potion is the fourth reward choice after every non-final victory.
- It targets exactly one living soldier in the reward lobby.
- It restores that soldier directly to `maxHp` after ordinary camp recovery has
  been applied.
- It cannot revive a dead soldier or reverse a permanent-loss scoring result.
- It is consumed immediately and cannot be saved for a later room.
- Choosing it means the team receives no relic from that room.
- A full-HP soldier remains a legal target. The UI must warn that the potion
  will provide `0 HP` of healing, but allowing the choice guarantees that a
  reward can never block campaign progression.

## 3. Reward lifecycle

The current victory presentation and Academic Honors calculation remain in
place. Rewards begin only after the students press Continue.

### 3.1 Non-final victory

1. Combat establishes victory and finalizes scoring as it does now.
2. Students finish playback and review their Honors upgrades.
3. Students press **Continue to rewards**.
4. The server captures the defeated room and boss, applies the existing camp
   recovery of 30% of each living soldier's missing HP, and clears fight-only
   state.
5. The server advances `roomIndex`, creates and persists a pending reward, and
   sets the team phase to `reward`.
6. A dedicated reward screen displays the three relics and Healing Potion.
7. The team selects an option and a valid target, then confirms.
8. The server atomically applies and records the choice, clears the pending
   reward, and moves the team to `between_rooms` for ordinary party formation.

Students therefore see post-rest HP before deciding whether immediate full
recovery is worth giving up a permanent relic.

### 3.2 Final victory

The existing final flow remains direct:

1. Finalize combat and Academic Honors.
2. Students press **Complete campaign**.
3. Apply existing end-of-room cleanup and enter `campaign_complete`.
4. Do not create a pending reward.

### 3.3 Reconnects and duplicate requests

- The pending reward is persisted before the reward screen is shown.
- A reconnect while `phase === "reward"` returns to the same offers.
- Offer generation never rerolls on refresh or process restart.
- Reward resolution is idempotent. A repeated submission after a successful
  choice returns the current team without granting or healing again.
- Party selection and fight start are rejected while a reward is pending.

## 4. Deterministic offers

Every team in the same classroom must receive the same three relics for the same
room, regardless of when the room is cleared.

Use a stable seed derived from:

```text
relic catalog version + classroom id + defeated room index + defeated boss id
```

Requirements:

- Use a checked-in stable string hash and the shared seeded RNG; do not depend on
  JavaScript's process state or `Math.random()`.
- Sample three distinct relic ids without replacement.
- Persist the resulting offer ids. The seed is for reproducibility, while the
  stored offers remain authoritative for old saves if the catalog later grows.
- Include a catalog version in the seed so future catalog changes can be
  intentional rather than silently changing an existing offer schedule.
- Custom campaigns and repeated bosses remain distinct because room index is
  part of the seed.

The first vertical slice may contain exactly three relics, making the initial
offer set fixed. The deterministic selection contract should still be built now
so adding a larger or boss-themed catalog requires content changes rather than a
reward-flow rewrite.

## 5. Proposed first relic set

These three passive relics exercise offense, direct defense, and status defense
without creating new combat decisions.

| Relic | Initial effect | Exact trigger |
|---|---|---|
| **Bulwark Sigil** | Reduce damage by 6 | The first direct boss hit against the bearer each fight. It does not trigger on minions, DoTs, reflect, friendly fire, or Bone Memory detonation. The incoming hit is reduced before party cover and personal block. |
| **Ember Whetstone** | Add 4 damage | The first damaging action by the bearer each fight adds +4 to its first enemy hit. It applies to either a minion or boss, only once for chain/AoE actions, and is not consumed by a miss, immunity, or a fully warded hit. |
| **Purity Charm** | Remove one tick | The first newly applied finite-duration damaging DoT on the bearer each fight has its duration reduced by one. A one-tick DoT is prevented. Reapplications do not consume it, and permanent Slime does not qualify. |

All three reset their once-per-fight usage at `startFight`. Their initial numbers
are tuning values, not part of the durable save contract.

## 6. Persistent data model

Keep Academic Honors scoring independent. Relic/reward history belongs in its
own versioned state rather than being added to scoring calculations.

Suggested shared types:

```ts
type RelicId =
  | "bulwark_sigil"
  | "ember_whetstone"
  | "purity_charm";

interface BoundRelic {
  relicId: RelicId;
  acquiredRoomIndex: number;
  usedThisFight: boolean;
}

interface PendingRoomReward {
  sourceRoomIndex: number;
  sourceBossId: string;
  relicOfferIds: RelicId[];
}

type RoomRewardChoice =
  | {
      kind: "relic";
      relicId: RelicId;
      soldierId: string;
    }
  | {
      kind: "healing_potion";
      soldierId: string;
      amountHealed: number;
    };

interface RelicDestructionRecord {
  relicId: RelicId;
  soldierId: string;
  roomIndex: number;
  attemptNumber: number;
  round: number;
}

interface RoomItemRecord {
  roomIndex: number;
  bossId: string;
  relicOfferIds: RelicId[];
  choice: RoomRewardChoice | null;
  destroyedRelics: RelicDestructionRecord[];
}

interface TeamItemState {
  version: 1;
  catalogVersion: 1;
  pendingReward: PendingRoomReward | null;
  rooms: RoomItemRecord[];
}
```

Add `relic: BoundRelic | null` to `Soldier`. Runtime effect state lives on the
bound relic so server persistence and reconnects preserve exactly what has been
consumed during an active fight.

Old saves receive `relic: null` on every soldier and an empty version-1 item
state. Existing campaign progress must not invent past offers or relics.

Teacher reset clears all item state because it creates a new campaign roster.

## 7. Shared module and engine responsibilities

### 7.1 Shared relic module

Add `packages/shared/src/relics.ts` containing:

- Relic ids and presentation definitions.
- Names, descriptions, numeric tuning values, and asset paths.
- `createEmptyItemState()` and migration-safe helpers.
- Stable offer generation from catalog version/classroom/room/boss.
- Pure target eligibility and reward-validation helpers where practical.

React must display shared definitions rather than duplicating effect text.

### 7.2 Reward engine

Add a focused server module such as `server/src/engine/rewards.ts` for:

- Creating the pending non-final reward.
- Ensuring the current room item-history record exists.
- Validating offered relic ids and eligible bearers.
- Binding a relic.
- Applying the Healing Potion.
- Recording the immutable choice.
- Recording relic destruction.
- Completing the transition from `reward` to `between_rooms`.

The existing `enterBetweenRooms` transition should be split or renamed so final
campaign completion and non-final reward preparation are explicit and remain
idempotent.

### 7.3 Combat hooks

Relic checks remain server-authoritative:

- Extend party-damage context so direct boss damage is distinguishable from
  minion, DoT, reflect, friendly-fire, and memory damage. Bulwark is applied in
  the common damage path before absorb layers.
- Extend `hitEnemies` with a first-actual-hit relic bonus so Ember works
  consistently for every attacking archetype without duplicating logic in
  specialist handlers.
- Apply Purity in the common party `applyDot` path before the first qualifying
  status is created.
- Centralize lethal handling so every damage source destroys a bound relic
  immediately and emits one destruction event. Audit every current
  `applyPartyDamage` call site rather than relying only on end-of-phase
  `processDeaths`.
- Reset `usedThisFight` for deployed relic bearers when a fight starts.

Combat presentation snapshots must include the post-effect HP/status state, as
they do for existing shields, healing, and DoTs.

## 8. API and server validation

Add server-authoritative endpoints such as:

```text
POST /api/team/:id/reward/relic
  { relicId, soldierId }

POST /api/team/:id/reward/healing-potion
  { soldierId }
```

Relic selection validates:

- Team is in `reward` phase with a pending reward.
- `relicId` is one of the persisted three offers.
- Target exists, is living, and has no relic.

Potion selection validates:

- Team is in `reward` phase with a pending reward.
- Target exists and is living.
- Full HP is allowed and records `amountHealed: 0`.

On success, mutate, persist, broadcast through Socket.IO, and return the enriched
team. Never trust client-provided effect values, healing amounts, offer lists, or
room indexes.

Teacher overview should expose room offer, choice, bearer/potion target,
effective potion healing, and destruction events.

## 9. Student presentation

### 9.1 Reward screen

Add a dedicated `RewardScreen` routed by `phase === "reward"`.

- Header: defeated boss and room.
- Four large choice cards: three relics and Healing Potion.
- Relic cards show icon, name, plain-language passive, and eligible-bearer count.
- Potion card shows every living soldier's post-rest HP and potential healing.
- Selecting a relic opens the living, unbound bearer list.
- Selecting the potion opens the living target list.
- Confirmation states clearly that the choice replaces all other rewards and
  cannot be changed.
- Disable only invalid relic targets; the potion always has a valid living
  target after a victory.

### 9.2 Lobby and combat

- Show a compact relic icon on roster cards, formation slots, character intel,
  and deployed combat portraits.
- Hover/tap reveals the relic name and effect.
- A destroyed relic gets a clear break cue before disappearing.
- The next lobby state must make the empty slot visible on a revived bearer.

### 9.3 Asset contract

Use drop-in PNGs with readable CSS fallbacks:

```text
client/public/art/relics/
  bulwark_sigil.png
  ember_whetstone.png
  purity_charm.png
  healing_potion.png
```

Add an asset README with preferred canvas size and transparent-background rules.
Missing art must not block selection or combat readability.

## 10. Test plan

### 10.1 Shared tests

- Stable offers for identical classroom/room/boss inputs.
- Different room or classroom produces a deterministic schedule.
- Three distinct offers when the catalog contains at least three relics.
- Relic definitions and asset paths are complete.
- Eligibility rejects dead or already-equipped soldiers.

### 10.2 Reward lifecycle tests

- Non-final Continue applies camp healing, advances the room once, and enters
  `reward` with persisted offers.
- Final Continue enters `campaign_complete` with no pending reward.
- Refresh/reload preserves offers.
- Double Continue does not reroll or advance twice.
- Binding accepts only an offered relic and eligible bearer.
- Binding one relic prevents that soldier from receiving another.
- Same relic type may be bound to two different soldiers from different rooms.
- If every living soldier has a relic, only the potion path can complete.
- Potion heals one living target to max and records the exact amount.
- Potion at full HP records zero and still completes the reward.
- Potion rejects dead or unknown targets.
- Duplicate reward submissions do not bind or heal twice.
- Fight start and party selection are blocked until reward resolution.
- Old-save migration adds empty relic/item state without changing progress.
- Teacher reset removes relics and history.

### 10.3 Combat tests

- Bulwark reduces only the first direct boss hit, before shield/block.
- Bulwark ignores DoT, minion, reflect, friendly-fire, and memory damage.
- Ember buffs only the first actual damaging hit and only one target of a
  multi-target action.
- Purity shortens the first qualifying timed DoT, can prevent a one-tick DoT,
  and ignores Slime/reapplications.
- Per-fight uses reset on the next fight but survive an in-fight reconnect.
- Last Stand avoids relic destruction.
- Every lethal damage source destroys the relic once.
- A same-phase or later Thundercaller revival does not restore it.
- Destruction history and presentation cue are emitted once.

### 10.4 UI and regression validation

- Reward screen works at Chromebook viewport sizes.
- Missing relic art uses readable fallbacks.
- Relic/potion target eligibility matches server validation.
- Socket refresh cannot change offers or duplicate a choice.
- Full shared/server test suite and production build pass.
- Campaign simulations produce identical pre-reward combat for room 1 and model
  chosen relic effects in later rooms.

## 11. Delivery slices

### Slice 1 — Shared model and deterministic offers

- Add shared relic definitions, item-state types, stable offer generator, and
  pure tests.
- Add migration defaults and asset contract.

### Slice 2 — Reward lifecycle and persistence

- Add the `reward` phase and split the post-victory transition.
- Create/persist pending offers.
- Add binding/potion engine operations, API routes, idempotence, and lifecycle
  tests.

### Slice 3 — Reward and ownership UI

- Add the four-choice reward screen.
- Add target selection and confirmation.
- Add relic presentation to lobby, combat, and teacher overview.

### Slice 4 — Passive combat effects and destruction

- Implement Bulwark, Ember, and Purity common hooks.
- Centralize lethal relic destruction and add presentation cues.
- Add focused engine tests for all damage/status paths.

### Slice 5 — Validation and tuning

- Update campaign simulations with deterministic reward choices.
- Compare no-relic and relic-enabled campaign results across Strong, Typical,
  and Weak pools.
- Keep each relic near the intended 5–10% bearer-level improvement; do not use
  relics as an implicit fix for the existing weak-grade campaign cliff.
- Run `npm test` and `npm run build`, then update README/HANDOFF.

## 12. Explicitly deferred

- Relic transfer, selling, replacement, or inventory storage.
- Consumables carried into combat.
- More than one relic slot per soldier.
- Active relic buttons or player-triggered combat powers.
- Final-boss combat relic reward.
- Final trophy/epilogue collectible.
- Teacher-authored offer tables or manual offer overrides.
- Direct changes to grades, token odds, magnet weights, or extra actions.
- Centurion work from the broader expansion plan. The Lifebinder/Runesinger
  role split is implemented separately; see `LIFEBINDER_RUNESINGER_REWORK_PLAN.md`.
