import SiteChrome from "./SiteChrome";
import { navigate } from "./siteNav";

const FEATURES = [
  {
    title: "Grades become power",
    body: "Your class test scores forge into token pools. Stronger tests mean stronger drops — every letter A through F matters in a fight.",
    accent: "text-grade-a",
  },
  {
    title: "One control: the Token Magnet",
    body: "Each round, move the magnet with keys 1–6, then drop tokens. The magnet always claims one token; proximity decides the rest.",
    accent: "text-rune",
  },
  {
    title: "One room per test",
    body: "Teachers open a room after grades are entered. Clear it, camp, and wait for the next test day to unlock the next boss.",
    accent: "text-crimson-bright",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Get your invite code",
    body: "Your teacher creates a team for your table. One Chromebook. One code.",
  },
  {
    n: "02",
    title: "Form a party of six",
    body: "Pick specialists from a roster of 21 — tanks, healers, mages, archers, and more. Front stands nearest the boss.",
  },
  {
    n: "03",
    title: "Enter when the room opens",
    body: "See the full campaign path, but only the room your teacher opened is playable. Study bosses here before you go in.",
  },
  {
    n: "04",
    title: "Magnet, drop, survive",
    body: "Claim grade tokens, trigger specialist abilities, clear minions, beat the boss. Fallen stay fallen until a reset.",
  },
];

