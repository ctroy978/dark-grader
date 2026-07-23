import type { CSSProperties } from "react";
import {
  GRADE_COLORS,
  statusToChip,
  type Grade,
  type StatusTag,
} from "@dungeon-grades/shared";
import type { PresentationCue } from "../api";
import { SpeechBubble } from "./SpeechBubble";
import { PlaceholderPortrait, type PortraitKind } from "./PlaceholderPortrait";
import {
  fxClassesForUnit,
  poseForUnit,
  threatTierFromCue,
  windupThemeFromCue,
  type CombatPose,
} from "./poses";

type WindupTheme = "ember" | "poison" | "summon";

/**
 * Telegraph particle field over the boss.
 * Theme: ember (fire/slam), poison (green bubbles), summon (void wisps).
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
  subtitle,
  className = "",
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
  subtitle?: string;
  className?: string;
}) {
  const pose = poseOverride ?? poseForUnit(unitId, alive, cue);
  const fx = fxClassesForUnit(unitId, cue);
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
        <span
          className="absolute -top-1.5 -right-0.5 z-10 w-5 h-5 md:w-6 md:h-6 rounded-full border-2 flex items-center justify-center text-[10px] md:text-xs font-black bg-navy"
          style={{
            color: GRADE_COLORS[claimGrade],
            borderColor: GRADE_COLORS[claimGrade],
          }}
          title={`Claimed ${claimGrade}`}
        >
          {claimGrade}
        </span>
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
      <StatusLabels statuses={statuses} block={block} />
    </div>
  );
}
