# Credits & Licenses — Steel Front (tank-war) v5

## Code
- All game code (src/) — written for this project.
- **three.js r170** — MIT License, © 2010-2024 three.js authors. https://github.com/mrdoob/three.js
  (bundled in dist/assets/*.js; includes three/examples Sky shader, BufferGeometryUtils, RGBELoader, EffectComposer/UnrealBloom/SMAA/Output passes — MIT)
- **n8ao** (N8AO ambient occlusion pass) — ISC License. https://github.com/N8python/n8ao
- Build tooling: Vite (MIT), Playwright (Apache-2.0) for QA only — not shipped.

## Textures & HDRI — Poly Haven (CC0 1.0, public domain) — https://polyhaven.com/license
All files in public/tex/ (copied to dist/tex/) come from Poly Haven. PBR sets: diffuse (`_diff`), normal (`_nor`) and
packed AO/roughness/metal (`_arm`), downloaded at 1K (terrain layers also at 2K, `_2k`), recompressed to JPEG (q82).
HDRIs are the original Radiance `.hdr` files at 1K and 2K.

### PBR textures
| File prefix | Used for | Poly Haven asset |
|---|---|---|
| leafy_grass | terrain grass layer | https://polyhaven.com/a/leafy_grass |
| forest_ground_04 | terrain forest floor / soil layer | https://polyhaven.com/a/forest_ground_04 |
| aerial_rocks_02 | terrain rock / slopes, boulders | https://polyhaven.com/a/aerial_rocks_02 |
| dry_ground_01 | desert terrain | https://polyhaven.com/a/dry_ground_01 |
| coast_sand_01 | desert sand layer | https://polyhaven.com/a/coast_sand_01 |
| gravel_road | roads, garage floor | https://polyhaven.com/a/gravel_road |
| brushed_concrete | concrete terrain layer / paved roads | https://polyhaven.com/a/brushed_concrete |
| plastered_stone_wall | stone buildings | https://polyhaven.com/a/plastered_stone_wall |
| clay_plaster | plastered / desert buildings | https://polyhaven.com/a/clay_plaster |
| clay_roof_tiles_02 | roofs | https://polyhaven.com/a/clay_roof_tiles_02 |
| red_brick_03 | brick buildings | https://polyhaven.com/a/red_brick_03 |
| damaged_plaster | ruined buildings | https://polyhaven.com/a/damaged_plaster |
| rusty_metal_02 | metal roofs / sheds | https://polyhaven.com/a/rusty_metal_02 |
| brown_planks_05 | wooden barns, bridges, planks | https://polyhaven.com/a/brown_planks_05 |
| bark_brown_02 | tree trunks | https://polyhaven.com/a/bark_brown_02 |

### HDRIs (sky + image-based lighting)
| File | Used for | Poly Haven asset |
|---|---|---|
| kloofendal_48d_partly_cloudy_puresky_{1k,2k}.hdr | Normandy (village) sky | https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky |
| kloofendal_overcast_puresky_{1k,2k}.hdr | Carpathian (forest) sky | https://polyhaven.com/a/kloofendal_overcast_puresky |
| kloofendal_43d_clear_puresky_{1k,2k}.hdr | Al-Qasr (desert) sky | https://polyhaven.com/a/kloofendal_43d_clear_puresky |
| studio_1k.hdr | garage lighting | https://polyhaven.com/a/studio_small_08 |

## Procedural assets (made for this project, no third-party license)
- All 15 tank models (geometry built in code from published dimensions), camouflage, track links, wheels, decal textures.
- Grass cards and building details (frames, sills, gutters + downpipes, window boxes, roof scuppers, damage) — procedural.
- Yard props (crates, ammo boxes, barrels, split-rail fences), roads, concrete hard-standing, mud, shoreline foam — procedural, reusing the Poly Haven textures listed above (no new third-party assets).
- Foliage cards (leaves, needles, palm fronds), water normals, window textures — drawn on canvas at runtime.
- Terrain, maps, buildings, vegetation placement — procedural.
- All sound effects — synthesized at runtime with WebAudio.

## Reference data
Tank figures (armour thickness/angles, mass, power, speed, shell penetration/velocity) are approximations compiled
from public historical/technical references (e.g. Wikipedia, Tank Encyclopedia, manufacturer data). Modern composite
armour values are RHA-equivalent estimates, not official figures.
