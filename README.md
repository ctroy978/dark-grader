# Dungeon Grades

Browser-based classroom dungeon crawler. Test letter grades (A–F) become power tokens that a party of fantasy soldiers claim via the **Token Magnet**.

Built for a single classroom server (LAN / firewall). One shared Chromebook per team.

## Stack

- **Client:** React + TypeScript + Vite + Tailwind
- **Server:** Node + Fastify + Socket.IO
- **DB:** JSON files under `server/data/` (classroom + per-team state)
- **Shared:** combat types, magnet math, balance tables

## Quick start

```bash
npm install
npm run build -w @dungeon-grades/shared
npm run dev:server   # http://localhost:3001
npm run dev:client   # http://localhost:5173
```

Default teacher PIN: `teacher` (override with `TEACHER_PIN` env var).

### Audio (ElevenLabs)

Put your key in the **repo-root** `.env` (see `.env.example`):

```bash
ELEVENLABS_API_KEY=...
# optional:
# ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM
```

Pre-generate all SFX + short VO clips (cached under `server/data/audio/`):

```bash
npm run audio:generate
```

The server also lazy-generates a clip on first request if the cache is empty. The API key stays on the server only.

### Classroom flow

1. **Teacher** → login → paste grades → Generate Token Pool → set **campaign path** (rooms + bosses) → Create Invite Code(s).
2. **Students** (one computer per team) → join → **form a party of 6** → enter room.
3. Each round: keys **1–6** move the magnet → **Drop Tokens** (or Space).
4. Victory → **Continue** → camp heal → reform → next room until campaign complete.

Default path: **Ash Wraith → Bone Colossus → Bone Colossus** (3 rooms).

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev:server` | API + game engine |
| `npm run dev:client` | UI with proxy to API |
| `npm test` | Magnet + combat unit tests |
| `npm run build` | Production build all packages |
| `npm start` | Run compiled server |

## Docs

- [`docs/HANDOFF.md`](docs/HANDOFF.md) — **start here after a context restart** (current rules, run, open issues)
- [`docs/DESIGN.md`](docs/DESIGN.md) — architecture, balance, PR plan (may lag code)
- Specs in repo root / `docs/`

## License

Private classroom project.
