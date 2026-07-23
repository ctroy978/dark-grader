import { useCallback, useEffect, useState } from "react";
import {
  api,
  getSocket,
  type ClassroomSummary,
  type Overview,
} from "../api";

function bossLabel(bossId: string, bosses: Overview["bosses"]): string {
  const b = bosses.find((x) => x.id === bossId);
  if (b) {
    return bossId === "barrow_warden" ? `${b.name} (placeholder)` : b.name;
  }
  return bossId
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function TeacherDashboard({ onBack }: { onBack: () => void }) {
  const [pin, setPin] = useState(
    () => sessionStorage.getItem("dg_teacher_pin") ?? "teacher",
  );
  const [authed, setAuthed] = useState(false);
  const [classrooms, setClassrooms] = useState<ClassroomSummary[]>([]);
  const [classroomId, setClassroomId] = useState<string | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [newClassroomName, setNewClassroomName] = useState("");
  const [newTeamName, setNewTeamName] = useState("");
  const [gradesByRoom, setGradesByRoom] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const refreshList = useCallback(async () => {
    const r = await api.listClassrooms(pin);
    setClassrooms(r.classrooms);
    setAuthed(true);
    sessionStorage.setItem("dg_teacher_pin", pin);
  }, [pin]);

  const refreshOverview = useCallback(async () => {
    if (!classroomId) return;
    const o = await api.teacherOverview(pin, classroomId);
    setOverview(o);
  }, [pin, classroomId]);

  useEffect(() => {
    if (!authed) return;
    const s = getSocket();
    s.emit("subscribe:teacher", pin);
    const onList = (list: ClassroomSummary[]) => setClassrooms(list);
    s.on("teacher:classrooms", onList);
    return () => {
      s.off("teacher:classrooms", onList);
    };
  }, [authed, pin]);

  useEffect(() => {
    if (!authed || !classroomId) return;
    const s = getSocket();
    s.emit("subscribe:classroom", { pin, classroomId });
    const onOverview = (o: Overview) => {
      if (o.classroomId === classroomId) setOverview(o);
    };
    s.on("teacher:overview", onOverview);
    void refreshOverview().catch((err: Error) => setError(err.message));
    return () => {
      s.off("teacher:overview", onOverview);
    };
  }, [authed, pin, classroomId, refreshOverview]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await refreshList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auth failed");
      setAuthed(false);
    }
  }

  async function createClassroom() {
    setError(null);
    setMsg(null);
    try {
      const o = await api.createClassroom(pin, newClassroomName);
      setNewClassroomName("");
      setMsg(`Created classroom “${o.name}”`);
      await refreshList();
      setClassroomId(o.classroomId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function openClassroom(id: string) {
    setError(null);
    setMsg(null);
    setClassroomId(id);
    setGradesByRoom({});
  }

  async function togglePause() {
    if (!classroomId || !overview) return;
    setError(null);
    setMsg(null);
    try {
      const next = !overview.paused;
      await api.setClassroomPaused(pin, classroomId, next);
      setMsg(
        next
          ? "Classroom paused — students cannot join or play"
          : "Classroom resumed — students can play",
      );
      await refreshOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function submitRoomGrades(roomIndex: number) {
    if (!classroomId) return;
    setError(null);
    setMsg(null);
    try {
      const text = gradesByRoom[roomIndex] ?? "";
      const r = await api.setRoomGrades(pin, classroomId, roomIndex, text);
      setMsg(
        `Room ${roomIndex + 1}: token pool set (${r.count} grades). Open the room when ready.`,
      );
      setOverview(r.classroom);
      // Show normalized grades as a horizontal comma list for easy proofreading
      setGradesByRoom((prev) => ({
        ...prev,
        [roomIndex]: r.grades.join(", "),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function toggleRoomOpen(roomIndex: number, open: boolean) {
    if (!classroomId) return;
    setError(null);
    setMsg(null);
    try {
      const o = await api.setRoomOpen(pin, classroomId, roomIndex, open);
      setOverview(o);
      setMsg(
        open
          ? `Room ${roomIndex + 1} is open — teams may enter`
          : `Room ${roomIndex + 1} closed`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function createTeam() {
    if (!classroomId) return;
    setError(null);
    setMsg(null);
    try {
      const t = await api.createTeam(pin, classroomId, newTeamName);
      setNewTeamName("");
      setMsg(`Created team “${t.name}” — invite code ${t.inviteCode}`);
      await refreshOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function changeCode(teamId: string, teamName: string) {
    if (!classroomId) return;
    setError(null);
    setMsg(null);
    try {
      const t = await api.changeInviteCode(pin, classroomId, teamId);
      setMsg(`${teamName}: new invite code ${t.inviteCode}`);
      await refreshOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function deleteClassroom() {
    if (!classroomId || !overview) return;
    const ok = window.confirm(
      `Delete classroom “${overview.name}” and ALL of its teams?\n\nThis cannot be undone.`,
    );
    if (!ok) return;
    const again = window.confirm(
      `Really delete “${overview.name}”? All invite codes and progress in this period will be removed.`,
    );
    if (!again) return;
    setError(null);
    try {
      await api.deleteClassroom(pin, classroomId);
      setMsg(`Deleted classroom ${overview.name}`);
      setClassroomId(null);
      setOverview(null);
      await refreshList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  if (!authed) {
    return (
      <div className="min-h-full flex items-center justify-center p-6">
        <form
          onSubmit={login}
          className="w-full max-w-sm rounded-xl border border-crimson/30 bg-navy-light p-6 space-y-4"
        >
          <h1 className="text-xl font-bold">
            <span className="text-grade-a">Grade</span>Forge · Teacher
          </h1>
          <p className="text-sm text-parchment-dim">
            Default PIN is <code className="text-rune">teacher</code> (set{" "}
            <code>TEACHER_PIN</code> on the server).
          </p>
          <input
            type="password"
            className="w-full rounded-lg bg-navy border border-parchment/20 px-3 py-2"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="PIN"
          />
          {error && <p className="text-grade-f text-sm">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onBack}
              className="flex-1 border border-parchment/20 rounded-lg py-2"
            >
              Back
            </button>
            <button
              type="submit"
              className="flex-1 bg-crimson rounded-lg py-2 font-semibold"
            >
              Enter
            </button>
          </div>
        </form>
      </div>
    );
  }

  // --- Classroom list ---
  if (!classroomId) {
    return (
      <div className="min-h-full p-4 md:p-6 max-w-3xl mx-auto space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Classrooms</h1>
            <p className="text-sm text-parchment-dim">
              One classroom per period. Grades and open rooms are independent.
            </p>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="text-sm border border-parchment/20 rounded-lg px-3 py-1.5"
          >
            Home
          </button>
        </header>

        {error && <p className="text-grade-f text-sm">{error}</p>}
        {msg && <p className="text-grade-a text-sm">{msg}</p>}

        <section className="rounded-xl border border-parchment/15 bg-navy-light/60 p-4 space-y-3">
          <h2 className="font-semibold">Create classroom</h2>
          <div className="flex flex-wrap gap-2">
            <input
              className="flex-1 min-w-[12rem] rounded-lg bg-navy border border-parchment/20 px-3 py-2"
              value={newClassroomName}
              onChange={(e) => setNewClassroomName(e.target.value)}
              placeholder="e.g. Period 1"
              onKeyDown={(e) => {
                if (e.key === "Enter") void createClassroom();
              }}
            />
            <button
              type="button"
              onClick={() => void createClassroom()}
              className="rounded-lg bg-crimson px-4 py-2 text-sm font-semibold"
            >
              Create
            </button>
          </div>
        </section>

        <section className="space-y-2">
          {classrooms.map((c) => (
            <button
              key={c.classroomId}
              type="button"
              onClick={() => void openClassroom(c.classroomId)}
              className="w-full text-left rounded-xl border border-parchment/15 bg-navy-light/50 p-4 hover:border-rune/50 transition"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-lg">{c.name}</span>
                {c.paused && (
                  <span className="text-xs font-semibold text-grade-f border border-grade-f/40 rounded px-2 py-0.5">
                    PAUSED
                  </span>
                )}
              </div>
              <p className="text-sm text-parchment-dim mt-1">
                {c.teamCount} team{c.teamCount === 1 ? "" : "s"} ·{" "}
                {c.campaignLength} rooms · {c.openRoomCount} open
              </p>
            </button>
          ))}
          {!classrooms.length && (
            <p className="text-parchment-dim text-sm py-6 text-center">
              No classrooms yet — create Period 1 to get started.
            </p>
          )}
        </section>
      </div>
    );
  }

  // --- Classroom dashboard ---
  return (
    <div className="min-h-full p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {overview?.name ?? "Classroom"}
          </h1>
          <p className="text-sm text-parchment-dim">
            Campaign: {overview?.campaignLength ?? "?"} rooms
            {overview?.paused ? (
              <span className="text-grade-f font-semibold"> · PAUSED</span>
            ) : null}
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <button
            type="button"
            onClick={() => void togglePause()}
            className={`text-sm rounded-lg px-3 py-1.5 font-semibold border ${
              overview?.paused
                ? "border-grade-a/50 bg-grade-a/20 text-grade-a"
                : "border-grade-f/50 bg-grade-f/15 text-grade-f"
            }`}
          >
            {overview?.paused ? "Resume classroom" : "Pause classroom"}
          </button>
          <button
            type="button"
            onClick={() => {
              setClassroomId(null);
              setOverview(null);
              setMsg(null);
              void refreshList();
            }}
            className="text-sm border border-parchment/20 rounded-lg px-3 py-1.5"
          >
            All classrooms
          </button>
          <button
            type="button"
            onClick={onBack}
            className="text-sm border border-parchment/20 rounded-lg px-3 py-1.5"
          >
            Home
          </button>
        </div>
      </header>

      {error && <p className="text-grade-f text-sm">{error}</p>}
      {msg && <p className="text-grade-a text-sm">{msg}</p>}

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Rooms — grades + open */}
        <section className="rounded-xl border border-parchment/15 bg-navy-light/60 p-4 space-y-4 lg:col-span-2">
          <div>
            <h2 className="font-semibold text-lg">Rooms — grades &amp; open</h2>
            <p className="text-xs text-parchment-dim mt-1">
              After each test: paste grades for that room, then{" "}
              <strong className="text-parchment">Open room</strong>. Students
              see all rooms but can only start rooms you open. The next room
              stays locked until the next test grades are entered.
            </p>
          </div>

          <div className="space-y-4">
            {(overview?.rooms ?? []).map((room) => {
              const label = bossLabel(room.bossId, overview?.bosses ?? []);
              const status = room.open
                ? "Open"
                : room.gradeCount > 0
                  ? "Grades ready — closed"
                  : "Locked";
              return (
                <div
                  key={room.roomIndex}
                  className={`rounded-lg border p-3 space-y-2 ${
                    room.open
                      ? "border-grade-a/40 bg-grade-a/5"
                      : "border-parchment/15 bg-navy/40"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-semibold">
                        Room {room.roomIndex + 1}
                      </span>
                      <span className="text-parchment-dim text-sm ml-2">
                        {label}
                      </span>
                    </div>
                    <span
                      className={`text-xs font-semibold rounded px-2 py-0.5 border ${
                        room.open
                          ? "border-grade-a/50 text-grade-a"
                          : room.gradeCount > 0
                            ? "border-rune/40 text-rune"
                            : "border-parchment/20 text-parchment-dim"
                      }`}
                    >
                      {status}
                      {room.gradeCount > 0
                        ? ` · ${room.gradeCount} tokens`
                        : ""}
                    </span>
                  </div>

                  {room.tokenPool.length > 0 && (
                    <p
                      className="font-mono text-sm text-parchment break-words leading-relaxed rounded-lg border border-parchment/15 bg-navy/50 px-3 py-2"
                      title="Current token pool for this room"
                    >
                      {room.tokenPool.join(", ")}
                    </p>
                  )}

                  <textarea
                    className="w-full min-h-[2.75rem] h-14 rounded-lg bg-navy border border-parchment/20 p-2 font-mono text-sm resize-y"
                    value={gradesByRoom[room.roomIndex] ?? ""}
                    onChange={(e) =>
                      setGradesByRoom((prev) => ({
                        ...prev,
                        [room.roomIndex]: e.target.value,
                      }))
                    }
                    placeholder="A, A, B, B, C, C, D, F … (commas, spaces, or new lines all work)"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void submitRoomGrades(room.roomIndex)}
                      className="rounded-lg bg-crimson hover:bg-crimson-bright px-3 py-1.5 text-sm font-semibold"
                    >
                      Set grades
                    </button>
                    {room.open ? (
                      <button
                        type="button"
                        onClick={() =>
                          void toggleRoomOpen(room.roomIndex, false)
                        }
                        className="rounded-lg border border-grade-f/40 text-grade-f px-3 py-1.5 text-sm"
                      >
                        Close room
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={room.gradeCount === 0}
                        onClick={() =>
                          void toggleRoomOpen(room.roomIndex, true)
                        }
                        className="rounded-lg border border-grade-a/50 text-grade-a px-3 py-1.5 text-sm font-semibold disabled:opacity-40"
                        title={
                          room.gradeCount === 0
                            ? "Enter grades before opening"
                            : "Allow teams to start this room"
                        }
                      >
                        Open room
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Campaign path */}
        <section className="rounded-xl border border-parchment/15 bg-navy-light/60 p-4 space-y-3">
          <h2 className="font-semibold text-lg">Campaign path</h2>
          <p className="text-xs text-parchment-dim">
            Boss order for this period only. Grades are per room (above).
          </p>
          <div className="flex flex-wrap gap-2 items-end">
            <label className="block text-sm flex-1 min-w-[8rem]">
              Number of rooms
              <select
                className="mt-1 w-full rounded-lg bg-navy border border-parchment/20 px-3 py-2"
                value={overview?.campaignLength ?? 6}
                onChange={(e) => {
                  if (!classroomId) return;
                  const n = Number(e.target.value);
                  void api
                    .setCampaign(pin, classroomId, { campaignLength: n })
                    .then((o) => {
                      setOverview(o);
                    })
                    .catch((err: Error) => setError(err.message));
                }}
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n} room{n > 1 ? "s" : ""}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="rounded-lg border border-rune/40 text-rune text-sm px-3 py-2 hover:bg-navy"
              onClick={() => {
                if (!classroomId) return;
                void api
                  .resetDefaultCampaign(pin, classroomId)
                  .then((o) => {
                    setOverview(o);
                    setMsg("Campaign reset to 6-room default path");
                  })
                  .catch((err: Error) => setError(err.message));
              }}
            >
              Use default 6-room path
            </button>
          </div>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {(overview?.roomBossIds ?? []).map((bossId, roomIdx) => {
              const isPlaceholder =
                overview?.bosses
                  .find((b) => b.id === bossId)
                  ?.summary?.includes("PLACEHOLDER") ||
                bossId === "barrow_warden";
              return (
                <div key={roomIdx} className="flex items-center gap-2">
                  <span className="text-xs text-parchment-dim w-14 shrink-0">
                    Room {roomIdx + 1}
                  </span>
                  <select
                    className="flex-1 rounded-lg bg-navy border border-parchment/20 px-2 py-1.5 text-sm"
                    value={bossId}
                    onChange={(e) => {
                      if (!classroomId || !overview) return;
                      const next = [...overview.roomBossIds];
                      next[roomIdx] = e.target.value;
                      void api
                        .setCampaign(pin, classroomId, { roomBossIds: next })
                        .then((o) => {
                          setOverview(o);
                          setMsg(`Room ${roomIdx + 1} boss updated`);
                        })
                        .catch((err: Error) => setError(err.message));
                    }}
                  >
                    {overview?.bosses.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                        {b.id === "barrow_warden" ? " (placeholder)" : ""}
                        {" · "}
                        {b.difficulty}
                      </option>
                    ))}
                  </select>
                  {isPlaceholder && (
                    <span className="text-[10px] text-grade-d shrink-0">
                      stub
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Danger zone */}
        <section className="rounded-xl border border-grade-f/25 bg-navy-light/40 p-4 space-y-2">
          <h2 className="font-semibold text-lg text-grade-f">Danger zone</h2>
          <p className="text-xs text-parchment-dim">
            Deleting a classroom removes every team and invite code in this
            period.
          </p>
          <button
            type="button"
            onClick={() => void deleteClassroom()}
            className="text-sm border border-grade-f/50 text-grade-f rounded-lg px-3 py-1.5 hover:bg-grade-f/10"
          >
            Delete this classroom…
          </button>
        </section>

        {/* Teams */}
        <section className="rounded-xl border border-parchment/15 bg-navy-light/60 p-4 space-y-3 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-lg">Teams</h2>
            {overview?.paused && (
              <span className="text-xs font-semibold text-grade-f border border-grade-f/40 rounded px-2 py-1">
                Students blocked (paused)
              </span>
            )}
          </div>
          <p className="text-xs text-parchment-dim">
            Create a team, give students the invite code. Codes only work for
            this team (other periods cannot use them).
          </p>

          <div className="flex flex-wrap gap-2">
            <input
              className="flex-1 min-w-[10rem] rounded-lg bg-navy border border-parchment/20 px-3 py-2 text-sm"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              placeholder="Team name (e.g. Table 3)"
              onKeyDown={(e) => {
                if (e.key === "Enter") void createTeam();
              }}
            />
            <button
              type="button"
              onClick={() => void createTeam()}
              className="rounded-lg bg-crimson px-4 py-2 text-sm font-semibold"
            >
              Create team
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-parchment-dim text-left">
                <tr>
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Code</th>
                  <th className="py-2 pr-3">Phase</th>
                  <th className="py-2 pr-3">Room</th>
                  <th className="py-2 pr-3">Round</th>
                  <th className="py-2 pr-3">Alive</th>
                  <th className="py-2 pr-3">Boss HP</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {overview?.teams.map((t) => (
                  <tr key={t.teamId} className="border-t border-parchment/10">
                    <td className="py-2 pr-3 font-medium">{t.name}</td>
                    <td className="py-2 pr-3 tracking-widest text-rune">
                      {t.inviteCode}
                    </td>
                    <td className="py-2 pr-3 capitalize">
                      {t.phase.replaceAll("_", " ")}
                    </td>
                    <td className="py-2 pr-3">
                      {t.currentRoom ?? t.roomIndex + 1}/
                      {t.campaignLength ?? "?"}
                      {t.canStartCurrentRoom === false && (
                        <span className="block text-[10px] text-parchment-dim">
                          room locked
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3">{t.round}</td>
                    <td className="py-2 pr-3">
                      {t.alive}/{t.rosterSize}
                    </td>
                    <td className="py-2 pr-3">{t.bossHp ?? "—"}</td>
                    <td className="py-2 space-x-1 whitespace-nowrap">
                      <button
                        type="button"
                        className="text-xs border border-rune/40 text-rune rounded px-2 py-1 hover:bg-navy"
                        onClick={() => void changeCode(t.teamId, t.name)}
                      >
                        Change invite code
                      </button>
                      <button
                        type="button"
                        className="text-xs border border-grade-f/40 text-grade-f rounded px-2 py-1 hover:bg-navy"
                        onClick={() => {
                          if (!classroomId) return;
                          void api
                            .resetTeam(pin, classroomId, t.teamId)
                            .then(refreshOverview);
                        }}
                      >
                        Reset
                      </button>
                      <button
                        type="button"
                        className="text-xs border border-grade-f/60 bg-grade-f/10 text-grade-f rounded px-2 py-1 hover:bg-grade-f/20"
                        onClick={() => {
                          if (!classroomId) return;
                          const ok = window.confirm(
                            `Delete team “${t.name}” (${t.inviteCode})?\n\nThis cannot be undone.`,
                          );
                          if (!ok) return;
                          const again = window.confirm(
                            `Are you sure you want to delete “${t.name}”?`,
                          );
                          if (!again) return;
                          void api
                            .deleteTeam(pin, classroomId, t.teamId)
                            .then(() => {
                              setMsg(`Deleted team ${t.name}`);
                              return refreshOverview();
                            })
                            .catch((e: Error) =>
                              setError(e.message || "Delete failed"),
                            );
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {!overview?.teams.length && (
                  <tr>
                    <td colSpan={8} className="py-4 text-parchment-dim">
                      No teams yet — create one and share the invite code.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
