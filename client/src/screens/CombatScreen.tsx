import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ARCHETYPE_ICONS,
  GRADE_COLORS,
  describeGradeEffect,
  gradeRiskNote,
  type Grade,
} from "@dungeon-grades/shared";
import {
  api,
  getSocket,
  type BoardReveal,
  type PresentationCue,
  type EnrichedTeam,
} from "../api";
import {
  isMusicEnabled,
  isMuted,
  isVoEnabled,
  loadAudioManifest,
  loadAudioPrefs,
  play,
  playCommit,
  playForLogLine,
  playMagnetMove,
  setAmbientDesired,
  setMusicEnabled,
  setMuted,
  setVoEnabled,
} from "../audio";
import { CombatActor } from "../combat/CombatActor";
import { StageBubble } from "../combat/SpeechBubble";
import { BossStatusRow } from "../combat/StatusChips";

const GRADE_CLASS: Record<Grade, string> = {
  A: "text-grade-a border-grade-a/50",
  B: "text-grade-b border-grade-b/50",
  C: "text-grade-c border-grade-c/40",
  D: "text-grade-d border-grade-d/50",
  F: "text-grade-f border-grade-f/50",
};

/** Combatant snapshot before Drop Tokens / boss resolve (HP frozen until cues). */
function snapshotCombatants(t: EnrichedTeam): EnrichedTeam {
  return {
    ...t,
    roster: t.roster.map((s) => ({
      ...s,
      statuses: s.statuses.map((st) => ({ ...st })),
    })),
    boss: t.boss
      ? {
          ...t.boss,
          statuses: (t.boss.statuses ?? []).map((st) => ({ ...st })),
        }
      : null,
    minions: t.minions.map((m) => ({
      ...m,
      statuses: (m.statuses ?? []).map((st) => ({ ...st })),
    })),
    partyShield: { ...t.partyShield },
    lastClaims: [],
  };
}

function applyBoardReveal(
  base: EnrichedTeam,
  final: EnrichedTeam,
  reveal: BoardReveal | undefined | null,
): EnrichedTeam {
  if (!reveal) {
    // Meta from final (phase, log, pending tokens); HP from pre-resolve base
    return {
      ...final,
      roster: final.roster.map((s) => {
        const p = base.roster.find((x) => x.id === s.id) ?? s;
        return {
          ...s,
          currentHp: p.currentHp,
          maxHp: p.maxHp,
          alive: p.alive,
          block: p.block,
          statuses: p.statuses.map((st) => ({ ...st })),
        };
      }),
      boss:
        final.boss && base.boss
          ? {
              ...final.boss,
              currentHp: base.boss.currentHp,
              maxHp: base.boss.maxHp,
              statuses: (base.boss.statuses ?? []).map((st) => ({ ...st })),
              // Freeze pre-resolve stun so Drop Tokens does not flash a later stun
              stunRoundsLeft: base.boss.stunRoundsLeft ?? 0,
            }
          : final.boss,
      minions: base.minions.map((m) => ({
        ...m,
        statuses: (m.statuses ?? []).map((st) => ({ ...st })),
      })),
      partyShield: { ...base.partyShield },
      magnetStunRoundsLeft: base.magnetStunRoundsLeft ?? 0,
    };
  }
  const byId = new Map(reveal.soldiers.map((s) => [s.id, s]));
  return {
    ...final,
    roster: final.roster.map((s) => {
      const r = byId.get(s.id);
      if (!r) return s;
      return {
        ...s,
        currentHp: r.currentHp,
        maxHp: r.maxHp,
        alive: r.alive,
        block: r.block,
        statuses: r.statuses.map((st) => ({ ...st })),
      };
    }),
    boss:
      final.boss && reveal.boss
        ? {
            ...final.boss,
            currentHp: reveal.boss.currentHp,
            maxHp: reveal.boss.maxHp,
            statuses: (reveal.boss.statuses ?? final.boss.statuses ?? []).map(
              (st) => ({ ...st }),
            ),
            // Prefer per-cue stun; fall back to pre-resolve (never post-drop final)
            stunRoundsLeft:
              reveal.boss.stunRoundsLeft ?? base.boss?.stunRoundsLeft ?? 0,
          }
        : final.boss,
    minions: reveal.minions.map((m) => ({
      ...m,
      statuses: (m.statuses ?? []).map((st) => ({ ...st })),
    })),
    partyShield: { ...reveal.partyShield },
    magnetStunRoundsLeft:
      reveal.magnetStunRoundsLeft ?? base.magnetStunRoundsLeft ?? 0,
  };
}

