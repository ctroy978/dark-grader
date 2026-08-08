/**
 * Client audio: lobby ambient (HTMLAudio loop) + combat SFX/VO (Web Audio).
 *
 * One-shot clips are fetch→decodeAudioData'd during preload so play() starts
 * from memory with no network RTT. HTMLAudioElement reuse was lagging / going
 * silent on remote machines (interrupted play(), cold fetch mid-cue).
 */

export type AudioManifestClip = {
  id: string;
  kind: string;
  cached: boolean;
  bytes: number;
  /** File mtime ms from server — used as ?v= so replaced mp3s are not stuck in HTTP cache. */
  v: number;
  volume: number;
};

export type AudioPreloadProgress = {
  loaded: number;
  total: number;
  done: boolean;
};

type Manifest = {
  clips: AudioManifestClip[];
  elevenlabsConfigured: boolean;
};

type DecodedClip = {
  buffer: AudioBuffer;
  v: number;
};

/** Lobby / camp ambient bed — hand-authored loop at server/data/audio/ */
export const MUSIC_AMBIENT_ID = "music_ambient_lobby";

/** Parallel fetch/decode cap — keeps school Wi‑Fi from being flooded. */
const PRELOAD_CONCURRENCY = 6;

let manifest: Manifest | null = null;
let muted = false;
let voEnabled = false;
/** Soft dark music under lobby/camp. Default on; independent of SFX mute. */
let musicEnabled = true;
/**
 * True when the current screen wants ambient (lobby / between rooms).
 * Combat sets false so fight SFX stay clear.
 */
let ambientDesired = false;
let masterVolume = 0.7;

/** Decoded one-shot SFX/VO (Web Audio). */
const decoded = new Map<string, DecodedClip>();
/** In-flight decode jobs so concurrent play/preload share one fetch. */
const decodeJobs = new Map<string, Promise<AudioBuffer | null>>();

let audioCtx: AudioContext | null = null;
/** Live one-shot sources — stopped by stopAllSfx / exclusive. */
const activeSources = new Set<AudioBufferSourceNode>();

/** Separate looping element for music (not Web Audio one-shots). */
let musicEl: HTMLAudioElement | null = null;
let musicV = -1;
let musicObjectUrl: string | null = null;
/** Browser blocked autoplay — retry on next user gesture. */
let ambientNeedsGesture = false;
/**
 * While > Date.now(), one-shot play() is suppressed and ambient stays paused
 * so a long exclusive sting (e.g. run_away) is not mixed with other SFX.
 */
let exclusiveUntilMs = 0;
let exclusiveEndTimer: ReturnType<typeof setTimeout> | null = null;
/** Clip currently owned by playExclusive — cleared when it ends or is superseded. */
let exclusiveClipId: string | null = null;

/** Shared in-flight preload so lobby + combat share one job. */
let preloadPromise: Promise<void> | null = null;
/** Manifest fingerprint that completed preload (skip re-download). */
let preloadedKey: string | null = null;
let lastPreloadProgress: AudioPreloadProgress = {
  loaded: 0,
  total: 0,
  done: false,
};
/**
 * Bumps on every syncAmbientMusic entry so stale async .play() calls cannot
 * restart the bed after combat/mute/music-off has already paused it.
 */
let ambientSyncGen = 0;

/** URL for a clip; includes ?v=<mtime> when the server reported a version. */
function clipUrl(id: string): string {
  const clip = manifest?.clips.find((c) => c.id === id);
  const v = clip?.v ?? 0;
  return v > 0 ? `/api/audio/${id}?v=${v}` : `/api/audio/${id}`;
}

function clipVersion(id: string): number {
  return manifest?.clips.find((c) => c.id === id)?.v ?? 0;
}

function manifestKey(m: Manifest | null): string {
  if (!m) return "";
  return m.clips
    .map((c) => `${c.id}:${c.v}:${c.cached ? 1 : 0}`)
    .join("|");
}

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    audioCtx = new AC();
  }
  return audioCtx;
}

/**
 * Resume Web Audio after a user gesture (required on Chrome / remote browsers).
 * Also retries ambient if autoplay was blocked earlier.
 */
export async function unlockAudioFromGesture(): Promise<void> {
  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
  } catch {
    /* ignore */
  }
  if (ambientNeedsGesture) {
    ambientNeedsGesture = false;
    void syncAmbientMusic();
  }
}

