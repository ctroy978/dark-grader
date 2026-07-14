import type { DotType, StatusTag } from "./types.js";

export interface StatusChipView {
  key: string;
  icon: string;
  label: string;
  title: string;
  /** Tailwind-ish color tokens used by client */
  colorClass: string;
}

const DOT_META: Record<
  DotType,
  { icon: string; short: string; colorClass: string }
> = {
  Fire: { icon: "🔥", short: "Fire", colorClass: "text-orange-400 border-orange-400/40 bg-orange-950/50" },
  Ice: { icon: "❄️", short: "Ice", colorClass: "text-sky-300 border-sky-400/40 bg-sky-950/50" },
  Poison: { icon: "☠️", short: "Poison", colorClass: "text-lime-400 border-lime-500/40 bg-lime-950/50" },
  Slime: { icon: "🟢", short: "Slime", colorClass: "text-emerald-300 border-emerald-400/40 bg-emerald-950/40" },
};

export function statusToChip(st: StatusTag, index: number): StatusChipView {
  if (st.kind === "Dot") {
    const m = DOT_META[st.type];
    const stacks = st.stacks > 1 ? `×${st.stacks}` : "";
    return {
      key: `dot-${st.type}-${index}`,
      icon: m.icon,
      label: `${m.short}${stacks}`,
      title: `${st.type} DoT · ${st.stacks} stack(s) · ${st.duration} round(s) left`,
      colorClass: m.colorClass,
    };
  }
  if (st.kind === "Mark") {
    return {
      key: `mark-${index}`,
      icon: "🎯",
      label: "Mark",
      title: "Marked — enemies may focus this soldier",
      colorClass: "text-rose-300 border-rose-400/40 bg-rose-950/40",
    };
  }
  if (st.kind === "Stun") {
    return {
      key: `stun-${index}`,
      icon: "💫",
      label: `Stun ${st.duration}`,
      title: `Stunned for ${st.duration} more tick(s)`,
      colorClass: "text-yellow-200 border-yellow-400/40 bg-yellow-950/40",
    };
  }
  // Weaken — also used by Doomcaller for death-curse tier
  return {
    key: `weaken-${index}`,
    icon: "💀",
    label: "Curse",
    title: `Curse / weaken (tier ${st.duration})`,
    colorClass: "text-purple-300 border-purple-400/40 bg-purple-950/40",
  };
}

export interface BossIndicator {
  key: string;
  icon: string;
  label: string;
  title: string;
  colorClass: string;
}

export function bossIndicators(boss: {
  currentHp: number;
  maxHp: number;
  curseDamageTakenMult?: number;
  curseRoundsLeft?: number;
  outgoingDamageMult?: number;
  outgoingBuffRoundsLeft?: number;
  stunRoundsLeft?: number;
  nextAttackBonus?: number;
}): BossIndicator[] {
  const out: BossIndicator[] = [];
  if (boss.maxHp > 0 && boss.currentHp / boss.maxHp <= 0.4) {
    out.push({
      key: "enrage",
      icon: "💢",
      label: "Enraged",
      title: "Below 40% HP — attacks hit harder",
      colorClass: "text-grade-f border-grade-f/50 bg-crimson/40",
    });
  }
  if ((boss.curseRoundsLeft ?? 0) > 0 && (boss.curseDamageTakenMult ?? 1) > 1) {
    const pct = Math.round(((boss.curseDamageTakenMult ?? 1) - 1) * 100);
    out.push({
      key: "curse",
      icon: "☠️",
      label: `Cursed +${pct}%`,
      title: `Takes ${pct}% more damage · ${boss.curseRoundsLeft} round(s)`,
      colorClass: "text-purple-300 border-purple-400/40 bg-purple-950/50",
    });
  }
  if ((boss.outgoingBuffRoundsLeft ?? 0) > 0 && (boss.outgoingDamageMult ?? 1) > 1) {
    out.push({
      key: "buff",
      icon: "⬆️",
      label: "Empowered",
      title: `Hits harder · ${boss.outgoingBuffRoundsLeft} round(s)`,
      colorClass: "text-grade-d border-grade-d/50 bg-orange-950/40",
    });
  }
  if ((boss.stunRoundsLeft ?? 0) > 0) {
    out.push({
      key: "stun",
      icon: "💫",
      label: "Stunned",
      title: "May skip its next attack",
      colorClass: "text-yellow-200 border-yellow-400/40 bg-yellow-950/40",
    });
  }
  if ((boss.nextAttackBonus ?? 0) > 0) {
    out.push({
      key: "next-bonus",
      icon: "⚡",
      label: `+${boss.nextAttackBonus} next`,
      title: `Next attack deals +${boss.nextAttackBonus} bonus damage`,
      colorClass: "text-grade-f border-crimson/50 bg-crimson/30",
    });
  }
  return out;
}
