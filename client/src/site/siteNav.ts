/** Hash-based marketing site routes (no extra router dependency). */

export type SiteRoute =
  | { page: "home" }
  | { page: "how-to" }
  | { page: "characters" }
  | { page: "character"; archetype: string }
  | { page: "bosses" }
  | { page: "boss"; bossId: string }
  | { page: "join" }
  | { page: "teacher" };

export function parseHash(hash: string): SiteRoute {
  const raw = (hash || "#/").replace(/^#/, "") || "/";
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  const parts = path.split("/").filter(Boolean);

  if (parts.length === 0) return { page: "home" };
  const head = parts[0].toLowerCase();

  if (head === "how-to" || head === "howto" || head === "play") {
    return { page: "how-to" };
  }
  if (head === "characters" || head === "roster") {
    if (parts[1]) return { page: "character", archetype: parts[1] };
    return { page: "characters" };
  }
  if (head === "bosses" || head === "foes") {
    if (parts[1]) return { page: "boss", bossId: parts[1] };
    return { page: "bosses" };
  }
  if (head === "join" || head === "student") return { page: "join" };
  if (head === "teacher") return { page: "teacher" };
  return { page: "home" };
}

export function routeHash(route: SiteRoute): string {
  switch (route.page) {
    case "home":
      return "#/";
    case "how-to":
      return "#/how-to";
    case "characters":
      return "#/characters";
    case "character":
      return `#/characters/${encodeURIComponent(route.archetype)}`;
    case "bosses":
      return "#/bosses";
    case "boss":
      return `#/bosses/${encodeURIComponent(route.bossId)}`;
    case "join":
      return "#/join";
    case "teacher":
      return "#/teacher";
  }
}

export function navigate(route: SiteRoute): void {
  const next = routeHash(route);
  if (window.location.hash !== next) {
    window.location.hash = next;
  } else {
    // Force re-read for same hash
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }
}
