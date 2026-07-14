# Content packs

## Bosses (`bosses/*.toml`)

Each file defines one boss for the classroom campaign.

| Field | Purpose |
|--------|---------|
| `id` | Stable id (used by teacher campaign path) |
| `name`, `max_hp`, `traits` | Display + combat stats |
| `difficulty`, `summary`, `recommended_rounds` | Teacher dashboard |
| `enrage_hp_pct`, `enrage_damage_mult` | Optional enrage |
| `grunt_pool`, `laugh_pool`, `telegraph_sfx` | ElevenLabs SFX clip ids |
| `[[audio]]` | Clip definitions (merged into the audio catalog for generation) |
| `[[attacks]]` | Attack ids (must exist in code), weights, bubbles, sfx |

**TOML order:** put scalar fields and `*_pool` **before** any `[[audio]]` / `[[attacks]]` tables, or TOML will attach those keys to the last table row.

**Attack mechanics** (damage tables, summons, dots) live in `server/src/engine/bosses.ts` under an attack-id registry.  
**New boss from existing moves:** add a TOML that only lists those attack ids + new audio/lines.  
**New attack type:** implement once in the registry, then reference it from any TOML.

Regenerate audio after adding `[[audio]]` entries:

```bash
npm run audio:generate
```

Presentation: short comic bubbles + SFX; occasional party VO (`vo_claim_*`, `vo_act_*`, `vo_hurt_*`). Boss grunts/laughs/attacks are SFX from each boss file.
