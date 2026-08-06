import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_CAMPAIGN_LENGTH,
  DEFAULT_ROOM_BOSSES,
  createEmptyItemState,
  createEmptyScoringState,
  clampScoreRank,
  type ClassroomRoomSlot,
  type ClassroomState,
  type ClassroomSummary,
  type Grade,
  type TeamState,
} from "@dungeon-grades/shared";
import { createTeam } from "../engine/combat.js";

/** Resolve under cwd at call time (tests chdir into temp dirs). */
function dataPaths() {
  const DATA_DIR = path.resolve(process.cwd(), "data");
  return {
    DATA_DIR,
    CLASSROOMS_DIR: path.join(DATA_DIR, "classrooms"),
    TEAMS_DIR: path.join(DATA_DIR, "teams"),
    /** Pre-multi-classroom single file — migrated once on load. */
    LEGACY_CLASSROOM_PATH: path.join(DATA_DIR, "classroom.json"),
  };
}

function padRoomBosses(ids: string[], length: number): string[] {
  const out = [...ids];
  while (out.length < length) {
    const i = out.length;
    out.push(DEFAULT_ROOM_BOSSES[i] ?? "bone_colossus");
  }
  return out.slice(0, length);
}

function padRooms(
  rooms: ClassroomRoomSlot[] | undefined,
  length: number,
): ClassroomRoomSlot[] {
  const out: ClassroomRoomSlot[] = [];
  for (let i = 0; i < length; i++) {
    const r = rooms?.[i];
    out.push({
      tokenPool: Array.isArray(r?.tokenPool) ? [...r.tokenPool] : [],
      open: Boolean(r?.open),
    });
  }
  return out;
}

