# Steel Front — 3D Tank War (v1)
Browser 3D tank battle (Three.js). 5 tanks (Sherman M4A3E8, Tiger I, T-34-85, T-72B, M1A2), 3 real-scale maps
(1.2 × 1.2 km playable, 1.4 km terrain), 7v7 team battle vs NPCs with base capture, bush concealment.
- Dev: `npm install && npm run dev` · Build: `npm run build` (output in dist/) · Preview: `npm run preview`
- Play the build: serve dist/ with any static server (see dist/README.txt). URL params: `?autostart=1&map=village|forest|desert&tank=sherman|tiger|t34|t72|m1a2&q=low|high`
- QA tools: tools_qa.mjs (every map × tank, console errors), tools_sim.mjs (AI soak), tools_shots_*.mjs (screenshots).
See CREDITS.md for licenses.
