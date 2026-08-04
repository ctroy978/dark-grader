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
    const intensity = st.escalationStep ?? 0;
    const ramp = intensity > 0 ? ` ⬆${intensity}` : "";
    const rampTitle =
      intensity > 0
        ? ` · boss ramp intensity ${intensity} (damage ×${intensity} this tick; grows if left up)`
        : "";
    const untilNote =
      st.type === "Slime"
        ? "until cleansed (Fire Mage A/B)"
        : `${st.duration} round(s) left`;
    return {
      key: `dot-${st.type}-${index}`,
      icon: m.icon,
      label: `${m.short}${stacks}${ramp}`,
      title: `${st.type} DoT · ${st.stacks} stack(s) · ${untilNote}${rampTitle}`,
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
    const rounds = st.duration;
    return {
      key: `stun-${index}`,
      icon: "⚡",
      label: rounds > 1 ? `STUNNED ${rounds}r` : "STUNNED",
      title:
        rounds > 1
          ? `Stunned for ${rounds} party rounds — token claims waste the attack until it wears off (counts down each drop even if they sit out).`
          : "Stunned this party round — a token claim wastes the attack. Wears off after this drop even if they sit out.",
      colorClass:
        "text-yellow-100 border-yellow-300/70 bg-yellow-950/60 font-semibold",
    };
  }
  if (st.kind === "Dazed") {
    return {
      key: `dazed-${index}`,
      icon: "😵",
      label: `Dazed ${st.duration}`,
      title: `Dazed — heart just shocked back; skips their next claim (one wasted token), then fights again`,
      colorClass: "text-violet-200 border-violet-400/40 bg-violet-950/40",
    };
  }
  if (st.kind === "Frozen") {
    if (st.soft) {
      return {
        key: `frozen-soft-${index}`,
        icon: "🧊",
        label: "Frozen 1t",
        title:
          "Ice lock — cannot attack this turn (heals OK). Clears after the wasted action or Fire Mage thaw (A front / B back).",
        colorClass: "text-cyan-200 border-cyan-400/50 bg-cyan-950/50",
      };
    }
    const until =
      st.stage >= 2
        ? "next DoT phase: SHATTER"
        : `${2 - st.stage} spread(s) left before shatter window`;
    return {
      key: `frozen-${index}`,
      icon: "🧊",
      label: st.stage >= 2 ? "Frozen ⚠" : `Frozen ${st.stage}/2`,
      title: `Frozen — cannot attack or be healed · ${until} · only Fire Mage burns this off (A front / B back)`,
      colorClass: "text-cyan-200 border-cyan-400/50 bg-cyan-950/50",
    };
  }
  if (st.kind === "Charge") {
    return {
      key: `charge-${index}`,
      icon: "⚡",
      label: `Charge +${st.amount}`,
      title: `Charged — next attack deals +${st.amount} damage`,
      colorClass: "text-sky-200 border-sky-400/40 bg-sky-950/40",
    };
  }
  if (st.kind === "Parry") {
    const pct = Math.round(st.reduction * 100);
    return {
      key: `parry-${index}`,
      icon: "🗡️",
      label: `Parry ${pct}%`,
      title: `Parry — take ${pct}% less damage from the boss this round (expires after boss phase)`,
      colorClass: "text-amber-200 border-amber-400/40 bg-amber-950/40",
    };
  }
  if (st.kind === "LastStand") {
    return {
      key: `last-stand-${index}`,
      icon: "🛡️",
      label: "Last Stand",
      title:
        "Last Stand — the next hit that would kill this soldier leaves them at 1 HP once (Vanguard/Spearman A, or Thunder A rez). Expires after the boss phase if unused.",
      colorClass: "text-stone-100 border-stone-300/50 bg-stone-900/50",
    };
  }
  if (st.kind === "LifePower") {
    return {
      key: `life-power-${index}`,
      icon: "💜",
      label: `Life +${st.bonus}`,
      title: `Life Power — next Healer/Runesinger action still heals/hymns normally. Fire/Poison seats also wash (no purple bonus); clean seats get +${st.bonus} purple. Maiden remains primary strip. No stack; until used (Necromancer).`,
      colorClass: "text-fuchsia-200 border-fuchsia-400/50 bg-fuchsia-950/40",
    };
  }
  if (st.kind === "Hot") {
    return {
      key: `hot-${index}`,
      icon: "✨",
      label: `Hymn +${st.healPerTick}×${st.duration}`,
      title: `Hymn HoT — +${st.healPerTick} HP each DoT phase · ${st.duration} tick(s) left (Runesinger; max 2 streams)`,
      colorClass: "text-amber-100 border-amber-200/50 bg-amber-950/40",
    };
  }
  // Weaken — legacy / internal duration tag
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
  statuses?: StatusTag[];
  curseDamageTakenMult?: number;
  curseRoundsLeft?: number;
  outgoingDamageMult?: number;
  outgoingBuffRoundsLeft?: number;
  stunRoundsLeft?: number;
  nextAttackBonus?: number;
  enrageHpPct?: number;
  enrageDamageMult?: number;
}): BossIndicator[] {
  const out: BossIndicator[] = [];
  for (const st of boss.statuses ?? []) {
    if (st.kind === "Dot") {
      const m = DOT_META[st.type];
      const stacks = st.stacks > 1 ? `×${st.stacks}` : "";
      out.push({
        key: `boss-dot-${st.type}`,
        icon: m.icon,
        label: `${m.short}${stacks}`,
        title: `Boss ${st.type} · ${st.stacks} stack(s) · ${st.duration} round(s)`,
        colorClass: m.colorClass,
      });
    }
  }
  {
    const enragePct = boss.enrageHpPct ?? 0.4;
    const enrageMult = boss.enrageDamageMult ?? 1.3;
    if (
      enrageMult > 1.001 &&
      boss.maxHp > 0 &&
      boss.currentHp / boss.maxHp <= enragePct
    ) {
      const pctLabel = Math.round(enragePct * 100);
      out.push({
        key: "enrage",
        icon: "💢",
        label: "Enraged",
        title: `Below ${pctLabel}% HP — attacks hit harder`,
        colorClass: "text-grade-f border-grade-f/50 bg-crimson/40",
      });
    }
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
      icon: "⚡",
      label: "STUNNED",
      title: `Stunned — skips boss + minion attacks · ${boss.stunRoundsLeft} round(s)`,
      colorClass:
        "text-sky-100 border-sky-300/70 bg-sky-950/60 font-semibold",
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
