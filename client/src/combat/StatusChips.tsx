import {
  bossIndicators,
  statusToChip,
  type StatusTag,
} from "@dungeon-grades/shared";

export function StatusChips({
  statuses,
  compact,
}: {
  statuses?: StatusTag[];
  compact?: boolean;
}) {
  if (!statuses?.length) return null;
  return (
    <div className="flex flex-wrap justify-center gap-0.5 mt-1">
      {statuses.map((st, idx) => {
        const chip = statusToChip(st, idx);
        return (
          <span
            key={chip.key}
            title={chip.title}
            className={`inline-flex items-center gap-0.5 rounded border px-1 ${
              compact ? "text-[9px]" : "text-[10px]"
            } ${chip.colorClass}`}
          >
            <span aria-hidden>{chip.icon}</span>
            <span>{chip.label}</span>
          </span>
        );
      })}
    </div>
  );
}

export function BossStatusRow({
  boss,
}: {
  boss: {
    currentHp: number;
    maxHp: number;
    curseDamageTakenMult?: number;
    curseRoundsLeft?: number;
    outgoingDamageMult?: number;
    outgoingBuffRoundsLeft?: number;
    stunRoundsLeft?: number;
    nextAttackBonus?: number;
  };
}) {
  const chips = bossIndicators(boss);
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap justify-center gap-1 mt-2">
      {chips.map((c) => (
        <span
          key={c.key}
          title={c.title}
          className={`inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded border font-semibold ${c.colorClass}`}
        >
          <span aria-hidden>{c.icon}</span>
          {c.label}
        </span>
      ))}
    </div>
  );
}
