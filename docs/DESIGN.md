# Dungeon Grades — Implementation Design

**Version**: 0.2 (decisions frozen)  
**Date**: 2026-07-14  
**Repo**: `ctroy978/dark-grader`  
**Audience**: Classroom deployment only (school server, firewall, no public internet requirement)

---

## 1. Confirmed Understanding

### 1.1 Core fantasy
After a test, a class’s letter grades become **power tokens**. Teams of students guide a fantasy party through one **dungeon room per test**. Bad grades create risk; good grades create power. Campaign HP persists across rooms so attrition matters.

### 1.2 Core loop (one round)
1. **Magnet phase** — On the shared team Chromebook, a student positions the Token Magnet under one of 6 soldiers (keys/buttons **1–6**). First/last press wins; no permissions model.
2. **Token drop** — Server draws **3 tokens** from the fight pool (reshuffle when exhausted).
3. **Claim resolution (server)** — For each token independently, claim odds relative to magnet:
   - Under magnet: **30%**
   - Adjacent (circular line; pos 1 ↔ 6): **20%** each
   - Others: **10%** each  
   Each soldier claims **at most one** token per round. Conflicts: re-roll among still-eligible soldiers (never silently drop a token if anyone can take it).
4. **Party actions** — Claimers act front→back using archetype × grade rules.
5. **DoT ticks** — After party actions (shield first, then characters).
6. **Boss phase** — Boss performs one modular attack; adds (if any) bias toward magnet position.
7. **End of round** — Persist HP; check win (boss HP ≤ 0) or wipe (all party dead).

### 1.3 Token Magnet intent
The magnet is the **only tactical lever**. Students aim high-value claim probability at the right specialist (e.g. Fire Mage when DoTs are up, Healer when HP is low), while risking bad grades landing on fragile characters.

### 1.4 How grades affect characters
- No claim → hold position (no action).
- Claimed **A–F** maps to that archetype’s row in the specialist table (see §6 balance).
- Ice DoT can **downgrade token quality by one step** before the effect resolves (A→B … D→F; F stays F).
- F tokens are often backfires/chaos, not merely “weak A”.

### 1.5 Deployment constraints (from product owner)
| Constraint | Decision |
|------------|----------|
| Audience | One classroom, not public SaaS |
| Security | Behind school firewall; keep auth minimal |
| Database | **SQLite** if persistence is needed |
| Clients per team | **One shared computer** — whoever presses 1–6 moves the magnet |
| Combat fairness | **Server-authoritative** rolls and resolution |
| Balance numbers | **§6 approved as v1 starting numbers** (rebalance after playtest) |
| Roster size | **~22 soldiers** (Archers trimmed to 6; see §6.0) |
| Round advance | **Explicit Commit / Drop Tokens** after magnet placement |
| Class session | **All teams share the same boss + grade pool** for the test day |

### 1.6 Multiplayer reality (simplified)
True multiplayer *within* a team is unnecessary for v1: three students share one browser. “Multiplayer” means:

- Many **teams** in one class, each with their own session against the same boss/token pool.
- A **teacher dashboard** that creates invite codes, injects grades, picks the boss, and optionally monitors progress.

Realtime is still useful (teacher live board, optional second screen), but not for three concurrent clients fighting over one magnet.

---

## 2. Goals for v1.0

### In scope
- Teacher: paste/enter grade list → token pool; create team invite codes; select boss; reset campaign/team.
- Student: join via code → lobby (roster + HP) → pick 6 of ~20 soldiers → combat → post-fight summary.
- Full combat loop with exact magnet math, specialist effects (all 9 archetypes), 4 DoTs, modular bosses, adds targeting.
- Persistence: soldier HP and deaths across rooms until final boss or teacher reset.
- UI: Darkest Dungeon–inspired side view (party left, gap/minions center, boss right; token cloud above; magnet under line).
- Chromebook-friendly: keyboard 1–6 + large touch targets; lightweight CSS animations.

### Out of scope for v1.0
- Public hosting, accounts, OAuth, rate limiting, multi-tenant schools.
- Full sprite sheets, heavy particle systems, elaborate audio.
- Spectator projection mode, mobile phone layout, lore unlocks.
- Perfect balance tuning (table is a starting point).

---

