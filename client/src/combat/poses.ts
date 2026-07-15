import type { PresentationCue } from "../api";

/** Darkest Dungeon–style combat poses. */
export type CombatPose = "standing" | "attack" | "hit" | "death";

/**
 * Derive pose for a unit from the active presentation cue.
 * Dead units always stay on death.
 *
 * Rules (DD-style):
 * - Speaker / actor → attack (or claim = brief standing flex)
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

  switch (cue.kind) {
    case "claim":
      // Token grab — slight emphasis, not a full attack swing
      return isSpeaker ? "standing" : "standing";

    case "action":
      if (isSpeaker) return "attack";
      // Focused non-speaker = damage target (boss or minion)
      if (inFocus) return "hit";
      return "standing";

    case "boss":
    case "telegraph":
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

/** CSS classes for FX tags on the portrait frame. */
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
  return cue.fx
    .map((f) => {
      if (f === "poison-tint" || f.includes("poison")) return "fx-poison-tint";
      if (f === "fire-flash" || f.includes("fire")) return "fx-fire-flash";
      if (f === "heal-glow" || f.includes("heal")) return "fx-heal-glow";
      if (f === "hurt-flash") return "fx-hurt-flash";
      if (f === "attack-flash" || f === "claim-pop") return "fx-attack-flash";
      if (f === "boss-attack" || f === "boss-windup") return "fx-boss-attack";
      return "";
    })
    .filter(Boolean)
    .join(" ");
}