export default function LandingPage() {
  return (
    <SiteChrome active="home">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-parchment/10">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url(/marketing/hero.jpg)" }}
          aria-hidden
        />
        <div className="absolute inset-0 bg-gradient-to-r from-navy via-navy/90 to-navy/40" />
        <div className="absolute inset-0 bg-gradient-to-t from-navy via-transparent to-navy/50" />

        <div className="relative mx-auto max-w-6xl px-4 py-20 md:py-28 lg:py-32">
          <p className="text-rune text-xs md:text-sm tracking-[0.35em] uppercase font-semibold mb-4">
            Classroom dungeon crawler
          </p>
          <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-[0.95] max-w-3xl">
            <span className="text-grade-a">Grade</span>
            <span className="text-parchment">Forge</span>
          </h1>
          <p className="mt-6 text-lg md:text-xl text-parchment-dim max-w-xl leading-relaxed">
            Turn test scores into power tokens. Lead a party of fantasy
            specialists. Survive the dungeon — one room for every test your
            teacher grades.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => navigate({ page: "join" })}
              className="rounded-xl bg-crimson hover:bg-crimson-bright px-6 py-3.5 text-base font-bold shadow-xl shadow-crimson/30 transition"
            >
              Enter invite code
            </button>
            <button
              type="button"
              onClick={() => navigate({ page: "how-to" })}
              className="rounded-xl border border-parchment/25 bg-navy/50 hover:bg-navy-light px-6 py-3.5 text-base font-semibold backdrop-blur transition"
            >
              How to play
            </button>
            <button
              type="button"
              onClick={() => navigate({ page: "characters" })}
              className="rounded-xl border border-rune/40 text-rune hover:bg-rune/10 px-6 py-3.5 text-base font-semibold transition"
            >
              Meet the roster
            </button>
          </div>
        </div>
      </section>

      {/* Feature strip */}
      <section className="mx-auto max-w-6xl px-4 py-16 md:py-20">
        <div className="grid md:grid-cols-3 gap-6">
          {FEATURES.map((f) => (
            <article
              key={f.title}
              className="rounded-2xl border border-parchment/12 bg-navy-light/40 p-6 hover:border-rune/30 transition shadow-lg shadow-black/20"
            >
              <h2 className={`text-lg font-bold ${f.accent}`}>{f.title}</h2>
              <p className="mt-3 text-sm text-parchment-dim leading-relaxed">
                {f.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* How it works teaser */}
      <section className="border-y border-parchment/10 bg-navy-light/20">
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-20 grid lg:grid-cols-2 gap-10 items-center">
          <div
            className="relative rounded-2xl overflow-hidden border border-parchment/15 shadow-2xl shadow-black/40 aspect-video bg-navy"
          >
            <img
              src="/marketing/tokens.jpg"
              alt="Glowing grade tokens falling in a dark dungeon"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-navy/80 to-transparent" />
            <p className="absolute bottom-4 left-4 right-4 text-sm text-parchment/90 font-medium">
              Letter grades drop as tokens. Your magnet claims power for the
              line.
            </p>
          </div>
          <div className="space-y-6">
            <h2 className="text-3xl md:text-4xl font-black tracking-tight">
              From quiz to quest
            </h2>
            <ol className="space-y-4">
              {STEPS.map((s) => (
                <li key={s.n} className="flex gap-4">
                  <span className="text-grade-a font-mono text-sm font-bold shrink-0 pt-0.5">
                    {s.n}
                  </span>
                  <div>
                    <div className="font-semibold text-parchment">{s.title}</div>
                    <p className="text-sm text-parchment-dim mt-0.5 leading-relaxed">
                      {s.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            <button
              type="button"
              onClick={() => navigate({ page: "how-to" })}
              className="text-rune font-semibold hover:underline underline-offset-4"
            >
              Full play guide →
            </button>
          </div>
        </div>
      </section>

      {/* Codex CTAs */}
      <section className="mx-auto max-w-6xl px-4 py-16 md:py-20">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="text-3xl md:text-4xl font-black">Study before you fight</h2>
          <p className="mt-3 text-parchment-dim">
            No invite code required. Browse every specialist and every boss on
            the campaign path — know what A through F actually does.
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <button
            type="button"
            onClick={() => navigate({ page: "characters" })}
            className="group relative overflow-hidden rounded-2xl border border-parchment/15 bg-navy-light/50 p-8 text-left hover:border-rune/40 transition shadow-xl"
          >
            <div className="absolute -right-6 -top-6 w-40 h-40 rounded-full bg-rune/10 group-hover:bg-rune/20 transition blur-2xl" />
            <p className="text-xs uppercase tracking-[0.3em] text-rune">Codex</p>
            <h3 className="mt-2 text-2xl font-bold">Characters</h3>
            <p className="mt-2 text-sm text-parchment-dim max-w-sm">
              Nine specialist classes. Grade-by-grade abilities, HP, and roles —
              Vanguard to Runesinger.
            </p>
            <span className="mt-6 inline-block text-rune font-semibold group-hover:translate-x-1 transition">
              Open roster →
            </span>
          </button>
          <button
            type="button"
            onClick={() => navigate({ page: "bosses" })}
            className="group relative overflow-hidden rounded-2xl border border-parchment/15 bg-navy-light/50 p-8 text-left hover:border-crimson-bright/50 transition shadow-xl"
          >
            <div className="absolute -right-6 -top-6 w-40 h-40 rounded-full bg-crimson/15 group-hover:bg-crimson/25 transition blur-2xl" />
            <p className="text-xs uppercase tracking-[0.3em] text-crimson-bright">
              Codex
            </p>
            <h3 className="mt-2 text-2xl font-bold">Bosses</h3>
            <p className="mt-2 text-sm text-parchment-dim max-w-sm">
              Six rooms. Moss Grub to Bone Colossus. Attacks, minions, and what
              to watch for.
            </p>
            <span className="mt-6 inline-block text-crimson-bright font-semibold group-hover:translate-x-1 transition">
              Open bestiary →
            </span>
          </button>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="border-t border-parchment/10 bg-gradient-to-b from-crimson/10 to-transparent">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center space-y-4">
          <h2 className="text-2xl md:text-3xl font-black">Ready when your teacher is</h2>
          <p className="text-parchment-dim max-w-lg mx-auto text-sm md:text-base">
            Enter the invite code for your table. Form up. When the room opens —
            drop tokens and hold the line.
          </p>
          <button
            type="button"
            onClick={() => navigate({ page: "join" })}
            className="rounded-xl bg-crimson hover:bg-crimson-bright px-8 py-3.5 font-bold shadow-lg shadow-crimson/25"
          >
            Enter invite code
          </button>
        </div>
      </section>
    </SiteChrome>
  );
}
