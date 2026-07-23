import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_CAMPAIGN_LENGTH,
  DEFAULT_ROOM_BOSSES,
  type ClassroomState,
  type Grade,
  type TeamState,
} from "@dungeon-grades/shared";
import { createTeam } from "../engine/combat.js";

const DATA_DIR = path.resolve(process.cwd(), "data");
const CLASSROOM_PATH = path.join(DATA_DIR, "classroom.json");
const TEAMS_DIR = path.join(DATA_DIR, "teams");

function defaultClassroom(): ClassroomState {
  return {
    masterTokenPool: [],
    bossTemplateId: "bone_colossus",
    teamIds: [],
    campaignLength: DEFAULT_CAMPAIGN_LENGTH,
    roomBossIds: [...DEFAULT_ROOM_BOSSES],
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

function normalizeClassroom(raw: Partial<ClassroomState>): ClassroomState {
  const base = defaultClassroom();
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
  return {
    ...base,
    ...raw,
    campaignLength,
    roomBossIds,
    masterTokenPool: Array.isArray(raw.masterTokenPool) ? raw.masterTokenPool : [],
    teamIds: Array.isArray(raw.teamIds) ? raw.teamIds : [],
  };
}

/**
 * File-backed store (JSON). No native SQLite binding required — works on any Node.
 * Durable enough for a classroom LAN server; easy to inspect/reset.
 */
export class GameStore {
  private teams = new Map<string, TeamState>();
  private classroom: ClassroomState = defaultClassroom();

  constructor() {
    fs.mkdirSync(TEAMS_DIR, { recursive: true });
    this.loadAll();
  }

  private loadAll(): void {
    if (fs.existsSync(CLASSROOM_PATH)) {
      try {
        const raw = JSON.parse(
          fs.readFileSync(CLASSROOM_PATH, "utf8"),
        ) as Partial<ClassroomState>;
        this.classroom = normalizeClassroom(raw);
      } catch {
        /* keep defaults */
      }
    }
    if (!fs.existsSync(TEAMS_DIR)) return;
    for (const file of fs.readdirSync(TEAMS_DIR)) {
      if (!file.endsWith(".json")) continue;
      try {
        const state = JSON.parse(
          fs.readFileSync(path.join(TEAMS_DIR, file), "utf8"),
        ) as TeamState;
        // Backfill fields added after early saves
        if (!Array.isArray(state.playback)) state.playback = [];
        if (!Array.isArray(state.lastClaims)) state.lastClaims = [];
        if (!Array.isArray(state.pendingTokens)) state.pendingTokens = [];
        this.teams.set(state.teamId, state);
      } catch {
        /* skip corrupt */
      }
    }
  }

  private saveClassroom(): void {
    fs.writeFileSync(CLASSROOM_PATH, JSON.stringify(this.classroom, null, 2));
  }

  private saveTeam(team: TeamState): void {
    fs.writeFileSync(
      path.join(TEAMS_DIR, `${team.teamId}.json`),
      JSON.stringify(team, null, 2),
    );
  }

  getClassroom(): ClassroomState {
    return this.classroom;
  }

  setMasterPool(grades: Grade[]): void {
    this.classroom.masterTokenPool = [...grades];
    this.saveClassroom();
  }

  setBoss(bossTemplateId: string): void {
    this.classroom.bossTemplateId = bossTemplateId;
    this.saveClassroom();
  }

  setCampaign(opts: {
    campaignLength?: number;
    roomBossIds?: string[];
  }): ClassroomState {
    if (opts.campaignLength != null) {
      this.classroom.campaignLength = Math.max(
        1,
        Math.min(10, Math.floor(opts.campaignLength)),
      );
    }
    if (opts.roomBossIds) {
      this.classroom.roomBossIds = [...opts.roomBossIds];
    }
    // Pad with default ladder (not always Colossus); trim to length
    this.classroom.roomBossIds = padRoomBosses(
      this.classroom.roomBossIds,
      this.classroom.campaignLength,
    );
    this.saveClassroom();
    return this.classroom;
  }

  /** Reset to the shipped 6-room default path. */
  resetDefaultCampaign(): ClassroomState {
    this.classroom.campaignLength = DEFAULT_CAMPAIGN_LENGTH;
    this.classroom.roomBossIds = [...DEFAULT_ROOM_BOSSES];
    this.saveClassroom();
    return this.classroom;
  }

  /** Boss for the room a team is about to fight (roomsCleared = roomIndex). */
  bossForRoom(roomsCleared: number): string {
    const c = this.classroom;
    const fromSeq = c.roomBossIds[roomsCleared];
    return fromSeq || c.bossTemplateId || "bone_colossus";
  }

  listTeams(): TeamState[] {
    return [...this.teams.values()];
  }

  getTeam(id: string): TeamState | undefined {
    return this.teams.get(id);
  }

  getTeamByCode(code: string): TeamState | undefined {
    const normalized = code.trim().toUpperCase();
    return [...this.teams.values()].find((t) => t.inviteCode === normalized);
  }

  createTeam(name: string): TeamState {
    const teamId = `team_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const inviteCode = generateCode();
    const team = createTeam(teamId, inviteCode, name || `Team ${this.teams.size + 1}`);
    this.teams.set(teamId, team);
    if (!this.classroom.teamIds.includes(teamId)) {
      this.classroom.teamIds.push(teamId);
    }
    this.saveTeam(team);
    this.saveClassroom();
    return team;
  }

  updateTeam(team: TeamState): void {
    this.teams.set(team.teamId, team);
    this.saveTeam(team);
  }

  resetTeam(teamId: string): TeamState {
    const old = this.teams.get(teamId);
    if (!old) throw new Error("Team not found");
    const team = createTeam(teamId, old.inviteCode, old.name);
    this.teams.set(teamId, team);
    this.saveTeam(team);
    return team;
  }

  deleteTeam(teamId: string): void {
    this.teams.delete(teamId);
    this.classroom.teamIds = this.classroom.teamIds.filter((id) => id !== teamId);
    const file = path.join(TEAMS_DIR, `${teamId}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
    this.saveClassroom();
  }
}

function generateCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}
