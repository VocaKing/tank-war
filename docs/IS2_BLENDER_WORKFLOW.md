# IS-2 Model 1944 — Blender asset workflow

## Goal
Replace the hand-built Three.js IS-2 geometry with a historically grounded, Level-2 game asset authored in Blender and exported as GLB. Three.js remains responsible for runtime behavior, animation, collision, armor and damage.

## Variant lock
Model the **IS-2 Model 1944 late-war production configuration**, not the early stepped-glacis 1943 vehicle and not the post-war IS-2M modernization. Keep one coherent vehicle configuration throughout the asset.

## Reference hierarchy
1. Museum object catalogue: [Museum of the Defense of Sevastopol — IS-2](https://idemvmuzei.ru/en/catalog/museum/muzej-oborony-sevastopola/collection/1247528). The entry describes the welded hull/cast nose, cast turret and mantlet apertures, six twin 550 mm road wheels per side, rear drive sprockets with two removable 14-tooth rims, 86 single-ridge links per track and four rear fuel tanks.
2. Preserved vehicle photo record: [Muzeum Broni Pancernej, Poznań — IS-2 Model 1944](https://preservedtanks.com/Profile.aspx?UniqueID=430). The record identifies a surviving Model 1944 vehicle without post-war modifications and includes front-left and front-right photographs.
3. Variant overview: [Preserved Tanks — IS-2 variants](https://preservedtanks.com/Types.aspx?TypeCategoryId=2800). Use this to distinguish the sloped-glacis 1944 model from the earlier stepped-glacis vehicle.
4. Dimensions and armor cross-check: [WarDrawings IS-2 data](https://www.wardrawings.be/WW2/Files/1-Vehicles/Allies/2-USSR/04-HeavyTanks/IosefStalin/Data/IS-2.htm) and [Russian Ministry of Culture museum catalogue](https://ar.culture.ru/en/subject/tyazhelyy-tank-is-2).
5. Secondary geometry cross-check: [AFV profile pack](https://ciar.org/ttk/mbt/afv_weapons_profile_pack/afv_weapons_profile_17__russian_kv_and_is.pdf). Treat this as a secondary source, not the sole authority.

## Working dimensions
Use meters, with the vehicle centerline at X=0, ground at Z=0 and bow toward +Y in the Blender source. The current game uses +Z as forward; the export adapter must document and convert axes consistently.

| Feature | Working value | Notes |
|---|---:|---|
| Hull length | 6.77 m | Excludes gun |
| Overall length, gun forward | about 9.83 m | Configuration-dependent |
| Width | about 3.07–3.10 m | Excludes/depends on track envelope |
| Height | about 2.73 m | To turret roof |
| Combat mass | about 46 t | Historical reference; gameplay mass is separate |
| Upper glacis | 120 mm at 60° from vertical | Model 1944 sloped nose |
| Road wheels | 6 twin stations per side, 550 mm diameter | Cast wheels |
| Return rollers | 3 per side | Verify exact placement from photos |
| Tracks | 86 single-ridge links per side, 650 mm wide | Track pitch is not assumed from link count alone |
| Drive sprocket | Rear, two removable 14-tooth rims | Verify tooth/rim profile in close-ups |
| Auxiliary tanks | 4 rear hull tanks, two per side | Exact mounting and silhouette from photos |

Some published sources differ slightly on width, height, overall length and armor conventions. Keep the dimension table editable and record source/measurement confidence rather than forcing all sources into one false precision.

## Cross-check against the current game specification

The current main-branch IS-2 data in `src/game/tankData.js` and geometry in
`src/models/tanksV2.js` provide an additional consistency check for the Blender source:
hull length 6.77 m, overall width 3.07 m, hull height 1.60 m, track width 0.65 m,
turret envelope approximately 2.65 × 2.80 × 0.87 m, and main-gun length approximately
4.97 m. These are project implementation dimensions, not a substitute for museum
measurements; any discrepancy should be recorded and resolved against the preserved
Model 1944 reference vehicle.

## Level-2 modeling standard
- Correct silhouette and proportions from front, side, rear and top orthographic references.
- Separate named objects for hull, turret, mantlet, gun, muzzle brake, cupola, hatches, optics, machine guns, wheels, sprockets, idlers, return rollers, track runs, fuel drums, exhausts and tow fittings.
- Real cast-turret curvature and broad rounded D-25T mantlet; do not approximate the turret with a single beveled cube.
- Real road-wheel dish/rim/hub profile and track-link silhouette. Use instancing/linked mesh data for repeated parts.
- PBR materials: painted steel, cast steel, bare steel, rubber, dark optics and glass. Weathering should be restrained and removable.
- No internal engine/crew detail in this pass; spend polygons where visible in gameplay.

## Delivery gates
1. **Reference lock:** collect front/side/rear/top and detail views for one identified Model 1944 survivor; note any post-war fittings and exclude them.
2. **Blockout:** check silhouette and dimensions in orthographic views. No decorative detail before approval.
3. **High-value geometry:** turret cast form, nose, mantlet/gun, suspension, track runs and rear fuel drums.
4. **Equipment/materials:** hatches, periscopes, DShK, DT positions, lights, exhausts, tow eyes and PBR.
5. **GLB contract:** named mesh hierarchy, correct origins/pivots, meters, +Z forward in game after conversion, applied transforms, packed textures, no external dependencies.
6. **Integration:** preserve Three.js turret/gun animation, track movement, suspension, hitboxes and armor regions. Add asset fallback to existing procedural IS-2 until GLB passes.
7. **Acceptance:** front/side/rear/top and 3/4 comparisons, visual review, file size and draw-call budget, runtime regression tests.

## What the user needs to do
Nothing in Blender. The selected involvement is minimal. Review only the supplied comparison sheet and flag clear historical mismatches. Research and reference selection are handled by the project workflow.

## Current implementation status
The first Blender build has now run successfully in a headless Blender 4.0.2 GitHub Actions runner. It exports:
- `public/models/is2_model1944_blockout.glb` for eventual Three.js integration.
- `artifacts/is2-model1944/is2_model1944_first_pass.blend` as the editable Blender source.
- Five review renders: front three-quarter, left side, front, rear and top.

The generated GLB is committed back to this feature branch by the build workflow; the editable .blend and review renders remain available as the Actions artifact. The model is still a first Level-2 asset pass, not yet accepted for production or switched into the live game. The existing Three.js model remains the game fallback until the Blender asset passes visual, hierarchy, scale and runtime integration checks.

## Windows 11 local build (RTX 5060 Ti)

This is the **manual, user-controlled** route. It does **not** expose the user's PC as a public GitHub Actions runner, open any ports, or grant ChatGPT unattended access.

1. Install Blender on Windows from https://www.blender.org/download/ (4.5 LTS is the conservative compatibility choice; the pipeline is CI-tested with 4.0.2, not yet tested on every newer version).
2. Open https://github.com/VocaKing/tank-war/tree/blender/is2-model1944-level2 , use **Code → Download ZIP**, then extract it.
3. Double-click `tools/blender/build-is2-windows.cmd`.
4. The launcher finds Blender under `C:\Program Files\Blender Foundation\`, generates the GLB/.blend and a single 720×540 front three-quarter preview.
5. For all five high-resolution renders, open Command Prompt in the `tools/blender` folder and run `build-is2-windows.cmd -Full`.
6. Outputs remain in the extracted folder:
   - `public/models/is2_model1944_blockout.glb`
   - `artifacts/is2-model1944/is2_model1944_first_pass.blend`
   - `artifacts/is2-model1944/*.png`

If Blender lives in a nonstandard folder, specify an environment variable `BLENDER_EXE` pointing to `blender.exe` before starting the launcher. The script makes no automated uploads. To let the modeler review the local render, explicitly upload the preview here or attach it to GitHub. For safety, **do not register a personal Windows PC as a self-hosted runner on this public repository**.

### GPU and performance

The preview uses EEVEE on a local computer, which normally uses GPU graphics acceleration. OptiX is a separate Cycles rendering backend; this project does not automatically enable or require Cycles/OptiX. Initial builds also perform geometry generation and scene export on CPU.

The first GPU build should be timed before claiming a particular speedup.
