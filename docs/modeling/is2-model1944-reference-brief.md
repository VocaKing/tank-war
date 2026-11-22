# IS-2 Model 1944 — Blender Reference Brief

Status: research baseline for the first Blender asset. This is a modeling brief, not a claim that every IS-2 produced in 1944 had identical fittings.

## Identity and scope

Build the **ChKZ-produced late-1944 IS-2 configuration** commonly called the *IS-2 Model 1944*. Do not accidentally mix it with:
- the earlier 1943 hull with the stepped front;
- the post-war IS-2M modernization;
- a 1945 production vehicle with every late-war fitting unless the chosen reference vehicle actually shows them.

The label “Model 1944” is retained for player familiarity. Historical writing notes that this was not the official Soviet production designation. The important visual distinction is the later, sloped, step-free nose and the wider revised gun mantlet introduced during 1944.

## Confirmed modeling dimensions

Use metres in Blender; 1 Blender unit = 1 metre.

| Measurement | Target | Notes |
|---|---:|---|
| Overall length, gun forward | 9.83 m | Includes the main gun |
| Hull length | 6.77 m | Hull only |
| Overall width | 3.07 m | Vehicle envelope |
| Overall height | 2.735 m | Configuration-dependent roof fittings |
| Combat mass | 46.08 t | Reference specification |
| Ground clearance | 0.44–0.465 m | Published range |
| Main armament | 122 mm D-25T | Revised gun/mantlet configuration |
| Crew | 4 | Commander, gunner, loader, driver |

These are reference dimensions, not permission to stretch the model to make the silhouette look right. Keep overall length, hull length, width and height as separate validation measurements.

## Running gear

The Sevastopol museum catalogue describes:
- six pairs of cast road wheels per side, each wheel 550 mm in diameter;
- rear drive sprockets with two removable 14-tooth rims;
- 86 single-ridge steel track links per side, 650 mm wide;
- four auxiliary fuel tanks at the rear, two per side.

The historical production record notes that both stamped and cast track links occurred. The first baseline should use the single-ridge stamped-link arrangement described by the museum catalogue; keep the track-link geometry modular so a cast-link variant can be made later.

Return-roller count and exact station spacing must be checked against the selected photo set and technical drawings before being treated as hard reference values.

## Hull and turret

- Use the late-1944 step-free sloped front, not the earlier stepped glacis.
- Treat the nose as a cast front assembly; do not model the whole hull as one featureless cast lump. The sides, rear, roof and floor use different construction.
- The turret is an asymmetric cast shape. A specialist profile describes the left wall as close to vertical and the right wall as sloping inward by about 20 degrees. Use this as a starting measurement and verify the silhouette against the surviving-vehicle photographs.
- The revised 1944 mantlet is wider and has separate visual openings for the main gun, coaxial machine gun and telescopic sight.
- Keep the commander’s cupola, loader’s hatch, ventilator, periscopes, handrails and roof fittings as separate objects.
- The driver’s front vision arrangement must match the selected late-1944 hull reference; do not invent a large driver hatch on the glacis.

## Production-date-dependent equipment

**DShK anti-aircraft machine gun:** do not treat it as universal on every 1944-model vehicle. The production history says the first 25 IS-2s received the new mount in November 1944, 125 in December, and new vehicles received it as standard from January 1945. The baseline asset will expose this as a configurable variant; the default should match the chosen reference vehicle rather than silently adding it.

**Rear turret DT mount:** sources and surviving vehicles are not consistent enough to make this a universal feature. Omit it from the baseline until a dated, matching reference photograph or drawing confirms it for the chosen vehicle. The baseline must not inherit a generic early-IS turret detail by assumption.

**Markings and paint:** keep markings as a separate optional layer/material set. The neutral baseline is a restrained Soviet dark olive-green finish; winter whitewash, Berlin recognition bands/crosses, Polish markings and individual tactical numbers are separate skins, not baked into the geometry.

## Reference set and how to use it

1. **Museum of the Defense of Sevastopol — IS-2 catalogue entry**  
   https://idemvmuzei.ru/en/catalog/museum/muzej-oborony-sevastopola/collection/1247528  
   Best for the catalogue description of the cast/welded construction, 550 mm twin wheels, 14-tooth drive rims, 86 links and four rear fuel tanks.

2. **Preserved Tanks — Poznań vehicle, ID 430**  
   https://preservedtanks.com/Profile.aspx?UniqueID=430  
   A surviving Model 1944 identified by the register as being displayed without post-war modifications. The page records front-right and front-left photographs from March 2009. Use the actual photos for silhouette and fitting placement; do not copy the Polish markings into the neutral base skin.

3. **Preserved Tanks — Kubinka vehicle, ID 641**  
   https://www.preservedtanks.com/Profile.aspx?UniqueID=641  
   Additional surviving Model 1944 reference. Check its condition and any modifications before using it to establish production-standard details.

4. **Tank Archives — “Small Modernization of a Large Tank”**  
   https://www.tankarchives.com/2019/12/small-modernization-of-large-tank.html  
   Useful production chronology: 1944 nose/turret changes, the revised turret and mantlet, and the DShK installation schedule. The article distinguishes production changes rather than treating all vehicles as one frozen configuration.

5. **Tamiya 1/48 JS-2 Model 1944 ChKZ assembly guide (secondary visual aid)**  
   https://cdn.simba-dickie-group.de/downloads/300032571/300032571_JS-2_Model_1944_ChKZ.pdf  
   Useful for exploded assembly relationships, placement of smaller fittings and five-view marking diagrams. It is a scale-kit interpretation, so dimensions and disputed details must be cross-checked against museum/technical references.

6. **AFV Russian KV and IS profile pack (secondary geometry aid)**  
   https://ciar.org/ttk/mbt/afv_weapons_profile_pack/afv_weapons_profile_17__russian_kv_and_is.pdf  
   Useful for the asymmetric turret-wall description. Treat the approximate 20-degree right-wall slope as a measured modeling hypothesis until checked against photos.

7. **Tank Archives — “Struggle for the Assembly Line”**  
   https://www.tankarchives.com/2019/03/struggle-for-the-assembly-line.html  
   Additional production and early-turret context. Use it to avoid mixing early and late turret layouts.

## Modeling acceptance criteria

The first Blender review is not approved by “looks tank-like”. It must pass:

- correct late-1944 hull front silhouette, without the 1943 step;
- correct overall and hull dimensions;
- recognizable asymmetric cast turret and wide mantlet;
- six twin road-wheel stations per side, correct wheel diameter, rear 14-tooth drive rims and modular track links;
- four correctly mounted rear auxiliary tanks;
- roof fittings, hatches, sights, lights and tools placed from references;
- no unsupported rear turret MG or DShK fitted to the wrong production date;
- clean hierarchy and pivots for game animation;
- readable silhouette at gameplay distance and acceptable performance in Three.js.

## Open research items

Do not guess these during modeling:
- exact return-roller count and spacing for the chosen production batch;
- exact track-link profile and pitch for the chosen vehicle;
- exact mantlet cheek contour and sight-port positions;
- whether the chosen reference vehicle has a DShK mount;
- exact exhaust, tow cable, tool and spare-track arrangement on the chosen hull;
- any production-specific difference between ChKZ and other factory hull/turret components.

Record each decision in the model's metadata or this brief so the same uncertainty is not rediscovered later.
