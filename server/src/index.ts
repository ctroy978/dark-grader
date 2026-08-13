import cors from "@fastify/cors";
import Fastify from "fastify";
import fs from "node:fs";
import { Server as SocketServer } from "socket.io";
import {
  currentRoomNumber,
  isRelicId,
  isFinalRoom,
  parseGradeList,
  scoringSummary,
  type Grade,
  type Position,
  type TeamState,
} from "@dungeon-grades/shared";
import { clipPath, listCachedClips } from "./audio/files.js";
import {
  buildBossScout,
  listBossTemplatesForApi,
  loadBossTemplates,
} from "./seed/bosses.js";
import {
  commitFullRound,
  commitRound,
  enterBetweenRooms,
  placeMagnet,
  resolveBoss,
  returnFromDefeat,
  runAway,
  selectParty,
  startFight,
} from "./engine/combat.js";
import { GameStore } from "./db/store.js";
import { cloudPreview } from "./engine/tokens.js";
import {
  chooseHealingPotionReward,
  chooseRelicReward,
} from "./engine/rewards.js";
import { loadEnv } from "./loadEnv.js";
import {
  resolveAudioDir,
  resolveBasePath,
  resolveDataDir,
  stripBasePath,
} from "./paths.js";
import { registerClientStatic } from "./serveClient.js";
import { pinFromRequest, pinsMatch } from "./teacherAuth.js";

loadEnv();

const PORT = Number(process.env.PORT ?? 3001);
const TEACHER_PIN = process.env.TEACHER_PIN ?? "teacher";
const HOST = process.env.HOST ?? "0.0.0.0";
const PRODUCTION = process.env.NODE_ENV === "production";
const ALLOW_DEFAULT_PIN = process.env.ALLOW_DEFAULT_TEACHER_PIN === "1";
const BASE_PATH = resolveBasePath();

if (PRODUCTION && !ALLOW_DEFAULT_PIN && (!TEACHER_PIN || TEACHER_PIN === "teacher")) {
  console.error(
    "Refusing to start: set TEACHER_PIN in .env to something other than the default 'teacher'.",
  );
  process.exit(1);
}

const store = new GameStore();

const app = Fastify({
  logger: true,
  // nginx sets X-Forwarded-* ; needed for correct proto/IP behind the proxy
  trustProxy: true,
  rewriteUrl(req) {
    return stripBasePath(req.url ?? "/", BASE_PATH);
  },
});
await app.register(cors, { origin: true });

function requireTeacher(req: {
  headers: Record<string, unknown>;
  body?: unknown;
  query?: unknown;
}): void {
  if (!pinsMatch(pinFromRequest(req), TEACHER_PIN)) {
    const err = new Error("Invalid teacher PIN") as Error & { statusCode: number };
    err.statusCode = 401;
    throw err;
  }
}

function httpError(message: string, statusCode: number): never {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  throw err;
}

/** Block student join / play while this team's classroom is paused. */
function requirePlayable(team: TeamState): void {
  if (store.isTeamPaused(team)) {
    httpError(
      "Classroom is paused — wait for your teacher to resume play",
      503,
    );
  }
}

function teacherClassroomRoom(classroomId: string): string {
  return `teacher:cls:${classroomId}`;
}

function emitClassroomOverview(classroomId: string): void {
  const overview = classroomOverview(classroomId);
  if (!overview) return;
  io.to(teacherClassroomRoom(classroomId)).emit("teacher:overview", overview);
  io.to("teacher").emit("teacher:classrooms", store.listClassroomSummaries());
}

function broadcastTeam(teamId: string): void {
  const team = store.getTeam(teamId);
  if (!team) return;
  io.to(`team:${teamId}`).emit("team:state", enrich(team));
  if (team.classroomId) {
    emitClassroomOverview(team.classroomId);
  }
}

