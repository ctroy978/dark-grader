import {
  BOSS_VOICE_DURATION_MS,
  bossImpactDurationMs,
  bossForcesWindupTheme,
  bossTelegraphDurationMs,
  bossThreatTier,
  bossWindupTheme,
  createRng,
  defaultTelegraphLines,
  DEFAULT_CAMPAIGN_LENGTH,
  INTER_ROOM_VANGUARD_HEAL_PCT,
  MAX_LOG_ENTRIES,
  PARTY_HURT_LAYER_DELAY_MS,
  PARTY_SIZE,
  randomInt,
  type Grade,
  type Position,
  type Soldier,
  type TeamState,
} from "@dungeon-grades/shared";
import { instantiateBoss } from "../seed/bosses.js";
import { getBossTemplate } from "../seed/bossLoader.js";
import { createCampaignRoster } from "../seed/roster.js";
import {
  openingMinionsForBoss,
  pickBossAttackId,
  pickBossVoiceSfx,
  resolveBossPhase,
} from "./bosses.js";
import { resolveClaims, setMagnet } from "./claims.js";
import {
  activeParty,
  healSoldier,
  livingParty,
  purgeDeadMinions,
} from "./damage.js";
import { tickDots } from "./dots.js";
import {
  cueAction,
  cueClaim,
  pickPartyHurt,
  pushCue,
} from "./presentation.js";
import {
  beginPartyActionPhase,
  endPartyActionPhase,
  markClaimerResolved,
  resolveSpecialistAction,
} from "./specialists.js";
import {
  consumePendingTokens,
  createTokenPool,
  preparePendingForRound,
} from "./tokens.js";
import { resolveSfxId } from "../audio/resolveSfx.js";

function pushLog(team: TeamState, text: string, tags?: string[]): void {
  team.log.push({ round: team.round, text, tags });
  if (team.log.length > MAX_LOG_ENTRIES) {
    team.log = team.log.slice(-MAX_LOG_ENTRIES);
  }
}

export function createTeam(
  teamId: string,
  inviteCode: string,
  name: string,
  rngSeed = Date.now() % 1_000_000,
  classroomId = "",
): TeamState {
  return {
    teamId,
    inviteCode,
    name,
    classroomId,
    roster: createCampaignRoster(),
    activePartyIds: [],
    magnetPosition: 1,
    partyShield: { remaining: 0, active: false },
    tokens: { remaining: [], discard: [] },
    pendingTokens: [],
    pendingBossAttackId: null,
    magnetStunRoundsLeft: 0,
    bossLastAttackWasStunKit: false,
    noSummonBeforeRound: 0,
    boss: null,
    minions: [],
    phase: "lobby",
    round: 0,
    log: [],
    playback: [],
    lastClaims: [],
    roomIndex: 0,
    partyDamageBonus: 0,
    rngSeed,
    lastClearedBossName: null,
  };
}

/**
 * How many soldiers must be in the line right now.
 * Full roster → always 6. Attrition → field every living soldier (1–5).
 * Zero living → 0 (cannot enter a room).
 */
export function requiredPartySize(team: TeamState): number {
  const living = livingRosterCount(team);
  if (living <= 0) return 0;
  return Math.min(PARTY_SIZE, living);
}

export function selectParty(team: TeamState, soldierIds: string[]): void {
  if (team.phase !== "lobby" && team.phase !== "between_rooms") {
    throw new Error("Can only select party in lobby or between rooms");
  }

  const need = requiredPartySize(team);
  if (need <= 0) {
    throw new Error(
      "No living soldiers left. Ask the teacher to reset the team.",
    );
  }
  if (soldierIds.length !== need) {
    throw new Error(
      need < PARTY_SIZE
        ? `Only ${need} living — field all of them (got ${soldierIds.length})`
        : `Party must be exactly ${PARTY_SIZE} soldiers`,
    );
  }
  const unique = new Set(soldierIds);
  if (unique.size !== need) throw new Error("Duplicate soldiers in party");

  for (const id of soldierIds) {
    const s = team.roster.find((x) => x.id === id);
    if (!s || !s.alive) throw new Error(`Invalid soldier: ${id}`);
  }

  // Understrength: every living soldier must be in the line (no bench while short)
  if (need < PARTY_SIZE) {
    const livingIds = new Set(
      team.roster.filter((s) => s.alive).map((s) => s.id),
    );
    for (const id of livingIds) {
      if (!unique.has(id)) {
        throw new Error(
          "Understrength party must include every living soldier",
        );
      }
    }
  }

  for (const s of team.roster) s.position = null;

  team.activePartyIds = [...soldierIds];
  soldierIds.forEach((id, i) => {
    const s = team.roster.find((x) => x.id === id)!;
    s.position = (i + 1) as Position;
  });
}

