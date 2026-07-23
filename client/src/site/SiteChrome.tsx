import type { ReactNode } from "react";
import { navigate, type SiteRoute } from "./siteNav";

const NAV: { label: string; route: SiteRoute }[] = [
  { label: "Home", route: { page: "home" } },
  { label: "How to Play", route: { page: "how-to" } },
  { label: "Characters", route: { page: "characters" } },
  { label: "Bosses", route: { page: "bosses" } },
];

export default function SiteChrome({
  children,
  active,
}: {
  children: ReactNode;
  active?: SiteRoute["page"];
}) {
  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-50 border-b border-parchment/10 bg-navy/90 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-4 py-3 flex flex-wrap items-center gap-3 justify-between">
          <button
            type="button"
            onClick={() => navigate({ page: "home" })}
            className="group flex items-baseline gap-2 text-left"
          >
            <span className="text-xl md:text-2xl font-black tracking-tight">
              <span className="text-grade-a">Grade</span>
              <span className="text-parchment">Forge</span>
            </span>
            <span className="hidden sm:inline text-[10px] uppercase tracking-[0.25em] text-rune/80 group-hover:text-rune">
              Classroom Campaign
            </span>
          </button>

          <nav className="flex flex-wrap items-center gap-1 md:gap-2 text-sm">
            {NAV.map((item) => {
              const isActive =
                active === item.route.page ||
                (active === "character" && item.route.page === "characters") ||
                (active === "boss" && item.route.page === "bosses");
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => navigate(item.route)}
                  className={`rounded-lg px-2.5 py-1.5 transition ${
                    isActive
                      ? "bg-rune/15 text-rune font-semibold"
                      : "text-parchment-dim hover:text-parchment hover:bg-navy-light"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => navigate({ page: "join" })}
              className="ml-1 rounded-lg bg-crimson hover:bg-crimson-bright px-3 py-1.5 font-semibold text-parchment shadow-lg shadow-crimson/20"
            >
              Enter Code
            </button>
            <button
              type="button"
              onClick={() => navigate({ page: "teacher" })}
              className="rounded-lg border border-parchment/20 px-2.5 py-1.5 text-parchment-dim hover:border-parchment/40 hover:text-parchment"
            >
              Teacher
            </button>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-parchment/10 bg-navy/80 mt-auto">
        <div className="mx-auto max-w-6xl px-4 py-8 flex flex-col md:flex-row gap-4 md:items-center justify-between text-sm text-parchment-dim">
          <div>
            <div className="font-bold text-parchment">
              <span className="text-grade-a">Grade</span>Forge
            </div>
            <p className="mt-1 max-w-md">
              Test grades become power tokens. One Chromebook per team. Survive
              the dungeon — one room per test.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="hover:text-rune"
              onClick={() => navigate({ page: "how-to" })}
            >
              How to Play
            </button>
            <button
              type="button"
              className="hover:text-rune"
              onClick={() => navigate({ page: "characters" })}
            >
              Characters
            </button>
            <button
              type="button"
              className="hover:text-rune"
              onClick={() => navigate({ page: "bosses" })}
            >
              Bosses
            </button>
            <button
              type="button"
              className="hover:text-rune"
              onClick={() => navigate({ page: "teacher" })}
            >
              Teacher tools
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
