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
  } | null;
  minions: Array<{
    id: string;
    name: string;
    currentHp: number;
    maxHp: number;
    damage?: number;
    statuses?: import("@dungeon-grades/shared").StatusTag[];
  }>;
  partyShield: { remaining: number; active: boolean };
  magnetStunRoundsLeft?: number;
};

export type PresentationCue = {
  id: string;
  kind: string;
  focusIds?: string[];
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

export type EnrichedTeam = {
  teamId: string;
  inviteCode: string;
  name: string;
  roster: import("@dungeon-grades/shared").Soldier[];
  activePartyIds: string[];
  magnetPosition: 1 | 2 | 3 | 4 | 5 | 6;
  /** Rattle Captain: magnet cannot move while &gt; 0 */
  magnetStunRoundsLeft?: number;
  partyShield: { remaining: number; active: boolean };
  phase: string;
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
  } | null;
  minions: {
    id: string;
    name: string;
    currentHp: number;
    maxHp: number;
    damage?: number;
    statuses?: import("@dungeon-grades/shared").StatusTag[];
  }[];
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
};

export type Overview = {
  masterTokenPool: Grade[];
  bossTemplateId: string | null;
  campaignLength: number;
  roomBossIds: string[];
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
  }[];
};

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

  teacherOverview: (pin: string) =>
    request<Overview>(`/api/teacher/overview?pin=${encodeURIComponent(pin)}`),
  setGrades: (pin: string, grades: string) =>
    request<{ count: number; grades: Grade[] }>("/api/teacher/grades", {
      method: "POST",
      body: JSON.stringify({ pin, grades }),
    }),
  setBoss: (pin: string, bossTemplateId: string) =>
    request("/api/teacher/boss", {
      method: "POST",
      body: JSON.stringify({ pin, bossTemplateId }),
    }),
  setCampaign: (
    pin: string,
    opts: { campaignLength?: number; roomBossIds?: string[] },
  ) =>
    request("/api/teacher/campaign", {
      method: "POST",
      body: JSON.stringify({ pin, ...opts }),
    }),
  resetDefaultCampaign: (pin: string) =>
    request("/api/teacher/campaign/default", {
      method: "POST",
      body: JSON.stringify({ pin }),
    }),
  createTeam: (pin: string, name: string) =>
    request<EnrichedTeam>("/api/teacher/teams", {
      method: "POST",
      body: JSON.stringify({ pin, name }),
    }),
  resetTeam: (pin: string, id: string) =>
    request(`/api/teacher/teams/${id}/reset`, {
      method: "POST",
      body: JSON.stringify({ pin }),
    }),
  forceRound: (pin: string, id: string) =>
    request(`/api/teacher/teams/${id}/force-round`, {
      method: "POST",
      body: JSON.stringify({ pin }),
    }),
  teacherStartFight: (pin: string, id: string) =>
    request(`/api/teacher/teams/${id}/start-fight`, {
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