function newClassroomId(): string {
  return `cls_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function defaultClassroom(
  name = "Classroom",
  classroomId = newClassroomId(),
): ClassroomState {
  const campaignLength = DEFAULT_CAMPAIGN_LENGTH;
  return {
    classroomId,
    name,
    bossTemplateId: "bone_colossus",
    teamIds: [],
    campaignLength,
    roomBossIds: [...DEFAULT_ROOM_BOSSES],
    paused: false,
    rooms: padRooms([], campaignLength),
  };
}

/**
 * Normalize raw JSON into a multi-classroom ClassroomState.
 * Accepts legacy single-classroom files (no classroomId / rooms).
 */
export function normalizeClassroom(
  raw: Partial<ClassroomState> & { masterTokenPool?: Grade[] },
  fallbackId?: string,
): ClassroomState {
  const base = defaultClassroom(
    typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : "Classroom",
    typeof raw.classroomId === "string" && raw.classroomId
      ? raw.classroomId
      : fallbackId ?? newClassroomId(),
  );
  const campaignLength = Math.max(
    1,
    Math.min(10, Number(raw.campaignLength) || base.campaignLength),
  );
  const roomBossIds = padRoomBosses(
    Array.isArray(raw.roomBossIds) && raw.roomBossIds.length
      ? raw.roomBossIds
      : [...base.roomBossIds],
    campaignLength,
  );

  let rooms = padRooms(
    Array.isArray(raw.rooms) ? raw.rooms : undefined,
    campaignLength,
  );

  // Legacy: single masterTokenPool → room 0 (open if non-empty so playtests keep working)
  const legacyPool = Array.isArray(raw.masterTokenPool) ? raw.masterTokenPool : [];
  if (legacyPool.length > 0 && rooms[0] && rooms[0].tokenPool.length === 0) {
    rooms = padRooms(rooms, campaignLength);
    rooms[0] = { tokenPool: [...legacyPool], open: true };
  }

  return {
    classroomId: base.classroomId,
    name: base.name,
    bossTemplateId:
      raw.bossTemplateId === undefined
        ? base.bossTemplateId
        : raw.bossTemplateId,
    teamIds: Array.isArray(raw.teamIds) ? [...raw.teamIds] : [],
    campaignLength,
    roomBossIds,
    paused: Boolean(raw.paused),
    rooms,
  };
}

function generateCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

/**
 * File-backed multi-classroom store (JSON).
 * Durable enough for a classroom LAN server; easy to inspect/reset.
 */
export class GameStore {
  private teams = new Map<string, TeamState>();
  private classrooms = new Map<string, ClassroomState>();
  private readonly paths = dataPaths();

  constructor() {
    fs.mkdirSync(this.paths.CLASSROOMS_DIR, { recursive: true });
    fs.mkdirSync(this.paths.TEAMS_DIR, { recursive: true });
    this.loadAll();
  }

  private loadAll(): void {
    const { TEAMS_DIR, CLASSROOMS_DIR, LEGACY_CLASSROOM_PATH } = this.paths;

    // Teams first so migration can attach classroomId
    if (fs.existsSync(TEAMS_DIR)) {
      for (const file of fs.readdirSync(TEAMS_DIR)) {
        if (!file.endsWith(".json")) continue;
        try {
          const state = JSON.parse(
            fs.readFileSync(path.join(TEAMS_DIR, file), "utf8"),
          ) as TeamState;
          this.backfillTeam(state);
          this.teams.set(state.teamId, state);
        } catch {
          /* skip corrupt */
        }
      }
    }

    const classroomFiles = fs.existsSync(CLASSROOMS_DIR)
      ? fs.readdirSync(CLASSROOMS_DIR).filter((f) => f.endsWith(".json"))
      : [];

    if (classroomFiles.length > 0) {
      for (const file of classroomFiles) {
        try {
          const raw = JSON.parse(
            fs.readFileSync(path.join(CLASSROOMS_DIR, file), "utf8"),
          ) as Partial<ClassroomState>;
          const c = normalizeClassroom(raw);
          this.classrooms.set(c.classroomId, c);
        } catch {
          /* skip corrupt */
        }
      }
      this.reconcileTeamClassroomLinks();
      return;
    }

    // Migrate legacy single classroom.json
    if (fs.existsSync(LEGACY_CLASSROOM_PATH)) {
      try {
        const raw = JSON.parse(
          fs.readFileSync(LEGACY_CLASSROOM_PATH, "utf8"),
        ) as Partial<ClassroomState> & { masterTokenPool?: Grade[] };
        const c = normalizeClassroom(
          { ...raw, name: raw.name ?? "Classroom" },
          "cls_migrated",
        );
        // All teams without classroomId belong here
        const teamIds = new Set(c.teamIds);
        for (const t of this.teams.values()) {
          if (!t.classroomId || t.classroomId === c.classroomId) {
            t.classroomId = c.classroomId;
            teamIds.add(t.teamId);
            this.saveTeam(t);
          }
        }
        c.teamIds = [...teamIds];
        this.classrooms.set(c.classroomId, c);
        this.saveClassroom(c);
        return;
      } catch {
        /* fall through to empty */
      }
    }

    this.reconcileTeamClassroomLinks();
  }

  private backfillTeam(state: TeamState): void {
    if (!Array.isArray(state.playback)) state.playback = [];
    if (!Array.isArray(state.lastClaims)) state.lastClaims = [];
    if (!Array.isArray(state.pendingTokens)) state.pendingTokens = [];
    if (typeof state.classroomId !== "string") state.classroomId = "";
    for (const soldier of state.roster ?? []) {
      if (soldier.relic === undefined) soldier.relic = null;
      if (soldier.archetype === "Runesinger") {
        soldier.statuses = (soldier.statuses ?? []).filter(
          (status) => status.kind !== "LifePower",
        );
      }
    }
    if (!state.items || state.items.version !== 1) {
      state.items = createEmptyItemState();
    } else {
      if (!Array.isArray(state.items.rooms)) state.items.rooms = [];
      if (state.items.pendingReward === undefined) state.items.pendingReward = null;
    }
    if (state.boss?.id !== "bone_colossus") state.boneColossus = null;
    if (!state.scoring || state.scoring.version !== 1) {
      const scoring = createEmptyScoringState();
      const cleared = clampScoreRank(Number(state.roomIndex) || 0);
      scoring.campaignRank = cleared;
      for (let roomIndex = 0; roomIndex < cleared; roomIndex++) {
        scoring.rooms.push({
          roomIndex,
          bossId: DEFAULT_ROOM_BOSSES[roomIndex] ?? `legacy_room_${roomIndex + 1}`,
          firstEntryLivingIds: [],
          attempts: [],
          cleared: true,
          permanentLossOccurred: false,
          campaignAwarded: true,
          preservationAwarded: false,
          tempoAwarded: false,
          victoryRound: null,
          tempoRoundLimit: null,
        });
      }
      state.scoring = scoring;
    } else {
      state.scoring.campaignRank = clampScoreRank(state.scoring.campaignRank);
      state.scoring.preservationRank = clampScoreRank(
        state.scoring.preservationRank,
      );
      state.scoring.tempoRank = clampScoreRank(state.scoring.tempoRank);
      if (!Array.isArray(state.scoring.rooms)) state.scoring.rooms = [];
    }
    if (state.lastScoreAwards === undefined) state.lastScoreAwards = null;
  }

  /** Ensure teamIds arrays match teams.classroomId. */
  private reconcileTeamClassroomLinks(): void {
    for (const c of this.classrooms.values()) {
      c.teamIds = c.teamIds.filter((id) => {
        const t = this.teams.get(id);
        return t && t.classroomId === c.classroomId;
      });
    }
    for (const t of this.teams.values()) {
      if (!t.classroomId) continue;
      const c = this.classrooms.get(t.classroomId);
      if (c && !c.teamIds.includes(t.teamId)) {
        c.teamIds.push(t.teamId);
        this.saveClassroom(c);
      }
    }
  }

  private saveClassroom(c: ClassroomState): void {
    fs.writeFileSync(
      path.join(this.paths.CLASSROOMS_DIR, `${c.classroomId}.json`),
      JSON.stringify(c, null, 2),
    );
  }

  private saveTeam(team: TeamState): void {
    fs.writeFileSync(
      path.join(this.paths.TEAMS_DIR, `${team.teamId}.json`),
      JSON.stringify(team, null, 2),
    );
  }

  // --- Classrooms ---

  listClassroomSummaries(): ClassroomSummary[] {
    return [...this.classrooms.values()]
      .map((c) => ({
        classroomId: c.classroomId,
        name: c.name,
        teamCount: c.teamIds.filter((id) => this.teams.has(id)).length,
        paused: Boolean(c.paused),
        campaignLength: c.campaignLength,
        openRoomCount: c.rooms.filter((r) => r.open).length,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  getClassroom(classroomId: string): ClassroomState | undefined {
    return this.classrooms.get(classroomId);
  }

  /** Classroom owning a team (by classroomId, then teamIds back-link). */
  getClassroomForTeam(team: TeamState): ClassroomState | undefined {
    if (team.classroomId) {
      const c = this.classrooms.get(team.classroomId);
      if (c) return c;
    }
    for (const c of this.classrooms.values()) {
      if (c.teamIds.includes(team.teamId)) {
        if (!team.classroomId) {
          team.classroomId = c.classroomId;
          this.saveTeam(team);
        }
        return c;
      }
    }
    return undefined;
  }

  createClassroom(name: string): ClassroomState {
    const trimmed = name.trim() || `Period ${this.classrooms.size + 1}`;
    const c = defaultClassroom(trimmed);
    this.classrooms.set(c.classroomId, c);
    this.saveClassroom(c);
    return c;
  }

  renameClassroom(classroomId: string, name: string): ClassroomState {
    const c = this.requireClassroom(classroomId);
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Classroom name required");
    c.name = trimmed;
    this.saveClassroom(c);
    return c;
  }

  /**
   * Delete classroom and all of its teams.
   */
  deleteClassroom(classroomId: string): void {
    const c = this.requireClassroom(classroomId);
    for (const teamId of [...c.teamIds]) {
      this.deleteTeam(teamId);
    }
    this.classrooms.delete(classroomId);
    const file = path.join(this.paths.CLASSROOMS_DIR, `${classroomId}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }

  private requireClassroom(classroomId: string): ClassroomState {
    const c = this.classrooms.get(classroomId);
    if (!c) throw new Error("Classroom not found");
    return c;
  }

  setRoomGrades(
    classroomId: string,
    roomIndex: number,
    grades: Grade[],
  ): ClassroomState {
    const c = this.requireClassroom(classroomId);
    if (roomIndex < 0 || roomIndex >= c.campaignLength) {
      throw new Error(`Invalid room index ${roomIndex}`);
    }
    c.rooms = padRooms(c.rooms, c.campaignLength);
    c.rooms[roomIndex] = {
      tokenPool: [...grades],
      // Setting grades does not auto-open; keep existing open flag
      open: c.rooms[roomIndex]?.open ?? false,
    };
    // If pool emptied while open, force closed
    if (c.rooms[roomIndex].tokenPool.length === 0) {
      c.rooms[roomIndex].open = false;
    }
    this.saveClassroom(c);
    return c;
  }

  setRoomOpen(
    classroomId: string,
    roomIndex: number,
    open: boolean,
  ): ClassroomState {
    const c = this.requireClassroom(classroomId);
    if (roomIndex < 0 || roomIndex >= c.campaignLength) {
      throw new Error(`Invalid room index ${roomIndex}`);
    }
    c.rooms = padRooms(c.rooms, c.campaignLength);
    if (open && c.rooms[roomIndex].tokenPool.length === 0) {
      throw new Error("Enter grades for this room before opening it");
    }
    c.rooms[roomIndex] = {
      ...c.rooms[roomIndex],
      open,
    };
    this.saveClassroom(c);
    return c;
  }

  /** Grades + open gate for the room a team is about to fight. */
  roomSlotForTeam(team: TeamState): ClassroomRoomSlot | null {
    const c = this.getClassroomForTeam(team);
    if (!c) return null;
    const idx = team.roomIndex;
    if (idx < 0 || idx >= c.campaignLength) return null;
    const rooms = padRooms(c.rooms, c.campaignLength);
    return rooms[idx] ?? null;
  }

  setBoss(classroomId: string, bossTemplateId: string): ClassroomState {
    const c = this.requireClassroom(classroomId);
    c.bossTemplateId = bossTemplateId;
    this.saveClassroom(c);
    return c;
  }

  setCampaign(
    classroomId: string,
    opts: { campaignLength?: number; roomBossIds?: string[] },
  ): ClassroomState {
    const c = this.requireClassroom(classroomId);
    if (opts.campaignLength != null) {
      c.campaignLength = Math.max(
        1,
        Math.min(10, Math.floor(opts.campaignLength)),
      );
    }
    if (opts.roomBossIds) {
      c.roomBossIds = [...opts.roomBossIds];
    }
    c.roomBossIds = padRoomBosses(c.roomBossIds, c.campaignLength);
    c.rooms = padRooms(c.rooms, c.campaignLength);
    this.saveClassroom(c);
    return c;
  }

  resetDefaultCampaign(classroomId: string): ClassroomState {
    const c = this.requireClassroom(classroomId);
    c.campaignLength = DEFAULT_CAMPAIGN_LENGTH;
    c.roomBossIds = [...DEFAULT_ROOM_BOSSES];
    c.rooms = padRooms(c.rooms, c.campaignLength);
    this.saveClassroom(c);
    return c;
  }

  /** Boss for the room a team is about to fight (roomsCleared = roomIndex). */
  bossForRoom(classroom: ClassroomState, roomsCleared: number): string {
    const fromSeq = classroom.roomBossIds[roomsCleared];
    return fromSeq || classroom.bossTemplateId || "bone_colossus";
  }

  setPaused(classroomId: string, paused: boolean): ClassroomState {
    const c = this.requireClassroom(classroomId);
    c.paused = paused;
    this.saveClassroom(c);
    return c;
  }

  isClassroomPaused(classroomId: string): boolean {
    const c = this.classrooms.get(classroomId);
    return Boolean(c?.paused);
  }

  isTeamPaused(team: TeamState): boolean {
    const c = this.getClassroomForTeam(team);
    return Boolean(c?.paused);
  }

  // --- Teams ---

  listTeams(classroomId?: string): TeamState[] {
    if (!classroomId) return [...this.teams.values()];
    const c = this.classrooms.get(classroomId);
    if (!c) return [];
    return c.teamIds
      .map((id) => this.teams.get(id))
      .filter((t): t is TeamState => Boolean(t));
  }

  getTeam(id: string): TeamState | undefined {
    return this.teams.get(id);
  }

  getTeamByCode(code: string): TeamState | undefined {
    const normalized = code.trim().toUpperCase();
    return [...this.teams.values()].find((t) => t.inviteCode === normalized);
  }

  createTeam(classroomId: string, name: string): TeamState {
    const c = this.requireClassroom(classroomId);
    const teamId = `team_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const inviteCode = this.uniqueCode();
    const teamName =
      name.trim() || `Team ${c.teamIds.length + 1}`;
    const team = createTeam(
      teamId,
      inviteCode,
      teamName,
      Date.now() % 1_000_000,
      classroomId,
    );
    this.teams.set(teamId, team);
    if (!c.teamIds.includes(teamId)) {
      c.teamIds.push(teamId);
    }
    this.saveTeam(team);
    this.saveClassroom(c);
    return team;
  }

  private uniqueCode(excludeTeamId?: string): string {
    let code = generateCode();
    for (let i = 0; i < 40; i++) {
      const clash = [...this.teams.values()].some(
        (t) => t.teamId !== excludeTeamId && t.inviteCode === code,
      );
      if (!clash) return code;
      code = generateCode();
    }
    return code;
  }

  updateTeam(team: TeamState): void {
    this.teams.set(team.teamId, team);
    this.saveTeam(team);
  }

  resetTeam(teamId: string): TeamState {
    const old = this.teams.get(teamId);
    if (!old) throw new Error("Team not found");
    const team = createTeam(
      teamId,
      old.inviteCode,
      old.name,
      Date.now() % 1_000_000,
      old.classroomId,
    );
    this.teams.set(teamId, team);
    this.saveTeam(team);
    return team;
  }

  regenerateInviteCode(teamId: string): TeamState {
    const team = this.teams.get(teamId);
    if (!team) throw new Error("Team not found");
    team.inviteCode = this.uniqueCode(teamId);
    this.updateTeam(team);
    return team;
  }

  deleteTeam(teamId: string): void {
    const team = this.teams.get(teamId);
    this.teams.delete(teamId);
    if (team?.classroomId) {
      const c = this.classrooms.get(team.classroomId);
      if (c) {
        c.teamIds = c.teamIds.filter((id) => id !== teamId);
        this.saveClassroom(c);
      }
    } else {
      for (const c of this.classrooms.values()) {
        if (c.teamIds.includes(teamId)) {
          c.teamIds = c.teamIds.filter((id) => id !== teamId);
          this.saveClassroom(c);
        }
      }
    }
    const file = path.join(this.paths.TEAMS_DIR, `${teamId}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}