export function startFight(
  team: TeamState,
  bossTemplateId: string,
  gradePool: Grade[],
): void {
  if (team.phase === "campaign_complete") {
    throw new Error("Campaign already complete — teacher must reset the team");
  }
  const need = requiredPartySize(team);
  if (need <= 0) {
    throw new Error(
      "No living soldiers left. Ask the teacher to reset the team.",
    );
  }
  if (team.activePartyIds.length !== need) {
    throw new Error(
      need < PARTY_SIZE
        ? `Understrength roster (${need} living) — reform the line with all living soldiers before starting.`
        : "This team has not formed a party yet. Students must pick 6 soldiers and order them in the lobby before the fight can start.",
    );
  }
  // Ensure every active id is alive and positioned
  for (let i = 0; i < team.activePartyIds.length; i++) {
    const id = team.activePartyIds[i];
    const s = team.roster.find((x) => x.id === id);
    if (!s?.alive) {
      throw new Error(`Party member missing or dead: ${id}. Reform the party in the lobby.`);
    }
    s.position = (i + 1) as Position;
  }
  if (!gradePool.length) throw new Error("Token pool is empty — teacher must enter grades");

  // Clear transient death flags for the new fight
  for (const s of team.roster) {
    delete (s as Soldier & { deathLogged?: boolean }).deathLogged;
  }

  const random = createRng(team.rngSeed + team.roomIndex * 997);
  team.boss = instantiateBoss(bossTemplateId);
  // Soft tutorial mites (and any future open_count summons) enter with the boss
  team.minions = openingMinionsForBoss(bossTemplateId);
  team.tokens = createTokenPool(gradePool, random);
  team.pendingTokens = [];
  team.pendingBossAttackId = null;
  team.magnetStunRoundsLeft = 0;
  team.bossLastAttackWasStunKit = false;
  team.noSummonBeforeRound = 0;
  team.round = 1;
  team.phase = "awaiting_magnet";
  team.partyDamageBonus = 0;
  team.magnetPosition = 1;

  for (const s of activeParty(team)) {
    s.block = 0;
    s.statuses = [];
  }

  // Party shield only if a Shield Maiden is in the active line (spec)
  const hasShieldMaiden = activeParty(team).some(
    (s) => s.alive && s.archetype === "ShieldMaiden",
  );
  if (hasShieldMaiden) {
    const shieldRoll = randomInt(random, 1, 6);
    team.partyShield = { remaining: shieldRoll, active: true };
  } else {
    team.partyShield = { remaining: 0, active: false };
  }

  // Telegraph the first drop so students plan the magnet
  const prep = preparePendingForRound(team);

  team.log = [];
  const roomNum = team.roomIndex + 1;
  const shieldMsg = hasShieldMaiden
    ? `Party shield: ${team.partyShield.remaining} (Shield Maiden).`
    : `No party shield (bring a Shield Maiden for opening protection).`;
  pushLog(
    team,
    `Room ${roomNum}: fight starts vs ${team.boss.name}! ${shieldMsg} Tokens: ${gradePool.length}.`,
    ["system", "campaign"],
  );
  pushLog(
    team,
    `Round ${team.round}: ${prep.living} living → ${prep.tokens.length} token(s). Incoming: ${prep.tokens.join(", ") || "(none)"} — set magnet, then Drop Tokens.`,
    ["system", "tokens"],
  );
}

/** True if a living party member occupies this line position. */
export function isMagnetPositionValid(
  team: TeamState,
  position: Position,
): boolean {
  return livingParty(team).some((s) => s.position === position);
}

