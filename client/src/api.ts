import type { Grade } from "@dungeon-grades/shared";
import { io, type Socket } from "socket.io-client";

const API = "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  // Fastify rejects Content-Type: application/json with an empty body.
  // Only set JSON content-type when we actually send a body.
  let body = init?.body;
  if (init?.method && init.method !== "GET" && init.method !== "HEAD") {
    if (body === undefined) {
      body = "{}";
    }
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
  }
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers,
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? res.statusText);
  }
  return data as T;
}

export type BoardReveal = {
  soldiers: Array<{
    id: string;
    currentHp: number;
    maxHp: number;
    alive: boolean;
    block: number;
    statuses: import("@dungeon-grades/shared").StatusTag[];
  }>;
  boss: {
    currentHp: number;
    maxHp: number;
    statuses?: import("@dungeon-grades/shared").StatusTag[];
    /** Progressive: only rises when Thundercaller (etc.) stun lands */
    stunRoundsLeft?: number;
    curseDamageTakenMult?: number;
    curseRoundsLeft?: number;
    damageFloor?: number;
    damageFloorLabel?: string;
  } | null;
  minions: Array<{
    id: string;
    name: string;
    currentHp: number;
    maxHp: number;
    damage?: number;
    statuses?: import("@dungeon-grades/shared").StatusTag[];
    kind?: string;
    memory?: import("@dungeon-grades/shared").BoneMemoryState;
  }>;
  partyShield: {
    remaining: number;
    active: boolean;
    /** Maiden + most-endangered ally — only these seats show/spend cover */
    coveredIds?: string[];
  };
  magnetStunRoundsLeft?: number;
  boneColossus?: import("@dungeon-grades/shared").BoneColossusEncounterState | null;
};

export type PresentationCue = {
  id: string;
  kind: string;
  focusIds?: string[];
  /** Party seats that actually lost one or more DoTs on this action beat. */
  cleanseTargetIds?: string[];
  bubble?: {
    speakerId?: string;
    speakerName?: string;
    side: "party" | "boss" | "minion";
    text: string;
  };
  grade?: Grade;
  fx?: string[];
  sfxId?: string;
  /** Layered under primary (e.g. party groan on boss impact) */
  secondarySfxId?: string;
  secondarySfxDelayMs?: number;
  voId?: string;
  playVo?: boolean;
  durationMs?: number;
  /** Board after this beat — client reveals HP when the cast plays */
  reveal?: BoardReveal;
};

/** @deprecated use PresentationCue */
export type CombatBeat = PresentationCue;

export type RoomGateInfo = {
  roomIndex: number;
  open: boolean;
  hasGrades: boolean;
  gradeCount?: number;
  bossId: string;
};

export type EnrichedTeam = {
  teamId: string;
  inviteCode: string;
  name: string;
  classroomId?: string | null;
  classroomName?: string | null;
  roster: import("@dungeon-grades/shared").Soldier[];
  activePartyIds: string[];
  magnetPosition: 1 | 2 | 3 | 4 | 5 | 6;
  /** Rattle Captain: magnet cannot move while &gt; 0 */
  magnetStunRoundsLeft?: number;
  partyShield: {
    remaining: number;
    active: boolean;
    /** Maiden + most-endangered ally — only these seats show/spend cover */
    coveredIds?: string[];
  };
  phase: string;
  pendingBossAttackId?: string | null;
  round: number;
  log: { round: number; text: string; tags?: string[] }[];
  playback?: CombatBeat[];
  lastClaims?: {
    token: Grade;
    soldierId: string;
    effectiveGrade: Grade;
  }[];
  roomIndex: number;
  lastClearedBossName?: string | null;
  boss: {
    id?: string;
    name: string;
    currentHp: number;
    maxHp: number;
    traits?: string[];
    statuses?: import("@dungeon-grades/shared").StatusTag[];
    curseDamageTakenMult?: number;
    curseRoundsLeft?: number;
    outgoingDamageMult?: number;
    outgoingBuffRoundsLeft?: number;
    stunRoundsLeft?: number;
    nextAttackBonus?: number;
    damageFloor?: number;
    damageFloorLabel?: string;
  } | null;
  minions: {
    id: string;
    name: string;
    currentHp: number;
    maxHp: number;
    damage?: number;
    statuses?: import("@dungeon-grades/shared").StatusTag[];
    kind?: string;
    memory?: import("@dungeon-grades/shared").BoneMemoryState;
  }[];
  boneColossus?: import("@dungeon-grades/shared").BoneColossusEncounterState | null;
  cloud: Grade[];
  pendingTokens?: Grade[];
  tokensRemaining: number;
  tokensDiscard: number;
  campaignLength?: number;
  roomsCleared?: number;
  currentRoom?: number;
  isFinalRoom?: boolean;
  livingCount?: number;
  nextBossId?: string;
  nextBossName?: string;
  /** Student-facing scout card for the next room's boss (lobby hover). */
  nextBossScout?: import("@dungeon-grades/shared").BossScout | null;
  roomBossIds?: string[];
  /** Teacher paused this team's classroom */
  classroomPaused?: boolean;
  /** Per-room open/grades for lobby campaign bar */
  rooms?: RoomGateInfo[];
  canStartCurrentRoom?: boolean;
  startBlockedReason?: string | null;
};

export type ClassroomSummary = {
  classroomId: string;
  name: string;
  teamCount: number;
  paused: boolean;
  campaignLength: number;
  openRoomCount: number;
};

export type ClassroomRoomOverview = {
  roomIndex: number;
  open: boolean;
  tokenPool: Grade[];
  gradeCount: number;
  bossId: string;
};

