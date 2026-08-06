# Lifebinder / Runesinger Rework Plan

**Status:** Implemented; automated validation complete, classroom tuning pending
**Created:** 2026-08-06
**Branch:** `warden-runesinger-rework`
**Scope:** Add the Lifebinder, transfer healing-over-time and Necromancer Life Power support to her, refocus the Runesinger as unrestricted-seat support, and update every player-facing rules source

This document is the implementation source of truth for the Lifebinder and
Runesinger role split. It supersedes the preliminary Warden/Runesinger details
in `GAMEPLAY_EXPANSION_PLAN.md` when the two documents differ.

> **Terminology correction:** Lifebinder is the healing role, not one hero
> class. Its two classes are **Thornmender** (rescue healing; legacy internal id
> `Healer`) and **Grovekeeper** (HoT healing; internal id `Lifebinder`). Internal
> ids remain unchanged for save compatibility.

## 1. Locked role decisions

| Archetype | Role | Seat rule | Primary identity |
|---|---|---|---|
| Healer | Healer | Last seat only | Immediate emergency healing |
| Lifebinder | Healer | Last seat only | Preventative healing-over-time and Necromancer Life Power recipient |
| Runesinger | Support | Any seat | Claim-grade rewriting followed by a modest rune attack |
| Necromancer | Support | Any seat | Drain damage and Life Power for the deployed Healer or Lifebinder |

Lifebinder starts at **40 max HP**, matching Healer and the pre-rework Runesinger.
Runesinger remains at 40 max HP.

The following behavior is locked for this rework:

- Necromancer Life Power targets a living, deployed **Healer or Lifebinder**, never
  a Runesinger.
- Lifebinder takes over the current Runesinger healing-over-time ladder and its
  Life Power interaction.
- Runesinger retains her current rewrite ladder, always resolves before
  non-Runesinger claimers, and may occupy positions 1–6.
- Runesinger attacks after applying her rewrite. Her attack uses ordinary
  positional targeting: positions 1–3 hit a living gap minion first, while
  positions 4–6 hit the boss. It does not gain Archer Long Shot or Spearman
  Penetrate.
- Runesinger is listed under **Support**, not **Healers**, everywhere roles are
  presented. Lifebinder joins Healer under **Healers**.
- A formed line may contain at most one last-seat healer: Healer or Lifebinder.

## 2. Target ability kits

### 2.1 Lifebinder healing-over-time

Lifebinder uses the current three-tick HoT timing and two-stream-per-soldier cap.
The transfer deliberately preserves known healing values before campaign
balance is retuned.

| Grade | Lifebinder effect |
|---|---|
| A | Apply **4 HP × 3 ticks** to every living party member. |
| B | Apply **4 HP × 3 ticks** to living positions 1–3. |
| C | Apply **3 HP × 3 ticks** to living positions 4–6. |
| D | Apply **3 HP × 3 ticks** to Lifebinder only. |
| F | No HoT; Lifebinder takes **3 self-damage**, bypassing absorb. Life Power is not consumed. |

New HoTs use Lifebinder as their source. They tick after damaging party DoTs, as
the current hymn does, so the first tick can occur in the same round the HoT is
applied. Existing stream stacking, Frozen healing blocks, logs, and reconnect
persistence remain intact.

### 2.2 Lifebinder and Life Power

Necromancer A–C keeps its current drain and bonus values:

| Grade | Drain | Life Power |
|---|---:|---:|
| A | 12 | +6 per eligible ally |
| B | 9 | +4 per eligible ally |
| C | 6 | +2 per eligible ally |

Life Power is granted to the single deployed Healer or Lifebinder. It does not
stack; a later grant replaces the existing value. On that recipient's next
successful healing action:

- The base instant heal or Lifebinder HoT is applied normally.
- Fire/Poison is washed from affected dirty seats, with no purple bonus HP on
  those seats.
- Affected clean seats receive the flat purple bonus HP.
- The charge is consumed after the follow-up presentation beat.
- F actions and actions that affect no eligible living target do not consume
  the charge.

Because Lifebinder occupies the last seat and ordinary actions resolve front to
back, a Necromancer earlier in the same drop can grant Life Power before a
claiming Lifebinder acts. This matches the existing Healer timing and is intended.

### 2.3 Runesinger rewrite plus attack

The rewrite portion does not change:

| Grade | Rewrite | Rune attack |
|---|---|---:|
| A | Upgrade all claims by two grades, capped at A. | 12 |
| B | F/D become C; C becomes B; B and A remain unchanged. | 9 |
| C | Upgrade the worst claim to C; front position wins ties. | 6 |
| D | No rewrite. | 4 |
| F | Downgrade all claims by one grade; F remains F. | 0 |

