/**
 * Classroom-friendly audio catalog for Dungeon Grades.
 * SFX use ElevenLabs text-to-sound; VO uses text-to-speech.
 * Boss-specific clips are merged from content/bosses/*.toml at load time.
 */
import { allBossAudioClips } from "../seed/bossLoader.js";

export type AudioKind = "sfx" | "vo" | "music";

export interface AudioClipDef {
  id: string;
  kind: AudioKind;
  /** Prompt for SFX, or spoken line for VO */
  text: string;
  /** SFX duration hint (seconds) */
  durationSeconds?: number;
  /** Relative volume suggestion 0–1 for client */
  volume?: number;
}

const CORE_CATALOG: AudioClipDef[] = [
  // --- Ambient music (hand-authored loops only; not ElevenLabs) ---
  {
    id: "music_ambient_lobby",
    kind: "music",
    text: "soft dark fantasy ambient loop for lobby / camp — low drone, no melody peaks, no voice, seamless",
    durationSeconds: 90,
    /** Kept quiet under classroom talk and SFX (× master ~0.7 → ~0.14) */
    volume: 0.2,
  },

  // --- Core UI / magnet ---
  {
    id: "ui_click",
    kind: "sfx",
    text: "soft short UI click, subtle, clean digital tap, no voice",
    durationSeconds: 0.5,
    volume: 0.4,
  },
  {
    id: "magnet_slide",
    kind: "sfx",
    text: "short magical whoosh of a glowing rune circle sliding, soft, mystical, no voice",
    durationSeconds: 0.55,
    volume: 0.45,
  },
  {
    id: "token_drop",
    kind: "sfx",
    text: "three small magical grade tokens falling with gentle chimes, short, fantasy game, no voice",
    durationSeconds: 0.9,
    volume: 0.55,
  },
  {
    id: "token_claim",
    kind: "sfx",
    text: "soft sparkly claim sound, single magical pickup chime, short, no voice",
    durationSeconds: 0.5,
    volume: 0.5,
  },
  {
    id: "commit_round",
    kind: "sfx",
    text: "low dramatic but restrained drum hit mixed with magic shimmer, short resolve cue, no voice",
    durationSeconds: 0.7,
    volume: 0.5,
  },

  // --- Combat feedback ---
  {
    id: "hit_light",
    kind: "sfx",
    text: "light stylized sword or spell impact, short, not gory, game-like, no voice",
    durationSeconds: 0.5,
    volume: 0.5,
  },
  {
    id: "hit_heavy",
    kind: "sfx",
    text: "heavier magical impact thud with brief spark, dramatic but clean, no voice",
    durationSeconds: 0.55,
    volume: 0.55,
  },
  {
    id: "heal",
    kind: "sfx",
    text: "warm gentle healing chime and soft glow pulse, positive, short, no voice (legacy alias for act_healer)",
    durationSeconds: 0.7,
    volume: 0.5,
  },
  // --- Per-archetype attack / cast (hand-authored Pixabay preferred) ---
  {
    id: "act_vanguard",
    kind: "sfx",
    text: "heavy shield bash or armored melee impact, short fantasy, classroom safe, no voice",
    durationSeconds: 0.7,
    volume: 0.55,
  },
  {
    id: "act_shieldmaiden",
    kind: "sfx",
    text: "sword swing strike impact, short fantasy combat, classroom safe, no voice",
    durationSeconds: 0.7,
    volume: 0.55,
  },
  {
    id: "act_firemage",
    kind: "sfx",
    text: "fire spell cast whoosh and brief burst, short fantasy, classroom safe, no voice",
    durationSeconds: 0.85,
    volume: 0.55,
  },
  {
    id: "act_healer",
    kind: "sfx",
    text: "warm gentle healing chime and soft glow pulse, positive, short, no voice",
    durationSeconds: 0.7,
    volume: 0.5,
  },
  {
    id: "act_archer",
    kind: "sfx",
    text: "bow release and arrow volley whoosh, short fantasy, classroom safe, no voice",
    durationSeconds: 0.7,
    volume: 0.5,
  },
  {
    id: "act_spearman",
    kind: "sfx",
    text: "spear thrust whoosh and sharp metal pierce, short fantasy, classroom safe, no voice",
    durationSeconds: 0.7,
    volume: 0.5,
  },
  {
    id: "act_necromancer",
    kind: "sfx",
    text: "life drain ethereal suck whoosh, short dark fantasy, classroom safe, no voice",
    durationSeconds: 0.8,
    volume: 0.55,
  },
  {
    id: "act_thundercaller",
    kind: "sfx",
    text: "short lightning crack and thunder snap, fantasy, classroom safe, no voice",
    durationSeconds: 0.75,
    volume: 0.55,
  },
  {
    id: "act_runesinger",
    kind: "sfx",
    text: "rune hymn magical chime chord, short positive fantasy, classroom safe, no voice (legacy; prefer hymn_cast)",
    durationSeconds: 0.8,
    volume: 0.5,
  },
  {
    id: "hymn_cast",
    kind: "sfx",
    text: "magical hymn being cast: golden orb swell, soft rising choir-chime, sets a blessing, short fantasy, classroom safe, no voice",
    durationSeconds: 0.85,
    volume: 0.55,
  },
  {
    id: "hymn_tick",
    kind: "sfx",
    text: "hymn heal tick: soft gold rain chime pulse on allies, warm positive, short, classroom safe, no voice",
    durationSeconds: 0.65,
    volume: 0.5,
  },
  // Gendered party hit reactions (boss/minion damage → hurt bubble)
  {
    id: "hurt_male",
    kind: "sfx",
    text: "short male grunt of effort when hit, non-gory, game-like, classroom safe, no words",
    durationSeconds: 0.55,
    volume: 0.5,
  },
  {
    id: "hurt_female",
    kind: "sfx",
    text: "short female grunt of effort when hit, non-gory, game-like, classroom safe, no words",
    durationSeconds: 0.55,
    volume: 0.5,
  },
  {
    id: "shield_break",
    kind: "sfx",
    text: "magical glass shield cracking and shattering briefly, not scary, short, no voice",
    durationSeconds: 0.8,
    volume: 0.55,
  },
  {
    id: "dot_tick",
    kind: "sfx",
    text: "very subtle soft poison or fire status tick blip, quiet, short, no voice",
    durationSeconds: 0.5,
    volume: 0.25,
  },
  {
    id: "boss_attack",
    kind: "sfx",
    text: "large creature attack whoosh and impact, dark fantasy, restrained, no voice",
    durationSeconds: 0.85,
    volume: 0.6,
  },
  {
    id: "minion_shot",
    kind: "sfx",
    text: "generic small enemy attack whoosh, short fantasy add hit, classroom safe, no voice",
    durationSeconds: 0.5,
    volume: 0.45,
  },
  {
    id: "minion_moss_mite",
    kind: "sfx",
    text: "tiny insect nibble chitter soft squelch, moss mite bite, short fantasy, classroom safe, no voice",
    durationSeconds: 0.55,
    volume: 0.5,
  },
  {
    id: "minion_cinder_imp",
    kind: "sfx",
    text: "small fire spit ember puff, cinder imp attack, short fantasy, classroom safe, no voice",
    durationSeconds: 0.6,
    volume: 0.5,
  },
  {
    id: "minion_bone_archer",
    kind: "sfx",
    text: "bone arrow whoosh and soft impact, skeletal archer, short fantasy, classroom safe, no voice",
    durationSeconds: 0.55,
    volume: 0.5,
  },
  {
    id: "fizzle",
    kind: "sfx",
    text: "magical spell fizzle fail, sad little poof and sputter, comic short, classroom safe, no voice",
    durationSeconds: 0.7,
    volume: 0.55,
  },
  {
    id: "explosion_f",
    kind: "sfx",
    text: "small magical backfire explosion, comic danger, short, classroom safe, no voice",
    durationSeconds: 0.75,
    volume: 0.55,
  },
  {
    id: "victory",
    kind: "sfx",
    text: "triumphant short fantasy fanfare sting, hopeful, not long, no voice",
    durationSeconds: 1.4,
    volume: 0.55,
  },
  {
    id: "defeat",
    kind: "sfx",
    text: "somber low fantasy loss sting, short restrained, no voice",
    durationSeconds: 1.2,
    volume: 0.5,
  },

  // --- Short VO (optional; muted by default in UI) ---
  {
    id: "vo_round_start",
    kind: "vo",
    text: "Position the magnet. Then drop the tokens.",
    volume: 0.7,
  },
  {
    id: "vo_victory",
    kind: "vo",
    text: "The boss falls. Your party endures.",
    volume: 0.7,
  },
  {
    id: "vo_defeat",
    kind: "vo",
    text: "The party has fallen.",
    volume: 0.7,
  },
  // Occasional claim yells (token holders)
  { id: "vo_claim_a", kind: "vo", text: "A! Mine!", volume: 0.75 },
  { id: "vo_claim_b", kind: "vo", text: "B, got it!", volume: 0.75 },
  { id: "vo_claim_c", kind: "vo", text: "C token!", volume: 0.75 },
  { id: "vo_claim_d", kind: "vo", text: "Uh, D?", volume: 0.75 },
  { id: "vo_claim_f", kind: "vo", text: "F? Oh no!", volume: 0.75 },
  // Occasional action yells
  { id: "vo_act_a", kind: "vo", text: "Here we go!", volume: 0.7 },
  { id: "vo_act_b", kind: "vo", text: "Hit them!", volume: 0.7 },
  { id: "vo_act_c", kind: "vo", text: "Now!", volume: 0.7 },
  { id: "vo_act_d", kind: "vo", text: "Careful…", volume: 0.7 },
  { id: "vo_act_f", kind: "vo", text: "This is bad!", volume: 0.75 },
  // Hurt reactions
  { id: "vo_hurt_1", kind: "vo", text: "Ow!", volume: 0.7 },
  { id: "vo_hurt_2", kind: "vo", text: "I'm hit!", volume: 0.7 },
  { id: "vo_hurt_3", kind: "vo", text: "Hold on!", volume: 0.7 },
];

function mergeCatalog(): AudioClipDef[] {
  const seen = new Set(CORE_CATALOG.map((c) => c.id));
  const bossClips = allBossAudioClips().filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
  return [...CORE_CATALOG, ...bossClips];
}

/** Full catalog including boss TOML audio packs. */
export const AUDIO_CATALOG: AudioClipDef[] = mergeCatalog();

export function getClip(id: string): AudioClipDef | undefined {
  return AUDIO_CATALOG.find((c) => c.id === id);
}

/** Rebuild after hot-reload of boss content (tests / dev). */
export function refreshAudioCatalogFromBosses(): AudioClipDef[] {
  const merged = mergeCatalog();
  AUDIO_CATALOG.length = 0;
  AUDIO_CATALOG.push(...merged);
  return AUDIO_CATALOG;
}
