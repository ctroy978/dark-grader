import {
  actionBubbleText,
  claimBubbleText,
  hurtBubbleText,
  type Grade,
  type PresentationCue,
  type TeamState,
} from "@dungeon-grades/shared";

export function ensurePlayback(team: TeamState): PresentationCue[] {
  if (!Array.isArray(team.playback)) team.playback = [];
  if (!Array.isArray(team.lastClaims)) team.lastClaims = [];
  return team.playback;
}

export function pushCue(
  team: TeamState,
  cue: Omit<PresentationCue, "id">,
): void {
  const list = ensurePlayback(team);
  list.push({
    ...cue,
    id: `r${team.round}-c${list.length}`,
  });
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
): void {
  // One of the claimers may also "speak" during the attack
  const playVo = maybePlayVo(random, 0.28);
  pushCue(team, {
    kind: "action",
    focusIds: [soldierId, "boss"],
    grade,
    bubble: {
      speakerId: soldierId,
      speakerName: soldierName,
      side: "party",
      text: actionBubbleText(archetype, grade),
    },
    fx: ["attack-flash", ...fxExtra],
    sfxId: grade === "F" ? "explosion_f" : "hit_light",
    voId: voActionId(grade),
    playVo,
    durationMs: 1100,
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
