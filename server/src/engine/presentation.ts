import {
  actionBubbleText,
  claimBubbleText,
  hurtBubbleText,
  type BoardReveal,
  type Grade,
  type PresentationCue,
  type TeamState,
} from "@dungeon-grades/shared";

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
    })),
    boss: team.boss
      ? { currentHp: team.boss.currentHp, maxHp: team.boss.maxHp }
      : null,
    minions: team.minions.map((m) => ({
      id: m.id,
      name: m.name,
      currentHp: m.currentHp,
      maxHp: m.maxHp,
      damage: m.damage,
    })),
    partyShield: {
      remaining: team.partyShield.remaining,
      active: team.partyShield.active,
    },
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

/** ~30% of token-holder lines get real VO when VO toggle is on. */
export function maybePlayVo(random: () => number, chance = 0.32): boolean {
  return random() < chance;
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
  },
): void {
  // One of the claimers may also "speak" during the attack
  const playVo = maybePlayVo(random, 0.28);
  const hitFocus = opts?.hitFocusIds?.filter(Boolean) ?? [];
  const slain = opts?.slainNames?.filter(Boolean) ?? [];
  // Focus attacker + whatever they hit (minion and/or boss) so kills are readable
  const focusIds = [
    soldierId,
    ...hitFocus.filter((id) => id !== soldierId),
  ];
  if (hitFocus.length === 0 && team.boss) {
    focusIds.push("boss");
  }

  let text = actionBubbleText(archetype, grade);
  if (slain.length) {
    text = `${text} ${slain[0]} down!`;
  }

  pushCue(team, {
    kind: "action",
    focusIds,
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
      ...(slain.length ? ["minion-kill"] : []),
    ],
    sfxId: grade === "F" ? "explosion_f" : slain.length ? "hit_heavy" : "hit_light",
    voId: voActionId(grade),
    playVo,
    durationMs: slain.length ? 1300 : 1100,
  });
}

/** One hurt bubble from a random living party member who took damage. */
export function cueHurtMaybe(
  team: TeamState,
  victimIds: string[],
  random: () => number,
  chance = 0.55,
): void {
  if (!victimIds.length || random() >= chance) return;
  const id = victimIds[Math.floor(random() * victimIds.length)]!;
  const s = team.roster.find((x) => x.id === id);
  if (!s) return;
  const playVo = maybePlayVo(random, 0.22);
  pushCue(team, {
    kind: "hurt",
    focusIds: [id],
    bubble: {
      speakerId: id,
      speakerName: s.name,
      side: "party",
      text: hurtBubbleText(random),
    },
    fx: ["hurt-flash"],
    sfxId: "hit_light",
    voId: voHurtId(random),
    playVo,
    durationMs: 850,
  });
}
