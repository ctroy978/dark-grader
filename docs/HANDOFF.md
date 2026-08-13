# Dungeon Grades — Agent Handoff

**Last updated:** 2026-08-06 (Lifebinder / Runesinger role split)
**Repo:** `ctroy978/dark-grader` (local path often `/home/tcoop/Work/darker`)  
**Owner:** Troy / ctroy978 — classroom only (LAN, firewall, no public SaaS)

Read this first after a context restart. Specs: `Dungeon_Grades_Game_Spec.md`, `Dungeon_Grades_UI_Spec.md`, `docs/DESIGN.md`.  
**Boss / 6-room campaign plan:** [`docs/BOSS_PLAN.md`](./BOSS_PLAN.md) — refer here for the ladder, thrall rules, Dominated, and build slices.  
**Code + this handoff + README ability section win** when they disagree with older docs; update `BOSS_PLAN.md` when boss design ships or changes.

---

## What this project is

Browser classroom game: **test letter grades (A–F)** become **power tokens**. Students share **one Chromebook per team**. Only control each round: **Token Magnet (1–6)** then **Drop Tokens**. Server is authoritative for RNG and combat.

**Art direction:** Darkest Dungeon–style — pose images (`standing` / `attack` / `hit` / `death`), labels under portraits, short comic bubbles. Real PNGs under `client/public/art/`; SVG placeholders as fallback.

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
- Audio: checked-in MP3s under `server/data/audio/`
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
3. **Drop Tokens** → claims → **Runesinger first** (rewrite + rune attack) → other party actions front→back → damaging DoTs → Lifebinder renewal → deaths → **`boss_telegraph`** (or victory/defeat)
4. Client plays `playback` with **progressive HP reveals**, then auto **resolve-boss**  
5. Boss/minion cues (or stun skip) → next magnet phase or win/lose  

Phases: `lobby` | `between_rooms` | `awaiting_magnet` | `resolving` | `boss_telegraph` | `victory` | `defeat` | `reward` | `campaign_complete`

## Academic Honors scoring

Source of truth: [`SCORING_SYSTEM_PLAN.md`](./SCORING_SYSTEM_PLAN.md). Each team persists three 0–6 ranks: Campaign (boss clear), Preservation (no permanent roster loss across all attempts in that room), and Tempo (victorious attempt within the boss TOML `tempo_round_limit`). Total score is their sum, max 18 for six rooms. Attempts finalize on victory, defeat, or retreat; awards are idempotent. Old saves inherit Campaign rank from `roomIndex` but do not invent Preservation/Tempo history.

Shared rules: `packages/shared/src/scoring.ts`. Engine lifecycle: `server/src/engine/combat.ts`. Student panel: `client/src/scoring/AcademicHonors.tsx`. Badge art contract: `client/public/art/badges/README.md`.

## Relic rewards

Source of truth: [`RELIC_SYSTEM_PLAN.md`](./RELIC_SYSTEM_PLAN.md). Every
non-final victory applies ordinary camp recovery, advances into a persisted
`reward` phase, and presents three deterministic classroom/room relic offers
plus a Healing Potion. Choosing one atomically enters `between_rooms`.

Each soldier carries at most one bound relic. The initial set is Bulwark Sigil,
Ember Whetstone, and Purity Charm. A relic is destroyed at lethal resolution,
before Thundercaller can revive its bearer. The potion instead heals one living
soldier to full immediately and consumes the room reward.

Shared definitions: `packages/shared/src/relics.ts`. Reward lifecycle:
`server/src/engine/rewards.ts`. Student screen:
`client/src/screens/RewardScreen.tsx`. Art contract:
`client/public/art/relics/README.md`.

### Post-fight

| Outcome | Flow |
|---------|------|
| **Victory** | Continue → camp recovery → `reward` via `POST .../continue` (idempotent) → relic/potion choice → `between_rooms`. Final room → `campaign_complete`. |
| **Defeat** | Reform & retry → `POST .../return-from-defeat` → same `roomIndex`; no camp heal; dead stay dead. |