/** Move magnet to the first living soldier if current slot is empty/dead. */
export function ensureMagnetOnLiving(team: TeamState): void {
  if (isMagnetPositionValid(team, team.magnetPosition)) return;
  const living = livingParty(team);
  if (!living.length) return;
  const sorted = [...living].sort(
    (a, b) => (a.position ?? 99) - (b.position ?? 99),
  );
  const pos = sorted[0].position;
  if (pos) setMagnet(team, pos);
}

export function placeMagnet(team: TeamState, position: Position): void {
  if (team.phase !== "awaiting_magnet") {
    throw new Error("Magnet can only be moved while awaiting magnet");
  }
  if ((team.magnetStunRoundsLeft ?? 0) > 0) {
    throw new Error("Token Magnet is shocked — locked this round");
  }
  if (position < 1 || position > 6) throw new Error("Magnet position must be 1–6");
  if (!isMagnetPositionValid(team, position)) {
    throw new Error("Cannot place the Token Magnet under a fallen soldier");
  }
  setMagnet(team, position);
}

/**
 * Drop tokens + party actions + DoTs.
 * Stops before the boss so the client can show a telegraph beat.
 * Ends in: victory | defeat | boss_telegraph
 */
export function commitRound(team: TeamState): TeamState {
  if (team.phase !== "awaiting_magnet") {
    throw new Error("Cannot commit: not awaiting magnet");
  }
  if (!team.boss) throw new Error("No active fight");

  // Safety: never resolve with magnet parked on a corpse
  ensureMagnetOnLiving(team);
  if (!isMagnetPositionValid(team, team.magnetPosition)) {
    throw new Error("No living soldiers to claim tokens");
  }

  team.phase = "resolving";
  team.playback = [];
  // Magnet lock consumed for this drop phase
  if ((team.magnetStunRoundsLeft ?? 0) > 0) {
    team.magnetStunRoundsLeft = Math.max(0, (team.magnetStunRoundsLeft ?? 0) - 1);
  }
  const random = createRng(team.rngSeed + team.round * 10007 + team.magnetPosition * 13);

  team.partyDamageBonus = 0;

  // Note: do NOT clear personal block here. Vanguard block is meant to absorb
  // boss/minion (and same-round DoT) damage and only expire after that boss
  // phase — clearing at Drop Tokens made chips vanish before any attack reveal.

  // Drop exactly the telegraphed pending tokens (already drawn when phase began)
  if (!team.pendingTokens?.length) {
    preparePendingForRound(team);
  }
  const drawn = consumePendingTokens(team);
  pushLog(
    team,
    `Tokens drop: ${drawn.join(", ") || "(none — pool empty)"} (magnet at ${team.magnetPosition})`,
    ["tokens"],
  );
  pushCue(team, {
    kind: "drop",
    fx: ["token-drop"],
    sfxId: "token_drop",
    durationMs: 650,
  });

  const claims = resolveClaims(team, drawn, random);
  // Same object refs so Runesinger can rewrite grades for later actors + UI badges
  team.lastClaims = claims;
  for (const c of claims) {
    const s = team.roster.find((x) => x.id === c.soldierId);
    if (s) {
      pushLog(
        team,
        `${s.name} claims ${c.token}${c.effectiveGrade !== c.token ? ` (Ice→${c.effectiveGrade})` : ""}`,
        ["claim"],
      );
      // All token holders get a short comic bubble (+ occasional VO)
      cueClaim(team, s.id, s.name, c.token, random);
    }
  }

  // Party actions: **Runesinger first** (rewrites tokens), then others front → back
  const claimBySoldier = new Map(claims.map((c) => [c.soldierId, c]));
  const actors = livingParty(team).filter((s) => claimBySoldier.has(s.id));
  const ordered = [
    ...actors.filter((s) => s.archetype === "Runesinger"),
    ...actors.filter((s) => s.archetype !== "Runesinger"),
  ];

  beginPartyActionPhase(ordered.map((s) => s.id));
  try {
    for (const soldier of ordered) {
      const claim = claimBySoldier.get(soldier.id);
      if (!claim) continue;

      // Snapshot board so presentation focuses units this action actually touched
      // (enemy hits, ally heals/damage, boss heals, new stun — not only enemy HP down).
      const beforeBossHp = team.boss?.currentHp ?? 0;
      const beforeBossStun = team.boss?.stunRoundsLeft ?? 0;
      const beforeMinions = team.minions.map((m) => ({
        id: m.id,
        name: m.name,
        hp: m.currentHp,
      }));
      const beforeParty = team.roster.map((s) => ({
        id: s.id,
        hp: s.currentHp,
        stunned: s.statuses.some((st) => st.kind === "Stun"),
      }));

      const { acted, skipReason, effectFocusIds } = resolveSpecialistAction(
        team,
        soldier,
        claim,
        random,
        (text, tags) => pushLog(team, text, tags ?? ["party"]),
      );
      markClaimerResolved(soldier.id);

      // Stunned / Frozen claimers keep their token claim but must not play an attack beat
      if (!acted) {
        const frozen = skipReason === "frozen";
        pushCue(team, {
          kind: "action",
          focusIds: [soldier.id],
          grade: claim.effectiveGrade,
          bubble: {
            speakerId: soldier.id,
            speakerName: soldier.name,
            side: "party",
            text: frozen ? "Frozen!" : "Stunned!",
          },
          fx: frozen
            ? ["party-frozen", "ice-tint", "hurt-flash"]
            : ["party-stunned", "shock-flash", "hurt-flash"],
          sfxId: frozen ? "fizzle" : "hit_light",
          durationMs: 900,
        });
        continue;
      }

      const hitFocusIds: string[] = [];
      const slainNames: string[] = [];
      const pushFocus = (id: string) => {
        if (id && !hitFocusIds.includes(id)) hitFocusIds.push(id);
      };

      for (const prev of beforeMinions) {
        const now = team.minions.find((m) => m.id === prev.id);
        if (!now) continue;
        if (now.currentHp < prev.hp) {
          pushFocus(now.id);
          if (prev.hp > 0 && now.currentHp <= 0) {
            slainNames.push(now.name);
          }
        }
      }
      // Boss: damage *or* heal (Healer F backlash)
      if (team.boss && team.boss.currentHp !== beforeBossHp) {
        pushFocus("boss");
      }
      // Thundercaller boss stun: reveal chip + FX only on this action beat
      const bossStunnedNow =
        (team.boss?.stunRoundsLeft ?? 0) > beforeBossStun;
      if (bossStunnedNow) pushFocus("boss");

      // Party: HP change (heal or damage) or newly applied stun
      let partyDamaged = false;
      let partyHealed = false;
      for (const prev of beforeParty) {
        const now = team.roster.find((s) => s.id === prev.id);
        if (!now) continue;
        if (now.currentHp < prev.hp) {
          pushFocus(now.id);
          partyDamaged = true;
        } else if (now.currentHp > prev.hp) {
          pushFocus(now.id);
          partyHealed = true;
        }
        const nowStunned = now.statuses.some((st) => st.kind === "Stun");
        if (!prev.stunned && nowStunned) pushFocus(now.id);
      }
      for (const id of effectFocusIds ?? []) pushFocus(id);

      const bossHealed =
        !!team.boss && team.boss.currentHp > beforeBossHp;

      const fx: string[] = [];
      if (soldier.archetype === "Healer") fx.push("heal-glow");
      if (soldier.archetype === "Runesinger") fx.push("heal-glow");
      if (soldier.archetype === "FireMage") {
        fx.push("fire-flash");
        if (partyDamaged) fx.push("fire-tint");
      }
      // Thundercaller party overload / any shock on allies
      if (
        soldier.archetype === "Thundercaller" &&
        hitFocusIds.some((id) =>
          team.roster.some((s) => s.id === id),
        )
      ) {
        fx.push("shock-flash");
      }
      // Necromancer / Archer ally hits still get hurt flash on victims
      if (partyDamaged) fx.push("hurt-flash");
      // Soft tag: heals landing on party or boss (client uses for pose + impact)
      if (partyHealed || bossHealed) fx.push("heal-glow");
      if (bossStunnedNow) fx.push("boss-stunned");
      cueAction(
        team,
        soldier.id,
        soldier.name,
        soldier.archetype,
        claim.effectiveGrade,
        random,
        fx,
        { hitFocusIds, slainNames },
      );
    }
  } finally {
    endPartyActionPhase();
  }

  // One compact DoT beat (visuals on chips, not a speech parade).
  // FX tint follows actual DoT types — never force poison-green on Fire ticks.
  // Also covers SpreadingFrost spread / shatter log lines.
  let sawDot = false;
  tickDots(team, (text) => {
    pushLog(team, text, ["dot"]);
    if (!sawDot && !text.includes("— DoT") && !text.includes("— End")) {
      sawDot = true;
      const dotted = livingParty(team).filter((s) =>
        s.statuses.some((st) => st.kind === "Dot" || st.kind === "Frozen"),
      );
      const types = new Set<string>();
      let hasFrozen = false;
      for (const s of dotted) {
        for (const st of s.statuses) {
          if (st.kind === "Dot") types.add(st.type);
          if (st.kind === "Frozen") hasFrozen = true;
        }
      }
      const isShatter = text.includes("SHATTER");
      const isFrostSpread = text.includes("[Frost]");
      const fx: string[] = ["dot-tick"];
      if (types.has("Fire")) fx.push("fire-tint");
      if (types.has("Poison")) fx.push("poison-tint");
      if (types.has("Ice") || hasFrozen || isFrostSpread) fx.push("ice-tint");
      if (types.has("Slime")) fx.push("slime-tint");
      if (isShatter) fx.push("frost-shatter", "hurt-flash");
      // Fallback if type set empty somehow
      if (fx.length === 1) fx.push("hurt-flash");
      pushCue(team, {
        kind: "dot",
        focusIds: dotted.map((s) => s.id),
        fx,
        sfxId: isShatter ? "boss_attack" : "dot_tick",
        durationMs: isShatter ? 1100 : 700,
      });
    }
  });
  processDeaths(team);
  // Keep slain minions at 0 HP on the board through party playback so the
  // client can show who killed them. Corpses are removed when the boss acts.

  if (livingParty(team).length === 0) {
    team.phase = "defeat";
    pushLog(team, "The party has fallen…", ["system"]);
    pushCue(team, {
      kind: "system",
      sfxId: "defeat",
      durationMs: 900,
    });
    return team;
  }
  if (team.boss && team.boss.currentHp <= 0) {
    team.phase = "victory";
    team.minions = [];
    pushLog(team, `${team.boss.name} is defeated!`, ["system"]);
    pushCue(team, {
      kind: "system",
      focusIds: ["boss"],
      sfxId: "victory",
      durationMs: 900,
    });
    return team;
  }

  team.phase = "boss_telegraph";
  {
    const tpl = getBossTemplate(team.boss!.id);
    const stunned = (team.boss!.stunRoundsLeft ?? 0) > 0;
    if (stunned) {
      // Already stunned by party this drop — do not wind up / play attack SFX
      team.pendingBossAttackId = null;
      pushLog(
        team,
        `${team.boss!.name} is reeling (stunned)…`,
        ["boss", "telegraph", "stun"],
      );
      pushCue(team, {
        kind: "telegraph",
        focusIds: ["boss"],
        bubble: {
          speakerId: "boss",
          speakerName: team.boss!.name,
          side: "boss",
          text: "Stunned…",
        },
        fx: ["stunned"],
        // no attack SFX — skip is resolved next
        durationMs: 900,
      });
    } else {
      // Pre-pick attack so wind-up pose/bubble match the coming impact
      const telegraphRng = createRng(
        team.rngSeed + team.round * 10007 + team.magnetPosition * 13 + 555,
      );
      const attackId = pickBossAttackId(team, telegraphRng);
      team.pendingBossAttackId = attackId;
      const tier = bossThreatTier(attackId);
      const theme =
        bossForcesWindupTheme(team.boss!.id) ?? bossWindupTheme(attackId);
      const windupMs = bossTelegraphDurationMs(tier);

      // Optional creature voice (grunt/laugh) — standing pose, before wind-up
      const voiceSfx = pickBossVoiceSfx(tpl, attackId, telegraphRng);
      if (voiceSfx) {
        pushCue(team, {
          kind: "telegraph",
          focusIds: ["boss"],
          fx: ["boss-voice"],
          sfxId: voiceSfx,
          durationMs: BOSS_VOICE_DURATION_MS,
        });
      }

      const lines = defaultTelegraphLines(attackId);
      const line =
        lines[Math.floor(telegraphRng() * lines.length)] ?? "…";

      pushLog(
        team,
        `${team.boss!.name} winds up (${attackId})…`,
        ["boss", "telegraph", attackId],
      );
      pushCue(team, {
        kind: "telegraph",
        focusIds: ["boss"],
        bubble: {
          speakerId: "boss",
          speakerName: team.boss!.name,
          side: "boss",
          text: line,
        },
        fx: ["boss-windup", `threat-${tier}`, `windup-${theme}`],
        sfxId: tpl?.telegraphSfx ?? "boss_attack",
        durationMs: windupMs,
      });
    }
  }
  return team;
}

