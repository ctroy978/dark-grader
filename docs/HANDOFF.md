# Dungeon Grades — Agent Handoff

**Last updated:** 2026-07-16 (Cinder Herald + 4-room default path)  
**Repo:** `ctroy978/dark-grader` (local path often `/home/tcoop/Work/darker`)  
**Owner:** Troy / ctroy978 — classroom only (LAN, firewall, no public SaaS)

Read this first after a context restart. Specs: `Dungeon_Grades_Game_Spec.md`, `Dungeon_Grades_UI_Spec.md`, `docs/DESIGN.md`.  
**Boss / 6-room campaign plan:** [`docs/BOSS_PLAN.md`](./BOSS_PLAN.md) — refer here for the ladder, thrall rules, Dominated, and build slices.  
**Code + this handoff + README ability section win** when they disagree with older docs; update `BOSS_PLAN.md` when boss design ships or changes.

---

## What this project is

Browser classroom game: **test letter grades (A–F)** become **power tokens**. Students share **one Chromebook per team**. Only control each round: **Token Magnet (1–6)** then **Drop Tokens**. Server is authoritative for RNG and combat.

**Art direction:** Darkest Dungeon–style — pose images (`standing` / `attack` / `hit` / `death`), labels under portraits, short comic bubbles, occasional ElevenLabs VO. Real PNGs under `client/public/art/`; SVG placeholders as fallback.

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
- Persist: JSON under `server/data/` — **gitignored** runtime data
- **Combat art is NOT gitignored** — commit under `client/public/art/`
- **Existing teams keep old roster** until teacher reset / new invite after roster changes

**Tests:** `npm test` (shared magnet + server combat/campaign/tokens/claims/boss loader/balance sims)

**Git:** `git@github.com:ctroy978/dark-grader.git` (SSH)

---

## Layout

