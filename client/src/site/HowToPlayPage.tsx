import type { Grade } from "@dungeon-grades/shared";
import GradeToken from "../combat/GradeToken";
import SiteChrome from "./SiteChrome";
import { navigate } from "./siteNav";

const ROUNDS = [
  {
    title: "Form the line",
    body: "In the lobby, place six living soldiers (or every survivor if you’re understrength). Position 1 is the front — nearest the boss, hardest hits. Position 6 is the back — safer, better for fragile casters.",
  },
  {
    title: "Tokens drop",
    body: "Each magnet phase, the game draws grade tokens from your classroom’s pool for that room. You’ll see what’s coming before you commit.",
  },
  {
    title: "Move the Token Magnet",
    body: "Keys 1–6 (or click) move the magnet under a living soldier. That seat always claims exactly one token from the drop. Remaining tokens go to other living party members by proximity (adjacent seats claim more often).",
  },
  {
    title: "Drop Tokens",
    body: "Press Drop (or Space). Specialists resolve their grade effects — Runesingers first (they can rewrite grades), then the rest front to back. Then DoTs tick, then the boss and minions strike.",
  },
  {
    title: "Win, camp, wait",
    body: "Clear the boss → camp heal from living Vanguards → reform. The next room stays locked until your teacher enters the next test’s grades and opens it.",
  },
];

const GRADES = [
  { g: "A", note: "Best power — big hits, strong support, rare rewrites." },
  { g: "B", note: "Solid. Reliable damage and utility." },
  { g: "C", note: "Average. Still useful; some kits get risky." },
  { g: "D", note: "Weak. Small effects; watch backfires." },
  { g: "F", note: "Danger. Many classes punish the party or help the boss." },
];

export default function HowToPlayPage() {
  return (
    <SiteChrome active="how-to">
      <div className="mx-auto max-w-3xl px-4 py-12 md:py-16 space-y-12">
        <header className="space-y-3">
          <p className="text-rune text-xs tracking-[0.3em] uppercase font-semibold">
            Play guide
          </p>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight">
            How <span className="text-grade-a">Grade</span>Forge works
          </h1>
          <p className="text-parchment-dim text-lg leading-relaxed">
            You don’t need an invite code to learn the rules. Read this, study
            the{" "}
            <button
              type="button"
              className="text-rune underline underline-offset-2"
              onClick={() => navigate({ page: "characters" })}
            >
              characters
            </button>{" "}
            and{" "}
            <button
              type="button"
              className="text-rune underline underline-offset-2"
              onClick={() => navigate({ page: "bosses" })}
            >
              bosses
            </button>
            , then join your team when your teacher is ready.
          </p>
        </header>

        <section className="rounded-2xl border border-parchment/12 bg-navy-light/40 p-6 md:p-8 space-y-4">
          <h2 className="text-xl font-bold">The big idea</h2>
          <p className="text-parchment-dim leading-relaxed">
            Your class takes a real test. The teacher enters those letter grades
            into GradeForge and opens one dungeon room. Those grades become the{" "}
            <strong className="text-parchment">token pool</strong> for that room
            — the fuel your party spends each round. Better tests, better
            tokens. Worse tests… you still fight, but the dungeon gets meaner.
          </p>
          <p className="text-parchment-dim leading-relaxed">
            Each team shares <strong className="text-parchment">one computer</strong>.
            Everyone at the table decides where the magnet goes. Last input
            wins.
          </p>
        </section>

        <section className="space-y-6">
          <h2 className="text-xl font-bold">A fight, step by step</h2>
          <ol className="space-y-5">
            {ROUNDS.map((r, i) => (
              <li
                key={r.title}
                className="flex gap-4 rounded-xl border border-parchment/10 bg-navy/40 p-4 md:p-5"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-crimson/30 text-sm font-bold text-parchment">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-semibold text-parchment">{r.title}</h3>
                  <p className="mt-1 text-sm text-parchment-dim leading-relaxed">
                    {r.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-bold">What each grade means</h2>
          <p className="text-sm text-parchment-dim">
            Every specialist has different effects per grade. Open a character
            page for the full list. Rough guide:
          </p>
          <ul className="grid sm:grid-cols-5 gap-2">
            {GRADES.map((g) => (
              <li
                key={g.g}
                className="rounded-xl border border-parchment/15 bg-navy-light/50 p-3 text-center flex flex-col items-center"
              >
                <GradeToken grade={g.g as Grade} size="lg" />
                <p className="mt-2 text-[11px] text-parchment-dim leading-snug">
                  {g.note}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-parchment/12 bg-navy-light/40 p-6 md:p-8 space-y-3">
          <h2 className="text-xl font-bold">Who clears what</h2>
          <p className="text-sm text-parchment-dim leading-relaxed">
            Sticky effects need the right specialist. Full grade lists are on each{" "}
            <button
              type="button"
              className="text-rune underline underline-offset-2"
              onClick={() => navigate({ page: "characters" })}
            >
              character
            </button>{" "}
            page.
          </p>
          <ul className="space-y-2 text-sm text-parchment-dim">
            <li>
              <strong className="text-parchment">Healer</strong> — heals and
              clears <strong className="text-parchment">Fire, Ice, Poison</strong>{" "}
              DoTs (not Frozen, Slime, or Marks).
            </li>
            <li>
              <strong className="text-parchment">Fire Mage</strong> — only class
              that burns off <strong className="text-parchment">Frozen</strong>{" "}
              (A = front, B = back). Those grades also clear Ice and Slime on
              that half of the line. Seat them mid/back against frost bosses.
            </li>
            <li>
              <strong className="text-parchment">Doomcaller</strong> — strips
              DoTs and Marks; good grades move DoTs onto the boss. Marks never
              transfer. Cannot clear Frozen.
            </li>
          </ul>
        </section>

        <section className="rounded-2xl border border-rune/25 bg-rune/5 p-6 space-y-3">
          <h2 className="text-xl font-bold text-rune">Classroom rules of thumb</h2>
          <ul className="list-disc list-inside space-y-2 text-sm text-parchment-dim">
            <li>Deaths are permanent until the teacher resets the team.</li>
            <li>Living Vanguards help heal between rooms — keep at least one if you can.</li>
            <li>Poison and Fire clouds get worse every round if left up — cleanse or transfer.</li>
            <li>If the classroom is paused, wait for your teacher to resume.</li>
            <li>Wrong invite code? You’re on the wrong team (or period).</li>
          </ul>
        </section>

        <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate({ page: "join" })}
            className="rounded-xl bg-crimson hover:bg-crimson-bright px-5 py-2.5 font-semibold"
          >
            Enter invite code
          </button>
          <button
            type="button"
            onClick={() => navigate({ page: "characters" })}
            className="rounded-xl border border-parchment/25 px-5 py-2.5 font-semibold hover:bg-navy-light"
          >
            Characters
          </button>
          <button
            type="button"
            onClick={() => navigate({ page: "bosses" })}
            className="rounded-xl border border-parchment/25 px-5 py-2.5 font-semibold hover:bg-navy-light"
          >
            Bosses
          </button>
        </div>
      </div>
    </SiteChrome>
  );
}