/**
 * Boss + adds after the telegraph pause.
 * Ends in: victory | defeat | awaiting_magnet (next round)
 */
export function resolveBoss(team: TeamState): TeamState {
  if (team.phase !== "boss_telegraph") {
    throw new Error("Cannot resolve boss: not in boss telegraph phase");
  }
  if (!team.boss) throw new Error("No active fight");

  // Party presentation is done — remove corpses before boss/adds act
  purgeDeadMinions(team);

  team.playback = [];
  const random = createRng(
    team.rngSeed + team.round * 10007 + team.magnetPosition * 13 + 777,
  );

  /**
   * Party groan layers under the first damaging impact (boss preferred).
   * One reaction max per boss phase — never a second timed hurt cue.
   */
  let layeredHurt = false;
  if (team.boss.currentHp > 0 && livingParty(team).length > 0) {
    resolveBossPhase(team, random, (text) => pushLog(team, text, ["boss"]), {
      onBossAttack: (info) => {
        const isStunSkip =
          info.attackId === "StunSkip" ||
          (info.fx ?? []).includes("stun-skip") ||
          (info.fx ?? []).includes("stunned");
        const tier = bossThreatTier(info.attackId);
        const hurt =
          !isStunSkip && !layeredHurt && info.victimIds.length
            ? pickPartyHurt(team, info.victimIds, random)
            : null;
        if (hurt) layeredHurt = true;
        // Party impact tint by attack family (not generic red on poison/fire cloud)
        const isShockBoss = team.boss?.id === "rattle_captain";
        const victimFx =
          info.attackId === "PoisonCloud"
            ? ["poison-tint"]
            : info.attackId === "FireCloud"
              ? ["fire-tint"]
              : isShockBoss
                ? ["shock-flash"]
                : hurt
                  ? ["hurt-flash"]
                  : info.victimIds.length
                    ? ["hurt-flash"]
                    : [];
        pushCue(team, {
          kind: isStunSkip ? "system" : "boss",
          focusIds: isStunSkip
            ? ["boss"]
            : [
                "boss",
                ...info.victimIds,
                ...(hurt ? [hurt.victimId] : []),
              ],
          bubble: info.bubbleText
            ? {
                speakerId: "boss",
                speakerName: team.boss!.name,
                side: "boss",
                text: info.bubbleText,
              }
            : undefined,
          // Stun skip: no boss-attack flash (that looked like a hit)
          // boss-attack is boss-only on the client; victimFx tints the party
          fx: isStunSkip
            ? [...(info.fx ?? ["stunned"])]
            : [
                isShockBoss ? "boss-attack-shock" : "boss-attack",
                `threat-${tier}`,
                ...victimFx,
                ...(info.fx ?? []),
              ],
          sfxId: info.sfxId,
          // Impact + groan in one moment (secondary delayed slightly)
          ...(hurt
            ? {
                secondarySfxId: hurt.sfxId,
                secondarySfxDelayMs: PARTY_HURT_LAYER_DELAY_MS,
              }
            : {}),
          durationMs: isStunSkip ? 1000 : bossImpactDurationMs(tier),
        });
      },
      onMinionAttack: (info) => {
        // Per-kind shot (minion_moss_mite, …) with generic minion_shot fallback
        const sfxId = resolveSfxId(
          [info.sfxId, "minion_shot"].filter(Boolean) as string[],
        );
        // Groan only if boss didn't already layer one this phase
        const hurt =
          !layeredHurt
            ? pickPartyHurt(team, [info.targetId], random)
            : null;
        if (hurt) layeredHurt = true;
        // Ohms / Rattle Captain adds: yellow shock on the target (not red hurt)
        const minion = team.minions.find((m) => m.id === info.minionId);
        const shockMinion =
          team.boss?.id === "rattle_captain" ||
          minion?.kind === "ohm" ||
          /ohm/i.test(info.minionName);
        const victimFx = shockMinion
          ? ["shock-flash"]
          : hurt
            ? ["hurt-flash"]
            : [];
        pushCue(team, {
          kind: "minion",
          focusIds: [info.minionId, info.targetId],
          bubble: {
            speakerId: info.minionId,
            speakerName: info.minionName,
            side: "minion",
            text: info.bubbleText ?? "Hit!",
          },
          fx: ["minion-shot", ...victimFx],
          sfxId,
          ...(hurt
            ? {
                secondarySfxId: hurt.sfxId,
                secondarySfxDelayMs: PARTY_HURT_LAYER_DELAY_MS,
              }
            : {}),
          durationMs: 850,
        });
      },
    });
  }

  // Defensive window closed: leftover personal block and Spearman parry expire
  // after the boss/add volley that could consume them (not at the next token drop).
  for (const s of activeParty(team)) {
    s.block = 0;
    s.statuses = s.statuses.filter((st) => st.kind !== "Parry");
  }

  processDeaths(team);

  if (livingParty(team).length === 0) {
    team.phase = "defeat";
    pushLog(team, "The party has fallen…", ["system"]);
    pushCue(team, { kind: "system", sfxId: "defeat", durationMs: 900 });
    return team;
  }
  if (team.boss && team.boss.currentHp <= 0) {
    team.phase = "victory";
    team.minions = [];
    pushLog(team, `${team.boss.name} is defeated!`, ["system"]);
    pushCue(team, {
      kind: "system",
      focusIds: ["boss"],
      sfxId: "victory",
      durationMs: 900,
    });
    return team;
  }

  team.round += 1;
  team.phase = "awaiting_magnet";
  team.partyDamageBonus = 0;
  team.lastClaims = [];
  ensureMagnetOnLiving(team);
  const prep = preparePendingForRound(team);
  pushLog(
    team,
    `Round ${team.round}: ${prep.living} living → ${prep.tokens.length} token(s). Incoming: ${prep.tokens.join(", ") || "(none)"} — set magnet, then Drop Tokens.`,
    ["system", "tokens"],
  );
  // No long system speech — magnet playbook + tokens are enough
  return team;
}