function startBlockedReason(team: TeamState): string | null {
  const c = store.getClassroomForTeam(team);
  if (!c) return "This team is not assigned to a classroom — ask your teacher.";
  if (c.paused) return "Classroom is paused — wait for your teacher to resume play.";
  if (team.phase === "campaign_complete") {
    return "Campaign complete — ask your teacher to reset the team.";
  }
  const roomNum = currentRoomNumber(team.roomIndex);
  const slot = store.roomSlotForTeam(team);
  if (!slot) return `Room ${roomNum} is not available.`;
  if (!slot.open) {
    return `Room ${roomNum} is not open yet — wait for your teacher after the next test grades.`;
  }
  if (!slot.tokenPool.length) {
    return `Room ${roomNum} has no grades yet — wait for your teacher.`;
  }
  return null;
}

function enrich(team: ReturnType<typeof store.getTeam>) {
  if (!team) return null;
  const c = store.getClassroomForTeam(team);
  const roomsCleared = team.roomIndex;
  const campaignLength = c?.campaignLength ?? 6;
  const roomNum = currentRoomNumber(roomsCleared);
  const nextBossId = c
    ? store.bossForRoom(c, roomsCleared)
    : "bone_colossus";
  const nextBoss = loadBossTemplates().find((b) => b.id === nextBossId);
  const nextBossScout = nextBossId ? buildBossScout(nextBossId) : null;
  const blocked = startBlockedReason(team);
  const rooms = c
    ? c.rooms.map((slot, i) => ({
        roomIndex: i,
        open: Boolean(slot.open),
        hasGrades: slot.tokenPool.length > 0,
        gradeCount: slot.tokenPool.length,
        bossId: c.roomBossIds[i] ?? c.bossTemplateId ?? "bone_colossus",
      }))
    : [];
  const score = scoringSummary(team.scoring, campaignLength);

  return {
    ...team,
    cloud: cloudPreview(team),
    pendingTokens: team.pendingTokens ?? [],
    tokensRemaining: team.tokens.remaining.length,
    tokensDiscard: team.tokens.discard.length,
    campaignLength,
    roomsCleared,
    currentRoom: roomNum,
    isFinalRoom: isFinalRoom(roomsCleared, campaignLength),
    livingCount: team.roster.filter((s) => s.alive).length,
    nextBossId,
    nextBossName: nextBoss?.name ?? nextBossId,
    nextBossScout,
    roomBossIds: c?.roomBossIds ?? [],
    classroomId: c?.classroomId ?? team.classroomId ?? null,
    classroomName: c?.name ?? null,
    classroomPaused: Boolean(c?.paused),
    rooms,
    canStartCurrentRoom: blocked === null,
    startBlockedReason: blocked,
    score,
  };
}

function classroomOverview(classroomId: string) {
  const c = store.getClassroom(classroomId);
  if (!c) return null;
  return {
    classroomId: c.classroomId,
    name: c.name,
    bossTemplateId: c.bossTemplateId,
    campaignLength: c.campaignLength,
    roomBossIds: c.roomBossIds,
    paused: Boolean(c.paused),
    rooms: c.rooms.map((slot, i) => ({
      roomIndex: i,
      open: Boolean(slot.open),
      tokenPool: slot.tokenPool,
      gradeCount: slot.tokenPool.length,
      bossId: c.roomBossIds[i] ?? c.bossTemplateId ?? "bone_colossus",
    })),
    bosses: listBossTemplatesForApi(),
    teams: store.listTeams(classroomId).map((t) => ({
      teamId: t.teamId,
      name: t.name,
      inviteCode: t.inviteCode,
      phase: t.phase,
      round: t.round,
      roomIndex: t.roomIndex,
      currentRoom: currentRoomNumber(t.roomIndex),
      roomsCleared: t.roomIndex,
      campaignLength: c.campaignLength,
      alive: t.roster.filter((s) => s.alive).length,
      rosterSize: t.roster.length,
      bossHp: t.boss ? `${t.boss.currentHp}/${t.boss.maxHp}` : null,
      nextBoss: store.bossForRoom(c, t.roomIndex),
      canStartCurrentRoom: startBlockedReason(t) === null,
      score: scoringSummary(t.scoring, c.campaignLength),
      scoring: t.scoring,
      items: t.items,
    })),
  };
}

