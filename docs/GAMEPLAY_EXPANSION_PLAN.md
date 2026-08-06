# Gameplay Expansion Plan

**Status:** Proposed design direction  
**Created:** 2026-08-06  
**Scope:** Persistent scoring, magic items, Centurion, and Warden/Runesinger redesign

## 1. Purpose

GradeForge's core combat loop is now on solid ground. The Token Magnet should remain the primary round-to-round tactical control, but the campaign needs more meaningful decisions between fights, more party-building options, and a richer way to recognize student performance.

This document records the recommended direction for four connected additions:

1. Persistent run statistics and a scoring foundation.
2. Magic-item rewards after boss victories.
3. A Warden archetype and a narrower Runesinger identity.
4. A position-sensitive Centurion archetype.

The recommended implementation order is:

1. Add persistent run statistics and scoring data structures.
2. Add a small, complete magic-item system.
3. Split healing-over-time from the Runesinger into the Warden.
4. Add the Centurion after validating that his role remains distinct from the Spearman.
5. Balance the complete six-room campaign with all new systems active.

## 2. Current design constraints

The following existing rules shape this plan:

- The Token Magnet is the game's primary tactical lever during combat.
- A team fields six soldiers while at full strength.
- Permanent deaths and persistent HP make campaign attrition important.
- Camp currently provides partial recovery and party reformation, but no reward choice.
- Runesinger currently combines token rewriting with substantial healing-over-time.
- Healer and Runesinger currently compete for the only legal back support seat.
- The actual new-campaign roster contains 21 soldiers, despite a few older references to 22.
- The default dungeon contains six bosses, so only the first five boss drops can affect later combat.

New features should deepen the existing decisions without adding a competing set of buttons during combat.

## 3. Persistent scoring foundation

> **Scoring design superseded:** The approved badge tracks, award names, score rules, asset contract, and implementation plan now live in [`SCORING_SYSTEM_PLAN.md`](./SCORING_SYSTEM_PLAN.md). That document is the source of truth for scoring work. In particular, the approved initial system does **not** include automatic Mastery or Grit tracks.

### 3.1 Why this comes first

The current persistent team state retains campaign progress and surviving soldiers but clears most fight-specific information when the team enters camp. A refined score will require a permanent room-history ledger.

Adding the ledger first also gives future playtests useful evidence for balancing items and new archetypes.

### 3.2 Data to retain per room

Each completed or failed attempt should record at least:

- Room index and boss id.
- Attempt number.
- Starting party ids and archetypes.
- Starting living-roster count.
- Starting and ending HP for deployed soldiers.
- Starting and ending party size.
- Permanent deaths during the attempt.
- Number of combat rounds.
- Victory or defeat.
- Important boss-mechanic successes and failures.
- Whether the team began understrength.
- Magic item chosen after victory.
- Magic items destroyed during the fight.

Derived summary fields can include total victories, total attempts, room stars, Renown, relics preserved, and veteran participation.

### 3.3 Scoring philosophy

Final survivor count should not be the sole score. It is affected heavily by the strength of the grade pool, random token order, roster size, and whether healthy soldiers were kept safely on the bench.

The teacher should see automatic **Dungeon Renown** and recognizable achievement badges, then retain control over how that performance converts into academic bonus points.

The score should be compared only among teams playing the same room in the same classroom. It should not be used as a direct comparison between class periods with different grade pools.

### 3.4 Room achievements

Each room can award the following:

- **Victory:** Defeat the boss.
- **Mastery:** Complete the boss's mechanic-specific objective.
- **Preservation:** No deployed soldier dies during the room.
- **Tempo:** Clear within the generous upper end of the boss's recommended round range.
- **Grit:** Clear while understrength or after entering badly wounded. This can replace Preservation so an already-depleted team still has a heroic objective.
- **Teacher Star:** Optional recognition for collaboration, participation, or explaining a good magnet decision.

Possible Mastery objectives include:

- Moss Grub: control its mites before they overwhelm the magnet target.
- Ash Wraith: cleanse a dangerous escalating status before its highest intensity.
- Cinder Herald: control its fire pressure or imps.
- Rattle Captain: destroy or counter its Ohms efficiently.
- Barrow Warden: break a spreading frost chain before shatter.
- Bone Colossus: destroy a Bone Memory before detonation.

The final UI can show both total Renown and the badges that produced it. The badges matter more pedagogically because students can understand what they did well.

### 3.5 Academic bonus conversion

The game should not directly modify grades. The teacher dashboard should present the evidence and offer a manual, configurable award.

A reasonable initial policy is a small cap, such as 1–3 assignment or campaign bonus points. The teacher may consider automatic Renown alongside observed participation and teamwork.

## 4. Magic items

> **Relic implementation plan:** The approved reward shape, Healing Potion
> fallback, persistence model, combat hooks, UI, and delivery slices now live in
> [`RELIC_SYSTEM_PLAN.md`](./RELIC_SYSTEM_PLAN.md). That document is the source
> of truth for relic implementation work.

