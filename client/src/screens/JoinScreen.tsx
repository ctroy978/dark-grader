import { useState } from "react";
import { api, type EnrichedTeam } from "../api";

export default function JoinScreen({
  onJoined,
  onCancel,
}: {
  onJoined: (team: EnrichedTeam) => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const team = await api.join(code.trim().toUpperCase());
      onJoined(team);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Join failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="w-full max-w-sm rounded-xl border border-parchment/20 bg-navy-light/90 p-5 space-y-4 shadow-xl"
    >
      <h2 className="text-lg font-semibold">Join Team</h2>
      <label className="block text-sm text-parchment-dim">
        Invite code
        <input
          className="mt-1 w-full rounded-lg bg-navy border border-parchment/20 px-3 py-2 tracking-widest uppercase text-center text-xl"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="ABCDE"
          maxLength={8}
          autoFocus
        />
      </label>
      {error && <p className="text-grade-f text-sm">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-lg border border-parchment/20 py-2 text-sm hover:bg-navy"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading || code.length < 3}
          className="flex-1 rounded-lg bg-crimson hover:bg-crimson-bright py-2 text-sm font-semibold disabled:opacity-40"
        >
          {loading ? "Joining…" : "Enter"}
        </button>
      </div>
    </form>
  );
}
