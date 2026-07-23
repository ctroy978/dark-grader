import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  ARCHETYPE_ICONS,
  ARCHETYPE_MAX_HP,
  getArchetypeScout,
  type Archetype,
  type BossScout,
  type Grade,
} from "@dungeon-grades/shared";
import { api, getSocket, type EnrichedTeam } from "../api";
import {
  isMusicEnabled,
  isMuted,
  loadAudioManifest,
  loadAudioPrefs,
  setAmbientDesired,
  setMusicEnabled,
  setMuted,
  unlockAmbientFromGesture,
} from "../audio";
import { PlaceholderPortrait } from "../combat/PlaceholderPortrait";

const PARTY_SIZE = 6;

const GRADE_TEXT: Record<Grade, string> = {
  A: "text-grade-a",
  B: "text-grade-b",
  C: "text-grade-c",
  D: "text-grade-d",
  F: "text-grade-f",
};

const INTEL_PANEL_W = 320; // ~20rem; used for viewport clamping

/**
 * Click-to-open ability intel for a specialist (no hover on the roster).
 * Standing portrait in a portaled panel. Closes when the pointer leaves the
 * panel or when the player adds/removes via the lineup button.
 */
function CharacterIntel({
  open,
  onClose,
  archetype,
  soldierName,
  currentHp,
  maxHp,
  inLine,
  onAddToLineup,
  children,
}: {
  open: boolean;
  onClose: () => void;
  archetype: Archetype;
  soldierName?: string;
  /** Live HP for this soldier (after fights). Falls back to class max. */
  currentHp?: number;
  maxHp?: number;
  /** Already placed in the formation line */
  inLine?: boolean;
  /** Place or remove from the formation line */
  onAddToLineup: () => void;
  children: ReactNode;
}) {
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );
  const wrapRef = useRef<HTMLDivElement>(null);
  const scout = useMemo(() => getArchetypeScout(archetype), [archetype]);
  const hpMax = maxHp ?? scout.maxHp;
  const hpNow = currentHp ?? hpMax;

  const placePanel = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margin = 8;
    const panelH = 360;
    let top = r.bottom + 6;
    if (top + Math.min(panelH, window.innerHeight * 0.7) > window.innerHeight - margin) {
      top = Math.max(margin, r.top - 6 - Math.min(panelH, window.innerHeight * 0.65));
    }
    let left = r.left;
    if (left + INTEL_PANEL_W > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - INTEL_PANEL_W - margin);
    }
    if (left < margin) left = margin;
    setCoords({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    placePanel();
    const onMove = () => placePanel();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, placePanel]);

  const panel =
    open &&
    coords &&
    createPortal(
      <div
        role="dialog"
        aria-label={`${scout.displayName} abilities`}
        className="fixed z-[200] w-[min(20rem,calc(100vw-1rem))] max-h-[min(70vh,28rem)] overflow-y-auto rounded-xl border border-parchment/25 bg-navy/98 p-3 shadow-xl shadow-black/50 ring-1 ring-rune/15"
        style={{ top: coords.top, left: coords.left }}
        onMouseLeave={onClose}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex gap-3">
          <PlaceholderPortrait
            kind={{ role: "party", archetype }}
            pose="standing"
            className="h-24 w-16 shrink-0 shadow-md ring-1 ring-parchment/30"
          />
          <div className="min-w-0 flex-1 space-y-1">
            {soldierName && (
              <div className="font-semibold text-parchment leading-tight truncate">
                {soldierName}
              </div>
            )}
            <div
              className={`text-sm leading-tight ${
                soldierName ? "text-parchment-dim" : "font-semibold text-parchment"
              }`}
            >
              <span className="mr-1">{ARCHETYPE_ICONS[archetype]}</span>
              {scout.displayName}
            </div>
            <div className="text-xs text-parchment-dim">
              <span className="text-parchment">
                {hpNow} of {hpMax}
              </span>
              {" HP"}
              {hpNow < hpMax && (
                <span className="text-grade-d"> · wounded</span>
              )}
            </div>
            <p className="text-xs text-parchment/90 leading-snug">{scout.summary}</p>
          </div>
        </div>

        <div className="mt-3 space-y-1.5">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-rune">
            Grade effects
          </h3>
          <ul className="space-y-1">
            {scout.grades.map((g) => (
              <li key={g.grade} className="text-xs leading-snug">
                <span className={`font-bold ${GRADE_TEXT[g.grade]}`}>{g.grade}</span>
                <span className="text-parchment-dim"> — {g.effect}</span>
                {g.risk && (
                  <span className="block pl-4 text-[11px] text-grade-f/90">
                    Risk: {g.risk}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <button
          type="button"
          className={`mt-3 w-full rounded-lg px-3 py-2 text-sm font-semibold transition ${
            inLine
              ? "border border-parchment/25 bg-navy-light hover:bg-navy"
              : "bg-rune/20 text-rune border border-rune/40 hover:bg-rune/30"
          }`}
          onClick={(e) => {
            e.stopPropagation();
            onAddToLineup();
            onClose();
          }}
        >
          {inLine ? "Remove from lineup" : "Add to lineup"}
        </button>
      </div>,
      document.body,
    );

  return (
    <div ref={wrapRef} className="relative">
      {children}
      {panel}
    </div>
  );
}

/** Empty formation slots: index 0 = position 1 (front), index 5 = position 6 (back). */
function emptySlots(): (string | null)[] {
  return Array.from({ length: PARTY_SIZE }, () => null);
}

/**
 * Next-boss chip in the campaign bar: small standing portrait + name.
 * Hover (or tap/focus) reveals attacks and minions — no party-comp advice.
 */
function NextBossIntel({
  scout,
  fallbackName,
}: {
  scout: BossScout | null | undefined;
  fallbackName?: string;
}) {
  const [open, setOpen] = useState(false);
  const name = scout?.name ?? fallbackName ?? "—";
  const bossId = scout?.id;

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        className="flex items-center gap-2 rounded-lg border border-transparent px-1.5 py-0.5 text-left text-parchment-dim transition hover:border-parchment/20 hover:bg-navy-light/60 focus:border-rune/40 focus:outline-none focus:ring-1 focus:ring-rune/40"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="shrink-0 text-sm">Next boss:</span>
        {bossId ? (
          <PlaceholderPortrait
            kind={{ role: "boss", bossId }}
            pose="standing"
            className="h-10 w-8 shrink-0 shadow-md ring-1 ring-parchment/25"
          />
        ) : null}
        <strong className="text-parchment underline decoration-parchment/30 decoration-dotted underline-offset-2">
          {name}
        </strong>
        <span className="text-[10px] uppercase tracking-wide text-rune/80">
          intel
        </span>
      </button>

      {open && scout && (
        <div
          role="dialog"
          aria-label={`${scout.name} fight intel`}
          className="absolute right-0 top-full z-40 mt-1.5 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-parchment/25 bg-navy/98 p-3 shadow-xl shadow-black/50 ring-1 ring-rune/15"
        >
          <div className="flex gap-3">
            <PlaceholderPortrait
              kind={{ role: "boss", bossId: scout.id }}
              pose="standing"
              className="h-24 w-16 shrink-0 shadow-md ring-1 ring-parchment/30"
            />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="font-semibold text-parchment leading-tight">
                {scout.name}
              </div>
              <div className="text-xs text-parchment-dim">
                {scout.difficulty}
                {" · "}
                <span className="text-parchment">{scout.maxHp} HP</span>
                {scout.traits.length > 0 && (
                  <>
                    {" · "}
                    {scout.traits.join(", ")}
                  </>
                )}
              </div>
              {scout.summary && (
                <p className="text-xs text-parchment/90 leading-snug">
                  {scout.summary}
                </p>
              )}
            </div>
          </div>

          {scout.attacks.length > 0 && (
            <div className="mt-3 space-y-1.5">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-rune">
                Attacks
              </h3>
              <ul className="space-y-1.5">
                {scout.attacks.map((a) => (
                  <li key={a.id} className="text-xs leading-snug">
                    <span className="font-semibold text-parchment">{a.name}</span>
                    <span className="text-parchment-dim"> — {a.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-3 space-y-1.5">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-rune">
              Minions
            </h3>
            {scout.minions.length === 0 ? (
              <p className="text-xs text-parchment-dim">
                No minions — the boss does not summon adds.
              </p>
            ) : (
              <ul className="space-y-2">
                {scout.minions.map((m) => (
                  <li key={m.id} className="flex gap-2 text-xs leading-snug">
                    <PlaceholderPortrait
                      kind={{ role: "minion", name: m.name }}
                      pose="standing"
                      className="h-9 w-7 shrink-0 ring-1 ring-parchment/20"
                    />
                    <div className="min-w-0">
                      <div className="font-semibold text-parchment">
                        {m.name}
                        <span className="ml-1 font-normal text-parchment-dim">
                          (up to {m.maxCount} · {m.maxHp} HP · {m.damage} dmg)
                        </span>
                      </div>
                      <p className="text-parchment-dim">{m.note}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {scout.enrageNote && (
            <p className="mt-3 text-xs text-grade-d border-t border-parchment/10 pt-2">
              {scout.enrageNote}
            </p>
          )}

          <p className="mt-2 text-[10px] text-parchment-dim/80">
            Hover or tap for intel. Plan positions for what this boss actually does.
          </p>
        </div>
      )}
    </div>
  );
}

function slotsFromTeam(team: EnrichedTeam): (string | null)[] {
  const slots = emptySlots();
  if (team.activePartyIds.length > 0) {
    team.activePartyIds.forEach((id, i) => {
      if (i < PARTY_SIZE) slots[i] = id;
    });
    return slots;
  }
  // Prefer soldiers that already have positions
  for (const s of team.roster) {
    if (s.position && s.position >= 1 && s.position <= 6 && s.alive) {
      slots[s.position - 1] = s.id;
    }
  }
  return slots;
}

export default function LobbyScreen({
  team,
  onTeamUpdate,
  onLeave,
}: {
  team: EnrichedTeam;
  onTeamUpdate: (t: EnrichedTeam) => void;
  onLeave: () => void;
}) {
  const [slots, setSlots] = useState<(string | null)[]>(() => slotsFromTeam(team));
  const [activeSlot, setActiveSlot] = useState<number | null>(null); // 0..5
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  /** Roster ability popup — click to open; only one at a time */
  const [intelSoldierId, setIntelSoldierId] = useState<string | null>(null);
  const [mute, setMuteState] = useState(false);
  const [musicOn, setMusicOn] = useState(true);

  useEffect(() => {
    loadAudioPrefs();
    setMuteState(isMuted());
    setMusicOn(isMusicEnabled());
    void loadAudioManifest().then(() => {
      setAmbientDesired(true);
    });
    return () => {
      setAmbientDesired(false);
    };
  }, []);

  useEffect(() => {
    const s = getSocket();
    s.emit("subscribe:team", team.teamId);
    const onState = (t: EnrichedTeam) => {
      onTeamUpdate(t);
      // If server has a party and local is empty, hydrate once
      setSlots((prev) => {
        if (prev.every((x) => !x) && t.activePartyIds.length > 0) {
          return slotsFromTeam(t);
        }
        return prev;
      });
    };
    s.on("team:state", onState);
    return () => {
      s.off("team:state", onState);
    };
  }, [team.teamId, onTeamUpdate]);

  const alive = useMemo(
    () => team.roster.filter((r) => r.alive),
    [team.roster],
  );
  /** Full line of 6, or every survivor when the roster is understrength. */
  const requiredSize = Math.min(PARTY_SIZE, alive.length);
  const understrength = alive.length > 0 && alive.length < PARTY_SIZE;

  const filledIds = useMemo(
    () => slots.filter((id): id is string => !!id),
    [slots],
  );
  const filledCount = filledIds.length;
  const complete =
    requiredSize > 0 &&
    filledCount === requiredSize &&
    new Set(filledIds).size === requiredSize &&
    (!understrength ||
      alive.every((s) => filledIds.includes(s.id)));

  const soldierById = useMemo(() => {
    const m = new Map(team.roster.map((s) => [s.id, s]));
    return m;
  }, [team.roster]);

  function clearFormation() {
    setSlots(emptySlots());
    setActiveSlot(0);
    setSavedOk(false);
  }

  function removeFromSlot(index: number) {
    setSlots((prev) => {
      const next = [...prev];
      next[index] = null;
      return next;
    });
    setSavedOk(false);
    setActiveSlot(index);
  }

  /** Place soldier into active slot, or first empty slot. Click again to remove. */
  function placeSoldier(id: string) {
    const soldier = soldierById.get(id);
    if (!soldier?.alive) return;
    if (requiredSize <= 0) return;

    setSlots((prev) => {
      const next = [...prev];
      const existing = next.indexOf(id);

      // Already in line
      if (existing >= 0) {
        if (activeSlot === null || activeSlot === existing) {
          next[existing] = null; // remove
          return next;
        }
        // Move / swap into focused slot
        const displaced = next[activeSlot];
        next[activeSlot] = id;
        next[existing] = displaced ?? null;
        return next;
      }

      const filled = next.filter(Boolean).length;
      const target =
        activeSlot !== null ? activeSlot : next.findIndex((x) => x === null);
      if (target < 0) return prev;
      // Don't grow past required size unless replacing an occupied slot
      if (!next[target] && filled >= requiredSize) return prev;
      next[target] = id;
      return next;
    });
    setSavedOk(false);
  }

  /** Compact front→back ids for the API (no null holes). */
  function partyIdsFromSlots(): string[] {
    return slots.filter((id): id is string => !!id);
  }

  // After a place, auto-focus the next empty slot (front → back)
  useEffect(() => {
    const nextEmpty = slots.findIndex((x) => x === null);
    if (nextEmpty >= 0) {
      setActiveSlot((cur) => {
        if (cur === null) return nextEmpty;
        if (slots[cur] !== null) return nextEmpty;
        return cur;
      });
    }
  }, [slots]);

  async function saveParty() {
    if (!complete) {
      setError(
        understrength
          ? `Field all ${requiredSize} living soldiers before saving.`
          : "Fill all 6 positions before saving.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const t = await api.setRoster(team.teamId, partyIdsFromSlots());
      onTeamUpdate(t);
      setSlots(slotsFromTeam(t));
      setSavedOk(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save party");
      setSavedOk(false);
    } finally {
      setBusy(false);
    }
  }

  async function startFight() {
    if (!complete) {
      setError(
        understrength
          ? `Field all ${requiredSize} living soldiers before starting.`
          : "Fill all 6 positions before starting.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Always save formation first so order is on the server
      let t = await api.setRoster(team.teamId, partyIdsFromSlots());
      t = await api.startFight(team.teamId);
      onTeamUpdate(t);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start fight");
    } finally {
      setBusy(false);
    }
  }

  // Visual line: back (6) on left → front (1) on right (matches combat)
  const visualOrder = [5, 4, 3, 2, 1, 0]; // slot indices

  return (
    <div
      className="min-h-full p-4 md:p-6 max-w-5xl mx-auto space-y-5"
      onPointerDown={unlockAmbientFromGesture}
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{team.name}</h1>
          <p className="text-sm text-parchment-dim">
            Code{" "}
            <span className="text-rune tracking-widest">{team.inviteCode}</span>
            {" · "}
            Room {team.currentRoom ?? team.roomIndex + 1}
            {" / "}
            {team.campaignLength ?? "?"}
            {" · "}
            {alive.length} soldiers living
            {team.phase === "between_rooms" && (
              <span className="text-grade-a"> · Camp — reform for the next room</span>
            )}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <button
            type="button"
            title={musicOn ? "Turn lobby music off" : "Turn lobby music on"}
            onClick={() => {
              const next = !musicOn;
              setMusicEnabled(next);
              setMusicOn(next);
            }}
            className={`rounded-lg border px-2.5 py-1.5 text-xs ${
              musicOn
                ? "border-rune/50 text-rune"
                : "border-parchment/20 text-parchment-dim"
            }`}
          >
            {musicOn ? "🎵 Music" : "Music off"}
          </button>
          <button
            type="button"
            title="Mute all sound"
            onClick={() => {
              const next = !mute;
              setMuted(next);
              setMuteState(next);
            }}
            className="rounded-lg border border-parchment/20 px-2.5 py-1.5 text-sm"
          >
            {mute ? "🔇" : "🔊"}
          </button>
          <button
            type="button"
            onClick={onLeave}
            className="text-sm border border-parchment/20 rounded-lg px-3 py-1.5 hover:bg-navy-light"
          >
            Leave
          </button>
        </div>
      </header>

      {/* Campaign progress */}
      <section className="rounded-xl border border-parchment/15 bg-navy/50 p-4 space-y-2">
        <div className="flex flex-wrap justify-between gap-2 text-sm">
          <span className="font-semibold">
            Campaign · Room {team.currentRoom ?? team.roomIndex + 1} of{" "}
            {team.campaignLength ?? "?"}
            {team.isFinalRoom ? (
              <span className="text-grade-f ml-2">Final room</span>
            ) : null}
          </span>
          <NextBossIntel
            scout={team.nextBossScout}
            fallbackName={team.nextBossName}
          />
        </div>
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${team.campaignLength ?? 6}, minmax(0, 1fr))` }}>
          {Array.from({ length: team.campaignLength ?? 6 }).map((_, i) => {
            const cleared = (team.roomsCleared ?? team.roomIndex) > i;
            const current = (team.roomsCleared ?? team.roomIndex) === i;
            const gate = team.rooms?.find((r) => r.roomIndex === i);
            const open = gate?.open ?? false;
            const bossId = team.roomBossIds?.[i] ?? gate?.bossId;
            const bossLabel =
              bossId === "barrow_warden"
                ? "Warden*"
                : bossId
                  ? bossId
                      .split("_")
                      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                      .join(" ")
                  : `Room ${i + 1}`;
            const barClass = cleared
              ? "bg-grade-a"
              : current && open
                ? "bg-rune animate-pulse"
                : current && !open
                  ? "bg-grade-d/70 border border-grade-d/40"
                  : "bg-navy-light border border-parchment/20";
            const titleExtra = cleared
              ? "cleared"
              : current
                ? open
                  ? "open — ready"
                  : "locked — wait for teacher"
                : open
                  ? "open (not your room yet)"
                  : "locked";
            return (
              <div key={i} className="flex flex-col gap-0.5 min-w-0">
                <div
                  className={`h-2 w-full rounded-full ${barClass}`}
                  title={`Room ${i + 1}: ${bossLabel} · ${titleExtra}`}
                />
                <div
                  className={`text-[9px] md:text-[10px] truncate text-center leading-tight ${
                    current
                      ? open
                        ? "text-rune font-semibold"
                        : "text-grade-d font-semibold"
                      : cleared
                        ? "text-grade-a/80"
                        : "text-parchment-dim/70"
                  }`}
                  title={bossLabel}
                >
                  {i + 1}. {bossLabel}
                  {current && !open ? " 🔒" : ""}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-parchment-dim/60">
          * Warden is a placeholder boss until its full kit ships. Rooms stay locked
          until your teacher opens them after entering test grades.
        </p>
        {team.canStartCurrentRoom === false && team.startBlockedReason && (
          <p className="text-sm text-grade-d rounded-lg border border-grade-d/30 bg-navy/60 px-3 py-2">
            {team.startBlockedReason}
          </p>
        )}
        {team.phase === "between_rooms" && team.lastClearedBossName && (
          <p className="text-xs text-grade-a">
            Cleared {team.lastClearedBossName}. Living soldiers keep their HP — fallen
            stay gone.{" "}
            {team.canStartCurrentRoom
              ? understrength
                ? `Field all ${alive.length} survivors understrength for the next room.`
                : `Pick ${PARTY_SIZE} living soldiers for the next room.`
              : "Form a party when ready — the next room opens after the teacher enters the next test grades."}
          </p>
        )}
        {alive.length === 0 && (
          <p className="text-sm text-grade-f">
            No living soldiers left — ask the teacher to reset the team.
          </p>
        )}
        {understrength && (
          <p className="text-sm text-grade-d">
            Only {alive.length} living — you may continue <strong>understrength</strong>{" "}
            (field every survivor). Harder fight; teacher reset still available.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-rune/30 bg-navy-light/50 p-4 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-parchment">
              1. Form your party
              {understrength
                ? ` of ${requiredSize} (understrength)`
                : ` of ${PARTY_SIZE}`}
            </h2>
            <p className="text-sm text-parchment-dim mt-1 max-w-2xl">
              Click a <strong className="text-parchment">slot</strong>, then a soldier
              below — or click soldiers in order.{" "}
              <strong className="text-rune">Position 1 (front)</strong> stands nearest
              the boss and takes more hits.{" "}
              <strong className="text-parchment">Position 6 (back)</strong> is safer.
              You must set this line before every room, including the first.
              {understrength && (
                <>
                  {" "}
                  With attrition, place <strong className="text-parchment">all</strong>{" "}
                  living soldiers (order still matters).
                </>
              )}
            </p>
          </div>
          <div className="text-sm text-parchment-dim">
            Filled{" "}
            <span className={complete ? "text-grade-a font-bold" : "text-rune font-bold"}>
              {filledCount}/{requiredSize || PARTY_SIZE}
            </span>
          </div>
        </div>

        <div className="flex items-end justify-between text-[10px] uppercase tracking-wider text-parchment-dim px-1">
          <span>Back · safer</span>
          <span className="text-rune">Front · nearest boss →</span>
        </div>

        <div className="grid grid-cols-6 gap-1.5 md:gap-2">
          {visualOrder.map((slotIndex) => {
            const pos = slotIndex + 1;
            const id = slots[slotIndex];
            const s = id ? soldierById.get(id) : undefined;
            const isActive = activeSlot === slotIndex;
            // No ability popup on the line — hover must not block select/remove.
            return (
              <button
                key={pos}
                type="button"
                onClick={() => {
                  if (id && activeSlot === slotIndex) {
                    removeFromSlot(slotIndex);
                  } else {
                    setActiveSlot(slotIndex);
                  }
                }}
                className={`relative min-h-[7.5rem] w-full rounded-lg border-2 p-1.5 text-center transition flex flex-col items-center justify-center gap-0.5 ${
                  isActive
                    ? "border-rune bg-rune/10 ring-2 ring-rune/40"
                    : s
                      ? "border-parchment/30 bg-navy/80"
                      : "border-dashed border-parchment/25 bg-navy/40 hover:border-rune/40"
                }`}
              >
                <span
                  className={`text-[10px] font-bold ${
                    pos === 1 ? "text-rune" : "text-parchment-dim"
                  }`}
                >
                  #{pos}
                  {pos === 1 ? " FRONT" : pos === 6 ? " BACK" : ""}
                </span>
                {s ? (
                  <>
                    <span className="text-2xl">{ARCHETYPE_ICONS[s.archetype]}</span>
                    <span className="text-[11px] font-medium leading-tight truncate w-full">
                      {s.name}
                    </span>
                    <span className="text-[9px] text-parchment-dim">
                      {getArchetypeScout(s.archetype).displayName}
                    </span>
                    <span className="text-[9px] text-parchment-dim">
                      {s.currentHp}/{s.maxHp} HP
                    </span>
                  </>
                ) : (
                  <span className="text-parchment-dim/60 text-xs px-1">
                    {isActive ? "Pick a soldier ↓" : "Empty"}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={clearFormation}
            className="text-sm border border-parchment/20 rounded-lg px-3 py-1.5 hover:bg-navy"
          >
            Clear line
          </button>
          {activeSlot !== null && (
            <span className="text-sm text-rune self-center">
              Placing into position #{activeSlot + 1}
              {activeSlot === 0 ? " (front)" : activeSlot === 5 ? " (back)" : ""}…
            </span>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">2. Roster — click for abilities</h2>
        <p className="text-xs text-parchment-dim">
          Click a soldier to see grade abilities, then use <strong className="text-parchment">Add to lineup</strong> in
          the popup. Grayed-out soldiers are dead. Soldiers already in the line can be removed from the popup.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {team.roster.map((s) => {
            const inLine = slots.includes(s.id);
            const linePos = inLine ? slots.indexOf(s.id) + 1 : 0;
            const intelOpen = intelSoldierId === s.id;
            const card = (
              <button
                type="button"
                disabled={!s.alive}
                title={s.alive ? "Click for abilities" : undefined}
                onClick={() => {
                  if (!s.alive) return;
                  // Click opens abilities; place only via the popup button
                  setIntelSoldierId((cur) => (cur === s.id ? null : s.id));
                }}
                className={`group w-full text-left rounded-lg border p-3 transition ${
                  !s.alive
                    ? "opacity-30 border-parchment/10 cursor-not-allowed"
                    : intelOpen
                      ? "border-rune bg-rune/10 ring-1 ring-rune/40"
                      : inLine
                        ? "border-rune/60 bg-navy-light/80"
                        : "border-parchment/15 bg-navy/60 hover:border-rune/50 hover:bg-navy-light"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">{ARCHETYPE_ICONS[s.archetype]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {inLine && (
                        <span className="text-rune mr-1 text-sm">In #{linePos}</span>
                      )}
                      {s.name}
                    </div>
                    <div className="text-xs text-parchment-dim">
                      {getArchetypeScout(s.archetype).displayName} · {s.currentHp}/
                      {s.maxHp || ARCHETYPE_MAX_HP[s.archetype]} HP
                      {!s.alive && " · fallen"}
                    </div>
                  </div>
                  {s.alive && (
                    <span
                      className={`shrink-0 self-center rounded-full border text-[10px] font-semibold leading-none w-5 h-5 inline-flex items-center justify-center transition ${
                        intelOpen
                          ? "border-rune/50 text-rune bg-rune/10"
                          : "border-parchment/20 text-parchment-dim/55 group-hover:border-parchment/35 group-hover:text-parchment-dim"
                      }`}
                      aria-hidden
                    >
                      i
                    </span>
                  )}
                </div>
              </button>
            );
            return (
              <div key={s.id} className="min-w-0">
                {s.alive ? (
                  <CharacterIntel
                    open={intelOpen}
                    onClose={() =>
                      setIntelSoldierId((cur) => (cur === s.id ? null : cur))
                    }
                    archetype={s.archetype}
                    soldierName={s.name}
                    currentHp={s.currentHp}
                    maxHp={s.maxHp || ARCHETYPE_MAX_HP[s.archetype]}
                    inLine={inLine}
                    onAddToLineup={() => placeSoldier(s.id)}
                  >
                    {card}
                  </CharacterIntel>
                ) : (
                  card
                )}
              </div>
            );
          })}
        </div>
      </section>

      {error && (
        <p className="text-grade-f text-sm rounded-lg border border-grade-f/40 bg-crimson/20 px-3 py-2">
          {error}
        </p>
      )}
      {savedOk && !error && (
        <p className="text-grade-a text-sm">
          Party saved on the server.
          {team.canStartCurrentRoom
            ? " Ready to enter when your lineup is set."
            : " Waiting for the teacher to open this room."}
        </p>
      )}

      <section className="sticky bottom-3 rounded-xl border border-parchment/15 bg-navy/95 p-3 flex flex-wrap gap-2 items-center shadow-lg">
        <span className="text-sm text-parchment-dim mr-auto">
          {alive.length === 0
            ? "No living soldiers — teacher reset required."
            : team.canStartCurrentRoom === false
              ? team.startBlockedReason ?? "This room is locked."
              : complete
                ? understrength
                  ? "Understrength lineup ready — save or enter."
                  : "Lineup complete — save or enter the dungeon."
                : `Choose ${Math.max(0, requiredSize - filledCount)} more soldier(s).`}
        </span>
        <button
          type="button"
          disabled={busy || !complete}
          onClick={() => void saveParty()}
          className="rounded-lg border border-parchment/25 px-4 py-2.5 text-sm hover:bg-navy-light disabled:opacity-40"
        >
          Save party
        </button>
        <button
          type="button"
          disabled={
            busy ||
            !complete ||
            alive.length < 1 ||
            team.canStartCurrentRoom === false
          }
          onClick={() => void startFight()}
          className="rounded-lg bg-crimson hover:bg-crimson-bright px-5 py-2.5 text-sm font-semibold disabled:opacity-40"
          title={
            team.canStartCurrentRoom === false
              ? (team.startBlockedReason ?? "Room locked")
              : undefined
          }
        >
          {busy
            ? "…"
            : team.canStartCurrentRoom === false
              ? `Room ${team.currentRoom ?? "?"} locked`
              : team.isFinalRoom
                ? `Enter final room vs ${team.nextBossName ?? "boss"}`
                : `Enter room ${team.currentRoom ?? "?"} vs ${team.nextBossName ?? "boss"}`}
        </button>
      </section>
    </div>
  );
}
