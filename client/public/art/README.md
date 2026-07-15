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
| Acting | `attack.png` | Token actions, boss attacks |
| Taking damage | `hit.png` | Getting hit |
| Fallen | `death.png` | Dead |

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
| `doomcaller` | Doomcaller |
| `necromancer` | Necromancer |
| `thundercaller` | Thundercaller |
| `runesinger` | Runesinger |

**Bosses:**

| Folder | Boss |
|--------|------|
| `ash_wraith` | Ash Wraith |
| `bone_colossus` | Bone Colossus |

**Minions:**

| Folder | Unit |
|--------|------|
| `bone_archer` | Bone Archer |

## Example (test one character)

Vanguard only:

```
client/public/art/vanguard/standing.png
client/public/art/vanguard/attack.png   # optional
client/public/art/vanguard/hit.png      # optional
client/public/art/vanguard/death.png    # optional
```

Suggested image size: **5:6** portrait, e.g. **768×922**, cutout / transparent background preferred.

After dropping files, hard-refresh the browser (Ctrl+Shift+R) if the image was 404’d earlier (browser may cache the miss briefly).
