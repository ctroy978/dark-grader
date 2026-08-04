# GradeForge

Browser-based classroom dungeon crawler. Test letter grades (A–F) become power tokens that a party of fantasy soldiers claim via the **Token Magnet**.

**Product name:** GradeForge (G and F capitalized). Package names may still say `dungeon-grades`.

Built for a single classroom server (LAN / firewall). One shared Chromebook per team.

Marketing site (no code required): **How to Play**, **Characters**, and **Bosses** codex pages on the client home experience.

## Stack

- **Client:** React + TypeScript + Vite + Tailwind
- **Server:** Node + Fastify + Socket.IO
- **DB:** JSON files under `server/data/` (classroom + per-team state)
- **Shared:** combat types, magnet math, balance tables

## Quick start

```bash
npm install
npm run build -w @dungeon-grades/shared
npm run dev:server   # http://localhost:3001
npm run dev:client   # http://localhost:5173
```

Default teacher PIN: `teacher` (override with `TEACHER_PIN` env var).

## Windows

The server and client are plain Node/TypeScript and run on Windows. Use **Node.js 20+**. Install dependencies **on the Windows machine** (`npm install` pulls the correct platform binaries). Do not copy `node_modules` from Linux or macOS.

`npm run dev` starts both processes with a Unix-style `&` background, which does not work reliably in **cmd.exe**. On Windows, use two terminals instead:

**Terminal 1 — API + game engine**

```bat
npm install
npm run build -w @dungeon-grades/shared
npm run dev:server
```

**Terminal 2 — UI**

```bat
npm run dev:client
```

Then open **http://localhost:5173**. The Vite dev server proxies `/api` and Socket.IO to **http://localhost:3001**.

| Need | How |
|------|-----|
| Teacher PIN / other env | Put vars in a repo-root `.env` (same as other platforms), or set them in the shell before starting the server |
| Production | `npm run build` then `npm start` (serves the compiled server; client is built under `client/dist`) |
| Classroom LAN | Server listens on `0.0.0.0:3001` by default; allow Node through Windows Firewall on ports **3001** and **5173** (dev) if stations cannot connect |
| Same workflow as Linux | Optional: run the repo under **WSL** and follow the Quick start section as written |

No ElevenLabs key is required to run the game. SFX/VO are served from the checked-in files under `server/data/audio/`.

### Audio generation (development only)

Classroom runtime does **not** need an ElevenLabs API key. Clips live on disk under `server/data/audio/` and are served as static MP3s.

Use a key only when **authoring or regenerating** those assets:

```bash
# repo-root .env (see .env.example) — developers only
ELEVENLABS_API_KEY=...
# optional:
# ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM

npm run audio:generate
```

If a clip is missing and a key is configured, the server can also generate it on first request. Without a key, missing clips simply 404; the game still runs.

### Classroom flow

1. **Teacher** → login → **create classrooms** (e.g. Period 1, Period 3).
2. In a classroom → **Create team**(s) → share invite codes with student stations.
3. After a test → paste **grades for Room N** → **Open room N**. Only that room is playable.
4. **Students** enter the invite code (no classroom picker) → form a party of 6 → enter the open room.
5. Victory → camp → next room stays **locked** until the teacher enters the next test’s grades and opens it.
6. Each classroom has its own grades, open rooms, pause flag, and teams.

Default path: **Moss Grub → Ash → Herald → Rattle Captain → Barrow Warden (placeholder) → Bone Colossus** (6 rooms).

