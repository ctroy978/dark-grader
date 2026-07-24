import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ARCHETYPE_ICONS,
  GRADE_COLORS,
  describeGradeEffect,
  gradeRiskNote,
  statusToChip,
  type DotType,
  type Grade,
  type StatusTag,
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
import type { HpFloat } from "../combat/DamageFloat";
import GradeToken, { GradeTokenSlot } from "../combat/GradeToken";
import { StageBubble } from "../combat/SpeechBubble";
import { BossStatusRow } from "../combat/StatusChips";

const FLOAT_MS = 950;

/** Snapshot of unit HP for floating combat numbers (diff per presentation beat). */
function hpMapFromView(t: EnrichedTeam): Map<string, number> {
  const m = new Map<string, number>();
  for (const id of t.activePartyIds) {
    const s = t.roster.find((r) => r.id === id);
    if (s) m.set(s.id, s.currentHp);
  }
  if (t.boss) m.set("boss", t.boss.currentHp);
  for (const min of t.minions) m.set(min.id, min.currentHp);
  return m;
}

/** HP deltas for floating −N / +N (only units present in both maps). */
function hpFloatSpawns(
  prev: Map<string, number>,
  next: Map<string, number>,
  playIndex: number,
  seq: { current: number },
): { unitId: string; float: HpFloat }[] {
  const spawned: { unitId: string; float: HpFloat }[] = [];
  for (const [unitId, hp] of next) {
    const old = prev.get(unitId);
    if (old === undefined || old === hp) continue;
    const delta = hp - old;
    if (delta === 0) continue;
    seq.current += 1;
    spawned.push({
      unitId,
      float: {
        key: `${unitId}-${playIndex}-${seq.current}`,
        delta,
      },
    });
  }
  return spawned;
}

const DOT_BANNER: Record<
  DotType,
  { icon: string; word: string; className: string }
> = {
  Fire: {
    icon: "🔥",
    word: "BURNING",
    className: "border-orange-400/50 bg-orange-950/70 text-orange-200",
  },
  Poison: {
    icon: "☠️",
    word: "POISONED",
    className: "border-lime-400/50 bg-lime-950/70 text-lime-200",
  },
  Ice: {
    icon: "❄️",
    word: "CHILLED",
    className: "border-sky-400/50 bg-sky-950/70 text-sky-200",
  },
  Slime: {
    icon: "🟢",
    word: "SLIMED",
    className: "border-emerald-400/50 bg-emerald-950/70 text-emerald-200",
  },
};

/** Aggregate party DoTs for the gap warning (type → max stacks / intensity / count). */
function partyDotSummary(
  soldiers: { alive: boolean; statuses?: StatusTag[] }[],
): {
  type: DotType;
  stacks: number;
  intensity: number;
  count: number;
}[] {
  const map = new Map<
    DotType,
    { stacks: number; intensity: number; count: number }
  >();
  for (const s of soldiers) {
    if (!s.alive) continue;
    for (const st of s.statuses ?? []) {
      if (st.kind !== "Dot") continue;
      const cur = map.get(st.type) ?? { stacks: 0, intensity: 0, count: 0 };
      cur.stacks = Math.max(cur.stacks, st.stacks);
      cur.intensity = Math.max(cur.intensity, st.escalationStep ?? 0);
      cur.count += 1;
      map.set(st.type, cur);
    }
  }
  return [...map.entries()].map(([type, v]) => ({ type, ...v }));
}

const GRADE_CLASS: Record<Grade, string> = {
  A: "text-grade-a border-grade-a/50",
  B: "text-grade-b border-grade-b/50",
  C: "text-grade-c border-grade-c/40",
  D: "text-grade-d border-grade-d/50",
  F: "text-grade-f border-grade-f/50",
};

