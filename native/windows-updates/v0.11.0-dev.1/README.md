# Steel Front v0.11.0-dev.1 — playtest checkpoint

Base: the separately distributed SteelFront-UE58-v0.10.2-Full.zip. This is a development checkpoint, not a verified full UE release. The complete local playtest archive and source update ZIP are delivered separately in the development conversation. This repository directory contains only a subset of the updated source (suspension math and its standalone test) plus the playtest manifest, not the full update. Do not mistake the older native/windows directory for this build.

## Package identity
- SteelFront-UE58-v0.11.0-dev.1-Playtest.zip: 188673186 bytes; SHA-256 94ff83325b3a516e2c95a9f2398de630725e4c305b1e52604bb8f116f6c2a80f; 293 files
- SteelFront-v0.11.0-dev.1-SourceUpdate.zip: 87546 bytes; SHA-256 dfcd74e1310559749d93a9b6e83ca2d1a073e0a1d7f54a8a9c227f338143885c; 33 files

260 baseline files unchanged; 32 changed/new files plus manifest. All 97 original asset hashes preserved. Original-art assets are not yet generated.

## Playtest
Extract the complete archive to a fresh directory. Launch Garage-Windows.cmd for native menu and garage. Garage-Legacy.cmd is the old selector fallback. Chaos and static-mesh baking have separate experimental launchers. Original-art export requires Git, Node/npm, Python and network access, and is not validated end to end. Only enable original-art mode after a successful export.

Offline checks: eight format/material tests, twelve suspension assertions, battle rules, mock regeneration of 52 materials and 47 instances, and 97 baseline asset hashes. UE 5.8.4 compilation, shader compilation, rendering, actual gameplay and performance have not been validated. This does not claim web-version parity. The web version and previous releases remain unchanged.

Run the standalone C++ math test in this directory with a C++17 compiler:
```
g++ -std=c++17 Tests/SuspensionMathTest.cpp -o suspension-test
./suspension-test
```
