import * as THREE from 'three';
import { DEG, clamp } from '../util.js';
import { trackCenterOffset } from './vehicleDimensions.js';

export const GRAVITY = 9.81;
export const PHYSICS_STEP = 1 / 120;
const SURFACE = 1, OBSTACLE = 2, VEHICLE = 4;
const groups = (members, filter) => (members << 16) | filter;
const surfaceQuery = groups(VEHICLE, SURFACE);
const ZERO = { x: 0, y: 0, z: 0 };
const ANCHOR_HEIGHT = 0.55;
const SPRING_FREQUENCY = 9;
const SPRING_REST = ANCHOR_HEIGHT + GRAVITY / (SPRING_FREQUENCY ** 2);
const REBOUND_TRAVEL = 0.105;
// Five suspension stations per track, with the end stations close to its idlers.
const STATIONS = [-0.42, -0.21, 0, 0.21, 0.42];
const WHEEL_COUNT = STATIONS.length * 2;
const _yaw = new THREE.Euler(), _rotation = new THREE.Quaternion();
const _origin = new THREE.Vector3(), _down = new THREE.Vector3(), _forward = new THREE.Vector3();
const _side = new THREE.Vector3(), _normal = new THREE.Vector3(), _contactNormal = new THREE.Vector3();
const _arm = new THREE.Vector3(), _velocity = new THREE.Vector3(), _angular = new THREE.Vector3();
const _impulse = new THREE.Vector3(), _forceSum = new THREE.Vector3(), _momentSum = new THREE.Vector3();
const _tangent = new THREE.Vector3(), _scrub = new THREE.Vector3();

let rapierReady;
export function initPhysics() {
  rapierReady ??= import('@dimforge/rapier3d-compat').then(async ({ default: engine }) => {
    await engine.init();
    return engine;
  }).catch(error => {
    rapierReady = undefined;
    throw error;
  });
  return rapierReady;
}

export class BattlefieldPhysics {
  constructor(engine, battlefield) {
    this.engine = engine;
    this.battlefield = battlefield;
    this.world = new engine.World({ x: 0, y: -GRAVITY, z: 0 });
    this.world.timestep = PHYSICS_STEP;
    this.world.numSolverIterations = 6;
    this.world.maxCcdSubsteps = 2;
    this.remainder = 0;
    this.vehicles = [];
    this.ray = new engine.Ray(_origin, _down);
    this.buildScene();
    // Publish the fixed colliders to the query pipeline before the first suspension ray.
    this.world.step();
  }

  buildScene() {
    const { ColliderDesc, HeightFieldFlags, TriMeshFlags } = this.engine;
    const B = this.battlefield, terrain = B.terrain;
    const fixed = (shape, group) => this.world.createCollider(shape.setFriction(0.72)
      .setCollisionGroups(groups(group, VEHICLE)));
    // Rapier's columns advance along X and its rows along Z.
    const heights = new Float32Array(terrain.h.length);
    for (let x = 0; x < terrain.n; x++) for (let z = 0; z < terrain.n; z++) {
      heights[x * terrain.n + z] = terrain.h[z * terrain.n + x];
    }
    fixed(ColliderDesc.heightfield(terrain.n - 1, terrain.n - 1, heights,
      { x: terrain.half * 2, y: 1, z: terrain.half * 2 }, HeightFieldFlags.FIX_INTERNAL_EDGES), SURFACE);
    for (const c of B.colliders) if (c.kind !== 'deck') this.addObstacle(c);
    // Follow the actual bridge profile; the map's OBBs for bullet tests use a flat top.
    for (const deck of B.decks) {
      const verts = [], indices = [];
      for (const span of deck.segs) {
        const first = verts.length / 3;
        for (const along of [0, span.l]) {
          const y = deck.deckY(Math.min(1, (span.s0 + along) / deck.len));
          for (const side of [-1, 1]) {
            const lateral = side * (deck.hw + 0.06);
            verts.push(span.ax + along * span.ux + lateral * span.uz, y,
              span.az + along * span.uz - lateral * span.ux);
          }
        }
        indices.push(first, first + 2, first + 1, first + 2, first + 3, first + 1);
      }
      if (indices.length) fixed(ColliderDesc.trimesh(new Float32Array(verts), new Uint32Array(indices), TriMeshFlags.FIX_INTERNAL_EDGES), SURFACE);
    }
    for (const rock of B.veg.rocks) {
      const radius = rock.s * 0.72;
      fixed(ColliderDesc.ball(radius).setTranslation(rock.x, rock.y - rock.s * 0.25, rock.z),
        rock.s >= 2.4 ? OBSTACLE : SURFACE);
    }
    const limit = B.playHalf - 4;
    for (const sign of [-1, 1]) {
      fixed(ColliderDesc.cuboid(1, 160, limit + 1).setTranslation(sign * (limit + 1), 20, 0), OBSTACLE);
      fixed(ColliderDesc.cuboid(limit + 1, 160, 1).setTranslation(0, 20, sign * (limit + 1)), OBSTACLE);
    }
  }

