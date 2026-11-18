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

## Focus outline & aim assist (v6)
- **Red outline**: the spotted enemy under the crosshair (or within 14 px of it) gets a red silhouette outline (`src/render/outline.js`: single-tank mask + screen-space dilation, drawn after the frame on every graphics setting, on top of the High post chain). Unspotted / concealed tanks are never candidates. The outline is only drawn *outside* the silhouette, so the armour view (X) stays fully visible.
- **Soft lock**: hold focus on an enemy for ~0.2 s after moving the mouse and the camera tracks it, keeping the crosshair on the exact spot you chose (anchor stored in turret- or hull-local space). Small mouse moves on the tank pick a new spot.
- **Drag**: mouse input is scaled to ~42 % near the anchor, rising smoothly to 100 % at 110 px; past that (or a fast flick) the lock breaks. Same target can't re-lock for 1.2 s unless you leave it and re-aim. HUD shows `◆ LOCK · <tank>`.
- **E gun lock** still lays the gun on the target centre with lead; while it is active the soft lock is suspended. Pressing E while soft-locked gun-locks that target.
- Toggle: menu checkbox “Aim assist” or the pause menu (saved in `localStorage.tw_aa`; `?aa=0` URL param). Tunables: `AIM_ASSIST` in `src/game/aimAssist.js`, `OUTLINE` in `src/render/outline.js`. QA: `node tools_aim.mjs http://localhost:4177/`.
