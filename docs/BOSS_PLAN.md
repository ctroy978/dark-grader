# Dungeon Grades — Boss & Campaign Plan

**Status:** Design frozen for implementation (not all shipped)  
**Last updated:** 2026-07-15  
**Owner:** Troy / classroom deployment  

This document is the reference for the **6-room campaign**, boss identities, add rules, and new mechanics (Dominated, grade-sensitive thralls). When code and this file disagree after a feature ships, **update this file**.

Related: `docs/HANDOFF.md` (current runtime rules), `server/content/bosses/` (TOML packs), `server/src/engine/bosses.ts` (attack registry).

---

## 1. Product goals

| Goal | Meaning |
|------|---------|
| **Grade pool is the main student lever** | Weak test → hard dungeon; strong test → several party comps can win late rooms |
| **A few party combinations work** | Not every random 6, not a single meta forever |
| **Teach rules safely** | Room 1 allows real mistakes without deleting the roster |
| **Colossus is the final** | Full kit exam, not an early wall |
| **Attrition budget** | Students should usually still field a solid 6 for the final |

### Attrition guardrail

- Roster **22**, party **6**, deaths permanent until teacher reset  
- Soft target entering room 6: **≥ 10–12 living**  
- Soft death budget rooms 1–5: about **8–10** total for a typical attentive team  
- Understrength (1–5 living) is allowed; 0 living → teacher reset  

Inter-room Vanguard heal restores **HP only**, not lives.

---

## 2. Default campaign path (6 rooms)

```text
moss_grub
  → ash_wraith
  → cinder_herald
  → rattle_captain
  → barrow_warden
  → bone_colossus
```

| Room | Boss id | Role | Adds? |
|------|---------|------|-------|
| 1 | `moss_grub` | Tutorial / sandbox | Soft mites (toy) |
| 2 | `ash_wraith` | First real boss (position / DoT) | **None** |
| 3 | `cinder_herald` | **Primary add lesson** | Imps (real) |
| 4 | `rattle_captain` | Practice + magnet tax | Light scraps |
| 5 | `barrow_warden` | Dress rehearsal + grade signatures | Grave thrall (conditional) |
| 6 | `bone_colossus` | Final exam | Bone Archers (full) |

**Shipped today:** `moss_grub`, `ash_wraith`, `cinder_herald`, `bone_colossus`.  
**Default in code today:** 4 rooms **Moss Grub → Ash → Cinder Herald → Colossus**.

Teacher may still override `campaignLength` / `roomBossIds`.

---

## 3. Design principles for distinct bosses

HP + portrait alone is **not** enough. Each boss needs:

1. **One teaching sentence** (what students say after the fight)  
2. **Attack loadout** = subset + weights of shared attacks (not six full unique engines)  
3. **Add profile** (none / toy / real / conditional / full)  
4. Art, bubbles, SFX when available  

### Shared attack building blocks (existing)

| Id | Player read |
|----|-------------|
| `FrontSlam` | Front-biased smash |
| `LineAttack` | Even line pressure |
| `Cascade` | Front hard → back soft (big position lesson) |
| `CrushMagnet` | Punish magnet choice |
| `PoisonCloud` | Party poison DoT |
| `Regenerate` | Anti-stall heal (+ light pulse) |
| `Summon*` | Gap minions (must become **parameterized**) |

### Variation strategy

- Prefer **which attacks + weights + summon params**, not brand-new combat systems per boss  
- Medium extras worth adding: parameterized summon, Fire/Ice cloud variants, optional rear-only hit  
- Dominated + thrall grade AI are the **signature systems** for mid/late, not for the tutorial  

---

## 4. Balance targets (win rates)

Attentive magnet, mixed “typical” classroom pool unless noted.

| Room | Typical attentive | Weak pool | AFK |
|------|-------------------|-----------|-----|
| 1 Moss Grub | ≥ 90% | ≥ 75% | ≥ 40% (deaths likely) |
| 2 Ash | 70–85% | 50–65% | low |
| 3 Herald | 60–80% | 40–55% | low |
| 4 Captain | 55–75% | 35–50% | low |
| 5 Warden | 45–65% | 25–40% | rare |
| 6 Colossus | 35–55% **if pool is good** | &lt; 20% weak pool | rare |

