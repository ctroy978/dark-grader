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
| Enemy damage | **Minions first**, then boss (`hitEnemies`) |
| Party damage bonus | Legacy field; Runesinger no longer uses it (token rewrite instead) |
| Party shield | Opening **1d6** only if a living Shield Maiden is in the party; no stacking; Maiden **A** rerolls it; Maiden **F** dumps it to 0 |
| Personal block | Vanguard; absorbs boss/minion/DoT damage after grant; leftover **expires after boss phase** |
| Friendly fire | Many backfires **bypass** shield + block |
| Ice DoT | On claim: **downgrade grade one step** (A→B … D→F; F stays) before resolve |
| DoT ticks | Fire **4** (party stacks **capped at 2**) / Ice 3 / Poison splash **8** per stack / Slime 2 — see `DOT_STATS`. Boss party DoTs (clouds, minion on-hit) **ramp** (×1, ×2, ×3…) while left up |
| Inter-room | Living Vanguard heals party 20% max HP if any living Vanguard; reform 6 |

### Roster & HP

Full campaign roster = **21**. Names match art gender (see `server/src/seed/names.ts`).

| Archetype | Max HP | Count | Art / names |
|-----------|--------|-------|-------------|
| Vanguard | 55 | 2 | Male |
| Spearman | 52 | **2** | Male |
| ShieldMaiden | 48 | **2** | Female |
| FireMage | 38 | 3 | Male |
| Healer | 40 | 3 | Female |
| Archer | 36 | **3** | Female |
| Necromancer | 40 | **2** | Male |
| Thundercaller | 38 | 2 | Male |
| Runesinger | 40 | **2** | Female |

---

### Vanguard — personal block + hit (+ party block on good grades)

**Job (as coded):** tank spike damage; A–C also pad the whole line’s personal block this round.

| Grade | Effect |
|-------|--------|
| **A** | +**6** personal block, hit for **11**, **+3 block to whole party** |
| **B** | +**4** personal block, hit for **9**, **+2 block to whole party** |
| **C** | +**3** personal block, hit for **6**, **+1 block to whole party** |
| **D** | +**1** personal block, hit for **4** |
| **F** | No block, hit for **2** |

Personal block absorbs boss/minion/DoT damage after it is granted; leftover expires after the boss phase (so chips stay until the hit that spends them, not at the next token drop). Party block stacks on each living soldier’s personal block (includes self — so A self total block = 6+3 = 9). Not the same as party shield. Damage goes minions → boss.

---

### ShieldMaiden — striker + party shield (A refresh / F dump)

**Job (as coded):** steady damage ladder; **A** refreshes party shield; **F** kills the shield if it is up.

| Grade | Effect |
|-------|--------|
| **A** | Hit for **14**; **reroll party shield** to fresh **1d6** |
| **B** | Hit for **11** |
| **C** | Hit for **9** |
| **D** | Hit for **7** |
| **F** | If party shield active with remaining &gt; 0: set shield to **0** (inactive). If no shield: nothing |

Opening shield at fight start: **1d6** only when a living Maiden is in the party.

---

### FireMage — Wildfire AOE + boss Fire burn + Frozen thaw (risky mid grades)

**Job (as coded):** clear gap minions with multi-target fire, start a short **Fire** burn on the boss. **Only Fire Mage burns off Frozen** (SpreadingFrost). A/B also cleanse **Ice/Slime** on the same half of the line. Does **not** cleanse Fire/Poison (Healer) or Marks. C/D/F still punish the party.

**AOE rules:** minions first, then boss; A/B hit **up to 3** living enemies, C **up to 2**, D **1**. Empty slots are unused (no minions → single boss hit).

| Grade | Targets | Direct each | Boss Fire | Also |
|-------|---------|-------------|-----------|------|
| **A** | ≤**3** | **9** | **1** stack, **2** rounds | **Front** (1–3): burn **Frozen** + cleanse **Ice/Slime** |
| **B** | ≤**3** | **7** | **1** stack, **2** rounds | **Back** (4–6): burn **Frozen** + cleanse **Ice/Slime** |
| **C** | ≤**2** | **6** | **1** stack, **2** rounds | **2** friendly fire to pos **1 and 2** (bypasses shield/block) |
| **D** | **1** | **4** | — | **3** friendly fire to pos **1 and 2** (bypasses) |
| **F** | — | — | — | No enemy hit; **3** damage to **entire** living party (bypasses) |

