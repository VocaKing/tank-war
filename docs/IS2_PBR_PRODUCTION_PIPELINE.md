# IS-2 Model 1944 — production asset pipeline (work in progress)

## Scope and safety
This is a separate production branch. Existing Three.js geometry, materials, hitboxes,
armor, animation and gameplay remain untouched. Do not switch the live IS-2 to the
new GLB until the visual and runtime acceptance gates below pass.

Variant locked: late-war IS-2 Model 1944 with sloped glacis; not the 1943 stepped nose
and not the post-war IS-2M.

## Implemented automation
1. Dimensioned Blender source and five-view preview: \`tools/blender/is2_model1944_blockout.py\`.
2. UV generation, tileable per-material Base Color/Roughness/Normal texture authoring, packed GLB export and textured preview renders:
   \`tools/blender/is2_pbr_bake_export.py\`.
3. Structural QA for named components, UVs and image-backed materials:
   \`tools/blender/validate_is2_asset.py\`.

Run:
\`\`\`sh
blender --background --python tools/blender/is2_model1944_blockout.py
blender --background artifacts/is2-model1944/is2_model1944_first_pass.blend --python tools/blender/is2_pbr_bake_export.py
blender --background --python tools/blender/validate_is2_asset.py -- public/models/is2_model1944_pbr.glb
\`\`\`

## Honest status / limitations
- Current geometry is a dimensioned procedural Level-2 foundation, not a sculpted
  multi-million-polygon high-poly asset.
- UVs are automatically unwrapped. They must be reviewed and seam-packed by an artist.
- The initial automated bake emitted empty transparent maps. That defect was found by
  inspecting the generated PNGs, and the pipeline was changed to author deterministic,
  tileable per-material Base Color, Roughness and tangent Normal textures instead.
- These maps are image-backed and embedded in the GLB, but they are procedural material
  textures, NOT high-poly sculpt bakes. There is no AO map in this iteration.
- The validator now samples embedded image pixels and fails on empty/transparent maps;
  image-node presence alone is no longer accepted as proof of valid textures.
- The next production stage is dedicated high-poly sculpting of the turret casting,
  mantlet, weld seams, cast roadwheel faces, track shoes and fittings, followed by
  retopology and high-to-low tangent normal bake. Do not claim that stage complete
  until the sculpt source and bake maps exist and pass inspection.
- Metallic values remain material constants and the authored Roughness maps are subtle
  variations around the source material values. They still require visual calibration.

## Visual and runtime acceptance gates
1. Front/side/rear/top orthographic comparison against the museum survivor photos and
   dimension references in \`docs/IS2_BLENDER_WORKFLOW.md\`.
2. Inspect 100% crops for turret silhouette, glacis slope, mantlet, roadwheel dish,
   sprocket tooth profile, link/grouser proportions and rear fuel tanks.
3. Validate UV stretch, seams, texel density and map packing.
4. Validate physically plausible paint/cast steel/rubber/bare steel/optics roughness.
5. Inspect the five PBR re-renders and image maps, then import GLB in the existing Three.js runtime on a feature branch only; confirm
   turret yaw, gun elevation/recoil, wheel and track transforms, muzzle origin,
   collision/armor alignment and performance.
6. Compare screenshots in the actual game lighting. Keep procedural fallback.
7. User visual approval before any live asset replacement or merge.

## References
See \`docs/IS2_BLENDER_WORKFLOW.md\` for the museum catalogue, preserved vehicle
photographs and dimensional cross-checks. Record any uncertainty rather than
inventing precision.