**A+ package (already shipped for Ash / Colossus):**

| Knob | Value |
|------|--------|
| Ash `max_hp` | **210** |
| Colossus `max_hp` | **230** (glass summoner) |
| Bone Archer | **12 HP / 4 dmg** |
| Regenerate heal | **10** |
| Boss stun | Skips **boss + minions** |

Cascade / FireMage FF left for a later pass if needed.

---

## 5. Boss specs

### 5.1 Room 1 — Moss Grub (`moss_grub`) — **shipped**

**Teaching sentence:** “Learn the loop; deaths stick — keep the gap clear.”

| | |
|--|--|
| HP | **120–140** (start **130**) |
| Enrage | None (or &lt;20% @ 1.1× only if needed) |
| Attacks | Light `LineAttack` (**6**), light `FrontSlam` (**10 / 8 / 4** seats 1–3); **no Cascade**, **no Poison**, **no/low Regen**, Crush rare or absent |
| Adds | **Moss Mite** ×0–2 — **7 HP**, **3 dmg**; max 2; open with 1 |
| Feel | Clear in **5–8** rounds when attentive; **1–2 deaths** expected if students sleep or ignore mites |
| Art key | `moss_grub`, mites `moss_mite` |

Attentive teams should still usually win; the lesson is that party members **can die** before Ash.

---

### 5.2 Room 2 — Ash Wraith (`ash_wraith`) — **shipped**

**Teaching sentence:** “The front dies first; poison and cascade are real.”

| | |
|--|--|
| HP | **210** |
| Adds | **None** (keep pure boss readability after Grub) |
| Attacks | Full current kit minus summons: Line, Slam, **Cascade**, Crush, Poison, light Regen |
| Feel | First fight that can kill someone; still clearer than add tax |
| Boss DoTs | **PoisonCloud ramps** (intensity ×1→×4 while left up). Cleanse / heal pressure. |

Optional later: slight HP drop to 180–190 if room 1→2 still too steep.

---

### 5.3 Room 3 — Cinder Herald (`cinder_herald`) — **shipped**

**Teaching sentence:** “Clear the gap, then the boss.”

| | |
|--|--|
| HP | **170** |
| Adds | **Cinder Imp** — **11 HP**, **3 dmg** + **1 Fire** on hit; max 2; open with 1; summon when gap empty; **no free-volley** |
| Attacks | `FrontSlam`, `LineAttack`, **`FireCloud`** (party **Fire** DoT), `SummonCinderImps`; **no Cascade**, poison, or regen |
| Enrage | &lt;40% HP, **1.2×** |
| Feel | First **real** add fight; fire burn pressure; magnet on Archer/Fire when imps up |
| Art key | `cinder_herald`, imps `cinder_imp` |

Primary home for learning minions-first (`hitEnemies`) + party AOE (FireMage / Archer). Fire Cloud teaches **🔥 Fire** chips (distinct from Ash/Colossus poison).

---

### 5.4 Room 4 — Rattle Captain (`rattle_captain`)

**Teaching sentence:** “The magnet has a price.”

| | |
|--|--|
| HP | **~180–200** |
| Adds | 1–2 **Bone Scrap** weak adds (below imp tier) **or** single tougher scrap |
| Attacks | **CrushMagnet high weight**; Slam; low Cascade; little Regen |
| Feel | Practice adds + magnet drama without full final kit |

---

### 5.5 Room 5 — Barrow Warden (`barrow_warden`)

**Teaching sentence:** “Bad grades feed the grave; hexed allies hit who we mark with the magnet.”

| | |
|--|--|
| HP | **~200** |
| Adds | **Grave Thrall** (see §6) — conditional heal vs attack |
| Attacks | Poison + light Regen + moderate pressure; light Cascade optional; not full Colossus summon spam |
| Traits | `MindHex` (Dominated — §7), thrall grade AI |

