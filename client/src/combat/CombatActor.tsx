import type { CSSProperties } from "react";
import {
  statusToChip,
  type Grade,
  type StatusTag,
} from "@dungeon-grades/shared";
import type { PresentationCue } from "../api";
import { DamageFloatStack, type HpFloat } from "./DamageFloat";
import GradeToken from "./GradeToken";
import { SpeechBubble } from "./SpeechBubble";
import { PlaceholderPortrait, type PortraitKind } from "./PlaceholderPortrait";
import {
  fxClassesForUnit,
  poseForUnit,
  threatTierFromCue,
  windupThemeFromCue,
  type CombatPose,
} from "./poses";

type WindupTheme = "ember" | "poison" | "summon" | "shock";

/** Persistent portrait tint while a DoT is on the unit (not only on tick flash). */
function dotTintClasses(statuses?: StatusTag[]): string[] {
  if (!statuses?.length) return [];
  const out: string[] = [];
  for (const st of statuses) {
    if (st.kind !== "Dot") continue;
    if (st.type === "Fire") out.push("fx-fire-tint");
    else if (st.type === "Poison") out.push("fx-poison-tint");
    else if (st.type === "Ice") out.push("fx-ice-tint");
    else if (st.type === "Slime") out.push("fx-slime-tint");
  }
  return out;
}

/**
 * Telegraph particle field over the boss.
 * Theme: ember / poison / summon / shock (yellow lightning).
 */