## 3. Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Client | **React + TypeScript + Vite + Tailwind** | Fast UI iteration; Chromebook Chrome is the target |
| Server | **Node + TypeScript + Fastify** (or Express) | Single process deployable on classroom server |
| Realtime | **Socket.io** (or Fastify WebSockets) | Push round updates + teacher monitor; optional |
| Persistence | **JSON files** under `server/data/` | Zero native deps; easy classroom reset; SQLite optional later |
| Package layout | **pnpm/npm workspaces** monorepo | Shared types between client and server |
| Art | CSS + static images (Grok Imagine later) | Spec preference for simple portraits + overlays |

**Not using** Firebase/Supabase/cloud PaaS unless requirements change — owner prefers local SQLite simplicity.

### High-level architecture

```
┌─────────────────┐     HTTP + WS      ┌──────────────────────────┐
│ Teacher browser │◄──────────────────►│                          │
└─────────────────┘                    │   Node game server       │
┌─────────────────┐     HTTP + WS      │   - REST API             │
│ Team Chromebook │◄──────────────────►│   - Combat engine        │
│ (shared client) │                    │   - Socket broadcasts    │
└─────────────────┘                    │   - SQLite (campaign)    │
                                       └──────────────────────────┘
```

- **Combat engine** is pure TypeScript on the server (unit-testable without UI).
- Clients are **views + input**: send `setMagnet(1-6)`, `readyForRound`, roster picks; receive full `TeamFightState` snapshots.
- Teacher mutations (`setTokenPool`, `selectBoss`, `resetTeam`) go through the same API.

---

## 4. Project Structure

```
dark-grader/
├── package.json                 # workspace root
├── docs/
│   ├── DESIGN.md                # this file
│   ├── Dungeon_Grades_Game_Spec.md
│   ├── Dungeon_Grades_UI_Spec.md
│   └── Initial_Development_Prompt.md
├── packages/
│   └── shared/                  # types + pure helpers used by both
│       └── src/
│           ├── types.ts
│           ├── magnet.ts        # claim probability tables
│           ├── balance.ts       # approved numbers
│           └── index.ts
├── server/
│   ├── package.json
│   ├── src/
│   │   ├── index.ts             # boot HTTP + WS
│   │   ├── db/
│   │   │   ├── schema.sql
│   │   │   └── client.ts
│   │   ├── routes/
│   │   │   ├── teacher.ts
│   │   │   ├── team.ts
│   │   │   └── health.ts
│   │   ├── realtime/
│   │   │   └── sockets.ts
│   │   ├── engine/
│   │   │   ├── combat.ts        # round orchestration
│   │   │   ├── claims.ts
│   │   │   ├── specialists.ts   # archetype × grade effects
│   │   │   ├── dots.ts
│   │   │   ├── bosses.ts
│   │   │   └── rng.ts
│   │   └── seed/
│   │       ├── roster.ts        # ~20–24 soldiers
│   │       └── bosses.ts        # Bone Colossus + templates
│   └── data/                    # gitignored: dungeon.sqlite
└── client/
    ├── package.json
    ├── index.html
    ├── src/
    │   ├── main.tsx
    │   ├── App.tsx
    │   ├── api/
    │   ├── hooks/
    │   ├── screens/
    │   │   ├── JoinScreen.tsx
    │   │   ├── LobbyScreen.tsx
    │   │   ├── CombatScreen.tsx
    │   │   ├── SummaryScreen.tsx
    │   │   └── teacher/
    │   │       ├── Dashboard.tsx
    │   │       ├── GradeInput.tsx
    │   │       ├── BossSelect.tsx
    │   │       └── TeamManager.tsx
    │   ├── components/
    │   │   ├── PartyLine.tsx
    │   │   ├── TokenMagnet.tsx
    │   │   ├── TokenCloud.tsx
    │   │   ├── BossPanel.tsx
    │   │   ├── MinionGap.tsx
    │   │   ├── ActionLog.tsx
    │   │   └── Hud.tsx
    │   └── styles/
    └── public/
        └── assets/              # portraits, icons
```

---

## 5. Core Data Models

