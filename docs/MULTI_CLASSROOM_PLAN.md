# Multi-Classroom Teacher Management — Implementation Plan

**Branch:** `feat/teacher-management`  
**Status:** Implemented on `feat/teacher-management`  
**Last updated:** 2026-07-23

## 1. Intent (source of truth)

### Classroom loop
1. Students take a real-world test.
2. Teacher grades it and **enters grades for one room** in a classroom.
3. Teacher **opens that room** for the classroom.
4. Student teams (invite codes for that classroom) may form a party and **start only that open room**.
5. After victory they return to camp; **the next room stays locked** until the teacher enters the next test’s grades and opens the next room.
6. Different periods have different schedules → **multiple independent classrooms**.

### Isolation model
- Students **do not** pick or join a classroom by name.
- **Invite codes alone** isolate teams. A code always maps to one team, which belongs to one classroom.
- Wrong code → wrong team (or invalid). No cross-classroom lobby.

### Teacher capabilities per classroom
- Create / rename classrooms (Period 1, Period 3, …).
- Open a dashboard **scoped to that classroom** (same spirit as today’s teacher page).
- **Create teams** (name + invite code).
- Enter **grades per room**, then **open** that room.
- Pause, campaign path, reset/delete team, regenerate invite codes (existing tools, classroom-scoped).

---

## 2. Current state (what we change)

| Area | Today | Target |
|------|--------|--------|
| Classrooms | Single global `classroom.json` | Many classrooms under `data/classrooms/` |
| Token pool | One `masterTokenPool` for all fights | **Per classroom, per room** `tokenPool` |
| Room access | Any team can start if pool non-empty | Only if that classroom’s room is **open** |
| Create team | API exists; **no UI button** | Teacher creates teams in classroom dashboard |
| Team ownership | All teams on one classroom | `team.classroomId` |
| Pause | Global classroom pause | **Per-classroom** pause |
| Student join | Invite code only | Unchanged (code → team → classroom) |
| Victory → next | `roomIndex++`; free to enter next if pool exists | `roomIndex++`; next room requires open + grades |

---

## 3. Target data model

### `ClassroomState` (shared types)

```ts
interface ClassroomRoomSlot {
  tokenPool: Grade[];  // grades for this room only
  open: boolean;       // teacher has unlocked play for this room
}

interface ClassroomState {
  classroomId: string;
  name: string;                 // "Period 1"
  bossTemplateId: string | null;
  teamIds: string[];
  campaignLength: number;
  roomBossIds: string[];
  paused: boolean;
  rooms: ClassroomRoomSlot[];   // length === campaignLength
}
```

### `TeamState` addition

```ts
classroomId: string;  // required for new teams; backfilled on migrate
```

### Persistence

```
server/data/
  classrooms/
    cls_<id>.json      # one file per classroom
  teams/
    team_<id>.json     # unchanged shape + classroomId
  classroom.json       # LEGACY — migrated once then left unused
```

### Migration (on store load)
1. If `classrooms/` already has files → load multi-classroom world.
2. Else if legacy `classroom.json` exists:
   - Create one classroom (name **“Classroom”**, id `cls_migrated` or generated).
   - Map `masterTokenPool` → `rooms[0].tokenPool`; if pool non-empty, set `rooms[0].open = true` so existing play doesn’t brick.
   - Attach all existing teams; set `team.classroomId`.
   - Write new files; keep legacy file as-is (do not delete automatically).
3. Else → empty world (teacher creates first classroom).

### Room array helpers
- When `campaignLength` grows/shrinks: pad new rooms with `{ tokenPool: [], open: false }`; trim trailing rooms carefully (only if no team is mid-campaign past that index — simplest: pad/trim slots, never auto-open).

---

## 4. Server behavior

### Resolve classroom for a team
```
team.classroomId → classroom
// fallback: if missing, first classroom that lists teamId (migration safety)
```

### `startFight` gate (student + teacher force-start)
For `roomIndex = team.roomIndex`:
1. Classroom not paused.
2. `rooms[roomIndex]` exists.
3. `rooms[roomIndex].open === true` else **403** clear message: *“Room N is not open yet — wait for your teacher.”*
4. `rooms[roomIndex].tokenPool.length > 0` else **400**.
5. `startFight(team, bossForRoom(...), rooms[roomIndex].tokenPool)`.

Mid-fight token consumption stays on the team’s own `tokens` copy (unchanged). Changing grades after open does **not** rewrite an in-progress fight.

### Victory / continue
- Unchanged: advance `roomIndex`, go to `between_rooms`.
- **Do not** auto-open the next room.
- Student may form party but cannot start until teacher opens next room.

### Pause
- `requirePlayable(team)` checks **that team’s classroom** `paused` flag (not a global flag).
- Join by code: resolve team first, then check its classroom pause.

### Invite codes
- Globally unique across all teams (already).
- Regenerate still avoids collisions.

### Teacher open room rules
- **Open** requires non-empty `tokenPool` for that room.
- **Close** always allowed (blocks new starts; does not abort active fights).
- Setting grades does **not** auto-open (teacher must click Open).
- Replacing grades while open is allowed (next start-fight uses new pool).

---

## 5. API design

