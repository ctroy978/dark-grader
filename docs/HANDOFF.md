# Dungeon Grades — Agent Handoff

**Last updated:** 2026-07-14  
**Repo:** `ctroy978/dark-grader` (local path often `/home/tcoop/Work/darker`)  
**Owner:** Troy / ctroy978 — classroom only (LAN, firewall, no public SaaS)

Read this first after a context restart. Specs: `Dungeon_Grades_Game_Spec.md`, `Dungeon_Grades_UI_Spec.md`, `docs/DESIGN.md`. Code wins when they disagree with older docs.

---

## What this project is

Browser classroom game: **test letter grades (A–F)** become **power tokens**. Students share **one Chromebook per team**. Only control each round: **Token Magnet (1–6)** then **Drop Tokens**. Server is authoritative for RNG and combat.

---

## How to run

```bash
cd /home/tcoop/Work/darker   # or repo root
npm install
npm run build -w @dungeon-grades/shared
npm run dev:server   # :3001
npm run dev:client   # :5173, proxies /api and socket.io
```

- Teacher PIN default: `teacher` (`TEACHER_PIN` env)
- ElevenLabs: repo-root `.env` → `ELEVENLABS_API_KEY` (gitignored)
- Audio cache: `server/data/audio/` — `npm run audio:generate`
- Persist: JSON under `server/data/` (`classroom.json`, `teams/*.json`) — **not** SQLite (Node 26 native bind issues)

**Tests:** `npm test` (shared magnet + server combat/campaign/tokens/balance sims)

**Git:** SSH to `git@github.com:ctroy978/dark-grader.git` works; remote was switched from HTTPS earlier. Working tree may have uncommitted progress — check `git status` before push.

---

## Layout

```
packages/shared/   types, balance, magnet weights, token count helper, grades parse
server/            Fastify + Socket.IO + combat engine + JSON store
client/            React + Vite + Tailwind (combat, lobby, teacher)
docs/              DESIGN.md, this HANDOFF.md
```

Key engine files: `server/src/engine/{combat,claims,specialists,bosses,dots,damage,tokens}.ts`

---

## Product decisions (locked)

| Topic | Decision |
|--------|----------|
| Deploy | Classroom server, simple, no cloud BaaS |
| DB | JSON files in `server/data/` |
| Clients | **One browser per team** — last magnet input wins |
| Combat | **Server-authoritative** |
| Round advance | Explicit **Drop Tokens** (no auto timer); boss has separate telegraph phase |
| Class day | Shared **grade pool** + campaign boss path for all teams |
| Party size | 6 of ~22 roster; lobby formation required before fight |
| Campaign | Default **3 rooms**: Ash Wraith → Bone Colossus → Bone Colossus |

---

## Core combat loop

1. **`awaiting_magnet`** — `pendingTokens` already drawn and **shown** (only those 2–3 grades; no mystery cloud of extras)
2. Students set magnet **1–6** (cannot park on dead)
3. **Drop Tokens** → claims (30% under magnet, 20% adjacent wrap, 10% else; max 1 token/soldier) → party front→back → **DoT phase** → deaths
4. If boss lives: **`boss_telegraph`** (~2.2s UI + sound) then **`resolve-boss`**
5. Win / lose / next round (`preparePendingForRound` again)

Phases: `lobby` | `between_rooms` | `awaiting_magnet` | `resolving` | `boss_telegraph` | `victory` | `defeat` | `campaign_complete`

---

## Rules implemented (important)

### Tokens
- Class pool = teacher grade list, shuffled; reshuffle discard when empty
- **Telegraph:** draw into `pendingTokens` at start of magnet phase; drop uses those exact grades
- **Count:** `floor(living / 2)` min 1 while anyone lives → 6→3, 5→2, 4→2, **3→1**, 2→1, 1→1  
  (`tokensForLivingCount` in `packages/shared/src/balance.ts`)
- Slime: reduce drop by 1 more (min 1)

### Party shield (Shield Maiden only)
- Opening **1d6 party shield** only if **≥1 living Shield Maiden in active party**
- Multiple Maidens do **not** stack shields — one shared pool
- Maiden **C** = reroll shield to fresh 1d6; **F** = short-circuit if shield up
- **Friendly fire ignores shield and Vanguard block** (`bypassAbsorb: true`): Fire Mage C/D/F, Archer F misfire, Thundercaller F/D splash, etc. Boss/DoTs/minions still use absorb

