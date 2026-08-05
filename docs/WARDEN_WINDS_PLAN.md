# Barrow Warden redesign — winds, Chill, A-thaw

**Branch:** `feature/warden-winds-chill-athaw`  
**Goal:** Room 5 deadly via DoT + freeze *lesson*, not same-turn full-line nukes.

---

## Design summary

| Attack | Effect |
|--------|--------|
| **North Wind** (was FrontSlam) | 12/9/5 on seats **1/2/3** + **Chill** duration **4/3/2** |
| **South Wind** (was LineAttack) | 12/9/5 on seats **6/5/4** + **Chill** duration **4/3/2** |
| **Spreading Frost** | **5** to whole line; **always** freezes front (prefer pos1, else pos2); chain → boss **shatter** punish |
| **Regenerate** | Unchanged (w1) |

| Status | Rules |
|--------|--------|
| **Chill** | New DoT: tick **3**, stack cap 1, **no** token demotion, **no** soft-freeze on expiry. Re-apply **sets** duration (seat ladder). Fire Mage A/B cleanses. Not Ice. |
| **Frozen** (chain) | Always applied by Spreading Frost. Blocks attack; heal block **kept**. **Not** Fire Mage thaw. **A** on a chain-Frozen seat **cracks all chain Frozen** (party thaw). Boss shatter if ignored. |
| **Ice** | Engine behavior retained; Colossus archers are retired by the Bone Memory redesign. |

| Cleanse | Who |
|---------|-----|
| Chill | Fire Mage A/B (half-line) |
| Frozen | **A-break** only (any archetype on a frozen seat) |
| Fire/Poison | Maiden / Necro wash (unchanged) |

---

## Phases

### Phase 1 — Shared types & constants
- `DotType` += `"Chill"`
- `DOT_STATS.Chill`, `MAX_PARTY_CHILL_STACKS`, wind/frost balance knobs
- Scout, playbook, status UI, cleanse portrait dots, boss presentation

### Phase 2 — Engine
- `applyDot` Chill path (set duration on re-apply, no ramp)
- NorthWind / SouthWind / SpreadingFrost in `bosses.ts`
- Warden TOML attack ids + weights
- Fire Mage: cleanse Chill; **remove** thawFrozen
- Specialist: chain Frozen + effective **A** → party crack free (utility, no kit attack)
- Combat cue + FX tags for break-out

### Phase 3 — Client ice-break FX
- Cue tags: `ice-break`, `frost-shatter`
- CSS shard burst + white crack flash (classroom-readable)
- CombatActor overlay while cue active
- poses: break-out uses attack pose (not sticky ice) once status cleared
- SFX catalog `ice_break`

### Phase 4 — Tests & docs
- Update `frozen.test.ts`, cleanse tests; add wind/chill/A-thaw tests
- Touch BOSS_PLAN / README lines that claim Mage-only Frozen thaw

---

## Out of scope
- Chill cleanse on Healer/Necro
- Thundercaller special ice-break
- Grave Thrall / Dominated
- Balance retune beyond kit structure (HP/weights can follow sims)