export type Overview = {
  classroomId: string;
  name: string;
  bossTemplateId: string | null;
  campaignLength: number;
  roomBossIds: string[];
  paused?: boolean;
  rooms: ClassroomRoomOverview[];
  bosses: {
    id: string;
    name: string;
    maxHp: number;
    difficulty: string;
    summary: string;
    recommendedRounds: string;
  }[];
  teams: {
    teamId: string;
    name: string;
    inviteCode: string;
    phase: string;
    round: number;
    roomIndex: number;
    currentRoom: number;
    roomsCleared: number;
    campaignLength: number;
    alive: number;
    rosterSize: number;
    bossHp: string | null;
    nextBoss: string;
    canStartCurrentRoom?: boolean;
  }[];
};

function cls(cid: string, path: string) {
  return `/api/teacher/classrooms/${encodeURIComponent(cid)}${path}`;
}

export const api = {
  join: (code: string) =>
    request<EnrichedTeam>("/api/join", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  getTeam: (id: string) => request<EnrichedTeam>(`/api/team/${id}`),
  setRoster: (id: string, soldierIds: string[]) =>
    request<EnrichedTeam>(`/api/team/${id}/roster`, {
      method: "POST",
      body: JSON.stringify({ soldierIds }),
    }),
  setMagnet: (id: string, position: number) =>
    request<EnrichedTeam>(`/api/team/${id}/magnet`, {
      method: "POST",
      body: JSON.stringify({ position }),
    }),
  commitRound: (id: string) =>
    request<EnrichedTeam>(`/api/team/${id}/commit-round`, { method: "POST" }),
  resolveBoss: (id: string) =>
    request<EnrichedTeam>(`/api/team/${id}/resolve-boss`, { method: "POST" }),
  startFight: (id: string) =>
    request<EnrichedTeam>(`/api/team/${id}/start-fight`, { method: "POST" }),
  continueCampaign: (id: string) =>
    request<EnrichedTeam>(`/api/team/${id}/continue`, { method: "POST" }),
  returnFromDefeat: (id: string) =>
    request<EnrichedTeam>(`/api/team/${id}/return-from-defeat`, {
      method: "POST",
    }),
  runAway: (id: string) =>
    request<EnrichedTeam>(`/api/team/${id}/run-away`, { method: "POST" }),

  listClassrooms: (pin: string) =>
    request<{ classrooms: ClassroomSummary[] }>(
      `/api/teacher/classrooms?pin=${encodeURIComponent(pin)}`,
    ),
  createClassroom: (pin: string, name: string) =>
    request<Overview>("/api/teacher/classrooms", {
      method: "POST",
      body: JSON.stringify({ pin, name }),
    }),
  renameClassroom: (pin: string, classroomId: string, name: string) =>
    request<Overview>(cls(classroomId, ""), {
      method: "PATCH",
      body: JSON.stringify({ pin, name }),
    }),
  deleteClassroom: (pin: string, classroomId: string) =>
    request<{ ok: boolean }>(cls(classroomId, "/delete"), {
      method: "POST",
      body: JSON.stringify({ pin }),
    }),
  teacherOverview: (pin: string, classroomId: string) =>
    request<Overview>(
      `${cls(classroomId, "/overview")}?pin=${encodeURIComponent(pin)}`,
    ),
  setRoomGrades: (
    pin: string,
    classroomId: string,
    roomIndex: number,
    grades: string,
  ) =>
    request<{ count: number; grades: Grade[]; classroom: Overview }>(
      cls(classroomId, "/grades"),
      {
        method: "POST",
        body: JSON.stringify({ pin, roomIndex, grades }),
      },
    ),
  setRoomOpen: (
    pin: string,
    classroomId: string,
    roomIndex: number,
    open: boolean,
  ) =>
    request<Overview>(cls(classroomId, `/rooms/${roomIndex}/open`), {
      method: "POST",
      body: JSON.stringify({ pin, open }),
    }),
  setBoss: (pin: string, classroomId: string, bossTemplateId: string) =>
    request(cls(classroomId, "/boss"), {
      method: "POST",
      body: JSON.stringify({ pin, bossTemplateId }),
    }),
  setCampaign: (
    pin: string,
    classroomId: string,
    opts: { campaignLength?: number; roomBossIds?: string[] },
  ) =>
    request<Overview>(cls(classroomId, "/campaign"), {
      method: "POST",
      body: JSON.stringify({ pin, ...opts }),
    }),
  resetDefaultCampaign: (pin: string, classroomId: string) =>
    request<Overview>(cls(classroomId, "/campaign/default"), {
      method: "POST",
      body: JSON.stringify({ pin }),
    }),
  createTeam: (pin: string, classroomId: string, name: string) =>
    request<EnrichedTeam>(cls(classroomId, "/teams"), {
      method: "POST",
      body: JSON.stringify({ pin, name }),
    }),
  resetTeam: (pin: string, classroomId: string, id: string) =>
    request(cls(classroomId, `/teams/${id}/reset`), {
      method: "POST",
      body: JSON.stringify({ pin }),
    }),
  deleteTeam: (pin: string, classroomId: string, id: string) =>
    request(cls(classroomId, `/teams/${id}/delete`), {
      method: "POST",
      body: JSON.stringify({ pin }),
    }),
  setClassroomPaused: (pin: string, classroomId: string, paused: boolean) =>
    request<{ paused: boolean }>(cls(classroomId, "/pause"), {
      method: "POST",
      body: JSON.stringify({ pin, paused }),
    }),
  changeInviteCode: (pin: string, classroomId: string, teamId: string) =>
    request<EnrichedTeam>(cls(classroomId, `/teams/${teamId}/invite-code`), {
      method: "POST",
      body: JSON.stringify({ pin }),
    }),
};

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({ path: "/socket.io" });
  }
  return socket;
}