/** Full round for teacher force / tests (party then boss with no client pause). */
export function commitFullRound(team: TeamState): TeamState {
  commitRound(team);
  if (team.phase === "boss_telegraph") {
    resolveBoss(team);
  }
  return team;
}

function processDeaths(team: TeamState): void {
  for (const s of activeParty(team)) {
    if (s.currentHp > 0) continue;
    // damage() may already flip alive=false before we get here
    const ext = s as Soldier & { deathLogged?: boolean };
    if (ext.deathLogged) continue;
    ext.alive = false;
    ext.deathLogged = true;
    pushLog(team, `${s.name} has fallen!`, ["death"]);
    pushCue(team, {
      kind: "death",
      focusIds: [s.id],
      bubble: {
        speakerId: s.id,
        speakerName: s.name,
        side: "party",
        text: "…!",
      },
      fx: ["death"],
      durationMs: 1000,
    });
  }
}

export function applyInterRoomHealing(team: TeamState): void {
  const hasVanguard = team.roster.some(
    (s) => s.alive && s.archetype === "Vanguard",
  );
  if (!hasVanguard) {
    pushLog(team, "No living Vanguard — no inter-room healing.", ["system"]);
    return;
  }
  for (const s of team.roster) {
    if (!s.alive) continue;
    const amount = Math.floor(s.maxHp * INTER_ROOM_VANGUARD_HEAL_PCT);
    healSoldier(s, amount);
  }
  pushLog(team, `Vanguard camp recovery: party heals ${INTER_ROOM_VANGUARD_HEAL_PCT * 100}% max HP.`, [
    "system",
  ]);
}