function beginFight(team: TeamState): void {
  const c = store.getClassroomForTeam(team);
  if (!c) httpError("Team is not in a classroom", 400);
  const slot = store.roomSlotForTeam(team);
  const roomNum = currentRoomNumber(team.roomIndex);
  if (!slot || !slot.open) {
    httpError(
      `Room ${roomNum} is not open yet — wait for your teacher after the next test grades.`,
      403,
    );
  }
  if (!slot.tokenPool.length) {
    httpError(
      `Room ${roomNum} has no grades — teacher must enter grades first.`,
      400,
    );
  }
  const bossId = store.bossForRoom(c, team.roomIndex);
  startFight(team, bossId, slot.tokenPool);
  store.updateTeam(team);
  broadcastTeam(team.teamId);
}

// --- Health ---
app.get("/api/health", async () => ({
  ok: true,
  service: "gradeforge",
}));

/** Public codex for the marketing site (no PIN). Campaign bosses + scouts. */
app.get("/api/codex/bosses", async () => {
  const { DEFAULT_ROOM_BOSSES } = await import("@dungeon-grades/shared");
  const campaignIds: string[] = [...DEFAULT_ROOM_BOSSES];
  const all = loadBossTemplates();
  const byId = new Map(all.map((t) => [t.id, t]));
  const seen = new Set<string>();
  const ordered = [];
  for (const id of campaignIds) {
    const t = byId.get(id);
    if (t) {
      ordered.push(t);
      seen.add(id);
    }
  }
  for (const t of all) {
    if (!seen.has(t.id)) ordered.push(t);
  }
  return {
    campaignBossIds: campaignIds,
    bosses: ordered.map((t) => {
      const scout = buildBossScout(t.id);
      const roomIndex = campaignIds.indexOf(t.id);
      return {
        id: t.id,
        name: t.name,
        maxHp: t.maxHp,
        difficulty: t.difficulty,
        summary: t.summary,
        recommendedRounds: t.recommendedRounds,
        traits: t.traits ?? [],
        roomIndex,
        scout,
      };
    }),
  };
});

// --- Audio (checked-in MP3s under server/data/audio) ---
app.get("/api/audio/manifest", async (_req, reply) => {
  return reply.header("Cache-Control", "no-store").send({
    clips: listCachedClips(),
  });
});

app.get<{ Params: { id: string } }>("/api/audio/:id", async (req, reply) => {
  const id = req.params.id.replace(/[^a-z0-9_]/gi, "");
  const file = clipPath(id);
  if (!fs.existsSync(file)) {
    httpError("Clip not found", 404);
  }
  return reply
    .header("Content-Type", "audio/mpeg")
    .header("Cache-Control", "public, max-age=31536000, immutable")
    .send(fs.createReadStream(file));
});

// --- Teacher: classroom list / CRUD ---
app.get("/api/teacher/classrooms", async (req) => {
  requireTeacher(req);
  return { classrooms: store.listClassroomSummaries() };
});

app.post<{ Body: { pin: string; name?: string } }>(
  "/api/teacher/classrooms",
  async (req) => {
    requireTeacher(req);
    const classroom = store.createClassroom(req.body.name ?? "");
    io.to("teacher").emit("teacher:classrooms", store.listClassroomSummaries());
    return classroomOverview(classroom.classroomId);
  },
);

app.patch<{ Body: { pin: string; name: string }; Params: { cid: string } }>(
  "/api/teacher/classrooms/:cid",
  async (req) => {
    requireTeacher(req);
    try {
      store.renameClassroom(req.params.cid, req.body.name ?? "");
    } catch (e) {
      httpError(e instanceof Error ? e.message : "Rename failed", 404);
    }
    emitClassroomOverview(req.params.cid);
    return classroomOverview(req.params.cid);
  },
);

