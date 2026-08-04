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
    body: "Press Drop (or Space). Specialists resolve their grade effects — Runesinger first (rewrites grades + hymn HoT), then the rest front to back. Then DoTs tick (poison, then gold hymn heals), then the boss and minions strike.",
  },
  {
    title: "Win, camp, wait",
    body: "Clear the boss → camp restores 30% of each living soldier’s missing HP → reform. The next room stays locked until your teacher enters the next test’s grades and opens it.",
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
          <h2 className="text-xl font-bold">The gap and the magnet</h2>
          <ul className="space-y-2 text-sm text-parchment-dim">
            <li>
              Only the <strong className="text-parchment">front seat (position 1)</strong> and{" "}
              <strong className="text-parchment">Archers</strong> can hit minions in the gap.
              Everyone else only hits the boss.
            </li>
            <li>
              Minions <strong className="text-parchment">always shoot the magnet seat</strong> —
              and if two fire, the second shot hits even harder. Don’t park the magnet on a
              soft ally when the gap is full.
            </li>
            <li>
              Colored dots on a portrait (bottom-left) show which DoTs that class cleanses.
            </li>
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
              <strong className="text-parchment">Shield Maiden</strong> — clears{" "}
              <strong className="text-parchment">Fire and Poison</strong> (A =
              all, B = front, C = back) plus one-round cover on herself and the
              ally closest to dying.
            </li>
            <li>
              <strong className="text-parchment">Fire Mage</strong> — only class
              that burns off <strong className="text-parchment">Frozen</strong>{" "}
              and clears <strong className="text-parchment">Ice and Slime</strong>{" "}
              (A = front, B = back). Match the DoT color to the right specialist.
            </li>
            <li>
              <strong className="text-parchment">Healer</strong> — instant triage
              (A all, B two lowest, C one, D tiny all). Uncharged: no cleanse.
              With Necro Life Power: normal heal still applies; Fire/Poison seats
              also wash (no purple bonus).{" "}
              <strong className="text-parchment">Back seat only</strong> — same
              slot as Runesinger (pick one support, not both).
            </li>
            <li>
              <strong className="text-parchment">Necromancer</strong> — drains
              the boss and grants <strong className="text-parchment">Life Power</strong>{" "}
              to the Healer or Runesinger. Their next heal/hymn still mends;
              Fire/Poison seats also <em>wash</em> (no purple); clean seats get
              purple bonus. Maiden is still the primary one-token cleanse.
            </li>
            <li>
              <strong className="text-parchment">Vanguard / Spearman A–B</strong>{" "}
              — <strong className="text-parchment">Last Stand</strong>: the next
              lethal hit leaves allies at 1 HP once (A = all, B = front). Survives
              the boss window, then expires.
            </li>
            <li>
              <strong className="text-parchment">Thundercaller A</strong> — hits
              for 14 (plus stun/charge), or if someone is down: shocks their
              heart back at low HP. They skip their next claim (dazed). Once per
              soldier per fight.
            </li>
          </ul>
        </section>

        <section className="rounded-2xl border border-rune/25 bg-rune/5 p-6 space-y-3">
          <h2 className="text-xl font-bold text-rune">Classroom rules of thumb</h2>
          <ul className="list-disc list-inside space-y-2 text-sm text-parchment-dim">
            <li>Deaths are permanent until the teacher resets the team (Thunder A can buy one emergency return).</li>
            <li>After a room clear, camp restores 30% of each living soldier’s missing HP (dead stay dead).</li>
            <li>
              Poison and Fire clouds get worse every round if left up — cleanse
              them with the <strong className="text-parchment">Shield Maiden</strong>.
            </li>
            <li>
              Healer and Runesinger share the back seat — only one of them on the
              line. Healer = instant triage heals; Runesinger = grade rewrite +
              slow gold hymn HoT. Necromancer Life Power adds wash/purple on top of
              either’s normal mend.
            </li>
            <li>Ice, Slime, and Frozen → Fire Mage. Match the color on the portrait.</li>
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
