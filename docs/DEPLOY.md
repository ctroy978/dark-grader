# Deploy GradeForge on a classroom server (nginx)

The game is a Vite/React client plus a Node (Fastify + Socket.IO) server.
Classroom state is JSON under `server/data/`. Audio clips are checked in under
`server/data/audio/`. No cloud account is required to run a class.

This document assumes:

- Linux server already running **nginx** as a reverse proxy
- Students reach the server only from inside the building firewall
- You will `git pull` updates onto that machine

## What students open

After nginx is in front of Node:

- Game / join: `http://<server>/gradeforge/#/join`
- Teacher dashboard: `http://<server>/gradeforge/#/teacher`
- Codex (how to play, characters, bosses): `http://<server>/gradeforge/`

`/` on the server is left for whatever else nginx already hosts.

Use the LAN hostname or IP Chromebooks already resolve. HTTPS is optional
on an isolated building network.

## One-time setup

### 1. Node.js 20+

```bash
node -v   # v20 or newer
```

### 2. Clone (or copy) the repo

Pick a stable path. The sample unit file uses `/opt/gradeforge`:

```bash
sudo mkdir -p /opt/gradeforge
sudo chown "$USER":"$USER" /opt/gradeforge
git clone git@github.com:ctroy978/dark-grader.git /opt/gradeforge
cd /opt/gradeforge
```

Keep the clone wherever you like — just use the same path in the systemd unit.

### 3. Production `.env`

Copy the example and **set a real teacher PIN**. Do not copy a developer
`.env` from a laptop.

```bash
cp .env.example .env
nano .env
```

Required on the classroom box:

```
NODE_ENV=production
HOST=127.0.0.1
PORT=3001
BASE_PATH=/gradeforge
TEACHER_PIN=pick-a-pin-students-will-not-guess
```

The process **refuses to start** in production if `TEACHER_PIN` is still
`teacher`. Override only for a bench test with `ALLOW_DEFAULT_TEACHER_PIN=1`.

### 4. Install, build, check

```bash
npm install
npm run build
node scripts/deploy-check.mjs
```

Later updates:

```bash
git pull
bash scripts/post-pull.sh
sudo systemctl restart gradeforge
```

`post-pull.sh` is `npm install` + `npm run build` + the same check.

### 5. systemd

Edit `deploy/gradeforge.service`:

- `User` / `Group` — the Linux account that owns the clone
- `WorkingDirectory` — **must** be `<clone>/server` so `data/` and `data/audio/` resolve
- `EnvironmentFile` — `<clone>/.env`
- `ReadWritePaths` — `<clone>/server/data`

Then:

```bash
sudo cp deploy/gradeforge.service /etc/systemd/system/gradeforge.service
sudo systemctl daemon-reload
sudo systemctl enable --now gradeforge
sudo systemctl status gradeforge
curl -sS http://127.0.0.1:3001/gradeforge/api/health
# {"ok":true,"service":"gradeforge"}
```

Node listens on **127.0.0.1:3001** so Chromebooks cannot skip nginx.

### 6. nginx

`deploy/nginx.conf` is a **snippet**, not a second default site. Paste the
`map` into the `http { }` section of `/etc/nginx/nginx.conf` if you do not
already have `map $http_upgrade`. Paste the two `location` blocks into the
**existing** `server { listen 80; }` that Chromebooks already use. A second
`listen 80` server will never see `/gradeforge/` if the default site wins.

Do **not** put a trailing path on `proxy_pass` (`http://127.0.0.1:3001`, not
`http://127.0.0.1:3001/`). Node expects the `/gradeforge` prefix.

```bash
sudo nginx -t && sudo systemctl reload nginx
curl -sS http://127.0.0.1/gradeforge/api/health
```

### 7. Host firewall (this machine)

Allow **80** from the LAN. Do **not** publish **3001**.

```bash
# example with ufw
sudo ufw allow 80/tcp
sudo ufw deny 3001/tcp
```

The building firewall already keeps the internet out; this just keeps students
on the nginx front door.

## Day-of-class check

1. `systemctl is-active gradeforge` → `active`
2. Open `http://<server>/gradeforge/#/teacher`, sign in with `TEACHER_PIN`
3. Create / select a classroom, paste grades, open the room
4. On a student Chromebook, open `http://<server>/gradeforge/#/join` and enter the invite code

Live combat uses Socket.IO (`/gradeforge/socket.io`). If the teacher dashboard
updates but the fight board freezes, nginx is not upgrading WebSockets — the
`Upgrade` / `Connection` headers must be on the `/gradeforge/` location.

## Updates after `git pull`

Classroom JSON in `server/data/` is gitignored. A pull does **not** wipe
teams or grades. `server/data/audio/` **is** versioned; new clips arrive
with the pull.

```bash
cd /opt/gradeforge
git pull
bash scripts/post-pull.sh
sudo systemctl restart gradeforge
```

## Backups

Copy `server/data/classrooms/` and `server/data/teams/` somewhere else
before a big test day. That is the whole save game.

```bash
sudo tar -czf ~/gradeforge-data-$(date +%F).tgz -C /opt/gradeforge/server/data classrooms teams
```

## Environment reference

| Variable | Production value | Notes |
|----------|------------------|--------|
| `NODE_ENV` | `production` | Set by the systemd unit |
| `HOST` | `127.0.0.1` | nginx is the only public listener |
| `PORT` | `3001` | Must match `upstream` in nginx |
| `TEACHER_PIN` | (required) | Sent as `X-Teacher-Pin`, not in the URL |
| `BASE_PATH` | `/gradeforge` | Must match the Vite production base. systemd sets this |
| `DATA_DIR` | unset | Classroom/team JSON. Defaults to `server/data` when cwd is `server/` |
| `AUDIO_DIR` | unset | Combat MP3s. Defaults to the checked-in `server/data/audio/` |
| `CLIENT_DIST` | unset | Auto-finds `client/dist` after `npm run build` |
| `ALLOW_DEFAULT_TEACHER_PIN` | unset | Dev-only escape hatch |
| `VITE_BASE` | `/gradeforge/` | Baked in by `npm run build`. Override only if you change the URL |

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| `systemctl` exits immediately, log says “Refusing to start” | `TEACHER_PIN` still `teacher` |
| `{"ok":true}` on :3001 but browser shows nginx 502 | unit not running, or `HOST`/`PORT` mismatch |
| UI loads, join fails, console 404 on `/api/...` | opened `/` instead of `/gradeforge/`, or `BASE_PATH` does not match the build |
| Join works, combat never advances | `/gradeforge/socket.io` not upgraded (missing `Upgrade` / `Connection` headers) |
| UI is a blank page after pull | forgot `npm run build`, or `client/dist` was built without `/gradeforge/` |
| JS 404s at `/gradeforge/assets/...` | nginx `proxy_pass` has a trailing `/` and is stripping the prefix |
| Teacher PIN works in the form but GET tools 401 | PIN must be the `X-Teacher-Pin` header, not `?pin=` |
| Portraits missing, SFX silent | `WorkingDirectory` is not `server/` so audio/data resolve wrong |
| `/gradeforge/` 404s from nginx | locations were put in a new server block instead of the existing :80 site |

Logs:

```bash
journalctl -u gradeforge -f
sudo tail -f /var/log/nginx/error.log
```
