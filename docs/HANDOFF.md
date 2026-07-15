# Dungeon Grades — Agent Handoff

**Last updated:** 2026-07-15  
**Repo:** `ctroy978/dark-grader` (local path often `/home/tcoop/Work/darker`)  
**Owner:** Troy / ctroy978 — classroom only (LAN, firewall, no public SaaS)

Read this first after a context restart. Specs: `Dungeon_Grades_Game_Spec.md`, `Dungeon_Grades_UI_Spec.md`, `docs/DESIGN.md`. **Code + this handoff win** when they disagree with older docs.

---

## What this project is

Browser classroom game: **test letter grades (A–F)** become **power tokens**. Students share **one Chromebook per team**. Only control each round: **Token Magnet (1–6)** then **Drop Tokens**. Server is authoritative for RNG and combat.

**Art direction:** Darkest Dungeon–style — pose images (`standing` / `attack` / `hit` / `death`), labels under portraits, short comic bubbles, occasional ElevenLabs VO. Real PNGs are landing; SVG placeholders remain as fallback.

---

## How to run

```bash
cd /home/tcoop/Work/darker   # or repo root
npm install
npm run build -w @dungeon-grades/shared
npm run dev:server   # :3001  — MUST be running; Vite alone → proxy ECONNREFUSED
npm run dev:client   # :5173, proxies /api → localhost:3001 and socket.io
```

- Teacher PIN default: `teacher` (`TEACHER_PIN` env)
- ElevenLabs: repo-root `.env` → `ELEVENLABS_API_KEY` (gitignored)
- Audio cache: `server/data/audio/` — `npm run audio:generate`
- Persist: JSON under `server/data/` (`classroom.json`, `teams/*.json`) — **not** SQLite; **gitignored** runtime data
- **Combat art is NOT gitignored** — lives under `client/public/art/` and should be committed when ready

**Tests:** `npm test` (shared magnet + server combat/campaign/tokens/boss loader/balance sims)

**Git:** `git@github.com:ctroy978/dark-grader.git` (SSH)

---

## Layout