The `12/9/6/4/0` starting ladder matches Necromancer's successful-grade drain
band and sits below Shield Maiden's `14/11/9/7/0` band. This keeps Runesinger's
attack comparable to those supports while pricing in the power of a multi-claim
rewrite. The values are a starting balance contract and may change only after
the isolated and campaign simulations in section 8.

Runesinger continues to resolve before all other archetypes. If two
Runesingers are deployed and both claim tokens, they resolve front to back;
each rewrites the current effective grades and then attacks. Rewrites therefore
stack deterministically. There is no hidden one-Runesinger composition cap in
this slice; classroom and simulation results should decide whether one is
needed later.

## 3. Formation and understrength rules

The shared formation rule changes from `Healer | Runesinger` to
`Healer | Lifebinder`:

- Healer and Lifebinder may only occupy the final position in the currently formed
  line.
- Only one of those two archetypes may be deployed at a time.
- Runesinger is treated like Shield Maiden or Necromancer for seating and may
  be placed anywhere.

The current rule that every living soldier must deploy when fewer than six are
alive can soft-lock a roster containing both a living Healer and Lifebinder. Do not
waive the last-seat restriction. Instead, field the **largest legal party**:

1. Include at most one living Healer/Lifebinder in the last seat.
2. Fill the remaining positions with living unrestricted-seat soldiers.
3. If an extra Healer/Lifebinder is the only overflow, leave that soldier on the
   bench even when the roster is understrength.

Examples:

| Living roster | Required legal line |
|---|---|
| Four unrestricted + Healer + Lifebinder | Five soldiers; choose one healer for position 5. |
| Two unrestricted + Lifebinder | Three soldiers; Lifebinder occupies position 3. |
| Healer + Lifebinder only | One soldier; choose either for position 1. |

Rename shared helpers around the rule to describe **backline healers**, not
generic support. The lobby must explain why an otherwise living healer is
allowed to remain benched and must never suggest that Runesinger owns the back
seat.

## 4. Roster, persistence, and release policy

Add `Lifebinder` to the shared `Archetype` union and create two Lifebinders in a new
campaign. Move Runesinger ahead of the damage group into the Support display
section. The new 23-soldier roster order is:

1. Frontline: Vanguard ×2, Spearman ×2.
2. Support: Shield Maiden ×2, Necromancer ×2, Runesinger ×2.
3. Damage: Fire Mage ×3, Archer ×3, Thundercaller ×3.
4. Healers: Healer ×2, Lifebinder ×2.

Do not silently add full-health Lifebinders to a campaign already in progress.
The classroom release requires a teacher reset/new team so every team begins
with the same 23-soldier roster. Old save loading must remain defensive:

- Missing Lifebinders do not make JSON invalid.
- Existing Runesinger-sourced HoTs may finish safely; all new HoTs are
  Lifebinder-sourced.
- Backfill removes an existing Life Power status from Runesinger because she
  can no longer spend it. Healer-held Life Power remains valid; all new grants
  can target only Healer or Lifebinder.
- Release notes and `HANDOFF.md` must state that a reset is required to receive
  Lifebinders and the supported post-rework balance.

The healing role is **Lifebinder**, with two mechanically distinct classes:

- Grovekeeper suggests preservation, shelter, and patient natural recovery.
- Thornmender suggests restoration through older, harsher magic.

Thornmender retains the original instant rescue-heal ladder. Grovekeeper owns
the transferred three-tick renewal ladder. They share the last-seat restriction
but use separate portrait contracts and balance tables.

Display gender/voice mapping and final art remain content requirements.
Mechanics may ship with the existing readable portrait and SFX fallbacks, but
the asset contract must reserve `client/public/art/grovekeeper/` and
`client/public/art/thornmender/`, plus `act_lifebinder`/Lifebinder HoT audio ids
before classroom review.

The existing boss remains **Barrow Warden**. Keep the Lifebinder and boss code,
art, and audio keys distinct (`lifebinder` versus `barrow_warden`) and do not
change the boss kit as part of this rework.

## 5. Shared model and rules work

Update the shared package first so server and client compile against one
contract:

- `types.ts`: add `Lifebinder`; make HoT source migration-safe while emitting only
  Lifebinder for new effects; revise Life Power comments.
- `balance.ts`: add Lifebinder HP, roster count/order, HoT constants, Lifebinder F
  self-damage, and `RUNESINGER_DAMAGE`.
- `partyRules.ts`: replace backline-support terminology with backline-healer
  helpers; calculate the largest legal understrength party.
- `playbook.ts`, `archetypeScout.ts`, `statusUi.ts`, and `presentation.ts`: add
  Lifebinder copy; remove healing/back-seat claims from Runesinger; change Life
  Power copy to Healer/Lifebinder.
