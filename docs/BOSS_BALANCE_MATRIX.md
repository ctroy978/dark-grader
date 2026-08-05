# Boss Balance Matrix

> Historical pre-nerf baseline. Rattle Captain and Barrow Warden were subsequently tuned; see `docs/BOSS_NUMERIC_TUNING_LOG.md` for current values and results.

Run on 2026-08-05 against the current working tree (HEAD `b1d0f08` plus the local combat/content changes). This is an isolated-fight benchmark: every fight starts with a fresh six-person party. Campaign attrition would make later rooms harder than these results.

## Executive read

Each percentage below pools 500 fights (five parties × 100 paired seeds). “Typical deaths” is the mean number of the six party members dead at the end of a typical-pool fight.

| Boss | Strong win % | Typical win % | Weak win % | Typical deaths | Tuning read |
|---|---:|---:|---:|---:|---|
| Moss Grub | 100.0% | 100.0% | 79.0% | 0.2 | Safe tutorial, but too weak to create typical-pool attrition |
| Ash Wraith | 99.8% | 71.8% | 4.0% | 2.9 | Best current baseline; healthy typical spread, severe weak-pool cliff |
| Cinder Herald | 92.4% | 44.6% | 1.4% | 4.3 | Hard edge of Standard; strongly favors burst/Fire Mage stacking |
| Rattle Captain | 96.4% | 20.4% | 0.0% | 5.3 | Too strong for a Standard boss and well beyond its round target |
| Barrow Warden | 99.2% | 7.4% | 0.0% | 5.8 | Too strong even for Hard; nearly all fresh typical parties wipe |
| Bone Colossus | 80.0% | 20.8% | 0.4% | 5.2 | Final-boss hard, but highly composition-gated; glass parties fail even strong grades |

The largest systemic finding is the grade cliff. The weak pool still clears Moss 68–86% depending on party, then falls to 0–11% on Ash and 0–2% afterward. If low-grade classes are expected to remain engaged across the campaign, boss-only tuning will not be enough; the D/F character effects or pool assistance also need attention.

Boss-specific observations:

- **Moss Grub:** all 500 typical-pool runs won, with almost no casualties. Balanced and Frontline wins average 8.5–9.4 rounds, slightly over the stated 5–8 target, so simply adding HP would worsen pacing. If more danger is wanted, add early pressure rather than durability.
- **Ash Wraith:** the most balanced fight. Typical parties win 58–78%; successful Balanced runs land exactly at 12.0 rounds. This is the best control encounter for later tuning.
- **Cinder Herald:** Glass wins 72% while other typical parties win 30–48%. Two Fire Mages plus two Archers can race the encounter in 6.8 rounds; slower sustain teams accumulate roughly twice the DoT exposure. This points to a burst/cleanse composition check more than raw HP alone.
- **Rattle Captain:** only 6–32% typical wins, and successful non-Glass teams take 15.0–21.0 rounds against an 8–12 target. Stun exposure is modest (1.2–3.2 seat-rounds); repeated Ohm waves (4.6–6.9 adds/fight) and prolonged damage/enrage pressure are the larger problem.
- **Barrow Warden:** only 4–12% typical wins. Losing teams leave 34–43% boss HP, so this is not merely a run of close losses. Chill plus chain-freeze creates 24–56 combined status seat-rounds in the slower formations. This is the clearest nerf candidate.
- **Bone Colossus:** Balanced/Frontline typical teams win 30–33%, but Glass wins 0%; even with the Strong pool, Glass wins only 12%. Successful typical runs are within the intended 12–18 rounds. The main issue is composition rigidity and memory detonation pressure, not encounter length: typical teams break only 2.1–3.3 memories and eat 1.2–2.7 detonations per fight.

### Character-level signals

These are directional composition signals, not isolated character coefficients:

