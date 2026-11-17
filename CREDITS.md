# Credits & Licenses — Steel Front (tank-war) v1

## Code
- All game code (src/) — written for this project.
- **three.js r170** — MIT License, © 2010-2024 three.js authors. https://github.com/mrdoob/three.js
  (bundled in dist/assets/*.js; includes three/examples Sky shader, BufferGeometryUtils, RGBELoader — MIT)
- Build tooling: Vite (MIT), Playwright (Apache-2.0) for QA only — not shipped.

## Textures & HDRI — Poly Haven (CC0 1.0, public domain) — https://polyhaven.com/license
Downloaded at 1K, recompressed to JPEG (q82). Files in public/tex/ (copied to dist/tex/):
| File prefix | Poly Haven asset |
|---|---|
| leafy_grass | https://polyhaven.com/a/leafy_grass |
| forest_ground_04 | https://polyhaven.com/a/forest_ground_04 |
| aerial_rocks_02 | https://polyhaven.com/a/aerial_rocks_02 |
| dry_ground_01 | https://polyhaven.com/a/dry_ground_01 |
| coast_sand_01 | https://polyhaven.com/a/coast_sand_01 |
| gravel_road | https://polyhaven.com/a/gravel_road |
| plastered_stone_wall | https://polyhaven.com/a/plastered_stone_wall |
| clay_plaster | https://polyhaven.com/a/clay_plaster |
| clay_roof_tiles_02 | https://polyhaven.com/a/clay_roof_tiles_02 |
| bark_brown_02 | https://polyhaven.com/a/bark_brown_02 |
| red_brick_03 | https://polyhaven.com/a/red_brick_03 |
| damaged_plaster | https://polyhaven.com/a/damaged_plaster |
| rusty_metal_02 | https://polyhaven.com/a/rusty_metal_02 |
| studio_1k.hdr | https://polyhaven.com/a/studio_small_08 (garage lighting) |

## Procedural assets (made for this project, no third-party license)
- All 5 tank models (geometry built in code from published dimensions), camouflage, track, decal textures.
- Foliage cards (leaves, needles, palm fronds), water normals, window textures — drawn on canvas at runtime.
- Terrain, maps, buildings, vegetation placement — procedural.
- All sound effects — synthesized at runtime with WebAudio.

## Reference data
Tank figures (armour thickness/angles, mass, power, speed, shell penetration/velocity) are approximations compiled
from public historical/technical references (e.g. Wikipedia, Tank Encyclopedia, manufacturer data). Modern composite
armour values are RHA-equivalent estimates, not official figures.
