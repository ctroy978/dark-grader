import cors from "@fastify/cors";
import Fastify from "fastify";
import fs from "node:fs";
import { Server as SocketServer } from "socket.io";
import {
  currentRoomNumber,
  isFinalRoom,
  parseGradeList,
  type Grade,
  type Position,
} from "@dungeon-grades/shared";
import {
  audioCacheDir,
  clipPath,
  ensureAllClips,
  ensureClip,
  hasApiKey,
  listCachedClips,
  probePermissions,
} from "./audio/elevenlabs.js";
import { BOSS_TEMPLATES } from "./seed/bosses.js";
import {
  commitFullRound,
  commitRound,
  enterBetweenRooms,
  placeMagnet,
  resolveBoss,
  selectParty,
  startFight,
} from "./engine/combat.js";
import { GameStore } from "./db/store.js";
import { cloudPreview } from "./engine/tokens.js";
import { loadEnv } from "./loadEnv.js";

loadEnv();

const PORT = Number(process.env.PORT ?? 3001);
const TEACHER_PIN = process.env.TEACHER_PIN ?? "teacher";
const HOST = process.env.HOST ?? "0.0.0.0";

const store = new GameStore();

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

function requireTeacher(pin: unknown): void {
  if (pin !== TEACHER_PIN) {
    const err = new Error("Invalid teacher PIN") as Error & { statusCode: number };
    err.statusCode = 401;
    throw err;
  }
}

function broadcastTeam(teamId: string): void {
  const team = store.getTeam(teamId);
  if (!team) return;
  io.to(`team:${teamId}`).emit("team:state", enrich(team));
  io.to("teacher").emit("teacher:overview", overview());
}

function enrich(team: ReturnType<typeof store.getTeam>) {
  if (!team) return null;
  const c = store.getClassroom();
  const roomsCleared = team.roomIndex;
  const campaignLength = c.campaignLength;
  const roomNum = currentRoomNumber(roomsCleared);
  const nextBossId = store.bossForRoom(roomsCleared);
  const nextBoss = BOSS_TEMPLATES.find((b) => b.id === nextBossId);
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
    roomBossIds: c.roomBossIds,
  };
}

function overview() {
  const c = store.getClassroom();
  return {
    masterTokenPool: c.masterTokenPool,
    bossTemplateId: c.bossTemplateId,
    campaignLength: c.campaignLength,
    roomBossIds: c.roomBossIds,
    bosses: BOSS_TEMPLATES,
    teams: store.listTeams().map((t) => ({
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
      nextBoss: store.bossForRoom(t.roomIndex),
    })),
  };
}

// --- Health ---
app.get("/api/health", async () => ({
  ok: true,
  service: "dungeon-grades",
  elevenlabs: hasApiKey(),
}));

// --- Audio (ElevenLabs-generated, cached on disk) ---
app.get("/api/audio/manifest", async () => ({
  clips: listCachedClips(),
  elevenlabsConfigured: hasApiKey(),
}));

app.get<{ Params: { id: string } }>("/api/audio/:id", async (req, reply) => {
  const id = req.params.id.replace(/[^a-z0-9_]/gi, "");
  const file = clipPath(id);
  if (!fs.existsSync(file)) {
    // Lazy-generate if key present
    if (hasApiKey()) {
      try {
        await ensureClip(id);
      } catch (e) {
        const err = new Error(
          e instanceof Error ? e.message : "Audio generate failed",
        ) as Error & { statusCode: number };
        err.statusCode = 502;
        throw err;
      }
    } else {
      const err = new Error("Clip not found") as Error & { statusCode: number };
      err.statusCode = 404;
      throw err;
    }
  }
  const buf = fs.readFileSync(file);
  return reply
    .header("Content-Type", "audio/mpeg")
    .header("Cache-Control", "public, max-age=86400")
    .send(buf);
});

app.get("/api/audio/status", async () => probePermissions());