- **Burst damage is disproportionately valuable.** Glass is the fastest formation on every boss and leads typical-pool win rate on Moss, Cinder, and Warden. Its Cinder result (72%) versus Balanced (48%) shows that ending an escalating encounter can outperform hundreds of points of healing.
- **Sustain cannot rescue low damage after room 2.** Sustain records the most healing but falls to 30% on Cinder, 6% on Rattle, 5% on Warden, and 19% on Bone. Healing extends fights into repeated add/status/enrage cycles without creating enough progress.
- **Fire Mage/cleanse access matters sharply.** Replacing Balanced's Fire Mage with Necromancer in Sustain barely changes Ash (78% versus 77%) but loses 18 points on Cinder, 24 on Rattle, and 14 on Bone. Some of that is damage throughput, but the DoT/add encounters are particularly punitive without Fire Mage.
- **The current Spearman substitution is not a clear upgrade.** Frontline replaces Balanced's Thundercaller with Spearman and shifts Shield Maiden one seat back; it wins less often on Ash, Cinder, Warden, and Bone, and only gains two points on Rattle. Spearman's extra front durability is not translating into better outcomes under this controller.
- **Runesinger specialists are viable early but fragile late.** Specialists remain close to Frontline on Ash and Cinder, but average 5.3–5.7 deaths on Rattle/Warden/Bone typical pools. A direct Healer-versus-Runesinger paired test would be the next useful character-isolation sweep.

## Method

- 9,000 fights: six bosses × five formations × three grade pools × 100 seeds.
- Seeds 1–100 are reused in every scenario for paired comparisons.
- The adaptive controller uses only visible state: it protects the magnet from two adds, attempts A-grade thaw/resurrection, prioritizes A/B cleanse and healing, then damage. It does not know the boss's untelegraphed next move.
- Maximum length is 80 rounds. Only Bone Colossus timed out: 43 of 1,500 Bone runs (3 strong, 32 typical, and 8 weak).
- This is not a campaign simulation and does not model player mistakes, prior deaths, or incomplete inter-room healing.

### Grade pools

| Pool | A | B | C | D | F | Total |
|---|---:|---:|---:|---:|---:|---:|
| Strong | 20 | 10 | 2 | 1 | 1 | 34 |
| Typical | 4 | 5 | 6 | 4 | 4 | 23 |
| Weak | 2 | 2 | 6 | 5 | 7 | 22 |

### Team formations

| Party | Positions 1 → 6 |
|---|---|
| Balanced | Vanguard, ShieldMaiden, FireMage, Archer, Thundercaller, Healer |
| Frontline | Vanguard, Spearman, ShieldMaiden, FireMage, Archer, Healer |
| Glass | ShieldMaiden, FireMage, FireMage, Archer, Archer, Thundercaller |
| Sustain | Vanguard, ShieldMaiden, Necromancer, Thundercaller, Archer, Healer |
| Specialists | Spearman, FireMage, Archer, Necromancer, Thundercaller, Runesinger |

## Moss Grub

Config: 130 HP; Easy; recommended 5–8 rounds; no meaningful enrage.

| Pool | Party | Win % | Win rds | Loss rds | Deaths | Fail boss HP | HP lost/r | Heal/f | Adds/f | DoT/Stun/Frozen |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Strong | Balanced | 100% | 5.1 | — | 0.0 | — | 13.5 | 37.0 | 2.2 | 1.2/0.0/0.0 |
| Strong | Frontline | 100% | 6.0 | — | 0.0 | — | 14.5 | 41.5 | 2.5 | 1.8/0.0/0.0 |
| Strong | Glass | 100% | 4.0 | — | 0.0 | — | 15.6 | 0.0 | 1.7 | 0.4/0.0/0.0 |
| Strong | Sustain | 100% | 5.9 | — | 0.0 | — | 13.2 | 58.3 | 2.3 | 2.2/0.0/0.0 |
| Strong | Specialists | 100% | 5.2 | — | 0.0 | — | 16.2 | 65.9 | 2.2 | 1.0/0.0/0.0 |
| Typical | Balanced | 100% | 8.5 | — | 0.1 | — | 19.2 | 69.6 | 3.4 | 5.3/0.0/0.0 |
| Typical | Frontline | 100% | 9.4 | — | 0.1 | — | 20.5 | 69.3 | 3.7 | 6.8/0.0/0.0 |
| Typical | Glass | 100% | 5.6 | — | 0.3 | — | 20.1 | 0.1 | 2.3 | 1.4/0.0/0.0 |
| Typical | Sustain | 100% | 11.9 | — | 0.0 | — | 19.6 | 166.2 | 4.6 | 12.8/0.0/0.0 |
| Typical | Specialists | 100% | 7.4 | — | 0.3 | — | 21.0 | 69.8 | 3.0 | 3.4/0.0/0.0 |
| Weak | Balanced | 79% | 13.8 | 19.0 | 2.6 | 18% | 19.9 | 107.1 | 5.6 | 12.3/0.0/0.0 |
| Weak | Frontline | 81% | 13.4 | 17.2 | 2.6 | 18% | 21.3 | 93.7 | 5.3 | 11.6/0.0/0.0 |
| Weak | Glass | 86% | 8.1 | 10.4 | 2.4 | 10% | 21.5 | 1.0 | 3.4 | 2.9/0.0/0.0 |
| Weak | Sustain | 68% | 17.5 | 19.9 | 3.0 | 23% | 20.8 | 182.6 | 6.7 | 21.0/0.0/0.0 |
| Weak | Specialists | 81% | 11.2 | 15.3 | 2.9 | 15% | 21.1 | 83.3 | 4.0 | 8.8/0.0/0.0 |

