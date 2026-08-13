import {
  actionBubbleText,
  attackSfxCandidates,
  claimBubbleText,
  hurtBubbleText,
  partyHurtSfxCandidates,
  type BoardReveal,
  type Grade,
  type PresentationCue,
  type TeamState,
} from "@dungeon-grades/shared";
import { resolveSfxId } from "../audio/resolveSfx.js";

/** Kinds that change combatant HP/status — attach a board snapshot for the client. */
const REVEAL_KINDS = new Set<PresentationCue["kind"]>([
  "action",
  "boss",
  "minion",
  "hurt",
  "dot",
  "death",
  "system",
]);

export function ensurePlayback(team: TeamState): PresentationCue[] {
  if (!Array.isArray(team.playback)) team.playback = [];
  if (!Array.isArray(team.lastClaims)) team.lastClaims = [];
  return team.playback;
}

/** Snapshot board after a resolve step (for progressive client presentation). */
export function captureBoardReveal(team: TeamState): BoardReveal {
  return {
    soldiers: team.roster.map((s) => ({
      id: s.id,
      currentHp: s.currentHp,
      maxHp: s.maxHp,
      alive: s.alive,
      block: s.block,
      statuses: s.statuses.map((st) => ({ ...st })),
      relic: s.relic ? { ...s.relic } : null,
    })),
    boss: team.boss
      ? {
          currentHp: team.boss.currentHp,
          maxHp: team.boss.maxHp,
          statuses: (team.boss.statuses ?? []).map((st) => ({ ...st })),
          stunRoundsLeft: team.boss.stunRoundsLeft ?? 0,
          curseDamageTakenMult: team.boss.curseDamageTakenMult,
          curseRoundsLeft: team.boss.curseRoundsLeft,
          damageFloor: team.boss.damageFloor,
          damageFloorLabel: team.boss.damageFloorLabel,
        }
      : null,
    minions: team.minions.map((m) => ({
      id: m.id,
      name: m.name,
      currentHp: m.currentHp,
      maxHp: m.maxHp,
      damage: m.damage,
      statuses: (m.statuses ?? []).map((st) => ({ ...st })),
      kind: m.kind,
      memory: m.memory ? { ...m.memory } : undefined,
    })),
    partyShield: {
      remaining: team.partyShield.remaining,
      active: team.partyShield.active,
      coveredIds: team.partyShield.coveredIds ?? [],
    },
    magnetStunRoundsLeft: team.magnetStunRoundsLeft ?? 0,
    boneColossus: team.boneColossus ? { ...team.boneColossus } : null,
  };
}

export function pushCue(
  team: TeamState,
  cue: Omit<PresentationCue, "id">,
): void {
  const list = ensurePlayback(team);
  const withId: PresentationCue = {
    ...cue,
    id: `r${team.round}-c${list.length}`,
  };
  if (REVEAL_KINDS.has(withId.kind) && !withId.reveal) {
    withId.reveal = captureBoardReveal(team);
  }
  list.push(withId);
}

/**
 * Character TTS VO is retired.
 * Always false so cues keep optional voId fields for older clients without
 * scheduling speech. SFX (act_*, hit_*, etc.) are unaffected.
 */
export function maybePlayVo(_random: () => number, _chance = 0.32): boolean {
  return false;
}

/** Map grade to catalog VO id (pre-generated short lines). */
export function voClaimId(grade: Grade): string {
  return `vo_claim_${grade.toLowerCase()}`;
}

export function voActionId(grade: Grade): string {
  return `vo_act_${grade.toLowerCase()}`;
}

export function voHurtId(random: () => number): string {
  const n = 1 + Math.floor(random() * 3);
  return `vo_hurt_${n}`;
}

export function cueClaim(
  team: TeamState,
  soldierId: string,
  soldierName: string,
  grade: Grade,
  random: () => number,
): void {
  const playVo = maybePlayVo(random, 0.4);
  pushCue(team, {
    kind: "claim",
    focusIds: [soldierId],
    grade,
    bubble: {
      speakerId: soldierId,
      speakerName: soldierName,
      side: "party",
      text: claimBubbleText(grade),
    },
    fx: ["claim-pop", `grade-${grade}`],
    sfxId: "token_claim",
    voId: voClaimId(grade),
    playVo,
    durationMs: 900,
  });
}

