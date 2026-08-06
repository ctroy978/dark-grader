import { useEffect, useState } from "react";
import { ARCHETYPE_CLEANSE_DOTS, type Archetype } from "@dungeon-grades/shared";
import { artAssetUrl } from "./artCache";
import type { CombatPose } from "./poses";

/**
 * Portrait: real PNG if present under /art/{key}/{pose}.png, else SVG stub.
 *
 *   /art/vanguard/standing.png
 *   /art/vanguard/ice.png        (party Frozen / SpreadingFrost)
 *   /art/shieldmaiden/cleanse.png (Maiden successful cleanse only)
 *   /art/ash_wraith/windup.png   (boss charge pose)
 *   /art/ash_wraith/attack.png
 *
 * Missing windup.png / ice.png: browser 404 → SVG placeholder until you drop the file.
 * Prefer a real windup over reusing attack.png so wind-up never looks like impact.
 */

const ARCHETYPE_KEY: Record<Archetype, string> = {
  Vanguard: "vanguard",
  ShieldMaiden: "shieldmaiden",
  FireMage: "firemage",
  Healer: "thornmender",
  Archer: "archer",
  Spearman: "spearman",
  Necromancer: "necromancer",
  Thundercaller: "thundercaller",
  Runesinger: "runesinger",
  Lifebinder: "grovekeeper",
};

const ARCHETYPE_TINT: Record<Archetype, string> = {
  Vanguard: "#5a6a8a",
  ShieldMaiden: "#6a5a7a",
  FireMage: "#8a4030",
  Healer: "#4a6a58",
  Archer: "#5a5840",
  Spearman: "#5a6a50",
  Necromancer: "#3a3a48",
  Thundercaller: "#3a5080",
  Runesinger: "#6a5840",
  Lifebinder: "#3f684f",
};

const ARCHETYPE_MARK: Record<Archetype, string> = {
  Vanguard: "Vg",
  ShieldMaiden: "Sm",
  FireMage: "Fm",
  Healer: "Tm",
  Archer: "Ar",
  Spearman: "Sp",
  Necromancer: "Nc",
  Thundercaller: "Th",
  Runesinger: "Rs",
  Lifebinder: "Gk",
};

export type PortraitKind =
  | { role: "party"; archetype: Archetype }
  | { role: "boss"; bossId?: string }
  | { role: "minion"; name?: string; artKey?: string };

/** Folder name under client/public/art/ for this portrait. */
export function artKeyFor(kind: PortraitKind): string {
  if (kind.role === "party") return ARCHETYPE_KEY[kind.archetype];
  if (kind.role === "boss") {
    const id = kind.bossId?.toLowerCase().replace(/\s+/g, "_");
    return id || "boss";
  }
  // Minions: named units map to art folders under public/art/
  if (kind.artKey) return kind.artKey;
  const n = kind.name?.toLowerCase().replace(/\s+/g, "_") ?? "minion";
  // Display name is Frost Archer; art folder / id stays bone_archer
  if (
    (n.includes("frost") || n.includes("bone")) &&
    n.includes("archer")
  ) {
    return "bone_archer";
  }
  if (n.includes("ohm")) return "ohm";
  if (n.includes("moss") && n.includes("mite")) return "moss_mite";
  if (n.includes("cinder") && n.includes("imp")) return "cinder_imp";
  return n;
}

/**
 * Resolve real art URL.
 * Place files under client/public/art/{key}/{pose}.png
 */
export function artUrlFor(key: string, pose: CombatPose): string {
  // Import here keeps artCache as the single stamp source for tokens + portraits
  return artAssetUrl(`/art/${key}/${pose}.png`);
}

