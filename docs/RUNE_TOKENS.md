# GradeForge rune tokens

**Branch:** `feat/rune-tokens-and-fx`  
**Assets:** `client/public/art/tokens/grade_{A,B,C,D,F}.png`  
**Component:** `client/src/combat/GradeToken.tsx`

## Mapping

| Grade | Visual language | Notes |
|-------|-----------------|--------|
| **A** | Bright gold Ansuz-like rune, hottest aura | Top tier |
| **B** | Reference Viking B (user-provided style lock) | Style anchor |
| **C** | Kenaz-style angular C (`<` form), warm mid aura | Mid tier |
| **D** | Vertical stem + crooked triangular front (straight edges, not a modern curved D), copper-amber | Low tier |
| **F** | Fehu-like F, cracked iron, crimson aura | Danger tier |

Preview strip: `docs/token-rune-preview.png`

## Where they appear

1. **Combat drop strip** — pending tokens bob; fall animation on Drop  
2. **Magnet playbook chips** — mini tokens next to grade text  
3. **Party claim badge** — claimed token on the soldier (shared art + claim glow)  
4. **Teacher room pool** — comma list + rune strip for inspection  
5. **How to Play** — grade legend

## Classroom readability

Each token shows a **tiny letter badge** (A–F) on the corner so students can still read grades from a few feet away while the disc stays pure fantasy.

## Implementation notes

- Server still stores `Grade` letters; art is pure client presentation.  
- Runesinger rewrites swap to the **effective** grade token on the claim badge.  
- Future FX can extend `GradeToken` (`falling`, `claimed`, new sizes) without new art.
