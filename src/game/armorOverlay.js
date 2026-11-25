import * as THREE from 'three';
import { ARMOR_FACES, ARMOR_SURFACE, armorFaceGLSL, armorSurfaces } from './armorGeometry.js';
import { eraBounds, eraTileCount } from './eraMechanics.js';
import { MIN_INCIDENCE_COS } from './combatMath.js';
import { SHELL_TYPES, PEN_RNG, zoneLowerFrontY, zoneLowerSideY } from './tankData.js';

const FRAGMENT = /* glsl */`
uniform mat4 avInvHull, avInvTurret;
uniform mat3 avNormalHull, avNormalTurret;
uniform vec3 avMuzzle;
uniform vec3 avCasemateOrigin;
uniform vec4 avZones, avDims, avMods, avShell;
uniform vec2 avExtras, avShellFlags;
uniform float avArm[13], avFixed, avSpeed, avHullFloor;
uniform int avKind;
uniform bool avGarage;
#if ERA_GROUPS > 0
uniform vec4 avEraBounds[ERA_GROUPS], avEraMeta[ERA_GROUPS];
uniform vec3 avEraBonus[ERA_GROUPS];
uniform float avSpent[ERA_TILES];
#endif
varying vec3 vArmorWorld;
${armorFaceGLSL}

vec3 impactDirection(vec3 point, out float distanceM) {
  if (avGarage) {
    distanceM = 100.0;
    return -vec3(viewMatrix[0].z, viewMatrix[1].z, viewMatrix[2].z);
  }
  vec3 delta = point - avMuzzle;
  float d2 = dot(delta, delta);
  distanceM = sqrt(d2);
  float u = avSpeed * avSpeed - 9.81 * delta.y;
  float disc = u * u - 9.81 * 9.81 * d2;
  if (disc >= 0.0 && u > 0.0) delta.y -= 9.81 * d2 / max(1e-6, u + sqrt(disc));
  return normalize(delta);
}

float tileBonus(vec3 p, vec3 n, bool upper, int face, bool heat, bool he) {
  #if ERA_GROUPS > 0
  for (int i = 0; i < ERA_GROUPS; i++) {
    vec4 meta = avEraMeta[i];
    if ((meta.x > 0.5) != upper || int(meta.y) != face) continue;
    vec4 b = avEraBounds[i];
    float side = face == 1 ? 1.0 : 0.0;
    vec2 local = (vec2(mix(p.x, p.z, side), p.y) - b.xz) / (b.yw - b.xz);
    if (any(lessThan(local, vec2(0.0))) || any(greaterThanEqual(local, vec2(1.0)))) continue;
    vec2 tile = floor(local * meta.zw);
    float offset = face == 1 && n.x > 0.0 ? meta.z * meta.w : 0.0;
    vec3 bonus = avEraBonus[i];
    int j = int(bonus.z + offset + tile.y * meta.z + tile.x);
    return (1.0 - avSpent[j]) * (heat ? bonus.x : he ? 0.0 : bonus.y);
  }
  #endif
  return 0.0;
}

void main() {
  // The geometric triangle normal survives smooth shading and paint normal maps.
  vec3 normalW = normalize(cross(dFdx(vArmorWorld), dFdy(vArmorWorld)));
  if (!gl_FrontFacing) normalW = -normalW;
  vec3 point = (avInvHull * vec4(vArmorWorld, 1.0)).xyz;
  bool casemate = avKind == 0 && avFixed > 0.5 && point.y >= avDims.x;
  bool movingUpper = avKind == 1 || avKind == 2;
  bool upper = movingUpper || casemate;
  if (casemate) point -= avCasemateOrigin;
  else if (movingUpper) point = (avInvTurret * vec4(vArmorWorld, 1.0)).xyz;
  vec3 n = normalize((movingUpper ? avNormalTurret : avNormalHull) * normalW);
  float height = upper ? avZones.w : avDims.x;
  float floorY = upper ? height * 0.12 : avHullFloor;
  int face = armorFace(n, point.y, point.z - (upper ? avDims.w : 0.0),
      upper ? avDims.z : avDims.y, height * 0.86, floorY);
  int plate = upper ? 7 + face : face;
  if (!upper && face == 0 && avArm[5] > 0.0 && point.y < avZones.x) plate = 5;
  if (!upper && face == 1 && avArm[6] > 0.0 && point.y < avZones.y) plate = 6;
  if (upper && avArm[12] > 0.0 && (avKind == 2 ||
      (face == 0 && abs(point.x) < avZones.z && point.y > avZones.w * 0.12 && point.y < avZones.w * 0.88))) plate = 12;
  float nominal = avArm[plate];
  float distanceM;
  vec3 ray = impactDirection(vArmorWorld, distanceM);
  float c = clamp(abs(dot(ray, normalW)), 0.0, 1.0);
  float angle = degrees(acos(c));
  float effective = nominal / max(${MIN_INCIDENCE_COS.toExponential()}, c);
  bool heat = avShellFlags.x > 0.5, he = avShellFlags.y > 0.5;
  bool hullSide = !upper && face == 1;
  if (heat) {
    effective *= avMods.x;
    if (face == 0) effective += avMods.y;
    if (face == 1) effective += avExtras.x;
    if (hullSide) effective += avMods.w;
    if (face == 2) effective += avExtras.y;
  } else if (!he && (face == 0 || face == 1)) effective += avMods.z;
  effective += tileBonus(point, n, upper, face, heat, he);
  if (hullSide && point.y < avZones.y) effective += 20.0;
  bool bounce = !he && angle > avShell.w && avShell.z <= 3.0 * nominal;
  float penetration = avShell.x * max(0.35, 1.0 - avShell.y * max(0.0, distanceM - 100.0) / 1000.0);
  float lo = penetration * (1.0 - ${PEN_RNG}), hi = penetration * (1.0 + ${PEN_RNG});
  vec3 color;
  if (bounce || effective > hi) color = vec3(0.86, 0.12, 0.08);
  else if (effective <= lo) color = vec3(0.16, 0.82, 0.22);
  else color = mix(vec3(1.0, 0.42, 0.05), vec3(1.0, 0.86, 0.12), (hi - effective) / max(0.01, hi - lo));
  float rim = pow(1.0 - abs(dot(normalW, normalize(cameraPosition - vArmorWorld))), 2.0);
  gl_FragColor = vec4(color, 0.46 + rim * 0.21);
  #include <colorspace_fragment>
}
`;

