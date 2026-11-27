# Steel Front — 3D Tank War (v4)
Browser 3D tank battle (Three.js r170 + Vite). 47 vehicles in 4 tiers, 3 real-scale maps
(1.2 × 1.2 km playable, 1.4 km terrain), 7v7 team battle vs NPCs with base capture, bush concealment, tier matchmaking
(independent lineups, matching tier composition, diversity-first), graphics presets High/Medium/Low.
- Dev: `npm install && npm run dev` · Build: `npm run build` (output in dist/) · Preview: `npm run preview`
- Play the build: serve dist/ with any static server (see dist/README.txt).
  URL params: `?autostart=1&map=village|forest|desert&tank=<id>&q=low|medium|high`
- `?fixedGunTest=1` applies fixed-gun aiming to the player's selected vehicle for that match.
  Vehicles with a `casemate` use hull aiming. Release WASD or the touch joystick to aim with the hull.
  Tank ids: sherman t34 tiger panther is2 pershing centurion t72 leo1 m1a2 chally2 leo2a6 merkava4 type99a t90m
- Armour Expansion vehicle IDs are `jagdpanther`, `su100`, `isu122`, `jagdtiger`, `amxfoch`, `atlas`, `basilisk`, and `pzh2000`.
  The five tank destroyers use hull aim. The howitzer uses direct fire. The garage and battle load the detailed assets from `public/models/armour-expansion/` when needed.
- Vehicle physics: Rapier 3D steps the rigid bodies at 120 Hz. Suspension contacts supply track traction and steering. Vehicle inertia, terrain, buildings, rocks, bridges, and hull collisions use the same simulation. Regression checks: `node tools_ground_physics.mjs`.
- Release WASD or the touch joystick to brake automatically. Ground braking builds over a short interval and scales with vehicle mass, with a cap for super-heavy vehicles. The current speed, slope and track contact determine how far the vehicle travels before stopping.
- Aiming: Shift / right click opens the scope at ×2, or ×4 with a target locked. The wheel selects a manual zoom for that scope session. X toggles the armor-penetration view.
  E locks the selected point with lead. Aim freely across the locked vehicle and move the crosshair onto another enemy to switch. The reticle marks predicted impact and the circle shows current dispersion.
- QA tools: tools_qa.mjs (every map × tank, armor view, matchmaking, console errors), tools_ballistic.mjs (reticle vs impact
  at 100/300/500 m), tools_sim.mjs (AI soak), tools_models.mjs (triangle counts), tools_shots_*.mjs (screenshots).
Release pipeline: every deployment checks muzzle geometry, the balance-editor layout for the full roster, and representative gameplay on all three maps serving the built files under the same /tank-war/ base path as GitHub Pages; the temporary QA path mapping is removed before publishing.
See CREDITS.md for licenses.

## v4 changes
- **Gun dispersion.** Each tank has editable minimum and maximum cone radii, measured in metres at 100 m. The radius grows linearly toward the maximum while speed is nonzero and shrinks toward the minimum at rest. Aim time controls the full transition. The Abrams stabilizer doubles the time to reach maximum while moving. Players and NPCs use the same rules.
- **Reticle.** The dot marks the predicted impact, and the ring shows the current dispersion limit at the selected optical magnification. All random deviations are inside the aiming disk, with probability density per unit area decreasing exponentially with distance from the centre.
- **Tanks.** Weathering (rain streaks, paint chipping), plus tail-light clusters, rubber mud flaps, fender brackets, track tensioners, tow shackles, a tow pintle and a rear infantry phone on modern tanks.
- **Maps.** Building colour variation for walls, shutters/doors and roofs. Four boulder shapes with bedding strata and tint variety. Per-instance tree and bush tint. Field patchwork on the terrain.

## Balance editor
Open the balance editor from the garage. Saved changes update the garage preview and apply to player and NPC tanks in the next battle. Export `balanceDefaults.json` to back up or publish custom settings. To change defaults for all players, replace `src/game/balanceDefaults.json` in the repository and rebuild and deploy. Existing local profiles can be reset to the published defaults. Run `node tools_balance.mjs` to check data initialization and refresh behavior.

## Mobile touch mode
Mobile browsers automatically use touch controls and a responsive garage. Use landscape for battle, left joystick to drive, drag the battlefield to aim, and hold Fire to shoot. Scope, zoom, armor, lock, special ability, ammo, equipment, scoreboard and pause are available as touch actions. Force mobile mode via `?mobile=1`. The garage includes fullscreen 3D inspection and the balance editor. Low graphics is the initial mobile preset. Desktop settings remain available.

## Central control point C
C has a 25 m radius on all three maps. Solo capture takes 240 seconds (previously 150); original diminishing returns apply to additional tanks. Each vehicle keeps independent credit only while inside: leaving, death, damage or a direct shell hit resets that vehicle's entire contribution. Opposing occupants pause capture. A team wins at 100% total valid contribution. The C HUD displays personal contribution and estimated time. The two home bases retain their original rules.

## Role-specific vehicle skills
34 vehicle-specific additions plus independent Ontos tube loading. G activates a new skill on vehicles without a legacy active ability; K activates it when G is already occupied. V switches Ontos single/pair/six modes; B/H retain existing brace/suspension controls. All seven stationary skill profiles belong to casemate TDs. Light tanks retain mobile reconnaissance, heavy tanks defensive/advance skills, MBTs fire-control and motion effects. Skills use match time, appear in garage and HUD, and configurable numeric parameters are available in the balance editor. Existing assets and systems are retained. NPC casemate TDs start in sniper roles. The skill tests are part of the deployment gate.

### Stock dispersion rebalance
All 47 vehicles now have explicit minimum/maximum dispersion radii (m at 100 m): stock minima 0.20–0.95, maxima 1.10–1.87. Tank destroyers use the lower 0.20–0.49 / 1.10–1.37 ranges. These are defaults, not new validation bounds; legacy and custom balance profiles remain supported. Existing skill multipliers and aiming dynamics are unchanged.

## Tier matchmaking and future progression
Four game-balance tiers contain 7/11/8/21 vehicles. Each 7v7 side has at least five vehicles at the player's tier and at most two from one adjacent tier. No same-team repeats with the current roster. Cross-team repeats are permitted only if the eligible tier slots exceed the number of distinct vehicles. Teams have identical tier counts and approximate class/game-stat parity, not mirrored rosters. The match records a transient result with vehicle ID, tier, result, duration, survival and combat stats; no progression lock, points or persistent profile is enabled yet.

### Procedural vehicle gun audio
47 independently authored timbre presets, deterministic noise seeds and two sample variations per voice. Caliber controls pitch and gain, while guided/secondary/tube firing paths use their own variants. WebAudio caches samples, adds distance delay, distance filtering, stereo panning, bounded voices and master compression. These are artistic gameplay approximations, not real recordings. Burst, multi-tube and MRSI fire emit individual audio events.

### Distributed and randomized spawning
Each side starts in two or three map-specific spawn clusters (4+3 or 3+2+2), with nominal center separations around 300–700 m. Side ownership is randomly exchanged per match, including base colors, minimap, capture ownership and AI lane direction. Spawn placement searches dry, traversable, connected ground with slope, obstacle and hull-clearance checks; no blocked-cell fallback. Friendly spawn areas are indicated on the minimap but are not capture points.
