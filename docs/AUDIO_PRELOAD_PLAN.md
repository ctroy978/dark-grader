# Audio preload plan (remote lag fix)

## Problem

Combat SFX/VO lag on remote student machines because clips are fetched from
`/api/audio/:id` **on first play**. Presentation cues fire on a timer; if the
MP3 is not already local, sound starts late relative to animation.

The full bank is small (~90 MP3s, ~3.6 MB under `server/data/audio/`), so
eager client preload is appropriate.

## Goals

1. Download and warm every **cached** clip before (or early in) a session so
   `play()` does not pay network RTT mid-fight.
2. Keep current APIs (`play`, `playExclusive`, ambient music) working.
3. Fail soft: missing/failed clips must not block lobby or combat.
4. Be idempotent across lobby → combat transitions (one shared preload job).

## Non-goals

- Web Audio API rewrite (possible later for tighter scheduling).
- Bundling MP3s into the Vite client build.
- Service Worker / PWA offline install (optional follow-up).
- Server API changes (manifest + long-lived clip cache headers already exist).

## Approach

### Core (`client/src/audio.ts`)

| Piece | Behavior |
|--------|----------|
| `preloadAudio(opts?)` | Ensure manifest, then download all `cached: true` clips (optional VO filter). |
| Concurrency | Cap parallel fetches (e.g. 6) to avoid saturating school Wi‑Fi. |
| Storage | `fetch` → `Blob` → `URL.createObjectURL` → `HTMLAudioElement` in existing `buffers` map, with version (`v`) for invalidation. |
| Ready wait | Resolve per-clip when `canplaythrough` / already ready / error. |
| Music | Preload ambient loop into the music element path the same way (or dedicated music buffer). |
| Shared job | Single in-flight `Promise` so lobby + combat can both call `preloadAudio` safely. |
| Progress | Optional `onProgress({ loaded, total })` for subtle UI later. |
| `play()` | Prefer preloaded buffer; if not ready, keep current create-and-play fallback. |

### Lifecycle wiring

1. **LobbyScreen** (mount, after prefs): `loadAudioManifest` → start `preloadAudio()` (do not block ambient).
2. **CombatScreen** (mount): `setAmbientDesired(false)` → `await preloadAudio()` so combat entry finishes warming if lobby was skipped or incomplete.
3. No hard “Loading sounds…” gate unless preload is still running after a short delay (optional; default is silent background).

### Clip set

- Preload all manifest entries with `cached: true`.
- Include VO even if VO is currently off (tiny pack; avoids lag when teacher/student enables VO mid-session).
- Skip unknown / uncached ids.

## Acceptance criteria

- First combat hit SFX on a cold remote client no longer waits on a network fetch after preload completes.
- Second visit to combat reuses buffers when `?v=` unchanged.
- Replacing an MP3 (new mtime/`v`) drops stale buffer and re-fetches.
- Mute / VO / music prefs still respected at play time.
- Client TypeScript build passes.

## Implementation order

1. Branch: `feat/audio-preload` (done).
2. Extend `client/src/audio.ts` with preload helpers + blob-backed buffers.
3. Wire Lobby + Combat mounts.
4. Build client; smoke-check types.

## Follow-ups (out of scope)

- Service Worker cache for multi-day lab machines.
- Static CDN hosting of audio.
- Web Audio decoded `AudioBuffer`s for sample-accurate overlap.
