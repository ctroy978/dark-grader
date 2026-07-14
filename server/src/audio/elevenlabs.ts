import fs from "node:fs";
import path from "node:path";
import { AUDIO_CATALOG, type AudioClipDef, getClip } from "./catalog.js";

const API = "https://api.elevenlabs.io";
const SFX_MODEL = "eleven_text_to_sound_v2";
const TTS_MODEL = "eleven_multilingual_v2";
/** Rachel — default public voice; works without voices_read */
const DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM";

export function audioCacheDir(): string {
  return path.resolve(process.cwd(), "data", "audio");
}

export function clipPath(id: string): string {
  return path.join(audioCacheDir(), `${id}.mp3`);
}

function apiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set");
  return key;
}

export function hasApiKey(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY?.length);
}

export function voiceId(): string {
  return process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;
}

async function generateSfx(clip: AudioClipDef): Promise<Buffer> {
  // API requires duration_seconds in [0.5, 30]
  const duration = Math.min(30, Math.max(0.5, clip.durationSeconds ?? 1));
  const body = {
    text: clip.text,
    duration_seconds: duration,
    model_id: SFX_MODEL,
  };
  const res = await fetch(`${API}/v1/sound-generation`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey(),
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`SFX ${clip.id} failed (${res.status}): ${errText}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function generateVo(clip: AudioClipDef): Promise<Buffer> {
  const res = await fetch(`${API}/v1/text-to-speech/${voiceId()}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey(),
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: clip.text,
      model_id: TTS_MODEL,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`VO ${clip.id} failed (${res.status}): ${errText}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/** Generate a clip if missing. Returns absolute path. */
export async function ensureClip(id: string, force = false): Promise<string> {
  const clip = getClip(id);
  if (!clip) throw new Error(`Unknown audio clip: ${id}`);

  fs.mkdirSync(audioCacheDir(), { recursive: true });
  const out = clipPath(id);
  if (!force && fs.existsSync(out) && fs.statSync(out).size > 500) {
    return out;
  }

  const buf = clip.kind === "sfx" ? await generateSfx(clip) : await generateVo(clip);
  fs.writeFileSync(out, buf);
  return out;
}

export async function ensureAllClips(
  force = false,
  onProgress?: (id: string, ok: boolean, detail?: string) => void,
): Promise<{ id: string; ok: boolean; error?: string }[]> {
  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const clip of AUDIO_CATALOG) {
    try {
      await ensureClip(clip.id, force);
      results.push({ id: clip.id, ok: true });
      onProgress?.(clip.id, true);
      // gentle rate limit
      await new Promise((r) => setTimeout(r, 250));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ id: clip.id, ok: false, error: msg });
      onProgress?.(clip.id, false, msg);
    }
  }
  return results;
}

export function listCachedClips(): {
  id: string;
  kind: string;
  cached: boolean;
  bytes: number;
  volume: number;
}[] {
  return AUDIO_CATALOG.map((c) => {
    const p = clipPath(c.id);
    const cached = fs.existsSync(p);
    return {
      id: c.id,
      kind: c.kind,
      cached,
      bytes: cached ? fs.statSync(p).size : 0,
      volume: c.volume ?? 0.5,
    };
  });
}

/** Probe key capabilities without printing secrets. */
export async function probePermissions(): Promise<{
  keyPresent: boolean;
  tts: boolean;
  sfx: boolean;
  voicesRead: boolean;
  modelsRead: boolean;
  userRead: boolean;
  messages: string[];
}> {
  const messages: string[] = [];
  const result = {
    keyPresent: hasApiKey(),
    tts: false,
    sfx: false,
    voicesRead: false,
    modelsRead: false,
    userRead: false,
    messages,
  };
  if (!result.keyPresent) {
    messages.push("ELEVENLABS_API_KEY missing");
    return result;
  }

  const headers = { "xi-api-key": apiKey() };

  const checkGet = async (path: string, flag: keyof typeof result) => {
    try {
      const res = await fetch(`${API}${path}`, { headers });
      if (res.ok) {
        (result as Record<string, unknown>)[flag] = true;
      } else {
        const j = (await res.json().catch(() => ({}))) as {
          detail?: { message?: string };
        };
        messages.push(`${path}: ${j.detail?.message ?? res.status}`);
      }
    } catch (e) {
      messages.push(`${path}: ${e instanceof Error ? e.message : e}`);
    }
  };

  await checkGet("/v1/voices", "voicesRead");
  await checkGet("/v1/models", "modelsRead");
  await checkGet("/v1/user", "userRead");

  // Functional probes (small)
  try {
    const res = await fetch(`${API}/v1/sound-generation`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "tiny soft click test",
        duration_seconds: 0.5,
        model_id: SFX_MODEL,
      }),
    });
    result.sfx = res.ok;
    if (!res.ok) messages.push(`sfx: ${res.status} ${await res.text()}`);
  } catch (e) {
    messages.push(`sfx: ${e instanceof Error ? e.message : e}`);
  }

  try {
    const res = await fetch(`${API}/v1/text-to-speech/${voiceId()}`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({ text: "Test.", model_id: TTS_MODEL }),
    });
    result.tts = res.ok;
    if (!res.ok) messages.push(`tts: ${res.status} ${await res.text()}`);
  } catch (e) {
    messages.push(`tts: ${e instanceof Error ? e.message : e}`);
  }

  return result;
}