### 4.1 Reward flow

After every non-final boss victory:

1. The team enters a reward step before ordinary camp party formation.
2. Three relics and a Healing Potion are presented.
3. The team chooses exactly one of the four rewards.
4. A chosen relic is permanently bound to one living soldier who does not already carry a relic.
5. The Healing Potion instead restores one living soldier to maximum HP in the lobby, is consumed immediately, and does not occupy a relic slot.
6. A relic functions only when its bearer is deployed.

The final boss should award a trophy, Renown bonus, or epilogue collectible because a normal combat relic would have no later fight in which to matter.

For classroom fairness, all teams in the same classroom should receive the same three offers for a given room. Offers may be seeded by classroom and room, configured by the teacher, or selected from a fixed boss-themed reward table.

### 4.2 Binding and destruction

- A soldier may carry at most one relic.
- A relic cannot be transferred after binding.
- A relic is inactive while its bearer is benched.
- The relic is destroyed immediately the first time its bearer dies.
- A Thundercaller revival does not restore the destroyed relic.
- Relic destruction should receive a clear combat cue and be recorded in room history.

These rules make the bearer meaningful without introducing a separate equipment-management game.

The Healing Potion is always available as the fourth choice. It ensures the
reward step remains completable if every living soldier already carries a
relic, while also creating a meaningful choice between permanent power and
immediate campaign recovery.

### 4.3 Initial power budget

The first relic set should use passive, easily explained effects. A relic should make one character noticeably better without determining the entire fight. As a starting target, its effect should be roughly a 5–10% improvement to one soldier rather than a party-wide multiplier.

Avoid initial relics that:

- Change claim odds or magnet weighting.
- Directly upgrade letter grades.
- Grant extra actions.
- Stack unrestricted damage multipliers.
- Require an additional combat button.

Those effects would compete with the magnet and Runesinger identities or create large balance swings.

### 4.4 Candidate starter relics

| Relic | Proposed effect |
|---|---|
| Bulwark Sigil | Reduce the first boss hit against the bearer by 6 each room. |
| Ember Whetstone | The bearer's first successful attack each fight deals +4 damage. |
| Saint's Thread | Once per fight, heal the bearer for 8 when they fall below 25% HP. |
| Purity Charm | The first damaging DoT applied to the bearer has one fewer tick. |
| Hunter's Eye | The bearer deals +3 damage against minions. |
| Last Light | The bearer's first D attack each fight uses the C damage value, but not its other effects. |

Boss-themed names and art should connect each reward set to the defeated boss: grub carapaces, ash charms, ember weapons, Ohm coils, frost relics, and Bone Memory trophies.

### 4.5 Required implementation surfaces

- Shared item definitions and item-instance types.
- Optional bound item on each soldier or an item inventory keyed by soldier id.
- Reward state in the camp/victory flow.
- Deterministic classroom/room offers.
- Item hooks in damage, healing, DoT application, and death processing.
- Camp reward and binding UI.
- Relic icon/status presentation on soldier cards.
- Teacher overview and room-history reporting.
- Unit tests plus item-aware campaign simulations.

## 5. Warden and Runesinger redesign

### 5.1 Design goal

The current Runesinger performs two major jobs: she rewrites all claims before other actions and also places substantial healing-over-time. These identities should be divided.

- **Runesinger:** token control plus modest rune damage.
- **Warden:** preventative healing-over-time.
- **Healer:** immediate emergency healing.

This gives each sustain/control archetype a clearer classroom-readable job.

### 5.2 Warden starting kit

The existing Runesinger HoT ladder can move almost directly to the Warden:

| Grade | Proposed Warden effect |
|---|---|
| A | HoT all living soldiers for 4 HP × 3 ticks. |
| B | HoT front positions for 4 HP × 3 ticks. |
| C | HoT back positions for 3 HP × 3 ticks. |
| D | HoT the lowest-HP ally or self for 3 HP × 3 ticks. |
| F | No HoT; mild self-backfire rather than party-wide punishment. |

The Warden should not inherit additional cleanses initially. Shield Maiden, Fire Mage, and Life Power already divide cleanse responsibilities.

### 5.3 Runesinger starting kit

Keep the current rewrite identities:

- A: all claims improve by two grades.
- B: F/D become C and C becomes B.
- C: the worst claim becomes C.
- D: no rewrite.
- F: all claims shift down one grade.

After rewriting, add a modest rune attack using the normal positional targeting rules. A starting damage ladder could be 6/5/4/3/0. The rewrite remains her primary power.

Once healing is removed, Runesinger should no longer consume the dedicated back healer slot by definition.

### 5.4 Connected rule changes