export function cueAction(
  team: TeamState,
  soldierId: string,
  soldierName: string,
  archetype: string,
  grade: Grade,
  random: () => number,
  fxExtra: string[] = [],
  opts?: {
    /** Enemy unit ids damaged this action (minion ids and/or "boss") */
    hitFocusIds?: string[];
    /** Minion names slain this action — shown in the bubble */
    slainNames?: string[];
    /** Party seats that actually had one or more DoTs removed this action. */
    cleanseTargetIds?: string[];
  },
): void {
  // One of the claimers may also "speak" during the attack
  const playVo = maybePlayVo(random, 0.28);
  const hitFocus = opts?.hitFocusIds?.filter(Boolean) ?? [];
  const slain = opts?.slainNames?.filter(Boolean) ?? [];
  const cleanseTargets = [
    ...new Set(opts?.cleanseTargetIds?.filter(Boolean) ?? []),
  ];
  // Focus attacker + whatever they affected (enemies, allies, boss heals).
  // Do NOT default empty focus to boss — party-only F effects must land on the party.
  const focusIds = [
    soldierId,
    ...hitFocus.filter((id) => id !== soldierId),
    ...cleanseTargets.filter(
      (id) => id !== soldierId && !hitFocus.includes(id),
    ),
  ];

  let text = actionBubbleText(archetype, grade);
  if (slain.length) {
    text = `${text} ${slain[0]} down!`;
  }

  // Unique attack cast per archetype (including F backfires — full kit identity).
  const sfxId = resolveSfxId(attackSfxCandidates(archetype, grade));

  // Cast telegraphs (charge FX then impact) for every grade, including F.
  // No board reveal on telegraph so floats stay on the action beat.
  type CastFx = {
    chargeFx: string;
    blastFx: string;
    bubble: string;
    durationMs: number;
  };
  const castFxByArch: Partial<Record<string, CastFx>> = {
    ShieldMaiden: {
      chargeFx: "maiden-charge",
      blastFx: "maiden-blast",
      bubble:
        grade === "F"
          ? "Short…"
          : grade === "A"
            ? "Gather…"
            : "Charge…",
      durationMs: 720,
    },
    FireMage: {
      chargeFx: "fire-charge",
      blastFx: "fire-blast",
      bubble:
        grade === "F"
          ? "Oh no…"
          : grade === "A"
            ? "Inferno…"
            : grade === "B"
              ? "Ignite…"
              : "Burn…",
      durationMs: 900,
    },
    Necromancer: {
      chargeFx: "necro-charge",
      blastFx: "necro-blast",
      bubble:
        grade === "F"
          ? "Wrong life…"
          : grade === "A"
            ? "Rise…"
            : grade === "B"
              ? "Swarm…"
              : "Haunt…",
      durationMs: 880,
    },
    Thundercaller: {
      chargeFx: "thunder-charge",
      blastFx: "thunder-blast",
      bubble:
        grade === "F"
          ? "Overload…"
          : grade === "A"
            ? "Bolt! (or clear!)"
            : grade === "B"
              ? "Spark…"
              : "Arc…",
      durationMs: 750,
    },
    Healer: {
      chargeFx: "heal-charge",
      blastFx: "heal-blast",
      bubble:
        grade === "F"
          ? "Wrong target…"
          : grade === "A"
            ? "Bless…"
            : grade === "B"
              ? "Mend…"
              : "Heal…",
      durationMs: 850,
    },
    Runesinger: {
      chargeFx: "rune-charge",
      blastFx: "rune-blast",
      bubble:
        grade === "F"
          ? "Slip…"
          : grade === "A"
            ? "Runes rise…"
            : grade === "B"
              ? "Tune…"
              : grade === "C"
                ? "Worst…"
                : "Strike…",
      durationMs: 850,
    },
    Lifebinder: {
      chargeFx: "lifebinder-charge",
      blastFx: "lifebinder-blast",
      bubble:
        grade === "F"
          ? "Thorns…"
          : grade === "A"
            ? "Restore…"
            : grade === "B"
              ? "Guard the front…"
              : grade === "C"
                ? "Mend the back…"
                : "Renew…",
      durationMs: 850,
    },
    // Vanguard: seismic bastion plates + ground-slam shockwave (not a soft beam)
    Vanguard: {
      chargeFx: "vanguard-charge",
      blastFx: "vanguard-blast",
      bubble:
        grade === "F"
          ? "Weak…"
          : grade === "A"
            ? "My shield!"
            : grade === "B"
              ? "Brace!"
              : "Stand!",
      durationMs: 700,
    },
    // Spearman: kinetic tip-pressure charge then diamond detonation (client SpearPierceFx)
    Spearman: {
      chargeFx: "spear-charge",
      blastFx: "spear-blast",
      bubble:
        grade === "F"
          ? "Slip…"
          : grade === "A"
            ? "Penetrate!"
            : grade === "B"
              ? "Pierce through!"
              : "Stab!",
      durationMs: 700,
    },
    // Archer: draw focus at center, then horizontal blast toward the boss (right)
    Archer: {
      chargeFx: "archer-charge",
      blastFx: "archer-blast",
      bubble:
        grade === "F"
          ? "Misfire…"
          : grade === "A"
            ? "Loose!"
            : grade === "B"
              ? "Draw…"
              : "Aim…",
      durationMs: 700,
    },
  };
  const castFx = castFxByArch[archetype];
  if (castFx) {
    pushCue(team, {
      kind: "telegraph",
      focusIds: [soldierId],
      grade,
      bubble: {
        speakerId: soldierId,
        speakerName: soldierName,
        side: "party",
        text: castFx.bubble,
      },
      fx: [castFx.chargeFx],
      durationMs: castFx.durationMs,
    });
  }

  pushCue(team, {
    kind: "action",
    focusIds,
    ...(cleanseTargets.length ? { cleanseTargetIds: cleanseTargets } : {}),
    grade,
    bubble: {
      speakerId: soldierId,
      speakerName: soldierName,
      side: "party",
      text,
    },
    fx: [
      "attack-flash",
      ...fxExtra,
      ...(castFx ? [castFx.blastFx] : []),
      ...(slain.length ? ["minion-kill"] : []),
    ],
    sfxId,
    voId: voActionId(grade),
    playVo,
    durationMs: castFx
      ? slain.length
        ? 1450
        : 1300
      : slain.length
        ? 1300
        : 1100,
  });
}

