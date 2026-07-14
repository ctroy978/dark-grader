import {
  createRng,
  INTER_ROOM_VANGUARD_HEAL_PCT,
  MAX_LOG_ENTRIES,
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
import { resolveBossPhase } from "./bosses.js";
import { resolveClaims, setMagnet } from "./claims.js";
import {
  activeParty,
  healSoldier,
  livingParty,
} from "./damage.js";
import { tickDots } from "./dots.js";
import {
  cueAction,
  cueClaim,
  cueHurtMaybe,
  pushCue,
} from "./presentation.js";
import { resolveSpecialistAction, triggerDoomcallerDeath } from "./specialists.js";
import {
  consumePendingTokens,
  createTokenPool,
  preparePendingForRound,
} from "./tokens.js";

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
): TeamState {
  return {
    teamId,
    inviteCode,
    name,
    roster: createCampaignRoster(),
    activePartyIds: [],
    magnetPosition: 1,
    partyShield: { remaining: 0, active: false },
    tokens: { remaining: [], discard: [] },
    pendingTokens: [],
    boss: null,
    minions: [],
    phase: "lobby",
    round: 0,
    log: [],
    playback: [],
    lastClaims: [],
    roomIndex: 0,
    partyDamageBonus: 0,
    slimeSlowNextRound: false,
    rngSeed,
    lastClearedBossName: null,
  };
}

