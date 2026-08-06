# Academic Honors badge assets

Supply transparent, precomposed PNGs at a consistent 1024×1024 canvas size.
The client selects the image only by track and rank; it does not stack layers.

```text
campaign/base.png, 1.png … 6.png
preservation/base.png, 1.png … 6.png
tempo/base.png, 1.png … 6.png
```

`base.png` is the unranked badge. Rank mappings are locked in
`packages/shared/src/scoring.ts` and documented in `docs/SCORING_SYSTEM_PLAN.md`.

Missing files use a CSS fallback, so art can be added without blocking runtime.
