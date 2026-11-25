# RenderFix02 — v0.11.0-dev.1 playtest

Source delta for the separately distributed **CompileFix01 full project**, not the older native/windows project or incomplete source subset in this branch. The manifest contains the exact 13 changed/new text files, reconstructed and checked against their output SHA-256 hashes before packaging. The uploaded gzip blob is byte-identical to the local manifest.

- Runtime WebFleet geometry: convert source winding to Unreal clockwise, correct water normals, retain collision and require an explicit experimental flag for baked fleet assets.
- Rendering: one atmosphere sun, manual exposure, separate showroom point fills, small albedo-proportional emissive floor for legacy materials, neutral garage floor, 100% screen percentage.
- Garage: fit rotating vehicle and barrel to visible HUD area based on measured mesh bounds; refit on resize.
- Material builders and launcher agree on new versioned regeneration markers.

## Apply
The separately distributed overlay ZIP is simplest. To reconstruct the same 13 files from this directory using Python 3.10+:
```
python apply_renderfix02.py "D:\path\to\CompileFix01" --check
python apply_renderfix02.py "D:\path\to\CompileFix01"
```

## Package identity
- Overlay: SteelFront-v0.11.0-dev.1-RenderFix02.zip (67127 bytes), SHA-256 477adeaea09f02671089b7077180001fdd0c523064fa75d236a1f473a48403c9
- Full: SteelFront-UE58-v0.11.0-dev.1-RenderFix02-Full.zip (188678463 bytes), SHA-256 2df6bd9bc8110627c779cb50cf7af86ea11369d5b9e68470bd1bcdb65bc4c5de
- Both ZIP CRC checks passed. 283 existing files unchanged; all 97 geometry assets retained.

## Validation
540,000 source terrain triangles audited; 47 vehicle bounds, 235 camera-fit calculations; offline material mock (52 materials, 47 instances); all 97 geometry hashes; battle rules and 12 suspension assertions passed. UE 5.8.4 compilation, GPU rendering, real shader compilation and interactive performance have not been run. This is a targeted test build, not a claim of web-version visual parity. Original-art migration remains experimental. No binary game assets are published in this commit.