## Ash Wraith

Config: 210 HP; Standard; recommended 8–12 rounds; enrage below 25% at ×1.15 damage.

| Pool | Party | Win % | Win rds | Loss rds | Deaths | Fail boss HP | HP lost/r | Heal/f | Adds/f | DoT/Stun/Frozen |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Strong | Balanced | 100% | 6.4 | — | 0.1 | — | 22.8 | 80.9 | 0.0 | 10.2/0.0/0.0 |
| Strong | Frontline | 100% | 7.5 | — | 0.1 | — | 22.7 | 87.4 | 0.0 | 13.1/0.0/0.0 |
| Strong | Glass | 100% | 5.4 | — | 0.3 | — | 20.9 | 0.8 | 0.0 | 6.5/0.0/0.0 |
| Strong | Sustain | 100% | 7.6 | — | 0.0 | — | 19.4 | 100.7 | 0.0 | 10.0/0.0/0.0 |
| Strong | Specialists | 99% | 7.0 | 10.0 | 0.4 | 1% | 23.8 | 86.0 | 0.0 | 14.0/0.0/0.0 |
| Typical | Balanced | 78% | 12.0 | 13.4 | 2.5 | 12% | 26.9 | 146.6 | 0.0 | 23.6/0.0/0.0 |
| Typical | Frontline | 73% | 12.3 | 14.8 | 2.8 | 15% | 26.9 | 142.8 | 0.0 | 24.7/0.0/0.0 |
| Typical | Glass | 58% | 8.1 | 9.5 | 3.8 | 16% | 23.7 | 2.5 | 0.0 | 12.9/0.0/0.0 |
| Typical | Sustain | 77% | 13.6 | 13.8 | 2.2 | 19% | 26.5 | 181.5 | 0.0 | 24.8/0.0/0.0 |
| Typical | Specialists | 73% | 11.6 | 14.1 | 3.1 | 19% | 22.5 | 100.1 | 0.0 | 20.7/0.0/0.0 |
| Weak | Balanced | 2% | 18.0 | 14.4 | 6.0 | 38% | 24.9 | 105.8 | 0.0 | 26.1/0.0/0.0 |
| Weak | Frontline | 4% | 15.8 | 14.3 | 5.9 | 37% | 25.0 | 92.9 | 0.0 | 26.7/0.0/0.0 |
| Weak | Glass | 0% | — | 10.0 | 6.0 | 30% | 23.5 | 1.0 | 0.0 | 13.3/0.0/0.0 |
| Weak | Sustain | 3% | 19.3 | 15.1 | 5.9 | 38% | 24.6 | 119.3 | 0.0 | 26.7/0.0/0.0 |
| Weak | Specialists | 11% | 17.8 | 15.9 | 5.7 | 36% | 20.9 | 100.8 | 0.0 | 22.6/0.0/0.0 |

## Cinder Herald

Config: 170 HP; Standard; recommended 8–12 rounds; enrage below 30% at ×1.20 damage.

