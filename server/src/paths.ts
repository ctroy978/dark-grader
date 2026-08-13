import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** `server/` whether this file is loaded from src/ (tsx) or dist/ (node). */
export function serverRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

export function repoRoot(): string {
  return path.resolve(serverRoot(), "..");
}

/**
 * Classroom JSON + audio live under DATA_DIR.
 * Default is cwd/data so vitest can chdir into a temp dir.
 * Production systemd should set WorkingDirectory to `server/` or set DATA_DIR.
 */
export function resolveDataDir(): string {
  if (process.env.DATA_DIR) return path.resolve(process.env.DATA_DIR);
  return path.resolve(process.cwd(), "data");
}

/**
 * Hand-authored MP3s ship in server/data/audio and must not move when
 * DATA_DIR is pointed at a separate persist folder for classroom JSON.
 */
export function resolveAudioDir(): string {
  if (process.env.AUDIO_DIR) return path.resolve(process.env.AUDIO_DIR);
  const packaged = path.join(serverRoot(), "data", "audio");
  if (fs.existsSync(packaged)) return packaged;
  return path.join(resolveDataDir(), "audio");
}

/** `/gradeforge` — empty string means the site root. */
export function normalizeBasePath(raw: string | undefined): string {
  if (!raw) return "";
  let p = raw.trim();
  if (!p || p === "/") return "";
  if (!p.startsWith("/")) p = `/${p}`;
  return p.replace(/\/+$/, "");
}

/** Classroom production default. Dev (unset NODE_ENV) stays at `/`. */
export function resolveBasePath(): string {
  const fromEnv = process.env.BASE_PATH;
  if (fromEnv !== undefined) return normalizeBasePath(fromEnv);
  return process.env.NODE_ENV === "production"
    ? "/gradeforge"
    : "";
}

/** Strip the public prefix so Fastify still sees `/api`, `/assets`, `/`. */
export function stripBasePath(url: string, basePath: string): string {
  if (!basePath) return url;
  const q = url.indexOf("?");
  const pathname = q === -1 ? url : url.slice(0, q);
  const search = q === -1 ? "" : url.slice(q);
  let next = pathname;
  if (pathname === basePath || pathname === `${basePath}/`) next = "/";
  else if (pathname.startsWith(`${basePath}/`)) next = pathname.slice(basePath.length);
  return `${next}${search}`;
}

/** Built Vite client. Null when `npm run build` has not been run. */
export function resolveClientDist(): string | null {
  const candidates: string[] = [];
  if (process.env.CLIENT_DIST) {
    candidates.push(path.resolve(process.env.CLIENT_DIST));
  }
  candidates.push(
    path.join(repoRoot(), "client", "dist"),
    path.resolve(process.cwd(), "../client/dist"),
    path.resolve(process.cwd(), "client/dist"),
  );
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "index.html"))) return dir;
  }
  return null;
}
