# Fictional Concept Fleet — implementation and Blender asset pipeline

## Scope (2026-11-24)

User-selected **Option A**: add the following TEN fictional original vehicles without removing,
renaming, rebasing, or replacing the existing specialist roster (T-14, Strv 103, FV4005 S1,
M50 Ontos, Centauro II, Sprut-SD, Archer, BMPT, 2S38, XM8 AGS) or historical tanks.

| New playable ID | Class | Active signature |
| --- | --- | --- |
| `aegis140` | Heavy MBT | rear turret, one recharging hard-kill APS interceptor, expendable hull/turret ERA |
| `bastion125` | Defensive MBT | depleted turret-cheek ERA, rear HEAT slats, vented bustle ammunition |
| `harrier105` | Assault light tank | open gun shield, fast traverse/reload, increased HE and suppression vulnerability |
| `warden130` | Heavy casemate TD | fixed gun, frontal ERA, 2-second stationary siege dispersion benefit |
| `lancer120` | Medium sniper TD | long gun, side ERA, prepared first-shot dispersion benefit with recovery |
| `leviathan160` | Breakthrough assault gun | short 160 mm gun, dozer traction bonus on adverse grades, wide HE splash |
| `thunderclad155` | Heavy tracked SPG | large rear stabilizer, high arc, very long reload, HE area damage |
| `tempest155` | Mobile tracked SPG | quick deploy, faster reposition, two differently timed MRSI shells |
| `cerberus135` | Heavy MBT | unmanned turret, crew protection, ERA side skirts, damaged electronics reduce fire control |
| `raptor90` | Light recon fire support | open weapon station, exceptionally long view range, low survivability |

All nominal armour, rates, hit points and dimensions are **fictional gameplay tuning**.
These are not replica models of real equipment.

## Source files

- `src/game/conceptVehicles.js` — ten configurations and editable gameplay data.
- `src/game/tankData.js` — appends concepts before normal stock balancing and roster indexing.
- `src/game/conceptSystems.js` — timed state, MRSI trajectories, APS regen, siege and first-shot, dozer.
- `src/models/conceptERA.js` — shared tile coordinates for live hit evaluation and per-tile visual depletion.
- `src/models/conceptModels.js` — distinct, native Three.js playable silhouettes (not base-tank reskins).
- `src/game/tank.js`, `src/game/ballistics.js`, `src/models/tankModel.js` — runtime plumbing.
- `tools_concept_fleet.mjs` — ten-vehicle browser smoke and specialist-roster preservation checks.
- `tools/blender/build_concept_fleet.py` — editable Blender asset generator.
- `.github/workflows/concept-fleet-ci.yml` — repeatable gameplay and Blender pipeline checks.

## Runtime mechanics

**ERA.** Tiles are keyed by vehicle, part, face, left/right side, row and column.
The armour preview is read-only. HEAT and designated kinetic rounds can spend a tile
when impact is resolved; exhausted tiles disappear from their InstancedMesh and stop
adding resistance. A hit on another part does not deplete nearby tiles.

**APS.** Uses existing projectile interception before ordinary hit resolution.
Aegis has a single charge, an 8-second cooldown and a 23-second recharge period.
Other vehicles' existing finite-charge APS logic is not altered.

**Open-top.** Retains the existing increased HE blast and crew casualty modifiers;
new suppression duration temporarily penalises aiming for open-top crews. The game
does not currently model individual machine-gun suppressive hits.

**Siege and first shot.** Static accuracy modifiers depend on motion history and
the last fired shot. Warden has stationary siege; Lancer has a prepared first-shot bonus.

**SPG and MRSI.** Thunderclad and Tempest use the established spade deployment and
ballistic system. MRSI launches two real projectiles separated by a timer, at different
velocities/angles calculated to land near simultaneously at a locked ground target.
This is deliberately a simplified GAMEPLAY solution; not a real charge-selecting
autoloader or full fire-control simulation. A two-round MRSI requires at least two rounds;
with only one remaining, a normal single shot remains available.

**Mobility.** Leviathan receives additional grade traction when a dozer blade is fitted;
the existing tracked/wheeled traction split remains enabled for the original vehicles.
It does not yet simulate physically deformable soil, realistic blade earthmoving or
independent suspension stress.

## Blender authoring

From repository root, with Blender 4.x:

```bash
blender --background --python tools/blender/build_concept_fleet.py -- --all
blender --background --python tools/blender/build_concept_fleet.py -- --vehicle aegis140 --preview
```

Each vehicle exports `artifacts/concept-fleet/<id>.glb` and
`artifacts/concept-fleet/<id>.blend`. With `--preview`, it also writes a PNG.

The files contain independent named meshes, a hull root, turret root, gun elevation
pivot, barrel recoil group, individual running-gear members and ERA blocks. Artillery
models additionally include rear spade pivots; open-top types omit a sealed turret roof.

**Important integration boundary:** Blender exports are an editable production
asset foundation and separate CI artifacts. The runtime currently uses the authored
Three.js fallback silhouettes. Blender GLBs are NOT automatically imported or swapped
into the live game until object hierarchy, -Y/+Z axis conversion, LOD and running-gear
animation, visual review, collision envelope and performance checks pass. No change
is pushed to the default branch or public deployment by this feature branch.

## Acceptance tests

1. `npm ci && npm run build`
2. `npm run dev -- --host 127.0.0.1` then `node tools_concept_fleet.mjs`
3. `node tools_vehicle_systems.mjs` and `node tools_spg.mjs` for regressions
4. `python3 -m py_compile tools/blender/build_concept_fleet.py`
5. Run the Blender batch generator; verify ten nonempty `.glb` and `.blend` outputs
6. Review renders and compare intended identifying details before promoting Blender assets

No quantitative game-balance or art-direction signoff is implied by passing smoke tests.
