import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseToml } from "smol-toml";
import type { AudioClipDef } from "../audio/catalog.js";

export interface BossAttackDef {
  id: string;
  weight: number;
  sfx?: string;
  bubble_lines: string[];
  use_grunt?: boolean;
  use_laugh?: boolean;
}

export interface BossTemplate {
  id: string;
  name: string;
  maxHp: number;
  traits: string[];
  attackIds: string[];
  difficulty: string;
  summary: string;
  recommendedRounds: string;
  enrageHpPct: number;
  enrageDamageMult: number;
  gruntPool: string[];
  laughPool: string[];
  telegraphSfx?: string;
  attacks: BossAttackDef[];
  /** Extra ElevenLabs clips declared in this boss file */
  audio: AudioClipDef[];
}

interface RawBossToml {
  id: string;
  name: string;
  max_hp: number;
  traits?: string[];
  difficulty?: string;
  summary?: string;
  recommended_rounds?: string;
  enrage_hp_pct?: number;
  enrage_damage_mult?: number;
  grunt_pool?: string[];
  laugh_pool?: string[];
  telegraph_sfx?: string;
  audio?: Array<{
    id: string;
    kind: "sfx" | "vo";
    text: string;
    duration_seconds?: number;
    volume?: number;
  }>;
  attacks?: Array<{
    id: string;
    weight?: number;
    sfx?: string;
    bubble_lines?: string[];
    use_grunt?: boolean;
    use_laugh?: boolean;
  }>;
}

function contentBossDir(): string {
  // Prefer package-relative content (works for tsx + compiled dist)
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, "../../content/bosses"),
    path.resolve(process.cwd(), "content/bosses"),
    path.resolve(process.cwd(), "server/content/bosses"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

function parseBossFile(filePath: string): BossTemplate {
  const raw = parseToml(fs.readFileSync(filePath, "utf8")) as unknown as RawBossToml;
  if (!raw.id || !raw.name || !raw.max_hp) {
    throw new Error(`Invalid boss TOML ${filePath}: need id, name, max_hp`);
  }
  const attacks: BossAttackDef[] = (raw.attacks ?? []).map((a) => ({
    id: a.id,
    weight: a.weight ?? 1,
    sfx: a.sfx,
    bubble_lines: a.bubble_lines ?? [],
    use_grunt: a.use_grunt,
    use_laugh: a.use_laugh,
  }));
  if (!attacks.length) {
    throw new Error(`Boss ${raw.id} has no [[attacks]]`);
  }
  const audio: AudioClipDef[] = (raw.audio ?? []).map((c) => ({
    id: c.id,
    kind: c.kind,
    text: c.text,
    durationSeconds: c.duration_seconds,
    volume: c.volume,
  }));

  return {
    id: raw.id,
    name: raw.name,
    maxHp: raw.max_hp,
    traits: raw.traits ?? [],
    attackIds: attacks.map((a) => a.id),
    difficulty: raw.difficulty ?? "Standard",
    summary: raw.summary ?? "",
    recommendedRounds: raw.recommended_rounds ?? "?",
    enrageHpPct: raw.enrage_hp_pct ?? 0.4,
    enrageDamageMult: raw.enrage_damage_mult ?? 1.3,
    gruntPool: raw.grunt_pool ?? [],
    laughPool: raw.laugh_pool ?? [],
    telegraphSfx: raw.telegraph_sfx,
    attacks,
    audio,
  };
}

let cache: BossTemplate[] | null = null;

export function loadBossTemplates(forceReload = false): BossTemplate[] {
  if (cache && !forceReload) return cache;
  const dir = contentBossDir();
  if (!fs.existsSync(dir)) {
    console.warn(`[bosses] No content dir at ${dir}`);
    cache = [];
    return cache;
  }
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".toml"))
    .sort();
  cache = files.map((f) => parseBossFile(path.join(dir, f)));
  return cache;
}

export function getBossTemplate(id: string): BossTemplate | undefined {
  return loadBossTemplates().find((b) => b.id === id);
}

export function allBossAudioClips(): AudioClipDef[] {
  const seen = new Set<string>();
  const out: AudioClipDef[] = [];
  for (const b of loadBossTemplates()) {
    for (const clip of b.audio) {
      if (seen.has(clip.id)) continue;
      seen.add(clip.id);
      out.push(clip);
    }
  }
  return out;
}

export function pickFromPool(pool: string[], random: () => number): string | undefined {
  if (!pool.length) return undefined;
  return pool[Math.floor(random() * pool.length)];
}

export function attackDef(
  template: BossTemplate,
  attackId: string,
): BossAttackDef | undefined {
  return template.attacks.find((a) => a.id === attackId);
}
