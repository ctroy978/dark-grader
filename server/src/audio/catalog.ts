/**
 * Classroom-friendly audio catalog for Dungeon Grades.
 * SFX use ElevenLabs text-to-sound; VO uses text-to-speech.
 */
export type AudioKind = "sfx" | "vo";

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

export const AUDIO_CATALOG: AudioClipDef[] = [
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
    text: "warm gentle healing chime and soft glow pulse, positive, short, no voice",
    durationSeconds: 0.7,
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
    text: "bone arrow or small projectile whoosh, short, skeletal archer feel, no voice",
    durationSeconds: 0.5,
    volume: 0.45,
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
];

export function getClip(id: string): AudioClipDef | undefined {
  return AUDIO_CATALOG.find((c) => c.id === id);
}