app.post<{ Body: { pin: string }; Params: { cid: string } }>(
  "/api/teacher/classrooms/:cid/delete",
  async (req) => {
    requireTeacher(req);
    const c = store.getClassroom(req.params.cid);
    if (!c) httpError("Classroom not found", 404);
    const teamIds = [...c.teamIds];
    try {
      store.deleteClassroom(req.params.cid);
    } catch (e) {
      httpError(e instanceof Error ? e.message : "Delete failed", 400);
    }
    for (const id of teamIds) {
      io.to(`team:${id}`).emit("team:deleted", { teamId: id });
    }
    io.to("teacher").emit("teacher:classrooms", store.listClassroomSummaries());
    return { ok: true, classroomId: req.params.cid };
  },
);

app.get<{ Params: { cid: string } }>(
  "/api/teacher/classrooms/:cid/overview",
  async (req) => {
    requireTeacher(req);
    const o = classroomOverview(req.params.cid);
    if (!o) httpError("Classroom not found", 404);
    return o;
  },
);

app.post<{
  Body: { pin: string; roomIndex: number; grades: string | Grade[] };
  Params: { cid: string };
}>("/api/teacher/classrooms/:cid/grades", async (req) => {
  requireTeacher(req);
  const grades = Array.isArray(req.body.grades)
    ? req.body.grades
    : parseGradeList(String(req.body.grades ?? ""));
  if (!grades.length) {
    httpError("No valid grades (A–F) found", 400);
  }
  const roomIndex = Number(req.body.roomIndex);
  if (!Number.isFinite(roomIndex)) {
    httpError("roomIndex required", 400);
  }
  try {
    store.setRoomGrades(req.params.cid, roomIndex, grades);
  } catch (e) {
    httpError(e instanceof Error ? e.message : "Failed", 400);
  }
  emitClassroomOverview(req.params.cid);
  // Push room-gate updates to teams in this classroom
  for (const t of store.listTeams(req.params.cid)) {
    io.to(`team:${t.teamId}`).emit("team:state", enrich(t));
  }
  return {
    roomIndex,
    count: grades.length,
    grades,
    classroom: classroomOverview(req.params.cid),
  };
});

app.post<{
  Body: { pin: string; open: boolean };
  Params: { cid: string; roomIndex: string };
}>("/api/teacher/classrooms/:cid/rooms/:roomIndex/open", async (req) => {
  requireTeacher(req);
  const roomIndex = Number(req.params.roomIndex);
  if (!Number.isFinite(roomIndex)) {
    httpError("Invalid room index", 400);
  }
  try {
    store.setRoomOpen(req.params.cid, roomIndex, Boolean(req.body.open));
  } catch (e) {
    httpError(e instanceof Error ? e.message : "Failed", 400);
  }
  emitClassroomOverview(req.params.cid);
  for (const t of store.listTeams(req.params.cid)) {
    io.to(`team:${t.teamId}`).emit("team:state", enrich(t));
  }
  return classroomOverview(req.params.cid);
});

app.post<{ Body: { pin: string; bossTemplateId: string }; Params: { cid: string } }>(
  "/api/teacher/classrooms/:cid/boss",
  async (req) => {
    requireTeacher(req);
    const id = req.body.bossTemplateId;
    if (!loadBossTemplates().some((b) => b.id === id)) {
      httpError("Unknown boss", 400);
    }
    try {
      store.setBoss(req.params.cid, id);
    } catch (e) {
      httpError(e instanceof Error ? e.message : "Failed", 404);
    }
    emitClassroomOverview(req.params.cid);
    return { bossTemplateId: id };
  },
);