### Vanguard (nerfed block)
- Block A/B/C/D ≈ **7 / 5 / 3 / 1** (was 12/9/6/3); personal block only, one round through boss phase

### DoTs
- Logged in clear block: `— DoT phase —` … `— End DoT phase —`
- Poison: **one party splash** using max stacks; tick **9** per stack; largest-remainder split so floor doesn’t zero most hits
- Fire 6 / Ice 3 / Slime 2 (see `DOT_STATS`)
- All DoTs hit party shield first (except friendly fire)

### Bosses (`server/src/seed/bosses.ts` + `bosses.ts`)

**Ash Wraith** — 260 HP, no summons  
**Bone Colossus** — 360 HP, enrage &lt;40% (+30% dmg), **guarantees summons when gap empty** (esp. round ≥2)

Attacks include:
- **Line Attack** — flat ~7 to everyone  
- **Cascade** — front hard → back soft (see below)  
- **Front Slam** — pos 1–3 only  
- **Crush Magnet** — magnet + adj  
- **Poison Cloud**, **Regenerate**, **SummonBoneArchers** (Colossus)

**Cascade raw** (current, post-nerf from 20 front):

| Pos | 1 | 2 | 3 | 4 | 5 | 6 |
|-----|---|---|---|---|---|---|
| Dmg | **16** | 13 | 10 | 7 | 4 | 2 |

Weight high (4). Owner concern: late campaign without Vanguards — **discussed**, not yet adaptive; only front curve softened for now.

Minions: Bone Archers ~20 HP / 7 dmg; force summon when field empty.

### Campaign
- `roomIndex` = **rooms cleared**; current room = roomIndex + 1  
- Continue from `victory` is **idempotent** (no double skip)  
- Inter-room: Vanguard camp heal 20% max HP if any living Vanguard; clear positions; reform 6 living  
- Need ≥6 living or campaign stalls  
- Teacher sets `campaignLength` + `roomBossIds` in dashboard  

### Audio
- ElevenLabs SFX + short VO cached server-side; client mute + VO toggle on combat HUD  
- Key must not go to browser  

### Known bugs fixed along the way
- Empty JSON POST body broke Drop Tokens → client sends `{}`  
- Party order visual: **#1 nearest boss (right)**  
- Death log missed when damage set `alive=false` first → `deathLogged` flag  
- Party shield without Maiden → fixed  
- Poison splash floor-to-zero → remainder distribution + higher ticks  
- Colossus rarely summoned → force summon when no minions  

---

## Playtest notes (owner)

- First long clear felt too easy → boss/DoT/minion buffs  
- First **party wipe** after Cascade + stronger DoTs — discussed combo; Cascade front reduced 20→16  
- Concern: **Cascade without Vanguards in later rooms** — open design (adaptive curve not implemented)  
- Magnet must not sit on dead — enforced  
- Action log is **chronological** (oldest top); auto-scroll  

---

## Open / next phase ideas

1. **Balance pass** after next playtest (Cascade vs DoT vs Colossus still in flux)  
2. Optional **adaptive Cascade** if no Vanguard/Maiden in line  
3. **Classroom deploy** package (serve static client from server, one command)  
4. Art / clearer status icons on characters  
5. Commit/push uncommitted work if desired  
6. `docs/DESIGN.md` slightly stale vs code in places — trust code + this handoff  

---

## Quick teacher flow

1. Login PIN → paste grades → Generate pool  
2. Campaign path (rooms/bosses)  
3. Create invite codes  
4. Students join → form party → enter room → magnet + Drop Tokens  

Default path: **Ash Wraith → Bone Colossus → Bone Colossus**.

---

## If something breaks

- Mid-fight after code change: **Reset team** or new invite so `pendingTokens` / phases match  
- `npm run build -w @dungeon-grades/shared` after shared edits  
- Server cwd should be `server/` for `data/` paths when using workspace scripts  

---

*End of handoff. Prefer updating this file when major rules change.*