- Necromancer Life Power should target Healer or Warden instead of Healer or Runesinger.
- Healing-over-time status source names must no longer be Runesinger-specific.
- Playbook, scout, audio, status, art, roster, and simulation data must be updated.
- The hero name conflicts with the Barrow Warden boss. Prefer a distinct name such as **Grove Warden**, **Wild Warden**, or **Oathwarden**, unless the boss is renamed.

### 5.5 Formation softlock to resolve

Current rules require Healer and Runesinger to occupy the single back seat, while an understrength party must field every living soldier. If multiple back-seat supports are among the final survivors, the team can be unable to form a legal party.

Recommended replacement:

- At full roster strength, limit the selected party to one dedicated sustain hero: Healer or Warden.
- When the roster is understrength and every survivor must fight, waive the composition cap.
- Runesinger is not a dedicated sustain hero after the redesign.

This must be solved before adding another support archetype.

## 6. Centurion

### 6.1 Design goal

The Centurion should make formation matter without replacing the Spearman, Vanguard, or Shield Maiden.

- Spearman remains the self-protecting line breaker with Penetrate and Parry.
- Vanguard remains the personal defensive anchor.
- Shield Maiden remains party-cover support.
- Centurion becomes a setup fighter who improves subsequent attacks.

Do not give the Centurion personal block, parry, or large raw frontline damage. Those would blur the established identities.

### 6.2 Position-sensitive kit

- **Positions 1–3:** Shield Bash. Lower direct damage and apply Exposed to the struck enemy.
- **Positions 4–6:** Javelin. Reliable direct damage without a secondary effect.
- When a minion blocks the gap, Shield Bash targets and exposes the minion. Once the gap is clear, it can expose the boss.

Proposed Exposed rule:

- The next two party hits against the affected enemy deal 25% more damage.
- Exposed does not stack.
- It persists until consumed, the target dies, or the fight ends.

This produces a clear decision: put the Centurion forward to amplify the party or backward for dependable damage.

### 6.3 Starting grade ladder

| Grade | Front Shield Bash | Back Javelin |
|---|---|---|
| A | 8 damage; Expose next 2 hits | 12 damage |
| B | 7 damage; Expose next 2 hits | 10 damage |
| C | 5 damage; Expose next 1 hit | 7 damage |
| D | 3 damage; no Expose | 5 damage |
| F | 2 damage; no Expose | 2 damage |

This is a starting point for simulation, not frozen balance.

## 7. Roster consequences

The current roster contains 21 soldiers. Following the normal two-copy pattern for both new archetypes would produce a 25-soldier campaign roster.

That change will:

- Increase the campaign's total pool of lives.
- Make permanent death slightly less likely to end a campaign.
- Dilute how often each archetype appears in a six-person party.
- Change the meaning of raw survivor counts.
- Require additional names, portraits, poses, audio, playbook entries, and scout information.

Balance and scoring must use proportions or deployed-party outcomes rather than assuming the old roster size.

## 8. Balance evidence and cautions

The existing campaign attrition simulator was run against the 2026-08-06 working tree after the Rattle Captain and Barrow Warden tuning pass.

Results:

- Typical grade pool, balanced party: 0/24 full campaign completions.
- Typical grade pool, frontline party: 0/24 completions.
- Typical grade pool, damage-heavy party: 0/20 completions.
- Generous grade pool, balanced party: 16/16 completions, averaging 19.4 of 21 soldiers alive.
- Weak grade pool, balanced party: 0/12 completions.
- Typical runs cleared roughly 2.5 of 6 rooms on average.

These are automated-play samples, not a prediction of classroom results. The simulator uses a smart magnet heuristic, limited retry rules, and an artificial support-retirement workaround for the current formation softlock. Nevertheless, the contrast demonstrates that final survivor count is strongly affected by grade-pool strength.

Consequences for future work:

- Do not use final survivors as the only academic bonus measure.
- Do not assume new relics alone will solve the typical/weak grade cliff.
- Add new systems to the simulator before finalizing their numeric values.
- Re-run isolated boss matrices and full-campaign attrition tests after each vertical slice.
- Preserve the magnet as the most important player decision.

## 9. Recommended first implementation slice

The first slice should create the foundation without changing combat balance:

1. Add persistent room and attempt history to `TeamState` with migration-safe defaults.
2. Capture starting party, HP, roster size, rounds, deaths, attempts, and result.
3. Persist the record before fight state is cleared at camp or defeat recovery.
4. Add the data to the teacher overview.
5. Display a simple room-history summary without yet awarding academic points.
6. Add focused unit tests for victory, defeat, retry, permanent death, and reset behavior.
7. Update the campaign simulator to report from the same metrics where practical.

Once that foundation is stable, implement a three-to-six-item vertical slice and test it through the full reward, binding, combat, destruction, persistence, and presentation flow.

The scoring and badge foundation is now implemented. Relic work proceeds on the
dedicated plan in [`RELIC_SYSTEM_PLAN.md`](./RELIC_SYSTEM_PLAN.md), beginning
with three passive relics plus the always-available Healing Potion.
