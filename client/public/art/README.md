# Combat art

Put portraits under this folder. Vite serves `client/public/` at the site root.

```
client/public/art/{key}/{pose}.png
```

Served as: `/art/{key}/{pose}.png`

## Poses (file names)

| Pose | File | When used |
|------|------|-----------|
| Idle | `standing.png` | Default |
| **Wind-up** | **`windup.png`** | **Boss telegraph only** — charge pose with telegraph SFX (not the strike) |
| Acting | `attack.png` | Party casts, boss **impact** after wind-up |
| Taking damage | `hit.png` | Getting hit |
| **Frozen** | **`ice.png`** | **Party only** — while `Frozen` (Barrow Warden SpreadingFrost). Sticky until an **A** on a frozen hero cracks all ice (or boss shatter). |
| Fallen | `death.png` | Dead |

**Boss art set (recommended):** `standing` + **`windup`** + `attack` + `hit`.  
`windup` is boss-facing; party units ignore it. Missing `windup.png` shows the SVG placeholder until you drop the file — do **not** reuse `attack.png` as wind-up or the charge will look like the hit already landed.

**Party art set (recommended):** `standing` + `attack` + `hit` + **`ice`** + `death`.  
`ice.png` is the frozen lock pose (encased / stiff). Client also keeps a cyan frost aura while Frozen so the status reads if art is missing.

If a pose file is missing, the client falls back to the SVG placeholder for that pose.  
**Minimum for a test:** only `standing.png` is enough for idle; other poses still show placeholders until you add them.

## Keys (folder names)

**Party archetypes** (all soldiers of that class share the same art):

| Folder | Archetype |
|--------|-----------|
| `vanguard` | Vanguard |
| `shieldmaiden` | ShieldMaiden |
| `firemage` | FireMage |
| `healer` | Healer |
| `archer` | Archer |
| `spearman` | Spearman |
| `necromancer` | Necromancer |
| `thundercaller` | Thundercaller |
| `runesinger` | Runesinger |

**Bosses:**

| Folder | Boss |
|--------|------|
| `moss_grub` | Moss Grub (room 1 worm) |
| `ash_wraith` | Ash Wraith |
| `cinder_herald` | Cinder Herald (room 3 add lesson) |
| `rattle_captain` | Rattle Captain (room 4 electric magnet tax) |
| `ohm` | Ohm (Rattle Captain weak electric add) |
| `bone_colossus` | Bone Colossus |

**Minions:**

| Folder | Unit |
|--------|------|
| `moss_mite` | Moss Mite (Grub adds) |
| `cinder_imp` | Cinder Imp (Herald adds) |
| `bone_archer` | Frost Archer (id stays `bone_archer`) |

## Example (test one character)

Vanguard only:

```
client/public/art/vanguard/standing.png
client/public/art/vanguard/attack.png   # optional
client/public/art/vanguard/hit.png      # optional
client/public/art/vanguard/death.png    # optional
```

## Suggested image sizes

| Role | Aspect | Example | Composition |
|------|--------|---------|-------------|
| **Party / minion** | **5:6** tall | 768×922 | Standing character; face in upper half |
| **Boss** | **5:6** tall bust *or* **4:3** bust | 832×1248 or 1024×768 | **Head + shoulders + upper chest** filling the frame; face large. Avoid tiny full-body figures |

Boss UI uses a **taller 5:6 frame** and `object-contain` so the whole bust shows. Party still uses short cards + `object-cover` (top-weighted).

After dropping files, hard-refresh the browser (Ctrl+Shift+R) if the image was 404’d earlier (browser may cache the miss briefly).