function eraUniforms(spec, uniforms) {
  const groups = spec.eraLayout || [];
  const keys = [];
  const bounds = [], meta = [], bonus = [];
  for (const [i, group] of groups.entries()) {
    const b = eraBounds(spec, group), side = group.face === 'side';
    bounds.push(new THREE.Vector4(side ? b.zMin : b.crossMin, side ? b.zMax : b.crossMax, b.yMin, b.yMax));
    meta.push(new THREE.Vector4(group.part === 'turret' ? 1 : 0, ARMOR_FACES.indexOf(group.face), group.cols, group.rows));
    bonus.push(new THREE.Vector3(group.heat || 0, group.ke || 0, keys.length));
    for (const direction of (side ? [-1, 1] : [0])) {
      for (let row = 0; row < group.rows; row++) for (let col = 0; col < group.cols; col++) {
        keys.push(`${i}:${direction}:${row}:${col}`);
      }
    }
  }
  uniforms.avEraBounds = { value: bounds };
  uniforms.avEraMeta = { value: meta };
  uniforms.avEraBonus = { value: bonus };
  uniforms.avSpent = { value: new Float32Array(eraTileCount(spec)) };
  return keys;
}

export function createArmorOverlay(model, spec, garage = false) {
  const d = spec.dims;
  const uniforms = {
    avInvHull: { value: new THREE.Matrix4() }, avInvTurret: { value: new THREE.Matrix4() },
    avNormalHull: { value: new THREE.Matrix3() }, avNormalTurret: { value: new THREE.Matrix3() },
    avMuzzle: { value: new THREE.Vector3() },
    avCasemateOrigin: { value: new THREE.Vector3(0, d.hullH, d.turretZ || 0) },
    avZones: { value: new THREE.Vector4(zoneLowerFrontY(d), zoneLowerSideY(d), d.turretW * 0.24, d.turretH) },
    avDims: { value: new THREE.Vector4(d.hullH, d.L, d.turretL, d.turretBoxZ || 0) },
    avArm: { value: new Float32Array(13) }, avMods: { value: new THREE.Vector4() },
    avExtras: { value: new THREE.Vector2() }, avFixed: { value: spec.casemate ? 1 : 0 }, avGarage: { value: garage },
    avHullFloor: { value: d.clearance + 0.12 },
    avShell: { value: new THREE.Vector4() }, avShellFlags: { value: new THREE.Vector2() }, avSpeed: { value: 1 },
  };
  const keys = eraUniforms(spec, uniforms);
  const materials = new Map(), layers = [];
  for (const { mesh, kind } of armorSurfaces(model)) {
    if (kind === ARMOR_SURFACE.GEAR) continue;
    const side = mesh.material.side, key = kind + '/' + side;
    if (!materials.has(key)) {
      materials.set(key, new THREE.ShaderMaterial({
        side, uniforms: { ...uniforms, avKind: { value: kind } },
        defines: { ERA_GROUPS: spec.eraLayout?.length || 0, ERA_TILES: keys.length },
        transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
        vertexShader: /* glsl */`
          varying vec3 vArmorWorld;
          void main() {
            vec4 world = modelMatrix * vec4(position, 1.0);
            vArmorWorld = world.xyz;
            gl_Position = projectionMatrix * viewMatrix * world;
          }
        `,
        fragmentShader: FRAGMENT,
      }));
    }
    const layer = new THREE.Mesh(mesh.geometry, materials.get(key));
    layer.renderOrder = 5;
    layer.userData.avOverlay = true;
    mesh.add(layer);
    layers.push(layer);
  }
  let profile, lastShell, spentCount = 0;
  return {
    layers,
    show(on) { for (const layer of layers) layer.visible = on; },
    update(armor, shell, muzzle, spent) {
      const hull = uniforms.avInvHull.value.copy(model.body.matrixWorld).invert();
      const turret = uniforms.avInvTurret.value.copy(model.turret.matrixWorld).invert();
      uniforms.avNormalHull.value.getNormalMatrix(hull);
      uniforms.avNormalTurret.value.getNormalMatrix(turret);
      if (muzzle) uniforms.avMuzzle.value.copy(muzzle);
      if (profile !== armor) {
        profile = armor;
        const thickness = uniforms.avArm.value;
        for (const [i, face] of ARMOR_FACES.entries()) {
          thickness[i] = (armor.hull[face] || armor.hull.bottom)[0];
          thickness[7 + i] = (armor.turret[face] || armor.hull.top)[0];
        }
        thickness[5] = armor.lowerFront?.[0] || 0;
        thickness[6] = armor.lowerSide?.[0] || 0;
        thickness[12] = armor.mantlet?.[0] || 0;
        uniforms.avMods.value.set(armor.heatMult || 1, armor.era || 0, armor.eraKE || 0, armor.skirt || 0);
        uniforms.avExtras.value.set(armor.eraSide || 0, spec.slatArmor?.rearHeatBonus || 0);
      }
      if (shell !== lastShell) {
        lastShell = shell;
        const type = SHELL_TYPES[shell.type];
        uniforms.avShell.value.set(shell.pen, type.falloff, shell.caliber, type.ricochet);
        uniforms.avShellFlags.value.set(type.heat ? 1 : 0, type.he ? 1 : 0);
        uniforms.avSpeed.value = shell.velocity;
      }
      if (spent && spentCount !== spent.size) {
        spentCount = spent.size;
        keys.forEach((key, i) => { uniforms.avSpent.value[i] = spent.has(key) ? 1 : 0; });
      }
    },
    dispose() {
      for (const layer of layers) layer.removeFromParent();
      for (const material of materials.values()) material.dispose();
    },
  };
}