```ts
// packages/shared/src/types.ts (conceptual)

export type Grade = "A" | "B" | "C" | "D" | "F";
export type Archetype =
  | "Vanguard"
  | "ShieldMaiden"
  | "FireMage"
  | "Healer"
  | "Archer"
  | "Doomcaller"
  | "Necromancer"
  | "Thundercaller"
  | "Runesinger";

export type DotType = "Fire" | "Ice" | "Poison" | "Slime";

export interface DotInstance {
  type: DotType;
  stacks: number;
  duration: number; // rounds remaining
}

export type StatusTag =
  | { kind: "Mark" }
  | { kind: "Stun"; duration: number }
  | { kind: "Weaken"; duration: number }
  | DotInstance;

export interface Soldier {
  id: string;
  name: string;
  archetype: Archetype;
  maxHp: number;
  currentHp: number;
  /** 1–6 in combat; null if not in active party */
  position: 1 | 2 | 3 | 4 | 5 | 6 | null;
  statuses: StatusTag[];
  alive: boolean;
}

export interface PartyShield {
  remaining: number; // Shield Maiden 1d6 at fight start
  active: boolean;
}

export interface TokenPool {
  remaining: Grade[];
  discard: Grade[]; // reshuffled into remaining when empty
}

export interface ClaimResult {
  token: Grade;
  soldierId: string;
  /** grade after Ice downgrade, if any */
  effectiveGrade: Grade;
}

export interface RoundLogEntry {
  round: number;
  text: string;
  tags?: string[];
}

export interface Minion {
  id: string;
  name: string;
  currentHp: number;
  maxHp: number;
  damage: number;
}

export interface BossState {
  id: string;
  name: string;
  maxHp: number;
  currentHp: number;
  traits: string[];
  attackIds: string[];
  /** for scripted sequences; -1 = pure random */
  sequenceIndex: number;
}

export type FightPhase =
  | "awaiting_magnet"
  | "resolving"
  | "victory"
  | "defeat"
  | "between_rooms";

export interface TeamState {
  teamId: string;
  inviteCode: string;
  name: string;
  roster: Soldier[]; // full campaign roster
  activePartyIds: string[]; // length 6 when fighting
  magnetPosition: 1 | 2 | 3 | 4 | 5 | 6;
  partyShield: PartyShield;
  tokens: TokenPool;
  boss: BossState | null;
  minions: Minion[];
  phase: FightPhase;
  round: number;
  log: RoundLogEntry[];
  roomIndex: number;
}

export interface ClassroomSession {
  id: string;
  bossTemplateId: string | null;
  masterTokenPoolTemplate: Grade[]; // source grades for new fights
  teams: string[]; // team ids
}

// Teacher inputs grades → masterTokenPoolTemplate
// Starting a fight: copy/shuffle pool onto TeamState.tokens
```

### SQLite tables (sketch)

- `classroom` — singleton-ish session config, selected boss id, master grades JSON  
- `teams` — id, invite_code, name, room_index, phase, magnet, shield JSON, tokens JSON, boss JSON, minions JSON, log JSON  
- `soldiers` — team_id, soldier snapshot columns / JSON blob for roster  

v1 may store most of `TeamState` as JSON blobs in SQLite for speed of iteration; normalize later only if needed.

---

## 6. Balance Table (approved starting numbers)

Numbers below are **frozen for v1 implementation**. Tune after classroom playtests.

### 6.0 Roster composition (22 soldiers)

| Archetype | Count |
|-----------|-------|
| Vanguard | 2 |
| Shield Maiden | 3 |
| Fire Mage | 3 |
| Healer | 2 |
| Archer | **6** |
| Doomcaller | 1 |
| Necromancer | **1** |
| Thundercaller | **3** |
| Runesinger | **1** |
| **Total** | **22** |

### 6.1 Base HP by archetype

| Archetype | Max HP | Role note |
|-----------|--------|-----------|
| Vanguard | 55 | Front tank |
| Shield Maiden | 48 | Secondary tank / shield |
| Fire Mage | 38 | Glass DPS / cleanse |
| Healer | 40 | Sustain |
| Archer | 36 | Baseline DPS |
| Doomcaller | 42 | Utility / death payoffs |
| Necromancer | 40 | Drain sustain |
| Thundercaller | 38 | Burst / chain |
| Runesinger | 40 | Buff / debuff |

### 6.2 Damage / effect tiers (generic scale)

| Grade | Relative power | Typical single-target boss damage |
|-------|----------------|-------------------------------------|
| A | Excellent | 14–18 |
| B | Good | 10–13 |
| C | Average | 7–9 |
| D | Poor | 3–5 |
| F | Backfire / chaos | 0 boss dmg, party risk |

Boss HP targets: **~280–320** for early rooms (≈ 8–14 rounds with mixed grades).  
**Bone Colossus** sample: **300 HP**.

### 6.3 Archetype × grade effects (concrete)

**Vanguard** (block absorbs before personal HP; block lasts until next own action or end of boss phase — *decide*: **block is a one-round absorb pool applied to this soldier only**.)

