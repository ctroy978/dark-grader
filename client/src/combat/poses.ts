import type { StatusTag } from "@dungeon-grades/shared";
import type { PresentationCue } from "../api";

/** Darkest Dungeon–style combat poses. */
export type CombatPose =
  | "standing"
  | "windup"
  | "attack"
  /** Shield Maiden only — cleanse.png when she actually strips a DoT. */
  | "cleanse"
  | "hit"
  | "death"
  /** SpreadingFrost lock — ice.png (party) while Frozen status is active */
  | "ice";

/**
 * Derive pose for a unit from the active presentation cue + live statuses.
 * Dead units always stay on death. Frozen sticks on ice.png until A-break
 * (or soft freeze clears) — including when focused by a heal/hymn cue.
 *
 * Rules (DD-style):
 * - Dead → death (sticky)
 * - Frozen → ice (sticky; overrides attack/hit/heal calm while locked)
 * - Speaker / actor → attack (or claim = brief standing flex)
 * - Boss telegraph → windup (charge pose + telegraph SFX)
 * - Boss impact → attack
 * - Targets of enemy damage → hit
 * - Else → standing
 */
export function poseForUnit(
  unitId: string,
  alive: boolean,
  cue: PresentationCue | null | undefined,
  statuses?: StatusTag[],
): CombatPose {
  if (!alive) return "death";
  // Sticky freeze portrait while status remains (classroom-readable)
  if (statuses?.some((s) => s.kind === "Frozen")) return "ice";
  if (!cue) return "standing";

  const isSpeaker = cue.bubble?.speakerId === unitId;
  const inFocus = cue.focusIds?.includes(unitId) ?? false;
  const fx = cue.fx ?? [];

  switch (cue.kind) {
    case "claim":
      // Token grab — slight emphasis, not a full attack swing
      return isSpeaker ? "standing" : "standing";

    case "action":
      // Shield Maiden uses her dedicated cleanse.png only when a strip landed.
      if (isSpeaker && fx.includes("maiden-cleanse")) return "cleanse";
      // A-break free — triumphant attack pose (status already cleared)
      if (isSpeaker && fx.includes("ice-break")) return "attack";
      // Frozen skip (token waste) — ice pose, not a swing
      if (isSpeaker && fx.includes("party-frozen")) return "ice";
      // Party stun skip — reel, don't swing
      if (
        isSpeaker &&
        fx.some((f) => f === "party-stunned" || f === "stunned")
      ) {
        return "hit";
      }
      // Ohm Reflect bounce beat — flinch even if they were the attacker
      if (isSpeaker && fx.includes("reflect-hit")) return "hit";
      if (isSpeaker) return "attack";
      // Focused non-speaker: flinch on strikes; soft heal/hymn/buff recipients stay calm
      if (inFocus) {
        // Cleansed allies receive a soft wash, never an attack impact / hit pose.
        if (cue.cleanseTargetIds?.includes(unitId)) return "standing";
        // Necro Life Power empower (or purple rain spend) — never hit.png
        if (
          fx.some((f) => f === "life-power-grant" || f === "life-power-blast")
        ) {
          return "standing";
        }
        const offensive = fx.some(
          (f) =>
            f === "hurt-flash" ||
            f === "shock-flash" ||
            f === "reflect-hit" ||
            f === "fire-flash" ||
            f === "fire-tint" ||
            f === "fire-blast" ||
            f === "thunder-blast" ||
            f === "necro-blast" ||
            f === "maiden-blast" ||
            f === "vanguard-blast" ||
            f === "doom-blast" ||
            f === "archer-blast" ||
            f === "spear-blast" ||
            f === "party-stunned",
        );
        const softHeal = fx.some(
          (f) =>
            f === "heal-glow" ||
            f === "heal-blast" ||
            f === "rune-blast" ||
            f === "hymn-tick" ||
            f === "hymn-glow",
        );
        // Pure heal / hymn (Healer F boss backlash, party mend) — no flinch
        if (softHeal && !offensive) return "standing";
        return "hit";
      }
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
      // Party cast charges (kind "telegraph" + *-charge): caster stays standing;
      // boss must NOT flash windup.png between party hits — only real boss wind-ups.
      if (
        isSpeaker &&
        (fx.includes("maiden-charge") ||
          fx.includes("fire-charge") ||
          fx.includes("necro-charge") ||
          fx.includes("thunder-charge") ||
          fx.includes("heal-charge") ||
          fx.includes("rune-charge") ||
          fx.includes("vanguard-charge") ||
          fx.includes("doom-charge") ||
          fx.includes("archer-charge") ||
          fx.includes("spear-charge"))
      ) {
        return "standing";
      }
      // Boss wind-up only when server tags a boss telegraph (not party cast charges)
      if (unitId === "boss") {
        if (
          fx.includes("boss-windup") ||
          fx.some((f) => f.startsWith("windup-"))
        ) {
          return "windup";
        }
        // Between party attacks / other telegraphs: idle, not charging
        return "standing";
      }
      if (isSpeaker) return "windup";
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
      // Frost shatter (kind hurt + ice-break) and DoT ticks: focused seats flinch
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
): "ember" | "poison" | "summon" | "shock" | "frost" {
  if (cue?.fx?.includes("windup-poison")) return "poison";
  if (cue?.fx?.includes("windup-summon")) return "summon";
  if (cue?.fx?.includes("windup-shock")) return "shock";
  if (cue?.fx?.includes("windup-frost")) return "frost";
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
  const cleanseTarget = cue.cleanseTargetIds?.includes(unitId) ?? false;
  return cue.fx
    .map((f) => {
      // A cleanse target shares the actor's cue, but must not inherit its
      // offensive class blast/tint. Only the dedicated wash paints this seat.
      if (cleanseTarget) {
        return f === "cleanse-glow" && !isBoss ? "fx-cleanse-glow" : "";
      }
      // Victim tints — party only (boss impact/wind-up glow is separate)
      if (f === "poison-tint") return !isBoss ? "fx-poison-tint" : "";
      if (f === "fire-tint" || f === "fire-flash") return !isBoss ? "fx-fire-tint" : "";
      if (f === "ice-tint") return !isBoss ? "fx-ice-tint" : "";
      if (f === "slime-tint") return !isBoss ? "fx-slime-tint" : "";
      if (f === "chill-tint") return !isBoss ? "fx-chill-tint" : "";
      if (f === "memory-slime") return !isBoss ? "fx-slime-tint" : "";
      if (f === "memory-poison") return !isBoss ? "fx-poison-tint" : "";
      if (f === "memory-fire") return !isBoss ? "fx-fire-tint" : "";
      if (f === "memory-shock") return "fx-shock-flash";
      if (f === "memory-frost") return "fx-ice-tint";
      if (f === "frost-flash" || f === "frost-shatter") {
        return !isBoss ? "fx-frost-flash" : "fx-frost-flash";
      }
      // A-on-Frozen party thaw — bright ice shatter (shards are a separate overlay)
      if (f === "ice-break") {
        return !isBoss ? "fx-ice-break" : "";
      }
      if (f === "shock-flash") return "fx-shock-flash";
      if (f === "hurt-flash" || f === "reflect-hit")
        return !isBoss ? "fx-hurt-flash" : "";
      if (f === "party-stunned") return !isBoss ? "fx-party-stunned" : "";
      if (f === "party-frozen") return !isBoss ? "fx-party-frozen" : "";
      if (f === "heal-glow") return "fx-heal-glow";
      if (f === "cleanse-glow") return !isBoss ? "fx-cleanse-glow" : "";
      if (f === "maiden-cleanse") {
        return cue.bubble?.speakerId === unitId && !isBoss
          ? "fx-cleanse-cast"
          : "";
      }
      if (f === "life-power-grant" || f === "life-power-blast") {
        return !isBoss ? "fx-life-power-glow" : "";
      }
      if (f === "hymn-glow" || f === "hymn-tick") {
        return !isBoss ? "fx-hymn-glow" : "";
      }
      if (f === "attack-flash" || f === "claim-pop") return "fx-attack-flash";
      if (f === "magnet-lock") return ""; // magnet strip handles this
      // Cast charge stays on the party caster; blast/impact may paint boss or allies
      if (f === "maiden-charge") return !isBoss ? "fx-maiden-charge" : "";
      if (f === "maiden-blast") return "fx-maiden-blast";
      if (f === "fire-charge") return !isBoss ? "fx-fire-charge" : "";
      if (f === "fire-blast") return "fx-fire-blast";
      if (f === "necro-charge") return !isBoss ? "fx-necro-charge" : "";
      if (f === "necro-blast") return "fx-necro-blast";
      if (f === "thunder-charge") return !isBoss ? "fx-thunder-charge" : "";
      if (f === "thunder-blast") return "fx-thunder-blast";
      // Heal charge on caster only; heal blast/glow allowed on boss (Healer F) + party
      if (f === "heal-charge") return !isBoss ? "fx-heal-charge" : "";
      if (f === "heal-blast") return "fx-heal-blast";
      if (f === "rune-charge") return !isBoss ? "fx-rune-charge" : "";
      if (f === "rune-blast") return "fx-rune-blast";
      if (f === "vanguard-charge") return !isBoss ? "fx-vanguard-charge" : "";
      if (f === "vanguard-blast") return "fx-vanguard-blast";
      if (f === "doom-charge") return !isBoss ? "fx-doom-charge" : "";
      if (f === "doom-blast") return "fx-doom-blast";
      if (f === "archer-charge") return !isBoss ? "fx-archer-charge" : "";
      if (f === "archer-blast") return "fx-archer-blast";
      if (f === "spear-charge") return !isBoss ? "fx-spear-charge" : "";
      if (f === "spear-blast") return "fx-spear-blast";
      // Boss-only telegraph / impact (do not paint party red on AOE focus)
      if (f === "boss-windup") return isBoss ? "fx-boss-windup" : "";
      if (f === "boss-voice") return isBoss ? "fx-boss-voice" : "";
      if (f === "boss-attack") return isBoss ? "fx-boss-attack" : "";
      if (f === "boss-exposed") return isBoss ? "fx-boss-stunned" : "";
      if (f === "boss-attack-shock") return isBoss ? "fx-boss-attack-shock" : "";
      if (f === "boss-stunned" || f === "stunned" || f === "stun-skip") {
        return isBoss ? "fx-boss-stunned" : "";
      }
      if (f === "threat-light") return isBoss ? "fx-threat-light" : "";
      if (f === "threat-heavy") return isBoss ? "fx-threat-heavy" : "";
      if (f === "threat-ultimate") return isBoss ? "fx-threat-ultimate" : "";
      if (f === "windup-ember") return isBoss ? "fx-windup-ember" : "";
      if (f === "windup-poison") return isBoss ? "fx-windup-poison" : "";
      if (f === "windup-summon") return isBoss ? "fx-windup-summon" : "";
      if (f === "windup-shock") return isBoss ? "fx-windup-shock" : "";
      if (f === "windup-frost") return isBoss ? "fx-windup-frost" : "";
      return "";
    })
    .filter(Boolean)
    .join(" ");
}