app.post<{ Body: { pin: string; force?: boolean } }>(
  "/api/teacher/audio/generate",
  async (req) => {
    requireTeacher(req.body?.pin);
    if (!hasApiKey()) {
      const err = new Error("ELEVENLABS_API_KEY not configured") as Error & {
        statusCode: number;
      };
      err.statusCode = 503;
      throw err;
    }
    const results = await ensureAllClips(Boolean(req.body?.force));
    return { results, cacheDir: audioCacheDir() };
  },
);

// --- Teacher ---
app.get("/api/teacher/overview", async (req) => {
  const q = req.query as { pin?: string };
  requireTeacher(q.pin);
  return overview();
});

app.post<{ Body: { pin: string; grades: string | Grade[] } }>(
  "/api/teacher/grades",
  async (req) => {
    requireTeacher(req.body.pin);
    const grades = Array.isArray(req.body.grades)
      ? req.body.grades
      : parseGradeList(String(req.body.grades ?? ""));
    if (!grades.length) {
      const err = new Error("No valid grades (A–F) found") as Error & {
        statusCode: number;
      };
      err.statusCode = 400;
      throw err;
    }
    store.setMasterPool(grades);
    io.to("teacher").emit("teacher:overview", overview());
    return { count: grades.length, grades };
  },
);

app.post<{ Body: { pin: string; bossTemplateId: string } }>(
  "/api/teacher/boss",
  async (req) => {
    requireTeacher(req.body.pin);
    const id = req.body.bossTemplateId;
    if (!BOSS_TEMPLATES.some((b) => b.id === id)) {
      const err = new Error("Unknown boss") as Error & { statusCode: number };
      err.statusCode = 400;
      throw err;
    }
    store.setBoss(id);
    io.to("teacher").emit("teacher:overview", overview());
    return { bossTemplateId: id };
  },
);

app.post<{
  Body: { pin: string; campaignLength?: number; roomBossIds?: string[] };
}>("/api/teacher/campaign", async (req) => {
  requireTeacher(req.body.pin);
  if (req.body.roomBossIds) {
    for (const id of req.body.roomBossIds) {
      if (!BOSS_TEMPLATES.some((b) => b.id === id)) {
        const err = new Error(`Unknown boss: ${id}`) as Error & {
          statusCode: number;
        };
        err.statusCode = 400;
        throw err;
      }
    }
  }
  const classroom = store.setCampaign({
    campaignLength: req.body.campaignLength,
    roomBossIds: req.body.roomBossIds,
  });
  io.to("teacher").emit("teacher:overview", overview());
  return classroom;
});

app.post<{ Body: { pin: string; name?: string } }>("/api/teacher/teams", async (req) => {
  requireTeacher(req.body.pin);
  const team = store.createTeam(req.body.name ?? "");
  io.to("teacher").emit("teacher:overview", overview());
  return enrich(team);
});

app.post<{ Body: { pin: string }; Params: { id: string } }>(
  "/api/teacher/teams/:id/reset",
  async (req) => {
    requireTeacher(req.body.pin);
    const team = store.resetTeam(req.params.id);
    broadcastTeam(team.teamId);
    return enrich(team);
  },
);

