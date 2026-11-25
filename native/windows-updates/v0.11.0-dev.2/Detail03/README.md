# Detail03 — v0.11.0-dev.2 playtest

Baseline: RenderFix02. This GitHub directory contains a partial source snapshot of the recovered-track runtime, not the complete build. The downloadable full ZIP/overlay contains the integrated HUD, garage, terrain shaders, map detail generator and generated data. Full ZIP SHA-256: 0217da10c4d98e1a030c674d89c4493d3748d7a3946ff48c8cbd2eb2f75866d2.

Offline checks passed: 45 recovered tracked vehicle sidecars, 83,903 components, 3,682,356 assigned triangles; seven detail mesh files, 198,154 environment placements; all 97 original assets preserved; 53 mock materials and 47 instances. Real UE5.8 build, render and FPS are unverified. The recovery is heuristic, not an authored physical track rig. Existing terrain/building geometry is retained; added foliage is decorative and approximate.

Start the complete package with Garage-Windows.cmd in a new directory.