  addObstacle(c) {
    const half = (c.y1 - c.y0) / 2;
    if (half <= 0) return;
    _rotation.setFromEuler(_yaw.set(0, c.rot, 0));
    return this.world.createCollider(this.engine.ColliderDesc.cuboid(c.hx, half, c.hz)
      .setTranslation(c.x, c.y0 + half, c.z).setRotation(_rotation)
      .setFriction(0.72).setCollisionGroups(groups(OBSTACLE, VEHICLE)));
  }

  attach(tank) {
    const { RigidBodyDesc, ColliderDesc } = this.engine;
    const d = tank.spec.dims;
    const mass = tank.spec.mass * 1000;
    const body = this.world.createRigidBody(RigidBodyDesc.dynamic().setLinearDamping(0.014)
      .setAngularDamping(0.25).setCcdEnabled(true).setCanSleep(false));
    const filter = groups(VEHICLE, SURFACE | OBSTACLE | VEHICLE);
    const base = 0.31, halfHeight = (d.hullH - base) / 2;
    this.world.createCollider(ColliderDesc.cuboid(d.W / 2, halfHeight, d.L / 2)
      .setTranslation(0, base + halfHeight, 0).setMass(mass)
      .setFriction(0.6).setContactSkin(0.012).setCollisionGroups(filter), body);
    const turret = this.world.createCollider(ColliderDesc.cuboid(d.turretW * 0.46, d.turretH / 2, d.turretL * 0.45)
      .setTranslation(0, d.hullH + d.turretH / 2, (d.turretZ ?? 0) + (d.turretBoxZ ?? 0)).setMass(0)
      .setFriction(0.6).setCollisionGroups(filter), body);
    const vehicle = { tank, body, turret, mass, contact: 0, unsupported: 0,
      inertiaYaw: mass * (d.L * d.L + d.W * d.W) / 12 };
    this.vehicles.push(vehicle);
    tank.vehicle = vehicle;
    return vehicle;
  }

  place(tank, speed = 0) {
    const vehicle = tank.vehicle ?? this.attach(tank);
    const { body } = vehicle;
    body.setRotation(tank.quat, true);
    body.setTranslation(tank.pos, true);
    _forward.set(0, 0, speed).applyQuaternion(tank.quat);
    body.setLinvel(_forward, true);
    body.setAngvel(ZERO, true);
    vehicle.contact = 0;
    vehicle.unsupported = 0;
    tank.vel.copy(_forward);
    tank.speed = speed;
  }

  brushImpact(tank) {
    const { body, mass } = tank.vehicle;
    _impulse.set(tank.vel.x, 0, tank.vel.z).multiplyScalar(-0.18 * mass);
    body.applyImpulse(_impulse, true);
  }