/** Clear fight-only fields so the team can form a party again. */
function clearFightState(team: TeamState): void {
  team.boss = null;
  team.minions = [];
  team.round = 0;
  team.pendingTokens = [];
  team.pendingBossAttackId = null;
  team.magnetStunRoundsLeft = 0;
  team.bossLastAttackWasStunKit = false;
  team.noSummonBeforeRound = 0;
  team.playback = [];
  team.lastClaims = [];
  team.partyShield = { remaining: 0, active: false };
  team.partyDamageBonus = 0;
  team.tokens = { remaining: [], discard: [] };
  for (const s of team.roster) {
    s.block = 0;
    s.statuses = [];
    s.position = null;
    const ext = s as Soldier & { deathLogged?: boolean };
    delete ext.deathLogged;
  }
  team.activePartyIds = [];
  team.magnetPosition = 1;
}

/**
 * Advance after a room victory.
 * - Idempotent: only runs from `victory` (double-click safe).
 * - Increments roomsCleared (roomIndex) once.
 * - If campaign finished → `campaign_complete`, else `between_rooms`.
 */
export function enterBetweenRooms(
  team: TeamState,
  campaignLength = DEFAULT_CAMPAIGN_LENGTH,
): void {
  if (team.phase === "between_rooms" || team.phase === "campaign_complete") {
    // Already advanced — ignore repeat continue
    return;
  }
  if (team.phase !== "victory") {
    throw new Error("Fight not won");
  }

  if (team.boss) {
    team.lastClearedBossName = team.boss.name;
  }

  applyInterRoomHealing(team);
  clearFightState(team);

  // One room cleared
  team.roomIndex += 1;
  const cleared = team.roomIndex;
  const total = Math.max(1, campaignLength);

  if (cleared >= total) {
    team.phase = "campaign_complete";
    pushLog(
      team,
      `Campaign complete! Cleared all ${total} rooms with ${livingRosterCount(team)} soldiers still standing.`,
      ["system", "campaign"],
    );
  } else {
    team.phase = "between_rooms";
    const living = livingRosterCount(team);
    const lineNote =
      living >= PARTY_SIZE
        ? `Reform a party of ${PARTY_SIZE} living soldiers.`
        : living > 0
          ? `Only ${living} living — field all of them understrength for room ${cleared + 1}.`
          : `No living soldiers left — ask the teacher to reset.`;
    pushLog(
      team,
      `Room ${cleared} cleared. Camping before room ${cleared + 1} of ${total}. ${lineNote}`,
      ["system", "campaign"],
    );
  }
}