app.post<{ Body: { pin: string }; Params: { id: string } }>(
  "/api/teacher/teams/:id/force-round",
  async (req) => {
    requireTeacher(req.body.pin);
    const team = store.getTeam(req.params.id);
    if (!team) {
      const err = new Error("Team not found") as Error & { statusCode: number };
      err.statusCode = 404;
      throw err;
    }
    // Teacher force: run full round (party + boss) without client telegraph pause
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

app.post<{ Body: { pin: string }; Params: { id: string } }>(
  "/api/teacher/teams/:id/start-fight",
  async (req) => {
    requireTeacher(req.body.pin);
    const team = store.getTeam(req.params.id);
    if (!team) {
      const err = new Error("Team not found") as Error & { statusCode: number };
      err.statusCode = 404;
      throw err;
    }
    const c = store.getClassroom();
    if (!c.masterTokenPool.length) {
      const err = new Error("Generate a token pool first") as Error & {
        statusCode: number;
      };
      err.statusCode = 400;
      throw err;
    }
    const bossId = store.bossForRoom(team.roomIndex);
    startFight(team, bossId, c.masterTokenPool);
    store.updateTeam(team);
    broadcastTeam(team.teamId);
    return enrich(team);
  },
);

// --- Student / Team ---
app.post<{ Body: { code: string } }>("/api/join", async (req) => {
  const team = store.getTeamByCode(req.body.code ?? "");
  if (!team) {
    const err = new Error("Invalid invite code") as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }
  return enrich(team);
});

app.get<{ Params: { id: string } }>("/api/team/:id", async (req) => {
  const team = store.getTeam(req.params.id);
  if (!team) {
    const err = new Error("Team not found") as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }
  return enrich(team);
});

app.post<{ Body: { soldierIds: string[] }; Params: { id: string } }>(
  "/api/team/:id/roster",
  async (req) => {
    const team = store.getTeam(req.params.id);
    if (!team) {
      const err = new Error("Team not found") as Error & { statusCode: number };
      err.statusCode = 404;
      throw err;
    }
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
    if (!team) {
      const err = new Error("Team not found") as Error & { statusCode: number };
      err.statusCode = 404;
      throw err;
    }
    placeMagnet(team, req.body.position as Position);
    store.updateTeam(team);
    broadcastTeam(team.teamId);
    return enrich(team);
  },
);

app.post<{ Params: { id: string } }>("/api/team/:id/commit-round", async (req) => {
  const team = store.getTeam(req.params.id);
  if (!team) {
    const err = new Error("Team not found") as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }
  commitRound(team);
  store.updateTeam(team);
  broadcastTeam(team.teamId);
  return enrich(team);
});

app.post<{ Params: { id: string } }>("/api/team/:id/resolve-boss", async (req) => {
  const team = store.getTeam(req.params.id);
  if (!team) {
    const err = new Error("Team not found") as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }
  resolveBoss(team);
  store.updateTeam(team);
  broadcastTeam(team.teamId);
  return enrich(team);
});

app.post<{ Params: { id: string } }>("/api/team/:id/start-fight", async (req) => {
  const team = store.getTeam(req.params.id);
  if (!team) {
    const err = new Error("Team not found") as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }
  const c = store.getClassroom();
  if (!c.masterTokenPool.length) {
    const err = new Error("Teacher has not generated a token pool") as Error & {
      statusCode: number;
    };
    err.statusCode = 400;
    throw err;
  }
  const bossId = store.bossForRoom(team.roomIndex);
  startFight(team, bossId, c.masterTokenPool);
  store.updateTeam(team);
  broadcastTeam(team.teamId);
  return enrich(team);
});

app.post<{ Params: { id: string } }>("/api/team/:id/continue", async (req) => {
  const team = store.getTeam(req.params.id);
  if (!team) {
    const err = new Error("Team not found") as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }
  const c = store.getClassroom();
  enterBetweenRooms(team, c.campaignLength);
  store.updateTeam(team);
  broadcastTeam(team.teamId);
  return enrich(team);
});

const io = new SocketServer({
  cors: { origin: true },
});

io.on("connection", (socket) => {
  socket.on("subscribe:team", (teamId: string) => {
    socket.join(`team:${teamId}`);
    const team = store.getTeam(teamId);
    if (team) socket.emit("team:state", enrich(team));
  });
  socket.on("subscribe:teacher", (pin: string) => {
    if (pin !== TEACHER_PIN) return;
    socket.join("teacher");
    socket.emit("teacher:overview", overview());
  });
});

app.setErrorHandler((error, _req, reply) => {
  const err = error as Error & { statusCode?: number };
  const status = err.statusCode ?? 500;
  reply.status(status).send({ error: err.message ?? "Internal error" });
});

await app.ready();
io.attach(app.server);

await app.listen({ port: PORT, host: HOST });
console.log(`Dungeon Grades server on http://${HOST}:${PORT}`);
console.log(`Teacher PIN: ${TEACHER_PIN}`);
