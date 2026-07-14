# Dungeon Grades — Agent Handoff

**Last updated:** 2026-07-14  
**Repo:** `ctroy978/dark-grader` (local path often `/home/tcoop/Work/darker`)  
**Owner:** Troy / ctroy978 — classroom only (LAN, firewall, no public SaaS)

Read this first after a context restart. Specs: `Dungeon_Grades_Game_Spec.md`, `Dungeon_Grades_UI_Spec.md`, `docs/DESIGN.md`. **Code + this handoff win** when they disagree with older docs.

---

## What this project is

Browser classroom game: **test letter grades (A–F)** become **power tokens**. Students share **one Chromebook per team**. Only control each round: **Token Magnet (1–6)** then **Drop Tokens**. Server is authoritative for RNG and combat.

**Art direction:** Darkest Dungeon–style — simple pose animation (standing / attack / hit / death), labels under portraits, short comic bubbles, occasional ElevenLabs VO. Gothic final art pending; **SVG placeholders** ship today.

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
- Audio cache: `server/data/audio/` — `npm run audio:generate` (also generates boss TOML SFX + short VO claim/hurt lines)
- Persist: JSON under `server/data/` (`classroom.json`, `teams/*.json`) — **not** SQLite

**Tests:** `npm test` (shared magnet + server combat/campaign/tokens/boss loader/balance sims)

**Git:** `git@github.com:ctroy978/dark-grader.git` (SSH)

---

## Layout

```
packages/shared/     types, balance, magnet, playbook, presentation cues, statusUi
server/
  content/bosses/    TOML boss packs (tracked)
  src/engine/        combat, claims, specialists, bosses, dots, presentation
  src/seed/          bossLoader, roster, instantiateBoss
  data/              gitignored runtime (JSON + audio cache)
client/
  src/combat/        CombatActor, PlaceholderPortrait, poses, SpeechBubble, StatusChips
  public/art/        real PNGs later: {key}/{pose}.png — see README there
docs/                DESIGN.md, this HANDOFF.md
```

---

## Product decisions (locked)

| Topic | Decision |
|--------|----------|
| Deploy | Classroom server, simple, no cloud BaaS |
| DB | JSON files in `server/data/` |
| Clients | **One browser per team** — last magnet input wins |
| Combat | **Server-authoritative** |
| Round advance | Explicit **Drop Tokens**; boss telegraph then resolve-boss |
| UI teaching | Board first (poses, labels, playbook); log is secondary |
| Bubbles | Short comic text now; **image bubble frames later** (data already separate from render) |
| Party size | 6 of ~22 roster |
| Campaign | Default **3 rooms**: Ash Wraith → Bone Colossus → Bone Colossus |

---

## Core combat loop

1. **`awaiting_magnet`** — `pendingTokens` drawn and shown; **magnet playbook** explains grade effects for magnet target  
2. Magnet **1–6** (cannot park on dead)  
3. **Drop Tokens** → claims → party actions → DoTs → deaths → **`boss_telegraph`**  
4. Client plays `playback` cues (bubbles + poses + SFX/VO), then auto **resolve-boss**  
5. Boss/minion cues → next magnet phase or win/lose  

Phases: `lobby` | `between_rooms` | `awaiting_magnet` | `resolving` | `boss_telegraph` | `victory` | `defeat` | `campaign_complete`

---

## Rules (important — still in force)

### Tokens
- Class pool from teacher grades; reshuffle discard when empty  
- Telegraph: `pendingTokens` at magnet phase start  
- Count: `floor(living / 2)` min 1 → 6→3 … 3→1 (`tokensForLivingCount`)  
- Slime: one fewer token next drop (min 1)

### Party shield (Shield Maiden)
- Opening 1d6 only if living Maiden in party; no stacking  
- C = reroll shield; F = short-circuit  
- Friendly fire **bypasses** shield + Vanguard block

### Vanguard block
- A/B/C/D ≈ **7 / 5 / 3 / 1**; personal; clears next party phase

### DoTs
- Fire 6 / Ice 3 / Poison party splash 9/stack / Slime 2 — see `DOT_STATS`  
- Labels under actors: e.g. `Poison ×2`

