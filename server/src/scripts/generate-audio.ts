/**
 * Pre-generate all catalog audio clips via ElevenLabs into server/data/audio/
 *
 * Usage (from repo root):
 *   npm run audio:generate -w server
 *   npm run audio:generate -w server -- --force
 */
import { loadEnv } from "../loadEnv.js";
import { ensureAllClips, hasApiKey, listCachedClips, probePermissions } from "../audio/elevenlabs.js";

loadEnv();

const force = process.argv.includes("--force");

async function main() {
  console.log("ElevenLabs audio generator");
  if (!hasApiKey()) {
    console.error("Missing ELEVENLABS_API_KEY (set in repo-root .env)");
    process.exit(1);
  }

  const probe = await probePermissions();
  console.log("Permissions probe:", {
    tts: probe.tts,
    sfx: probe.sfx,
    voicesRead: probe.voicesRead,
    modelsRead: probe.modelsRead,
    userRead: probe.userRead,
  });
  if (probe.messages.length) {
    console.log("Notes:", probe.messages);
  }

  if (!probe.sfx && !probe.tts) {
    console.error("Neither SFX nor TTS works — check API key permissions.");
    process.exit(1);
  }

  console.log(force ? "Regenerating all clips…" : "Generating missing clips…");
  const results = await ensureAllClips(force, (id, ok, detail) => {
    console.log(ok ? `  ✓ ${id}` : `  ✗ ${id}: ${detail}`);
  });

  const ok = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok);
  console.log(`\nDone: ${ok}/${results.length} ok`);
  if (fail.length) {
    console.log("Failed:", fail);
    process.exit(1);
  }
  console.log(
    "Cache:",
    listCachedClips()
      .map((c) => `${c.id}(${c.bytes})`)
      .join(", "),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
