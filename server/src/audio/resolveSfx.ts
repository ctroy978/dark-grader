import fs from "node:fs";
import { clipPath } from "./files.js";

/**
 * Pick the first catalog id that has a file on disk.
 * Falls back to the first candidate so cues still name the preferred clip
 * (client 404s silently until you drop the mp3).
 */
export function resolveSfxId(candidates: string[]): string | undefined {
  if (!candidates.length) return undefined;
  for (const id of candidates) {
    try {
      if (fs.existsSync(clipPath(id))) return id;
    } catch {
      /* ignore */
    }
  }
  return candidates[0];
}