```
packages/shared/     types, balance, magnet, playbook, presentation cues (BoardReveal), statusUi
server/
  content/bosses/    TOML boss packs (tracked)
  src/engine/        combat, claims, specialists, bosses, dots, presentation, damage
  src/seed/          bossLoader, roster, instantiateBoss
  data/              gitignored runtime (JSON + audio cache)
client/
  src/combat/        CombatActor, PlaceholderPortrait (PNG + SVG fallback), poses, SpeechBubble, StatusChips
  src/screens/       CombatScreen (playback + visualHold), LobbyScreen, TeacherDashboard, JoinScreen
  public/art/        {key}/{pose}.png — see public/art/README.md
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
| Bubbles | Short comic text now; **image bubble frames later** |
| Party size | 6 of ~22 roster |
| Campaign | Default **3 rooms**: Ash Wraith → Bone Colossus → Bone Colossus |
| Damage priority | Party hits **minions first**, then boss (`hitEnemies` in `damage.ts`) |

---

## Core combat loop

1. **`awaiting_magnet`** — `pendingTokens` drawn; magnet playbook for target  
2. Magnet **1–6** (cannot park on dead)  
3. **Drop Tokens** → claims → party actions → DoTs → deaths → **`boss_telegraph`**  
4. Client plays `playback` cues with **progressive HP reveals**, then auto **resolve-boss**  
5. Boss/minion cues → next magnet phase or win/lose  

Phases: `lobby` | `between_rooms` | `awaiting_magnet` | `resolving` | `boss_telegraph` | `victory` | `defeat` | `campaign_complete`

### Post-fight (important)

| Outcome | Flow |
|---------|------|
| **Victory** | Client **Continue → camp & reform** → `POST /api/team/:id/continue` → `enterBetweenRooms` (idempotent). Final room → `campaign_complete`. |
| **Defeat** | Client **Reform party & retry room** → `POST /api/team/:id/return-from-defeat` → `returnFromDefeat`. Same `roomIndex`; **no** camp heal; dead stay dead. Room 0 → `lobby`, later rooms → `between_rooms`. |

**Bug fixed 2026-07-14:** defeat used to only offer “Return Home”, leaving the team stuck in `defeat` forever if you rejoined. Always ship the return-from-defeat path.

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
- **Bone Archer** (softened for classroom): **16 HP / 5 damage** (was 20/7)  
- New boss from existing attacks = new TOML only; scalars/`*_pool` **before** `[[audio]]`/`[[attacks]]`  
- See `server/content/README.md`

### Runesinger (buffed after playtest)
- A/B/C/D party damage bonus this round: **+5 / +3 / +2 / +1**  
- F: boss next attack **+3** (was +4)  
- Playbook text in `packages/shared/src/playbook.ts` must stay in sync  

### Campaign
- `roomIndex` = rooms cleared; continue from victory is **idempotent**  
- Inter-room Vanguard heal 20% if any living Vanguard; reform 6  

---

## Combat presentation (critical contract)

### Progressive board reveals (do not regress)

Server resolves **all** combat math on Drop Tokens / resolve-boss, but the client must **not** flash final HP at drop.

1. **Server** attaches `reveal?: BoardReveal` on combat cues (`action`, `boss`, `minion`, `death`, `dot`, `system`) via `pushCue` → `captureBoardReveal` in `server/src/engine/presentation.ts`.  
   - Type: `packages/shared/src/presentation.ts` (`BoardReveal`)  
2. **Client** (`CombatScreen.tsx`):
   - On Drop Tokens / resolve-boss: **`setVisualHold(snapshotCombatants(team))` immediately** (React state, not only a ref)  
   - While `visualHold` is set: render `view = applyBoardReveal(hold, team, latestReveal…)`  
   - Clear hold with `endPresentation()` when playback finishes or Skip  
   - **Bug fixed 2026-07-15:** using only a ref + `playing` from `useEffect` caused one frame of post-resolve board → **minions vanished at drop**

### Minion kills (do not regress)

- Party damage hits **minions first** (`hitEnemies`)  
- On kill: leave minion at **0 HP** (do **not** purge mid-party-phase)  
- Action cues: **focus the hit minion**, bubble e.g. `"Volley! Bone Archer down!"`, heavier SFX  
- Diff pre/post action HP in `commitRound` for `hitFocusIds` / `slainNames`  
- **`purgeDeadMinions` only at start of `resolveBoss`** (after party playback is done)  
- `poses.ts`: action cue → speaker `attack`, other focus targets `hit`

### Fixed chrome (layout bounce)

Combat header must not reflow when tokens/playbook/banners toggle:

- Token strip: **fixed height**, always **3 reserved slots**  
- Alert band + playbook strip: always mounted with **min-height**  
- Token bob/fall animations stay inside `overflow: hidden`

### Magnet playbook (keep)
Under magnet target: grade effects + risk notes (`playbook.ts`). Owner likes this — do not remove.

### PresentationCue content
- Token holders: claim + action bubbles; occasional VO  
- Boss/minion: TOML lines + SFX  
- One party hurt bubble after boss damage  
- Grade badges: progressive during playback (`visibleClaims`), full after  

**Client timings:** classroom-readable (~0.9–1.5s per cue; Skip available). `cueDurationMs` in `CombatScreen.tsx`.

### Combat actors + art

| File | Role |
|------|------|
| `poses.ts` | pose from cue + alive |
| `PlaceholderPortrait.tsx` | **PNG if loads**, else SVG placeholder; `artKeyFor` / `artUrlFor` |
| `CombatActor.tsx` | portrait + HP + labels + bubble |
| `SpeechBubble.tsx` | comic bubbles |

**Art path (wired):**
```
client/public/art/{key}/{pose}.png   → served as /art/{key}/{pose}.png
```

| Keys (party) | Boss / minion |
|--------------|----------------|
| `vanguard`, `shieldmaiden`, `firemage`, `healer`, `archer`, `doomcaller`, `necromancer`, `thundercaller`, `runesinger` | `ash_wraith`, `bone_colossus`, `bone_archer` |

Poses: `standing`, `attack`, `hit`, `death`  
**Format:** PNG only (loader looks for `.png`)  
**Size:** aspect **5:6**, target **~768×922**; same master size for party and bosses (UI scales boss larger). Transparent cutout preferred. `object-cover object-top`.  
Art is **per archetype**, not per named soldier. Missing pose → SVG fallback for that pose only.

**Not gitignored** — commit art when ready. `server/data/` *is* gitignored (runtime).

---

## Owner feedback (recent playtests)

- Magnet playbook / status labels: **keep**  
- Art: looks good; more incoming; fine in repo  
- Combat feels **brutal** (esp. minions / Ash Wraith); Bone Archers and Runesinger softened once — **may need broader balance**  
- Want effects (heal, hit, buff) **on cast**, not all at drop → progressive `reveal` system  
- Minion kills must be **readable** (who killed them) — not vanish at drop  
- Token strip must not **bounce the page** when grades appear/disappear  

---

## Open / next phase

1. **Balance pass** after more playtests (Ash Wraith hard in sims; party often wipes with boss ~30–75 HP)  
2. Finish / commit remaining art (all keys × 4 poses)  
3. Classroom deploy (serve built client from server, one command)  
4. Optional adaptive Cascade  
5. Image bubble frames  
6. Richer FX overlays on real art  
7. Sync stale `docs/DESIGN.md`  

---

## Quick teacher flow

1. Login PIN → paste grades → Generate pool  
2. Campaign path (rooms/bosses)  
3. Create invite codes  
4. Students join → form party → enter room → magnet + Drop Tokens  
5. Wipe → **Reform party & retry**; win → **Continue → camp**

Default path: **Ash Wraith → Bone Colossus → Bone Colossus**.

---

## If something breaks

| Symptom | Check |
|---------|--------|
| Vite `ECONNREFUSED` on `/api/...` | Server not on :3001 — `npm run dev:server` |
| Stuck on defeat | Need return-from-defeat API; restart server if old build |
| Minions vanish on drop | `visualHold` set before commit; no mid-party `purgeDeadMinions`; hard-refresh client + restart server |
| HP jumps on drop | Progressive `reveal` + `visualHold`; shared rebuild after `BoardReveal` edits |
| Art not showing | Path/case: `/art/{key}/{pose}.png`; hard-refresh after first 404 |
| Mid-fight after code change | Teacher **Reset team** or new invite |
| Shared types/playbook edits | `npm run build -w @dungeon-grades/shared` |
| Boss TOML | `server/content/bosses/` + loader order rules |
| Boss SFX missing | `npm run audio:generate` with API key |

---

## Key files for recent systems

| System | Files |
|--------|--------|
| Progressive presentation | `shared/presentation.ts`, `server/.../presentation.ts`, `client/.../CombatScreen.tsx` |
| Minion targeting / purge | `server/.../damage.ts` (`hitEnemies`, `purgeDeadMinions`), `combat.ts` (`commitRound`, `resolveBoss`) |
| Defeat → lobby | `returnFromDefeat` in `combat.ts`, `POST .../return-from-defeat` in `index.ts` |
| Art loader | `client/.../PlaceholderPortrait.tsx`, `client/public/art/README.md` |
| Runesinger | `server/.../specialists.ts`, `shared/playbook.ts` |
| Bone Archers | `server/.../bosses.ts` (`SummonBoneArchers`) |

---

*End of handoff. Update this file when major rules or presentation contracts change.*
