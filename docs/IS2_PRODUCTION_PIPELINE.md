# IS-2 Model 1944 — production asset pipeline

This branch adds a real Blender production pipeline on top of the existing dimensioned IS-2 source model. It does not change the live Three.js model, game balance, physics, or deployment.

## Build outputs

- \`public/models/is2_model1944_production_candidate.glb\`
- \`artifacts/is2-model1944/production/is2_model1944_production_candidate.blend\`
- \`artifacts/is2-model1944/production/pbr/basecolor.png\`
- \`artifacts/is2-model1944/production/pbr/normal.png\`
- \`artifacts/is2-model1944/production/pbr/roughness.png\`
- \`artifacts/is2-model1944/production/pbr/metallic.png\`
- \`artifacts/is2-model1944/production/pbr/ao.png\`
- five production review renders and an asset manifest

## Implemented stages

1. Rebuild the existing dimensioned Model 1944 source scene (skip the redundant blockout preview render; render the production candidate once).
2. Preserve the source meshes as editable high-poly bake sources.
3. Add restrained high-poly-only weld-bead detail and a detailed track-link bake source.
4. Create separate low-poly copies with reduced bevel segmentation.
5. Pack a single UV atlas across the vehicle's independently animated assemblies.
6. Rasterize Base Color, Roughness and Metallic atlases directly from UV triangles and original material IDs; attempt a high-poly-to-low-poly tangent Normal bake with a procedural micro-normal fallback, plus an AO bake with a neutral-white fallback.
7. Apply one packed PBR atlas material to the game meshes.
8. Split the atlas target back into independently animated hull, turret, mantlet, recoil barrel, road-wheel stations, return rollers, drive sprockets, idlers and track links.
9. Export and validate a GLB with 86 individually named track-link nodes per side.

## Current fidelity ceiling

The current automated high-poly source is a bake source, not a hand-sculpted high-poly tank:
it preserves the dimensioned source meshes at their higher bevel segmentation, adds
high-poly-only weld beads, and uses a five-part detailed track-link template. The low-poly
copy reduces bevel segmentation and is packed into the game atlas. This is a useful
repeatable production foundation, but it is not yet a sculpted turret casting, a complete
artist retopology, or a multi-LOD asset. Those remain explicit future stages; no WoT-level
visual-quality claim is made.

## Runtime node contract

- \`IS2_Model1944_Root\`
- \`Hull_Body\`
- \`Turret_Root\` — yaw
- \`Gun_Elevation_Pivot\` — elevation
- \`Gun_Recoil_Pivot\` — barrel recoil
- \`Muzzle\` — projectile spawn / barrel-forward anchor, parented to recoil
- \`Gun_Sight\` — aiming reference, parented to elevation
- \`Track_L_Root\` / \`Track_R_Root\`
- \`RoadWheel_L_01_Pivot\` … \`RoadWheel_R_06_Pivot\`
- \`TrackLink_L_000\` … \`TrackLink_L_085\`
- \`TrackLink_R_000\` … \`TrackLink_R_085\`

The 172 track-link nodes share only two link mesh datablocks (left/right mirrored guide horns), so the runtime can consolidate them into two \`THREE.InstancedMesh\` batches while retaining editable transforms in the authoring GLB.

## Texture generation and axis contract

- Base Color, Roughness and Metallic are rasterized from the packed UV triangles and
  original source-material IDs. This avoids the Blender background bake defect observed
  in CI, where the bake operator returned success but wrote zero-valued pixels.
- Tangent Normal attempts a selected-to-active high-poly projection. If Blender returns
  an empty image, the build creates a restrained UV-masked procedural micro-normal map;
  the manifest records which source was used.
- AO is attempted separately. If it is empty or effectively uniform black, a neutral
  white AO multiplier is retained as a fallback. AO is not connected to the GLB material
  in this iteration.
- Blender authoring uses +Y forward and +Z up. The glTF exporter writes Y-up with -Z
  forward. The current game model convention is +Z forward, so a runtime adapter needs a
  180-degree yaw correction and must swap the left/right track-root mapping. No adapter
  is wired into the live game yet.

## Validation boundary

A successful build proves that Blender generated and exported the candidate, that the UV/PBR atlas assets contain non-empty pixel data, and that the GLB contains the required rig and track-link nodes. It does **not** prove that the model has passed historical silhouette review, has been integrated into the live Three.js game, or has WoT-equivalent visual quality. Those remain separate visual and runtime acceptance gates.

## Historical references carried forward

- Poznań Museum of Armoured Weapons, preserved IS-2 Model 1944: https://preservedtanks.com/Profile.aspx?UniqueID=430
- IS-2 variant overview: https://preservedtanks.com/Types.aspx?TypeCategoryId=2800
- IS-2 museum catalogue and dimensional cross-check: https://ar.culture.ru/en/subject/tyazhelyy-tank-is-2

No generated model replaces the existing game asset until the user reviews and approves it.