| Pool | Party | Win % | Win rds | Loss rds | Deaths | Fail boss HP | HP lost/r | Heal/f | Adds/f | DoT/Stun/Frozen |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Strong | Balanced | 98% | 6.7 | 7.0 | 0.4 | 16% | 23.0 | 71.9 | 2.7 | 14.9/0.0/0.0 |
| Strong | Frontline | 96% | 7.7 | 6.8 | 0.8 | 14% | 27.3 | 85.4 | 3.1 | 19.6/0.0/0.0 |
| Strong | Glass | 99% | 4.8 | 5.0 | 0.3 | 0% | 19.9 | 0.1 | 2.0 | 10.0/0.0/0.0 |
| Strong | Sustain | 93% | 8.8 | 9.6 | 0.6 | 23% | 21.6 | 124.4 | 3.0 | 19.6/0.0/0.0 |
| Strong | Specialists | 86% | 6.3 | 5.6 | 1.6 | 10% | 29.0 | 60.5 | 2.3 | 15.1/0.0/0.0 |
| Typical | Balanced | 48% | 11.3 | 9.7 | 4.0 | 32% | 29.3 | 91.3 | 3.8 | 25.0/0.0/0.0 |
| Typical | Frontline | 35% | 12.3 | 10.8 | 5.0 | 29% | 30.2 | 92.2 | 4.1 | 27.9/0.0/0.0 |
| Typical | Glass | 72% | 6.8 | 8.1 | 3.0 | 15% | 26.0 | 0.9 | 2.9 | 15.8/0.0/0.0 |
| Typical | Sustain | 30% | 15.4 | 12.1 | 4.7 | 36% | 28.3 | 141.2 | 4.6 | 32.1/0.0/0.0 |
| Typical | Specialists | 38% | 9.3 | 8.8 | 4.7 | 27% | 29.7 | 51.0 | 3.4 | 21.0/0.0/0.0 |
| Weak | Balanced | 2% | 14.0 | 10.2 | 6.0 | 51% | 30.0 | 53.3 | 3.6 | 23.3/0.0/0.0 |
| Weak | Frontline | 0% | — | 10.0 | 6.0 | 55% | 31.3 | 43.8 | 3.7 | 24.4/0.0/0.0 |
| Weak | Glass | 2% | 10.0 | 8.8 | 6.0 | 32% | 26.7 | 1.0 | 3.4 | 18.1/0.0/0.0 |
| Weak | Sustain | 2% | 20.5 | 10.5 | 6.0 | 66% | 30.7 | 73.2 | 3.7 | 26.1/0.0/0.0 |
| Weak | Specialists | 1% | 13.0 | 8.8 | 6.0 | 49% | 31.1 | 32.3 | 3.0 | 19.4/0.0/0.0 |

## Rattle Captain

Config: 210 HP; Standard; recommended 8–12 rounds; enrage below 40% at ×1.35 damage.

| Pool | Party | Win % | Win rds | Loss rds | Deaths | Fail boss HP | HP lost/r | Heal/f | Adds/f | DoT/Stun/Frozen |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Strong | Balanced | 100% | 9.9 | — | 0.1 | — | 26.1 | 183.6 | 3.8 | 0.0/2.2/0.0 |
| Strong | Frontline | 100% | 10.8 | — | 0.1 | — | 26.9 | 215.0 | 4.1 | 0.0/2.3/0.0 |
| Strong | Glass | 86% | 7.2 | 11.7 | 1.8 | 11% | 22.5 | 4.3 | 3.3 | 0.0/1.1/0.0 |
| Strong | Sustain | 99% | 12.0 | 12.0 | 0.3 | 1% | 25.5 | 190.9 | 4.6 | 0.0/1.8/0.0 |
| Strong | Specialists | 97% | 9.3 | 15.3 | 0.4 | 11% | 28.2 | 181.8 | 3.8 | 0.0/2.0/0.0 |
| Typical | Balanced | 30% | 19.1 | 18.3 | 5.1 | 27% | 23.9 | 202.9 | 6.6 | 0.0/3.0/0.0 |
| Typical | Frontline | 32% | 17.5 | 15.3 | 5.0 | 20% | 27.0 | 176.8 | 5.8 | 0.0/3.2/0.0 |
| Typical | Glass | 13% | 9.6 | 12.1 | 5.5 | 24% | 19.7 | 4.0 | 4.6 | 0.0/1.2/0.0 |
| Typical | Sustain | 6% | 21.0 | 20.3 | 5.8 | 32% | 22.6 | 206.5 | 6.9 | 0.0/3.0/0.0 |
| Typical | Specialists | 21% | 15.0 | 15.3 | 5.3 | 27% | 24.6 | 145.7 | 4.9 | 0.0/2.1/0.0 |
| Weak | Balanced | 0% | — | 16.4 | 6.0 | 57% | 21.7 | 101.5 | 5.3 | 0.0/2.3/0.0 |
| Weak | Frontline | 0% | — | 14.3 | 6.0 | 53% | 25.9 | 102.2 | 4.9 | 0.0/2.6/0.0 |
| Weak | Glass | 0% | — | 12.1 | 6.0 | 49% | 19.6 | 2.5 | 4.6 | 0.0/1.1/0.0 |
| Weak | Sustain | 0% | — | 17.0 | 6.0 | 64% | 21.9 | 115.8 | 5.5 | 0.0/2.5/0.0 |
| Weak | Specialists | 0% | — | 14.1 | 6.0 | 56% | 23.7 | 91.5 | 3.6 | 0.0/1.7/0.0 |

