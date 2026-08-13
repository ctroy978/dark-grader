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
| Production | See [`docs/DEPLOY.md`](docs/DEPLOY.md). `npm run build` then `npm start` (Node serves the API, Socket.IO, **and** `client/dist`) |
| Classroom LAN | Dev listens on `0.0.0.0:3001`; production behind nginx binds `127.0.0.1:3001` |
| Same workflow as Linux | Optional: run the repo under **WSL** and follow the Quick start section as written |

Combat SFX are static MP3s under `server/data/audio/`. Missing clips 404; the game still runs.

### Classroom flow

1. **Teacher** → login → **create classrooms** (e.g. Period 1, Period 3).
2. In a classroom → **Create team**(s) → share invite codes with student stations.
3. After a test → paste **grades for Room N** → **Open room N**. Only that room is playable.
4. **Students** enter the invite code (no classroom picker) → form a party of 6 → enter the open room.
5. Victory → camp recovery → choose one reward → next room stays **locked** until the teacher enters the next test’s grades and opens it.
6. Each classroom has its own grades, open rooms, pause flag, and teams.

### Academic Honors scoring

Each cleared room can advance three persistent team badge tracks:

- **Campaign Honors** — defeat the room boss.
- **Preservation Honors** — clear without a permanent roster loss across all attempts at that room.
- **Tempo Honors** — win on or before the boss's configured Tempo round limit.

The running score is the sum of the three ranks (maximum **18** in the default six-room campaign). Students see their current badges in the lobby and their upgrades on victory; the teacher dashboard shows totals plus a room-by-room award matrix. Award names and exact rules are defined in [`docs/SCORING_SYSTEM_PLAN.md`](docs/SCORING_SYSTEM_PLAN.md).

Badge PNGs are drop-in assets under `client/public/art/badges/{campaign,preservation,tempo}/`: `base.png` for unranked, then `1.png` through `6.png`. Missing images use a CSS fallback.

### Relic rewards

Every non-final victory offers three classroom-deterministic relics plus an
always-available Healing Potion. The team chooses exactly one:

- **Bulwark Sigil** — first direct boss hit each fight deals 6 less damage.
- **Ember Whetstone** — first damaging action each fight adds 4 damage to its first hit.
- **Purity Charm** — first new finite damaging status each fight loses one tick.
- **Healing Potion** — immediately restore one living soldier to maximum HP in camp; consumed on use and occupies no relic slot.

A soldier can carry only one permanently bound relic. Relics work only while
their bearer is deployed and are destroyed immediately if the bearer dies,
including before a later Thundercaller revival. Reward rules and implementation
details are in [`docs/RELIC_SYSTEM_PLAN.md`](docs/RELIC_SYSTEM_PLAN.md).

Default path: **Moss Grub → Ash → Herald → Rattle Captain → Barrow Warden → Bone Colossus** (6 rooms).

See [`docs/MULTI_CLASSROOM_PLAN.md`](docs/MULTI_CLASSROOM_PLAN.md) for the full multi-classroom design.

## Production (nginx classroom server)

The game is meant to sit on one building server behind nginx at **`/gradeforge/`**.
Students open `http://<server>/gradeforge/#/join`; the teacher opens
`http://<server>/gradeforge/#/teacher`.

Full walkthrough (env, systemd, nginx WebSocket proxy, backups, pull/rebuild):
[`docs/DEPLOY.md`](docs/DEPLOY.md). Copy-ready files live in `deploy/`.

