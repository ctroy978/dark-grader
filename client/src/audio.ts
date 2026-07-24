/** Lightweight client audio player for cached clips served by the API. */

export type AudioManifestClip = {
  id: string;
  kind: string;
  cached: boolean;
  bytes: number;
  /** File mtime ms from server — used as ?v= so replaced mp3s are not stuck in HTTP cache. */
  v: number;
  volume: number;
};

type Manifest = {
  clips: AudioManifestClip[];
  elevenlabsConfigured: boolean;
};

type BufferedClip = {
  el: HTMLAudioElement;
  v: number;
};

/** Lobby / camp ambient bed — hand-authored loop at server/data/audio/ */
export const MUSIC_AMBIENT_ID = "music_ambient_lobby";

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
const buffers = new Map<string, BufferedClip>();
/** Separate looping element for music (not the one-shot SFX map). */
let musicEl: HTMLAudioElement | null = null;
let musicV = -1;
/** Browser blocked autoplay — retry on next user gesture. */
let ambientNeedsGesture = false;

/** URL for a clip; includes ?v=<mtime> when the server reported a version. */
function clipUrl(id: string): string {
  const clip = manifest?.clips.find((c) => c.id === id);
  const v = clip?.v ?? 0;
  return v > 0 ? `/api/audio/${id}?v=${v}` : `/api/audio/${id}`;
}

function clipVersion(id: string): number {
  return manifest?.clips.find((c) => c.id === id)?.v ?? 0;
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem("dg_mute", value ? "1" : "0");
  } catch {
    /* ignore */
  }
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
  // User gesture on the Music button — clear autoplay hold
  if (value) ambientNeedsGesture = false;
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
  manifest = (await res.json()) as Manifest;
  // Drop one-shot buffers whose on-disk version changed.
  for (const [id, buf] of buffers) {
    if (buf.v !== clipVersion(id)) {
      buffers.delete(id);
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
    // No file installed yet — silent no-op
    return null;
  }
  const v = clip.v ?? 0;
  if (!musicEl || musicV !== v) {
    if (musicEl && !musicEl.paused) {
      musicEl.pause();
    }
    musicEl = new Audio(clipUrl(MUSIC_AMBIENT_ID));
    musicEl.loop = true;
    musicEl.preload = "auto";
    musicV = v;
  }
  musicEl.volume = musicVolume();
  return musicEl;
}

function pauseAmbient(): void {
  if (musicEl && !musicEl.paused) {
    musicEl.pause();
  }
}

/**
 * Apply mute / music / ambient-desired to the looping bed.
 * Safe to call often; missing file is a no-op.
 */
export async function syncAmbientMusic(): Promise<void> {
  if (!ambientDesired || muted || !musicEnabled) {
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
  const el = ensureMusicElement();
  if (!el) return;
  el.volume = musicVolume();
  if (!el.paused) return;
  try {
    await el.play();
    ambientNeedsGesture = false;
  } catch {
    // Autoplay policy — wait for Music toggle or unlockAmbientFromGesture
    ambientNeedsGesture = true;
  }
}

/** Call from a click/tap if autoplay blocked (e.g. first lobby interaction). */
export function unlockAmbientFromGesture(): void {
  if (!ambientNeedsGesture) return;
  ambientNeedsGesture = false;
  void syncAmbientMusic();
}

export function play(id: string): void {
  if (muted) return;
  const clip = manifest?.clips.find((c) => c.id === id);
  if (clip?.kind === "vo" && !voEnabled) return;
  if (clip?.kind === "music") {
    // Music is loop-managed — never one-shot via play()
    return;
  }

  const v = clipVersion(id);
  let buf = buffers.get(id);
  if (!buf || buf.v !== v) {
    buf = { el: new Audio(clipUrl(id)), v };
    buffers.set(id, buf);
  }
  const el = buf.el;
  el.volume = Math.min(1, Math.max(0, volumeFor(id)));
  el.currentTime = 0;
  void el.play().catch(() => {
    /* autoplay policies — ignore */
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