  recoil(tank, pivot, direction, calibre) {
    if (!tank.vehicle) return;
    _impulse.copy(direction).multiplyScalar(-tank.vehicle.mass * 0.11 * calibre / 100);
    tank.vehicle.body.applyImpulseAtPoint(_impulse, pivot, true);
  }

  advance(dt) {
    this.remainder += dt;
    for (const { tank } of this.vehicles) tank.landingSpeed = 0;
    while (this.remainder + 1e-9 >= PHYSICS_STEP) {
      this.remainder -= PHYSICS_STEP;
      for (const vehicle of this.vehicles) {
        this.readPose(vehicle);
        this.applyContactForces(vehicle);
      }
      this.world.step();
    }
    for (const vehicle of this.vehicles) this.readPose(vehicle);
  }

  readPose({ tank, body }) {
    tank.pos.copy(body.translation());
    tank.quat.copy(body.rotation());
    _yaw.setFromQuaternion(tank.quat, 'YXZ');
    tank.heading = _yaw.y;
    tank.pitch = _yaw.x;
    tank.roll = _yaw.z;
    tank.vel.copy(body.linvel());
    const forwardSpeed = tank.vel.x * Math.sin(tank.heading) + tank.vel.z * Math.cos(tank.heading);
    const speed = Math.hypot(tank.vel.x, tank.vel.z);
    tank.speed = speed < 0.035 ? 0 : (forwardSpeed < 0 ? -speed : speed);
    tank.turnRate = body.angvel().y;
  }

  applyContactForces(vehicle) {
    const { tank, body, mass, turret } = vehicle;
    if (tank.turretGone && turret.isEnabled()) turret.setEnabled(false);
    const d = tank.spec.dims, dt = PHYSICS_STEP;
    const T = this.battlefield.terrain;
    const waterDepth = T.waterLevel(tank.pos.x, tank.pos.z) - tank.pos.y;
    tank.inWater = waterDepth > 0.15;
    tank.groundY = this.battlefield.groundHeight(tank.pos.x, tank.pos.z);

    _down.set(0, -1, 0).applyQuaternion(tank.quat);
    _normal.set(0, 0, 0); _forceSum.set(0, 0, 0); _momentSum.set(0, 0, 0);
    const com = body.worldCom();
    _angular.copy(body.angvel());
    const floatLoad = tank.spec.amphibious ? this.applyBuoyancy(vehicle, waterDepth) : 0;
    const springMass = mass / WHEEL_COUNT;
    const stiffness = springMass * SPRING_FREQUENCY ** 2;
    const damping = 2 * springMass * SPRING_FREQUENCY * 0.94;
    const maxImpulse = springMass * GRAVITY * 5 * dt;
    const side = trackCenterOffset(d);
    let load = 0, leftLoad = 0;
    let support = 0;
    for (const x of [-side, side]) for (const station of STATIONS) {
      _origin.set(x, ANCHOR_HEIGHT, station * d.L).applyQuaternion(tank.quat).add(tank.pos);
      const hit = this.world.castRayAndGetNormal(this.ray, SPRING_REST + REBOUND_TRAVEL, false,
        this.engine.QueryFilterFlags.ONLY_FIXED, surfaceQuery);
      if (!hit || hit.normal.y < 0.35) continue;
      _contactNormal.copy(hit.normal);
      if (-_contactNormal.dot(_down) < 0.3) continue;
      // Pressure acts at the track contact patch, so an off-centre load also pitches or rolls the hull.
      _arm.copy(_origin).addScaledVector(_down, hit.timeOfImpact).sub(com);
      _velocity.crossVectors(_angular, _arm).add(tank.vel);
      const compression = SPRING_REST - hit.timeOfImpact;
      const impulse = clamp((stiffness * compression - damping * _velocity.dot(_contactNormal)) * dt, 0, maxImpulse);
      if (!impulse) continue;
      support++;
      load += impulse;
      if (x < 0) leftLoad += impulse;
      _impulse.copy(_contactNormal).multiplyScalar(impulse);
      _normal.add(_impulse);
      _forceSum.add(_impulse);
      _momentSum.add(_arm.cross(_impulse));
    }

    vehicle.contact = support;
    if (tank.afloat && floatLoad > load) {
      vehicle.unsupported = 0;
      tank.airborne = false;
      _normal.set(0, 1, 0);
      body.applyImpulse(_forceSum, true);
      body.applyTorqueImpulse(_momentSum, true);
      this.applyTraction(vehicle, floatLoad * 0.52, floatLoad * 0.26, waterDepth, true);
      return;
    }
    if (!support) {
      vehicle.unsupported += dt;
      tank.airborne = vehicle.unsupported >= 0.025;
      tank.hullAiming = false;
      return;
    }
    _normal.normalize();
    if (tank.airborne) tank.landingSpeed = Math.max(tank.landingSpeed, -tank.vel.dot(_normal));
    vehicle.unsupported = 0;
    tank.airborne = false;
    body.applyImpulse(_forceSum, true);
    body.applyTorqueImpulse(_momentSum, true);
    this.applyTraction(vehicle, load, leftLoad, waterDepth);
  }

