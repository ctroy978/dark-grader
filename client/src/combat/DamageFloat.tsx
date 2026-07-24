/**
 * Floating combat numbers on a unit (damage / heal).
 * Parent must be `position: relative`.
 */
export type HpFloat = {
  key: string;
  /** Negative = damage, positive = heal */
  delta: number;
};

export function DamageFloatStack({
  floats,
  size = "md",
}: {
  floats?: HpFloat[];
  size?: "sm" | "md" | "lg";
}) {
  if (!floats?.length) return null;
  const sizeClass =
    size === "lg"
      ? "text-2xl md:text-3xl"
      : size === "sm"
        ? "text-base md:text-lg"
        : "text-lg md:text-xl";

  return (
    <div className="damage-float-layer pointer-events-none" aria-hidden>
      {floats.map((f, i) => {
        const dmg = f.delta < 0;
        const abs = Math.abs(f.delta);
        const label = dmg ? `−${abs}` : `+${abs}`;
        return (
          <span
            key={f.key}
            className={`damage-float ${sizeClass} ${
              dmg ? "damage-float--damage" : "damage-float--heal"
            }`}
            style={{
              // Slight horizontal stagger when multiple hit the same body
              ["--float-x" as string]: `${(i - (floats.length - 1) / 2) * 0.55}rem`,
            }}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}