function poseTransform(pose: CombatPose): {
  body: string;
  arm: string;
  opacity: number;
  filter: string;
} {
  switch (pose) {
    case "windup":
      // Charge / coil — tense, not yet striking (SVG placeholder only)
      return {
        body: "translate(0, -3) rotate(-4)",
        arm: "rotate(-50 70 55)",
        opacity: 1,
        filter: "brightness(1.08) saturate(1.1)",
      };
    case "attack":
      return {
        body: "translate(4, -2) rotate(6)",
        arm: "rotate(-35 70 55)",
        opacity: 1,
        filter: "brightness(1.15)",
      };
    case "cleanse":
      return {
        body: "translate(0, -2)",
        arm: "rotate(-48 70 55)",
        opacity: 1,
        filter: "brightness(1.12) saturate(0.9)",
      };
    case "hit":
      return {
        body: "translate(-3, 2) rotate(-8)",
        arm: "rotate(20 70 55)",
        opacity: 1,
        filter: "brightness(0.85) saturate(0.7)",
      };
    case "ice":
      // Locked solid — stiff upright, cold filter (SVG fallback)
      return {
        body: "translate(0, 1)",
        arm: "rotate(5 70 55)",
        opacity: 1,
        filter: "brightness(1.12) saturate(0.45) hue-rotate(175deg)",
      };
    case "death":
      return {
        body: "translate(0, 18) rotate(70)",
        arm: "",
        opacity: 0.55,
        filter: "grayscale(1) brightness(0.5)",
      };
    default:
      return {
        body: "",
        arm: "",
        opacity: 1,
        filter: "none",
      };
  }
}

