# Scoring System Plan

**Status:** Implemented; awaiting badge art and classroom review  
**Created:** 2026-08-06  
**Branch:** `scoring-system`  
**Scope:** Team score, three academic badge tracks, badge assets, and teacher/student presentation

This document is the source of truth for the scoring-system branch. It supersedes the earlier scoring suggestions in `GAMEPLAY_EXPANSION_PLAN.md`. Magic items and new character archetypes are explicitly out of scope for this branch.

## 1. System summary

Each team has one persistent running score made from three badge tracks:

1. **Campaign Honors** — bosses defeated.
2. **Preservation Honors** — rooms cleared without permanent roster loss.
3. **Tempo Honors** — bosses cleared within their round limit.

Each qualifying room increases the relevant track by exactly one rank. A room can award at most one rank in each track. Replaying or retrying a room can never award the same rank twice.

For the default six-room campaign:

- Each track ranges from 0–6.
- The running team score is the sum of all three tracks.
- Maximum running score is 18.

The academic title and badge image for a track are determined by its current rank. The title is presentation; the numeric rank remains the durable source of truth.

There is no automatic Grit track. An automatic reward for losing and retrying would create an incentive to manufacture a defeat. Attempt history will still be recorded so the teacher can recognize a genuine comeback separately if desired in a later feature.

There is no Mastery track in this version.

## 2. Locked award ladders

### 2.1 Campaign Honors

Award one rank the first time the team clears each campaign room.

| Rank | Academic award |
|---:|---|
| 0 | Unranked |
| 1 | Commended |
| 2 | Merit Scholar |
| 3 | Honor Roll |
| 4 | Dean's List |
| 5 | Salutatorian |
| 6 | Valedictorian |

### 2.2 Preservation Honors

Award one rank when a team clears a room without losing any roster soldier permanently between its first attempt at that room and the eventual victory.

| Rank | Academic award |
|---:|---|
| 0 | Unranked |
| 1 | Merit |
| 2 | Citation |
| 3 | Commendation |
| 4 | Cum Laude |
| 5 | Magna Cum Laude |
| 6 | Summa Cum Laude |

Preservation uses permanent roster state, not momentary combat knockdowns. If a fallen soldier is revived and is alive when the attempt ends, that soldier does not count as a permanent loss. A soldier who remains dead when the attempt ends does count.

Deaths from failed attempts remain part of that room's Preservation history. Retrying the room does not erase them.

### 2.3 Tempo Honors

Award one rank when the victorious attempt ends on or before that boss's explicit Tempo round limit.

| Rank | Academic award |
|---:|---|
| 0 | Unranked |
| 1 | Hall Monitor's Medal |
| 2 | Teacher's Medal |
| 3 | Counselor's Medal |
| 4 | Dean's Medal |
| 5 | Provost's Medal |
| 6 | Chancellor's Medal |

Only the victorious attempt's round count is evaluated. Earlier failed attempts do not add rounds to the Tempo calculation, but permanent deaths from those attempts still affect Preservation.

## 3. Score rules

### 3.1 Running score

```text
team score = campaign rank + preservation rank + tempo rank
```

For a six-room campaign, the displayed score is `current / 18`.

Example:

```text
Campaign Honors:     4  (Dean's List)
Preservation Honors: 2  (Citation)
Tempo Honors:        3  (Counselor's Medal)
Running score:       9 / 18
```

The maximum should be calculated as `campaignLength × 3` rather than hard-coded, while visible badge art and academic ranks remain capped at six because classroom campaigns support at most six rooms.

### 3.2 Per-room award limits

Each room owns three boolean award results:

- `campaignAwarded`
- `preservationAwarded`
- `tempoAwarded`

Award calculation must be idempotent. Double-clicking Continue, reconnecting, replaying presentation, or retrying an already-recorded transition must not increment a rank again.

### 3.3 Retry behavior

- A defeat awards nothing immediately.
- A retreat awards nothing immediately.
- The attempt and its permanent losses are recorded.
- A later victory always awards Campaign Honors for that room once.
- A later victory may award Tempo Honors based on the victorious attempt.
- Preservation is unavailable if any permanent roster loss occurred from first entry into the room through victory.
- There is no retry penalty beyond the campaign consequences already created by damage and death.