### Understrength parties (no soft-lock)

- Legal line ≥ 6 → party must still be exactly **6**.
- Understrength → field every unrestricted-seat survivor plus at most one
  Thornmender/Grovekeeper in the final seat. An overflow Lifebinder may remain
  benched; no other living soldier may be benched.
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
2. **All Runesingers** who claimed, front-to-back (rewrite grades + positional rune attack)
3. **Everyone else** front (pos 1) → back (pos 6)  
4. Damaging DoT phase (party then **boss DoTs**)
5. Lifebinder renewal HoTs
6. Boss telegraph / victory / defeat

Thundercaller F only stuns claimers **still unresolved** this drop (`beginPartyActionPhase` / `markClaimerResolved` in `specialists.ts`). Never “hits” Runesinger after she already acted.

---

## Rules still in force

### Tokens
- Class pool from teacher grades; reshuffle discard when empty  
- Telegraph: `pendingTokens` at magnet phase start  
- Count: `tokensForLivingCount` → 6/5/4→3, 3→2, 2/1→1  

### Party shield (Shield Maiden)
- Opening **1d6** if living Maiden in party  
- **A** = hit 14 + **reroll shield 1d6**  
- B/C/D = hit 11/9/7  
- **F** = shield drops to **0** (noop if already down)  
- Friendly fire **bypasses** shield + personal block  

### Personal block (Vanguard)
- **Personal only** (no party-wide pad). A–D block **8 / 6 / 5 / 3** + hit; F weak hit
- Absorbs boss/minion/DoT damage after grant; leftover expires **after the boss phase**

### Gap rule + minions (frontline redesign)
- Fixed positions **1–3** damage minions first. Positions **4–6** hit the boss only; dead front seats do not collapse the rule forward.
- **Archer Long Shot** can damage minions from any seat. Ordinary single-target overkill does not spill.
- **Spearman Penetrate** carries A–D minion overkill into the boss; Parry is **40 / 30 / 20 / 10%** and Last Stand is Vanguard-exclusive.
- **Minions always target the magnet seat** (hard focus). **2nd+ minion shot** in the same volley uses `MULTI_MINION_FOCUS_MULT`.
- Boss outgoing damage tables still from TOML / cascade bases (further retune after playtest).

**Automated baseline (2026-08-05, typical pool):** Cinder Herald balanced **8/20**, Rattle Captain balanced **10/20**, Bone Colossus balanced **4/20**, and no-Archer Colossus **5/16**. Treat these as regression markers, not final classroom targets; live token choices are smarter than the script.

### DoTs (color split)
- Fire **4** (stacks max **2**, per seat, intensity ramps) / Ice **3**/tick × **3**r flat / Poison splash **8** × stacks × intensity (stacks max **2**, intensity max **3**, party splash) / Slime **2** until cleansed — `DOT_STATS`  
- **PoisonCloud** blocked while any living ally still has Poison (Ash / Colossus).  
- **Shield Maiden:** cleanse **Fire + Poison** (A all, B front, C back).  
- **Fire Mage A/B:** thaw **Frozen** + cleanse **Ice + Slime** (A front / B back).  
- **Marks:** no dedicated cleanse class.  
- **UI:** status chips; cleanse color dots on portraits (`ARCHETYPE_CLEANSE_DOTS`).

### Bosses
- TOML in `server/content/bosses/` + mechanics in `bosses.ts`  
- **Cascade** raw pos1→6 = 16,13,10,7,4,2  
- **Bone Colossus:** five ordered Bone Memories reuse prior boss death art; two party opportunities each; destruction grants **Exposed +50%**, detonation fires the signature effect with no exposure
- **HP gates:** **84% / 68% / 52% / 36% / 20%**, then a short Final Stand; memory HP currently **18 / 22 / 26 / 30 / 34** for later tuning
- Stun: `stunRoundsLeft` skips the boss and pauses Bone Memory charge/detonation
- Boss HP: Ash **210**, Bone Colossus **230**

