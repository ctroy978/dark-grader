import type { PresentationCue } from "../api";

/** Darkest Dungeon–style combat poses. */
export type CombatPose = "standing" | "windup" | "attack" | "hit" | "death";

/**
 * Derive pose for a unit from the active presentation cue.
 * Dead units always stay on death.
 *
 * Rules (DD-style):
 * - Speaker / actor → attack (or claim = brief standing flex)
 * - Boss telegraph → windup (charge pose + telegraph SFX)
 * - Boss impact → attack
 * - Targets of enemy damage → hit
 * - Dead → death (sticky)
 * - Else → standing
 */
export function poseForUnit(
  unitId: string,
  alive: boolean,
  cue: PresentationCue | null | undefined,
): CombatPose {
  if (!alive) return "death";
  if (!cue) return "standing";

  const isSpeaker = cue.bubble?.speakerId === unitId;
  const inFocus = cue.focusIds?.includes(unitId) ?? false;
  const fx = cue.fx ?? [];

  switch (cue.kind) {
    case "claim":
      // Token grab — slight emphasis, not a full attack swing
      return isSpeaker ? "standing" : "standing";

    case "action":
      if (isSpeaker) return "attack";
      // Focused non-speaker = damage target (boss or minion)
      if (inFocus) return "hit";
      return "standing";

    case "telegraph":
      // Stunned boss reels — do not wind up as if attacking
      if (
        unitId === "boss" &&
        fx.some((f) => f.includes("stun") || f === "stunned")
      ) {
        return "hit";
      }
      // Optional creature-voice beat before wind-up — still idle, not striking
      if (unitId === "boss" && fx.includes("boss-voice")) {
        return "standing";
      }
      // Real wind-up: windup.png + telegraph SFX
      if (unitId === "boss" || isSpeaker) return "windup";
      return "standing";

    case "boss":
      // Stunned skip presentation
      if (
        unitId === "boss" &&
        fx.some((f) => f.includes("stun") || f === "stunned")
      ) {
        return "hit";
      }
      if (unitId === "boss" || isSpeaker) return "attack";
      if (inFocus) return "hit";
      return "standing";

    case "minion":
      if (isSpeaker) return "attack";
      if (inFocus) return "hit";
      return "standing";

    case "hurt":
    case "dot":
      return inFocus || isSpeaker ? "hit" : "standing";

    case "death":
      return inFocus || isSpeaker ? "death" : "standing";

    default:
      return "standing";
  }
}

/** Threat tier tag from presentation fx (if any). */
export function threatTierFromCue(
  cue: PresentationCue | null | undefined,
): "light" | "heavy" | "ultimate" | null {
  const tag = cue?.fx?.find((f) => f.startsWith("threat-"));
  if (tag === "threat-ultimate") return "ultimate";
  if (tag === "threat-heavy") return "heavy";
  if (tag === "threat-light") return "light";
  return null;
}

/** Wind-up color theme from presentation fx (server tags windup-*). */
export function windupThemeFromCue(
  cue: PresentationCue | null | undefined,
): "ember" | "poison" | "summon" {
  if (cue?.fx?.includes("windup-poison")) return "poison";
  if (cue?.fx?.includes("windup-summon")) return "summon";
  return "ember";
}

/** CSS classes for FX tags on the unit wrapper / portrait. */
export function fxClassesForUnit(
  unitId: string,
  cue: PresentationCue | null | undefined,
): string {
  if (!cue?.fx?.length) return "";
  const focused =
    cue.focusIds?.includes(unitId) ||
    cue.bubble?.speakerId === unitId ||
    (unitId === "boss" && cue.focusIds?.includes("boss"));
  if (!focused) return "";
  const isBoss = unitId === "boss";
  return cue.fx
    .map((f) => {
      // Victim tints — party only (boss impact/wind-up glow is separate)
      if (f === "poison-tint") return !isBoss ? "fx-poison-tint" : "";
      if (f === "fire-flash") return !isBoss ? "fx-fire-flash" : "";
      if (f === "hurt-flash") return !isBoss ? "fx-hurt-flash" : "";
      if (f === "heal-glow") return "fx-heal-glow";
      if (f === "attack-flash" || f === "claim-pop") return "fx-attack-flash";
      // Boss-only telegraph / impact (do not paint party red on AOE focus)
      if (f === "boss-windup") return isBoss ? "fx-boss-windup" : "";
      if (f === "boss-voice") return isBoss ? "fx-boss-voice" : "";
      if (f === "boss-attack") return isBoss ? "fx-boss-attack" : "";
      if (f === "boss-stunned" || f === "stunned" || f === "stun-skip") {
        return isBoss ? "fx-boss-stunned" : "";
      }
      if (f === "threat-light") return isBoss ? "fx-threat-light" : "";
      if (f === "threat-heavy") return isBoss ? "fx-threat-heavy" : "";
      if (f === "threat-ultimate") return isBoss ? "fx-threat-ultimate" : "";
      if (f === "windup-ember") return isBoss ? "fx-windup-ember" : "";
      if (f === "windup-poison") return isBoss ? "fx-windup-poison" : "";
      if (f === "windup-summon") return isBoss ? "fx-windup-summon" : "";
      return "";
    })
    .filter(Boolean)
    .join(" ");
}