## Barrow Warden

Config: 270 HP; Hard; recommended 10–14 rounds; enrage below 40% at ×1.30 damage.

| Pool | Party | Win % | Win rds | Loss rds | Deaths | Fail boss HP | HP lost/r | Heal/f | Adds/f | DoT/Stun/Frozen |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Strong | Balanced | 100% | 9.7 | — | 0.2 | — | 22.8 | 127.5 | 0.0 | 21.2/0.0/5.1 |
| Strong | Frontline | 100% | 10.8 | — | 0.5 | — | 25.0 | 150.3 | 0.0 | 26.9/0.0/5.7 |
| Strong | Glass | 96% | 7.1 | 8.8 | 0.9 | 15% | 21.0 | 0.7 | 0.0 | 12.3/0.0/3.3 |
| Strong | Sustain | 100% | 13.6 | — | 0.1 | — | 27.2 | 318.2 | 0.0 | 40.8/0.0/6.6 |
| Strong | Specialists | 100% | 9.4 | — | 0.5 | — | 23.0 | 120.0 | 0.0 | 19.7/0.0/3.5 |
| Typical | Balanced | 6% | 16.5 | 15.3 | 5.8 | 36% | 23.2 | 104.6 | 0.0 | 31.2/0.0/11.3 |
| Typical | Frontline | 4% | 14.0 | 14.1 | 5.9 | 35% | 24.7 | 80.8 | 0.0 | 31.6/0.0/10.9 |
| Typical | Glass | 12% | 9.7 | 10.4 | 5.7 | 34% | 22.3 | 0.8 | 0.0 | 17.9/0.0/6.3 |
| Typical | Sustain | 5% | 21.8 | 17.7 | 5.8 | 43% | 25.3 | 200.1 | 0.0 | 43.6/0.0/12.3 |
| Typical | Specialists | 10% | 18.7 | 15.4 | 5.7 | 37% | 21.4 | 99.8 | 0.0 | 29.7/0.0/10.3 |
| Weak | Balanced | 0% | — | 12.2 | 6.0 | 68% | 25.1 | 51.2 | 0.0 | 26.1/0.0/9.4 |
| Weak | Frontline | 0% | — | 12.0 | 6.0 | 67% | 26.2 | 46.6 | 0.0 | 26.9/0.0/10.2 |
| Weak | Glass | 0% | — | 9.2 | 6.0 | 61% | 25.5 | 0.6 | 0.0 | 16.4/0.0/6.5 |
| Weak | Sustain | 0% | — | 12.8 | 6.0 | 73% | 26.1 | 78.7 | 0.0 | 30.6/0.0/9.9 |
| Weak | Specialists | 0% | — | 13.5 | 6.0 | 65% | 23.2 | 68.8 | 0.0 | 26.0/0.0/9.4 |

## Bone Colossus

Config: 230 HP plus five gated memories; Hard; recommended 12–18 rounds; enrage below 40% at ×1.30 damage.

