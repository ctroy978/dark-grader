/** Lightweight client audio player for cached ElevenLabs clips served by the API. */

export type AudioManifestClip = {
  id: string;
  kind: string;
  cached: boolean;
  bytes: number;
  volume: number;
};

type Manifest = {
  clips: AudioManifestClip[];
  elevenlabsConfigured: boolean;
};

let manifest: Manifest | null = null;
let muted = false;
let voEnabled = false;
let masterVolume = 0.7;
const buffers = new Map<string, HTMLAudioElement>();

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem("dg_mute", value ? "1" : "0");
  } catch {
    /* ignore */
  }
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

export function loadAudioPrefs(): void {
  try {
    muted = localStorage.getItem("dg_mute") === "1";
    voEnabled = localStorage.getItem("dg_vo") === "1";
  } catch {
    /* ignore */
  }
}

export async function loadAudioManifest(): Promise<Manifest> {
  const res = await fetch("/api/audio/manifest");
  manifest = (await res.json()) as Manifest;
  return manifest;
}

function volumeFor(id: string): number {
  const clip = manifest?.clips.find((c) => c.id === id);
  return (clip?.volume ?? 0.5) * masterVolume;
}

export function play(id: string): void {
  if (muted) return;
  const clip = manifest?.clips.find((c) => c.id === id);
  if (clip?.kind === "vo" && !voEnabled) return;

  let el = buffers.get(id);
  if (!el) {
    el = new Audio(`/api/audio/${id}`);
    buffers.set(id, el);
  }
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
  if (t.includes("explosion") || t.includes("overload") || t.includes("misfire")) {
    play("explosion_f");
    return;
  }
  if (t.includes("fires at") || t.includes("bone archer")) {
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