function BossWindupFx({
  threat,
  theme,
}: {
  threat: "light" | "heavy" | "ultimate";
  theme: WindupTheme;
}) {
  const count =
    theme === "summon"
      ? threat === "ultimate"
        ? 12
        : threat === "heavy"
          ? 9
          : 6
      : theme === "shock"
        ? threat === "ultimate"
          ? 12
          : threat === "heavy"
            ? 9
            : 7
        : threat === "ultimate"
          ? 14
          : threat === "heavy"
            ? 10
            : 6;
  return (
    <div
      className={`ash-windup-fx ash-windup-fx--${threat} ash-windup-fx--${theme}`}
      aria-hidden
    >
      <div className="ash-heat-haze" />
      <div className="ash-smoke-ring" />
      {theme === "shock" && (
        <>
          <div className="shock-bolt shock-bolt--a" />
          <div className="shock-bolt shock-bolt--b" />
          <div className="shock-bolt shock-bolt--c" />
        </>
      )}
      <div className="ash-ember-field">
        {Array.from({ length: count }, (_, i) => (
          <span
            key={i}
            className="ash-ember"
            style={
              {
                "--ember-i": i,
                "--ember-n": count,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}

export function StatusLabels({
  statuses,
  block,
}: {
  statuses?: StatusTag[];
  block?: number;
}) {
  const chips: { key: string; text: string; title: string; className: string }[] =
    [];
  if (block && block > 0) {
    chips.push({
      key: "block",
      text: `Block ${block}`,
      title: "Personal block remaining this round",
      className: "text-sky-300 border-sky-400/40 bg-sky-950/40",
    });
  }
  for (let i = 0; i < (statuses?.length ?? 0); i++) {
    const st = statuses![i]!;
    const c = statusToChip(st, i);
    // Prefer "Poison ×2" style under the image
    let text = c.label;
    if (st.kind === "Dot") {
      text = `${st.type} ×${st.stacks}`;
    }
    chips.push({
      key: c.key,
      text,
      title: c.title,
      className: c.colorClass,
    });
  }
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap justify-center gap-0.5 mt-0.5 min-h-[1.1rem]">
      {chips.map((c) => (
        <span
          key={c.key}
          title={c.title}
          className={`inline-flex text-[8px] md:text-[9px] px-1 rounded border leading-tight ${c.className}`}
        >
          {c.text}
        </span>
      ))}
    </div>
  );
}

export function CombatActor({
  unitId,
  name,
  portrait,
  pose: poseOverride,
  cue,
  alive = true,
  currentHp,
  maxHp,
  block,
  statuses,
  claimGrade,
  size = "md",
  showName = true,
  /** Default off — party line uses the effects rail under cards. */
  showStatuses = false,
  subtitle,
  className = "",
  /** Floating −N / +N when HP changes this beat */
  hpFloats,
}: {
  unitId: string;
  name: string;
  portrait: PortraitKind;
  /** Force pose (e.g. tests); otherwise derived from cue + alive */
  pose?: CombatPose;
  cue?: PresentationCue | null;
  alive?: boolean;
  currentHp: number;
  maxHp: number;
  block?: number;
  statuses?: StatusTag[];
  claimGrade?: Grade;
  size?: "sm" | "md" | "lg";
  showName?: boolean;
  /**
   * When true, render StatusLabels (block/DoTs) under HP.
   * Party combat cards leave this false; effects live in the under-row rail.
   */
  showStatuses?: boolean;
  subtitle?: string;
  className?: string;
  hpFloats?: HpFloat[];
}) {
  const pose = poseOverride ?? poseForUnit(unitId, alive, cue);
  // Cue flash FX + persistent DoT body tint from live statuses (Fire≠Poison)
  const fx = [
    fxClassesForUnit(unitId, cue),
    ...dotTintClasses(statuses),
  ]
    .filter(Boolean)
    .join(" ");
  const speaking = cue?.bubble?.speakerId === unitId;
  const isBoss = portrait.role === "boss";
  const threat = threatTierFromCue(cue) ?? "light";
  const windupTheme = windupThemeFromCue(cue);
  const showBossWindup =
    isBoss &&
    pose === "windup" &&
    (cue?.fx?.includes("boss-windup") ?? false);
  // Boss: taller portrait box (was a short wide strip → only scalp with object-cover).
  // Party/minion: fixed height cards.
  const frameClass = isBoss
    ? "w-full max-w-[12rem] md:max-w-[14rem] aspect-[5/6] h-auto mx-auto"
    : size === "lg"
      ? "w-full h-28 md:h-36"
      : size === "sm"
        ? "w-full h-16 md:h-20"
        : "w-full h-20 md:h-24";

  return (
    <div className={`relative flex flex-col items-center ${className} ${fx}`}>
      {claimGrade && (
        <GradeToken
          grade={claimGrade}
          size="xs"
          claimed
          className="absolute -top-2 -right-1 z-10"
          title={`Claimed ${claimGrade}`}
        />
      )}
      {speaking && cue && <SpeechBubble cue={cue} anchor="top" />}
      <div
        className={`relative ${isBoss ? "w-full max-w-[12rem] md:max-w-[14rem] mx-auto" : "w-full"}`}
      >
        {showBossWindup && (
          <BossWindupFx threat={threat} theme={windupTheme} />
        )}
        <PlaceholderPortrait
          kind={portrait}
          pose={pose}
          className={
            isBoss
              ? "w-full aspect-[5/6] h-auto"
              : frameClass
          }
        />
        <DamageFloatStack
          floats={hpFloats}
          size={isBoss ? "lg" : size}
        />
      </div>
      {showName && (
        <div className="text-[10px] md:text-xs font-medium truncate w-full text-center mt-0.5 leading-tight">
          {name}
        </div>
      )}
      {subtitle && (
        <div className="text-[8px] md:text-[9px] text-parchment-dim/80 truncate w-full text-center">
          {subtitle}
        </div>
      )}
      <div className="w-full mt-0.5 h-1.5 rounded bg-navy overflow-hidden border border-parchment/10">
        <div
          className="h-full bg-crimson-bright transition-all"
          style={{
            width: `${Math.max(0, maxHp > 0 ? (currentHp / maxHp) * 100 : 0)}%`,
          }}
        />
      </div>
      <div className="text-[9px] md:text-[10px] text-parchment-dim tabular-nums">
        {currentHp}/{maxHp}
      </div>
      {showStatuses ? (
        <StatusLabels statuses={statuses} block={block} />
      ) : null}
    </div>
  );
}