| Grade | Effect |
|-------|--------|
| A | Gain **12 block**. Deal **12** boss (or add) damage. |
| B | Gain **9 block**. Deal **10** damage. |
| C | Gain **6 block**. Deal **7** damage. |
| D | Gain **3 block**. No attack. |
| F | No block. No attack. |

**Shield Maiden** (fight start: party shield = `1d6`, range 1–6).

| Grade | Effect |
|-------|--------|
| A | Deal **14** damage. |
| B | Deal **11** damage. |
| C | **Reroll** party shield to fresh `1d6` (even if depleted). |
| D | Deal **4** damage. |
| F | No attack. If party shield active, **short-circuit**: party loses **1 HP** distributed as 1 damage to magnet position (shield first). |

**Fire Mage** (“burn DoTs” = **cleanse** those DoT types; cannot cleanse Fire.)

| Grade | Effect |
|-------|--------|
| A | Deal **16** damage. Cleanse **all** Ice/Poison/Slime on entire party. |
| B | Deal **12** damage. Cleanse Ice/Poison/Slime on positions **1–3**. |
| C | Deal **10** damage. Deal **2** damage to each of positions **1–2** (friendly fire). |
| D | Deal **5** damage. Deal **3** damage to each of positions **1–2**. |
| F | **Explosion**: **3** damage to **all** party members (shield first). No boss damage. |

**Healer** (heals never exceed max HP.)

| Grade | Effect |
|-------|--------|
| A | Heal **all** living party **10**. Remove **Mark** from all. |
| B | Heal positions **1–3** for **10** each. Remove **Mark** from them. |
| C | Heal positions **1–3** for **6** each. |
| D | Heal **self** for **8**. |
| F | **Backlash**: boss heals **12** (or +12 current HP, capped at max). |

**Archer**

| Grade | Effect |
|-------|--------|
| A | **18** damage (volley). |
| B | **13** damage. |
| C | **9** damage. |
| D | **4** damage. |
| F | **Misfire**: **3** boss damage + **1–2** damage to one random living ally (uniform). |

**Doomcaller** (curse = boss takes **+X%** damage until cleared or N rounds; zombie on death defined below.)

| Grade | Curse | Zombie-on-death (this fight) |
|-------|-------|------------------------------|
| A | Boss takes **+25%** damage for **3** rounds | On death: deal **20** to boss, no ally harm |
| B | **+15%** for **3** rounds | Deal **12** to boss |
| C | **+10%** for **2** rounds | Deal **6** to boss |
| D | **+5%** for **2** rounds | **3** damage to random ally on death |
| F | Boss gains **+10%** damage dealt for **2** rounds | On death: **8** damage to all allies |

Only the **latest** Doomcaller curse applies (replace, don’t stack).

**Necromancer**

| Grade | Effect |
|-------|--------|
| A | **12** boss damage + heal lowest-HP ally **10**. |
| B | **9** boss + heal lowest-HP ally **6**. |
| C | **6** boss + heal lowest-HP ally **3**. |
| D | **4** boss + **3** self damage. |
| F | **Backlash**: boss heals **8** *or* self takes **6** (50/50). |

**Thundercaller** (chain: primary target boss/adds, bounce to adds first then boss)

| Grade | Effect |
|-------|--------|
| A | **14** primary + **8** to up to 2 other enemies. **30%** stun boss **1** round. |
| B | **11** primary + **5** to 1 other enemy. |
| C | **9** single target. |
| D | **6** single + **3** to one random ally. |
| F | **Overload**: **5** damage to all allies; **0** boss damage. |

**Runesinger**

| Grade | Effect |
|-------|--------|
| A | Party gains **+3** damage on attacks this round *or* boss **−3** damage next attack (player choice default: party buff). |
| B | Party **+2** damage this round. |
| C | Party **+1** damage this round. |
| D | Self only: next action **+4** damage if they act again (usually wasted same round). |
| F | Boss gains **+4** damage on next attack *or* party **−2** outgoing damage next round (default: boss buff). |

### 6.4 DoTs

| DoT | Tick damage | Default duration | Special |
|-----|-------------|------------------|---------|
| **Fire** | **4** / tick | **3** rounds | High pressure; Fire Mage cannot cleanse |
| **Ice** | **3** / tick | **3** rounds | Flat; claim downgrade while up. Natural expiry → soft Frozen 1 turn (attack blocked, heals OK). Frost Archer arrows. |
| **Poison** | **3** / tick | **4** rounds | Damage split: magnet **30%**, adjacent **20%** each, remaining **30%** split among the other three (equal shares). Tick total = 3 × stacks. |
| **Slime** | **2** / tick | **Until cleansed** | Flat chip only (no token slow). Stack cap 1. Fire Mage A/B or Doomcaller strip. Moss Mite on-hit. |