### Bosses (TOML + code registry)
- Content: `server/content/bosses/*.toml`  
- Mechanics by attack id in `server/src/engine/bosses.ts`  
- **Cascade** raw: pos1→6 = **16, 13, 10, 7, 4, 2**  
- Colossus force-summons when gap empty  
- New boss from existing attacks = new TOML only; document order: scalars/`*_pool` **before** `[[audio]]`/`[[attacks]]`  
- See `server/content/README.md`

### Campaign
- `roomIndex` = rooms cleared; continue from victory is **idempotent**  
- Inter-room Vanguard heal 20% if any living Vanguard; reform 6  

---

## Combat presentation (current)

### Magnet playbook (keep)
Under magnet target: each incoming grade → short effect text + risk notes (`packages/shared/src/playbook.ts`). Owner likes this — do not remove.

### PresentationCue (`packages/shared` + `server/src/engine/presentation.ts`)
Server sets `team.playback` each resolve:
- All **token holders**: short claim + action **bubbles** (~30–40% also `playVo` + catalog `voId`)  
- Boss/minion: TOML bubble lines + SFX (grunts/laughs/attacks)  
- One party **hurt** bubble after boss damage  
- `lastClaims` for grade badges until next magnet phase  

**Client timings:** intentionally slowed for classroom (~0.9–1.5s per cue; skip available). See `cueDurationMs` in `CombatScreen.tsx`.

### Combat actors (DD foundation)
| File | Role |
|------|------|
| `poses.ts` | `standing` \| `attack` \| `hit` \| `death` from active cue |
| `PlaceholderPortrait.tsx` | Gothic SVG stubs (placeholder art) |
| `CombatActor.tsx` | Portrait + HP + labels under image + bubble |
| `SpeechBubble.tsx` | Comic text bubbles (image frames later OK) |

**Real art path (not wired to load PNGs yet — placeholders only):**
```
client/public/art/{key}/{pose}.png
```
Keys: `vanguard`, `shieldmaiden`, `firemage`, `healer`, `archer`, `doomcaller`, `necromancer`, `thundercaller`, `runesinger`, `bone_colossus`, `ash_wraith`, `bone_archer`  
Poses: `standing`, `attack`, `hit`, `death`  
Aspect **5:6**, target **768×922**, green-screen/chroma then cutout. ComfyUI/RunPod notes discussed with owner; style = Darkest Dungeon painterly gothic, classroom-safe.

---

## Owner feedback (this session)

- Magnet playbook: **keep**  
- Status labels under characters: **keep**  
- Long sequential essay callouts: **rejected** → short bubbles + poses  
- All token holders speak (bubbles); occasional real EL VO; boss grunts via EL SFX  
- Want DD look: pose images + labels + FX; gothic art next  
- Pace: slowed after first snappy test  
- Bubble-as-image later: doable (render swap)  
- Placeholders: agent-generated SVGs — owner does not need to draw stubs  

---

## Open / next phase

**Recommended next:** gothic art pass + client loader (`PNG if present, else placeholder`).

Then as needed:
1. Classroom deploy (serve built client from server, one command)  
2. Balance pass after playtest  
3. Optional adaptive Cascade  
4. Image bubble frames  
5. Richer FX overlays on real art  
6. Sync stale `docs/DESIGN.md`  

---

## Quick teacher flow

1. Login PIN → paste grades → Generate pool  
2. Campaign path (rooms/bosses)  
3. Create invite codes  
4. Students join → form party → enter room → magnet + Drop Tokens  

Default path: **Ash Wraith → Bone Colossus → Bone Colossus**.

---

## If something breaks

- Mid-fight after code change: **Reset team** or new invite  
- `npm run build -w @dungeon-grades/shared` after shared edits  
- Boss TOML not loading: check `server/content/bosses/` and loader paths  
- Boss SFX missing until `npm run audio:generate` with API key  
- Server cwd / workspace scripts for `data/` paths  

---

*End of handoff. Update this file when major rules or presentation contracts change.*