export function selectParty(team: TeamState, soldierIds: string[]): void {
  if (team.phase !== "lobby" && team.phase !== "between_rooms") {
    throw new Error("Can only select party in lobby or between rooms");
  }
  if (soldierIds.length !== PARTY_SIZE) {
    throw new Error(`Party must be exactly ${PARTY_SIZE} soldiers`);
  }
  const unique = new Set(soldierIds);
  if (unique.size !== PARTY_SIZE) throw new Error("Duplicate soldiers in party");

  for (const id of soldierIds) {
    const s = team.roster.find((x) => x.id === id);
    if (!s || !s.alive) throw new Error(`Invalid soldier: ${id}`);
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
  if (team.activePartyIds.length !== PARTY_SIZE) {
    throw new Error(
      "This team has not formed a party yet. Students must pick 6 soldiers and order them in the lobby before the fight can start.",
    );
  }
  if (livingRosterCount(team) < PARTY_SIZE) {
    throw new Error(
      `Not enough living soldiers (${livingRosterCount(team)}). Need ${PARTY_SIZE} to enter a room.`,
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
  team.minions = [];
  team.tokens = createTokenPool(gradePool, random);
  team.pendingTokens = [];
  team.round = 1;
  team.phase = "awaiting_magnet";
  team.partyDamageBonus = 0;
  team.slimeSlowNextRound = false;
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
  const random = createRng(team.rngSeed + team.round * 10007 + team.magnetPosition * 13);

  team.partyDamageBonus = 0;

  // Clear personal block from the *previous* round before new party actions
  for (const s of activeParty(team)) {
    s.block = 0;
  }

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
  team.lastClaims = claims.map((c) => ({ ...c }));
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

  // Party actions front (1) → back (6) — short attack bubbles, not essays
  const claimBySoldier = new Map(claims.map((c) => [c.soldierId, c]));
  for (const soldier of livingParty(team)) {
    const claim = claimBySoldier.get(soldier.id);
    if (!claim) continue;
    resolveSpecialistAction(team, soldier, claim, random, (text, tags) =>
      pushLog(team, text, tags ?? ["party"]),
    );
    const fx: string[] = [];
    if (soldier.archetype === "Healer") fx.push("heal-glow");
    if (soldier.archetype === "FireMage") fx.push("fire-flash");
    if (claim.effectiveGrade === "F") fx.push("backfire");
    cueAction(
      team,
      soldier.id,
      soldier.name,
      soldier.archetype,
      claim.effectiveGrade,
      random,
      fx,
    );
  }

  // One compact DoT beat (visuals on chips, not a speech parade)
  let sawDot = false;
  tickDots(team, (text) => {
    pushLog(team, text, ["dot"]);
    if (!sawDot && !text.includes("— DoT") && !text.includes("— End")) {
      sawDot = true;
      pushCue(team, {
        kind: "dot",
        focusIds: livingParty(team)
          .filter((s) => s.statuses.some((st) => st.kind === "Dot"))
          .map((s) => s.id),
        fx: ["dot-tick", "poison-tint"],
        sfxId: "dot_tick",
        durationMs: 700,
      });
    }
  });
  processDeaths(team);

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
  pushLog(
    team,
    `${team.boss!.name} gathers power…`,
    ["boss", "telegraph"],
  );
  {
    const tpl = getBossTemplate(team.boss!.id);
    pushCue(team, {
      kind: "telegraph",
      focusIds: ["boss"],
      bubble: {
        speakerId: "boss",
        speakerName: team.boss!.name,
        side: "boss",
        text: "…",
      },
      fx: ["boss-windup"],
      sfxId: tpl?.telegraphSfx ?? "boss_attack",
      durationMs: 1100,
    });
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

  team.playback = [];
  const random = createRng(
    team.rngSeed + team.round * 10007 + team.magnetPosition * 13 + 777,
  );

  const hurtVictims: string[] = [];
  if (team.boss.currentHp > 0 && livingParty(team).length > 0) {
    resolveBossPhase(team, random, (text) => pushLog(team, text, ["boss"]), {
      onBossAttack: (info) => {
        pushCue(team, {
          kind: "boss",
          focusIds: ["boss", ...info.victimIds],
          bubble: info.bubbleText
            ? {
                speakerId: "boss",
                speakerName: team.boss!.name,
                side: "boss",
                text: info.bubbleText,
              }
            : undefined,
          fx: ["boss-attack", ...(info.fx ?? [])],
          sfxId: info.sfxId,
          durationMs: 1300,
        });
        hurtVictims.push(...info.victimIds);
      },
      onMinionAttack: (info) => {
        pushCue(team, {
          kind: "minion",
          focusIds: [info.minionId, info.targetId],
          bubble: {
            speakerId: info.minionId,
            speakerName: info.minionName,
            side: "minion",
            text: "Loose!",
          },
          fx: ["minion-shot"],
          sfxId: "minion_shot",
          durationMs: 750,
        });
        hurtVictims.push(info.targetId);
      },
    });
    // One party member reacts when attacked (bubble + rare VO)
    cueHurtMaybe(team, [...new Set(hurtVictims)], random);
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
  const slimeNote = prep.slimeReduced ? " (Slime reduced the drop!)" : "";
  pushLog(
    team,
    `Round ${team.round}: ${prep.living} living → ${prep.tokens.length} token(s)${slimeNote}. Incoming: ${prep.tokens.join(", ") || "(none)"} — set magnet, then Drop Tokens.`,
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
    if (s.archetype === "Doomcaller") {
      triggerDoomcallerDeath(team, s, (text) => {
        pushLog(team, text, ["death"]);
        pushCue(team, {
          kind: "death",
          focusIds: [s.id, "boss"],
          fx: ["curse-burst"],
          sfxId: "hit_heavy",
          durationMs: 1000,
        });
      });
    }
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

/**
 * Advance after a room victory.
 * - Idempotent: only runs from `victory` (double-click safe).
 * - Increments roomsCleared (roomIndex) once.
 * - If campaign finished → `campaign_complete`, else `between_rooms`.
 */
export function enterBetweenRooms(
  team: TeamState,
  campaignLength = 3,
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

  // Clear fight-only state
  team.boss = null;
  team.minions = [];
  team.round = 0;
  for (const s of team.roster) {
    s.block = 0;
    s.statuses = [];
    s.position = null;
    const ext = s as Soldier & { deathLogged?: boolean };
    delete ext.deathLogged;
  }
  team.activePartyIds = [];
  team.magnetPosition = 1;

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
    pushLog(
      team,
      `Room ${cleared} cleared. Camping before room ${cleared + 1} of ${total}. Reform a party of 6 living soldiers.`,
      ["system", "campaign"],
    );
  }
}

/** Living soldiers available for the next room (need ≥6 to continue campaign). */
export function canFormNextParty(team: TeamState): boolean {
  return livingRosterCount(team) >= PARTY_SIZE;
}

export function livingRosterCount(team: TeamState): number {
  return team.roster.filter((s) => s.alive).length;
}

export function publicSoldier(s: Soldier): Soldier {
  return { ...s, statuses: [...s.statuses] };
}
