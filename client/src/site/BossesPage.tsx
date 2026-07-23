import { useEffect, useState } from "react";
import { PlaceholderPortrait } from "../combat/PlaceholderPortrait";
import { fetchCodexBosses, type CodexBoss } from "./codexApi";
import SiteChrome from "./SiteChrome";
import { navigate } from "./siteNav";

function difficultyColor(d: string): string {
  const x = d.toLowerCase();
  if (x.includes("easy") || x.includes("tutorial")) return "text-grade-a";
  if (x.includes("hard") || x.includes("brutal")) return "text-grade-f";
  return "text-grade-d";
}

export function BossesListPage() {
  const [bosses, setBosses] = useState<CodexBoss[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchCodexBosses()
      .then((r) => setBosses(r.bosses))
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <SiteChrome active="bosses">
      <div className="mx-auto max-w-6xl px-4 py-12 md:py-16 space-y-8">
        <header className="max-w-2xl space-y-3">
          <p className="text-crimson-bright text-xs tracking-[0.3em] uppercase font-semibold">
            Codex
          </p>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight">
            Bosses
          </h1>
          <p className="text-parchment-dim leading-relaxed">
            Default campaign path: six rooms. Teachers may reorder bosses, but
            this is the ladder most classes climb — one room per graded test.
          </p>
        </header>

        {error && (
          <p className="text-grade-f text-sm border border-grade-f/40 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
        {!bosses && !error && (
          <p className="text-parchment-dim text-sm">Loading bestiary…</p>
        )}

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {bosses?.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => navigate({ page: "boss", bossId: b.id })}
              className="group text-left rounded-2xl border border-parchment/12 bg-navy-light/40 p-4 hover:border-crimson-bright/40 hover:bg-navy-light/70 transition shadow-lg flex gap-4"
            >
              <PlaceholderPortrait
                kind={{ role: "boss", bossId: b.id }}
                pose="standing"
                className="h-28 w-20 shrink-0 shadow-md ring-1 ring-parchment/20 group-hover:ring-crimson/40"
              />
              <div className="min-w-0 flex-1">
                {b.roomIndex >= 0 && (
                  <p className="text-[10px] uppercase tracking-wider text-parchment-dim">
                    Room {b.roomIndex + 1}
                  </p>
                )}
                <h2 className="font-bold text-lg leading-tight">{b.name}</h2>
                <p className={`text-xs font-semibold mt-0.5 ${difficultyColor(b.difficulty)}`}>
                  {b.difficulty} · {b.maxHp} HP
                </p>
                <p className="mt-2 text-sm text-parchment-dim leading-snug line-clamp-3">
                  {b.summary}
                </p>
                <span className="mt-3 inline-block text-xs text-crimson-bright font-semibold">
                  Scout intel →
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </SiteChrome>
  );
}

export function BossDetailPage({ bossId }: { bossId: string }) {
  const [boss, setBoss] = useState<CodexBoss | null | undefined>(undefined);
  const [all, setAll] = useState<CodexBoss[]>([]);

  useEffect(() => {
    void fetchCodexBosses()
      .then((r) => {
        setAll(r.bosses);
        const found =
          r.bosses.find(
            (b) => b.id.toLowerCase() === bossId.toLowerCase(),
          ) ?? null;
        setBoss(found);
      })
      .catch(() => setBoss(null));
  }, [bossId]);

  if (boss === undefined) {
    return (
      <SiteChrome active="boss">
        <div className="mx-auto max-w-lg px-4 py-20 text-center text-parchment-dim">
          Loading…
        </div>
      </SiteChrome>
    );
  }

  if (!boss) {
    return (
      <SiteChrome active="boss">
        <div className="mx-auto max-w-lg px-4 py-20 text-center space-y-4">
          <h1 className="text-2xl font-bold">Boss not found</h1>
          <button
            type="button"
            className="text-rune font-semibold"
            onClick={() => navigate({ page: "bosses" })}
          >
            ← Back to bestiary
          </button>
        </div>
      </SiteChrome>
    );
  }

  const idx = all.findIndex((b) => b.id === boss.id);
  const prev = idx > 0 ? all[idx - 1] : all[all.length - 1];
  const next = idx >= 0 && idx < all.length - 1 ? all[idx + 1] : all[0];
  const scout = boss.scout;
  const isPlaceholder =
    boss.summary.includes("PLACEHOLDER") ||
    boss.traits.some((t) => t.toLowerCase().includes("placeholder"));

  return (
    <SiteChrome active="boss">
      <div className="mx-auto max-w-4xl px-4 py-12 md:py-16 space-y-8">
        <button
          type="button"
          onClick={() => navigate({ page: "bosses" })}
          className="text-sm text-parchment-dim hover:text-rune"
        >
          ← All bosses
        </button>

        <div className="grid md:grid-cols-[11rem_1fr] gap-8 items-start">
          <div className="space-y-3">
            <PlaceholderPortrait
              kind={{ role: "boss", bossId: boss.id }}
              pose="standing"
              className="h-52 w-36 md:w-full shadow-xl ring-2 ring-parchment/20 mx-auto"
            />
            <PlaceholderPortrait
              kind={{ role: "boss", bossId: boss.id }}
              pose="attack"
              className="h-28 w-20 opacity-80 shadow-md ring-1 ring-parchment/15 hidden sm:block mx-auto"
            />
          </div>

          <div className="space-y-4">
            <div>
              {boss.roomIndex >= 0 && (
                <p className="text-crimson-bright text-xs tracking-[0.3em] uppercase">
                  Campaign room {boss.roomIndex + 1}
                </p>
              )}
              <h1 className="text-4xl font-black mt-1">{boss.name}</h1>
              <p className={`mt-1 text-sm font-semibold ${difficultyColor(boss.difficulty)}`}>
                {boss.difficulty}
                {" · "}
                <span className="text-parchment">{boss.maxHp} HP</span>
                {boss.recommendedRounds
                  ? ` · ~${boss.recommendedRounds} rounds`
                  : ""}
              </p>
              {boss.traits.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {boss.traits.map((t) => (
                    <span
                      key={t}
                      className="text-[10px] uppercase tracking-wide rounded border border-parchment/20 px-2 py-0.5 text-parchment-dim"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {isPlaceholder && (
              <p className="text-sm text-grade-d border border-grade-d/30 rounded-lg px-3 py-2">
                Placeholder kit — full design still shipping. Playable so the
                six-room path exists.
              </p>
            )}

            <p className="text-parchment leading-relaxed text-lg">
              {boss.summary}
            </p>

            {scout && scout.attacks.length > 0 && (
              <div className="rounded-2xl border border-parchment/12 bg-navy-light/40 overflow-hidden">
                <div className="px-4 py-3 border-b border-parchment/10 bg-navy/40">
                  <h2 className="font-bold">Attacks</h2>
                </div>
                <ul className="divide-y divide-parchment/10">
                  {scout.attacks.map((a) => (
                    <li key={a.id} className="px-4 py-3">
                      <div className="font-semibold text-parchment">{a.name}</div>
                      <p className="text-sm text-parchment-dim mt-0.5 leading-snug">
                        {a.description}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {scout && (
              <div className="rounded-2xl border border-parchment/12 bg-navy-light/40 overflow-hidden">
                <div className="px-4 py-3 border-b border-parchment/10 bg-navy/40">
                  <h2 className="font-bold">Minions</h2>
                </div>
                {scout.minions.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-parchment-dim">
                    No minions — the boss fights alone.
                  </p>
                ) : (
                  <ul className="divide-y divide-parchment/10">
                    {scout.minions.map((m) => (
                      <li key={m.id} className="px-4 py-3 flex gap-3">
                        <PlaceholderPortrait
                          kind={{ role: "minion", name: m.name }}
                          pose="standing"
                          className="h-12 w-9 shrink-0 ring-1 ring-parchment/15"
                        />
                        <div>
                          <div className="font-semibold">
                            {m.name}{" "}
                            <span className="font-normal text-parchment-dim text-xs">
                              up to {m.maxCount} · {m.maxHp} HP · {m.damage} dmg
                            </span>
                          </div>
                          <p className="text-sm text-parchment-dim mt-0.5">
                            {m.note}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {scout?.enrageNote && (
              <p className="text-sm text-grade-d border-t border-parchment/10 pt-3">
                {scout.enrageNote}
              </p>
            )}
          </div>
        </div>

        {prev && next && (
          <div className="flex justify-between gap-4 pt-4 border-t border-parchment/10">
            <button
              type="button"
              onClick={() => navigate({ page: "boss", bossId: prev.id })}
              className="text-sm text-parchment-dim hover:text-rune"
            >
              ← {prev.name}
            </button>
            <button
              type="button"
              onClick={() => navigate({ page: "boss", bossId: next.id })}
              className="text-sm text-parchment-dim hover:text-rune"
            >
              {next.name} →
            </button>
          </div>
        )}
      </div>
    </SiteChrome>
  );
}