/** Alias — lobby pointer handlers historically called this name. */
export function unlockAmbientFromGesture(): void {
  void unlockAudioFromGesture();
}

function disposeMusic(): void {
  if (musicEl) {
    try {
      if (!musicEl.paused) musicEl.pause();
    } catch {
      /* ignore */
    }
  }
  if (musicObjectUrl) {
    try {
      URL.revokeObjectURL(musicObjectUrl);
    } catch {
      /* ignore */
    }
    musicObjectUrl = null;
  }
  musicEl = null;
  musicV = -1;
}

/** Drop decoded / music buffers whose on-disk version changed. */
function dropStaleBuffers(): void {
  for (const [id, entry] of decoded) {
    if (entry.v !== clipVersion(id)) {
      decoded.delete(id);
      decodeJobs.delete(id);
    }
  }
  const mv = clipVersion(MUSIC_AMBIENT_ID);
  if (musicEl && musicV !== mv) {
    disposeMusic();
  }
}

async function fetchClipArrayBuffer(id: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(clipUrl(id));
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

/**
 * Fetch + decode a one-shot clip into an AudioBuffer (shared in-flight job).
 */
async function ensureDecoded(id: string): Promise<AudioBuffer | null> {
  const clip = manifest?.clips.find((c) => c.id === id);
  if (!clip?.cached) return null;
  if (clip.kind === "music") return null;

  const v = clip.v ?? 0;
  const hit = decoded.get(id);
  if (hit && hit.v === v) return hit.buffer;

  const existingJob = decodeJobs.get(id);
  if (existingJob) return existingJob;

  const job = (async (): Promise<AudioBuffer | null> => {
    try {
      const ab = await fetchClipArrayBuffer(id);
      if (!ab || ab.byteLength < 64) return null;
      const ctx = getAudioContext();
      // decodeAudioData may detach the buffer — pass a copy
      const buffer = await ctx.decodeAudioData(ab.slice(0));
      decoded.set(id, { buffer, v });
      return buffer;
    } catch {
      return null;
    } finally {
      decodeJobs.delete(id);
    }
  })();

  decodeJobs.set(id, job);
  return job;
}

/** True when the lobby ambient bed is allowed to audibly run. */
function shouldPlayAmbient(): boolean {
  return ambientDesired && !muted && musicEnabled && !isExclusiveActive();
}

async function ensureMusicBuffered(): Promise<boolean> {
  const clip = manifest?.clips.find((c) => c.id === MUSIC_AMBIENT_ID);
  if (!clip?.cached) return false;
  const v = clip.v ?? 0;
  if (musicEl && musicV === v && musicEl.readyState >= 3) {
    return true;
  }

  const wasPlaying = Boolean(musicEl && !musicEl.paused);
  disposeMusic();

  const ab = await fetchClipArrayBuffer(MUSIC_AMBIENT_ID);
  if (!ab) {
    musicEl = new Audio(clipUrl(MUSIC_AMBIENT_ID));
    musicEl.loop = true;
    musicEl.preload = "auto";
    musicV = v;
    musicEl.load();
  } else {
    const blob = new Blob([ab], { type: "audio/mpeg" });
    musicObjectUrl = URL.createObjectURL(blob);
    musicEl = new Audio(musicObjectUrl);
    musicEl.loop = true;
    musicEl.preload = "auto";
    musicV = v;
    musicEl.load();
  }
  musicEl.volume = musicVolume();

  // Warm decode without requiring canplaythrough (blob is local)
  if (wasPlaying && shouldPlayAmbient()) {
    try {
      await musicEl.play();
      if (!shouldPlayAmbient()) {
        pauseAmbient();
        return true;
      }
      ambientNeedsGesture = false;
    } catch {
      ambientNeedsGesture = true;
    }
  }
  return true;
}

/** Snapshot of the latest preload pass (for optional UI). */
export function getAudioPreloadProgress(): AudioPreloadProgress {
  return { ...lastPreloadProgress };
}

export function isAudioPreloadDone(): boolean {
  return lastPreloadProgress.done;
}

/**
 * Download and decode every cached clip from the manifest into memory.
 * Safe to call from lobby and combat — shares one in-flight job and skips
 * when the current manifest was already preloaded.
 *
 * Failures are soft: missing clips do not reject the promise.
 */
export async function preloadAudio(options?: {
  onProgress?: (p: AudioPreloadProgress) => void;
}): Promise<void> {
  if (!manifest) {
    try {
      await loadAudioManifest();
    } catch {
      lastPreloadProgress = { loaded: 0, total: 0, done: true };
      options?.onProgress?.(lastPreloadProgress);
      return;
    }
  }

  const key = manifestKey(manifest);
  if (preloadedKey === key && lastPreloadProgress.done) {
    options?.onProgress?.({ ...lastPreloadProgress });
    return;
  }

  if (!preloadPromise) {
    // Create context early (still suspended until user gesture)
    try {
      getAudioContext();
    } catch {
      /* Web Audio unavailable — play() will soft-fail */
    }

    preloadPromise = (async () => {
      const ids = [
        ...new Set(
          (manifest?.clips ?? []).filter((c) => c.cached).map((c) => c.id),
        ),
      ];
      const total = ids.length;
      let loaded = 0;
      lastPreloadProgress = { loaded: 0, total, done: false };
      options?.onProgress?.(lastPreloadProgress);

      let next = 0;
      const worker = async () => {
        while (next < ids.length) {
          const i = next++;
          const id = ids[i]!;
          try {
            if (id === MUSIC_AMBIENT_ID) {
              await ensureMusicBuffered();
            } else {
              await ensureDecoded(id);
            }
          } catch {
            /* soft-fail individual clips */
          }
          loaded += 1;
          lastPreloadProgress = { loaded, total, done: false };
          options?.onProgress?.(lastPreloadProgress);
        }
      };

      const n = Math.min(PRELOAD_CONCURRENCY, Math.max(1, ids.length));
      await Promise.all(Array.from({ length: n }, () => worker()));

      lastPreloadProgress = { loaded: total, total, done: true };
      options?.onProgress?.(lastPreloadProgress);
      preloadedKey = key;
    })().finally(() => {
      preloadPromise = null;
    });
  }

  await preloadPromise;
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem("dg_mute", value ? "1" : "0");
  } catch {
    /* ignore */
  }
  if (value) stopAllSfx();
  void syncAmbientMusic();
}