See [`docs/MULTI_CLASSROOM_PLAN.md`](docs/MULTI_CLASSROOM_PLAN.md) for the full multi-classroom design.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev:server` | API + game engine |
| `npm run dev:client` | UI with proxy to API |
| `npm test` | Magnet + combat unit tests |
| `npm run build` | Production build all packages |
| `npm start` | Run compiled server |

## Docs

- [`docs/HANDOFF.md`](docs/HANDOFF.md) — **start here after a context restart** (current rules, run, open issues)
- [`docs/DESIGN.md`](docs/DESIGN.md) — architecture, balance, PR plan (may lag code)
- Specs in repo root / `docs/`

---

## Character abilities (review reference)

**Source of truth:** `server/src/engine/specialists.ts` (+ shared HP/DoT in `packages/shared/src/balance.ts`).  
Playbook UI text: `packages/shared/src/playbook.ts`.  
This section is for design review — update it when abilities change.

### Shared combat rules (affects every kit)

| Rule | Current behavior |
|------|------------------|
| Party | 6 of **22** roster soldiers; campaign HP persists |
| Tokens / round | 6/5/4 living → 3 tokens; 3 → 2; 2/1 → 1 (`tokensForLivingCount`) |
| Magnet | Only control: raise claim odds on one living position (1–6) |
| Claim rules | **Magnet always claims one token** (which grade is random among the drop). Remaining tokens: living party **except magnet**, weighted by proximity (adjacent 2× far). Each soldier ≤1 token. |
| Resolve order | Claims → **Runesinger first** (rewrites tokens) → other claimers **front → back** → DoTs → boss |
| Enemy damage | **Gap rule:** only **pos 1** and **Archers** hit minions; others boss-only. **Minions hard-focus the magnet**; 2nd+ minion shot ×1.5 |
| Party damage bonus | Legacy field; Runesinger no longer uses it (token rewrite instead) |
| Party cover | **No free open.** Shield Maiden claim raises one-round cover (self + most endangered); size by grade; **F** dumps; expires after boss phase |
| Personal block | Vanguard; absorbs boss/minion/DoT damage after grant; leftover **expires after boss phase** |
| Friendly fire | Many backfires **bypass** shield + block |
| Ice DoT | On claim: **downgrade grade one step** (A→B … D→F; F stays) before resolve |
| DoT ticks | Fire **4** (party stacks **capped at 2**) / Ice 3 / Poison splash **8** per stack / Slime 2 — see `DOT_STATS`. Boss party DoTs (clouds, minion on-hit) **ramp** (×1, ×2, ×3…) while left up |
| Inter-room | After a clear: living soldiers recover 30% of **missing** HP (no Vanguard gate); reform 6 |

### Roster & HP

Full campaign roster = **21**. Names match art gender (see `server/src/seed/names.ts`).

| Archetype | Max HP | Count | Art / names |
|-----------|--------|-------|-------------|
| Vanguard | 55 | 2 | Male |
| Spearman | 52 | **2** | Male |
| ShieldMaiden | 48 | **2** | Female |
| FireMage | 38 | 3 | Male |
| Healer | 40 | **2** | Female |
| Archer | 36 | **3** | Female |
| Necromancer | 40 | **2** | Male |
| Thundercaller | 38 | **3** | Male |
| Runesinger | 40 | **2** | Female |

---

### Vanguard — Last Stand + personal block + hit

**Job (as coded):** front leader. **A/B** grant **Last Stand** (next lethal hit → **1 HP** once). Small personal block still applies; leftover block/wards expire after the boss phase.

| Grade | Effect |
|-------|--------|
| **A** | **Last Stand** on **all** living; +**4** personal block; hit **11** |
| **B** | **Last Stand** on **front** (1–3); +**3** personal block; hit **9** |
| **C** | +**3** personal block; hit **6** |
| **D** | +**1** personal block; hit **4** |
| **F** | No block; hit **2** |

Gap rule: can hit minions only from pos 1.

---

### ShieldMaiden — striker + cover + Fire/Poison cleanse

**Job (as coded):** hit + one-round cover (self + most endangered) + **cleanse Fire/Poison** (moved from Healer). **No free opening shield.**

| Grade | Hit | Cover | Cleanse Fire/Poison |
|-------|-----|-------|---------------------|
| **A** | **14** | **8** | **All** living |
| **B** | **11** | **6** | **Front** (1–3) |
| **C** | **9** | **4** | **Back** (4–6) |
| **D** | **7** | **3** | **Self** only |
| **F** | — | Dump cover to **0** | — |

Uncovered seats take full damage even while cover is active.

---

### FireMage — Wildfire AOE + boss Fire burn + Frozen thaw

**Job (as coded):** multi-target fire + short **Fire** burn on the boss. **Gap minions only from seat 1** (same gap rule as non-Archers; mid/back Wildfire hits boss only). **Only Fire Mage burns off Frozen** (SpreadingFrost). A/B also cleanse **Ice/Slime** on that half of the line. Does **not** cleanse Fire/Poison (**Shield Maiden**) or Marks. **D/F** still punish the party (**C** does not).

**AOE rules:** minions first when allowed, then boss; A/B hit **up to 3** living enemies, C **up to 2**, D **1**. Empty slots unused (no minions / not in seat 1 → single boss hit).

| Grade | Targets | Direct each | Boss Fire | Also |
|-------|---------|-------------|-----------|------|
| **A** | ≤**3** | **9** | **1** stack, **2** rounds | **Front** (1–3): burn **Frozen** + cleanse **Ice/Slime** |
| **B** | ≤**3** | **7** | **1** stack, **2** rounds | **Back** (4–6): burn **Frozen** + cleanse **Ice/Slime** |
| **C** | ≤**2** | **6** | **1** stack, **2** rounds | No friendly fire |
| **D** | **1** | **4** | — | **3** friendly fire to pos **1 and 2** (bypasses) |
| **F** | — | — | — | No enemy hit; **3** damage to **entire** living party (bypasses) |

Fire tick uses normal `DOT_STATS.Fire` (**4**/stack per DoT phase) on the **boss and any living minions** still standing after the hit (one-shots skip the chip). Minions show a Fire status under their portrait.

**Party Poison (Ash / Colossus clouds)** — distinct from Fire: one **magnet-weighted party splash** each DoT phase (`8 × stacks × intensity`). Stacks **cap at 2**; intensity **caps at 3** (max splash **48**). Boss will not cast **PoisonCloud** again while any living ally still has Poison.

---

### Healer — instant triage (no cleanse)

**Job (as coded):** emergency HP ladder. Uncharged: **no** cleanse (Maiden is primary Fire/Poison; Fire Mage = Ice/Slime/Frozen). **Life Power** charge: **normal heal still applies**; Fire/Poison seats also **wash** (no purple bonus); clean seats get purple bonus. F heals the boss.

| Grade | Effect |
|-------|--------|
| **A** | Heal **all** living **+14** each |
| **B** | Heal the **two lowest-HP** allies **+14** each |
| **C** | Heal the **single lowest-HP** ally **+18** |
| **D** | Tiny **full-party** heal **+3** each |
| **F** | Heal **boss** **+8** |

**2** Healers in the roster (back seat only — exclusive with Runesinger).

---

### Archer — Arrow Storm AOE (minion bonus)

**Job (as coded):** multi-target volleys so one good token can clear the gap without parking the whole drop on DPS. Lower per-target damage than the old single-target kit; small **minion bonus** so adds die first.

**AOE rules:** same as FireMage — minions first, then boss; A/B ≤**3**, C ≤**2**, D **1**.

| Grade | Targets | vs boss each | vs minion each |
|-------|---------|--------------|----------------|
| **A** | ≤**3** | **10** | **12** (+2) |
| **B** | ≤**3** | **8** | **9** (+1) |
| **C** | ≤**2** | **6** | **7** (+1) |
| **D** | **1** | **4** | **5** (+1) |
| **F** | **1** | Hit for **3** + **1–2** to a random ally (bypasses shield/block); no minion bonus |

---

### Spearman — Last Stand + thrust + Parry

**Job (as coded):** front-line striker. **A/B** also grant **Last Stand** (A all / B front). **A–D** grant **Parry** (reduce boss damage to self this round). **Pos 1 without Parry** takes **×1.35** boss damage. Parry + unused Last Stand expire after the boss phase.

| Grade | Thrust | Parry | Last Stand |
|-------|--------|-------|------------|
| **A** | **12** | **70%** | **All** living |
| **B** | **10** | **50%** | **Front** (1–3) |
| **C** | **7** | **30%** | — |
| **D** | **5** | **15%** | — |
| **F** | **2** | **None** | — |

**2** Spearmen in the roster.

---

### Necromancer — drain + Life Power (cleanse charge)

**Job (as coded):** modest boss drain; **A–C** grant **Life Power** to the living **Healer or Runesinger**. On their **next** heal/hymn: **normal mend still applies**; seats with **Fire/Poison** also **wash** (no purple bonus); clean seats get purple **+N**. Purple rain FX on both. **Maiden remains primary one-token cleanse.** No stacking; until used. **No direct ally heal.**

| Grade | Effect |
|-------|--------|
| **A** | Drain **12**; Life Power **+6** on support’s next action |
| **B** | Drain **9**; Life Power **+4** |
| **C** | Drain **6**; Life Power **+2** |
| **D** | Drain **4**; **3** self-damage (bypass); no Life Power |
| **F** | Hit **highest-HP** living ally for **10** (bypasses shield/block) |

**2** Necromancers in the roster.

---

### Thundercaller — lightning + Charge + stun + A rez

**Job (as coded):** solid single-target hits; **30% boss stun**; **Charge** buffs allies’ next hit. **A** can **revive** a dead ally first if any eligible.

| Grade | Effect |
|-------|--------|
| **A** | **Hit 14**; **30%** stun boss; **front Charge +3**. **Or** if someone is down (and not already rezzed this fight): **shock-restart their heart** at **~10% HP + Last Stand** — they are **Dazed** and **skip their next claim**; no lightning that resolve. Once per soldier per fight |
| **B** | Hit **11**; **30%** stun boss; **back (4–6)** get **Charge +3** |
| **C** | Hit **9**; **30%** stun boss |
| **D** | Hit **6** |
| **F** | No hit; pick a **random other token-holder who has not acted yet** this drop — **30%** **Stun**. |

Once per soldier per boss fight. Charge stacks; consumed on next `hitEnemies`.

**3** Thundercallers in the roster.

---

### Runesinger — rewrite tokens + hymn HoT (always acts first)

**Job (as coded):** change this drop’s claim grades, then apply a **slow gold hymn HoT** (no cleanse, no instant holder snacks). **Always resolves before every other specialist**. **Back seat only** — exclusive with Healer.

| Grade | Token rewrite | HoT (3 ticks after damage DoTs) |
|-------|---------------|--------------------------------|
| **A** | All claims **+2** (F→C, D→B, … cap A) | All living **+4**/tick (~12 total) |
| **B** | F/D→**C**, C→**B**, B/A stay | Front **+4**/tick |
| **C** | Worst claim → **C** (front wins ties) | Back **+3**/tick |
| **D** | None | Self **+3**/tick |
| **F** | All claims **−1** (F stays F) | None |

HoT streams are independent (max **2** per soldier). Mutates `effectiveGrade` so later actors use the new grades.

---

### Rough A-damage comparison (no bonus, no curse)

Useful when weighing “who is just DPS?”

| Archetype | A damage-ish | Notes |
|-----------|--------------|--------|
| Archer | **10** each ≤3 foes (12 vs minion) | Arrow Storm AOE |
| FireMage | **9** each ≤3 foes + boss Fire 2r | Wildfire + Frozen thaw (A front) |
| Thundercaller | 14 + stun/charge | Single target |
| ShieldMaiden | 14 + cover + Fire/Poison cleanse | |
| Necromancer | 12 + Life Power on support | |
| Vanguard | 11 + Last Stand A/B | |
| Spearman | **12** ST + Last Stand A/B + parry | |
| Runesinger | 0 direct | Token rewrite + hymn HoT |
| Healer | 0 direct | Instant triage (no cleanse) |

---

### Design review notes (fill in)

Use this space when you decide changes. Leave blank until then.

| Archetype | Magnet when… | Weakness / gap | Decision |
|-----------|--------------|----------------|----------|
| Vanguard | | | |
| ShieldMaiden | | | |
| FireMage | | | |
| Healer | | | |
| Archer | | | |
| Spearman | | | |
| Necromancer | | | |
| Thundercaller | | | |
| Runesinger | | | |

## License

Private classroom project.