app.post<{
  Body: { pin: string; campaignLength?: number; roomBossIds?: string[] };
  Params: { cid: string };
}>("/api/teacher/classrooms/:cid/campaign", async (req) => {
  requireTeacher(req);
  if (req.body.roomBossIds) {
    for (const id of req.body.roomBossIds) {
      if (!loadBossTemplates().some((b) => b.id === id)) {
        httpError(`Unknown boss: ${id}`, 400);
      }
    }
  }
  try {
    store.setCampaign(req.params.cid, {
      campaignLength: req.body.campaignLength,
      roomBossIds: req.body.roomBossIds,
    });
  } catch (e) {
    httpError(e instanceof Error ? e.message : "Failed", 404);
  }
  emitClassroomOverview(req.params.cid);
  for (const t of store.listTeams(req.params.cid)) {
    io.to(`team:${t.teamId}`).emit("team:state", enrich(t));
  }
  return classroomOverview(req.params.cid);
});

app.post<{ Body: { pin: string }; Params: { cid: string } }>(
  "/api/teacher/classrooms/:cid/campaign/default",
  async (req) => {
    requireTeacher(req);
    try {
      store.resetDefaultCampaign(req.params.cid);
    } catch (e) {
      httpError(e instanceof Error ? e.message : "Failed", 404);
    }
    emitClassroomOverview(req.params.cid);
    for (const t of store.listTeams(req.params.cid)) {
      io.to(`team:${t.teamId}`).emit("team:state", enrich(t));
    }
    return classroomOverview(req.params.cid);
  },
);

app.post<{ Body: { pin: string; paused: boolean }; Params: { cid: string } }>(
  "/api/teacher/classrooms/:cid/pause",
  async (req) => {
    requireTeacher(req);
    try {
      store.setPaused(req.params.cid, Boolean(req.body.paused));
    } catch (e) {
      httpError(e instanceof Error ? e.message : "Failed", 404);
    }
    emitClassroomOverview(req.params.cid);
    for (const t of store.listTeams(req.params.cid)) {
      io.to(`team:${t.teamId}`).emit("team:state", enrich(t));
    }
    return { paused: Boolean(req.body.paused) };
  },
);

app.post<{ Body: { pin: string; name?: string }; Params: { cid: string } }>(
  "/api/teacher/classrooms/:cid/teams",
  async (req) => {
    requireTeacher(req);
    try {
      const team = store.createTeam(req.params.cid, req.body.name ?? "");
      emitClassroomOverview(req.params.cid);
      return enrich(team);
    } catch (e) {
      httpError(e instanceof Error ? e.message : "Failed", 404);
    }
  },
);

app.post<{ Body: { pin: string }; Params: { cid: string; id: string } }>(
  "/api/teacher/classrooms/:cid/teams/:id/invite-code",
  async (req) => {
    requireTeacher(req);
    const team = store.getTeam(req.params.id);
    if (!team || team.classroomId !== req.params.cid) {
      httpError("Team not found", 404);
    }
    const updated = store.regenerateInviteCode(req.params.id);
    emitClassroomOverview(req.params.cid);
    broadcastTeam(updated.teamId);
    return enrich(updated);
  },
);

app.post<{ Body: { pin: string }; Params: { cid: string; id: string } }>(
  "/api/teacher/classrooms/:cid/teams/:id/delete",
  async (req) => {
    requireTeacher(req);
    const team = store.getTeam(req.params.id);
    if (!team || team.classroomId !== req.params.cid) {
      httpError("Team not found", 404);
    }
    store.deleteTeam(req.params.id);
    emitClassroomOverview(req.params.cid);
    io.to(`team:${req.params.id}`).emit("team:deleted", {
      teamId: req.params.id,
    });
    return { ok: true, teamId: req.params.id };
  },
);

app.post<{ Body: { pin: string }; Params: { cid: string; id: string } }>(
  "/api/teacher/classrooms/:cid/teams/:id/reset",
  async (req) => {
    requireTeacher(req);
    const existing = store.getTeam(req.params.id);
    if (!existing || existing.classroomId !== req.params.cid) {
      httpError("Team not found", 404);
    }
    const team = store.resetTeam(req.params.id);
    broadcastTeam(team.teamId);
    return enrich(team);
  },
);

