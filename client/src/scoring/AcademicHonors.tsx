import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  SCORE_TRACK_LABELS,
  SCORE_TRACKS,
  badgeAssetPath,
  type ScoreAwardResult,
  type ScoreTrack,
  type ScoringSummary,
} from "@dungeon-grades/shared";

const TRACK_INITIALS: Record<ScoreTrack, string> = {
  campaign: "C",
  preservation: "P",
  tempo: "T",
};

function trackRank(summary: ScoringSummary, track: ScoreTrack): number {
  if (track === "campaign") return summary.campaignRank;
  if (track === "preservation") return summary.preservationRank;
  return summary.tempoRank;
}

function trackTitle(summary: ScoringSummary, track: ScoreTrack): string {
  if (track === "campaign") return summary.campaignTitle;
  if (track === "preservation") return summary.preservationTitle;
  return summary.tempoTitle;
}

function BadgeArt({
  track,
  rank,
  compact,
  large = false,
}: {
  track: ScoreTrack;
  rank: number;
  compact: boolean;
  large?: boolean;
}) {
  const src = badgeAssetPath(track, rank);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  const size = large
    ? "h-[min(20rem,70vw)] w-[min(20rem,70vw)]"
    : compact
      ? "h-12 w-12"
      : "h-20 w-20";
  if (failed) {
    return (
      <div
        className={`${size} shrink-0 rounded-full border-2 border-rune/50 bg-navy flex items-center justify-center shadow-inner`}
        aria-label={`${SCORE_TRACK_LABELS[track]} rank ${rank}`}
      >
        <span className="text-rune font-black text-lg">
          {TRACK_INITIALS[track]}{rank}
        </span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={`${SCORE_TRACK_LABELS[track]} rank ${rank}`}
      className={`${size} shrink-0 object-contain`}
      onError={() => setFailed(true)}
    />
  );
}

function wasAwarded(awards: ScoreAwardResult | null | undefined, track: ScoreTrack): boolean {
  if (!awards) return false;
  if (track === "campaign") return awards.campaignAwarded;
  if (track === "preservation") return awards.preservationAwarded;
  return awards.tempoAwarded;
}

export function AcademicHonorsPanel({
  summary,
  awards,
  compact = false,
}: {
  summary: ScoringSummary;
  awards?: ScoreAwardResult | null;
  compact?: boolean;
}) {
  const [previewTrack, setPreviewTrack] = useState<ScoreTrack | null>(null);

  useEffect(() => {
    if (!previewTrack) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewTrack(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewTrack]);

  const preview = previewTrack
    ? {
        rank: trackRank(summary, previewTrack),
        title: trackTitle(summary, previewTrack),
      }
    : null;

  return (
    <section className={`rounded-xl border border-rune/25 bg-navy/60 ${compact ? "p-2" : "p-4"}`}>
      <div className="flex items-center justify-between gap-3 mb-2">
        <h2 className={`${compact ? "text-sm" : "text-lg"} font-semibold text-parchment`}>
          Academic Honors
        </h2>
        <span className="font-bold text-rune">
          Score {summary.total}/{summary.maximum}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {SCORE_TRACKS.map((track) => {
          const rank = trackRank(summary, track);
          const awarded = wasAwarded(awards, track);
          return (
            <div
              key={track}
              className={`rounded-lg border p-2 flex items-center gap-2 ${
                awarded
                  ? "border-grade-a/60 bg-grade-a/10 ring-1 ring-grade-a/30"
                  : "border-parchment/15 bg-navy-light/40"
              }`}
            >
              <button
                type="button"
                className="shrink-0 rounded-full transition hover:scale-105 focus:outline-none focus:ring-2 focus:ring-rune/70"
                onClick={() => setPreviewTrack(track)}
                title={`View ${SCORE_TRACK_LABELS[track]} badge`}
                aria-label={`View larger ${SCORE_TRACK_LABELS[track]} badge: ${trackTitle(summary, track)}`}
              >
                <BadgeArt track={track} rank={rank} compact={compact} />
              </button>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-wide text-parchment-dim truncate">
                  {SCORE_TRACK_LABELS[track]}
                </div>
                <div className="text-sm font-semibold text-parchment leading-tight">
                  {trackTitle(summary, track)}
                </div>
                <div className="mt-1 flex gap-1" aria-label={`${rank} of 6 ranks`}>
                  {Array.from({ length: 6 }).map((_, index) => (
                    <span
                      key={index}
                      className={`h-1.5 flex-1 rounded-full ${
                        index < rank ? "bg-rune" : "bg-parchment/15"
                      }`}
                    />
                  ))}
                </div>
                {awards && (
                  <div className={`mt-1 text-[10px] ${awarded ? "text-grade-a" : "text-parchment-dim"}`}>
                    {awarded ? "Advanced this room" : "No upgrade this room"}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {previewTrack && preview &&
        createPortal(
          <div
            className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 p-4"
            role="dialog"
            aria-modal="true"
            aria-label={`${SCORE_TRACK_LABELS[previewTrack]} badge preview`}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setPreviewTrack(null);
            }}
          >
            <div className="relative max-w-xl rounded-2xl border border-rune/40 bg-navy p-5 text-center shadow-2xl shadow-black">
              <button
                type="button"
                autoFocus
                className="absolute right-3 top-3 z-10 h-9 w-9 rounded-full border border-parchment/25 bg-navy-light text-lg text-parchment hover:border-rune/60"
                onClick={() => setPreviewTrack(null)}
                aria-label="Close badge preview"
              >
                ×
              </button>
              <BadgeArt
                track={previewTrack}
                rank={preview.rank}
                compact={false}
                large
              />
              <div className="mt-3 text-xs uppercase tracking-widest text-rune">
                {SCORE_TRACK_LABELS[previewTrack]}
              </div>
              <div className="mt-1 text-xl font-bold text-parchment">
                {preview.title}
              </div>
              <div className="mt-1 text-sm text-parchment-dim">
                Rank {preview.rank} of 6
              </div>
            </div>
          </div>,
          document.body,
        )}
    </section>
  );
}
