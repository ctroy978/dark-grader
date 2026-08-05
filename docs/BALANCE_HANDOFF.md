# Balance handoff — frontline redesign

> Historical snapshot: Bone Colossus results and Frost Archer recommendations below predate the Bone Memory redesign. Rerun the balance report before tuning the new five-gate encounter.

**Date:** 2026-08-02  
**Branch:** `feature/frontline-spearman-redesign`  
**Status:** Redesign Phases 0–8 implemented; **typical-pool mid/late rooms are too hard**. Soften tomorrow — do not re-litigate kit fantasy.

**Replay:** `npm run build -w @dungeon-grades/shared && npm run build -w server && node scripts/playtest-balance-report.mjs`

---

## What shipped (context)

| Area | Behavior |
|------|----------|
| Gap | Only **pos 1** + **Archers** hit minions |
| Minions | **Hard-focus magnet**; 2nd+ shot × `MULTI_MINION_FOCUS_MULT` (**1.5**) |
| Vanguard | Personal block only (no party pad) |
| Spearman | Parry A–D; front without parry ×1.35 boss dmg |
| Maiden | No free open; claim = one-round cover self + endangered |
| Cleanse | Healer Fire/Poison; Fire Mage Ice/Slime/Frozen |
| Thunder A | Rez once/soldier/fight @ ~10% HP + Dazed |
| Doomcaller | Removed; roster **21** (damage×3, support/frontline/healer×2) |

Boss **base** slam/cascade/HP tables were **not** retuned in the redesign pass.

---

## Playtest snapshot (smart magnet, TYPICAL pool)

Rough win rates from `playtest-balance-report.mjs` (16–20 seeds):

| Boss | Balanced | Frontline (Vg+Spear) | Design target (`BOSS_PLAN`) |
|------|----------|----------------------|----------------------------|
| Moss Grub | **100%** | 100% | ≥90% — **OK** |
| Ash Wraith | **~40%** | **~55%** | 70–85% — **low** |
| Cinder Herald | **~15–20%** | ~15% | 60–80% — **very low** |
| Rattle Captain | **~40%** | **~75%** | 55–75% — OK with tanks |
| Barrow Warden | **0%** | 0% | 45–65% — **broken hard** |
| Bone Colossus | **~0%** | ~0% | 35–55% on typical — **broken** |

Pool swing (Ash, balanced):

| Pool | Win rate |
|------|----------|
| GENEROUS (A/B heavy) | **~100%** |
| TYPICAL | **~40–50%** |
| WEAK (D/F heavy) | **0%** |

Colossus **GENEROUS** still **~100%** — kits work; **typical grades + attrition + adds** do not.

AFK vs smart on Ash: only a small gap (~31% vs ~38%). **Pool quality dominates** magnet skill for now.

---

## Suggested balance knobs (priority order)

### P0 — do first (biggest classroom impact)

| # | Knob | Where | Suggested change | Why |
|---|------|--------|------------------|-----|
| 1 | **Multi-minion focus tax** | `packages/shared/src/balance.ts` → `MULTI_MINION_FOCUS_MULT` | **1.5 → 1.25** (or only apply when ≥2 living minions *and* same target) | Magnet under 2 adds is a near-wipe; still teaches “don’t soft-magnet” without deleting the party |
| 2 | **Opening Maiden cover** | `server/src/engine/combat.ts` `startFight` | If living Maiden in line: seed **one-round cover** e.g. **remaining 3**, `coveredIds` = Maiden + mostLikelyToDie (or Maiden only) | Removing free 1d6 removed a huge buffer; weak open cover restores room-1–3 breathing room without old global soak |
| 3 | **Add HP / damage soft** | Boss TOML summons + `DEFAULT_SUMMONS` in `bosses.ts` | e.g. Cinder Imp **11→9 HP** or **3→2 dmg**; Frost Archer **4→3 dmg** or **12→10 HP**; Moss Mite leave as toy | Herald/Colossus typical fails largely on gap tax after gap gate |

### P1 — room curve

| # | Knob | Where | Suggested change | Why |
|---|------|--------|------------------|-----|
| 4 | **Ash HP or Cascade** | `ash_wraith.toml` max_hp / cascade bases in `bosses.ts` | Ash **210→~190**, or cascade pos1 **16→14** | Room 2 target ~70–85% attentive; currently ~40–55% |
| 5 | **Herald pressure** | `cinder_herald.toml` weights / imp params | Slightly fewer summon weight **or** #3 add soft | Primary add lesson should teach, not wipe ~80% of typical runs |
| 6 | **Warden frost** | `SPREADING_FROST_CHANCE` / line dmg in `balance.ts` | Chance **0.65→~0.5** or line dmg **11→9** | 0% wins; Frozen + no omnicleanse is correct fantasy but overtuned |

### P2 — optional polish

| # | Knob | Where | Note |
|---|------|--------|------|
| 7 | Spearman front vuln | `SPEARMAN_FRONT_VULN_MULT` (1.35) | Leave until P0 done; not the main win-rate lever |
| 8 | Spearman parry % | `SPEARMAN_PARRY_REDUCTION` | Same — keep for feel |
| 9 | Colossus on typical | Colossus HP 230 / archer tax | Soften **adds** first; only cut boss HP if still 0% after P0–P1 |
| 10 | Playtest AI | `scripts/playtest-balance-report.mjs` | Already parks tank on magnet when 2+ minions; re-run after each knob |

---

## What *not* to undo tomorrow

- Gap rule (front + Archer only) — core teaching  
- Color cleanse split (Healer vs Fire Mage)  
- Doomcaller removal  
- Magnet hard-focus *existence* (can soften tax, don’t go back to pure random scatter)  
- Thunder rez / Maiden “self + endangered” fantasy (can restore **weak** open cover)

---

## Verify after changes

```bash
npm run build -w @dungeon-grades/shared && npm run build -w server
node scripts/playtest-balance-report.mjs
npm test
```

**Soft targets for a “good enough” classroom day:**

| Room | Smart + TYPICAL win rate (aim) |
|------|--------------------------------|
| Moss Grub | ≥90% |
| Ash | 65–85% |
| Herald | 55–75% |
| Rattle | 50–70% |
| Warden | 40–60% |
| Colossus | 30–50% typical; still high on generous |

Also spot-check: GENEROUS still feels strong (not a slog); WEAK still dangerous.

---

## Related commits (branch tip area)

- Redesign stack: Spearman, gap gate, parry, Vanguard personal, cleanse split, Maiden cover, Thunder rez, minion focus  
- Playtest: `scripts/playtest-balance-report.mjs`  
- Full ability tables: `README.md`  

Tomorrow: tune knobs → re-run report → only then consider merge to `main`.
