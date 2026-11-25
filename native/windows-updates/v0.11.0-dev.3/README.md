# Parity04 playtest: v0.11.0-dev.3

This folder contains the core native driving-model header, standalone regression and the original-web reference map placement/road files. It is not the complete build or full integration source. The complete playable archive and 28-file update were supplied separately in the conversation.

Original web source revision: 00fe26fad97af5653892a407c01594e2f3c40fc5.
Reference data commit: 40f28b3eef361b6ffb9908f4e7f0a9169439bb01.

- Canvas font rendering restored after blank UI in Detail03.
- Driving rules adapted from web physics.js in SI units; native swept transforms and ground support remain instead of Rapier rigid-body contact physics.
- Six volumetric foliage meshes generated for the local archive. Not original web geometry.
- ReferenceMaps files contain 13,878 web-generated plant and rock positions in the playable bounds and exact 2m road sample grids. Launcher attempts a one-time hash-checked download with offline fallback; grass and 4m ground geometry remain approximations.
- Offline: 9 driving scenarios, 55 material mock builds and 47 material instances, 97 original geometry hashes, new foliage formats, recovered tracks. UE5.8.4 compilation, real rendering, Windows sync, interactive feel and performance remain untested.

Full ZIP SHA256: f4ba33219d1eaf96a9a03e127ed82ed19389f263c67327e67ea07fa9080f8509
Update ZIP SHA256: 05ad3db6723737a7f6fc0313aa09e14a7ea362b2cc666cd55386ae6af9ead750
