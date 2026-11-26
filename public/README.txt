STEEL FRONT — 3D Tank War v4 (browser game)

Browsers block WebGL games opened straight from a file, so serve this folder:
  Windows: double-click play-windows.bat   (needs Python 3)
  macOS/Linux: run ./play-mac-linux.sh      (needs Python 3)
  Or any static server: npx serve .   then open the printed URL.
Or upload this folder to any static host (Netlify Drop, GitHub Pages, Cloudflare Pages...).

Controls: W/S throttle, A/D steer, mouse aim, left click fire, right click/Shift sniper mode,
wheel zoom x2/x4/x8/x16, X armor-penetration view (sniper only: green = will penetrate,
yellow = may, red = can't; semi-transparent overlay), E lock gun on target, 1/2/3 ammo type,
4/5/6 equipment slots (R = repair kit slot, F = extinguisher slot), Tab scoreboard, Esc pause.
Before battle: menu -> "Ammo & equipment" to split the fixed ammo capacity between the 3 shell
types and pick 3 items (repair kit, medkit, extinguisher, reload booster, overdrive, smoke,
camo net, coated optics). Item weight lowers top speed and acceleration.
Concealment: bushes / standing still / camo net raise CAMO %; enemies spot you at
viewRange x (1 - camo), but always within ~50 m. Firing reveals you for 5 s.
Water slows shells: tanks hull-down in water are harder (not impossible) to penetrate.
Use a desktop browser with a dedicated GPU for best results; pick "Medium" or "Low" graphics on weaker machines.

Base capture: a single attacker needs 240 seconds (4 minutes); multiple attackers add independent credit.
Leaving the base, being hit (even without penetration), taking damage or being destroyed erases only that tank's credit.
Defenders pause accrual; capture succeeds when valid credit from attackers still inside totals 100%.

Aim assist: red outline means instant camera lock; automatic 1.4x third-person zoom.
Small mouse movements are damped; flick or pull firmly to release. Manual scope zoom and E gun lock remain independent.