---

## Ability summary (source of truth: `specialists.ts` + `README.md`)

| Archetype | Role |
|-----------|------|
| **Vanguard** | Personal block + hit (self only) |
| **Spearman** | ST thrust; A–D **Penetrate** + modest Parry; pos 1 without Parry takes extra boss damage |
| **ShieldMaiden** | Hit + one-round cover on self + most-likely-to-die; no free open; F dumps |
| **FireMage** | Wildfire AOE + boss Fire; seats 1–3 rake minions, back hits boss; A/B Frozen thaw + Ice/Slime; D/F friendly fire (C clean) |
| **Thornmender** (internal `Healer`) | Rescue/instant triage; Life Power wash/bonus; F boss heal; last seat only |
| **Archer** | Arrow Storm + minion bonus; can hit gap from any seat |
| **Necromancer** | Drain + Life Power on deployed Thornmender/Grovekeeper; F hit highest-HP ally |
| **Thundercaller** | Lightning + stun/Charge; **A** rez once/soldier/fight at ~10% HP + Dazed |
| **Runesinger** | Support; any seat; always first; rewrite tokens + 12/9/6/4/0 positional rune attack |
| **Grovekeeper** (internal `Lifebinder`) | Preventative 3-tick renewal; Life Power recipient; last seat only |

**Doomcaller removed.**

**Roster (23):** Vanguard×2, Spearman×2, ShieldMaiden×2, Necromancer×2, Runesinger×2, FireMage×3, Archer×3, Thundercaller×3, Thornmender×2, Grovekeeper×2. The engine retains `Healer` and `Lifebinder` as their respective persistence ids.
**Lifebinder role:** Thornmender = rescue healing; Grovekeeper = HoT healing. **Art folders:** `thornmender/` and `grovekeeper/`.

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
Keys: `vanguard`, `shieldmaiden`, `firemage`, `thornmender`, `grovekeeper`, `archer`, `spearman`, `necromancer`, `thundercaller`, `runesinger`, `moss_grub`, `ash_wraith`, `cinder_herald`, `bone_colossus`, **`bone_archer`**, **`moss_mite`**, **`cinder_imp`** (minions — not nested under boss folders).
Poses: standing, attack, hit, death. PNG only. ~5:6, ~768×922.

---

## Owner feedback / recent fixes

- Lifebinder/Runesinger role split implemented (10 kits; classroom tuning pending)
- Automated validation: shared 35/35, server 208/208, all production builds;
  six-room campaign sample cleared 15/16 Generous but 0/24 Typical and 0/12
  Weak, so broader campaign tuning remains open
- Victory horn fired at drop → fixed  
- Stunned boss still *looked* like it attacked → telegraph + skip presentation fixed  
- Combat still feels hard; balance pass still open  

---

## Open / next phase

1. **Lifebinder/Runesinger classroom review** — reset teams for the 23-soldier roster, validate any-seat Runesinger and last-seat Lifebinder formation, and compare Thornmender/Grovekeeper plus one/two-Runesinger balance.
2. **Relic classroom review** — supply final PNGs under `client/public/art/relics/`, playtest the four-choice reward screen on Chromebook, and compare relic-enabled campaign balance.
3. **Presentation audio (in progress)** — per-archetype attack SFX + gendered party hurt; hand MP3s in `server/data/audio/` (see shopping list below). Mixer / sparse rules still open.
   - **Lobby music:** drop `server/data/audio/music_ambient_lobby.mp3` (60–90s loop). Catalog volume **0.2**. Pref `dg_music` (default on); **Music / Music off** button on lobby + combat chrome. Ambient plays in lobby/camp only; combat stops the bed. Master mute also stops music.  