  applyBuoyancy({ tank, body, mass, inertiaYaw }, depth) {
    const draft = tank.spec.amphibious.draft;
    const immersion = clamp((depth - 0.1) / (draft * 0.57), 0, 1);
    tank.afloat = immersion >= 0.8;
    if (immersion === 0) return 0;
    const dt = PHYSICS_STEP;
    const load = clamp(GRAVITY + (depth - draft) * 24 - tank.vel.y * 7, 0, GRAVITY * 2.3)
      * immersion * mass * dt;
    body.applyImpulse(_impulse.set(0, load, 0), true);
    // The hull rights itself with damped torque while crossing the water surface.
    _forward.set(0, 1, 0).applyQuaternion(tank.quat);
    _impulse.set(-_forward.z * 4 - _angular.x * 2.7, 0, _forward.x * 4 - _angular.z * 2.7);
    body.applyTorqueImpulse(_impulse.multiplyScalar(inertiaYaw * dt * immersion), true);
    return load;
  }

  applyTraction(vehicle, load, leftLoad, waterDepth, floating = false) {
    const { tank, body, mass, inertiaYaw } = vehicle;
    const s = tank.spec, dt = PHYSICS_STEP, input = tank.input, T = this.battlefield.terrain;
    const mobile = tank.alive && tank.modules.tracks === 1;
    const brokenSide = tank.alive ? tank.brokenTrackSide : 0;
    const intactLoad = brokenSide === -1 ? load - leftLoad : brokenSide === 1 ? leftLoad : 0;
    const canPivot = intactLoad > 0 && !input.brake;
    const throttle = mobile ? clamp(input.throttle, -1, 1) : 0;
    const steer = mobile || canPivot ? clamp(input.steer, -1, 1) : 0;
    const rearDriving = !!(s.rearDriver && throttle < 0 && tank.crewAlive('Rear driver'));
    const driver = rearDriving || tank.crewAlive('Driver') ? 1 : 0.65;
    const fullSpeed = s.maxSpeed / 3.6, water = clamp(1 - Math.max(0, waterDepth) * 0.38, 0.2, 1);
    const i = T.x2i(tank.pos.x), j = T.x2i(tank.pos.z);
    const road = T.inside(i, j) ? T.road[T.idx(i, j)] : 0;
    const grip = 0.82 + road * 0.21;
    const overdrive = tank.equip.active('overdrive'), loadFactor = tank.equip.factor;
    const engine = tank.modules.engine < 1 ? 0.5 : 1;
    const reverse = rearDriving ? s.rearDriver.maxSpeed : s.reverseSpeed;
    let speedLimit = (throttle < 0 ? reverse / 3.6 : fullSpeed) * engine * driver * loadFactor *
      water * (0.78 + 0.22 * Math.min(1, road * 1.5)) * (overdrive ? 1.2 : 1) * (tank.abilities?.speedMult ?? 1);
    if (floating) speedLimit = s.amphibious.speed / 3.6 * engine * driver * (throttle < 0 ? 0.52 : 1);
    if (tank.abilities?.dozerActive) speedLimit = Math.min(speedLimit, s.dozer.speed / 3.6);
    const lowGear = 4.3 * Math.max(0, 1 - Math.abs(tank.speed) / 9) ** 2;
    const driveLimit = (lowGear + clamp(s.power / s.mass * 0.075, 0.6, 2.2) * (s.cls === 'Light' ? 2.4 : 1)) *
      engine * loadFactor * (overdrive ? 1.35 : 1);
    _forward.set(0, 0, 1).applyQuaternion(tank.quat);
    _tangent.copy(_forward).addScaledVector(_normal, -_forward.dot(_normal)).normalize();
    _side.crossVectors(_normal, _tangent).normalize();
    const longitudinal = tank.vel.dot(_tangent), sideways = tank.vel.dot(_side);
    const turnMax = s.hullTraverse * DEG * driver * (1 - 0.45 * Math.min(1, Math.abs(tank.speed) / fullSpeed)) *
      (floating ? 0.48 : tank.inWater ? 0.6 : 1);
    // A damaged track can serve as a pivot after the hull slows down. The intact track supplies the grip.
    const pivotMax = canPivot ? turnMax * 0.25 * engine * clamp((2 - Math.abs(longitudinal)) / 1.55, 0, 1) : 0;
    const turnLimit = mobile ? turnMax : pivotMax;
    tank.hullAiming = !!(s.fixedGun && turnLimit > 0 && !input.driveHeld && !throttle && !steer);
    const aimError = tank.hullAiming ? tank.fixedGunHeadingError() : 0;
    const commanded = tank.hullAiming ? clamp(aimError / 0.12, -turnLimit, turnLimit) :
      steer * turnLimit * (mobile && longitudinal < -0.3 ? -1 : 1);
    // Keep the disabled side nearly stationary as the hull swings around it.
    const pivotSpeed = brokenSide ? commanded * brokenSide * trackCenterOffset(s.dims) : 0;
    const holding = !throttle && Math.abs(longitudinal) < 0.45;
    const neutralBrake = holding ? 6 : 0.75 + Math.abs(longitudinal) * 0.07;
    const driveBrake = throttle * longitudinal < 0 ? 5 : 3.2;
    const brake = input.brake || !mobile ? 7 : (throttle ? driveBrake : neutralBrake);
    const speedError = throttle * speedLimit + pivotSpeed - longitudinal;
    const acceleration = pivotSpeed ? intactLoad * grip * 0.35 / (mass * dt) :
      throttle && Math.sign(speedError) === Math.sign(throttle) ? driveLimit : brake;
    // The drivetrain brakes at low speed on grades. At speed the slope supplies acceleration.
    const parkAssist = holding ? GRAVITY * _tangent.y : 0;
    const drive = clamp(speedError / dt + parkAssist, -acceleration, acceleration) * mass * dt;
    const lateral = (-sideways / 0.075 + GRAVITY * _side.y) * mass * dt;
    const maxTraction = load * grip;
    _scrub.copy(_tangent).multiplyScalar(drive).addScaledVector(_side, lateral);
    _scrub.clampLength(0, maxTraction);
    body.applyImpulse(_scrub, true);

    const angularSpeed = _angular.dot(_normal);
    const turnTraction = commanded && !mobile ? intactLoad * grip : maxTraction;
    const torqueLimit = turnTraction * s.dims.W * (mobile ? 0.53 : 0.82);
    const response = tank.hullAiming ? 0.085 : steer ? 0.105 : 0.065;
    const torque = clamp((commanded - angularSpeed) * dt / response * inertiaYaw, -torqueLimit, torqueLimit);
    body.applyTorqueImpulse(_impulse.copy(_normal).multiplyScalar(torque), true);
  }

  free() {
    this.world.free();
    this.vehicles.length = 0;
  }
}