/**
 * Pick one living victim for a party-hurt reaction (SFX only by default).
 * Used to *layer* a groan under boss/minion impact — not a second timed beat.
 */
export function pickPartyHurt(
  team: TeamState,
  victimIds: string[],
  random: () => number,
): { victimId: string; sfxId: string } | null {
  // Include just-killed victims — they still groan on the impact that dropped them
  const candidates = [
    ...new Set(
      victimIds.filter((id) => team.roster.some((x) => x.id === id)),
    ),
  ];
  if (!candidates.length) return null;
  const id = candidates[Math.floor(random() * candidates.length)]!;
  const s = team.roster.find((x) => x.id === id);
  if (!s) return null;
  const sfxId = resolveSfxId(partyHurtSfxCandidates(s.archetype));
  if (!sfxId) return null;
  return { victimId: id, sfxId };
}

/**
 * Legacy standalone hurt cue — prefer layering via secondarySfxId on impact.
 * Kept for rare cases where damage has no host impact beat.
 */
export function cueHurtMaybe(
  team: TeamState,
  victimIds: string[],
  random: () => number,
  chance = 0.55,
): void {
  if (!victimIds.length || random() >= chance) return;
  const pick = pickPartyHurt(team, victimIds, random);
  if (!pick) return;
  const s = team.roster.find((x) => x.id === pick.victimId);
  if (!s) return;
  const playVo = maybePlayVo(random, 0.22);
  pushCue(team, {
    kind: "hurt",
    focusIds: [pick.victimId],
    bubble: {
      speakerId: pick.victimId,
      speakerName: s.name,
      side: "party",
      text: hurtBubbleText(random),
    },
    fx: ["hurt-flash"],
    sfxId: pick.sfxId,
    voId: voHurtId(random),
    playVo,
    // Short — should almost never run if impact layering works
    durationMs: 500,
  });
}