Fire tick uses normal `DOT_STATS.Fire` (**4**/stack per DoT phase) on the **boss and any living minions** still standing after the hit (one-shots skip the chip). Minions show a Fire status under their portrait.

---

### Healer — restore HP + cleanse Fire / Ice / Poison

**Job (as coded):** stabilize line and strip the main damage DoTs. Does **not** clear Frozen (Fire Mage only), Slime, or Marks. F is catastrophic for the boss clock.

| Grade | Effect |
|-------|--------|
| **A** | Heal **all** living **+10** each; cleanse **Fire / Ice / Poison** on all |
| **B** | Heal **front** (pos 1–3) **+10** each; cleanse Fire/Ice/Poison on front |
| **C** | Heal **back** (pos 4–6) **+6** each; cleanse Fire/Ice/Poison on back |
| **D** | Heal **self** **+8** only (no cleanse) |
| **F** | Heal **boss** **+8** |

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

### Spearman — single-target thrust (stub; parry later)

**Job (as coded, Phase 0):** solid single-target damage ladder. Full kit (parry, front vulnerability, minion preference in pos 1) is planned on branch `feature/frontline-spearman-redesign`.

| Grade | Effect |
|-------|--------|
| **A** | Hit for **12** |
| **B** | Hit for **10** |
| **C** | Hit for **7** |
| **D** | Hit for **5** |
| **F** | Hit for **2** |

**2** Spearmen in the roster. **Doomcaller removed.**

---

### Necromancer — drain + heal lowest

**Job (as coded):** modest damage + triage heal; D/F self-risk.

| Grade | Effect |
|-------|--------|
| **A** | Drain hit **12**; heal **lowest-HP** ally **+10** |
| **B** | Drain **9**; heal lowest **+6** |
| **C** | Drain **6**; heal lowest **+3** |
| **D** | Drain **4**; **no** ally heal; **3** self-damage (bypass) |
| **F** | Hit **highest-HP** living ally for **10** (bypasses shield/block); no boss heal |

**2** Necromancers in the roster.

---

### Thundercaller — single lightning + Charge + stun

**Job (as coded):** solid single-target hits; **30% boss stun** (skips boss attack that round); **Charge** buffs allies’ next hit.

| Grade | Effect |
|-------|--------|
| **A** | Hit **14**; **30%** stun boss; **front (1–3)** get **Charge +3** (next enemy hit) |
| **B** | Hit **11**; **30%** stun boss; **back (4–6)** get **Charge +3** |
| **C** | Hit **9**; **30%** stun boss |
| **D** | Hit **6** |
| **F** | No hit; pick a **random other token-holder who has not acted yet** this drop — **30%** **Stun** (they **lose their attack**). Never targets Runesinger after she has already resolved; if nobody remains, fizzles. |

Charge stacks if applied multiple times; consumed on that soldier’s next `hitEnemies`. No chain lightning.

---

### Runesinger — rewrite tokens + heal holders (always acts first)

**Job (as coded):** change this drop’s claim grades for the whole group, then heal everyone who holds a token. **Always resolves before every other specialist** (including Thundercaller).

| Grade | Effect |
|-------|--------|
| **A** | Every claim worse than **A** becomes **A**; all token holders heal **+5** |
| **B** | Every claim worse than **B** becomes **B**; holders heal **+4** |
| **C** | The **single lowest** claim worse than **C** becomes **C**; holders heal **+3** |
| **D** | No grade rewrite; holders heal **+3** |
| **F** | Every claim shifts **down one** (A→B→C→D→F; F stays F); no heal |

Mutates `effectiveGrade` on shared claim objects so later actors use the new grades. **2** Runesingers in the roster (both resolve before other claimers).

---

### Rough A-damage comparison (no bonus, no curse)

Useful when weighing “who is just DPS?”

| Archetype | A damage-ish | Notes |
|-----------|--------------|--------|
| Archer | **10** each ≤3 foes (12 vs minion) | Arrow Storm AOE |
| FireMage | **9** each ≤3 foes + boss Fire 2r | Wildfire + Frozen thaw (A front) |
| Thundercaller | 14 + stun/charge | Single target |
| ShieldMaiden | 14 + shield 1d6 | |
| Necromancer | 12 + heal 10 | |
| Vanguard | 11 + block 6 self + 3 party | |
| Spearman | **12** ST | Stub thrust (parry later) |
| Runesinger | 0 direct | Token rewrite + heal |
| Healer | 0 direct | Heal 10 all + Fire/Ice/Poison |

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