- `audioRoles.ts`: add Lifebinder art-gender and action/tick SFX mappings; convert
  Runesinger audio fallback wording from hymn healing to rune attack.
- Audit every exhaustive `Record<Archetype, ...>` and switch so adding Lifebinder
  cannot leave an undefined icon, portrait key, tint, scout row, or SFX.

## 6. Server implementation work

### 6.1 Specialist resolution

- Extract the current Runesinger HoT targeting/application code into Lifebinder.
- Keep rewrite mutation in Runesinger, then call `hitEnemies` with the new
  grade damage after the rewrite.
- Dispatch Lifebinder through `resolveSpecialistAction` and return the same Life
  Power follow-up contract used by Healer.
- Replace the Life Power recipient lookup with a living deployed Healer/Lifebinder
  lookup. Formation guarantees at most one recipient.
- Rename Runesinger-specific HoT helpers/log tags where the behavior is now
  generic or Lifebinder-owned.

### 6.2 Combat lifecycle and presentation

- Preserve Runesinger-first ordering, with multiple Runesingers ordered front
  to back, followed by all other claimers front to back.
- Remove healing FX from Runesinger action beats and add enemy impact focus for
  the rune attack.
- Add Lifebinder cast, HoT application, HoT tick, Life Power grant/spend, F
  self-backfire, hit/death, and audio cues.
- Relabel the current hymn tick phase as Lifebinder HoT while preserving its place
  after damaging DoTs.
- Update Necromancer grant detection so Lifebinder receives purple buff FX and
  Runesinger does not.

### 6.3 Formation, seed, store, and simulations

- Enforce Healer/Lifebinder last-seat exclusivity in server-authoritative party
  selection and fight start validation.
- Implement largest-legal-party behavior for understrength rosters and mirror
  it in any campaign helper that currently calls `withBacklineSupportLast`.
- Add distinct Grovekeeper roster entries and preserve the original
  Thornmender roster; keep their persistence ids migration-safe.
- Keep store backfill tolerant of old rosters and old HoT source strings.
- Add Lifebinder and unrestricted Runesinger to simulation party templates and
  magnet priorities.

## 7. Client and documentation work

### 7.1 Lobby and combat UI

- Lobby sorting becomes Frontline → Support (including Runesinger) → Damage →
  Healers (Healer/Lifebinder).
- Formation drag/drop permits Runesinger in every position and reserves the
  last seat for Healer/Lifebinder.
- Understrength messaging shows the largest legal line and explains a benched
  overflow healer.
- Add Lifebinder portrait key, placeholder mark/tint, icon, roster card, combat
  status presentation, Life Power FX, and HoT tooltip.
- Runesinger cards and combat playbook show both rewrite and attack damage, with
  no healing or back-seat language.

### 7.2 Role and rules documentation checklist

Do not update these sources to claim the feature is live until their matching
code slice lands. Before merge, update all of them in the same branch:

- `README.md`: roster table, resolve order, Necromancer, Healer, Runesinger,
  new Lifebinder section, damage comparison, audio/art lists, and back-seat rules.
- `docs/HANDOFF.md`: loop summary, action order, role table, roster, art/audio
  keys, test map, reset requirement, and completed/open work.
- `docs/DESIGN.md`: archetype union, roster/HP tables, concrete grade kits,
  formation rules, and test matrix. Remove the stale Runesinger kit rather than
  leaving two competing descriptions.
- `docs/GAMEPLAY_EXPANSION_PLAN.md`: link to this source of truth and mark the
  rework implemented when complete.
- `client/src/site/CharactersPage.tsx`: put Runesinger in Support; put Lifebinder
  beside Healer; update role blurbs and total roster/class counts.
- `client/src/site/HowToPlayPage.tsx`: update resolve order, seating, Life Power,
  healing, and party-building guidance.
- Shared playbook/scout/status copy rendered by lobby, combat, and character
  detail pages.
- `client/public/art/README.md` and audio catalog comments/contracts.

A final case-insensitive repository search for `Runesinger`, `Life Power`,
`back seat`, `hymn`, `Healer or`, and role headings is required. Historical
planning notes may retain old behavior only when clearly labeled superseded.

## 8. Test and balance plan

### 8.1 Shared formation tests

- Runesinger is legal in positions 1–6.
- Healer and Lifebinder are rejected outside the current last seat.
- Healer + Lifebinder cannot both deploy.
- Understrength selection calculates the largest legal line and permits only
  overflow backline healers to remain benched.
- Existing all-living enforcement still rejects arbitrary benching of an
  unrestricted-seat soldier.

### 8.2 Specialist and lifecycle tests

- Each Lifebinder grade applies the correct targets, tick value, duration, cap, and
  F result.
