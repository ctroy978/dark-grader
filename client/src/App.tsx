import { useState } from "react";
import JoinScreen from "./screens/JoinScreen";
import LobbyScreen from "./screens/LobbyScreen";
import CombatScreen from "./screens/CombatScreen";
import TeacherDashboard from "./screens/TeacherDashboard";
import type { EnrichedTeam } from "./api";

function CampaignComplete({
  team,
  onLeave,
}: {
  team: EnrichedTeam;
  onLeave: () => void;
}) {
  const living = team.roster.filter((s) => s.alive);
  const fallen = team.roster.filter((s) => !s.alive);
  return (
    <div className="min-h-full flex items-center justify-center p-6">
      <div className="max-w-lg w-full rounded-2xl border border-grade-a/40 bg-navy-light/90 p-8 text-center space-y-4 shadow-xl">
        <p className="text-rune text-xs tracking-[0.3em] uppercase">Campaign</p>
        <h1 className="text-3xl font-bold text-grade-a">Dungeon Cleared</h1>
        <p className="text-parchment-dim">
          {team.name} finished all {team.campaignLength ?? "?"} rooms.
          {team.lastClearedBossName
            ? ` Last fallen foe: ${team.lastClearedBossName}.`
            : ""}
        </p>
        <p className="text-sm">
          Survivors: <strong>{living.length}</strong> / {team.roster.length}
        </p>
        {fallen.length > 0 && (
          <p className="text-sm text-grade-f">
            Lost along the way: {fallen.map((s) => s.name).join(", ")}
          </p>
        )}
        <p className="text-xs text-parchment-dim">
          Ask your teacher to reset the team (or create a new code) for the next test day.
        </p>
        <button
          type="button"
          onClick={onLeave}
          className="rounded-lg bg-crimson px-5 py-2.5 font-semibold"
        >
          Return Home
        </button>
      </div>
    </div>
  );
}

type Mode = "home" | "student" | "teacher";

export default function App() {
  const [mode, setMode] = useState<Mode>("home");
  const [team, setTeam] = useState<EnrichedTeam | null>(null);

  if (mode === "teacher") {
    return (
      <TeacherDashboard
        onBack={() => setMode("home")}
      />
    );
  }

  if (mode === "student" && team) {
    if (team.phase === "campaign_complete") {
      return (
        <CampaignComplete
          team={team}
          onLeave={() => {
            setTeam(null);
            setMode("home");
          }}
        />
      );
    }
    if (
      team.phase === "awaiting_magnet" ||
      team.phase === "resolving" ||
      team.phase === "boss_telegraph" ||
      team.phase === "victory" ||
      team.phase === "defeat"
    ) {
      return (
        <CombatScreen
          team={team}
          onTeamUpdate={setTeam}
          onLeave={() => {
            setTeam(null);
            setMode("home");
          }}
        />
      );
    }
    return (
      <LobbyScreen
        team={team}
        onTeamUpdate={setTeam}
        onLeave={() => {
          setTeam(null);
          setMode("home");
        }}
      />
    );
  }

  return (
    <div className="min-h-full flex flex-col items-center justify-center p-6 gap-8">
      <header className="text-center space-y-2">
        <p className="text-rune tracking-[0.3em] text-xs uppercase">Classroom Campaign</p>
        <h1 className="text-4xl md:text-5xl font-bold text-parchment drop-shadow">
          Dungeon Grades
        </h1>
        <p className="text-parchment-dim max-w-md mx-auto">
          Turn test scores into power tokens. Guide your soldiers. Survive the dungeon.
        </p>
      </header>

      <div className="grid md:grid-cols-2 gap-4 w-full max-w-2xl">
        <button
          type="button"
          className="rounded-xl border border-rune/30 bg-navy-light/80 p-6 text-left hover:border-rune hover:bg-navy-light transition"
          onClick={() => setMode("student")}
        >
          <div className="text-2xl mb-2">⚔️</div>
          <div className="font-semibold text-lg">Student / Team</div>
          <div className="text-sm text-parchment-dim mt-1">
            Enter invite code, form a party of 6, then enter the dungeon.
          </div>
        </button>
        <button
          type="button"
          className="rounded-xl border border-crimson/40 bg-navy-light/80 p-6 text-left hover:border-crimson-bright hover:bg-navy-light transition"
          onClick={() => setMode("teacher")}
        >
          <div className="text-2xl mb-2">📜</div>
          <div className="font-semibold text-lg">Teacher Dashboard</div>
          <div className="text-sm text-parchment-dim mt-1">
            Periods, grades per room, open rooms, and teams.
          </div>
        </button>
      </div>

      {mode === "student" && !team && (
        <JoinScreen
          onJoined={(t) => {
            setTeam(t);
          }}
          onCancel={() => setMode("home")}
        />
      )}
    </div>
  );
}
