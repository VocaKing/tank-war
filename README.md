# Steel Front — 3D Tank War (v4)
Browser 3D tank battle (Three.js r170 + Vite). 15 tanks in 4 tiers (WWII mediums → modern MBTs), 3 real-scale maps
(1.2 × 1.2 km playable, 1.4 km terrain), 7v7 team battle vs NPCs with base capture, bush concealment, tier matchmaking
(mirrored lineups), graphics presets High/Medium/Low.
- Dev: `npm install && npm run dev` · Build: `npm run build` (output in dist/) · Preview: `npm run preview`
- Play the build: serve dist/ with any static server (see dist/README.txt).
  URL params: `?autostart=1&map=village|forest|desert&tank=<id>&q=low|medium|high`
  Tank ids: sherman t34 tiger panther is2 pershing centurion t72 leo1 m1a2 chally2 leo2a6 merkava4 type99a t90m
- Aiming: Shift / right click = sniper; wheel = zoom ×2/4/8/16; X = armor-penetration view (sniper only, default on);
  E = lock gun on the target under the crosshair. Reticle = predicted ballistic impact; circle = current dispersion.
- QA tools: tools_qa.mjs (every map × tank, armor view, matchmaking, console errors), tools_ballistic.mjs (reticle vs impact
  at 100/300/500 m), tools_sim.mjs (AI soak), tools_models.mjs (triangle counts), tools_shots_*.mjs (screenshots).
See CREDITS.md for licenses.

## v4 changes
- **Gun dispersion.** Each gun has a base accuracy (dispersion-circle radius at 100 m when fully aimed): WWII 0.40–0.48 m, Cold War 0.32–0.36 m, modern stabilised 0.20–0.25 m. Aim time is 1.5–2.5 s.
- **Aim bloom.** Hull speed, hull rotation and turret traverse widen the circle; stabilisers damp the effect; firing adds bloom. The circle shrinks back exponentially while the tank holds still. Each shell deviates by a clamped 2D gaussian (centre-weighted, never outside the circle). NPCs use the same system.
- **Reticle.** The dispersion circle is projected at the real impact distance in both third-person and sniper view. Fixed a bug where the reticle disappeared while reloading.
- **Tanks.** Weathering (rain streaks, paint chipping), plus tail-light clusters, rubber mud flaps, fender brackets, track tensioners, tow shackles, a tow pintle and a rear infantry phone on modern tanks.
- **Maps.** Building colour variation for walls, shutters/doors and roofs. Four boulder shapes with bedding strata and tint variety. Per-instance tree and bush tint. Field patchwork on the terrain.

## Balance editor
Open `?balance=1` on the same game origin. Modify tank values, save, then reload the game. The local profile applies to both player and NPC tanks. Export `balanceDefaults.json` to back up or publish; to change defaults for all players, replace `src/game/balanceDefaults.json` in the repository and rebuild/deploy. Existing local profiles can be reset to the published defaults. No tokens or server access are required for local editing. Run `node tools_balance.mjs` to check data initialization and refresh behavior.

## Mobile touch mode
Mobile browsers automatically use touch controls and a responsive garage. Use landscape for battle, left joystick to drive, drag the battlefield to aim, and hold Fire to shoot. Scope, zoom, armor, lock, special ability, ammo, equipment, scoreboard and pause are available as touch actions. Force mobile mode via `?mobile=1`. The garage includes fullscreen 3D inspection and the balance editor. Low graphics is the initial mobile preset. Desktop settings remain available.
