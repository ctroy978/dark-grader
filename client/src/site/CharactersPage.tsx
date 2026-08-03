import {
  ARCHETYPE_ICONS,
  getArchetypeScout,
  type Archetype,
  type Grade,
} from "@dungeon-grades/shared";
import GradeToken from "../combat/GradeToken";
import { PlaceholderPortrait } from "../combat/PlaceholderPortrait";
import SiteChrome from "./SiteChrome";
import { navigate } from "./siteNav";

const ALL: Archetype[] = [
  "Vanguard",
  "ShieldMaiden",
  "FireMage",
  "Healer",
  "Archer",
  "Spearman",
  "Necromancer",
  "Thundercaller",
  "Runesinger",
];

const GRADE_CLASS: Record<Grade, string> = {
  A: "text-grade-a",
  B: "text-grade-b",
  C: "text-grade-c",
  D: "text-grade-d",
  F: "text-grade-f",
};

export function CharactersListPage() {
  return (
    <SiteChrome active="characters">
      <div className="mx-auto max-w-6xl px-4 py-12 md:py-16 space-y-8">
        <header className="max-w-2xl space-y-3">
          <p className="text-rune text-xs tracking-[0.3em] uppercase font-semibold">
            Codex
          </p>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight">
            Characters
          </h1>
          <p className="text-parchment-dim leading-relaxed">
            Nine specialist classes fill a roster of 21 soldiers. You field six
            per room. Click any class to see what each grade A–F does in combat.
          </p>
        </header>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ALL.map((archetype) => {
            const scout = getArchetypeScout(archetype);
            return (
              <button
                key={archetype}
                type="button"
                onClick={() =>
                  navigate({ page: "character", archetype: archetype })
                }
                className="group text-left rounded-2xl border border-parchment/12 bg-navy-light/40 p-4 hover:border-rune/40 hover:bg-navy-light/70 transition shadow-lg flex gap-4"
              >
                <PlaceholderPortrait
                  kind={{ role: "party", archetype }}
                  pose="standing"
                  className="h-28 w-20 shrink-0 shadow-md ring-1 ring-parchment/20 group-hover:ring-rune/40"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{ARCHETYPE_ICONS[archetype]}</span>
                    <h2 className="font-bold text-lg truncate">
                      {scout.displayName}
                    </h2>
                  </div>
                  <p className="text-xs text-parchment-dim mt-0.5">
                    {scout.maxHp} HP
                  </p>
                  <p className="mt-2 text-sm text-parchment-dim leading-snug line-clamp-3">
                    {scout.summary}
                  </p>
                  <span className="mt-3 inline-block text-xs text-rune font-semibold">
                    View abilities →
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </SiteChrome>
  );
}

export function CharacterDetailPage({ archetypeKey }: { archetypeKey: string }) {
  const match = ALL.find(
    (a) => a.toLowerCase() === archetypeKey.toLowerCase() ||
      a.toLowerCase() === archetypeKey.replace(/-/g, "").toLowerCase() ||
      a.toLowerCase() === archetypeKey.replace(/_/g, "").toLowerCase(),
  );
  // Also match display-style "shieldmaiden" etc.
  const archetype =
    match ??
    ALL.find(
      (a) =>
        a.toLowerCase() ===
        archetypeKey.replace(/[-_]/g, "").toLowerCase(),
    );

  if (!archetype) {
    return (
      <SiteChrome active="characters">
        <div className="mx-auto max-w-lg px-4 py-20 text-center space-y-4">
          <h1 className="text-2xl font-bold">Character not found</h1>
          <button
            type="button"
            className="text-rune font-semibold"
            onClick={() => navigate({ page: "characters" })}
          >
            ← Back to roster
          </button>
        </div>
      </SiteChrome>
    );
  }

  const scout = getArchetypeScout(archetype);
  const idx = ALL.indexOf(archetype);
  const prev = ALL[(idx - 1 + ALL.length) % ALL.length];
  const next = ALL[(idx + 1) % ALL.length];

  return (
    <SiteChrome active="character">
      <div className="mx-auto max-w-4xl px-4 py-12 md:py-16 space-y-8">
        <button
          type="button"
          onClick={() => navigate({ page: "characters" })}
          className="text-sm text-parchment-dim hover:text-rune"
        >
          ← All characters
        </button>

        <div className="grid md:grid-cols-[10rem_1fr] gap-8 items-start">
          <div className="flex md:flex-col gap-4 items-center md:items-stretch">
            <PlaceholderPortrait
              kind={{ role: "party", archetype }}
              pose="standing"
              className="h-48 w-32 md:h-56 md:w-full shadow-xl ring-2 ring-parchment/20 mx-auto"
            />
            <PlaceholderPortrait
              kind={{ role: "party", archetype }}
              pose="attack"
              className="h-28 w-20 opacity-80 shadow-md ring-1 ring-parchment/15 hidden sm:block mx-auto"
            />
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-rune text-xs tracking-[0.3em] uppercase">
                Specialist
              </p>
              <h1 className="text-4xl font-black mt-1 flex items-center gap-3">
                <span>{ARCHETYPE_ICONS[archetype]}</span>
                {scout.displayName}
              </h1>
              <p className="text-parchment-dim mt-1">{scout.maxHp} max HP</p>
            </div>
            <p className="text-parchment leading-relaxed text-lg">
              {scout.summary}
            </p>

            <div className="rounded-2xl border border-parchment/12 bg-navy-light/40 overflow-hidden">
              <div className="px-4 py-3 border-b border-parchment/10 bg-navy/40">
                <h2 className="font-bold">Grade effects</h2>
                <p className="text-xs text-parchment-dim mt-0.5">
                  What happens when this specialist claims a token of each letter.
                </p>
              </div>
              <ul className="divide-y divide-parchment/10">
                {scout.grades.map((g) => (
                  <li key={g.grade} className="px-4 py-3 flex gap-3 items-start">
                    <GradeToken grade={g.grade} size="sm" className="shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-parchment leading-snug">
                        <span className={`font-bold mr-1.5 ${GRADE_CLASS[g.grade]}`}>
                          {g.grade}
                        </span>
                        {g.effect}
                      </p>
                      {g.risk && (
                        <p className="text-xs text-grade-f mt-1">Risk: {g.risk}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="flex justify-between gap-4 pt-4 border-t border-parchment/10">
          <button
            type="button"
            onClick={() => navigate({ page: "character", archetype: prev })}
            className="text-sm text-parchment-dim hover:text-rune"
          >
            ← {getArchetypeScout(prev).displayName}
          </button>
          <button
            type="button"
            onClick={() => navigate({ page: "character", archetype: next })}
            className="text-sm text-parchment-dim hover:text-rune"
          >
            {getArchetypeScout(next).displayName} →
          </button>
        </div>
      </div>
    </SiteChrome>
  );
}