```bash
cp .env.example .env          # set TEACHER_PIN on the classroom server
npm install && npm run build
node scripts/deploy-check.mjs
# then install deploy/gradeforge.service + deploy/nginx.conf
```

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev:server` | API + game engine |
| `npm run dev:client` | UI with proxy to API |
| `npm test` | Magnet + combat unit tests |
| `npm run build` | Production build all packages |
| `npm start` | Run compiled server (also serves `client/dist`) |
| `npm run deploy:check` | Verify the tree is ready to start behind nginx |

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
| Party | 6 of **23** roster soldiers; campaign HP persists |
| Tokens / round | 6/5/4 living → 3 tokens; 3 → 2; 2/1 → 1 (`tokensForLivingCount`) |
| Magnet | Only control: raise claim odds on one living position (1–6) |
| Claim rules | **Magnet always claims one token** (which grade is random among the drop). Remaining tokens: living party **except magnet**, weighted by proximity (adjacent 2× far). Each soldier ≤1 token. |
| Resolve order | Claims → **Runesinger first** (rewrite + rune attack) → other claimers **front → back** → damaging DoTs → Lifebinder renewal → boss |
| Enemy damage | **Gap rule:** fixed positions **1–3** hit minions first; positions **4–6** hit the boss only. **Archers** can hit minions from any seat. **Minions hard-focus the magnet**; 2nd+ minion shot ×1.5 |
| Party damage bonus | Legacy field; Runesinger no longer uses it (token rewrite instead) |
| Party cover | **No free open.** Shield Maiden claim raises one-round cover (self + most endangered); size by grade; **F** dumps; expires after boss phase |
| Personal block | Vanguard; absorbs boss/minion/DoT damage after grant; leftover **expires after boss phase** |
| Friendly fire | Many backfires **bypass** shield + block |
| Ice DoT | On claim: **downgrade grade one step** (A→B … D→F; F stays) before resolve |
| DoT ticks | Fire **4** (party stacks **capped at 2**) / Ice 3 / Poison splash **8** per stack / Slime 2 — see `DOT_STATS`. Boss party DoTs (clouds, minion on-hit) **ramp** (×1, ×2, ×3…) while left up |
| Inter-room | After a clear: living soldiers recover 30% of **missing** HP (no Vanguard gate); reform 6 |

### Roster & HP

Full campaign roster = **23**. Names match art gender (see `server/src/seed/names.ts`).

| Archetype | Max HP | Count | Art / names |
|-----------|--------|-------|-------------|
| Vanguard | 55 | 2 | Male |
| Spearman | 52 | **2** | Male |
| ShieldMaiden | 48 | **2** | Female |
| FireMage | 38 | 3 | Male |
| Thornmender (`Healer`) | 40 | **2** | Female |
| Archer | 36 | **3** | Female |
| Necromancer | 40 | **2** | Male |
| Thundercaller | 38 | **3** | Male |
| Runesinger | 40 | **2** | Female |
| Grovekeeper (`Lifebinder`) | 40 | **2** | Female |

---

### Vanguard — Last Stand + personal block + hit

**Job (as coded):** defensive anchor. **A/B** grant **Last Stand** (next lethal hit → **1 HP** once). Strong personal block applies on A–D; leftover block/wards expire after the boss phase.

| Grade | Effect |
|-------|--------|
| **A** | **Last Stand** on **all** living; +**8** personal block; hit **11** |
| **B** | **Last Stand** on **front** (1–3); +**6** personal block; hit **9** |
| **C** | +**5** personal block; hit **6** |
| **D** | +**3** personal block; hit **4** |
| **F** | No block; hit **2** |

Gap rule: positions 1–3 hit minions first; positions 4–6 hit the boss.

---

### ShieldMaiden — conditional striker + cover + Fire/Poison cleanse

**Job (as coded):** one-round cover (self + most endangered), plus either a hit or **Fire/Poison cleanse** (moved from Healer). If her cleanse scope contains Fire/Poison, the cleanse **replaces** her hit; otherwise she attacks. **No free opening shield.**

| Grade | Hit | Cover | Cleanse Fire/Poison |
|-------|-----|-------|---------------------|
| **A** | **14 if no cleanse** | **8** | **All** living |
| **B** | **11 if no cleanse** | **6** | **Front** (1–3) |
| **C** | **9 if no cleanse** | **4** | **Back** (4–6) |
| **D** | **7 if no cleanse** | **3** | **Self** only |
| **F** | — | Dump cover to **0** | — |

Uncovered seats take full damage even while cover is active.

---

### FireMage — Wildfire AOE + boss Fire burn + cold weather cleanse

**Job (as coded):** multi-target fire + short **Fire** burn on the boss. Seats **1–3** rake gap minions first; seats **4–6** hit the boss only. A/B cleanse **Chill / Ice / Slime** on that half of the line. **Does not** thaw chain **Frozen** — land an **A** on a frozen hero to crack all ice blocks (Warden). Does **not** cleanse Fire/Poison (**Shield Maiden**) or Marks. **D/F** still punish the party (**C** does not).

**AOE rules:** minions first when allowed, then boss; A/B hit **up to 3** living enemies, C **up to 2**, D **1**. Back-row non-Archers use one boss hit.

| Grade | Targets | Direct each | Boss Fire | Also |
|-------|---------|-------------|-----------|------|
| **A** | ≤**3** | **9** | **1** stack, **2** rounds | **Front** (1–3): cleanse **Chill/Ice/Slime** |
| **B** | ≤**3** | **7** | **1** stack, **2** rounds | **Back** (4–6): cleanse **Chill/Ice/Slime** |
| **C** | ≤**2** | **6** | **1** stack, **2** rounds | No friendly fire |
| **D** | **1** | **4** | — | **3** friendly fire to pos **1 and 2** (bypasses) |
| **F** | — | — | — | No enemy hit; **3** damage to **entire** living party (bypasses) |

Fire tick uses normal `DOT_STATS.Fire` (**4**/stack per DoT phase) on the **boss and any living minions** still standing after the hit (one-shots skip the chip). Minions show a Fire status under their portrait.

**Party Poison (Ash / Bone Memory cloud)** — distinct from Fire: one **magnet-weighted party splash** each DoT phase (`8 × stacks × intensity`). Stacks **cap at 2**; intensity **caps at 3** (max splash **48**). Bosses will not cast **PoisonCloud** again while any living ally still has Poison.

---

### Thornmender — rescue healing (internal id: `Healer`)

**Job (as coded):** emergency HP ladder. Uncharged: **no** cleanse (Maiden is primary Fire/Poison; Fire Mage = Chill/Ice/Slime). **Life Power** charge: **normal heal still applies**; Fire/Poison seats also **wash** (no purple bonus); clean seats get purple bonus. F heals the boss.

| Grade | Effect |
|-------|--------|
| **A** | Heal **all** living **+14** each |
| **B** | Heal the **two lowest-HP** allies **+14** each |
| **C** | Heal the **single lowest-HP** ally **+18** |
| **D** | Tiny **full-party** heal **+3** each |
| **F** | Heal **boss** **+8** |

**2** Thornmenders in the roster (back seat only — exclusive with Grovekeeper).

---

### Grovekeeper — healing-over-time (internal id: `Lifebinder`)

**Job (as coded):** slow, preventative healing-over-time. Grovekeeper occupies
the back seat and is exclusive with Thornmender. Necromancer Life Power enhances the
seats reached by her next renewal: dirty Fire/Poison seats wash, while clean
seats receive the purple bonus.

| Grade | Renewal (3 ticks after damaging DoTs) |
|-------|----------------------------------------|
| **A** | All living **+4**/tick |
| **B** | Front positions 1–3 **+4**/tick |
| **C** | Back positions 4–6 **+3**/tick |
| **D** | Self **+3**/tick |
| **F** | No renewal; **3 self-damage** bypassing absorb |

Streams are independent and cap at **2** per soldier. Grovekeeper and
Thornmender are the game's two Lifebinder classes: Grovekeeper handles
preventative HoTs; Thornmender handles rescue healing.

---

### Archer — Long Shot + Arrow Storm AOE

**Job (as coded):** **Long Shot** reaches minions from any seat. Multi-target volleys let one good token clear the gap without parking the whole drop on DPS; a small minion bonus helps adds die first.

**AOE rules:** same as FireMage — minions first, then boss; A/B ≤**3**, C ≤**2**, D **1**.

| Grade | Targets | vs boss each | vs minion each |
|-------|---------|--------------|----------------|
| **A** | ≤**3** | **10** | **12** (+2) |
| **B** | ≤**3** | **8** | **9** (+1) |
| **C** | ≤**2** | **6** | **7** (+1) |
| **D** | **1** | **4** | **5** (+1) |
| **F** | **1** | Hit for **3** + **1–2** to a random ally (bypasses shield/block); no minion bonus |

---

### Spearman — Penetrate + thrust + Parry

**Job (as coded):** line breaker. On A–D, **Penetrate** carries minion overkill into the boss. **A–D** also grant modest **Parry** (reduce boss damage to self this round). **Pos 1 without Parry** takes **×1.35** boss damage. Parry expires after the boss phase.

| Grade | Thrust | Parry | Penetrate |
|-------|--------|-------|-----------|
| **A** | **12** | **40%** | Minion overkill → boss |
| **B** | **10** | **30%** | Minion overkill → boss |
| **C** | **7** | **20%** | Minion overkill → boss |
| **D** | **5** | **10%** | Minion overkill → boss |
| **F** | **2** | **None** | No |

**2** Spearmen in the roster.

---

### Necromancer — drain + Life Power (cleanse charge)

**Job (as coded):** modest boss drain; **A–C** grant **Life Power** to the living **Thornmender or Grovekeeper**. On their **next** heal/renewal: **normal mend still applies**; seats with **Fire/Poison** also **wash** (no purple bonus); clean seats get purple **+N**. Purple rain FX on both. **Maiden remains primary one-token cleanse.** No stacking; until used. **No direct ally heal.**

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

### Runesinger — support rewrite + rune attack (always acts first)

**Job (as coded):** any-seat support who changes this drop's claim grades and
then makes a normal positional rune attack. **Always resolves before every
other specialist.** Positions 1–3 hit a gap minion first; positions 4–6 hit the
boss. Runesinger does not heal and cannot receive Life Power.

| Grade | Token rewrite | Rune attack |
|-------|---------------|-------------|
| **A** | All claims **+2** (F→C, D→B, … cap A) | **12** |
| **B** | F/D→**C**, C→**B**, B/A stay | **9** |
| **C** | Worst claim → **C** (front wins ties) | **6** |
| **D** | None | **4** |
| **F** | All claims **−1** (F stays F) | None |

Mutates `effectiveGrade` so later actors use the new grades. Multiple claimed
Runesingers resolve front-to-back and stack rewrites deterministically.

---

### Rough A-damage comparison (no bonus, no curse)

Useful when weighing “who is just DPS?”

| Archetype | A damage-ish | Notes |
|-----------|--------------|--------|
| Archer | **10** each ≤3 foes (12 vs minion) | Arrow Storm AOE |
| FireMage | **9** each ≤3 foes + boss Fire 2r | Wildfire + Chill/Ice/Slime cleanse (A front) |
| Thundercaller | 14 + stun/charge | Single target |
| ShieldMaiden | 14 + cover + Fire/Poison cleanse | |
| Necromancer | 12 + Life Power on support | |
| Vanguard | 11 + Last Stand A/B | |
| Spearman | **12** ST + Penetrate + modest parry | |
| Runesinger | **12** | Token rewrite + positional attack |
| Lifebinder | 0 direct | Three-tick preventative renewal |
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
| Lifebinder | | | |

## License

Private classroom project.