/** Latest board reveal among cues played so far (inclusive). */
function latestReveal(
  cues: PresentationCue[],
  throughIndex: number,
): BoardReveal | null {
  let found: BoardReveal | null = null;
  for (let i = 0; i <= throughIndex && i < cues.length; i++) {
    if (cues[i]?.reveal) found = cues[i]!.reveal!;
  }
  return found;
}

/**
 * Cue timings — readable for classroom (pose + bubble), still not story-mode.
 * Server durationMs is a hint; client clamps and applies a slight slowdown.
 * Boss telegraph/impact may run longer than party beats (threat buildup).
 */
function cueDurationMs(cue: PresentationCue): number {
  const base = (() => {
    if (cue.durationMs) return cue.durationMs;
    switch (cue.kind) {
      case "action":
        return 1100;
      case "claim":
        return 900;
      case "boss":
        return 1300;
      case "minion":
        return 750;
      case "hurt":
        return 850;
      case "dot":
        return 700;
      case "death":
        return 1000;
      case "telegraph":
        return 1400;
      case "drop":
        return 650;
      default:
        return 800;
    }
  })();
  // Boss wind-up / impact need headroom for multi-second epic stings
  const isBossBeat = cue.kind === "telegraph" || cue.kind === "boss";
  const ceiling = isBossBeat ? 5500 : 1800;
  return Math.min(ceiling, Math.max(500, Math.round(base * 1.15)));
}

function playCueAudio(cue: PresentationCue): void {
  // Victory / defeat horns play once at endPresentation — not mid-queue and
  // not when Drop Tokens returns phase=victory while the board is still animating.
  if (cue.sfxId && cue.sfxId !== "victory" && cue.sfxId !== "defeat") {
    play(cue.sfxId);
  }
  // Layered party groan under boss/minion impact (same beat, slight delay)
  if (cue.secondarySfxId) {
    const delay = cue.secondarySfxDelayMs ?? 200;
    window.setTimeout(() => play(cue.secondarySfxId!), delay);
  }
  if (cue.playVo && cue.voId) play(cue.voId);
}

