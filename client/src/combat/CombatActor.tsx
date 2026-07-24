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

type WindupTheme = "ember" | "poison" | "summon" | "shock" | "frost";

/** Persistent portrait tint while a DoT / Frozen is on the unit (not only on tick flash). */
function dotTintClasses(statuses?: StatusTag[]): string[] {
  if (!statuses?.length) return [];
  const out: string[] = [];
  for (const st of statuses) {
    if (st.kind === "Frozen") {
      out.push("fx-frozen-tint");
      continue;
    }
    if (st.kind !== "Dot") continue;
    if (st.type === "Fire") out.push("fx-fire-tint");
    else if (st.type === "Poison") out.push("fx-poison-tint");
    else if (st.type === "Ice") out.push("fx-ice-tint");
    else if (st.type === "Slime") out.push("fx-slime-tint");
  }
  return out;
}

function hasSlimeDot(statuses?: StatusTag[]): boolean {
  return !!statuses?.some((st) => st.kind === "Dot" && st.type === "Slime");
}

/**
 * Persistent slime: soft goo sheen + a few wax-like drips over the portrait.
 * Subtle at desk distance, still readable from a projector.
 */
function SlimeDripFx() {
  const dripCount = 6;
  return (
    <div className="slime-drip-fx" aria-hidden>
      <div className="slime-drip-sheen" />
      <div className="slime-drip-streams">
        {Array.from({ length: dripCount }, (_, i) => (
          <span
            key={i}
            className="slime-drip-stream"
            style={
              {
                "--drip-i": i,
                "--drip-n": dripCount,
                "--drip-x": `${12 + ((i * 41 + 7) % 72)}%`,
                "--drip-w": `${3 + (i % 3)}px`,
                "--drip-delay": `${(i % 6) * 0.45}s`,
                "--drip-dur": `${2.4 + (i % 4) * 0.35}s`,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
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

/**
 * Shield Maiden energy beam — subtle anime charge / release.
 * mode charge: inward sparks + expanding rings (build-up)
 * mode blast: soft radial shockwave on caster or target impact
 */
function MaidenEnergyFx({ mode }: { mode: "charge" | "blast" | "impact" }) {
  const sparkCount = mode === "charge" ? 8 : mode === "blast" ? 10 : 6;
  return (
    <div className={`maiden-energy-fx maiden-energy-fx--${mode}`} aria-hidden>
      <div className="maiden-energy-core" />
      <div className="maiden-energy-ring maiden-energy-ring--a" />
      <div className="maiden-energy-ring maiden-energy-ring--b" />
      {mode !== "charge" && (
        <div className="maiden-energy-ring maiden-energy-ring--shock" />
      )}
      <div className="maiden-energy-sparks">
        {Array.from({ length: sparkCount }, (_, i) => (
          <span
            key={i}
            className="maiden-energy-spark"
            style={
              {
                "--spark-i": i,
                "--spark-n": sparkCount,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Fire Mage — red/orange anime explosion.
 * charge: pulsing core that grows until cast
 * blast / impact: outward fireburst on caster + hit targets
 */
function FireBurstFx({ mode }: { mode: "charge" | "blast" | "impact" }) {
  const emberCount = mode === "charge" ? 10 : mode === "blast" ? 12 : 8;
  return (
    <div className={`fire-burst-fx fire-burst-fx--${mode}`} aria-hidden>
      <div className="fire-burst-core" />
      <div className="fire-burst-halo" />
      <div className="fire-burst-ring fire-burst-ring--a" />
      <div className="fire-burst-ring fire-burst-ring--b" />
      {mode !== "charge" && (
        <div className="fire-burst-ring fire-burst-ring--shock" />
      )}
      <div className="fire-burst-embers">
        {Array.from({ length: emberCount }, (_, i) => (
          <span
            key={i}
            className="fire-burst-ember"
            style={
              {
                "--ember-i": i,
                "--ember-n": emberCount,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Necromancer — purple ghost cloud (eyeless wisps) that swarm then burst outward.
 */
function NecroSwarmFx({ mode }: { mode: "charge" | "blast" | "impact" }) {
  const ghostCount = mode === "charge" ? 9 : mode === "blast" ? 11 : 7;
  return (
    <div className={`necro-swarm-fx necro-swarm-fx--${mode}`} aria-hidden>
      <div className="necro-swarm-cloud" />
      <div className="necro-swarm-ring necro-swarm-ring--a" />
      <div className="necro-swarm-ring necro-swarm-ring--b" />
      <div className="necro-swarm-ghosts">
        {Array.from({ length: ghostCount }, (_, i) => (
          <span
            key={i}
            className="necro-swarm-ghost"
            style={
              {
                "--ghost-i": i,
                "--ghost-n": ghostCount,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Thundercaller — electric charge then outward lightning burst.
 */
function ThunderBoltFx({ mode }: { mode: "charge" | "blast" | "impact" }) {
  const boltCount = mode === "charge" ? 6 : mode === "blast" ? 8 : 5;
  return (
    <div className={`thunder-bolt-fx thunder-bolt-fx--${mode}`} aria-hidden>
      <div className="thunder-bolt-core" />
      <div className="thunder-bolt-ring" />
      <div className="thunder-bolt-bolts">
        {Array.from({ length: boltCount }, (_, i) => (
          <span
            key={i}
            className="thunder-bolt-ray"
            style={
              {
                "--bolt-i": i,
                "--bolt-n": boltCount,
              } as CSSProperties
            }
          />
        ))}
      </div>
      {mode !== "charge" && (
        <>
          <div className="thunder-bolt-flash thunder-bolt-flash--a" />
          <div className="thunder-bolt-flash thunder-bolt-flash--b" />
        </>
      )}
    </div>
  );
}

/**
 * Healer — soft green/gold rain falling onto the caster.
 * Runesinger — golden rune motes rising from the ground (same shell, direction differs).
 */
function SpiritRainFx({
  mode,
  variant,
}: {
  mode: "charge" | "blast";
  variant: "heal" | "rune";
}) {
  const dropCount = mode === "charge" ? 14 : 18;
  return (
    <div
      className={`spirit-rain-fx spirit-rain-fx--${variant} spirit-rain-fx--${mode}`}
      aria-hidden
    >
      <div className="spirit-rain-glow" />
      <div className="spirit-rain-drops">
        {Array.from({ length: dropCount }, (_, i) => (
          <span
            key={i}
            className="spirit-rain-drop"
            style={
              {
                "--drop-i": i,
                "--drop-n": dropCount,
                "--drop-x": `${8 + ((i * 37) % 84)}%`,
                "--drop-delay": `${(i % 8) * 0.07}s`,
                "--drop-dur": `${0.55 + (i % 5) * 0.08}s`,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Vanguard — seismic bastion: steel plates lock in, then ground-slam shockwave.
 * Physical fortify feel, not a soft magic beam.
 */
function VanguardBastionFx({ mode }: { mode: "charge" | "blast" | "impact" }) {
  return (
    <div className={`vanguard-bastion-fx vanguard-bastion-fx--${mode}`} aria-hidden>
      <div className="vanguard-bastion-dust" />
      <div className="vanguard-bastion-plate vanguard-bastion-plate--l" />
      <div className="vanguard-bastion-plate vanguard-bastion-plate--r" />
      <div className="vanguard-bastion-plate vanguard-bastion-plate--t" />
      <div className="vanguard-bastion-ring vanguard-bastion-ring--a" />
      <div className="vanguard-bastion-ring vanguard-bastion-ring--b" />
      {mode !== "charge" && (
        <>
          <div className="vanguard-bastion-ring vanguard-bastion-ring--slam" />
          <div className="vanguard-bastion-sparks">
            {Array.from({ length: 8 }, (_, i) => (
              <span
                key={i}
                className="vanguard-bastion-spark"
                style={
                  {
                    "--spark-i": i,
                    "--spark-n": 8,
                  } as CSSProperties
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Doomcaller — void sigils orbit/collapse, then reverse-rupture (siphon → dump).
 * Geometric curse seals, not ghost wisps.
 */
function DoomSigilFx({ mode }: { mode: "charge" | "blast" | "impact" }) {
  const sealCount = mode === "charge" ? 5 : 6;
  return (
    <div className={`doom-sigil-fx doom-sigil-fx--${mode}`} aria-hidden>
      <div className="doom-sigil-void" />
      <div className="doom-sigil-orbit">
        {Array.from({ length: sealCount }, (_, i) => (
          <span
            key={i}
            className="doom-sigil-seal"
            style={
              {
                "--seal-i": i,
                "--seal-n": sealCount,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <div className="doom-sigil-ring doom-sigil-ring--a" />
      <div className="doom-sigil-ring doom-sigil-ring--b" />
      {mode !== "charge" && <div className="doom-sigil-rift" />}
    </div>
  );
}

/**
 * Archer — focused draw at center, then a powerful horizontal explosion to the right
 * on the caster (toward the boss). On impact targets (boss), the volley arrives from
 * the left into center so it reads as arrows hitting from the party side.
 */
function ArcherVolleyFx({ mode }: { mode: "charge" | "blast" | "impact" }) {
  const shardCount = mode === "charge" ? 6 : 10;
  return (
    <div className={`archer-volley-fx archer-volley-fx--${mode}`} aria-hidden>
      <div className="archer-volley-core" />
      {mode === "charge" && (
        <>
          <div className="archer-volley-string archer-volley-string--a" />
          <div className="archer-volley-string archer-volley-string--b" />
        </>
      )}
      {mode !== "charge" && (
        <>
          <div className="archer-volley-blast archer-volley-blast--a" />
          <div className="archer-volley-blast archer-volley-blast--b" />
          <div className="archer-volley-blast archer-volley-blast--c" />
          <div className="archer-volley-shock" />
        </>
      )}
      <div className="archer-volley-shards">
        {Array.from({ length: shardCount }, (_, i) => (
          <span
            key={i}
            className="archer-volley-shard"
            style={
              {
                "--shard-i": i,
                "--shard-n": shardCount,
                "--shard-y": `${-18 + (i % 5) * 9}%`,
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
  const pose = poseOverride ?? poseForUnit(unitId, alive, cue, statuses);
  // Cue flash FX + persistent DoT body tint from live statuses (Fire≠Poison)
  const fx = [
    fxClassesForUnit(unitId, cue),
    ...dotTintClasses(statuses),
  ]
    .filter(Boolean)
    .join(" ");
  const speaking = cue?.bubble?.speakerId === unitId;
  const inFocus = cue?.focusIds?.includes(unitId) ?? false;
  const isBoss = portrait.role === "boss";
  const threat = threatTierFromCue(cue) ?? "light";
  const windupTheme = windupThemeFromCue(cue);
  const showBossWindup =
    isBoss &&
    pose === "windup" &&
    (cue?.fx?.includes("boss-windup") ?? false);
  const showMaidenCharge =
    speaking && (cue?.fx?.includes("maiden-charge") ?? false);
  const showMaidenBlast =
    speaking && (cue?.fx?.includes("maiden-blast") ?? false);
  const showMaidenImpact =
    !speaking &&
    inFocus &&
    (cue?.fx?.includes("maiden-blast") ?? false);
  const showFireCharge =
    speaking && (cue?.fx?.includes("fire-charge") ?? false);
  const showFireBlast =
    speaking && (cue?.fx?.includes("fire-blast") ?? false);
  const showFireImpact =
    !speaking &&
    inFocus &&
    (cue?.fx?.includes("fire-blast") ?? false);
  const showNecroCharge =
    speaking && (cue?.fx?.includes("necro-charge") ?? false);
  const showNecroBlast =
    speaking && (cue?.fx?.includes("necro-blast") ?? false);
  const showNecroImpact =
    !speaking &&
    inFocus &&
    (cue?.fx?.includes("necro-blast") ?? false);
  const showThunderCharge =
    speaking && (cue?.fx?.includes("thunder-charge") ?? false);
  const showThunderBlast =
    speaking && (cue?.fx?.includes("thunder-blast") ?? false);
  const showThunderImpact =
    !speaking &&
    inFocus &&
    (cue?.fx?.includes("thunder-blast") ?? false);
  // Rain stays on the caster (not enemy focus) — heal/hymn is about the singer
  const showHealCharge =
    speaking && (cue?.fx?.includes("heal-charge") ?? false);
  const showHealBlast =
    speaking && (cue?.fx?.includes("heal-blast") ?? false);
  const showRuneCharge =
    speaking && (cue?.fx?.includes("rune-charge") ?? false);
  const showRuneBlast =
    speaking && (cue?.fx?.includes("rune-blast") ?? false);
  const showVanguardCharge =
    speaking && (cue?.fx?.includes("vanguard-charge") ?? false);
  const showVanguardBlast =
    speaking && (cue?.fx?.includes("vanguard-blast") ?? false);
  const showVanguardImpact =
    !speaking &&
    inFocus &&
    (cue?.fx?.includes("vanguard-blast") ?? false);
  const showDoomCharge =
    speaking && (cue?.fx?.includes("doom-charge") ?? false);
  const showDoomBlast =
    speaking && (cue?.fx?.includes("doom-blast") ?? false);
  const showDoomImpact =
    !speaking &&
    inFocus &&
    (cue?.fx?.includes("doom-blast") ?? false);
  const showArcherCharge =
    speaking && (cue?.fx?.includes("archer-charge") ?? false);
  const showArcherBlast =
    speaking && (cue?.fx?.includes("archer-blast") ?? false);
  const showArcherImpact =
    !speaking &&
    inFocus &&
    (cue?.fx?.includes("archer-blast") ?? false);
  const showSlimeDrip = hasSlimeDot(statuses);
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
        className={`relative overflow-visible ${isBoss ? "w-full max-w-[12rem] md:max-w-[14rem] mx-auto" : "w-full"}`}
      >
        {showBossWindup && (
          <BossWindupFx threat={threat} theme={windupTheme} />
        )}
        {showMaidenCharge && <MaidenEnergyFx mode="charge" />}
        {showMaidenBlast && <MaidenEnergyFx mode="blast" />}
        {showMaidenImpact && <MaidenEnergyFx mode="impact" />}
        {showFireCharge && <FireBurstFx mode="charge" />}
        {showFireBlast && <FireBurstFx mode="blast" />}
        {showFireImpact && <FireBurstFx mode="impact" />}
        {showNecroCharge && <NecroSwarmFx mode="charge" />}
        {showNecroBlast && <NecroSwarmFx mode="blast" />}
        {showNecroImpact && <NecroSwarmFx mode="impact" />}
        {showThunderCharge && <ThunderBoltFx mode="charge" />}
        {showThunderBlast && <ThunderBoltFx mode="blast" />}
        {showThunderImpact && <ThunderBoltFx mode="impact" />}
        {showHealCharge && <SpiritRainFx mode="charge" variant="heal" />}
        {showHealBlast && <SpiritRainFx mode="blast" variant="heal" />}
        {showRuneCharge && <SpiritRainFx mode="charge" variant="rune" />}
        {showRuneBlast && <SpiritRainFx mode="blast" variant="rune" />}
        {showVanguardCharge && <VanguardBastionFx mode="charge" />}
        {showVanguardBlast && <VanguardBastionFx mode="blast" />}
        {showVanguardImpact && <VanguardBastionFx mode="impact" />}
        {showDoomCharge && <DoomSigilFx mode="charge" />}
        {showDoomBlast && <DoomSigilFx mode="blast" />}
        {showDoomImpact && <DoomSigilFx mode="impact" />}
        {showArcherCharge && <ArcherVolleyFx mode="charge" />}
        {showArcherBlast && <ArcherVolleyFx mode="blast" />}
        {showArcherImpact && <ArcherVolleyFx mode="impact" />}
        <PlaceholderPortrait
          kind={portrait}
          pose={pose}
          className={
            isBoss
              ? "w-full aspect-[5/6] h-auto"
              : frameClass
          }
        />
        {/* After portrait so wax drips sit on top of art (not under the PNG). */}
        {showSlimeDrip && <SlimeDripFx />}
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