/** Status/block chips under a party seat — grows downward, not inside the card. */
function PartySeatEffects({
  name,
  block,
  statuses,
}: {
  name: string;
  block?: number;
  statuses?: StatusTag[];
}) {
  const chips: { key: string; text: string; title: string; className: string }[] =
    [];
  if (block && block > 0) {
    chips.push({
      key: "block",
      text: `Block ${block}`,
      title: "Personal block remaining this round",
      className: "text-sky-300 border-sky-400/40 bg-sky-950/40",
    });
  }
  for (let i = 0; i < (statuses?.length ?? 0); i++) {
    const st = statuses![i]!;
    const c = statusToChip(st, i);
    let text = c.label;
    if (st.kind === "Dot") {
      text = `${st.type} ×${st.stacks}`;
    }
    chips.push({
      key: c.key,
      text,
      title: c.title,
      className: c.colorClass,
    });
  }
  if (!chips.length) {
    return <div className="min-h-[0.25rem]" aria-hidden />;
  }
  return (
    <div className="flex flex-col items-center gap-0.5 px-0.5" title={name}>
      {chips.map((c) => (
        <span
          key={c.key}
          title={c.title}
          className={`inline-flex text-[8px] md:text-[9px] px-1 rounded border leading-tight ${c.className}`}
        >
          {c.text}
        </span>
      ))}
    </div>
  );
}

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
  /** Floating −N / +N over portraits while presentation plays */
  const [hpFloats, setHpFloats] = useState<Record<string, HpFloat[]>>({});
  const prevHpMapRef = useRef<Map<string, number> | null>(null);
  const floatSeqRef = useRef(0);

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

  /**
   * Spawn floating combat numbers when a beat's reveal changes unit HP.
   *
   * Important: baseline must be the *pre-resolve* board (visualHold), not the
   * first revealed view. Boss resolve often starts with a single `boss` cue
   * whose reveal already includes Line Attack damage on the whole party — if we
   * baseline on that view, every delta is zero and no floats appear.
   *
   * Per-float timeouts are not cancelled on the next beat so numbers finish animating.
   */
  useEffect(() => {
    if (!playing) {
      prevHpMapRef.current = null;
      setHpFloats({});
      return;
    }
    const next = hpMapFromView(view);
    let prev = prevHpMapRef.current;
    if (!prev) {
      prev = visualHold ? hpMapFromView(visualHold) : next;
      prevHpMapRef.current = prev;
    }

    const spawned = hpFloatSpawns(prev, next, playIndex, floatSeqRef);
    prevHpMapRef.current = next;

    if (!spawned.length) return;

    setHpFloats((cur) => {
      const copy: Record<string, HpFloat[]> = { ...cur };
      for (const { unitId, float } of spawned) {
        copy[unitId] = [...(copy[unitId] ?? []), float];
      }
      return copy;
    });

    for (const { unitId, float } of spawned) {
      window.setTimeout(() => {
        setHpFloats((cur) => {
          const list = cur[unitId];
          if (!list?.length) return cur;
          const nextList = list.filter((f) => f.key !== float.key);
          if (nextList.length === list.length) return cur;
          if (!nextList.length) {
            const { [unitId]: _, ...rest } = cur;
            return rest;
          }
          return { ...cur, [unitId]: nextList };
        });
      }, FLOAT_MS);
    }
  }, [playing, playIndex, view, visualHold]);

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

  /**
   * Arrow keys step the magnet one living seat (screen-left = back/higher pos).
   * e.repeat ignored so holding a key does not slide.
   * Number keys removed — keyboard layout fights the visual line order.
   * Mouse still uses the 1–6 pad under the party.
   */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (playing) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        void dropTokens();
        return;
      }
      if (e.repeat) return;
      if (team.phase !== "awaiting_magnet") return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      // Living seats ordered by position number (1 front … 6 back)
      const living = ([1, 2, 3, 4, 5, 6] as const).filter((p) =>
        livingPositions.has(p),
      );
      if (!living.length) return;
      const cur = team.magnetPosition;
      let idx = living.indexOf(cur as (typeof living)[number]);
      if (idx < 0) {
        // Magnet on empty seat — snap to nearest living
        idx = living.reduce(
          (best, p, i) =>
            Math.abs(p - cur) < Math.abs(living[best]! - cur) ? i : best,
          0,
        );
      }
      // UI: left = back (higher #), right = front (lower #)
      const nextIdx = e.key === "ArrowLeft" ? idx + 1 : idx - 1;
      if (nextIdx < 0 || nextIdx >= living.length) return;
      const next = living[nextIdx]!;
      if (next === cur) return;
      void setMagnet(next);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    setMagnet,
    team.phase,
    team.magnetPosition,
    livingPositions,
    busy,
    playing,
  ]);

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

  const playbookGrades = (
    pendingGrades.length
      ? [...new Set(pendingGrades)]
      : (["A", "B", "C", "D", "F"] as Grade[])
  ) as Grade[];

  return (
    <div className="h-dvh max-h-dvh flex flex-col relative overflow-hidden">
      {activeBeat?.bubble &&
        (activeBeat.bubble.side !== "party" ||
          !activeBeat.bubble.speakerId) && (
          <StageBubble cue={activeBeat} />
        )}

      {/* Thin status strip — no tall token header */}
      <div className="shrink-0 border-b border-parchment/10 bg-navy/80 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-parchment-dim">
          <span>
            Round <strong className="text-parchment">{team.round}</strong>
          </span>
          <span className="opacity-40">·</span>
          <span className="capitalize text-rune">
            {playing ? "watching…" : phaseLabel}
          </span>
          <span className="opacity-40">·</span>
          <span>
            Pool {team.tokensRemaining ?? "?"}
            {team.tokensDiscard != null ? ` · used ${team.tokensDiscard}` : ""}
          </span>
        </div>
        <div className="text-parchment-dim/80">
          {playing
            ? "Resolving actions…"
            : team.phase === "awaiting_magnet"
              ? "← → magnet · click pad · Space drop"
              : "\u00a0"}
        </div>
      </div>

      {showBossTelegraphBanner && (
        <div className="shrink-0 bg-crimson/90 text-parchment text-center py-1.5 px-3 text-sm font-bold tracking-wide animate-pulse">
          ⚠ {team.boss?.name ?? "Boss"} is about to attack!
        </div>
      )}
      {(team.phase === "victory" || team.phase === "defeat") && !playing && (
        <div className="shrink-0">
          <FightSummary team={team} />
        </div>
      )}

      {/* Battlefield — party/minions/boss share a vertical center line */}
      <div className="flex-1 min-h-0 grid grid-cols-12 gap-2 p-2 md:p-3 items-center">
        {/* Party + planning tools (natural height, vertically centered with gap/boss) */}
        <div className="col-span-12 md:col-span-5 flex flex-col justify-center min-h-0 gap-1.5">
          {/* Incoming tokens (left) + grade explainers (right of tokens) */}
          <div className="shrink-0 flex items-start gap-2 md:gap-3 rounded-lg border border-parchment/10 bg-navy-light/50 px-2 py-1.5">
            <div className="shrink-0">
              <div className="text-[9px] uppercase tracking-wider text-parchment-dim mb-1">
                Drop
              </div>
              <div className="flex items-center gap-1.5 md:gap-2">
                {([0, 1, 2] as const).map((i) => {
                  const g = pendingGrades[i];
                  if (!g) {
                    return <GradeTokenSlot key={`slot-${i}`} size="md" />;
                  }
                  return (
                    <GradeToken
                      key={`${g}-${i}-${flashTokens ? "fall" : "idle"}`}
                      grade={g}
                      size="md"
                      bob={!flashTokens}
                      falling={flashTokens}
                      delaySec={i * 0.12}
                      title={`${g} token — drops when you press Drop Tokens`}
                    />
                  );
                })}
              </div>
            </div>
            <div className="min-w-0 flex-1 border-l border-parchment/10 pl-2 md:pl-3">
              {team.phase === "awaiting_magnet" && magnetSoldier && !playing ? (
                <>
                  <div className="text-[11px] md:text-xs mb-1 truncate">
                    <span className="text-parchment-dim">Magnet · </span>
                    <strong>
                      {ARCHETYPE_ICONS[magnetSoldier.archetype]}{" "}
                      {magnetSoldier.name}
                    </strong>
                    <span className="text-parchment-dim">
                      {" "}
                      ({magnetSoldier.archetype})
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {playbookGrades.map((g) => {
                      const risk = gradeRiskNote(magnetSoldier.archetype, g);
                      return (
                        <div
                          key={g}
                          className={`rounded border px-1.5 py-0.5 text-[10px] md:text-[11px] bg-navy/70 leading-snug max-w-[12rem] flex items-start gap-1 ${GRADE_CLASS[g]}`}
                          style={{ borderColor: GRADE_COLORS[g] }}
                          title={describeGradeEffect(magnetSoldier.archetype, g)}
                        >
                          <GradeToken grade={g} size="xs" className="mt-0.5" />
                          <div className="min-w-0">
                            <span className="text-parchment-dim">
                              {describeGradeEffect(magnetSoldier.archetype, g)}
                            </span>
                            {risk && (
                              <span className="block text-grade-f text-[9px]">
                                {risk}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="text-[11px] text-parchment-dim/60 italic py-1">
                  {team.phase === "victory" || team.phase === "defeat"
                    ? "Fight over"
                    : "Playbook pauses while the round resolves"}
                </div>
              )}
            </div>
          </div>

          <div className="text-[10px] uppercase tracking-widest text-parchment-dim flex justify-between shrink-0">
            <span>Back (6)</span>
            <span className="normal-case tracking-normal">
              🛡{" "}
              {view.partyShield.active && view.partyShield.remaining > 0
                ? `Shield ${view.partyShield.remaining}`
                : "Shield down"}
            </span>
            <span className="text-rune">Front (1) →</span>
          </div>

          {/* Fixed-height cards — do not stretch to fill the column.
              When party shield is up: soft silver envelope around the whole strip
              (dead seats included — still inside the ward). On/off only. */}
          <div
            className={`relative shrink-0 flex items-end gap-1 md:gap-1.5 p-1 overflow-visible ${
              view.partyShield.active && view.partyShield.remaining > 0
                ? "party-shield-ward"
                : ""
            }`}
            aria-label={
              view.partyShield.active && view.partyShield.remaining > 0
                ? `Party shield active, ${view.partyShield.remaining} remaining`
                : undefined
            }
          >
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
                  className={`relative flex-1 min-w-0 overflow-visible rounded-lg border bg-navy-light/70 p-0.5 md:p-1 text-center transition ${
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
                  <div className="text-[8px] text-parchment-dim leading-none py-0.5">
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
                    statuses={s.statuses}
                    claimGrade={claim?.effectiveGrade}
                    subtitle={s.archetype}
                    size="sm"
                    hpFloats={hpFloats[s.id]}
                  />
                </button>
              );
            })}
            <div
              className={`pointer-events-none absolute bottom-0 h-1.5 w-[14%] rounded-full transition-all duration-200 ${
                magnetLocked
                  ? "magnet-shock-lock bg-yellow-300/90"
                  : "magnet-glow bg-rune/80"
              }`}
              style={{
                left: `calc(${magnetPct}% * 0.86 + 1%)`,
              }}
            />
          </div>
          {/* Effects rail — clearly below cards; grows down so card boxes stay equal height */}
          <div className="shrink-0 flex items-start gap-1 md:gap-1.5 min-h-[1rem] mt-0.5 pt-1 border-t border-parchment/10">
            {partyVisual.map((s) => (
              <div key={`fx-${s.id}`} className="flex-1 min-w-0">
                <PartySeatEffects
                  name={s.name}
                  block={s.block}
                  statuses={s.statuses}
                />
              </div>
            ))}
          </div>
          {magnetLocked && team.phase === "awaiting_magnet" && !playing && (
            <div className="shrink-0 text-center text-[11px] font-semibold text-yellow-200">
              Magnet Locked — shocked this round
            </div>
          )}
          <div className="shrink-0 flex flex-col items-center gap-0.5">
            <div className="flex justify-center gap-1">
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
                    className={`w-8 h-8 md:w-9 md:h-9 rounded-md font-bold text-sm border transition ${
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
            {/* Keyboard hint: arrows match screen (left = back, right = front) */}
            <div
              className="flex items-center justify-between w-[calc(6*2rem+5*0.25rem)] md:w-[calc(6*2.25rem+5*0.25rem)] text-parchment-dim/70 select-none"
              aria-hidden
              title="Arrow keys move the magnet one seat"
            >
              <span className="text-sm leading-none font-semibold text-rune/80">
                ←
              </span>
              <span className="text-[9px] uppercase tracking-wider">
                keys
              </span>
              <span className="text-sm leading-none font-semibold text-rune/80">
                →
              </span>
            </div>
          </div>
        </div>

        {/* Minions + party DoT warning (gap is less busy than party column) */}
        <div className="col-span-12 md:col-span-3 flex flex-col items-center justify-center min-h-0 gap-1.5">
          <div className="text-[10px] uppercase tracking-widest text-parchment-dim mb-0.5 shrink-0">
            Gap / Adds
          </div>
          <div className="flex flex-wrap gap-2 justify-center content-center overflow-visible">
            {view.minions?.length ? (
              view.minions.map((m) => {
                const focused = focusSet.has(m.id);
                const dead = m.currentHp <= 0;
                return (
                  <div
                    key={m.id}
                    className={`relative rounded-lg border px-1.5 py-1.5 min-w-[4.5rem] max-w-[6rem] transition ${
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
                      showStatuses
                      hpFloats={hpFloats[m.id]}
                    />
                  </div>
                );
              })
            ) : (
              <div className="text-parchment-dim/50 text-xs italic text-center px-2">
                Empty corridor…
              </div>
            )}
          </div>
          {(() => {
            const dots = partyDotSummary(partyVisual);
            if (!dots.length) return null;
            return (
              <div
                className="w-full max-w-[14rem] shrink-0 flex flex-col gap-1"
                role="status"
                aria-live="polite"
              >
                {dots.map((d) => {
                  const meta = DOT_BANNER[d.type];
                  const stackNote = d.stacks > 1 ? ` ×${d.stacks}` : "";
                  const rampNote =
                    d.intensity > 1 ? ` · ramp ⬆${d.intensity}` : "";
                  return (
                    <div
                      key={d.type}
                      className={`rounded-md border px-2 py-1.5 text-center text-[11px] md:text-xs font-bold tracking-wide ${meta.className}`}
                      title={`${d.count} party member(s) have ${d.type}. Damage ticks each round and ramps if left up.`}
                    >
                      <span aria-hidden>{meta.icon}</span> Party {meta.word}
                      {stackNote}
                      {rampNote}
                      <div className="text-[9px] md:text-[10px] font-semibold opacity-90 mt-0.5 normal-case tracking-normal">
                        Ticks each round · clear it or it grows
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* Boss */}
        <div className="col-span-12 md:col-span-4 flex flex-col items-center justify-center min-h-0">
          <div className="text-[10px] uppercase tracking-widest text-parchment-dim mb-1 shrink-0">
            Boss
          </div>
          {view.boss ? (
            <div
              className={`relative w-full max-w-[14rem] md:max-w-[16rem] rounded-xl border p-2 text-center transition ${
                focusSet.has("boss") ||
                activeBeat?.kind === "boss" ||
                activeBeat?.kind === "telegraph" ||
                team.phase === "boss_telegraph"
                  ? "border-grade-f ring-2 ring-crimson/50 bg-gradient-to-b from-crimson/50 to-navy-light unit-focus-hostile"
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
                hpFloats={hpFloats.boss}
              />
              <BossStatusRow boss={view.boss} />
            </div>
          ) : (
            <div className="text-parchment-dim">No boss</div>
          )}
        </div>
      </div>

      {/* Compact action HUD — log omitted from play surface */}
      <div className="shrink-0 border-t border-parchment/10 bg-navy/95 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div className="text-xs text-parchment-dim">
            {view.partyShield.active && view.partyShield.remaining > 0 && (
              <span className="text-rune mr-2">
                🛡 {view.partyShield.remaining}
              </span>
            )}
            <span className="capitalize text-rune">
              {playing ? "watching actions" : phaseLabel}
            </span>
          </div>
          <div className="flex gap-1.5 items-center flex-wrap justify-end">
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
              className={`rounded-lg border px-2 py-1.5 text-xs ${
                musicOn
                  ? "border-rune/50 text-rune"
                  : "border-parchment/20 text-parchment-dim"
              }`}
            >
              {musicOn ? "🎵" : "Music"}
            </button>
            <button
              type="button"
              title="Mute all sound"
              onClick={() => {
                const next = !mute;
                setMuted(next);
                setMuteState(next);
              }}
              className="rounded-lg border border-parchment/20 px-2 py-1.5 text-sm"
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
              className={`rounded-lg border px-2 py-1.5 text-xs ${
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
                className="rounded-lg border border-parchment/30 px-2.5 py-1.5 text-sm"
              >
                Skip
              </button>
            )}
            {team.phase === "awaiting_magnet" && (
              <button
                type="button"
                disabled={busy || playing}
                onClick={() => void dropTokens()}
                className="rounded-lg bg-rune/90 hover:bg-rune text-navy font-bold px-4 py-2 text-sm disabled:opacity-50"
              >
                Drop Tokens
              </button>
            )}
            {team.phase === "boss_telegraph" && (
              <button
                type="button"
                disabled={busy || playing}
                onClick={() => void runBossResolve()}
                className="rounded-lg bg-crimson hover:bg-crimson-bright px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                {busy ? "Resolving…" : "Boss attacks!"}
              </button>
            )}
            {team.phase === "victory" && !playing && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void afterVictory()}
                className="rounded-lg bg-grade-a/90 text-navy font-bold px-4 py-2 text-sm"
              >
                {team.isFinalRoom
                  ? "Complete campaign"
                  : "Continue → camp"}
              </button>
            )}
            {team.phase === "defeat" && !playing && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void afterDefeat()}
                className="rounded-lg bg-crimson hover:bg-crimson-bright px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                {busy ? "…" : "Reform & retry"}
              </button>
            )}
            <button
              type="button"
              onClick={onLeave}
              className="rounded-lg border border-parchment/20 px-2.5 py-1.5 text-sm"
            >
              Leave
            </button>
          </div>
        </div>

        {error && <p className="text-grade-f text-sm mt-1">{error}</p>}

        {/* Hidden log sink keeps auto-scroll ref valid without eating viewport */}
        <div ref={logEndRef} className="sr-only" aria-hidden>
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
        <p className="text-[10px] text-parchment-dim text-center mt-1 leading-tight">
          Front nearest boss · magnet{" "}
          <kbd className="px-1 border border-parchment/30 rounded">←</kbd>{" "}
          <kbd className="px-1 border border-parchment/30 rounded">→</kbd>{" "}
          or click pad ·{" "}
          <kbd className="px-1 border border-parchment/30 rounded">Space</kbd>{" "}
          drop
        </p>
      </div>
    </div>
  );
}
