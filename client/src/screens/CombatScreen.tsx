import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ARCHETYPE_ICONS,
  GRADE_COLORS,
  type Grade,
} from "@dungeon-grades/shared";
import { api, getSocket, type EnrichedTeam } from "../api";
import {
  isMuted,
  isVoEnabled,
  loadAudioManifest,
  loadAudioPrefs,
  play,
  playCommit,
  playForLogLine,
  playMagnetMove,
  setMuted,
  setVoEnabled,
} from "../audio";

const GRADE_CLASS: Record<Grade, string> = {
  A: "text-grade-a border-grade-a/50",
  B: "text-grade-b border-grade-b/50",
  C: "text-grade-c border-grade-c/40",
  D: "text-grade-d border-grade-d/50",
  F: "text-grade-f border-grade-f/50",
};

function FightSummary({ team }: { team: EnrichedTeam }) {
  const party = team.activePartyIds
    .map((id) => team.roster.find((r) => r.id === id))
    .filter(Boolean) as EnrichedTeam["roster"];
  const living = party.filter((s) => s.alive);
  const fallen = party.filter((s) => !s.alive);
  const hpNow = living.reduce((a, s) => a + s.currentHp, 0);
  const hpMax = party.reduce((a, s) => a + s.maxHp, 0);
  const win = team.phase === "victory";

  return (
    <div
      className={`border-b px-4 py-3 ${
        win
          ? "bg-grade-a/15 border-grade-a/40"
          : "bg-crimson/30 border-crimson/50"
      }`}
    >
      <div className="max-w-3xl mx-auto text-center space-y-1">
        <h2 className="text-xl font-bold">
          {win
            ? team.isFinalRoom
              ? "Victory — final room cleared!"
              : `Victory — room ${team.currentRoom ?? "?"} cleared`
            : "Defeat — party wiped"}
        </h2>
        <p className="text-sm text-parchment-dim">
          Round {team.round}
          {team.boss ? ` · ${team.boss.name}` : ""}
          {" · "}
          Survivors {living.length}/{party.length}
          {" · "}
          HP remaining {hpNow}/{hpMax}
          {" · "}
          Campaign {team.roomsCleared ?? team.roomIndex}/
          {team.campaignLength ?? "?"} rooms done after continue
        </p>
        {fallen.length > 0 && (
          <p className="text-sm text-grade-f">
            Fallen this fight: {fallen.map((s) => s.name).join(", ")}
          </p>
        )}
        {win && (
          <p className="text-xs text-parchment-dim">
            {team.isFinalRoom
              ? "Continue to finish the campaign and see your final roster."
              : "HP carries over. Continue to camp, take Vanguard healing, and reform for the next room."}
          </p>
        )}
      </div>
    </div>
  );
}

/** Pause after party acts before boss resolves (ms). */
const BOSS_TELEGRAPH_MS = 2200;

