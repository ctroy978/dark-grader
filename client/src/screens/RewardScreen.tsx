import { useEffect, useMemo, useState } from "react";
import {
  HEALING_POTION_DEFINITION,
  RELIC_DEFINITIONS,
  relicBindingEligible,
  type RelicId,
} from "@dungeon-grades/shared";
import { api, getSocket, type EnrichedTeam } from "../api";
import { RelicIcon } from "../relics/RelicIcon";

type Choice =
  | { kind: "relic"; relicId: RelicId }
  | { kind: "healing_potion" };

function PotionIcon() {
  const [failed, setFailed] = useState(false);
  return (
    <span className="inline-flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-grade-a/50 bg-navy text-3xl shadow-md">
      {!failed ? (
        <img
          src={HEALING_POTION_DEFINITION.assetPath}
          alt=""
          className="h-full w-full object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden>🧪</span>
      )}
    </span>
  );
}

export default function RewardScreen({
  team,
  onTeamUpdate,
  onLeave,
}: {
  team: EnrichedTeam;
  onTeamUpdate: (team: EnrichedTeam) => void;
  onLeave: () => void;
}) {
  const [choice, setChoice] = useState<Choice | null>(null);
  const [soldierId, setSoldierId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = team.items.pendingReward;

  useEffect(() => {
    const socket = getSocket();
    socket.emit("subscribe:team", team.teamId);
    const onState = (next: EnrichedTeam) => onTeamUpdate(next);
    socket.on("team:state", onState);
    return () => {
      socket.off("team:state", onState);
    };
  }, [team.teamId, onTeamUpdate]);

  const living = useMemo(
    () => team.roster.filter((soldier) => soldier.alive),
    [team.roster],
  );
  const eligible = useMemo(
    () => living.filter(relicBindingEligible),
    [living],
  );
  const targets = choice?.kind === "relic" ? eligible : living;
  const selectedSoldier = team.roster.find((soldier) => soldier.id === soldierId);

  function selectChoice(next: Choice) {
    setChoice(next);
    setSoldierId(null);
    setError(null);
  }

  async function confirm() {
    if (!choice || !soldierId) return;
    setBusy(true);
    setError(null);
    try {
      const next =
        choice.kind === "relic"
          ? await api.chooseRelicReward(team.teamId, choice.relicId, soldierId)
          : await api.chooseHealingPotion(team.teamId, soldierId);
      onTeamUpdate(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Reward selection failed");
    } finally {
      setBusy(false);
    }
  }

  if (!pending) {
    return (
      <div className="min-h-full flex items-center justify-center p-6">
        <div className="rounded-xl border border-grade-f/40 bg-navy-light p-6 text-center">
          <p className="text-grade-f">This reward is no longer available.</p>
          <button className="mt-4 rounded-lg border px-4 py-2" onClick={onLeave}>
            Leave
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-rune">
              Room {pending.sourceRoomIndex + 1} reward
            </p>
            <h1 className="text-3xl font-bold text-parchment">Choose one reward</h1>
            <p className="mt-1 text-sm text-parchment-dim">
              Camp recovery is complete. Take permanent power or fully heal one
              living soldier before forming the next party.
            </p>
          </div>
          <button
            type="button"
            onClick={onLeave}
            className="rounded-lg border border-parchment/20 px-3 py-1.5 text-sm"
          >
            Leave
          </button>
        </header>

        <section className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {pending.relicOfferIds.map((relicId) => {
            const definition = RELIC_DEFINITIONS[relicId];
            const selected = choice?.kind === "relic" && choice.relicId === relicId;
            const unavailable = eligible.length === 0;
            return (
              <button
                key={relicId}
                type="button"
                disabled={unavailable}
                onClick={() => selectChoice({ kind: "relic", relicId })}
                className={`min-h-56 rounded-xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  selected
                    ? "border-rune bg-rune/15 ring-2 ring-rune/30"
                    : "border-parchment/20 bg-navy-light/70 hover:border-rune/50"
                }`}
              >
                <RelicIcon relicId={relicId} size="lg" />
                <h2 className="mt-3 text-lg font-bold">{definition.name}</h2>
                <p className="mt-2 text-sm text-parchment-dim">
                  {definition.description}
                </p>
                <p className="mt-3 text-xs text-rune">
                  {eligible.length} eligible bearer{eligible.length === 1 ? "" : "s"}
                </p>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => selectChoice({ kind: "healing_potion" })}
            className={`min-h-56 rounded-xl border p-4 text-left transition ${
              choice?.kind === "healing_potion"
                ? "border-grade-a bg-grade-a/15 ring-2 ring-grade-a/30"
                : "border-parchment/20 bg-navy-light/70 hover:border-grade-a/60"
            }`}
          >
            <PotionIcon />
            <h2 className="mt-3 text-lg font-bold">
              {HEALING_POTION_DEFINITION.name}
            </h2>
            <p className="mt-2 text-sm text-parchment-dim">
              {HEALING_POTION_DEFINITION.description}
            </p>
            <p className="mt-3 text-xs text-grade-a">Always available</p>
          </button>
        </section>

        {choice && (
          <section className="rounded-xl border border-rune/30 bg-navy/80 p-4">
            <h2 className="text-lg font-semibold">
              {choice.kind === "relic" ? "Choose the permanent bearer" : "Choose who drinks it"}
            </h2>
            <p className="mt-1 text-sm text-parchment-dim">
              {choice.kind === "relic"
                ? "Only living soldiers with an empty relic slot are eligible. Binding cannot be changed."
                : "The potion is consumed immediately and cannot revive a fallen soldier."}
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {targets.map((soldier) => {
                const heal = Math.max(0, soldier.maxHp - soldier.currentHp);
                return (
                  <button
                    key={soldier.id}
                    type="button"
                    onClick={() => setSoldierId(soldier.id)}
                    className={`rounded-lg border p-3 text-left ${
                      soldierId === soldier.id
                        ? "border-rune bg-rune/15"
                        : "border-parchment/15 bg-navy-light/60 hover:border-rune/40"
                    }`}
                  >
                    <span className="font-semibold">{soldier.name}</span>
                    <span className="block text-xs text-parchment-dim">
                      {soldier.archetype} · {soldier.currentHp}/{soldier.maxHp} HP
                    </span>
                    {choice.kind === "healing_potion" && (
                      <span className={heal > 0 ? "text-grade-a text-xs" : "text-grade-d text-xs"}>
                        {heal > 0 ? `Restore ${heal} HP` : "No healing needed · potion will still be consumed"}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {targets.length === 0 && (
              <p className="mt-3 text-sm text-grade-d">
                Every living soldier already carries a relic. Choose the Healing Potion.
              </p>
            )}

            {selectedSoldier && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-parchment/15 bg-navy-light/60 p-3">
                <p className="text-sm">
                  Confirm {choice.kind === "relic" ? RELIC_DEFINITIONS[choice.relicId].name : "Healing Potion"} for{" "}
                  <strong>{selectedSoldier.name}</strong>? This choice cannot be changed.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void confirm()}
                  className="rounded-lg bg-crimson px-5 py-2.5 font-semibold disabled:opacity-50"
                >
                  {busy ? "Applying…" : "Confirm reward"}
                </button>
              </div>
            )}
          </section>
        )}

        {error && (
          <p className="rounded-lg border border-grade-f/40 bg-crimson/20 px-3 py-2 text-sm text-grade-f">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