- HoTs tick after damaging DoTs and respect Frozen/heal caps.
- Necromancer grants Life Power to Healer or Lifebinder and never Runesinger.
- A same-drop Necromancer grant can be consumed by a later-acting Lifebinder.
- Lifebinder Life Power base HoT, Fire/Poison wash, clean-seat purple bonus,
  no-stack replacement, and non-consumption cases match Healer semantics.
- Lethal Lifebinder F self-damage uses common death/relic-destruction handling.
- Every Runesinger grade preserves the existing rewrite and deals exactly its
  rune damage through the positional gap rule.
- Runesinger attacks interact correctly with Charge, Bone Memory gates, Ohm
  Reflect, and attack-triggered relics.
- Two claimed Runesingers resolve front to back and stack rewrites
  deterministically before other claimers.

### 8.3 Persistence, UI, and regression tests

- New/reset teams contain the 23-soldier roster; old saves without Lifebinders load.
- An in-progress legacy Runesinger HoT does not crash load or ticking.
- Lobby client validation matches server formation validation at party sizes
  1–6.
- Lifebinder and Runesinger playbook text, icons, portraits, tooltips, FX, and
  fallbacks render at Chromebook size.
- Shared/server unit suites, production build, and existing boss/relic/scoring
  regressions pass.

### 8.4 Balance gates

Run isolated paired simulations before changing the proposed values:

1. Current Healer formation versus the same formation with Lifebinder.
2. Old Runesinger baseline results versus new Runesinger at each line row.
3. One Runesinger versus two Runesingers to measure rewrite stacking.
4. Necromancer + Healer versus Necromancer + Lifebinder.
5. Full Strong, Typical, and Weak six-room campaign runs with relics enabled.

Review damage dealt, healing applied, rounds, deaths, room clears, Tempo awards,
relic destruction, and composition-specific win rates. Runesinger's rewrite
must remain her primary value; Lifebinder should offer slower prevention without
strictly replacing Healer's emergency recovery.

## 9. Delivery slices

### Slice 1 — Shared archetype and formation foundation

- Add Lifebinder to types, balance records, roster order, scout/playbook/status
  contracts, and exhaustive mappings.
- Replace Healer/Runesinger back-seat rules with Healer/Lifebinder rules, including
  largest-legal understrength selection.
- Add focused shared tests.

### Slice 2 — Server role split

- Move HoT and Life Power consumption from Runesinger to Lifebinder.
- Add Runesinger positional attack and preserve rewrite-first ordering.
- Update logs, store compatibility, seed data, and engine tests.

### Slice 3 — Lobby and combat presentation

- Add Lifebinder roster/formation/combat presentation and fallbacks.
- Make Runesinger unrestricted in formation UI and present rewrite + attack.
- Update Life Power and HoT FX/audio ownership.

### Slice 4 — Documentation and content contract

- Complete every source in the section 7 checklist.
- Add Lifebinder art/audio contracts and lock the Grovekeeper/Thornmender
  display names.
- Mark the broader expansion item complete only after behavior and docs agree.

### Slice 5 — Validation and tuning

- Run unit, build, UI, isolated-balance, and full-campaign checks.
- Tune only from recorded comparisons; update balance logs and handoff.
- Classroom-review the new formation rules and role readability before merge.

## 10. Acceptance criteria

The rework is complete when:

- Lifebinder is the only HoT specialist and receives Necromancer Life Power.
- Runesinger never heals, never receives Life Power, can stand in any seat,
  rewrites first, and attacks at the tested grade value.
- Healer/Lifebinder last-seat exclusivity cannot soft-lock an understrength team.
- New teams receive two Lifebinders and every old save loads without invented
  roster members.
- Runesinger appears under Support and Lifebinder under Healers in every current
  player-facing and maintainer-facing rules source.
- Tests, production build, simulations, assets/fallbacks, and handoff are ready
  for classroom review.

## 11. Implementation validation (2026-08-06)

- Shared unit suite: **35/35 passed**.
- Server unit/integration suite: **208/208 passed**.
- Shared, server, and client production builds passed.
- Focused Lifebinder/Runesinger/Life Power/formation suite: **42/42 passed**.
- Paired 20-seed boss samples covered Healer vs Lifebinder,
  Necromancer+Healer vs Necromancer+Lifebinder, one Runesinger, and two
  Runesingers across Strong/Typical/Weak pools on Ash Wraith and Bone
  Colossus. The role split behaved legally; no simulation softlocks occurred.
- The six-room attrition harness completed **15/16 (94%)** Generous campaigns,
  but **0/24 Typical** and **0/12 Weak** balanced campaigns. This is recorded as
  a broader campaign-tuning concern, not grounds for changing the new class
  values without classroom review.

No generated portrait or audio files are required for correctness: the new
Lifebinder key has a placeholder portrait and catalog fallbacks. Final custom
art/audio remain optional content work.