export function isMuted(): boolean {
  return muted;
}

export function setVoEnabled(value: boolean): void {
  voEnabled = value;
  try {
    localStorage.setItem("dg_vo", value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function isVoEnabled(): boolean {
  return voEnabled;
}

export function setMusicEnabled(value: boolean): void {
  musicEnabled = value;
  try {
    localStorage.setItem("dg_music", value ? "1" : "0");
  } catch {
    /* ignore */
  }
  // User gesture on the Music button — clear autoplay hold + unlock Web Audio
  if (value) ambientNeedsGesture = false;
  void unlockAudioFromGesture();
  void syncAmbientMusic();
}

export function isMusicEnabled(): boolean {
  return musicEnabled;
}

/**
 * Lobby/camp: true. Combat / leave: false.
 * Starts or stops the ambient loop according to prefs.
 */
export function setAmbientDesired(want: boolean): void {
  ambientDesired = want;
  void syncAmbientMusic();
}

export function isAmbientDesired(): boolean {
  return ambientDesired;
}

export function loadAudioPrefs(): void {
  try {
    muted = localStorage.getItem("dg_mute") === "1";
    voEnabled = localStorage.getItem("dg_vo") === "1";
    // Default music ON when unset
    const m = localStorage.getItem("dg_music");
    musicEnabled = m === null ? true : m === "1";
  } catch {
    /* ignore */
  }
}

export async function loadAudioManifest(): Promise<Manifest> {
  // Bypass HTTP cache so mtime versions stay accurate after replacing mp3s.
  const res = await fetch("/api/audio/manifest", { cache: "no-store" });
  const next = (await res.json()) as Manifest;
  const prevKey = manifestKey(manifest);
  manifest = next;
  dropStaleBuffers();
  const nextKey = manifestKey(manifest);
  if (prevKey !== nextKey) {
    // Force a new preload pass when clips/versions change.
    preloadedKey = null;
    if (!preloadPromise) {
      lastPreloadProgress = { loaded: 0, total: 0, done: false };
    }
  }
  return manifest;
}

function volumeFor(id: string): number {
  const clip = manifest?.clips.find((c) => c.id === id);
  return (clip?.volume ?? 0.5) * masterVolume;
}

function musicVolume(): number {
  // Catalog ~0.2 × master 0.7 ≈ 0.14 — quiet under talk / SFX
  return Math.min(1, Math.max(0, volumeFor(MUSIC_AMBIENT_ID)));
}

function ensureMusicElement(): HTMLAudioElement | null {
  const clip = manifest?.clips.find((c) => c.id === MUSIC_AMBIENT_ID);
  if (!clip?.cached) {
    return null;
  }
  const v = clip.v ?? 0;
  if (musicEl && musicV === v) {
    musicEl.volume = musicVolume();
    return musicEl;
  }
  disposeMusic();
  musicEl = new Audio(clipUrl(MUSIC_AMBIENT_ID));
  musicEl.loop = true;
  musicEl.preload = "auto";
  musicV = v;
  musicEl.volume = musicVolume();
  return musicEl;
}

function pauseAmbient(): void {
  if (musicEl && !musicEl.paused) {
    musicEl.pause();
  }
}

function clearExclusiveHold(): void {
  exclusiveUntilMs = 0;
  exclusiveClipId = null;
  if (exclusiveEndTimer != null) {
    clearTimeout(exclusiveEndTimer);
    exclusiveEndTimer = null;
  }
}

function isExclusiveActive(): boolean {
  return Date.now() < exclusiveUntilMs;
}

/** Stop every one-shot SFX (does not touch the ambient music element). */
export function stopAllSfx(): void {
  for (const src of activeSources) {
    try {
      src.stop();
    } catch {
      /* already stopped */
    }
    try {
      src.disconnect();
    } catch {
      /* ignore */
    }
  }
  activeSources.clear();
}

/**
 * Apply mute / music / ambient-desired to the looping bed.
 * Safe to call often; missing file is a no-op.
 *
 * After every await, re-checks flags so a slow load/play cannot restart
 * music after combat entry, Music-off, or mute.
 */
export async function syncAmbientMusic(): Promise<void> {
  const gen = ++ambientSyncGen;

  if (!shouldPlayAmbient()) {
    pauseAmbient();
    return;
  }
  if (!manifest) {
    try {
      await loadAudioManifest();
    } catch {
      return;
    }
  }
  if (gen !== ambientSyncGen) return;
  if (!shouldPlayAmbient()) {
    pauseAmbient();
    return;
  }

  const el = ensureMusicElement();
  if (!el) return;
  if (gen !== ambientSyncGen || !shouldPlayAmbient()) {
    pauseAmbient();
    return;
  }

  el.volume = musicVolume();
  if (!el.paused) return;
  try {
    await el.play();
    if (gen !== ambientSyncGen || !shouldPlayAmbient()) {
      pauseAmbient();
      return;
    }
    ambientNeedsGesture = false;
  } catch {
    if (gen === ambientSyncGen) ambientNeedsGesture = true;
  }
}

function startBufferSource(id: string, buffer: AudioBuffer): void {
  const ctx = getAudioContext();
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = Math.min(1, Math.max(0, volumeFor(id)));
  src.connect(gain);
  gain.connect(ctx.destination);
  activeSources.add(src);
  src.onended = () => {
    activeSources.delete(src);
    try {
      src.disconnect();
      gain.disconnect();
    } catch {
      /* ignore */
    }
  };
  try {
    src.start(0);
  } catch {
    activeSources.delete(src);
  }
}

/**
 * Play a decoded one-shot. Resumes AudioContext if suspended (post-gesture).
 * If still suspended after resume attempt, schedules start after resume.
 */
function playWebAudio(id: string, buffer: AudioBuffer): void {
  const ctx = getAudioContext();
  const kick = () => {
    if (muted || isExclusiveActive()) return;
    const clip = manifest?.clips.find((c) => c.id === id);
    if (clip?.kind === "vo" && !voEnabled) return;
    startBufferSource(id, buffer);
  };

  if (ctx.state === "suspended") {
    void ctx
      .resume()
      .then(kick)
      .catch(() => {
        /* still locked — need a real user gesture via unlockAudioFromGesture */
      });
    return;
  }
  kick();
}

/** HTMLAudio fallback when Web Audio decode failed for a clip. */
function playHtmlFallback(id: string): void {
  try {
    const el = new Audio(clipUrl(id));
    el.volume = Math.min(1, Math.max(0, volumeFor(id)));
    void el.play().catch(() => {
      /* autoplay / network */
    });
  } catch {
    /* ignore */
  }
}

export function play(id: string): void {
  if (muted) return;
  if (isExclusiveActive()) return;
  const clip = manifest?.clips.find((c) => c.id === id);
  if (clip?.kind === "vo" && !voEnabled) return;
  if (clip?.kind === "music") return;

  const v = clipVersion(id);
  const hit = decoded.get(id);
  if (hit && hit.v === v) {
    playWebAudio(id, hit.buffer);
    return;
  }

  // Not decoded yet (preload still running or missed) — decode then play.
  // May land slightly late; better than silent.
  void ensureDecoded(id).then((buffer) => {
    if (muted || isExclusiveActive()) return;
    const c = manifest?.clips.find((x) => x.id === id);
    if (c?.kind === "vo" && !voEnabled) return;
    if (buffer) {
      playWebAudio(id, buffer);
    } else {
      playHtmlFallback(id);
    }
  });
}

/**
 * Play a longer sting alone: stops all SFX, pauses ambient, and blocks other
 * play() calls until the clip ends (or ~duration + small pad).
 * Call from a user gesture (button click) so autoplay allows it.
 */
export function playExclusive(id: string, durationSeconds = 4.5): void {
  if (muted) return;
  const clip = manifest?.clips.find((c) => c.id === id);
  if (clip?.kind === "vo" && !voEnabled) return;
  if (clip?.kind === "music") return;

  stopAllSfx();
  pauseAmbient();
  void unlockAudioFromGesture();

  const holdMs = Math.max(500, Math.round(durationSeconds * 1000) + 200);
  exclusiveUntilMs = Date.now() + holdMs;
  exclusiveClipId = id;
  if (exclusiveEndTimer != null) clearTimeout(exclusiveEndTimer);
  exclusiveEndTimer = setTimeout(() => {
    exclusiveEndTimer = null;
    if (exclusiveClipId === id) {
      clearExclusiveHold();
      void syncAmbientMusic();
    }
  }, holdMs);

  const v = clipVersion(id);
  const hit = decoded.get(id);
  if (hit && hit.v === v) {
    playWebAudio(id, hit.buffer);
    return;
  }
  void ensureDecoded(id).then((buffer) => {
    if (exclusiveClipId !== id) return;
    if (buffer) playWebAudio(id, buffer);
    else playHtmlFallback(id);
  });
}

/** Map combat log / phase events to clip ids (best-effort). */
export function playForLogLine(text: string): void {
  const t = text.toLowerCase();
  if (t.includes("tokens drop")) {
    play("token_drop");
    return;
  }
  if (t.includes("claims")) {
    play("token_claim");
    return;
  }
  if (t.includes("shield shattered") || t.includes("short-circuit")) {
    play("shield_break");
    return;
  }
  if (t.includes("heal")) {
    play("heal");
    return;
  }
  if (
    t.includes("explosion") ||
    t.includes("overload") ||
    t.includes("misfire") ||
    t.includes("backlash") ||
    t.includes("fizzle")
  ) {
    play("fizzle");
    return;
  }
  if (
    t.includes("fires at") ||
    t.includes("bone archer") ||
    t.includes("frost archer")
  ) {
    play("minion_shot");
    return;
  }
  if (t.includes("gathers power") || t.includes("prepares")) {
    play("boss_attack");
    return;
  }
  if (t.includes("uses ") || t.includes("front slam") || t.includes("line attack")) {
    play("hit_heavy");
    return;
  }
  // Victory / defeat horns are owned by CombatScreen endPresentation (after
  // playback). Do not fire from log text — "is defeated!" arrives at Drop Tokens
  // while the board is still animating the kill.
  if (t.includes("ticks") || t.includes("poison") || t.includes("fire ")) {
    play("dot_tick");
  }
}

export function playMagnetMove(): void {
  play("magnet_slide");
}

export function playCommit(): void {
  play("commit_round");
}
