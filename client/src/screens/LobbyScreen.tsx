import { useEffect, useMemo, useState } from "react";
import { ARCHETYPE_ICONS, ARCHETYPE_MAX_HP } from "@dungeon-grades/shared";
import { api, getSocket, type EnrichedTeam } from "../api";

const PARTY_SIZE = 6;

/** Empty formation slots: index 0 = position 1 (front), index 5 = position 6 (back). */
function emptySlots(): (string | null)[] {
  return Array.from({ length: PARTY_SIZE }, () => null);
}

function slotsFromTeam(team: EnrichedTeam): (string | null)[] {
  const slots = emptySlots();
  if (team.activePartyIds.length === PARTY_SIZE) {
    team.activePartyIds.forEach((id, i) => {
      slots[i] = id;
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

  useEffect(() => {
    const s = getSocket();
    s.emit("subscribe:team", team.teamId);
    const onState = (t: EnrichedTeam) => {
      onTeamUpdate(t);
      // If server has a full party and local is empty, hydrate once
      setSlots((prev) => {
        if (prev.every((x) => !x) && t.activePartyIds.length === PARTY_SIZE) {
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

  const filledIds = useMemo(
    () => slots.filter((id): id is string => !!id),
    [slots],
  );
  const filledCount = filledIds.length;
  const complete = filledCount === PARTY_SIZE && new Set(filledIds).size === PARTY_SIZE;

  const alive = useMemo(
    () => team.roster.filter((r) => r.alive),
    [team.roster],
  );

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

      const target =
        activeSlot !== null ? activeSlot : next.findIndex((x) => x === null);
      if (target < 0) return prev; // line full
      next[target] = id;
      return next;
    });
    setSavedOk(false);
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
      setError("Fill all 6 positions before saving.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const soldierIds = slots as string[];
      const t = await api.setRoster(team.teamId, soldierIds);
      onTeamUpdate(t);
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
      setError("Fill all 6 positions before starting.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Always save formation first so order is on the server
      let t = await api.setRoster(team.teamId, slots as string[]);
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
    <div className="min-h-full p-4 md:p-6 max-w-5xl mx-auto space-y-5">
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
        <button
          type="button"
          onClick={onLeave}
          className="text-sm border border-parchment/20 rounded-lg px-3 py-1.5 hover:bg-navy-light"
        >
          Leave
        </button>
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
          <span className="text-parchment-dim">
            Next boss:{" "}
            <strong className="text-parchment">
              {team.nextBossName ?? "—"}
            </strong>
          </span>
        </div>
        <div className="flex gap-1">
          {Array.from({ length: team.campaignLength ?? 3 }).map((_, i) => {
            const cleared = (team.roomsCleared ?? team.roomIndex) > i;
            const current = (team.roomsCleared ?? team.roomIndex) === i;
            return (
              <div
                key={i}
                className={`h-2 flex-1 rounded-full ${
                  cleared
                    ? "bg-grade-a"
                    : current
                      ? "bg-rune animate-pulse"
                      : "bg-navy-light border border-parchment/20"
                }`}
                title={`Room ${i + 1}`}
              />
            );
          })}
        </div>
        {team.phase === "between_rooms" && team.lastClearedBossName && (
          <p className="text-xs text-grade-a">
            Cleared {team.lastClearedBossName}. Living soldiers keep their HP — fallen
            stay gone. Need 6 living to enter the next room.
          </p>
        )}
        {alive.length < 6 && (
          <p className="text-sm text-grade-f">
            Only {alive.length} living soldiers — cannot form a full party. Campaign
            stalled unless the teacher resets.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-rune/30 bg-navy-light/50 p-4 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-parchment">
              1. Form your party of 6
            </h2>
            <p className="text-sm text-parchment-dim mt-1 max-w-2xl">
              Click a <strong className="text-parchment">slot</strong>, then a soldier
              below — or click soldiers in order.{" "}
              <strong className="text-rune">Position 1 (front)</strong> stands nearest
              the boss and takes more hits.{" "}
              <strong className="text-parchment">Position 6 (back)</strong> is safer.
              You must set this line before every room, including the first.
            </p>
          </div>
          <div className="text-sm text-parchment-dim">
            Filled{" "}
            <span className={complete ? "text-grade-a font-bold" : "text-rune font-bold"}>
              {filledCount}/6
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
                className={`relative min-h-[7.5rem] rounded-lg border-2 p-1.5 text-center transition flex flex-col items-center justify-center gap-0.5 ${
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
                    <span className="text-[9px] text-parchment-dim">{s.archetype}</span>
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
        <h2 className="text-lg font-semibold">2. Roster — click to place</h2>
        <p className="text-xs text-parchment-dim">
          Grayed-out soldiers are already in the line (click again to remove) or dead.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {team.roster.map((s) => {
            const inLine = slots.includes(s.id);
            const linePos = inLine ? slots.indexOf(s.id) + 1 : 0;
            return (
              <button
                key={s.id}
                type="button"
                disabled={!s.alive}
                onClick={() => placeSoldier(s.id)}
                className={`text-left rounded-lg border p-3 transition ${
                  !s.alive
                    ? "opacity-30 border-parchment/10 cursor-not-allowed"
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
                      {s.archetype} · {s.currentHp}/
                      {s.maxHp || ARCHETYPE_MAX_HP[s.archetype]} HP
                      {!s.alive && " · fallen"}
                    </div>
                  </div>
                </div>
              </button>
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
        <p className="text-grade-a text-sm">Party saved on the server. Ready to start when the teacher has set grades & boss.</p>
      )}

      <section className="sticky bottom-3 rounded-xl border border-parchment/15 bg-navy/95 p-3 flex flex-wrap gap-2 items-center shadow-lg">
        <span className="text-sm text-parchment-dim mr-auto">
          {complete
            ? "Lineup complete — save or enter the dungeon."
            : `Choose ${PARTY_SIZE - filledCount} more soldier(s).`}
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
          disabled={busy || !complete || alive.length < 6}
          onClick={() => void startFight()}
          className="rounded-lg bg-crimson hover:bg-crimson-bright px-5 py-2.5 text-sm font-semibold disabled:opacity-40"
        >
          {busy
            ? "…"
            : team.isFinalRoom
              ? `Enter final room vs ${team.nextBossName ?? "boss"}`
              : `Enter room ${team.currentRoom ?? "?"} vs ${team.nextBossName ?? "boss"}`}
        </button>
      </section>
    </div>
  );
}
