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

## Base capture rules
- Each living attacking tank earns its own capture credit only while continuously inside the enemy base and no defender is present. A lone tank needs 240 seconds (4 minutes); two need 120 seconds, three 80 seconds, and seven about 34.3 seconds if all enter together and remain uninterrupted.
- Leaving the circle, being hit (including ricochets and non-penetrations), taking damage or being destroyed immediately erases only that tank's contribution. Re-entering or recovering from a hit starts from zero; teammates retain their valid credit.
- Defenders in the circle pause accrual, but do not erase the credit of attackers who stay inside. Capture succeeds when the sum of current attackers' valid contributions reaches 100%. The HUD displays this sum, including any loss of credit.
- Run `node tools_capture.mjs` for capture regression tests.

## Motion smoothness
The battle renderer now uses bounded simulation substeps, translation-locked chase camera, non-accumulating AO, shadow updates once per displayed frame, hysteresis for tank/vegetation LOD, and staged grass uploads. Adaptive rendering resolution reduces GPU load when frames are consistently slow without modifying tank speed or game rules. Use `?adaptive=0` to lock the selected preset's initial resolution for comparisons. The high preset retains bloom, AO and spatial anti-aliasing.

## Instant aim assist
With aim assist enabled, a direct crosshair hit on a spotted enemy immediately locks the camera and shows the red outline in the same frame. Third-person view smoothly magnifies 1.4×; manual sniper magnification is unchanged. The mouse is damped to 18–35% sensitivity while locked, with independent directional pull pressure that is not erased when refining a weak spot. A fast flick (82 input pixels within 100 ms) or sustained pull (190 decaying pressure units) releases the target, restores normal sensitivity, and returns to the original third-person field of view. The same target cannot re-lock until the crosshair has left it and a 0.30 s cooldown has elapsed. E gun lock remains independent. Run `node tools_aim_assist.mjs` for regression coverage.

## Capture visibility update
All three maps use a 25 m base radius (50 m diameter), reduced from 45 m radius. The 240 tank-second requirement and independent contribution resets remain unchanged. The ring follows terrain height, the minimap marks both objectives A/B, and the HUD shows capture status, attacker count, progress to 0.1%, and estimated uninterrupted capture time. Players inside the enemy circle see their personal contribution and whether defenders are blocking accrual. NPCs no longer repeatedly choose new capture destinations while already inside.