4. Finish missing art poses / new boss art (commit under `public/art/`)
5. Classroom deploy (serve built client from server, one command)
6. **FX overlays (when we start visual FX)** — tag-driven, not full particle engine. **Priority must-include:**
   - **Strong on-portrait DoT signal** — players must *instantly* see that someone is poisoned / burning / iced / slimed (not chip-only). Classroom read from a few feet away.  
   - Per-type tint/aura (poison green, fire orange, etc.) while the DoT is active, not only on tick flash.  
   - **Boss ramp intensity** should read on the body/FX (stronger pulse / thicker aura as `escalationStep` rises), not only as `⬆N` on a tiny chip.  
   - Apply/cleanse moments need a clear pop (cloud land, cleanse wash).  
   - Also: Thundercaller lightning stage arcs, etc.  
7. Image bubble frames
8. Sync remaining stale `docs/DESIGN.md` sections (SQLite / old claims / old abilities)
9. Cascade / FireMage FF fine-tune if classroom review still finds the campaign too hard

### Party SFX catalog (hand-authored preferred)

Drop files as `server/data/audio/{id}.mp3`. Missing files fall back (`hit_light` / `heal`).

| Id | Who / when | Pixabay vibe |
|----|------------|--------------|
| `act_healer` | Healer cast | heal chime (legacy `heal.mp3` still accepted) |
| `act_runesinger` | Runesinger attack | focused rune cast + impact |
| `act_lifebinder` | Lifebinder cast | leaf-and-chime renewal (falls back to legacy `hymn_cast` / `heal`) |
| `lifebinder_tick` | Lifebinder HoT tick | gentle restorative leaf/chime pulse |
| `act_vanguard` | Vanguard | shield bash / armor hit |
| `act_shieldmaiden` | Shield Maiden | sword strike |
| `act_firemage` | Fire Mage | fire cast burst |
| `act_archer` | Archer | bow / arrow volley |
| `act_spearman` | Spearman | spear thrust |
| `act_necromancer` | Necromancer | drain / ethereal suck |
| `act_thundercaller` | Thundercaller | lightning crack |
| `hurt_male` | Party hurt bubble (male art) | short male hit grunt, classroom-safe |
| `hurt_female` | Party hurt bubble (female art) | short female hit grunt, classroom-safe |
| `fizzle` | **Any** archetype plays an **F** token | spell fail / sad poof / comic fizzle (falls back to `explosion_f`) |
| `minion_moss_mite` | Moss Mite volley | soft chitter / nibble / squelch |
| `minion_cinder_imp` | Cinder Imp volley | small fire spit / ember |
| `minion_bone_archer` | Frost Archer volley | bone arrow whoosh |
| `minion_shot` | Generic add fallback | any small enemy hit |
| `music_ambient_lobby` | Lobby / between rooms loop | soft dark ambient, seamless 60–90s, **hand-authored only** |

**Art gender (locked with names):** male = Vanguard, Spearman, FireMage, Necromancer, Thundercaller; female = ShieldMaiden, Healer, Archer, Runesinger, Lifebinder.
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
| Lifebinder/Runesinger split + formation | `specialists.ts`, `combat.ts`, `partyRules.ts`, `lifebinder.test.ts`, `runesinger.test.ts` |
| Boss DoTs | `dots.ts`, `types.ts` `BossState.statuses` |
| Front-three targeting | branch `frontline-targeting-redesign`; fixed rows, Long Shot, Penetrate, Vanguard block |
| Progressive presentation | `presentation.ts` (shared+server), `CombatScreen.tsx` |
| DoT chips / future body FX | `statusUi.ts`, `StatusChips.tsx`; ramp on `DotInstance.escalationStep` |
| Outcome / stun audio-visual | `CombatScreen.tsx`, `audio.ts`, `bosses.ts`, `poses.ts` |
| Roster / names | `balance.ts` `ROSTER_COUNTS`, `seed/names.ts`, `seed/roster.ts` |
| Art loader | `PlaceholderPortrait.tsx`, `public/art/README.md` |

---

*End of handoff. Update this file when major rules or presentation contracts change.*
