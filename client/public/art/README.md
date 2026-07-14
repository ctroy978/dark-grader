# Combat art (real assets later)

Place portrait frames here when ready:

```
art/{key}/{pose}.png
```

| Pose | File |
|------|------|
| Idle | `standing.png` |
| Acting | `attack.png` |
| Taking damage | `hit.png` |
| Fallen | `death.png` |

**Keys (examples):**

- Archetypes: `vanguard`, `shieldmaiden`, `firemage`, `healer`, `archer`, `doomcaller`, `necromancer`, `thundercaller`, `runesinger`
- Bosses: `bone_colossus`, `ash_wraith`
- Minions: `bone_archer`

Until files exist, the client renders **SVG placeholders** (`PlaceholderPortrait`).  
`CombatActor` already uses a single pose state machine — swapping art is a drop-in `img` later.