export function PlaceholderPortrait({
  kind,
  pose,
  assetPose,
  className = "",
  /**
   * How the PNG fills the frame.
   * - cover (default for party combat): crop to fill short cards
   * - contain: whole figure visible (codex / tall full-body art like Spearman)
   * Bosses always use contain.
   */
  fit,
}: {
  kind: PortraitKind;
  pose: CombatPose;
  /** Load this pose asset while retaining the live animation pose/filter. */
  assetPose?: CombatPose;
  className?: string;
  fit?: "cover" | "contain";
}) {
  const t = poseTransform(pose);
  const isBoss = kind.role === "boss";
  const isMinion = kind.role === "minion";
  const fill = isBoss
    ? "#6a2030"
    : isMinion
      ? "#4a4a40"
      : ARCHETYPE_TINT[kind.archetype] ?? "#4a5060";
  const mark = isBoss
    ? "B"
    : isMinion
      ? "m"
      : ARCHETYPE_MARK[kind.archetype] ?? "?";

  const artKey = artKeyFor(kind);
  const requestedAssetPose = assetPose ?? pose;
  const [resolvedAssetPose, setResolvedAssetPose] =
    useState<CombatPose>(requestedAssetPose);
  const imgSrc = artUrlFor(artKey, resolvedAssetPose);
  // Prefer real PNG; fall back to SVG if missing or failed to load
  const [useImg, setUseImg] = useState(true);
  useEffect(() => {
    setResolvedAssetPose(requestedAssetPose);
    setUseImg(true);
  }, [artKey, requestedAssetPose]);

  // Boss art is often a tall bust; party combat uses short cards with object-top.
  // Codex / full-body art (e.g. Spearman) should use contain so the figure isn't cropped to black.
  const resolvedFit =
    fit ?? (isBoss ? "contain" : "cover");
  const imgFit =
    resolvedFit === "contain"
      ? "w-full h-full object-contain object-center block"
      : "w-full h-full object-cover object-top block";

  const cleanseDots =
    kind.role === "party"
      ? ARCHETYPE_CLEANSE_DOTS[kind.archetype] ?? []
      : [];

  const cleanseDotEl =
    cleanseDots.length > 0 ? (
      <div
        className="pointer-events-none absolute bottom-1 left-1 flex gap-0.5 z-10"
        title={cleanseDots.map((d) => d.type).join(" / ") + " cleanse"}
      >
        {cleanseDots.map((d) => (
          <span
            key={d.type}
            className="block h-2 w-2 rounded-full border border-black/40 shadow"
            style={{ backgroundColor: d.color }}
            aria-label={`Cleanses ${d.type}`}
          />
        ))}
      </div>
    ) : null;

  if (useImg) {
    return (
      <div
        className={`portrait-frame relative overflow-hidden rounded bg-navy border border-parchment/20 ${className}`}
        data-pose={pose}
        data-art-key={artKey}
      >
        <img
          src={imgSrc}
          alt=""
          className={imgFit}
          style={{ filter: t.filter, opacity: t.opacity }}
          onError={() => {
            // cleanse.png is an optional Maiden-only pose. Until it lands,
            // retain real character art by falling back to attack.png.
            if (resolvedAssetPose === "cleanse") {
              setResolvedAssetPose("attack");
              return;
            }
            setUseImg(false);
          }}
          draggable={false}
        />
        {pose === "hit" && (
          <div className="pointer-events-none absolute inset-0 bg-crimson/25 mix-blend-overlay" />
        )}
        {pose === "ice" && (
          <div className="pointer-events-none absolute inset-0 portrait-ice-veil" />
        )}
        {pose === "windup" && (
          <div className="pointer-events-none absolute inset-0 portrait-windup-veil" />
        )}
        {pose === "attack" && (
          <div className="pointer-events-none absolute inset-0 portrait-attack-veil" />
        )}
        {cleanseDotEl}
      </div>
    );
  }

  return (
    <div
      className={`portrait-frame relative overflow-hidden rounded bg-navy border border-parchment/20 ${className}`}
      data-pose={pose}
      data-art-placeholder="true"
    >
      {cleanseDotEl}
      <svg
        viewBox="0 0 100 120"
        className="w-full h-full block"
        style={{ filter: t.filter, opacity: t.opacity }}
        aria-hidden
      >
        {/* Ground / pedestal */}
        <ellipse cx="50" cy="108" rx="28" ry="6" fill="#0a0e18" opacity="0.7" />
        {/* Ambient glow */}
        <ellipse
          cx="50"
          cy="70"
          rx="32"
          ry="40"
          fill={fill}
          opacity="0.15"
        />
        <g transform={t.body}>
          {/* Cloak / body silhouette */}
          <path
            d={
              isBoss
                ? "M50 28 C28 32 18 55 22 88 L50 100 L78 88 C82 55 72 32 50 28 Z"
                : isMinion
                  ? "M50 40 C38 42 32 58 34 85 L50 92 L66 85 C68 58 62 42 50 40 Z"
                  : "M50 32 C36 36 28 55 30 90 L50 98 L70 90 C72 55 64 36 50 32 Z"
            }
            fill={fill}
            stroke="#1a1520"
            strokeWidth="1.5"
          />
          {/* Head */}
          <circle
            cx="50"
            cy={isBoss ? 26 : isMinion ? 36 : 30}
            r={isBoss ? 14 : isMinion ? 9 : 11}
            fill="#1c1824"
            stroke={fill}
            strokeWidth="2"
          />
          {/* Eyes */}
          <circle
            cx="45"
            cy={isBoss ? 26 : isMinion ? 36 : 30}
            r={isBoss ? 2.2 : 1.6}
            fill={pose === "death" ? "#444" : "#c9a227"}
          />
          <circle
            cx="55"
            cy={isBoss ? 26 : isMinion ? 36 : 30}
            r={isBoss ? 2.2 : 1.6}
            fill={pose === "death" ? "#444" : "#c9a227"}
          />
          {/* Weapon / arm accent */}
          {!isMinion && (
            <g transform={t.arm}>
              <line
                x1="68"
                y1="50"
                x2={isBoss ? 92 : 88}
                y2={pose === "attack" ? 28 : 42}
                stroke="#c9a227"
                strokeWidth={isBoss ? 4 : 2.5}
                strokeLinecap="round"
                opacity={pose === "death" ? 0.3 : 0.9}
              />
            </g>
          )}
          {isMinion && (
            <line
              x1="62"
              y1="48"
              x2="78"
              y2="40"
              stroke="#a09070"
              strokeWidth="2"
              strokeLinecap="round"
            />
          )}
        </g>
        {/* Mark */}
        <text
          x="50"
          y="16"
          textAnchor="middle"
          fill="#b8a488"
          fontSize="9"
          fontFamily="serif"
          opacity="0.85"
        >
          {mark}
        </text>
        {/* Pose tag (dev clarity — remove when real art ships) */}
        <text
          x="50"
          y="116"
          textAnchor="middle"
          fill="#6ec6ff"
          fontSize="7"
          fontFamily="sans-serif"
          opacity="0.7"
        >
          {pose}
        </text>
      </svg>
      {/* FX overlays */}
      {pose === "hit" && (
        <div className="pointer-events-none absolute inset-0 bg-crimson/25 mix-blend-overlay" />
      )}
      {pose === "attack" && (
        <div className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-rune/40" />
      )}
    </div>
  );
}
