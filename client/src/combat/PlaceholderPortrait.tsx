import { useEffect, useState } from "react";
import type { Archetype } from "@dungeon-grades/shared";
import type { CombatPose } from "./poses";

/**
 * Portrait: real PNG if present under /art/{key}/{pose}.png, else SVG stub.
 *
 *   /art/vanguard/standing.png
 *   /art/ash_wraith/windup.png   (boss charge pose)
 *   /art/ash_wraith/attack.png
 *
 * Missing windup.png: browser 404 → SVG placeholder until you drop the file.
 * Prefer a real windup over reusing attack.png so wind-up never looks like impact.
 */

const ARCHETYPE_KEY: Record<Archetype, string> = {
  Vanguard: "vanguard",
  ShieldMaiden: "shieldmaiden",
  FireMage: "firemage",
  Healer: "healer",
  Archer: "archer",
  Doomcaller: "doomcaller",
  Necromancer: "necromancer",
  Thundercaller: "thundercaller",
  Runesinger: "runesinger",
};

const ARCHETYPE_TINT: Record<Archetype, string> = {
  Vanguard: "#5a6a8a",
  ShieldMaiden: "#6a5a7a",
  FireMage: "#8a4030",
  Healer: "#4a6a58",
  Archer: "#5a5840",
  Doomcaller: "#4a3058",
  Necromancer: "#3a3a48",
  Thundercaller: "#3a5080",
  Runesinger: "#6a5840",
};

const ARCHETYPE_MARK: Record<Archetype, string> = {
  Vanguard: "Vg",
  ShieldMaiden: "Sm",
  FireMage: "Fm",
  Healer: "Hl",
  Archer: "Ar",
  Doomcaller: "Dc",
  Necromancer: "Nc",
  Thundercaller: "Th",
  Runesinger: "Rs",
};

export type PortraitKind =
  | { role: "party"; archetype: Archetype }
  | { role: "boss"; bossId?: string }
  | { role: "minion"; name?: string };

/** Folder name under client/public/art/ for this portrait. */
export function artKeyFor(kind: PortraitKind): string {
  if (kind.role === "party") return ARCHETYPE_KEY[kind.archetype];
  if (kind.role === "boss") {
    const id = kind.bossId?.toLowerCase().replace(/\s+/g, "_");
    return id || "boss";
  }
  // Minions: named units map to art folders under public/art/
  const n = kind.name?.toLowerCase().replace(/\s+/g, "_") ?? "minion";
  if (n.includes("bone") && n.includes("archer")) return "bone_archer";
  if (n.includes("moss") && n.includes("mite")) return "moss_mite";
  if (n.includes("cinder") && n.includes("imp")) return "cinder_imp";
  return n;
}

/**
 * Resolve real art URL.
 * Place files under client/public/art/{key}/{pose}.png
 */
export function artUrlFor(key: string, pose: CombatPose): string {
  return `/art/${key}/${pose}.png`;
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
    case "hit":
      return {
        body: "translate(-3, 2) rotate(-8)",
        arm: "rotate(20 70 55)",
        opacity: 1,
        filter: "brightness(0.85) saturate(0.7)",
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
  className = "",
}: {
  kind: PortraitKind;
  pose: CombatPose;
  className?: string;
}) {
  const t = poseTransform(pose);
  const isBoss = kind.role === "boss";
  const isMinion = kind.role === "minion";
  const fill = isBoss
    ? "#6a2030"
    : isMinion
      ? "#4a4a40"
      : ARCHETYPE_TINT[kind.archetype];
  const mark = isBoss
    ? "B"
    : isMinion
      ? "m"
      : ARCHETYPE_MARK[kind.archetype];

  const artKey = artKeyFor(kind);
  const imgSrc = artUrlFor(artKey, pose);
  // Prefer real PNG; fall back to SVG if missing or failed to load
  const [useImg, setUseImg] = useState(true);
  useEffect(() => {
    setUseImg(true);
  }, [imgSrc]);

  // Boss art is often a tall bust; party uses short cards with object-top.
  // object-cover + object-top on a short wide boss frame only showed the scalp.
  const imgFit = isBoss
    ? "w-full h-full object-contain object-center block"
    : "w-full h-full object-cover object-top block";

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
          onError={() => setUseImg(false)}
          draggable={false}
        />
        {pose === "hit" && (
          <div className="pointer-events-none absolute inset-0 bg-crimson/25 mix-blend-overlay" />
        )}
        {pose === "windup" && (
          <div className="pointer-events-none absolute inset-0 portrait-windup-veil" />
        )}
        {pose === "attack" && (
          <div className="pointer-events-none absolute inset-0 portrait-attack-veil" />
        )}
      </div>
    );
  }

  return (
    <div
      className={`portrait-frame relative overflow-hidden rounded bg-navy border border-parchment/20 ${className}`}
      data-pose={pose}
      data-art-placeholder="true"
    >
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
