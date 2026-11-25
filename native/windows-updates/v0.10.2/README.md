# Steel Front UE5 v0.10.2 — gameplay and visual update

This is the exact eight-file source delta for the separately distributed UE 5.8 project v0.10.1 **with the material-pin and deployment/input repairs already applied**. The branch's older native project is not that baseline; do not apply the delta to it. The standalone complete v0.10.2 archive includes the delta and prior fixes. Large vehicle and map binaries are not uploaded in this commit.

## Changes

- Capture zone, contested status, team tickets/score and match result.
- HUD ammo slots, objective marker, team score, hit/penetration/damage/repair notices.
- AI objective movement, obstacle recovery and repair logic.
- Exposure, ambient fill, shadow and rendering quality adjustments.
- Smaller, shorter-lived impact smoke with proximity fade.

The gzip manifest contains the actual source changes, with SHA-256 hashes for every input and output file. For readability, decompress with Python's gzip module. The source changes are applied to the correct baseline using Python 3.10+:

    python apply_v0102.py "D:\path\to\v0.10.1" --check
    python apply_v0102.py "D:\path\to\v0.10.1"

The applicator validates all inputs and reconstructed outputs before writing, backs up changed files, and rolls back on write failure. No asset files are changed. The original branch remains untouched.

## Verification status

The independent match-rule tests passed. The exact source delta was applied to a clean matching baseline; all eight resulting files matched the integrated package. The hash-checked applicator was tested for check, apply, and subsequent no-op check. Full archive ZIP CRC and offline asset/material checks passed (47 vehicles; 742 wheel assemblies; three imported maps). Unreal Engine 5.8.4 compilation and interactive gameplay/rendering still require Windows validation. This is not a claim of full web-version visual parity.
