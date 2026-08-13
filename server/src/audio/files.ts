import fs from "node:fs";
import path from "node:path";
import { resolveAudioDir } from "../paths.js";
import { AUDIO_CATALOG } from "./catalog.js";

export function audioDir(): string {
  return resolveAudioDir();
}

export function clipPath(id: string): string {
  return path.join(audioDir(), `${id}.mp3`);
}

export function listCachedClips(): {
  id: string;
  kind: string;
  cached: boolean;
  bytes: number;
  /** File mtime ms — client uses as ?v= cache-buster when mp3s are replaced. */
  v: number;
  volume: number;
}[] {
  return AUDIO_CATALOG.map((c) => {
    const p = clipPath(c.id);
    const cached = fs.existsSync(p);
    if (!cached) {
      return {
        id: c.id,
        kind: c.kind,
        cached: false,
        bytes: 0,
        v: 0,
        volume: c.volume ?? 0.5,
      };
    }
    const st = fs.statSync(p);
    return {
      id: c.id,
      kind: c.kind,
      cached: true,
      bytes: st.size,
      v: Math.floor(st.mtimeMs),
      volume: c.volume ?? 0.5,
    };
  });
}