**Order each round after party actions:** apply all DoT ticks → shield absorbs first → then HP. Duration decrements at end of tick phase. Stacks refresh duration on re-apply (simple v1).

### 6.5 Party shield
- Applied at fight start: `randomInt(1, 6)`.
- Absorbs **all** incoming party damage and DoT damage until `remaining = 0`.
- Then Shield Maidens fight as normal attackers (still use their token table).

### 6.6 Targeting priority
While any minion is alive, **all party damage abilities hit minions first** (lowest id / leftmost), overflow to boss only if the ability is explicitly multi-target and kills the add mid-resolution (v1: full ability damage to first living add, no overflow unless ability is chain-type).

### 6.7 Sample boss: Bone Colossus

| Field | Value |
|-------|-------|
| Max HP | 340 |
| Traits | Undead, Enrage (&lt;40% HP → +25% damage) |
| Attacks (pool) | FrontSlam, LineAttack, CrushMagnet, SummonBoneArchers, PoisonCloud, Regenerate (weighted; regen rare) |

| Attack | Effect |
|--------|--------|
| FrontSlam | **14** damage split across positions **1–2** (7 each), shield first |
| LineAttack | **5** to all positions |
| Regenerate | Boss heals **15** |
| SummonBoneArchers | Spawn **2** archers (HP **12**, attack **4**, magnet-biased) if fewer than 2 adds |
| PoisonCloud | Apply **Poison** (1 stack, duration 4) to positions **2–4** |

Adds attack after boss action: each add hits one soldier with weight magnet 40%, adjacent 20% each, others equal remainder.

### 6.8 Inter-room healing
Only **Vanguards** still alive: once between rooms, each living Vanguard grants **+20% of max HP** heal to positions that will be front-line *or* party-wide **+15%** once (pick one rule for v1: **party-wide 20% of each soldier’s max HP if ≥1 living Vanguard**).

### 6.9 Death
- `currentHp ≤ 0` → `alive = false`, removed from future room selection.
- Doomcaller zombie effects fire once on death.

---

## 7. Combat Engine Flow (server)

```
startFight(teamId, bossId, tokenPool)
  → init shield 1d6, place party, phase=awaiting_magnet, round=1

onMagnet(teamId, pos 1..6)
  → set magnetPosition (anytime before resolve)

onAdvanceRound(teamId)  // teacher force OR auto after short lock OR student "Commit"
  → phase=resolving
  → draw tokens by living count (6/5/4→3, 3→2, 2/1→1)
  → resolve claims (per-token weighted RNG, max 1 per soldier)
  → apply Ice downgrades to effective grades
  → party actions front→back
  → DoT ticks
  → deaths / Doomcaller
  → if minions: party already targeted them during actions
  → boss attack + add attacks
  → deaths again
  → win/lose checks
  → else round++, phase=awaiting_magnet
  → persist + broadcast snapshot
```

**RNG**: seeded per fight optional (`seed` stored) for reproducibility in debugging; default crypto/random.

**Commit UX (frozen)**: Students set the magnet, then press **Drop Tokens** (Commit). No auto-timer. Teacher can still **Force Next Round** from the dashboard.

---

## 8. API Surface (sketch)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/teacher/grades` | Set master grade list |
| POST | `/api/teacher/boss` | Select boss for class |
| POST | `/api/teacher/teams` | Create team + invite code |
| POST | `/api/teacher/teams/:id/reset` | Reset team campaign |
| POST | `/api/teacher/teams/:id/force-round` | Advance round |
| GET | `/api/teacher/overview` | All teams status |
| POST | `/api/join` | `{ code }` → team session |
| POST | `/api/team/roster` | Select 6 soldiers |
| POST | `/api/team/magnet` | `{ position }` |
| POST | `/api/team/commit-round` | Resolve current round |
| GET | `/api/team/state` | Full snapshot |
| WS | `/ws` | Subscribe team or teacher channel |

Auth for teacher: simple shared **classroom PIN** in env file (`TEACHER_PIN=...`). Students only need invite codes. Sufficient for firewall LAN use.

---

## 9. UI Implementation Plan

Follow `Dungeon_Grades_UI_Spec.md` layout:

1. **Combat shell** — 16:9 flex grid: party | gap | boss; cloud top; HUD bottom.
2. **Token Magnet** — CSS absolute under slots 1–6; `transition: transform 200ms`; glow pulse.
3. **Token cloud** — 5–6 letter tokens bobbing; fall animation on commit.
4. **Character cards** — HP bar, status icons, claimed token badge.
5. **Teacher dashboard** — four panels (grades, boss, teams, monitor).

Animation priority matches UI spec §8.6.

Theme tokens (Tailwind): navy `#0b1220`, crimson `#7a1f2b`, parchment `#e6d3b3`, grade colors as specified.

---

## 10. Testing Strategy

| Layer | What |
|-------|------|
| Unit | Magnet distribution (empirical ~100k rolls), claim uniqueness, Ice step-down, shield absorb, DoT order |
| Unit | Each archetype grade effect pure functions |
| Unit | Boss attack resolvers + add bias |
| Integration | Full round with fixture seed |
| Manual | Chromebook Chrome: touch 1–6, one team fight through Bone Colossus |

---

## 11. Implementation Phases (PR Plan)

### PR1 — Monorepo scaffold
- Vite React client, Node server, shared package, Tailwind, SQLite boot, health check, teacher PIN stub.
- **Depends on**: nothing.

### PR2 — Shared types + balance module
- Types from §5; balance constants from §6 (once approved); magnet probability helpers.
- **Depends on**: PR1.

### PR3 — Combat engine (headless)
- Claims, specialists, DoTs, Bone Colossus, win/lose; unit tests; no UI.
- **Depends on**: PR2.

### PR4 — Team/teacher API + persistence
- Invite codes, roster select, magnet, commit-round, grade pool, boss select, SQLite snapshots.
- **Depends on**: PR3.

### PR5 — Student combat UI foundation
- Layout zones, magnet control, token cloud placeholder, HP bars, action log wired to snapshots.
- **Depends on**: PR4.

### PR6 — Teacher dashboard UI
- Grade input, boss select, team list, force round / reset.
- **Depends on**: PR4.

### PR7 — Full specialists + DoT polish + adds
- Finish any stubbed archetypes; DoT icons; minion gap; shield break VFX.
- **Depends on**: PR5.

### PR8 — Campaign flow + post-fight
- Inter-room Vanguard heal, death permanence, summary screen, multi-room progression.
- **Depends on**: PR5–PR7.

### PR9 — Animation/audio polish (optional)
- Spec priority list; mute toggle; performance pass on low-end Chromebook.
- **Depends on**: PR7.

---

## 12. Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Hosting model | Single Node + SQLite on LAN | Classroom-only, firewall, owner preference |
| Team clients | One browser per team | Three students share one machine |
| Authority | Server resolves combat | Fair RNG, single source of truth |
| Magnet control | Last input wins, no roles | Matches “whoever hits the button” |
| Backend services | No cloud BaaS | Simplicity over elastic scale |
| Balance | §6 approved as v1 starting numbers | Spec was qualitative; code needs numbers |
| Roster | 22 soldiers; Archers 6; fewer late specialists | Fits ~20–24 band |
| Commit step | Explicit “Drop Tokens” after magnet | Allows table discussion before RNG |
| Class coupling | Shared boss + grade pool for all teams | One test day = one dungeon room setup |
| Teacher auth | Shared PIN | Enough for trusted LAN |
| State storage | SQLite JSON blobs for TeamState | Ship faster; normalize later if needed |
| Claim conflicts | Re-roll among eligible | Preserve all 3 tokens when possible |

---

## 13. Resolved Product Decisions

| Topic | Decision |
|-------|----------|
| Balance §6 | Approved as starting numbers |
| Roster | 22 soldiers (see §6.0) |
| Round advance | Explicit Commit / Drop Tokens |
| Same-day fights | All teams same boss + same grade pool |

### Remaining minor defaults (no blocker)

| Topic | Default unless you object |
|-------|---------------------------|
| Soldier names | Fantasy placeholder names in seed data |
| Deploy OS | Linux server scripts first |
| Runesinger A/F choice | Automatic defaults in §6 (party buff / boss buff) |

---

## 14. Immediate Next Steps

1. ~~Freeze balance and product decisions~~ **done**
2. Scaffold monorepo (PR1)
3. Shared types + balance module (PR2)
4. Headless combat engine + tests (PR3)
5. API + SQLite (PR4)
6. Student combat UI + teacher dashboard (PR5–PR6)

---

**End of design draft**