/** Short breath after wind-up playback before impact resolve (wind-up duration is already in the cue). */
const BOSS_TELEGRAPH_AFTER_PLAYBACK_MS = 350;

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
        {win ? (
          <p className="text-xs text-parchment-dim">
            {team.isFinalRoom
              ? "Continue to finish the campaign and see your final roster."
              : "HP carries over. Continue to camp, take Vanguard healing, and reform for the next room."}
          </p>
        ) : (
          <p className="text-xs text-parchment-dim">
            Fallen stay gone. Living soldiers keep their HP — reform a party of 6
            and retry this room (no camp heal).
          </p>
        )}
      </div>
    </div>
  );
}

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
  const [musicOn, setMusicOn] = useState(true);
  const logLenRef = useRef(0);
  const phaseRef = useRef(team.phase);
  const bossResolveLock = useRef(false);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  // Sequential story playback (party drop + boss phase)
  const [playQueue, setPlayQueue] = useState<PresentationCue[]>([]);
  const [playIndex, setPlayIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  /**
   * Pre-resolve combatant snapshot in React state (not only a ref) so the
   * board never flashes post-resolve server state before playback starts.
   * That flash was making minions vanish the instant tokens dropped.
   */
  const [visualHold, setVisualHold] = useState<EnrichedTeam | null>(null);
  const playedSigRef = useRef<string>("");
  const partyPlaybackDoneRef = useRef(false);
  /** Prevent double endPresentation (two finish effects) from double-playing horns */
  const outcomeSfxPlayedRef = useRef(false);
  const teamRef = useRef(team);
  teamRef.current = team;

  const activeBeat = playing && playQueue[playIndex] ? playQueue[playIndex] : null;
  const focusSet = useMemo(() => {
    const set = new Set<string>();
    for (const id of activeBeat?.focusIds ?? []) set.add(id);
    if (activeBeat?.bubble?.speakerId) set.add(activeBeat.bubble.speakerId);
    return set;
  }, [activeBeat]);

  function endPresentation() {
    setPlaying(false);
    partyPlaybackDoneRef.current = true;
    setVisualHold(null);
    // Outcome SFX after the story finishes (or Skip) — never at token drop
    if (outcomeSfxPlayedRef.current) return;
    const p = teamRef.current.phase;
    if (p === "victory") {
      outcomeSfxPlayedRef.current = true;
      play("victory");
    } else if (p === "defeat") {
      outcomeSfxPlayedRef.current = true;
      play("defeat");
    }
  }

  /**
   * While visualHold is set: freeze pre-drop HP, then apply each cue's board
   * reveal so heals/hits/minion kills land with the cast.
   */
  const view = useMemo(() => {
    if (!visualHold) return team;
    if (playing && playQueue.length > 0) {
      const reveal = latestReveal(playQueue, playIndex);
      return applyBoardReveal(visualHold, team, reveal);
    }
    // Request in flight or playback not started yet: hold pre-drop board
    return applyBoardReveal(visualHold, team, null);
  }, [visualHold, playing, playIndex, playQueue, team]);

  /** Grade badges appear when that soldier claims / acts, not all at drop. */
  const visibleClaims = useMemo(() => {
    const all = team.lastClaims ?? [];
    if (!visualHold && !playing) return all;
    if (!playing) return [];
    const shown = new Set<string>();
    for (let i = 0; i <= playIndex && i < playQueue.length; i++) {
      const c = playQueue[i];
      if (!c) continue;
      if (c.kind === "claim" || c.kind === "action") {
        const id = c.bubble?.speakerId ?? c.focusIds?.[0];
        if (id) shown.add(id);
      }
    }
    return all.filter((c) => shown.has(c.soldierId));
  }, [visualHold, playing, playIndex, playQueue, team.lastClaims]);

  useEffect(() => {
    loadAudioPrefs();
    setMuteState(isMuted());
    setVoOn(isVoEnabled());
    setMusicOn(isMusicEnabled());
    // Combat: stop ambient so SFX stay clear; music pref still toggles for lobby
    setAmbientDesired(false);
    void loadAudioManifest();
    return () => {
      /* lobby remount will re-enable ambient */
    };
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

  // Start playback when server sends a new beat list
  useEffect(() => {
    const beats = team.playback ?? [];
    if (!beats.length) return;
    const sig = `${team.phase}|${team.round}|${beats.map((b) => b.id).join(",")}`;
    if (sig === playedSigRef.current) return;
    playedSigRef.current = sig;
    partyPlaybackDoneRef.current = false;
    outcomeSfxPlayedRef.current = false;
    setPlayQueue(beats);
    setPlayIndex(0);
    setPlaying(true);
  }, [team.playback, team.phase, team.round]);

  // Advance beats on a timer
  useEffect(() => {
    if (!playing || !playQueue.length) return;
    if (playIndex >= playQueue.length) {
      endPresentation();
      return;
    }
    const beat = playQueue[playIndex];
    playCueAudio(beat);
    const t = window.setTimeout(() => {
      setPlayIndex((i) => i + 1);
    }, cueDurationMs(beat));
    return () => window.clearTimeout(t);
  }, [playing, playQueue, playIndex]);

  // When queue finishes
  useEffect(() => {
    if (playing && playIndex >= playQueue.length && playQueue.length > 0) {
      endPresentation();
    }
  }, [playing, playIndex, playQueue.length]);

  // Log audio for lines when not in structured playback (fallback)
  useEffect(() => {
    // While a drop/boss story is playing (or about to), don't fire phase/log SFX —
    // that was playing the victory horn the instant tokens dropped.
    const hasStory = (team.playback?.length ?? 0) > 0 || playing || !!visualHold;
    if (playing || visualHold) {
      logLenRef.current = team.log.length;
      if (phaseRef.current !== team.phase) phaseRef.current = team.phase;
      return;
    }
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
      // Victory/defeat: only if there was no presentation story (cue path / endPresentation handle normal fights)
      if (
        (team.phase === "victory" || team.phase === "defeat") &&
        !hasStory &&
        !(team.playback?.length)
      ) {
        play(team.phase === "victory" ? "victory" : "defeat");
      }
      if (team.phase === "boss_telegraph" && !hasStory) play("boss_attack");
      if (team.phase === "awaiting_magnet" && team.round === 1) {
        play("vo_round_start");
      }
      phaseRef.current = team.phase;
    }
    const el = logEndRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [team.log, team.phase, team.round, playing, visualHold, team.playback]);

  const partyVisual = useMemo(() => {
    const list = view.activePartyIds
      .map((id) => view.roster.find((r) => r.id === id))
      .filter(Boolean) as EnrichedTeam["roster"];
    return [...list].sort((a, b) => (b.position ?? 0) - (a.position ?? 0));
  }, [view]);

  const magnetButtons = [6, 5, 4, 3, 2, 1] as const;

  const livingPositions = useMemo(() => {
    const set = new Set<number>();
    for (const s of team.roster) {
      if (s.alive && s.position && team.activePartyIds.includes(s.id)) {
        set.add(s.position);
      }
    }
    return set;
  }, [team]);

  const claimBySoldier = useMemo(() => {
    const m = new Map<string, { token: Grade; effectiveGrade: Grade }>();
    for (const c of visibleClaims) {
      m.set(c.soldierId, {
        token: c.token,
        effectiveGrade: c.effectiveGrade,
      });
    }
    return m;
  }, [visibleClaims]);

  const magnetSoldier = useMemo(() => {
    return (
      view.roster.find(
        (s) =>
          s.alive &&
          s.position === view.magnetPosition &&
          view.activePartyIds.includes(s.id),
      ) ?? null
    );
  }, [view]);

  const pendingGrades = useMemo(() => {
    const list =
      team.pendingTokens?.length
        ? team.pendingTokens
        : team.cloud?.length
          ? team.cloud
          : [];
    return list as Grade[];
  }, [team.pendingTokens, team.cloud]);

  const magnetLocked = (view.magnetStunRoundsLeft ?? 0) > 0;

  const setMagnet = useCallback(
    async (pos: number) => {
      if (team.phase !== "awaiting_magnet" || playing) return;
      if ((team.magnetStunRoundsLeft ?? 0) > 0) {
        setError("Token Magnet is shocked — locked this round");
        return;
      }
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
    [
      team.phase,
      team.teamId,
      team.magnetStunRoundsLeft,
      onTeamUpdate,
      livingPositions,
      playing,
    ],
  );

  const runBossResolve = useCallback(async () => {
    if (bossResolveLock.current) return;
    bossResolveLock.current = true;
    setBusy(true);
    setError(null);
    // Freeze board at pre-boss state (incl. any 0-HP minion corpses)
    setVisualHold(snapshotCombatants(teamRef.current));
    partyPlaybackDoneRef.current = false;
    try {
      const t = await api.resolveBoss(team.teamId);
      onTeamUpdate(t);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Boss resolve failed");
      bossResolveLock.current = false;
      setVisualHold(null);
    } finally {
      setBusy(false);
    }
  }, [team.teamId, onTeamUpdate]);

  // Boss resolve only after party playback finishes (+ short wind-up)
  useEffect(() => {
    if (team.phase !== "boss_telegraph") {
      bossResolveLock.current = false;
      return;
    }
    if (playing) return;
    // Wait until we've consumed the party playback for this telegraph
    if ((team.playback?.length ?? 0) > 0 && !partyPlaybackDoneRef.current) {
      return;
    }
    const timer = window.setTimeout(() => {
      void runBossResolve();
    }, BOSS_TELEGRAPH_AFTER_PLAYBACK_MS);
    return () => window.clearTimeout(timer);
  }, [team.phase, team.round, team.playback, playing, runBossResolve]);

  async function dropTokens() {
    if (team.phase !== "awaiting_magnet" || busy || playing || visualHold) return;
    setBusy(true);
    setError(null);
    setFlashTokens(true);
    playCommit();
    partyPlaybackDoneRef.current = false;
    // Freeze board immediately (state, not just ref) so minions don't vanish
    // on the first re-render with the resolved server payload.
    setVisualHold(snapshotCombatants(team));
    try {
      const t = await api.commitRound(team.teamId);
      onTeamUpdate(t);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Commit failed");
      setVisualHold(null);
    } finally {
      setBusy(false);
      setTimeout(() => setFlashTokens(false), 700);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (playing) return;
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
  }, [setMagnet, team.phase, busy, playing]);

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

  async function afterDefeat() {
    setBusy(true);
    setError(null);
    try {
      const t = await api.returnFromDefeat(team.teamId);
      onTeamUpdate(t);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to return to camp");
    } finally {
      setBusy(false);
    }
  }

  const magnetSlotIndex = 6 - team.magnetPosition;
  const magnetPct = (magnetSlotIndex / 5) * 100;
  const phaseLabel = team.phase.replaceAll("_", " ");
  const showBossTelegraphBanner =
    team.phase === "boss_telegraph" && (!playing || activeBeat?.kind === "telegraph");

  return (
    <div className="min-h-full flex flex-col relative">
      {activeBeat?.bubble &&
        (activeBeat.bubble.side !== "party" ||
          !activeBeat.bubble.speakerId) && (
          <StageBubble cue={activeBeat} />
        )}

      {/* Incoming tokens — fixed height so appear/disappear never reflows the page */}
      <div className="relative h-24 md:h-28 shrink-0 border-b border-parchment/10 bg-navy/50 overflow-hidden">
        <div className="absolute top-2 left-3 right-3 flex justify-between text-xs text-parchment-dim z-10">
          <span>
            {team.phase === "awaiting_magnet"
              ? "Incoming drop (plan your magnet)"
              : playing
                ? "Resolving…"
                : "Tokens"}
          </span>
          <span>
            Pool left: {team.tokensRemaining ?? "?"}
            {team.tokensDiscard != null ? ` · used ${team.tokensDiscard}` : ""}
          </span>
        </div>
        {/* Always reserve 3 token slots (max drop size) so the row never jumps */}
        <div className="absolute inset-0 flex items-center justify-center gap-4 md:gap-6 pt-2">
          {([0, 1, 2] as const).map((i) => {
            const g = pendingGrades[i];
            if (!g) {
              return (
                <div
                  key={`slot-${i}`}
                  className="w-12 h-12 md:w-14 md:h-14 rounded-full border-2 border-dashed border-parchment/10 opacity-40"
                  aria-hidden
                />
              );
            }
            return (
              <div
                key={`${g}-${i}`}
                className={`token-bob w-12 h-12 md:w-14 md:h-14 rounded-full border-2 flex items-center justify-center font-bold text-xl md:text-2xl bg-navy-light/90 shadow-lg ${GRADE_CLASS[g]} ${flashTokens ? "token-fall" : ""}`}
                style={{
                  animationDelay: `${i * 0.12}s`,
                  color: GRADE_COLORS[g],
                  borderColor: GRADE_COLORS[g],
                }}
                title="This grade will drop when you press Drop Tokens"
              >
                {g}
              </div>
            );
          })}
        </div>
      </div>

      {/* Alert band — fixed height; content swaps without growing/shrinking the page */}
      <div className="shrink-0 min-h-[2.75rem] border-b border-parchment/10">
        {showBossTelegraphBanner ? (
          <div className="bg-crimson/90 text-parchment text-center py-2.5 px-4 font-bold tracking-wide animate-pulse border-b border-crimson-bright">
            ⚠ {team.boss?.name ?? "Boss"} is about to attack!
          </div>
        ) : (team.phase === "victory" || team.phase === "defeat") &&
          !playing ? (
          <FightSummary team={team} />
        ) : (
          <div className="h-[2.75rem] flex items-center justify-center text-xs text-parchment-dim/50">
            {playing
              ? "Resolving actions…"
              : team.phase === "awaiting_magnet"
                ? "Set magnet (1–6), then Drop Tokens"
                : "\u00a0"}
          </div>
        )}
      </div>

      {/* Magnet playbook — always mounted at fixed min-height during a fight */}
      <div className="shrink-0 min-h-[4.75rem] border-b border-parchment/10 bg-navy-light/40 px-3 py-2">
        {team.phase === "awaiting_magnet" && magnetSoldier && !playing ? (
          <div className="max-w-4xl mx-auto flex flex-wrap items-start gap-3">
            <div className="text-sm shrink-0">
              <span className="text-parchment-dim">Magnet on </span>
              <strong>
                {ARCHETYPE_ICONS[magnetSoldier.archetype]} {magnetSoldier.name}
              </strong>
              <span className="text-parchment-dim">
                {" "}
                ({magnetSoldier.archetype})
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 flex-1">
              {(pendingGrades.length
                ? [...new Set(pendingGrades)]
                : (["A", "B", "C", "D", "F"] as Grade[])
              ).map((g) => {
                const risk = gradeRiskNote(magnetSoldier.archetype, g);
                return (
                  <div
                    key={g}
                    className={`rounded-lg border px-2 py-1 text-[11px] md:text-xs bg-navy/60 ${GRADE_CLASS[g]}`}
                    style={{ borderColor: GRADE_COLORS[g] }}
                    title={describeGradeEffect(magnetSoldier.archetype, g)}
                  >
                    <span className="font-bold" style={{ color: GRADE_COLORS[g] }}>
                      {g}
                    </span>
                    <span className="text-parchment-dim ml-1">
                      {describeGradeEffect(magnetSoldier.archetype, g)}
                    </span>
                    {risk && (
                      <span className="block text-grade-f text-[10px]">{risk}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto h-full min-h-[3.5rem] flex items-center text-sm text-parchment-dim/60 italic">
            {team.phase === "victory" || team.phase === "defeat"
              ? "Fight over"
              : "Playbook pauses while the round resolves"}
          </div>
        )}
      </div>

      {/* Battlefield */}
      <div className="flex-1 grid grid-cols-12 gap-2 p-3 md:p-4 min-h-0">
        {/* Party */}
        <div className="col-span-12 md:col-span-5 flex flex-col">
          <div className="text-xs uppercase tracking-widest text-parchment-dim mb-1 flex justify-between">
            <span>Back (6)</span>
            <span>Party</span>
            <span className="text-rune">Front (1) → boss</span>
          </div>
          {/* Party shield bar */}
          <div className="mb-2 flex items-center gap-2 text-xs">
            <span className="text-rune shrink-0">🛡 Party shield</span>
            {view.partyShield.active && view.partyShield.remaining > 0 ? (
              <>
                <div className="flex-1 h-2 rounded-full bg-navy overflow-hidden border border-rune/30">
                  <div
                    className="h-full bg-rune/80 transition-all"
                    style={{
                      width: `${Math.min(100, (view.partyShield.remaining / 6) * 100)}%`,
                    }}
                  />
                </div>
                <span className="text-rune font-semibold tabular-nums">
                  {view.partyShield.remaining}
                </span>
              </>
            ) : (
              <span className="text-parchment-dim/70 italic">down</span>
            )}
          </div>
          <div className="relative flex-1 flex items-end gap-1 md:gap-2">
            {partyVisual.map((s) => {
              const pos = (s.position ?? 1) as number;
              const claim = claimBySoldier.get(s.id);
              const focused = focusSet.has(s.id);
              const isSpeaker = activeBeat?.bubble?.speakerId === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={
                    !s.alive ||
                    team.phase !== "awaiting_magnet" ||
                    playing ||
                    magnetLocked
                  }
                  title={
                    !s.alive
                      ? "Fallen — magnet cannot be placed here"
                      : magnetLocked
                        ? "Magnet shocked — locked this round"
                        : `Place magnet on #${pos}`
                  }
                  onClick={() => void setMagnet(pos)}
                  className={`relative flex-1 rounded-lg border bg-navy-light/70 p-1 md:p-1.5 text-center transition ${
                    !s.alive
                      ? "opacity-40 border-parchment/10 cursor-not-allowed"
                      : focused || isSpeaker
                        ? "border-rune unit-focus bg-navy-light"
                        : team.magnetPosition === pos
                          ? magnetLocked
                            ? "border-yellow-300 ring-2 ring-yellow-300/50"
                            : "border-rune ring-2 ring-rune/40"
                          : "border-parchment/15 hover:border-parchment/40"
                  }`}
                >
                  <div className="text-[8px] text-parchment-dim mb-0.5">
                    #{pos}
                  </div>
                  <CombatActor
                    unitId={s.id}
                    name={s.name}
                    portrait={{ role: "party", archetype: s.archetype }}
                    cue={activeBeat}
                    alive={s.alive}
                    currentHp={s.currentHp}
                    maxHp={s.maxHp}
                    block={s.block}
                    statuses={s.statuses}
                    claimGrade={claim?.effectiveGrade}
                    subtitle={s.archetype}
                    size="md"
                  />
                </button>
              );
            })}
            <div
              className={`pointer-events-none absolute bottom-0 h-2 w-[14%] rounded-full transition-all duration-200 ${
                magnetLocked
                  ? "magnet-shock-lock bg-yellow-300/90"
                  : "magnet-glow bg-rune/80"
              }`}
              style={{
                left: `calc(${magnetPct}% * 0.86 + 1%)`,
              }}
            />
          </div>
          {magnetLocked && team.phase === "awaiting_magnet" && !playing && (
            <div className="mt-2 text-center text-xs md:text-sm font-semibold text-yellow-200">
              Magnet Locked — shocked in place this round
            </div>
          )}
          <div className="mt-3 flex justify-center gap-1.5">
            {magnetButtons.map((n) => {
              const living = livingPositions.has(n);
              return (
                <button
                  key={n}
                  type="button"
                  disabled={
                    team.phase !== "awaiting_magnet" ||
                    !living ||
                    playing ||
                    magnetLocked
                  }
                  title={
                    magnetLocked
                      ? "Magnet shocked — locked this round"
                      : living
                        ? `Magnet → position ${n}`
                        : `Position ${n} is empty or fallen`
                  }
                  onClick={() => void setMagnet(n)}
                  className={`w-10 h-10 md:w-12 md:h-12 rounded-lg font-bold text-lg border transition ${
                    !living
                      ? "opacity-25 border-parchment/10 cursor-not-allowed line-through"
                      : team.magnetPosition === n
                        ? magnetLocked
                          ? "bg-yellow-300/20 border-yellow-300 text-yellow-200"
                          : "bg-rune/20 border-rune text-rune"
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
          <div className="flex flex-wrap gap-3 justify-center">
            {view.minions?.length ? (
              view.minions.map((m) => {
                const focused = focusSet.has(m.id);
                const dead = m.currentHp <= 0;
                return (
                  <div
                    key={m.id}
                    className={`relative rounded-lg border px-2 py-2 min-w-[5.5rem] max-w-[7rem] transition ${
                      dead
                        ? "opacity-40 border-parchment/10"
                        : focused
                          ? "border-grade-d unit-focus-hostile bg-navy-light"
                          : "border-parchment/20 bg-navy-light/60"
                    }`}
                  >
                    <CombatActor
                      unitId={m.id}
                      name={m.name}
                      portrait={{ role: "minion", name: m.name }}
                      cue={activeBeat}
                      alive={!dead}
                      currentHp={m.currentHp}
                      maxHp={m.maxHp}
                      statuses={m.statuses}
                      size="sm"
                      subtitle={dead ? "fallen" : `ATK ${m.damage ?? 7}`}
                    />
                  </div>
                );
              })
            ) : (
              <div className="text-parchment-dim/50 text-sm italic text-center px-2">
                Empty corridor…
                <div className="text-[10px] mt-1">
                  (Colossus may summon archers)
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Boss */}
        <div className="col-span-12 md:col-span-4 flex flex-col items-center justify-center">
          <div className="text-xs uppercase tracking-widest text-parchment-dim mb-2">
            Boss
          </div>
          {view.boss ? (
            <div
              className={`relative w-full max-w-xs rounded-xl border p-3 text-center transition ${
                focusSet.has("boss") ||
                activeBeat?.kind === "boss" ||
                activeBeat?.kind === "telegraph" ||
                team.phase === "boss_telegraph"
                  ? "border-grade-f ring-4 ring-crimson/50 bg-gradient-to-b from-crimson/50 to-navy-light unit-focus-hostile"
                  : "border-crimson/40 bg-gradient-to-b from-crimson/20 to-navy-light"
              }`}
            >
              <CombatActor
                unitId="boss"
                name={view.boss.name}
                portrait={{
                  role: "boss",
                  bossId: (view.boss as { id?: string }).id,
                }}
                cue={activeBeat}
                alive={view.boss.currentHp > 0}
                currentHp={view.boss.currentHp}
                maxHp={view.boss.maxHp}
                size="lg"
                subtitle={
                  activeBeat?.kind === "boss"
                    ? "Attacking!"
                    : team.phase === "boss_telegraph" ||
                        activeBeat?.kind === "telegraph"
                      ? "Winding up…"
                      : undefined
                }
              />
              <BossStatusRow boss={view.boss} />
            </div>
          ) : (
            <div className="text-parchment-dim">No boss</div>
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
            <span className="capitalize text-rune">
              {playing ? "watching actions" : phaseLabel}
            </span>
            {view.partyShield.active && (
              <>
                <span className="mx-2 text-parchment-dim">·</span>
                Shield {view.partyShield.remaining}
              </>
            )}
          </div>
          <div className="flex gap-2 items-center">
            <button
              type="button"
              title={
                musicOn
                  ? "Lobby music on (silent in combat) — click to disable"
                  : "Lobby music off — click to enable for camp"
              }
              onClick={() => {
                const next = !musicOn;
                setMusicEnabled(next);
                setMusicOn(next);
              }}
              className={`rounded-lg border px-2.5 py-2 text-xs ${
                musicOn
                  ? "border-rune/50 text-rune"
                  : "border-parchment/20 text-parchment-dim"
              }`}
            >
              {musicOn ? "🎵" : "Music off"}
            </button>
            <button
              type="button"
              title="Mute all sound"
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
            {playing && (
              <button
                type="button"
                onClick={() => {
                  setPlayIndex(playQueue.length);
                  endPresentation();
                }}
                className="rounded-lg border border-parchment/30 px-3 py-2 text-sm"
              >
                Skip
              </button>
            )}
            {team.phase === "awaiting_magnet" && (
              <button
                type="button"
                disabled={busy || playing}
                onClick={() => void dropTokens()}
                className="rounded-lg bg-rune/90 hover:bg-rune text-navy font-bold px-5 py-2.5 text-sm md:text-base disabled:opacity-50"
              >
                Drop Tokens
              </button>
            )}
            {team.phase === "boss_telegraph" && (
              <button
                type="button"
                disabled={busy || playing}
                onClick={() => void runBossResolve()}
                className="rounded-lg bg-crimson hover:bg-crimson-bright px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                {busy ? "Resolving…" : "Boss attacks!"}
              </button>
            )}
            {team.phase === "victory" && !playing && (
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
            {team.phase === "defeat" && !playing && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void afterDefeat()}
                className="rounded-lg bg-crimson hover:bg-crimson-bright px-5 py-2.5 font-semibold disabled:opacity-50"
              >
                {busy ? "…" : "Reform party & retry room"}
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
          className="h-20 overflow-y-auto rounded-lg bg-navy-light/50 border border-parchment/10 p-2 text-xs md:text-sm font-mono space-y-0.5"
        >
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
          Bubbles = who acts · playbook under magnet · Front nearest
          boss · Keys{" "}
          <kbd className="px-1 border border-parchment/30 rounded">1</kbd>–
          <kbd className="px-1 border border-parchment/30 rounded">6</kbd> magnet ·{" "}
          <kbd className="px-1 border border-parchment/30 rounded">Space</kbd>{" "}
          drops
        </p>
      </div>
    </div>
  );
}
