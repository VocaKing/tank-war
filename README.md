# Steel Front — 3D Tank War (v4)
Browser 3D tank battle (Three.js r170 + Vite). 27 vehicles in 4 tiers, 3 real-scale maps
(1.2 × 1.2 km playable, 1.4 km terrain), 7v7 team battle vs NPCs with base capture, bush concealment, tier matchmaking
(mirrored lineups), graphics presets High/Medium/Low.
- Dev: `npm install && npm run dev` · Build: `npm run build` (output in dist/) · Preview: `npm run preview`
- Play the build: serve dist/ with any static server (see dist/README.txt).
  URL params: `?autostart=1&map=village|forest|desert&tank=<id>&q=low|medium|high`
- `?fixedGunTest=1` applies fixed-gun aiming to the player's selected vehicle for that match.
  Vehicle specs opt into this mechanism with `fixedGun: true`. Release WASD or the touch joystick to aim with the hull.
  Tank ids: sherman t34 tiger panther is2 pershing centurion t72 leo1 m1a2 chally2 leo2a6 merkava4 type99a t90m
- Armour Expansion vehicle IDs are `jagdpanther`, `su100`, `isu122`, `jagdtiger`, `amxfoch`, `atlas`, `basilisk`, and `pzh2000`.
  The five tank destroyers use hull aim. The howitzer uses direct fire. The garage and battle load the detailed assets from `public/models/armour-expansion/` when needed.
- Vehicle physics: Rapier 3D steps the rigid bodies at 120 Hz. Suspension contacts supply track traction and steering. Vehicle inertia, terrain, buildings, rocks, bridges, and hull collisions use the same simulation. Regression checks: `node tools_ground_physics.mjs`.
- Release WASD or the touch joystick to brake automatically. Ground braking builds over a short interval and scales with vehicle mass, with a cap for super-heavy vehicles. The current speed, slope and track contact determine how far the vehicle travels before stopping.
- Aiming: Shift / right click = sniper; wheel = zoom ×2/4/8/16; X = armor-penetration view (sniper only, default on);
  E = lock gun on the target under the crosshair. Reticle = predicted ballistic impact; circle = current dispersion.
- QA tools: tools_qa.mjs (every map × tank, armor view, matchmaking, console errors), tools_ballistic.mjs (reticle vs impact
  at 100/300/500 m), tools_sim.mjs (AI soak), tools_models.mjs (triangle counts), tools_shots_*.mjs (screenshots).
Release pipeline: every deployment checks muzzle geometry, the balance-editor layout for the full roster, and representative gameplay on all three maps using the same /tank-war/ base path as GitHub Pages before publishing to GitHub Pages.
See CREDITS.md for licenses.

## v4 changes
- **Gun dispersion.** Each tank has editable minimum and maximum cone radii, measured in metres at 100 m. The radius grows linearly toward the maximum while speed is nonzero and shrinks toward the minimum at rest. Aim time controls the full transition. The Abrams stabilizer doubles the time to reach maximum while moving. Players and NPCs use the same rules.
- **Reticle.** The dot marks the predicted impact, and the ring shows the current dispersion limit at the selected optical magnification. All random deviations are inside the aiming disk, with probability density per unit area decreasing exponentially with distance from the centre.
- **Tanks.** Weathering (rain streaks, paint chipping), plus tail-light clusters, rubber mud flaps, fender brackets, track tensioners, tow shackles, a tow pintle and a rear infantry phone on modern tanks.
- **Maps.** Building colour variation for walls, shutters/doors and roofs. Four boulder shapes with bedding strata and tint variety. Per-instance tree and bush tint. Field patchwork on the terrain.

## Balance editor
Open `?balance=1` on the same game origin. Modify tank values, save, then reload the game. The local profile applies to both player and NPC tanks. Export `balanceDefaults.json` to back up or publish; to change defaults for all players, replace `src/game/balanceDefaults.json` in the repository and rebuild/deploy. Existing local profiles can be reset to the published defaults. No tokens or server access are required for local editing. Run `node tools_balance.mjs` to check data initialization and refresh behavior.

## Mobile touch mode
Mobile browsers automatically use touch controls and a responsive garage. Use landscape for battle, left joystick to drive, drag the battlefield to aim, and hold Fire to shoot. Scope, zoom, armor, lock, special ability, ammo, equipment, scoreboard and pause are available as touch actions. Force mobile mode via `?mobile=1`. The garage includes fullscreen 3D inspection and the balance editor. Low graphics is the initial mobile preset. Desktop settings remain available.
