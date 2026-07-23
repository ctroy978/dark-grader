import { useCallback, useEffect, useState } from "react";
import { api, getSocket, type Overview } from "../api";

export default function TeacherDashboard({ onBack }: { onBack: () => void }) {
  const [pin, setPin] = useState(
    () => sessionStorage.getItem("dg_teacher_pin") ?? "teacher",
  );
  const [authed, setAuthed] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [gradesText, setGradesText] = useState("");
  const [teamName, setTeamName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const o = await api.teacherOverview(pin);
    setOverview(o);
    setAuthed(true);
    sessionStorage.setItem("dg_teacher_pin", pin);
  }, [pin]);

  useEffect(() => {
    if (!authed) return;
    const s = getSocket();
    s.emit("subscribe:teacher", pin);
    const onOverview = (o: Overview) => setOverview(o);
    s.on("teacher:overview", onOverview);
    return () => {
      s.off("teacher:overview", onOverview);
    };
  }, [authed, pin]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auth failed");
      setAuthed(false);
    }
  }

  async function submitGrades() {
    setError(null);
    setMsg(null);
    try {
      const r = await api.setGrades(pin, gradesText);
      setMsg(`Token pool set: ${r.count} grades`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function pickBoss(id: string) {
    setError(null);
    try {
      await api.setBoss(pin, id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function createTeam() {
    setError(null);
    try {
      const t = await api.createTeam(pin, teamName);
      setMsg(`Created ${t.name} — code ${t.inviteCode}`);
      setTeamName("");
      await refresh();
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
          <h1 className="text-xl font-bold">Teacher Login</h1>
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

  return (
    <div className="min-h-full p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Teacher Dashboard</h1>
          <p className="text-sm text-parchment-dim">
            Pool: {overview?.masterTokenPool.length ?? 0} tokens · Campaign:{" "}
            {overview?.campaignLength ?? "?"} rooms · Fallback boss:{" "}
            {overview?.bossTemplateId ?? "none"}
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

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Grades */}
        <section className="rounded-xl border border-parchment/15 bg-navy-light/60 p-4 space-y-3">
          <h2 className="font-semibold text-lg">Grade → Token Pool</h2>
          <p className="text-xs text-parchment-dim">
            Paste letters A–F (spaces, commas, or new lines). Shared by all teams today.
          </p>
          <textarea
            className="w-full h-28 rounded-lg bg-navy border border-parchment/20 p-3 font-mono text-sm"
            value={gradesText}
            onChange={(e) => setGradesText(e.target.value)}
            placeholder="A A B B B C C C C D D F …"
          />
          <button
            type="button"
            onClick={() => void submitGrades()}
            className="rounded-lg bg-crimson hover:bg-crimson-bright px-4 py-2 text-sm font-semibold"
          >
            Generate Token Pool
          </button>
          {overview && overview.masterTokenPool.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {overview.masterTokenPool.map((g, i) => (
                <span
                  key={i}
                  className="w-7 h-7 rounded-full border border-parchment/30 flex items-center justify-center text-xs font-bold"
                >
                  {g}
                </span>
              ))}
            </div>
          )}
        </section>

        {/* Campaign path */}
        <section className="rounded-xl border border-parchment/15 bg-navy-light/60 p-4 space-y-3">
          <h2 className="font-semibold text-lg">Campaign path</h2>
          <p className="text-xs text-parchment-dim">
            Default 6 rooms: Moss Grub → Ash → Herald → Rattle Captain → Barrow
            Warden (placeholder) → Bone Colossus. Grades stay shared for the whole path.
          </p>
          <div className="flex flex-wrap gap-2 items-end">
            <label className="block text-sm flex-1 min-w-[8rem]">
              Number of rooms
              <select
                className="mt-1 w-full rounded-lg bg-navy border border-parchment/20 px-3 py-2"
                value={overview?.campaignLength ?? 6}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  void api
                    .setCampaign(pin, { campaignLength: n })
                    .then(refresh)
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
                void api
                  .resetDefaultCampaign(pin)
                  .then(() => {
                    setMsg("Campaign reset to 6-room default path");
                    return refresh();
                  })
                  .catch((err: Error) => setError(err.message));
              }}
            >
              Use default 6-room path
            </button>
          </div>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {(overview?.roomBossIds ?? []).map((bossId, roomIdx) => {
              const boss = overview?.bosses.find((b) => b.id === bossId);
              const isPlaceholder =
                boss?.summary?.includes("PLACEHOLDER") ||
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
                      const next = [...(overview?.roomBossIds ?? [])];
                      next[roomIdx] = e.target.value;
                      void api
                        .setCampaign(pin, { roomBossIds: next })
                        .then(() => {
                          setMsg(`Room ${roomIdx + 1} boss updated`);
                          return refresh();
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
          <p className="text-xs text-parchment-dim">
            Fallback single-boss pick (legacy): click a card to set default filler boss.
          </p>
          <div className="flex flex-wrap gap-2">
            {overview?.bosses.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => void pickBoss(b.id)}
                className={`text-xs rounded-lg border px-2 py-1 ${
                  overview.bossTemplateId === b.id
                    ? "border-rune text-rune"
                    : "border-parchment/20"
                }`}
              >
                {b.name}
              </button>
            ))}
          </div>
        </section>

        {/* Teams */}
        <section className="rounded-xl border border-parchment/15 bg-navy-light/60 p-4 space-y-3 lg:col-span-2">
          <h2 className="font-semibold text-lg">Teams</h2>
          <div className="flex flex-wrap gap-2">
            <input
              className="rounded-lg bg-navy border border-parchment/20 px-3 py-2 text-sm"
              placeholder="Team name"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
            />
            <button
              type="button"
              onClick={() => void createTeam()}
              className="rounded-lg bg-rune/90 text-navy font-semibold px-4 py-2 text-sm"
            >
              Create Invite Code
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
                    </td>
                    <td className="py-2 pr-3">{t.round}</td>
                    <td className="py-2 pr-3">
                      {t.alive}/{t.rosterSize}
                    </td>
                    <td className="py-2 pr-3">{t.bossHp ?? "—"}</td>
                    <td className="py-2 space-x-1">
                      <button
                        type="button"
                        className="text-xs border border-parchment/25 rounded px-2 py-1 hover:bg-navy"
                        onClick={() =>
                          void api.forceRound(pin, t.teamId).then(refresh)
                        }
                      >
                        Force round
                      </button>
                      <button
                        type="button"
                        title="Only works after the team has saved a party of 6 in the student lobby"
                        className="text-xs border border-parchment/25 rounded px-2 py-1 hover:bg-navy"
                        onClick={() =>
                          void api
                            .teacherStartFight(pin, t.teamId)
                            .then(refresh)
                            .catch((e: Error) =>
                              setError(
                                e.message ||
                                  "Start fight failed — team must form a party of 6 first",
                              ),
                            )
                        }
                      >
                        Start fight
                      </button>
                      <button
                        type="button"
                        className="text-xs border border-grade-f/40 text-grade-f rounded px-2 py-1 hover:bg-navy"
                        onClick={() =>
                          void api.resetTeam(pin, t.teamId).then(refresh)
                        }
                      >
                        Reset
                      </button>
                    </td>
                  </tr>
                ))}
                {!overview?.teams.length && (
                  <tr>
                    <td colSpan={7} className="py-4 text-parchment-dim">
                      No teams yet — create an invite code for each group.
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