Dress rehearsal: multi-threat, grade pool matters, still before final.

---

### 5.6 Room 6 — Bone Colossus (`bone_colossus`) — **shipped**

**Teaching sentence:** “Everything at once — and the test pool decides if you live.”

| | |
|--|--|
| HP | **230** |
| Adds | Bone Archers **12/4**, max 2, re-summon, free-volley when full (current) |
| Attacks | Full kit: Cascade, Crush, Slam, Line, Poison, Regen, Summon |
| Enrage | &lt;40% HP, **1.3×** |
| Stun | Boss **and** minions skip |

---

## 6. Grave Thrall (Barrow Warden add)

Evaluated on the **raw drop** (`pendingTokens` / tokens that fell) — **not** after Ice downgrade or Runesinger rewrite.

### Heal the Warden if any of:

| Condition |
|-----------|
| ≥ **1 F** |
| ≥ **1 C** and ≥ **1 D** |
| ≥ **3 C** |
| ≥ **2 D** (covers 2 or 3 D’s) |

**Otherwise** → thrall **attacks** (normal minion shot).

| Knob | v1 |
|------|-----|
| Heal amount | **8–10** (start **9**) |
| Attack damage | ~ thrall tier (**4–5**) |
| Count | Prefer **1** thrall living |
| On boss stun | Skip with boss |

**Student line:**  
> If the drop has an **F**, a **C and a D**, **three C’s**, or **two+ D’s**, the thrall **mends the Warden**. Otherwise it **fires**.

Tune heal size down if F-heavy classes make it every round.

---

## 7. Dominated / Mindhex (Option C)

**Home:** Barrow Warden (and/or Rattle Captain — prefer **one** boss so room 5 isn’t six rules). Recommended: **Warden only**.

### Apply

On resolving a claim, if boss has trait **MindHex**:

| Effective grade | Proc chance |
|-----------------|-------------|
| **F** | **30%** |
| **D** | **20%** |
| A–C | — |

- Use **effective grade** (after Ice; after Runesinger if that grade is what they resolve).  
- Duration: **2** party phases (refresh on re-apply).  
- Chip: Mark-like **Dominated / Hex**.

### While Dominated (each party phase)

1. **No token required** for the thrall action.  
2. **Forced strike** at **C-force** damage — **flat thrall hit**, **not** full archetype × grade C resolution.  
   - v1 damage: **7**, **friendly fire** (bypasses party shield + block).  
3. **Target = living soldier under the Token Magnet.**  
   - If the Dominated soldier **is** the magnet target → no self-hit; hit nearest other living ally by position (or skip if alone).  
4. **Normal kit suppressed** while Dominated (no normal claim effect).  
5. Duration ticks down after the thrall strike (or end of party phase); clear at 0.

### Cleanse

| Source | Clears? |
|--------|---------|
| Healer A/B/C (Mark clear) | **Yes** |
| Doomcaller strip Marks | **Yes** |
| FireMage DoT cleanse | **No** |
| Duration expiry | **Yes** |

### Action order (critical)

Within party phase:

1. Runesinger rewrites  
2. Other claimers including **Healer/Doom cleanse**  
3. **Dominated thrall strikes** (so cleanse can save the magnet target same drop)

### Presentation

- Apply bubble: *“The will… breaks…”*  
- Strike: *“Strikes the magnet!”*  
- Boss blurb: D/F may Dominate; hexed soldiers strike the magnet each round until cleansed or 2 rounds pass.

---

## 8. Implementation plan (slices)

Do **not** ship all six fantasy kits + Dominated in one PR.

### Slice A — Foundation (do first) — **mostly shipped**

1. Parameterized summon attack (TOML: minion id/name, maxHp, damage, maxCount, freeVolley yes/no). ✅  
2. Default campaign: length **4** (Grub → Ash → Herald → Colossus); full 6 still open.  
3. **Moss Grub** TOML + weak attacks + soft mites. ✅  
4. Ash stays room 2; Colossus final in default path. ✅  
5. Prefer real mid bosses over stubs.  