export default function CombatScreen({
  team,
  onTeamUpdate,
  onLeave,
}: {
  team: EnrichedTeam;
  onTeamUpdate: (t: EnrichedTeam) => void;
  onLeave: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flashTokens, setFlashTokens] = useState(false);
  const [mute, setMuteState] = useState(false);
  const [voOn, setVoOn] = useState(false);
  const logLenRef = useRef(0);
  const phaseRef = useRef(team.phase);
  const bossResolveLock = useRef(false);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    loadAudioPrefs();
    setMuteState(isMuted());
    setVoOn(isVoEnabled());
    void loadAudioManifest();
  }, []);

  useEffect(() => {
    const s = getSocket();
    s.emit("subscribe:team", team.teamId);
    const onState = (t: EnrichedTeam) => onTeamUpdate(t);
    s.on("team:state", onState);
    return () => {
      s.off("team:state", onState);
    };
  }, [team.teamId, onTeamUpdate]);

  // Play SFX for new log lines / phase changes; keep log scrolled to latest
  useEffect(() => {
    if (team.log.length > logLenRef.current) {
      const newLines = team.log.slice(logLenRef.current);
      logLenRef.current = team.log.length;
      for (const line of newLines) {
        playForLogLine(line.text);
      }
    } else if (team.log.length < logLenRef.current) {
      logLenRef.current = team.log.length;
    }
    if (phaseRef.current !== team.phase) {
      if (team.phase === "victory") play("victory");
      if (team.phase === "defeat") play("defeat");
      if (team.phase === "boss_telegraph") play("boss_attack");
      if (team.phase === "awaiting_magnet" && team.round === 1) {
        play("vo_round_start");
      }
      phaseRef.current = team.phase;
    }
    const el = logEndRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [team.log, team.phase, team.round]);

  /**
   * Party display: position 1 (front) is closest to the boss (right).
   * Visual left→right = positions 6 … 1.
   */
  const partyVisual = useMemo(() => {
    const list = team.activePartyIds
      .map((id) => team.roster.find((r) => r.id === id))
      .filter(Boolean) as EnrichedTeam["roster"];
    return [...list].sort(
      (a, b) => (b.position ?? 0) - (a.position ?? 0),
    );
  }, [team]);

  // Number pad mirrors visual order (6 on left … 1 on right, nearest boss)
  const magnetButtons = [6, 5, 4, 3, 2, 1] as const;

  const livingPositions = useMemo(() => {
    const set = new Set<number>();
    for (const s of team.roster) {
      if (
        s.alive &&
        s.position &&
        team.activePartyIds.includes(s.id)
      ) {
        set.add(s.position);
      }
    }
    return set;
  }, [team]);

  const setMagnet = useCallback(
    async (pos: number) => {
      if (team.phase !== "awaiting_magnet") return;
      if (!livingPositions.has(pos)) {
        setError("Cannot place the magnet under a fallen soldier");
        return;
      }
      try {
        setError(null);
        playMagnetMove();
        const t = await api.setMagnet(team.teamId, pos);
        onTeamUpdate(t);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Magnet failed");
      }
    },
    [team.phase, team.teamId, onTeamUpdate, livingPositions],
  );

  const runBossResolve = useCallback(async () => {
    if (bossResolveLock.current) return;
    bossResolveLock.current = true;
    setBusy(true);
    setError(null);
    try {
      const t = await api.resolveBoss(team.teamId);
      onTeamUpdate(t);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Boss resolve failed");
      bossResolveLock.current = false;
    } finally {
      setBusy(false);
    }
  }, [team.teamId, onTeamUpdate]);

  // After party phase: pause, telegraph, then resolve boss
  useEffect(() => {
    if (team.phase !== "boss_telegraph") {
      bossResolveLock.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      void runBossResolve();
    }, BOSS_TELEGRAPH_MS);
    return () => window.clearTimeout(timer);
  }, [team.phase, team.round, runBossResolve]);

  async function dropTokens() {
    if (team.phase !== "awaiting_magnet" || busy) return;
    setBusy(true);
    setError(null);
    setFlashTokens(true);
    playCommit();
    try {
      const t = await api.commitRound(team.teamId);
      onTeamUpdate(t);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Commit failed");
    } finally {
      setBusy(false);
      setTimeout(() => setFlashTokens(false), 700);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key >= "1" && e.key <= "6") {
        void setMagnet(Number(e.key));
      }
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        void dropTokens();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setMagnet, team.phase, busy]);

  async function afterVictory() {
    setBusy(true);
    try {
      const t = await api.continueCampaign(team.teamId);
      onTeamUpdate(t);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  // Magnet under reversed visual line: pos 1 → rightmost slot
  const magnetSlotIndex = 6 - team.magnetPosition; // 0..5 left→right
  const magnetPct = (magnetSlotIndex / 5) * 100;

  const phaseLabel = team.phase.replaceAll("_", " ");

  return (
    <div className="min-h-full flex flex-col">
      {/* Incoming tokens — only the grades that will drop this round */}
      <div className="relative h-24 md:h-28 border-b border-parchment/10 bg-navy/50 overflow-hidden">
        <div className="absolute top-2 left-3 right-3 flex justify-between text-xs text-parchment-dim">
          <span>
            {team.phase === "awaiting_magnet"
              ? "Incoming drop (plan your magnet)"
              : "Tokens"}
          </span>
          <span>
            Pool left: {team.tokensRemaining ?? "?"}
            {team.tokensDiscard != null ? ` · used ${team.tokensDiscard}` : ""}
          </span>
        </div>
        <div className="absolute inset-0 flex items-center justify-center gap-4 md:gap-6 pt-2">
          {(
            team.pendingTokens?.length
              ? team.pendingTokens
              : team.cloud?.length
                ? team.cloud
                : []
          ).map((g, i) => (
            <div
              key={`${g}-${i}`}
              className={`token-bob w-12 h-12 md:w-14 md:h-14 rounded-full border-2 flex items-center justify-center font-bold text-xl md:text-2xl bg-navy-light/90 shadow-lg ${GRADE_CLASS[g as Grade]} ${flashTokens ? "token-fall" : ""}`}
              style={{
                animationDelay: `${i * 0.12}s`,
                color: GRADE_COLORS[g as Grade],
                borderColor: GRADE_COLORS[g as Grade],
              }}
              title="This grade will drop when you press Drop Tokens"
            >
              {g}
            </div>
          ))}
          {!team.pendingTokens?.length && !team.cloud?.length && (
            <span className="text-parchment-dim/60 text-sm italic">
              No tokens telegraphed
            </span>
          )}
        </div>
      </div>

      {/* Boss telegraph banner */}
      {team.phase === "boss_telegraph" && (
        <div className="bg-crimson/90 text-parchment text-center py-2.5 px-4 font-bold tracking-wide animate-pulse border-b border-crimson-bright">
          ⚠ {team.boss?.name ?? "Boss"} is about to attack!
        </div>
      )}

      {/* End-of-fight summary */}
      {(team.phase === "victory" || team.phase === "defeat") && (
        <FightSummary team={team} />
      )}

      {/* Main battlefield */}
      <div className="flex-1 grid grid-cols-12 gap-2 p-3 md:p-4 min-h-0">
        {/* Party — front (1) on the right, nearest boss */}
        <div className="col-span-12 md:col-span-5 flex flex-col">
          <div className="text-xs uppercase tracking-widest text-parchment-dim mb-1 flex justify-between">
            <span>Back (6)</span>
            <span>Party</span>
            <span className="text-rune">Front (1) → boss</span>
          </div>
          <div className="relative flex-1 flex items-end gap-1 md:gap-2">
            {partyVisual.map((s) => {
              const pos = (s.position ?? 1) as number;
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={!s.alive || team.phase !== "awaiting_magnet"}
                  title={
                    !s.alive
                      ? "Fallen — magnet cannot be placed here"
                      : `Place magnet on #${pos}`
                  }
                  onClick={() => void setMagnet(pos)}
                  className={`flex-1 rounded-lg border bg-navy-light/70 p-1.5 md:p-2 text-center transition ${
                    !s.alive
                      ? "opacity-35 grayscale border-parchment/10 cursor-not-allowed"
                      : team.magnetPosition === pos
                        ? "border-rune ring-2 ring-rune/40"
                        : "border-parchment/15 hover:border-parchment/40"
                  }`}
                >
                  <div className="text-[9px] text-parchment-dim">#{pos}</div>
                  <div className="text-lg md:text-2xl">
                    {ARCHETYPE_ICONS[s.archetype]}
                  </div>
                  <div className="text-[10px] md:text-xs font-medium truncate">
                    {s.name}
                  </div>
                  <div className="mt-1 h-1.5 rounded bg-navy overflow-hidden">
                    <div
                      className="h-full bg-crimson-bright transition-all"
                      style={{
                        width: `${Math.max(0, (s.currentHp / s.maxHp) * 100)}%`,
                      }}
                    />
                  </div>
                  <div className="text-[10px] text-parchment-dim mt-0.5">
                    {s.currentHp}/{s.maxHp}
                  </div>
                  {s.statuses?.length > 0 && (
                    <div className="flex flex-wrap justify-center gap-0.5 mt-1">
                      {s.statuses.map((st, idx) => (
                        <span
                          key={idx}
                          className="text-[9px] px-1 rounded bg-navy border border-parchment/20"
                        >
                          {st.kind === "Dot" ? st.type[0] : st.kind[0]}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
            {/* Magnet under reversed line */}
            <div
              className="pointer-events-none absolute bottom-0 h-2 w-[14%] magnet-glow rounded-full bg-rune/80 transition-all duration-200"
              style={{
                left: `calc(${magnetPct}% * 0.86 + 1%)`,
              }}
            />
          </div>
          <div className="mt-3 flex justify-center gap-1.5">
            {magnetButtons.map((n) => {
              const living = livingPositions.has(n);
              return (
                <button
                  key={n}
                  type="button"
                  disabled={team.phase !== "awaiting_magnet" || !living}
                  title={
                    living
                      ? `Magnet → position ${n}`
                      : `Position ${n} is empty or fallen`
                  }
                  onClick={() => void setMagnet(n)}
                  className={`w-10 h-10 md:w-12 md:h-12 rounded-lg font-bold text-lg border transition ${
                    !living
                      ? "opacity-25 border-parchment/10 cursor-not-allowed line-through"
                      : team.magnetPosition === n
                        ? "bg-rune/20 border-rune text-rune"
                        : "bg-navy-light border-parchment/20 hover:border-rune/50"
                  } disabled:opacity-40`}
                >
                  {n}
                </button>
              );
            })}
          </div>
        </div>

        {/* Minions */}
        <div className="col-span-12 md:col-span-3 flex flex-col items-center justify-center min-h-[100px]">
          <div className="text-xs uppercase tracking-widest text-parchment-dim mb-2">
            Gap / Adds
          </div>
          <div className="flex flex-wrap gap-2 justify-center">
            {team.minions?.length ? (
              team.minions.map((m) => (
                <div
                  key={m.id}
                  className="rounded-lg border border-parchment/20 bg-navy-light/60 px-3 py-2 text-center text-sm"
                >
                  <div>💀 {m.name}</div>
                  <div className="text-xs text-parchment-dim">
                    {m.currentHp}/{m.maxHp}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-parchment-dim/50 text-sm italic">Empty corridor…</div>
            )}
          </div>
        </div>

        {/* Boss */}
        <div className="col-span-12 md:col-span-4 flex flex-col items-center justify-center">
          <div className="text-xs uppercase tracking-widest text-parchment-dim mb-2">
            Boss
          </div>
          {team.boss ? (
            <div
              className={`w-full max-w-xs rounded-xl border p-4 text-center transition ${
                team.phase === "boss_telegraph"
                  ? "border-grade-f ring-4 ring-crimson/50 bg-gradient-to-b from-crimson/50 to-navy-light scale-105"
                  : "border-crimson/40 bg-gradient-to-b from-crimson/20 to-navy-light"
              }`}
            >
              <div className="text-5xl mb-2">👹</div>
              <div className="text-xl font-bold">{team.boss.name}</div>
              {team.phase === "boss_telegraph" && (
                <div className="text-sm text-grade-f font-semibold mt-1 animate-pulse">
                  Winding up…
                </div>
              )}
              <div className="mt-3 h-3 rounded-full bg-navy overflow-hidden border border-parchment/10">
                <div
                  className="h-full bg-gradient-to-r from-crimson to-grade-d transition-all"
                  style={{
                    width: `${(team.boss.currentHp / team.boss.maxHp) * 100}%`,
                  }}
                />
              </div>
              <div className="text-sm mt-1 text-parchment-dim">
                {team.boss.currentHp} / {team.boss.maxHp}
              </div>
            </div>
          ) : (
            <div className="text-parchment-dim">No boss</div>
          )}
          {team.partyShield.active && (
            <div className="mt-3 text-sm text-rune">
              🛡️ Party shield: {team.partyShield.remaining}
            </div>
          )}
        </div>
      </div>

      {/* HUD */}
      <div className="border-t border-parchment/10 bg-navy/90 p-3 md:p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="text-sm">
            <span className="text-parchment-dim">Round</span>{" "}
            <strong>{team.round}</strong>
            <span className="mx-2 text-parchment-dim">·</span>
            <span className="capitalize text-rune">{phaseLabel}</span>
            {team.partyShield.active && (
              <>
                <span className="mx-2 text-parchment-dim">·</span>
                Shield {team.partyShield.remaining}
              </>
            )}
          </div>
          <div className="flex gap-2 items-center">
            <button
              type="button"
              title="Mute sound effects"
              onClick={() => {
                const next = !mute;
                setMuted(next);
                setMuteState(next);
              }}
              className="rounded-lg border border-parchment/20 px-2.5 py-2 text-sm"
            >
              {mute ? "🔇" : "🔊"}
            </button>
            <button
              type="button"
              title="Toggle short voice lines"
              onClick={() => {
                const next = !voOn;
                setVoEnabled(next);
                setVoOn(next);
              }}
              className={`rounded-lg border px-2.5 py-2 text-xs ${
                voOn ? "border-rune text-rune" : "border-parchment/20"
              }`}
            >
              VO
            </button>
            {team.phase === "awaiting_magnet" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void dropTokens()}
                className="rounded-lg bg-rune/90 hover:bg-rune text-navy font-bold px-5 py-2.5 text-sm md:text-base disabled:opacity-50"
              >
                Drop Tokens
              </button>
            )}
            {team.phase === "boss_telegraph" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void runBossResolve()}
                className="rounded-lg bg-crimson hover:bg-crimson-bright px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                {busy ? "Resolving…" : "Boss attacks!"}
              </button>
            )}
            {team.phase === "victory" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void afterVictory()}
                className="rounded-lg bg-grade-a/90 text-navy font-bold px-5 py-2.5"
              >
                {team.isFinalRoom
                  ? "Complete campaign"
                  : "Continue → camp & reform"}
              </button>
            )}
            {team.phase === "defeat" && (
              <button
                type="button"
                onClick={onLeave}
                className="rounded-lg bg-crimson px-5 py-2.5 font-semibold"
              >
                Return Home
              </button>
            )}
            <button
              type="button"
              onClick={onLeave}
              className="rounded-lg border border-parchment/20 px-3 py-2 text-sm"
            >
              Leave
            </button>
          </div>
        </div>

        {error && <p className="text-grade-f text-sm">{error}</p>}

        <div
          ref={logEndRef}
          className="h-28 overflow-y-auto rounded-lg bg-navy-light/50 border border-parchment/10 p-2 text-xs md:text-sm font-mono space-y-0.5"
        >
          {/* Chronological: oldest at top, newest at bottom (read downward) */}
          {team.log.map((entry, i) => (
            <div
              key={`${entry.round}-${i}-${entry.text.slice(0, 24)}`}
              className={
                entry.tags?.includes("telegraph")
                  ? "text-grade-f font-semibold"
                  : entry.tags?.includes("boss")
                    ? "text-grade-d"
                    : entry.tags?.includes("dot")
                      ? "text-grade-d/90"
                      : entry.tags?.includes("tokens")
                        ? "text-rune"
                        : "text-parchment-dim"
              }
            >
              <span className="text-rune/70">R{entry.round}</span> {entry.text}
            </div>
          ))}
        </div>
        <p className="text-[11px] text-parchment-dim text-center">
          Incoming grades are fixed before you drop · Front nearest boss · Keys{" "}
          <kbd className="px-1 border border-parchment/30 rounded">1</kbd>–
          <kbd className="px-1 border border-parchment/30 rounded">6</kbd> magnet ·{" "}
          <kbd className="px-1 border border-parchment/30 rounded">Space</kbd> drops
        </p>
      </div>
    </div>
  );
}