| Pool | Party | Win % | Win rds | Loss rds | Deaths | Fail boss HP | HP lost/r | Heal/f | Adds/f | DoT/Stun/Frozen |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Strong | Balanced | 100% | 13.1 | — | 0.2 | — | 29.7 | 310.3 | 5.0 | 0.1/0.1/0.2 |
| Strong | Frontline | 100% | 13.7 | — | 0.1 | — | 30.2 | 330.6 | 5.0 | 0.4/0.1/0.8 |
| Strong | Glass | 12% | 13.5 | 11.3 | 5.6 | 22% | 20.6 | 8.0 | 4.9 | 0.1/0.0/0.3 |
| Strong | Sustain | 97% | 14.0 | — | 1.1 | 26% | 22.9 | 225.4 | 5.0 | 0.8/0.0/0.5 |
| Strong | Specialists | 91% | 14.4 | 22.7 | 1.5 | 15% | 28.2 | 312.9 | 5.0 | 1.3/0.1/0.9 |
| Typical | Balanced | 33% | 17.6 | 15.6 | 4.7 | 25% | 20.5 | 234.8 | 5.0 | 5.0/0.2/1.9 |
| Typical | Frontline | 30% | 16.5 | 15.8 | 4.9 | 27% | 19.8 | 220.6 | 5.0 | 7.3/0.5/2.4 |
| Typical | Glass | 0% | — | 11.0 | 6.0 | 31% | 21.7 | 3.8 | 4.5 | 1.4/0.0/0.2 |
| Typical | Sustain | 19% | 17.7 | 18.7 | 5.2 | 25% | 19.7 | 228.7 | 4.9 | 11.9/0.3/1.8 |
| Typical | Specialists | 22% | 17.5 | 17.9 | 5.3 | 21% | 21.8 | 173.7 | 4.9 | 10.5/0.3/1.8 |
| Weak | Balanced | 0% | — | 12.7 | 6.0 | 33% | 23.4 | 105.7 | 4.6 | 14.8/0.2/0.7 |
| Weak | Frontline | 0% | — | 11.5 | 6.0 | 34% | 27.0 | 79.7 | 4.6 | 16.8/0.2/0.8 |
| Weak | Glass | 0% | — | 9.5 | 6.0 | 42% | 24.9 | 1.3 | 4.1 | 5.0/0.0/0.0 |
| Weak | Sustain | 1% | 19.0 | 11.7 | 6.0 | 34% | 27.0 | 98.8 | 4.6 | 20.6/0.2/0.5 |
| Weak | Specialists | 1% | 19.0 | 13.0 | 6.0 | 33% | 25.0 | 81.6 | 4.5 | 17.1/0.3/0.9 |

### Bone Memory outcomes

| Pool | Party | Broken/f | Detonated/f | Enraged rounds/f |
|---|---|---:|---:|---:|
| Strong | Balanced | 4.8 | 0.2 | 5.7 |
| Strong | Frontline | 4.6 | 0.4 | 6.8 |
| Strong | Glass | 3.8 | 0.9 | 5.6 |
| Strong | Sustain | 4.7 | 0.3 | 7.9 |
| Strong | Specialists | 4.0 | 1.0 | 7.3 |
| Typical | Balanced | 3.3 | 1.6 | 10.6 |
| Typical | Frontline | 2.8 | 2.0 | 12.3 |
| Typical | Glass | 2.9 | 1.2 | 2.9 |
| Typical | Sustain | 2.9 | 2.0 | 12.2 |
| Typical | Specialists | 2.1 | 2.7 | 9.2 |
| Weak | Balanced | 1.9 | 2.4 | 3.8 |
| Weak | Frontline | 1.6 | 2.5 | 3.0 |
| Weak | Glass | 2.2 | 1.3 | 0.6 |
| Weak | Sustain | 1.6 | 2.5 | 2.6 |
| Weak | Specialists | 1.1 | 2.9 | 3.8 |

## Metric definitions

- **Win rds / Loss rds:** mean rounds to that result. Timeout rounds are excluded.
- **Deaths:** mean final fallen party members; a revived soldier counts alive if alive at the end.
- **Fail boss HP:** mean boss health remaining across losses and timeouts.
- **HP lost/r:** actual party HP removed per played round after shields and block. It includes boss/add pressure, DoTs, reflect, and party backfires.
- **Heal/f:** actual party HP restored per fight, capped by missing HP.
- **Adds/f:** spawned units, including opening adds and Bone Memories.
- **DoT/Stun/Frozen:** occupied party seat-rounds per fight, sampled after enemy phases.

## Reproduce

```bash
npm run build -w @dungeon-grades/shared
npm run build -w server
npm run playtest:bosses -- --runs 100 --max-rounds 80
```

The reusable harness is `scripts/playtest-boss-matrix.mjs`.