app.post<{ Body: { pin: string }; Params: { cid: string; id: string } }>(
  "/api/teacher/classrooms/:cid/teams/:id/force-round",
  async (req) => {
    requireTeacher(req);
    const team = store.getTeam(req.params.id);
    if (!team || team.classroomId !== req.params.cid) {
      httpError("Team not found", 404);
    }
    if (team.phase === "awaiting_magnet") {
      commitFullRound(team);
      store.updateTeam(team);
      broadcastTeam(team.teamId);
    } else if (team.phase === "boss_telegraph") {
      resolveBoss(team);
      store.updateTeam(team);
      broadcastTeam(team.teamId);
    }
    return enrich(team);
  },
);

app.post<{ Body: { pin: string }; Params: { cid: string; id: string } }>(
  "/api/teacher/classrooms/:cid/teams/:id/start-fight",
  async (req) => {
    requireTeacher(req);
    const team = store.getTeam(req.params.id);
    if (!team || team.classroomId !== req.params.cid) {
      httpError("Team not found", 404);
    }
    beginFight(team);
    return enrich(team);
  },
);

// --- Student / Team ---
app.post<{ Body: { code: string } }>("/api/join", async (req) => {
  const team = store.getTeamByCode(req.body.code ?? "");
  if (!team) {
    httpError("Invalid invite code", 404);
  }
  requirePlayable(team);
  return enrich(team);
});

app.get<{ Params: { id: string } }>("/api/team/:id", async (req) => {
  const team = store.getTeam(req.params.id);
  if (!team) {
    httpError("Team not found", 404);
  }
  return enrich(team);
});

app.post<{ Body: { soldierIds: string[] }; Params: { id: string } }>(
  "/api/team/:id/roster",
  async (req) => {
    const team = store.getTeam(req.params.id);
    if (!team) httpError("Team not found", 404);
    requirePlayable(team);
    selectParty(team, req.body.soldierIds);
    store.updateTeam(team);
    broadcastTeam(team.teamId);
    return enrich(team);
  },
);

app.post<{ Body: { position: number }; Params: { id: string } }>(
  "/api/team/:id/magnet",
  async (req) => {
    const team = store.getTeam(req.params.id);
    if (!team) httpError("Team not found", 404);
    requirePlayable(team);
    placeMagnet(team, req.body.position as Position);
    store.updateTeam(team);
    broadcastTeam(team.teamId);
    return enrich(team);
  },
);

app.post<{ Params: { id: string } }>("/api/team/:id/commit-round", async (req) => {
  const team = store.getTeam(req.params.id);
  if (!team) httpError("Team not found", 404);
  requirePlayable(team);
  commitRound(team);
  store.updateTeam(team);
  broadcastTeam(team.teamId);
  return enrich(team);
});

app.post<{ Params: { id: string } }>("/api/team/:id/resolve-boss", async (req) => {
  const team = store.getTeam(req.params.id);
  if (!team) httpError("Team not found", 404);
  requirePlayable(team);
  resolveBoss(team);
  store.updateTeam(team);
  broadcastTeam(team.teamId);
  return enrich(team);
});

app.post<{ Params: { id: string } }>("/api/team/:id/start-fight", async (req) => {
  const team = store.getTeam(req.params.id);
  if (!team) httpError("Team not found", 404);
  requirePlayable(team);
  beginFight(team);
  return enrich(team);
});

app.post<{ Params: { id: string } }>("/api/team/:id/continue", async (req) => {
  const team = store.getTeam(req.params.id);
  if (!team) httpError("Team not found", 404);
  requirePlayable(team);
  const c = store.getClassroomForTeam(team);
  enterBetweenRooms(team, c?.campaignLength);
  store.updateTeam(team);
  broadcastTeam(team.teamId);
  return enrich(team);
});