### 3.4 Custom campaigns and repeated bosses

Awards belong to room indexes, not unique boss ids. If a teacher places the same boss in two rooms, each room can award its own three results.

A shorter campaign naturally has a lower maximum score. For example, a four-room campaign has a maximum score of 12 and cannot reach rank 5 or 6 in any track.

## 4. Tempo limits

Tempo should use a numeric content field rather than parsing display text such as `"8–12"`.

Add an explicit `tempo_round_limit` to every boss TOML definition and expose it through the boss template/API types. Initial limits should use the upper end of each existing recommended range:

| Boss | Initial Tempo limit |
|---|---:|
| Moss Grub | 8 |
| Ash Wraith | 12 |
| Cinder Herald | 12 |
| Rattle Captain | 12 |
| Barrow Warden | 14 |
| Bone Colossus | 18 |

These numbers are content configuration, not scoring-engine constants.

## 5. Persistent data model

The exact TypeScript names may change during implementation, but the persisted information should follow this shape:

```ts
interface TeamScoringState {
  version: 1;
  campaignRank: number;
  preservationRank: number;
  tempoRank: number;
  rooms: RoomScoreRecord[];
}

interface RoomScoreRecord {
  roomIndex: number;
  bossId: string;
  firstEntryLivingRoster: number;
  attempts: AttemptScoreRecord[];
  cleared: boolean;
  permanentLossOccurred: boolean;
  campaignAwarded: boolean;
  preservationAwarded: boolean;
  tempoAwarded: boolean;
  victoryRound: number | null;
  tempoRoundLimit: number | null;
}

interface AttemptScoreRecord {
  attemptNumber: number;
  startingPartyIds: string[];
  startingLivingRoster: number;
  endingLivingRoster: number | null;
  startedAtRound: number;
  endingRound: number | null;
  outcome: "active" | "victory" | "defeat" | "retreat";
}
```

The total score should normally be derived from the three ranks. It should not be an independently mutable persisted number that can drift out of sync.

### 5.1 Lifecycle hooks

- **Start fight:** Create the room record if needed and append a new active attempt.
- **Permanent death processing:** Mark the room as having a permanent loss when appropriate.
- **Victory detection:** Finalize the attempt, calculate the three awards once, and retain an award-result payload for the victory presentation.
- **Defeat:** Finalize the active attempt without awarding ranks.
- **Run away:** Finalize the active attempt as a retreat.
- **Continue to camp:** Preserve scoring state while ordinary fight state is cleared.
- **Teacher reset:** Reset scoring state with the rest of the campaign.

Victory scoring should occur when victory is established, not only when Continue is pressed, so the victory screen can immediately reveal badge upgrades.

### 5.2 Old-save migration

Older team JSON files will not contain scoring state. Loading must add migration-safe defaults.

For an existing team with cleared rooms:

- Set Campaign Honors rank to the existing `roomIndex`, capped by campaign length and six.
- Create legacy room records marking Campaign Honors as already awarded.
- Do not invent Preservation or Tempo awards because their historical facts are unknown.
- Begin complete attempt tracking with the team's current or next room.

This preserves earned campaign progress without awarding unverifiable badges.

## 6. Badge asset contract

The badge art will be supplied as completed PNG images. The client should not construct or stack badge layers at runtime.

Use one folder per badge track:

```text
client/public/art/badges/
  campaign/
    base.png
    1.png
    2.png
    3.png
    4.png
    5.png
    6.png
  preservation/
    base.png
    1.png
    2.png
    3.png
    4.png
    5.png
    6.png
  tempo/
    base.png
    1.png
    2.png
    3.png
    4.png
    5.png
    6.png
```

Asset meaning:

- `base.png` — the initial unranked badge.
- `1.png` through `6.png` — the complete precomposed badge image at that rank.

All images within a set should use the same canvas dimensions and transparent-background treatment so upgrading does not move the layout. Using the same dimensions across all three folders is preferred.

Add `client/public/art/badges/README.md` during implementation with this contract and the rank-to-title mappings. Until supplied art exists, the UI should fall back to a CSS placeholder containing the track initials and rank.

## 7. Shared scoring module

Create a pure shared module responsible for:

- The three track definitions.
- Locked rank-to-title mappings.
- Rank clamping from 0–6.
- Running-score and maximum-score calculation.
- Badge asset-path calculation.
- Room award evaluation from recorded facts.
- Student/teacher presentation summaries.

Keeping scoring calculations out of React and route handlers will make them reusable by the server, client, tests, and playtest scripts.

Suggested location:

```text
packages/shared/src/scoring.ts
```

## 8. Student presentation

### 8.1 Lobby and camp

Add an **Academic Honors** panel showing:

- The three current badge images.
- Current academic award title for each track.
- Six small progress marks per track.
- Running score and maximum score.
- Clickable badge art that opens a large, centered preview with the track and award title.

Students see only their own team's results. This branch will not add a public cross-team leaderboard.

### 8.2 Victory presentation

After a boss clear, reveal newly earned upgrades before returning to camp:

- Campaign badge always upgrades.
- Preservation badge upgrades if earned.
- Tempo badge upgrades if earned.
- If a track did not upgrade, show a short factual explanation without punitive language.

Example:

```text
Campaign Honors advanced to Honor Roll.
Preservation Honors advanced to Citation.
Tempo Honors not earned — cleared in round 14; target was 12.
```

## 9. Teacher presentation

Add scoring to each team summary:

- Running score and maximum.
- Three current ranks and titles.
- A six-room matrix showing which awards were earned in each room.
- Attempts, victorious round, permanent-loss flag, and Tempo limit for inspection.

The first implementation will report performance; it will not modify an external gradebook. A manual academic-bonus field can be designed separately after the automatic score is stable.

## 10. Test plan

### 10.1 Shared scoring tests

- Correct title and image for ranks 0–6.
- Rank clamping and custom campaign maximums.
- Running-score calculation.
- Campaign award on victory.
- Preservation award with no permanent roster loss.
- Preservation denied after a permanent loss on an earlier failed attempt.
- A revived soldier who remains alive does not count as a permanent loss.
- Tempo award at exactly the limit.
- Tempo denied one round beyond the limit.
- Awards remain idempotent.

### 10.2 Engine lifecycle tests

- First fight creates one active attempt.
- Defeat finalizes the attempt and retry creates the next attempt.
- Retreat finalizes without awards.
- Victory finalizes and awards exactly once.
- Continue/double Continue does not duplicate score.
- Score survives camp clearing and server persistence.
- Full teacher reset clears score.
- Existing teams migrate without losing campaign progress.
- Repeated boss ids in separate rooms score independently.

### 10.3 UI tests and manual checks

- Missing images use readable fallbacks.
- Rank-zero badges use `base.png`.
- Victory upgrade summary matches server results.
- Teacher and student totals agree.
- Long titles fit Chromebook layouts.
- All three badge folders can be populated without code changes.

### 10.4 Regression validation

- Run shared and server unit tests.
- Run a production build.
- Run campaign simulations to ensure score instrumentation does not alter combat RNG or outcomes.
- Confirm existing JSON saves load successfully.

## 11. Implementation slices

### Slice 1 — Types, content, and pure scoring

- Add scoring types and locked award mappings.
- Add numeric Tempo limits to boss content.
- Add pure calculations and shared tests.
- Add the badge asset README and placeholder behavior contract.

### Slice 2 — Engine persistence and lifecycle

- Add migration-safe scoring state to teams.
- Record attempts and permanent roster losses.
- Finalize and award on victory/defeat/retreat.
- Add engine and store tests.

### Slice 3 — API and teacher dashboard

- Expose scoring summaries and room detail.
- Add running score and badge matrix to team monitoring.

### Slice 4 — Student badge presentation

- Add Academic Honors to lobby/camp.
- Add victory upgrade reveals.
- Add resilient image fallbacks so supplied badge art can be dropped into place later.

### Slice 5 — Validation and documentation

- Run the complete test/build/simulation suite.
- Validate old-save migration and custom campaigns.
- Update README/HANDOFF with the shipped scoring rules and asset paths.

## 12. Explicitly deferred

- Automatic Grit scoring.
- Boss-specific Mastery scoring.
- Public team leaderboards.
- Student accounts or individual student scoring.
- Direct gradebook integration.
- Manual teacher bonus-point assignment.
- Magic items.
- Warden/Runesinger redesign.
- Centurion.
