# Specialist vehicle model brief — bespoke modelling pending

This brief covers the ten new playable vehicles added to the specialist roster. **Their combat systems are implemented; their current in-game meshes are temporary base-model stand-ins. Do not treat those stand-ins as the final vehicle models.** The bespoke, reference-matched models are intentionally deferred.

## Modelling standard

- Build each vehicle from its own reference photographs and technical drawings; do not reskin an existing tank.
- Preserve the correct chassis type, suspension/running gear, turret or casemate architecture, gun mounting, crew layout cues, and distinctive external equipment.
- Use real-world dimensions where published. Do not invent classified armour thicknesses, internal layouts, or hidden fittings; use clearly labelled gameplay approximations where necessary.
- Make signature systems visibly legible: T-14 ERA/APS modules, Strv 103 fixed gun, FV4005 open gun mount and recoil spade, Ontos six recoilless rifles, Centauro II 8×8 wheels, Sprut waterjets/hydropneumatic suspension, Archer protected cab and rear artillery module, BMPT twin autocannons/ATGM pods, 2S38 57 mm remote turret/sensors, and XM8 removable armour kits.

## Vehicle-by-vehicle reference brief

### 1. T-14 Armata — `t14`
- Visual identity: long seven-road-wheel tracked hull, low unmanned angular turret, forward crew capsule layout, large modular side protection, and turret-mounted sensor/APS details.
- Signature geometry: keep the turret visibly unmanned and compact relative to a conventional crewed MBT turret. Model ERA as distinct replaceable modules, not a smooth painted texture.
- Do not assert exact armour thickness or APS performance; public detailed figures are not independently verifiable.
- Reference: https://www.nationshield.ae/index.php/home/details/techniques/t-14-armata%3A-armed-with-protective-design/en

### 2. Stridsvagn 103C — `strv103`
- Visual identity: no turret; very low wedge-shaped hull with the 105 mm gun fixed to the hull.
- Signature geometry: gun elevation is achieved by pitching the vehicle on its hydropneumatic suspension; traverse is achieved by turning the whole hull. Preserve the low silhouette and do not add a conventional turret.
- Reference: https://www.arsenalen.se/vehiclecollection/stridsvagn-strv-103c/

### 3. FV4005 Stage I — `fv4005s1`
- Visual identity: Centurion Mk.3-derived tracked hull with an experimental open gun mounting and an enormous 183 mm L4A1 gun.
- Signature geometry: exposed breech/recoil assembly, front gun travel crutch, and rear recoil spade. The Stage I mount is open; do not substitute the much more enclosed Stage II splinter-proof turret.
- The Tank Museum notes that the gun mount could traverse 360 degrees but safe firing was restricted to a forward arc because of recoil.
- Reference: https://tankmuseum.org/the-fv4005

### 4. M50 Ontos — `m50ontos`
- Visual identity: very small, lightly armoured tracked chassis with six M40 106 mm recoilless rifles on external mounts; open crew compartment.
- Signature geometry: six separate barrels in paired triple groups, conspicuous external mounts, and a compact low hull. The weapons could be fired individually, in pairs, or all together.
- Reference: https://www.army.mil/article/220951

### 5. Centauro II — `centauro2`
- Visual identity: purpose-built 8×8 wheeled armoured vehicle with angular hull and HITFACT MkII turret carrying a 120 mm L/45 gun.
- Signature geometry: eight large road wheels, prominent wheel arches, high ground clearance, and a modern digital turret. Do not model tracks.
- Reference: https://www.idvgroup.com/products/land-armoured-vehicles/centauro-ii/

### 6. 2S25 Sprut-SD — `sprutsd`
- Visual identity: lightweight BMD-family tracked chassis with a compact turret and 125 mm 2A75 gun.
- Signature geometry: hydropneumatic adjustable ride height, amphibious waterjets at the rear, and a low lightweight hull. Avoid giving it the proportions or heavy armour of a T-72.
- Reference: https://www.trumpeter-china.com/index.php?a=show&g=home&id=3786&l=en&m=product
- Additional technical reference: https://cgsc.contentdm.oclc.org/digital/api/collection/p4013coll11/id/2089/download

### 7. Archer FH77BW L52 — `archer`
- Canonical modelling choice: Swedish 6×6 Volvo articulated-hauler configuration.
- Visual identity: protected crew cabin at the front, large rear-mounted 155 mm L/52 gun module, automated ammunition handling, and rear stabilising supports. It is a wheeled artillery carrier, not a conventional turreted tank.
- Signature geometry: articulated 6×6 chassis, enclosed cabin, exposed rear gun platform, and rapid deploy/retract supports.
- Reference: https://www.baesystems.com/en-ca/product/archer

### 8. BMPT Terminator — `bmpt`
- Visual identity: T-72-family tracked chassis with a low remote weapon station, twin 30 mm 2A42 autocannons, and four Ataka-T missile launchers.
- Signature geometry: twin parallel cannon barrels and missile launch tubes must be individually modelled; do not reduce the vehicle to a single-gun MBT turret.
- Reference: https://odin.t2com.army.mil/WEG/Asset/9f1db2b58ba9e52eb202ed082e26720c

### 9. 2S38 Derivatsiya-PVO — `2s38`
- Visual identity: BMP-3-family tracked chassis with an unmanned turret and 57 mm automatic cannon.
- Signature geometry: long 57 mm barrel, remote turret, passive electro-optical sensor suite and 360-degree observation/tracking equipment.
- Its programmable ammunition uses a preset detonation time; do not model it as a guided projectile.
- Reference: https://odin.t2com.army.mil/WEG/Asset/2ea59c4af80de5a7044ab9172d73eb15

### 10. XM8 Armored Gun System — `xm8ags`
- Visual identity: compact light tracked vehicle with a 105 mm XM35 low-recoil gun and automatic loader.
- Signature geometry: lightweight hull, low-profile turret, and three removable armour-package configurations. The armour kits should visibly change the exterior silhouette and protection fit.
- Reference: https://calhoun.nps.edu/server/api/core/bitstreams/49213c43-bddc-4e0c-9fc3-b0ea4d8b0124/content

## Gameplay-to-model correspondence

- T-14: modular ERA blocks and APS launchers must be visible; APS charge count is a gameplay system.
- Strv 103C: the gun must be fixed to the hull; the whole vehicle turns to aim.
- FV4005 Stage I: open gun mount and rear recoil spade must be visible.
- M50 Ontos: all six recoilless rifles must be visible and separately aligned with the three firing modes.
- Centauro II: eight wheels, not tracks; road/off-road handling is already implemented.
- Sprut-SD: rear waterjets and adjustable suspension stance must be visible.
- Archer: no conventional turret; protected front cabin and rear automated gun module must be visible.
- BMPT: two 30 mm barrels and missile pods must be distinct.
- 2S38: remote turret, 57 mm gun and passive sensor array must be distinct.
- XM8: the three armour packages must visibly alter the external add-on armour.