```
packages/shared/     types, balance, magnet, playbook, presentation, statusUi, grades
server/
  content/bosses/    TOML boss packs
  src/engine/        combat, claims, specialists, bosses, dots, presentation, damage
  src/seed/          bossLoader, roster, names, instantiateBoss
  data/              gitignored runtime
client/
  src/combat/        CombatActor, PlaceholderPortrait, poses, SpeechBubble, StatusChips
  src/screens/       CombatScreen (playback + visualHold), Lobby, Teacher, Join
  public/art/        {key}/{pose}.png
docs/                DESIGN.md, HANDOFF.md, **BOSS_PLAN.md** (campaign ladder + new boss mechanics)
README.md            Full ability reference for design review (keep in sync with specialists.ts)
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
| Party size | 6 of **22** roster |
| Campaign | **Runtime default 4 rooms:** Moss Grub → Ash → Cinder Herald → Colossus. **Target:** 6 rooms per `docs/BOSS_PLAN.md` (Grub → Ash → Herald → Captain → Warden → Colossus) |
| Damage priority | Party hits **minions first**, then boss (`hitEnemies`) |

---

## Core combat loop

1. **`awaiting_magnet`** — `pendingTokens` drawn; magnet playbook for target  
2. Magnet **1–6** (cannot park on dead)  
3. **Drop Tokens** → claims → **Runesinger first** → other party actions front→back → DoTs (party + boss) → deaths → **`boss_telegraph`** (or victory/defeat)  
4. Client plays `playback` with **progressive HP reveals**, then auto **resolve-boss**  
5. Boss/minion cues (or stun skip) → next magnet phase or win/lose  

Phases: `lobby` | `between_rooms` | `awaiting_magnet` | `resolving` | `boss_telegraph` | `victory` | `defeat` | `campaign_complete`

### Post-fight

| Outcome | Flow |
|---------|------|
| **Victory** | Continue → camp → `POST .../continue` → `enterBetweenRooms` (idempotent). Final room → `campaign_complete`. |
| **Defeat** | Reform & retry → `POST .../return-from-defeat` → same `roomIndex`; no camp heal; dead stay dead. |

### Understrength parties (no soft-lock)

- Living ≥ 6 → party must still be exactly **6**.
- Living **1–5** → field **all** living soldiers (positions 1…N). Lobby + `selectParty` / `startFight` allow this.
- Living **0** → cannot enter; teacher reset required.
- `requiredPartySize(team)` / `canFormNextParty` (≥1 living) in `combat.ts`.

---

## Claim rules (rewritten 2026-07-15)

**Do not regress to 30% magnet odds.**

1. Soldier under magnet **always** gets **exactly one** of the drawn tokens (**which grade is random**).  
2. Remaining tokens → other living soldiers, weighted by **proximity** to magnet (adjacent 2× far). Magnet cannot claim a second.  
3. Each soldier ≤1 token per drop.  

Code: `server/src/engine/claims.ts`, `packages/shared/src/magnet.ts` (`proximityClaimWeights`). Tests: `claims.test.ts`, `magnet.test.ts`.

---

## Action order (critical)

1. Claims resolved  
2. **All Runesingers** who claimed (rewrite grades + heals)  
3. **Everyone else** front (pos 1) → back (pos 6)  
4. DoT phase (party then **boss DoTs**)  
5. Boss telegraph / victory / defeat  

Thundercaller F only stuns claimers **still unresolved** this drop (`beginPartyActionPhase` / `markClaimerResolved` in `specialists.ts`). Never “hits” Runesinger after she already acted.

---

## Rules still in force

### Tokens
- Class pool from teacher grades; reshuffle discard when empty  
- Telegraph: `pendingTokens` at magnet phase start  
- Count: `floor(living / 2)` min 1 → 6→3 … (`tokensForLivingCount`)  

### Party shield (Shield Maiden)
- Opening **1d6** if living Maiden in party  
- **A** = hit 14 + **reroll shield 1d6**  
- B/C/D = hit 11/9/7  
- **F** = shield drops to **0** (noop if already down)  
- Friendly fire **bypasses** shield + personal block  

### Personal block (Vanguard)
- A–C personal block + party-wide block; D/F still hit  
- Absorbs boss/minion/DoT damage after grant; leftover expires **after the boss phase** (not at next token drop — that made chips vanish before the attack reveal)  

### DoTs
- Fire **4** (party stacks max **2**) / Ice 3 / Poison party splash **8**/stack (intensity 1) / Slime **2** flat (stack cap **1**, **until cleansed**, no ramp, **no token slow**) — `DOT_STATS`  
- **Boss party DoTs ramp:** PoisonCloud, FireCloud, and Fire minion on-hit set `escalationStep` (starts 1). Each DoT phase: damage × intensity, then intensity +1. Player/ally DoTs and **Slime** stay flat.  
- **Moss Mite** on-hit applies party Slime (permanent until Fire Mage A/B or Doomcaller strip).  
- Boss can hold DoTs (`boss.statuses`); tick damages boss HP (Poison flat on boss, not splash; no ramp on boss-held DoTs)  
- Doomcaller strips DoTs+Marks; transfers **DoTs only** → boss (not Marks, not Frozen)  
- Healer cleanses Fire/Ice/Poison (**not Slime**); Fire Mage A/B thaws Frozen + cleanses Ice/Slime (front/back)  

- **UI today:** small status chips only (`statusUi` / `StatusChips`). Easy to miss on a Chromebook from across the table.  

### Bosses
- TOML in `server/content/bosses/` + mechanics in `bosses.ts`  
- **Cascade** raw pos1→6 = 16,13,10,7,4,2  
- **Bone Archer** minions: **12 HP / 4 dmg** (Colossus is a glass summoner: boss HP lower, adds tax DPS)  
- Stun: `stunRoundsLeft` skips **boss + minions**; **telegraph must not wind up as attack** when already stunned  
- Boss HP (balance A+): Ash **210**, Bone Colossus **230**; Regenerate heals **10**

---

## Ability summary (source of truth: `specialists.ts`)

Full tables live in **`README.md` → Character abilities**. High level:

| Archetype | Role |
|-----------|------|
| **Vanguard** | Personal block + hit; A–C also +party block (self A=6+3, B=4+2) |
| **ShieldMaiden** | Damage ladder; A refresh shield; F dump shield |
| **FireMage** | Wildfire AOE (A/B≤3, C≤2, D1) + boss Fire burn; **A front / B back** thaw **Frozen** + Ice/Slime; C/D/F friendly fire |
| **Healer** | A all / B front / C back heal + cleanse **Fire/Ice/Poison**; F boss heal +8 |
| **Archer** | Arrow Storm AOE (A/B≤3, C≤2, D1) + small minion bonus; F misfire |
| **Doomcaller** | Strip DoTs+Marks; transfer **DoTs only** (A stacks 2r, B unique 3r, C/D strip lines); **never** Frozen; F copy boss DoT types onto self; death → poison by last claim tier |
| **Necromancer** | Drain + heal lowest; F hit **highest-HP ally 10** (no boss heal) |
| **Thundercaller** | Single lightning (no chain); A/B/C 30% boss stun; A front Charge+3 / B back Charge+3; F 30% stun **unresolved** claimer |
| **Runesinger** | **Always first**; rewrite tokens + heal holders (A all→A +5, B floor B +4, C lowest→C +3, D heal+3, F shift all down) |

**Charge:** status on soldiers; consumed into next `hitEnemies` for that actor.

**Roster (22):** Archer×3, Doomcaller×2, Necromancer×2, Runesinger×2, rest unchanged.  
**Names / art gender:** Male = Vanguard, FireMage, Doomcaller, Necromancer, Thundercaller; Female = ShieldMaiden, Healer, Archer, Runesinger — `server/src/seed/names.ts`.

---

## Combat presentation (critical contracts)

### Progressive board reveals
- Server attaches `reveal?: BoardReveal` on combat cues  
- Client: `setVisualHold` **before** drop/resolve; render via `applyBoardReveal`  
- Clear hold in `endPresentation`  

### Minion kills
- Leave at 0 HP until `purgeDeadMinions` at start of `resolveBoss`  
- Focus + kill bubble on action cues  

### Outcome SFX (fixed 2026-07-15)
- **Victory/defeat horn only after presentation ends** (`endPresentation`), not on phase change at Drop Tokens  
- Do not play victory from log text (“is defeated!”)  

### Boss stun presentation (fixed 2026-07-15)
- If already stunned after party: telegraph **“Stunned…”**, not “gathers power” / attack SFX  
- Stun skip cue: not attack pose; bubble “Stunned!”  
- Minions may still fire after boss skip (by design for now)  

### Fixed chrome
- Token strip fixed height, 3 slots; alert/playbook min-height  

### Art paths
```
client/public/art/{key}/{pose}.png
```
Keys: `vanguard`, `shieldmaiden`, `firemage`, `healer`, `archer`, `doomcaller`, `necromancer`, `thundercaller`, `runesinger`, `moss_grub`, `ash_wraith`, `cinder_herald`, `bone_colossus`, **`bone_archer`**, **`moss_mite`**, **`cinder_imp`** (minions — not nested under boss folders).  
Poses: standing, attack, hit, death. PNG only. ~5:6, ~768×922.

---

## Owner feedback / recent fixes

- Ability + magnet rework session completed (all 9 kits + claims + roster)  
- Victory horn fired at drop → fixed  
- Stunned boss still *looked* like it attacked → telegraph + skip presentation fixed  
- Combat still feels hard; balance pass still open  

---

## Open / next phase

1. **Presentation audio (in progress)** — per-archetype attack SFX + gendered party hurt; hand MP3s in `server/data/audio/` (see shopping list below). Mixer / sparse rules still open.  
   - **Lobby music:** drop `server/data/audio/music_ambient_lobby.mp3` (60–90s loop). Catalog volume **0.2**. Pref `dg_music` (default on); **Music / Music off** button on lobby + combat chrome. Ambient plays in lobby/camp only; combat stops the bed. Master mute also stops music.  
2. **Boss plan Slice B.2** — Rattle Captain + light scraps (CrushMagnet tax)  
3. **Slice C** — Barrow Warden + Grave Thrall heal-on-drop + Dominated  
4. Expand default path to full 6 rooms when Captain/Warden ship  
5. Finish missing art poses / new boss art (commit under `public/art/`)  
6. Classroom deploy (serve built client from server, one command)  
7. **FX overlays (when we start visual FX)** — tag-driven, not full particle engine. **Priority must-include:**  
   - **Strong on-portrait DoT signal** — players must *instantly* see that someone is poisoned / burning / iced / slimed (not chip-only). Classroom read from a few feet away.  
   - Per-type tint/aura (poison green, fire orange, etc.) while the DoT is active, not only on tick flash.  
   - **Boss ramp intensity** should read on the body/FX (stronger pulse / thicker aura as `escalationStep` rises), not only as `⬆N` on a tiny chip.  
   - Apply/cleanse moments need a clear pop (cloud land, cleanse wash).  
   - Also: Thundercaller lightning stage arcs, etc.  
8. Image bubble frames  
9. Sync stale `docs/DESIGN.md` (still mentions SQLite / old claims / old abilities)  
10. Cascade / FireMage FF fine-tune if still too hard after more rooms exist

### Party SFX catalog (hand-authored preferred)

Drop files as `server/data/audio/{id}.mp3`. Missing files fall back (`hit_light` / `heal`).

| Id | Who / when | Pixabay vibe |
|----|------------|--------------|
| `act_healer` | Healer cast | heal chime (legacy `heal.mp3` still accepted) |
| `act_runesinger` | Runesinger cast | rune hymn / magic chime (falls back to `heal`) |
| `act_vanguard` | Vanguard | shield bash / armor hit |
| `act_shieldmaiden` | Shield Maiden | sword strike |
| `act_firemage` | Fire Mage | fire cast burst |
| `act_archer` | Archer | bow / arrow volley |
| `act_doomcaller` | Doomcaller | dark curse pulse |
| `act_necromancer` | Necromancer | drain / ethereal suck |
| `act_thundercaller` | Thundercaller | lightning crack |
| `hurt_male` | Party hurt bubble (male art) | short male hit grunt, classroom-safe |
| `hurt_female` | Party hurt bubble (female art) | short female hit grunt, classroom-safe |
| `fizzle` | **Any** archetype plays an **F** token | spell fail / sad poof / comic fizzle (falls back to `explosion_f`) |
| `minion_moss_mite` | Moss Mite volley | soft chitter / nibble / squelch |
| `minion_cinder_imp` | Cinder Imp volley | small fire spit / ember |
| `minion_bone_archer` | Bone Archer volley | bone arrow whoosh |
| `minion_shot` | Generic add fallback | any small enemy hit |
| `music_ambient_lobby` | Lobby / between rooms loop | soft dark ambient, seamless 60–90s, **hand-authored only** |

**Art gender (locked with names):** male = Vanguard, FireMage, Doomcaller, Necromancer, Thundercaller; female = ShieldMaiden, Healer, Archer, Runesinger.  
Boss/minion impact stays on the boss/minion cue; hurt bubble uses gendered grunts (not a second generic hit).

---

## If something breaks

| Symptom | Check |
|---------|--------|
| Vite `ECONNREFUSED` | `npm run dev:server` on :3001 |
| Stuck on defeat | `return-from-defeat` path; restart server |
| Minions vanish on drop | `visualHold`; no mid-party purge |
| Victory horn at drop | Client must use endPresentation for outcome SFX; hard-refresh |
| Stunned boss winds up | Server telegraph branch when `stunRoundsLeft > 0`; restart server |
| Shared edits | `npm run build -w @dungeon-grades/shared` |
| Old roster names/counts | Teacher reset team / new invite |
| Art 404 | Path/case; hard-refresh after first miss |

---

## Key files for recent systems

| System | Files |
|--------|--------|
| Claims (magnet guarantee) | `claims.ts`, `magnet.ts`, `claims.test.ts` |
| Specialists / abilities | `specialists.ts`, `playbook.ts`, `README.md` abilities |
| Runesinger first + Charge + party stun | `combat.ts` action order, `specialists.ts`, `damage.ts` (`applyCharge`/`consumeCharge`) |
| Boss DoTs / Doomcaller | `dots.ts`, `types.ts` `BossState.statuses` |
| Progressive presentation | `presentation.ts` (shared+server), `CombatScreen.tsx` |
| DoT chips / future body FX | `statusUi.ts`, `StatusChips.tsx`; ramp on `DotInstance.escalationStep` |
| Outcome / stun audio-visual | `CombatScreen.tsx`, `audio.ts`, `bosses.ts`, `poses.ts` |
| Roster / names | `balance.ts` `ROSTER_COUNTS`, `seed/names.ts`, `seed/roster.ts` |
| Art loader | `PlaceholderPortrait.tsx`, `public/art/README.md` |

---

*End of handoff. Update this file when major rules or presentation contracts change.*
