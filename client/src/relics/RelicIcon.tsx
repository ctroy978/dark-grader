import { useState } from "react";
import {
  RELIC_DEFINITIONS,
  type RelicId,
} from "@dungeon-grades/shared";

const FALLBACK: Record<RelicId, string> = {
  bulwark_sigil: "🛡",
  ember_whetstone: "🔥",
  purity_charm: "✦",
};

export function RelicIcon({
  relicId,
  size = "md",
  className = "",
}: {
  relicId: RelicId;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const definition = RELIC_DEFINITIONS[relicId];
  const sizeClass =
    size === "lg" ? "h-16 w-16 text-3xl" : size === "sm" ? "h-6 w-6 text-xs" : "h-9 w-9 text-lg";
  const title = `${definition.name}: ${definition.shortDescription}`;

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-rune/50 bg-navy shadow-md ${sizeClass} ${className}`}
      title={title}
      aria-label={title}
    >
      {!failed ? (
        <img
          src={definition.assetPath}
          alt=""
          className="h-full w-full object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden>{FALLBACK[relicId]}</span>
      )}
    </span>
  );
}
