# Rattle Captain and Barrow Warden Numeric Tuning Log

Started 2026-08-05. Target is aggregate Typical-pool win rate across the five standard benchmark formations:

- Rattle Captain: approximately 35%
- Barrow Warden: approximately 30%

Only numeric tuning is allowed. No attacks, targeting rules, status behavior, or other mechanics will be added, removed, or rewritten.

## Reversal checkpoint: before this tuning pass

This checkpoint describes the current working tree, not clean HEAD. Revert only the values explicitly listed in the trial ledger; other uncommitted work predates this pass.

### Rattle Captain baseline values

| Area | Value |
|---|---:|
| Boss HP | 210 |
| Enrage threshold | 40% HP |
| Enrage damage multiplier | 1.35 |
| Rattle Spark weight | 5 |
| Arc Attack weight | 2 |
| Grounded weight | 2 |
| Crush Magnet weight | 1 |
| Summon Ohms weight | 2 |
| Ohm HP | 10 |
| Ohm base damage | 4 |
| Ohm maximum count | 2 |
| Opening Ohms | 1 |
| Second-add focus multiplier | 1.5 |
| Rattle Spark stun chance | 60% |
| Grounded magnet/neighbor stun chance | 30% / 20% |
| Ohm Reflect chance | 28% |
| Ohm Reflect ratio | 25% |
| Grounded damage by line distance | 16/13/10/7/4/2 |

100-seed baseline, Typical pool:

| Party | Win % | Win rounds | Deaths | Failed-run boss HP |
|---|---:|---:|---:|---:|
| Balanced | 30% | 19.1 | 5.1 | 27% |
| Frontline | 32% | 17.5 | 5.0 | 20% |
| Glass | 13% | 9.6 | 5.5 | 24% |
| Sustain | 6% | 21.0 | 5.8 | 32% |
| Specialists | 21% | 15.0 | 5.3 | 27% |
| **Aggregate** | **20.4%** | — | **5.3** | — |

### Barrow Warden baseline values

| Area | Value |
|---|---:|
| Boss HP | 270 |
| Enrage threshold | 40% HP |
| Enrage damage multiplier | 1.30 |
| North Wind weight | 3 |
| South Wind weight | 2 |
| Spreading Frost weight | 3 |
| Regenerate weight | 1 |
| Wind hit ladder | 12/9/5 |
| Chill duration ladder | 4/3/2 rounds |
| Spreading Frost line damage | 5 |
| Frozen locked tick | 3 |
| Shatter damage, frozen/splash | 18/6 |
| Regenerate heal/pulse damage | 10/5 |

100-seed baseline, Typical pool:

| Party | Win % | Win rounds | Deaths | Failed-run boss HP |
|---|---:|---:|---:|---:|
| Balanced | 6% | 16.5 | 5.8 | 36% |
| Frontline | 4% | 14.0 | 5.9 | 35% |
| Glass | 12% | 9.7 | 5.7 | 34% |
| Sustain | 5% | 21.8 | 5.8 | 43% |
| Specialists | 10% | 18.7 | 5.7 | 37% |
| **Aggregate** | **7.4%** | — | **5.8** | — |

## Trial ledger

All percentages are aggregate victories across the five standard formations. Small and large tests reuse the same seed ranges as the baseline.

| Trial | Boss | Numeric candidate | 25-seed Typical | 100-seed Typical | Decision |
|---|---|---|---:|---:|---|
| Baseline | Rattle | 210 HP; 40% ×1.35 enrage; 10 HP Ohm | 26.4% | 20.4% | Too strong |
| 1 | Rattle | 200 HP; 35% ×1.25 enrage; 9 HP Ohm | 40.0% | **34.0%** | Stop: target reached |
| Baseline | Warden | 270 HP; 40% ×1.30 enrage | 10.4% | 7.4% | Too strong |
| 1 | Warden | 240 HP; 30% ×1.20 enrage | 18.4% | Not promoted | Still too strong |
| 2 | Warden | 225 HP; 25% ×1.15 enrage | 24.8% | 22.8% | Improved, below target |
| 3 | Warden | 210 HP; 25% ×1.15 enrage | 28.0% | **29.0%** | Stop: target reached |

## Final values

No mechanics, weights, damage ladders, status durations, or status chances changed.

| Boss | Value | Before | Final |
|---|---|---:|---:|
| Rattle Captain | Boss HP | 210 | **200** |
| Rattle Captain | Enrage threshold | 40% | **35%** |
| Rattle Captain | Enrage damage multiplier | 1.35 | **1.25** |
| Rattle Captain | Ohm HP | 10 | **9** |
| Barrow Warden | Boss HP | 270 | **210** |
| Barrow Warden | Enrage threshold | 40% | **25%** |
| Barrow Warden | Enrage damage multiplier | 1.30 | **1.15** |

## Final 100-seed validation

This validation covers 3,000 fights: two bosses × three pools × five formations × 100 seeds.

| Boss | Strong aggregate | Typical aggregate | Weak aggregate | Typical deaths | Target | Result |
|---|---:|---:|---:|---:|---:|---|
| Rattle Captain | 99.0% | **34.0%** | 0.2% | 4.8 | ~35% | On target; stopped |
| Barrow Warden | 99.8% | **29.0%** | 0.2% | 4.9 | ~30% | On target; stopped |

### Final Typical-pool formation results

| Boss | Balanced | Frontline | Glass | Sustain | Specialists |
|---|---:|---:|---:|---:|---:|
| Rattle Captain | 43% | 52% | 22% | 23% | 30% |
| Barrow Warden | 27% | 31% | 34% | 21% | 32% |

Rattle's successful Balanced/Frontline fights still average 16.6–18.4 rounds, above the stated 8–12 target. This pass stopped because the requested win rate was reached; future duration tuning should begin from this checkpoint rather than changing these values implicitly.

Warden's Balanced, Frontline, and Specialists wins average 13.0–13.5 rounds, inside its 10–14 target. Glass wins are faster (8.6) and Sustain wins remain longer (21.1), as expected from those formations.

The weak-pool cliff remains: both bosses are effectively unwinnable with that grade mix. This pass intentionally did not change character grade effects.

## Exact reversal recipe

To return only these bosses to the pre-pass working-tree values:

1. In `server/content/bosses/rattle_captain.toml`, restore boss HP `210`, enrage `0.40` / `1.35`, and Ohm HP `10`.
2. In `server/src/engine/bosses.ts`, restore the `SummonOhms` fallback HP to `10`.
3. In `server/content/bosses/barrow_warden.toml`, restore boss HP `270` and enrage `0.4` / `1.3`.
4. Restore the matching numeric assertions and documentation values changed in this pass.

The reusable focused command is:

```bash
npm run playtest:bosses -- --runs 100 --max-rounds 80 --bosses rattle_captain,barrow_warden
```
