import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseToml } from "smol-toml";
import type { AudioClipDef } from "../audio/catalog.js";
import type { DotType } from "@dungeon-grades/shared";

const DOT_TYPES: DotType[] = ["Fire", "Ice", "Poison", "Slime"];

function parseDotType(raw: string | undefined): DotType | undefined {
  if (!raw) return undefined;
  const t = raw.trim();
  return DOT_TYPES.find((d) => d.toLowerCase() === t.toLowerCase());
}

/** Optional summon kit on an attack row (parameterized minions). */
export interface BossSummonDef {
  minionId: string;
  minionName: string;
  maxHp: number;
  damage: number;
  maxCount: number;
  /** When already at maxCount, fire free shots instead of spawning (Colossus). */
  freeVolley: boolean;
  /** Spawn this many living minions at fight start. */
  openCount: number;
  /** On minion volley hit: apply this DoT to the target (e.g. Fire for Cinder Imps). */
  onHitDot?: { type: DotType; stacks: number };
}

export interface BossAttackDef {
  id: string;
  weight: number;
  sfx?: string;
  bubble_lines: string[];
  use_grunt?: boolean;
  use_laugh?: boolean;
  summon?: BossSummonDef;
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
    minion_id?: string;
    minion_name?: string;
    minion_max_hp?: number;
    minion_damage?: number;
    minion_max_count?: number;
    free_volley?: boolean;
    open_count?: number;
    /** e.g. "Fire" — applied to the soldier the minion hits */
    minion_on_hit_dot?: string;
    minion_on_hit_dot_stacks?: number;
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
  const attacks: BossAttackDef[] = (raw.attacks ?? []).map((a) => {
    const base: BossAttackDef = {
      id: a.id,
      weight: a.weight ?? 1,
      sfx: a.sfx,
      bubble_lines: a.bubble_lines ?? [],
      use_grunt: a.use_grunt,
      use_laugh: a.use_laugh,
    };
    // Summon params: any of the minion_* keys, or a Summon* attack id with defaults later
    if (
      a.minion_id ||
      a.minion_name ||
      a.minion_max_hp != null ||
      a.minion_damage != null ||
      a.minion_max_count != null ||
      a.free_volley != null ||
      a.open_count != null ||
      a.minion_on_hit_dot != null
    ) {
      const onHitType = parseDotType(a.minion_on_hit_dot);
      base.summon = {
        minionId:
          a.minion_id ??
          (a.id.replace(/^Summon/i, "").toLowerCase() || "minion"),
        minionName: a.minion_name ?? "Minion",
        maxHp: a.minion_max_hp ?? 10,
        damage: a.minion_damage ?? 3,
        maxCount: a.minion_max_count ?? 2,
        freeVolley: a.free_volley ?? false,
        openCount: a.open_count ?? 0,
        ...(onHitType
          ? {
              onHitDot: {
                type: onHitType,
                stacks: Math.max(1, a.minion_on_hit_dot_stacks ?? 1),
              },
            }
          : {}),
      };
    }
    return base;
  });
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