### Slice B — Add ladder

1. **Cinder Herald** + imps (no free-volley). ✅  
2. **Rattle Captain** + crush-weighted kit + light scraps.

### Slice C — Signature systems

1. Grave Thrall heal-on-drop-composition.  
2. **Dominated** status + cleanse + magnet thrall strikes + order.  
3. **Barrow Warden** full pack.

### Slice D — Polish

- Art under `client/public/art/{key}/`  
- Audio packs / ElevenLabs  
- FX tags — **not optional for DoTs** (see below)  
- Balance sim pass per room targets in §4  

### When visual FX work starts — DoT readability (required)

Boss DoTs (especially **ramping** Poison/Fire) only teach if the class notices them. Chips alone are too weak for shared-screen play.

| Need | Notes |
|------|--------|
| **Persistent on-body signal** | Portrait/card tint or aura for each active DoT type while duration &gt; 0 |
| **Type color** | Poison lime/green, Fire orange, Ice blue, and later Slime — match `statusUi` |
| **Ramp intensity** | Aura/pulse strength scales with `escalationStep` so “getting worse” is visible without reading `⬆3` |
| **Apply / tick / cleanse** | Distinct pops; tick can reuse existing `poison-tint` / `fire-flash` tags but idle state must also show |
| **Boss-held DoTs** | Transfer success should be obvious on the boss portrait too |

Defer full particles; prefer CSS/class tints + short cue FX driven by status + presentation tags.

### Explicitly deferred

- Overflow damage through minions onto boss  
- Full particle FX (beyond DoT readability + light combat pops)  
- FireMage FF redesign (unless sims demand)  
- Cascade global retune (unless sims demand)  
- Dominated on Colossus / tutorial  

---

## 9. Content / art keys (planned)

| Boss / unit | Art folder key |
|-------------|----------------|
| Moss Grub | `moss_grub` |
| Moss Mite | `moss_mite` |
| Ash Wraith | `ash_wraith` (exists) |
| Cinder Herald | `cinder_herald` |
| Cinder Imp | `cinder_imp` |
| Rattle Captain | `rattle_captain` |
| Bone Scrap (add) | `bone_scrap` (or reuse soft archer art early) |
| Barrow Warden | `barrow_warden` |
| Grave Thrall | `grave_thrall` |
| Bone Colossus | `bone_colossus` (exists) |
| Bone Archer | `bone_archer` (exists) |

Poses: `standing`, `attack`, `hit`, `death` (death optional for adds).

---

## 10. Open decisions (small)

| Topic | Current lean |
|-------|----------------|
| Dominated on Captain vs Warden only | **Warden only** |
| Thrall heal 8 vs 10 | Start **9** |
| Dominated duration 2 vs 3 | **2** |
| Stub mid rooms vs block path until Herald exists | Prefer **Grub + real path** quickly; Herald next |
| Parameterize minion art key in TOML | Yes |

---

## 11. Changelog

| Date | Note |
|------|------|
| 2026-07-15 | Initial plan from playtest + design discussion: 6-room arc, A+ Colossus/Ash numbers, thrall grade heal, Dominated Option C, implementation slices |
| 2026-07-16 | Moss Grub room 1 shipped: TOML + light attacks + parameterized mite summon; default path Grub → Ash → Colossus |
| 2026-07-16 | Cinder Herald room 3 shipped: FrontSlam/Line + Cinder Imps (11/3, no free-volley, open 1); default path 4 rooms Grub → Ash → Herald → Colossus |
| 2026-07-16 | Herald fire theme: `FireCloud` attack applies party Fire DoT; trait `Fire`; not poison |
| 2026-07-16 | Cinder Imps option A: 3 dmg + 1 Fire on hit (`minion_on_hit_dot` in TOML) |

---

*End of boss plan. Update when a slice ships or numbers change after sims.*