app.post<{
  Params: { id: string };
  Body: { relicId?: unknown; soldierId?: string };
}>("/api/team/:id/reward/relic", async (req) => {
  const team = store.getTeam(req.params.id);
  if (!team) httpError("Team not found", 404);
  requirePlayable(team);
  if (!isRelicId(req.body.relicId)) httpError("Invalid relic", 400);
  if (typeof req.body.soldierId !== "string") httpError("Soldier required", 400);
  chooseRelicReward(team, req.body.relicId, req.body.soldierId);
  store.updateTeam(team);
  broadcastTeam(team.teamId);
  return enrich(team);
});

app.post<{
  Params: { id: string };
  Body: { soldierId?: string };
}>("/api/team/:id/reward/healing-potion", async (req) => {
  const team = store.getTeam(req.params.id);
  if (!team) httpError("Team not found", 404);
  requirePlayable(team);
  if (typeof req.body.soldierId !== "string") httpError("Soldier required", 400);
  chooseHealingPotionReward(team, req.body.soldierId);
  store.updateTeam(team);
  broadcastTeam(team.teamId);
  return enrich(team);
});

app.post<{ Params: { id: string } }>(
  "/api/team/:id/return-from-defeat",
  async (req) => {
    const team = store.getTeam(req.params.id);
    if (!team) httpError("Team not found", 404);
    requirePlayable(team);
    returnFromDefeat(team);
    store.updateTeam(team);
    broadcastTeam(team.teamId);
    return enrich(team);
  },
);

app.post<{ Params: { id: string } }>("/api/team/:id/run-away", async (req) => {
  const team = store.getTeam(req.params.id);
  if (!team) httpError("Team not found", 404);
  requirePlayable(team);
  runAway(team);
  store.updateTeam(team);
  broadcastTeam(team.teamId);
  return enrich(team);
});

const io = new SocketServer({
  cors: { origin: true },
  path: `${BASE_PATH}/socket.io`,
});

io.on("connection", (socket) => {
  socket.on("subscribe:team", (teamId: string) => {
    socket.join(`team:${teamId}`);
    const team = store.getTeam(teamId);
    if (team) socket.emit("team:state", enrich(team));
  });
  socket.on("subscribe:teacher", (pin: string) => {
    if (!pinsMatch(pin, TEACHER_PIN)) return;
    socket.join("teacher");
    socket.emit("teacher:classrooms", store.listClassroomSummaries());
  });
  socket.on(
    "subscribe:classroom",
    (payload: { pin?: string; classroomId?: string }) => {
      if (!pinsMatch(payload?.pin, TEACHER_PIN) || !payload.classroomId) return;
      const c = store.getClassroom(payload.classroomId);
      if (!c) return;
      socket.join(teacherClassroomRoom(payload.classroomId));
      const o = classroomOverview(payload.classroomId);
      if (o) socket.emit("teacher:overview", o);
    },
  );
});

app.setErrorHandler((error, _req, reply) => {
  const err = error as Error & { statusCode?: number };
  const status = err.statusCode ?? 500;
  reply.status(status).send({ error: err.message ?? "Internal error" });
});

const clientDist = await registerClientStatic(app);

await app.ready();
io.attach(app.server);

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "shutting down");
  io.close();
  await app.close();
  process.exit(0);
};
process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

await app.listen({ port: PORT, host: HOST });
app.log.info(
  {
    host: HOST,
    port: PORT,
    basePath: BASE_PATH || "/",
    dataDir: resolveDataDir(),
    audioDir: resolveAudioDir(),
    clientDist: clientDist ?? "(none — point nginx at client/dist or run npm run build)",
    production: PRODUCTION,
  },
  "GradeForge listening",
);
if (!PRODUCTION) {
  console.log(`Teacher PIN: ${TEACHER_PIN}`);
}
