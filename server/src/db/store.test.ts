import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalizeClassroom } from "./store.js";

describe("normalizeClassroom", () => {
  it("migrates legacy masterTokenPool into room 0 and opens it", () => {
    const c = normalizeClassroom(
      {
        masterTokenPool: ["A", "B", "C"],
        teamIds: ["t1"],
        campaignLength: 6,
      },
      "cls_test",
    );
    expect(c.classroomId).toBe("cls_test");
    expect(c.rooms).toHaveLength(6);
    expect(c.rooms[0].tokenPool).toEqual(["A", "B", "C"]);
    expect(c.rooms[0].open).toBe(true);
    expect(c.rooms[1].open).toBe(false);
    expect(c.rooms[1].tokenPool).toEqual([]);
  });

  it("does not auto-open empty rooms", () => {
    const c = normalizeClassroom({ name: "Period 1" }, "cls_p1");
    expect(c.name).toBe("Period 1");
    expect(c.rooms.every((r) => !r.open && r.tokenPool.length === 0)).toBe(
      true,
    );
  });

  it("preserves explicit rooms over legacy pool when room 0 already has grades", () => {
    const c = normalizeClassroom(
      {
        masterTokenPool: ["F", "F"],
        rooms: [
          { tokenPool: ["A"], open: false },
          { tokenPool: [], open: false },
        ],
        campaignLength: 2,
      },
      "cls_x",
    );
    expect(c.rooms[0].tokenPool).toEqual(["A"]);
    expect(c.rooms[0].open).toBe(false);
  });
});

describe("GameStore multi-classroom", () => {
  let prevCwd: string;
  let tmp: string;

  beforeEach(() => {
    prevCwd = process.cwd();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dg-store-"));
    process.chdir(tmp);
  });

  afterEach(() => {
    process.chdir(prevCwd);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("creates independent classrooms with room grades and open gates", async () => {
    // Dynamic import after chdir so DATA_DIR resolves under tmp
    const { GameStore } = await import("./store.js");
    const store = new GameStore();

    const p1 = store.createClassroom("Period 1");
    const p3 = store.createClassroom("Period 3");
    expect(store.listClassroomSummaries()).toHaveLength(2);

    store.setRoomGrades(p1.classroomId, 0, ["A", "B", "C"]);
    store.setRoomOpen(p1.classroomId, 0, true);

    expect(() => store.setRoomOpen(p3.classroomId, 0, true)).toThrow(
      /grades/i,
    );

    const t1 = store.createTeam(p1.classroomId, "Table A");
    const t3 = store.createTeam(p3.classroomId, "Table A");
    expect(t1.classroomId).toBe(p1.classroomId);
    expect(t3.classroomId).toBe(p3.classroomId);
    expect(t1.inviteCode).not.toBe(t3.inviteCode);
    expect(t1.roster).toHaveLength(23);
    expect(
      t1.roster
        .filter((soldier) => soldier.archetype === "Lifebinder")
        .map((soldier) => soldier.name),
    ).toEqual(["Rowan", "Briar"]);

    const slot1 = store.roomSlotForTeam(t1);
    expect(slot1?.open).toBe(true);
    expect(slot1?.tokenPool).toEqual(["A", "B", "C"]);

    const slot3 = store.roomSlotForTeam(t3);
    expect(slot3?.open).toBe(false);

    store.setPaused(p1.classroomId, true);
    expect(store.isTeamPaused(t1)).toBe(true);
    expect(store.isTeamPaused(t3)).toBe(false);
  });

  it("migrates legacy classroom.json on load", async () => {
    const dataDir = path.join(tmp, "data");
    fs.mkdirSync(path.join(dataDir, "teams"), { recursive: true });
    fs.writeFileSync(
      path.join(dataDir, "classroom.json"),
      JSON.stringify({
        masterTokenPool: ["A", "A", "B"],
        bossTemplateId: "moss_grub",
        teamIds: ["team_legacy"],
        campaignLength: 6,
        roomBossIds: [
          "moss_grub",
          "ash_wraith",
          "cinder_herald",
          "rattle_captain",
          "barrow_warden",
          "bone_colossus",
        ],
        paused: false,
      }),
    );
    fs.writeFileSync(
      path.join(dataDir, "teams", "team_legacy.json"),
      JSON.stringify({
        teamId: "team_legacy",
        inviteCode: "ABC12",
        name: "Legacy",
        roster: [
          {
            id: "runesinger_1",
            name: "Glyph",
            archetype: "Runesinger",
            maxHp: 40,
            currentHp: 40,
            position: null,
            statuses: [{ kind: "LifePower", bonus: 6 }],
            alive: true,
            block: 0,
          },
        ],
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
        roomIndex: 2,
        partyDamageBonus: 0,

        rngSeed: 1,
      }),
    );

    const { GameStore } = await import("./store.js");
    const store = new GameStore();
    const list = store.listClassroomSummaries();
    expect(list.length).toBe(1);
    const team = store.getTeam("team_legacy");
    expect(team?.classroomId).toBeTruthy();
    expect(team?.scoring.campaignRank).toBe(2);
    expect(team?.scoring.preservationRank).toBe(0);
    expect(team?.scoring.tempoRank).toBe(0);
    expect(team?.scoring.rooms).toHaveLength(2);
    expect(team?.items).toEqual({
      version: 1,
      catalogVersion: 1,
      pendingReward: null,
      rooms: [],
    });
    expect(team?.roster[0]?.relic).toBeNull();
    expect(team?.roster[0]?.statuses).toEqual([]);
    const c = store.getClassroom(team!.classroomId);
    expect(c?.rooms[0].tokenPool).toEqual(["A", "A", "B"]);
    expect(c?.rooms[0].open).toBe(true);
    expect(fs.existsSync(path.join(dataDir, "classrooms"))).toBe(true);
  });
});