/**
 * After a wipe: return to camp to reform and retry the **same** room.
 * - Idempotent when already in lobby / between_rooms.
 * - Does **not** advance roomIndex or apply inter-room heal.
 * - Fallen stay dead; living keep current HP.
 */
export function returnFromDefeat(team: TeamState): void {
  if (team.phase === "lobby" || team.phase === "between_rooms") {
    return;
  }
  if (team.phase !== "defeat") {
    throw new Error("Can only return to camp after a defeat");
  }

  const living = livingRosterCount(team);
  clearFightState(team);

  // Same room to retry: room 0 → lobby, later rooms → between_rooms camp UI
  team.phase = team.roomIndex === 0 ? "lobby" : "between_rooms";

  const roomNum = team.roomIndex + 1;
  if (living <= 0) {
    pushLog(
      team,
      `Defeat — the whole roster has fallen. Ask the teacher to reset the team.`,
      ["system", "campaign"],
    );
  } else if (living < PARTY_SIZE) {
    pushLog(
      team,
      `Defeat on room ${roomNum}. Only ${living} living — reform understrength (all survivors) and try again, or ask the teacher to reset.`,
      ["system", "campaign"],
    );
  } else {
    pushLog(
      team,
      `Defeat on room ${roomNum}. Reform a party of ${PARTY_SIZE} from the ${living} living soldiers and try again.`,
      ["system", "campaign"],
    );
  }
}

/** True if at least one living soldier can still enter a room (understrength OK). */
export function canFormNextParty(team: TeamState): boolean {
  return livingRosterCount(team) >= 1;
}

export function livingRosterCount(team: TeamState): number {
  return team.roster.filter((s) => s.alive).length;
}

export function publicSoldier(s: Soldier): Soldier {
  return { ...s, statuses: [...s.statuses] };
}
