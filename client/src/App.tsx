import { useEffect, useState } from "react";
import JoinScreen from "./screens/JoinScreen";
import LobbyScreen from "./screens/LobbyScreen";
import CombatScreen from "./screens/CombatScreen";
import TeacherDashboard from "./screens/TeacherDashboard";
import type { EnrichedTeam } from "./api";
import LandingPage from "./site/LandingPage";
import HowToPlayPage from "./site/HowToPlayPage";
import { CharactersListPage, CharacterDetailPage } from "./site/CharactersPage";
import { BossesListPage, BossDetailPage } from "./site/BossesPage";
import SiteChrome from "./site/SiteChrome";
import { navigate, parseHash, type SiteRoute } from "./site/siteNav";

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
          Ask your teacher to reset the team (or create a new code) for the next
          test day.
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

function useSiteRoute(): SiteRoute {
  const [route, setRoute] = useState<SiteRoute>(() =>
    parseHash(window.location.hash),
  );

  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onHash);
    // Normalize empty hash to home
    if (!window.location.hash || window.location.hash === "#") {
      window.location.hash = "#/";
    }
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return route;
}

export default function App() {
  const route = useSiteRoute();
  const [team, setTeam] = useState<EnrichedTeam | null>(null);

  // In-session play overrides marketing when a team is active
  if (team) {
    if (team.phase === "campaign_complete") {
      return (
        <CampaignComplete
          team={team}
          onLeave={() => {
            setTeam(null);
            navigate({ page: "home" });
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
            navigate({ page: "home" });
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
          navigate({ page: "home" });
        }}
      />
    );
  }

  if (route.page === "teacher") {
    return (
      <TeacherDashboard
        onBack={() => navigate({ page: "home" })}
      />
    );
  }

  if (route.page === "join") {
    return (
      <SiteChrome active="join">
        <div className="mx-auto max-w-md px-4 py-16 space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold">
              Join a <span className="text-grade-a">Grade</span>Forge team
            </h1>
            <p className="text-sm text-parchment-dim">
              Enter the invite code from your teacher. One computer per table.
            </p>
          </div>
          <JoinScreen
            onJoined={(t) => {
              setTeam(t);
            }}
            onCancel={() => navigate({ page: "home" })}
          />
          <p className="text-center text-xs text-parchment-dim">
            New here?{" "}
            <button
              type="button"
              className="text-rune underline underline-offset-2"
              onClick={() => navigate({ page: "how-to" })}
            >
              Learn how to play
            </button>{" "}
            first.
          </p>
        </div>
      </SiteChrome>
    );
  }

  if (route.page === "how-to") return <HowToPlayPage />;
  if (route.page === "characters") return <CharactersListPage />;
  if (route.page === "character") {
    return <CharacterDetailPage archetypeKey={route.archetype} />;
  }
  if (route.page === "bosses") return <BossesListPage />;
  if (route.page === "boss") return <BossDetailPage bossId={route.bossId} />;

  return <LandingPage />;
}