### Classrooms
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/teacher/classrooms?pin=` | List `{ classroomId, name, teamCount, paused }` |
| POST | `/api/teacher/classrooms` | Create `{ pin, name }` |
| PATCH | `/api/teacher/classrooms/:cid` | Rename `{ pin, name }` |
| DELETE | `/api/teacher/classrooms/:cid` | Delete classroom + its teams (double-confirm on client) |

### Classroom-scoped (replace global teacher routes)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/teacher/classrooms/:cid/overview?pin=` | Full overview for one classroom |
| POST | `.../grades` | `{ pin, roomIndex, grades }` → set room token pool |
| POST | `.../rooms/:roomIndex/open` | `{ pin, open }` |
| POST | `.../pause` | `{ pin, paused }` |
| POST | `.../campaign` | path length / bosses |
| POST | `.../campaign/default` | reset default 6-room path |
| POST | `.../teams` | create team in this classroom |
| POST | `.../teams/:id/reset` | existing |
| POST | `.../teams/:id/delete` | existing |
| POST | `.../teams/:id/invite-code` | existing |
| POST | `.../teams/:id/force-round` | existing |
| POST | `.../teams/:id/start-fight` | respects open + room pool |

### Student
| Method | Path | Change |
|--------|------|--------|
| POST | `/api/join` | Unchanged shape; enrich adds room gate info |
| POST | `/api/team/:id/start-fight` | Gate + use room pool |
| Other team routes | | Pause checks classroom of team |

### Enrich / overview extras
**Team enrich:**
- `classroomId`, `classroomName`
- `rooms`: `[{ roomIndex, open, hasGrades, bossId }]` for lobby UI
- `canStartCurrentRoom: boolean`
- `startBlockedReason: string | null`

**Classroom overview:**
- Room slots with pool length + open flags
- Teams belonging only to this classroom
- Campaign fields as today

### Sockets
- `subscribe:teacher` (pin) → join `teacher`; emit classroom list updates.
- `subscribe:classroom` ({ pin, classroomId }) → join `teacher:cls:<id>`; emit `teacher:overview` for that classroom.
- On classroom mutations, emit to that room + refresh list if needed.
- Team broadcasts: still `team:<id>`; include enrich with room state.

### Legacy routes
Remove or thin-wrap old `/api/teacher/grades`, `/overview`, `/pause`, `/teams` without classroom id — **prefer full cutover** in this feature branch (single teacher UI rewrite). Keep `/api/teacher/audio/*` as global.

---

## 6. Client UX

### Teacher flow
1. **Login** (PIN) → **Classroom list**
   - Cards: name, team count, paused badge
   - **Create classroom** (name field)
   - Open classroom → dashboard
2. **Classroom dashboard** (per period)
   - Header: name, pause/resume, back to list
   - **Rooms board** (primary): for each room 1..N
     - Boss name
     - Grade paste / generate pool for **this room**
     - Token count preview
     - **Open room** / **Close room** (disabled open if no grades)
     - Status chip: Locked | Ready (grades, closed) | Open
   - **Campaign path** (existing boss pickers)
   - **Teams**
     - **Create team** (name) → show invite code
     - Table: code, phase, room, actions (change code, reset, delete)

### Student lobby
- Campaign bar shows all rooms with states:
  - **Cleared** (green)
  - **Current + open** (pulse / enter enabled)
  - **Current + locked** (visible, “Waiting for teacher”)
  - **Future** (dim)
- Enter button disabled when `!canStartCurrentRoom`; show `startBlockedReason`.
- No classroom picker anywhere.

### Create team note
API already existed; this plan **surfaces it in the UI** and scopes it to a classroom.

---

## 7. Phased delivery

### Phase 1 — Data model + store + migration
- Extend shared types (`ClassroomRoomSlot`, multi-classroom fields, `TeamState.classroomId`).
- Rewrite `GameStore` for multi-classroom load/save + migration.
- Unit-test: migrate legacy shape; pad rooms; invite uniqueness; open requires grades.

### Phase 2 — Server API + fight gating
- Classroom CRUD + overview.
- Room grades + open endpoints.
- Scope pause, create team, campaign to classroom.
- `startFight` uses room pool + open check.
- Enrich payloads for lobby/teacher.
- Socket rooms per classroom.

### Phase 3 — Teacher UI
- Classroom list + create.
- Classroom dashboard with rooms board, create team, scoped tools.
- Wire client `api.ts` to new routes.

### Phase 4 — Student lobby UX
- Room status strip + locked enter messaging.
- Ensure victory → camp does not imply next room is playable.

### Phase 5 — Verify
- `npm test` + build.
- Manual smoke: two classrooms, different open rooms, codes don’t cross.

---

## 8. Non-goals (this upgrade)
- Student “join classroom” screen.
- Per-team grade pools (pool is per classroom room, shared by all teams in that period).
- Auto-open next room after victory.
- Cloud multi-tenant auth / multiple teacher PINs.
- Changing combat math or boss content.

---

## 9. Risk notes
- **In-progress fights** during deploy: migration opens room 0 if legacy pool existed — safe for current playtests.
- **Campaign length change** while teams mid-run: pad/trim room slots; do not force-open.
- **Delete classroom**: cascade delete teams + files; UI double-confirm.
- **Teacher force start-fight** must obey the same open gate (no bypass of curriculum).

---

## 10. Acceptance checklist
- [x] Teacher creates Period 1 and Period 3 independently.
- [x] Teacher creates teams in Period 1; codes work only for those teams.
- [x] Grades for Room 1 + Open → Period 1 teams can enter Room 1 only.
- [x] After Room 1 clear, Room 2 locked until grades + open.
- [x] Period 3 can be on a different open room at the same time.
- [x] Pause Period 1 does not pause Period 3.
- [x] Legacy single-classroom data migrates without manual file edits.
- [x] Student UI never asks for classroom id/name.

**Automated coverage:** `server/src/db/store.test.ts` (normalize + multi-classroom + legacy migrate). Full combat suite still green.
