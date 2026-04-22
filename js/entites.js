// NPC pedestrians, NPC cars, bot "players", ragdoll/spaghetti transformation,
// and shared collision helpers for SPegetti Slammer.

import * as THREE from "three";

const TMP_V = new THREE.Vector3();

// -------- Materials (shared for perf) --------
const skinPalette = [0xf4c9a0, 0xe8b48a, 0xc99272, 0xa47054, 0x7a4f38, 0x4e2e1a];
const shirtPalette = [0xd93030, 0x2b9348, 0x185adb, 0xffcb5c, 0x9c27b0, 0x00bcd4, 0xeceff1, 0x212121, 0xff7a00];
const pantsPalette = [0x1f2d3d, 0x3a3a3a, 0x2e4053, 0x5d4037, 0x0f0f0f, 0x0e3b43];
const shoeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });

const carPalette = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0x9b59b6, 0x1abc9c, 0xecf0f1, 0x34495e, 0xe67e22];
const carWheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
const carWindowMat = new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.3, metalness: 0.3 });

const spaghettiMat = new THREE.MeshStandardMaterial({ color: 0xf2d58c, roughness: 0.7 });
const sauceMat = new THREE.MeshStandardMaterial({ color: 0xb8000a, roughness: 0.9 });

// -------- Humanoid model factory --------
// Returns a THREE.Group with legs/arms set up for simple walk cycle.
// Also returns an interface to update the walk cycle, and a list of
// limb parts for easy conversion to spaghetti.
function buildHumanoid({ scale = 1, shirtColor, pantsColor, skinColor, isBot = false } = {}) {
  const g = new THREE.Group();
  const s = scale;

  const skin = new THREE.MeshStandardMaterial({ color: skinColor ?? skinPalette[Math.floor(Math.random() * skinPalette.length)], roughness: 0.9 });
  const shirt = new THREE.MeshStandardMaterial({ color: shirtColor ?? shirtPalette[Math.floor(Math.random() * shirtPalette.length)], roughness: 0.85 });
  const pants = new THREE.MeshStandardMaterial({ color: pantsColor ?? pantsPalette[Math.floor(Math.random() * pantsPalette.length)], roughness: 0.85 });

  // Torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5 * s, 0.7 * s, 0.28 * s), shirt);
  torso.position.y = 1.15 * s;
  g.add(torso);

  // Head
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32 * s, 0.34 * s, 0.3 * s), skin);
  head.position.y = 1.68 * s;
  g.add(head);

  // Hair cap
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.34 * s, 0.1 * s, 0.32 * s), new THREE.MeshStandardMaterial({ color: [0x1a1a1a, 0x3a2314, 0x8b5a2b, 0xd5a15a, 0xaa3311][Math.floor(Math.random() * 5)], roughness: 0.9 }));
  hair.position.y = 1.82 * s;
  g.add(hair);

  // Arms (pivot groups so we can swing them)
  const armL = new THREE.Group(); armL.position.set(-0.32 * s, 1.45 * s, 0);
  const armR = new THREE.Group(); armR.position.set(+0.32 * s, 1.45 * s, 0);
  const armGeo = new THREE.BoxGeometry(0.14 * s, 0.62 * s, 0.14 * s);
  const armLmesh = new THREE.Mesh(armGeo, shirt); armLmesh.position.y = -0.32 * s; armL.add(armLmesh);
  const armRmesh = new THREE.Mesh(armGeo, shirt); armRmesh.position.y = -0.32 * s; armR.add(armRmesh);
  g.add(armL, armR);

  // Legs
  const legL = new THREE.Group(); legL.position.set(-0.13 * s, 0.82 * s, 0);
  const legR = new THREE.Group(); legR.position.set(+0.13 * s, 0.82 * s, 0);
  const legGeo = new THREE.BoxGeometry(0.18 * s, 0.72 * s, 0.18 * s);
  const legLmesh = new THREE.Mesh(legGeo, pants); legLmesh.position.y = -0.38 * s; legL.add(legLmesh);
  const legRmesh = new THREE.Mesh(legGeo, pants); legRmesh.position.y = -0.38 * s; legR.add(legRmesh);
  const shoeGeo = new THREE.BoxGeometry(0.22 * s, 0.1 * s, 0.3 * s);
  const shoeL = new THREE.Mesh(shoeGeo, shoeMat); shoeL.position.set(0, -0.78 * s, 0.04 * s); legL.add(shoeL);
  const shoeR = new THREE.Mesh(shoeGeo, shoeMat); shoeR.position.set(0, -0.78 * s, 0.04 * s); legR.add(shoeR);
  g.add(legL, legR);

  if (isBot) {
    // Give bot players a glowing hat so they're easy to spot
    const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.24 * s, 0.24 * s, 0.04 * s, 16), new THREE.MeshStandardMaterial({ color: 0xff00aa, emissive: 0xff0088, emissiveIntensity: 0.4 }));
    hatBrim.position.y = 1.9 * s;
    g.add(hatBrim);
  }

  // For shadow casting on key parts
  for (const m of [torso, head, hair, armLmesh, armRmesh, legLmesh, legRmesh]) m.castShadow = true;

  const limbs = [torso, head, hair, armLmesh, armRmesh, legLmesh, legRmesh, shoeL, shoeR];

  const anim = {
    t: Math.random() * 10,
    speed: 1,
    update(dt, moving) {
      if (moving) this.t += dt * 7 * this.speed; // stride frequency
      const sw = moving ? Math.sin(this.t) * 0.8 : Math.sin(this.t * 0.3) * 0.05;
      legL.rotation.x = sw;
      legR.rotation.x = -sw;
      armL.rotation.x = -sw * 0.8;
      armR.rotation.x = sw * 0.8;
      // subtle bob
      g.position.y = moving ? Math.abs(Math.sin(this.t * 0.5)) * 0.04 : 0;
    },
  };

  return { group: g, anim, limbs, height: 1.9 * s, radius: 0.34 * s };
}

// -------- Pedestrian / bot manager --------
export class Pedestrian {
  constructor(city, scene, { isBot = false } = {}) {
    this.city = city;
    this.scene = scene;
    this.isBot = isBot;
    const model = buildHumanoid({ scale: isBot ? 1.15 : 1, isBot });
    this.group = model.group;
    this.anim = model.anim;
    this.height = model.height;
    this.radius = isBot ? 0.42 : 0.34;
    this.speed = isBot ? 2.2 + Math.random() * 0.8 : 1.2 + Math.random() * 0.6;
    this.state = "alive";
    this.dir = new THREE.Vector3();
    this.vel = new THREE.Vector3(); // used for bump impulse
    this.respawnAt = 0;
    scene.add(this.group);
    this.respawn();
  }

  respawn() {
    const p = this.city.pedSpawn();
    this.group.position.set(p.x, 0, p.z);
    this.dir.set(p.dirX, 0, p.dirZ).normalize();
    this.group.rotation.y = Math.atan2(this.dir.x, this.dir.z);
    this.state = "alive";
    this.group.visible = true;
  }

  die() {
    // Visual: hide the group. Caller is responsible for spawning spaghetti/ragdoll.
    this.state = "dead";
    this.group.visible = false;
  }

  bump(dirX, dirZ, power = 5) {
    this.vel.x += dirX * power;
    this.vel.z += dirZ * power;
  }

  update(dt, now) {
    if (this.state === "dead") {
      if (now > this.respawnAt) {
        // respawn elsewhere
        this.respawn();
      }
      return;
    }

    // Apply bump velocity decay
    if (this.vel.lengthSq() > 0.001) {
      this.group.position.x += this.vel.x * dt;
      this.group.position.z += this.vel.z * dt;
      this.vel.multiplyScalar(Math.max(0, 1 - dt * 4));
    }

    // Try to advance in direction
    const px = this.group.position.x + this.dir.x * this.speed * dt;
    const pz = this.group.position.z + this.dir.z * this.speed * dt;

    if (this.city.isOnSidewalkOrCrosswalk(px, pz) && this.city.withinBounds(px, pz)) {
      this.group.position.x = px;
      this.group.position.z = pz;
    } else {
      // Pick a new direction that keeps us on walkable terrain; try the 4 cardinal dirs
      const tryDirs = [
        { x: this.dir.z, z: -this.dir.x },  // turn right
        { x: -this.dir.z, z: this.dir.x },  // turn left
        { x: -this.dir.x, z: -this.dir.z }, // reverse
      ];
      // Shuffle mildly
      if (Math.random() < 0.5) tryDirs.reverse();
      let picked = false;
      for (const d of tryDirs) {
        const nx = this.group.position.x + d.x * 0.6;
        const nz = this.group.position.z + d.z * 0.6;
        if (this.city.isOnSidewalkOrCrosswalk(nx, nz)) {
          this.dir.set(d.x, 0, d.z).normalize();
          picked = true;
          break;
        }
      }
      if (!picked) {
        // teleport to a fresh sidewalk if truly stuck
        const p = this.city.pedSpawn();
        this.group.position.set(p.x, 0, p.z);
        this.dir.set(p.dirX, 0, p.dirZ).normalize();
      }
    }

    // Random occasional turns at intersections
    if (Math.random() < 0.008) {
      const d = [
        { x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 },
      ][Math.floor(Math.random() * 4)];
      const nx = this.group.position.x + d.x * 0.8;
      const nz = this.group.position.z + d.z * 0.8;
      if (this.city.isOnSidewalkOrCrosswalk(nx, nz)) this.dir.set(d.x, 0, d.z).normalize();
    }

    this.group.rotation.y = Math.atan2(this.dir.x, this.dir.z);
    this.anim.update(dt, true);
  }

  // AABB in world coordinates for hit detection and physical collisions
  getAABB(out) {
    const p = this.group.position;
    out.min.set(p.x - this.radius, p.y, p.z - this.radius);
    out.max.set(p.x + this.radius, p.y + this.height, p.z + this.radius);
    return out;
  }

  getPosition() { return this.group.position; }
}

// -------- Car manager --------
export class Car {
  constructor(city, scene) {
    this.city = city;
    this.scene = scene;
    this.group = new THREE.Group();
    this.state = "alive";
    this.respawnAt = 0;

    const color = carPalette[Math.floor(Math.random() * carPalette.length)];
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.4 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 4.2), bodyMat);
    body.position.y = 0.7;
    body.castShadow = true;
    this.group.add(body);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.85, 2.1), carWindowMat);
    cabin.position.set(0, 1.45, 0.1);
    this.group.add(cabin);

    // Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 12);
    const wheelPositions = [
      [-1, 0.4, 1.3], [1, 0.4, 1.3], [-1, 0.4, -1.3], [1, 0.4, -1.3],
    ];
    this.wheels = [];
    for (const [x, y, z] of wheelPositions) {
      const w = new THREE.Mesh(wheelGeo, carWheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, y, z);
      this.group.add(w);
      this.wheels.push(w);
    }

    // Headlights
    const hlMat = new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0xffffaa, emissiveIntensity: 0.7 });
    for (const x of [-0.6, 0.6]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.1), hlMat);
      h.position.set(x, 0.8, 2.1);
      this.group.add(h);
    }

    this.length = 4.6;
    this.width = 2.2;
    this.speed = 8 + Math.random() * 5;
    this.dir = new THREE.Vector3();

    scene.add(this.group);
    this.respawn();
  }

  respawn() {
    const p = this.city.carSpawn();
    this.group.position.set(p.x, 0, p.z);
    this.dir.set(p.dirX, 0, p.dirZ).normalize();
    this.group.rotation.y = Math.atan2(this.dir.x, this.dir.z);
    this.state = "alive";
    this.group.visible = true;
  }

  die() {
    this.state = "dead";
    this.group.visible = false;
  }

  update(dt, now) {
    if (this.state === "dead") {
      if (now > this.respawnAt) this.respawn();
      return;
    }

    // Move along direction
    const px = this.group.position.x + this.dir.x * this.speed * dt;
    const pz = this.group.position.z + this.dir.z * this.speed * dt;

    if (!this.city.isOnRoad(px, pz) || !this.city.withinBounds(px, pz)) {
      // At intersection/edge: try turn (keep driving; never stop).
      const options = [];
      // Continue
      options.push({ x: this.dir.x, z: this.dir.z });
      // Right turn
      options.push({ x: -this.dir.z, z: this.dir.x });
      // Left turn
      options.push({ x: this.dir.z, z: -this.dir.x });
      // Shuffle
      for (let k = options.length - 1; k > 0; k--) {
        const j = Math.floor(Math.random() * (k + 1));
        [options[k], options[j]] = [options[j], options[k]];
      }
      let picked = false;
      for (const o of options) {
        // Project ahead a bit, applying the correct lane offset perpendicular
        const pvx = this.group.position.x + o.x * (this.city.roadWidth / 2 + 2);
        const pvz = this.group.position.z + o.z * (this.city.roadWidth / 2 + 2);
        if (this.city.isOnRoad(pvx, pvz) && this.city.withinBounds(pvx, pvz)) {
          // Snap to lane: align lateral coordinate to lane center
          this.dir.set(o.x, 0, o.z).normalize();
          this.snapToLane();
          picked = true;
          break;
        }
      }
      if (!picked) {
        // Fallback: respawn (never stop)
        this.respawn();
      }
    } else {
      this.group.position.x = px;
      this.group.position.z = pz;
    }

    this.group.rotation.y = Math.atan2(this.dir.x, this.dir.z);

    // Spin wheels for visual flair
    for (const w of this.wheels) w.rotation.x += dt * this.speed * 1.2;
  }

  snapToLane() {
    // Align perpendicular to direction to the nearest lane center.
    const x = this.group.position.x;
    const z = this.group.position.z;
    const PITCH = this.city.pitch;
    const LANE = this.city.roadWidth / 4;
    if (this.dir.z !== 0) {
      // Moving along z, lateral = x; x should be nearest roadCenter +/- LANE
      const ix = Math.round((x + this.city.halfGrid) / PITCH);
      const roadX = this.city.roadCenter(ix);
      // Drive on right: if dir.z>0, car sits at x < roadX (left side of road in world) ... wait: right-hand side of road.
      // If you face +z, right is -x. Standard right-hand drive. So +z -> x = roadX - LANE.
      const laneX = roadX + (this.dir.z > 0 ? -LANE : +LANE);
      this.group.position.x = laneX;
    } else {
      const jz = Math.round((z + this.city.halfGrid) / PITCH);
      const roadZ = this.city.roadCenter(jz);
      // If dir.x>0, right is +z. So +x -> z = roadZ + LANE.
      const laneZ = roadZ + (this.dir.x > 0 ? +LANE : -LANE);
      this.group.position.z = laneZ;
    }
  }

  getAABB(out) {
    const p = this.group.position;
    // Approximate axis-aligned box (ignoring rotation) padded a touch
    const half = Math.max(this.length, this.width) / 2;
    out.min.set(p.x - half, p.y, p.z - half);
    out.max.set(p.x + half, p.y + 1.8, p.z + half);
    return out;
  }

  getPosition() { return this.group.position; }

  // Used by car-hit-pedestrian check: a tight rotated "front" region.
  getFrontHitCenter(offset = 2.0) {
    const p = this.group.position;
    return TMP_V.set(p.x + this.dir.x * offset, p.y, p.z + this.dir.z * offset);
  }
}

// -------- Spaghetti explosion --------
export class Spaghetti {
  constructor(scene, position, isHuman = true) {
    this.scene = scene;
    this.strands = [];
    this.ttl = 25; // seconds before auto-cleanup
    this.createdAt = performance.now() / 1000;

    // A sauce splat on the ground
    const splat = new THREE.Mesh(new THREE.CircleGeometry(0.8, 16), sauceMat);
    splat.rotation.x = -Math.PI / 2;
    splat.position.set(position.x, 0.05, position.z);
    scene.add(splat);
    this.strands.push({ mesh: splat, vel: new THREE.Vector3(), angVel: new THREE.Vector3(), isGround: true });

    const n = isHuman ? 24 : 40;
    for (let i = 0; i < n; i++) {
      const len = 0.35 + Math.random() * 0.7;
      const geo = new THREE.CylinderGeometry(0.025, 0.025, len, 6);
      const mesh = new THREE.Mesh(geo, spaghettiMat);
      mesh.position.set(position.x + (Math.random() - 0.5) * 0.3, 1 + Math.random() * 0.6, position.z + (Math.random() - 0.5) * 0.3);
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      mesh.castShadow = true;
      scene.add(mesh);
      const speed = 4 + Math.random() * 5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * (Math.PI / 2);
      const vel = new THREE.Vector3(
        Math.cos(theta) * Math.cos(phi) * speed,
        Math.sin(phi) * speed + 2,
        Math.sin(theta) * Math.cos(phi) * speed
      );
      const angVel = new THREE.Vector3(
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10
      );
      this.strands.push({ mesh, vel, angVel });
    }
  }

  update(dt, now) {
    for (const s of this.strands) {
      if (s.isGround) continue;
      s.vel.y -= 18 * dt; // gravity
      s.mesh.position.x += s.vel.x * dt;
      s.mesh.position.y += s.vel.y * dt;
      s.mesh.position.z += s.vel.z * dt;
      if (s.mesh.position.y < 0.05) {
        s.mesh.position.y = 0.05;
        s.vel.multiplyScalar(0.3);
        s.vel.y = 0;
        s.angVel.multiplyScalar(0.5);
      }
      s.mesh.rotation.x += s.angVel.x * dt;
      s.mesh.rotation.y += s.angVel.y * dt;
      s.mesh.rotation.z += s.angVel.z * dt;
    }
    if (now - this.createdAt > this.ttl) {
      this.dispose();
      return false;
    }
    return true;
  }

  dispose() {
    for (const s of this.strands) {
      this.scene.remove(s.mesh);
      s.mesh.geometry.dispose();
    }
    this.strands.length = 0;
  }
}

// -------- Collision helpers --------

// Circle-vs-circle push-out: pushes both bodies apart so they don't overlap.
// Each body has .position (Vector3) and .radius; mA/mB are relative masses.
export function pushOutCircles(posA, rA, posB, rB, mA, mB) {
  const dx = posB.x - posA.x;
  const dz = posB.z - posA.z;
  const dist = Math.hypot(dx, dz);
  const minDist = rA + rB;
  if (dist >= minDist || dist < 1e-5) return false;
  const overlap = minDist - dist;
  const nx = dx / dist;
  const nz = dz / dist;
  const invMass = 1 / (mA + mB);
  posA.x -= nx * overlap * (mB * invMass);
  posA.z -= nz * overlap * (mB * invMass);
  posB.x += nx * overlap * (mA * invMass);
  posB.z += nz * overlap * (mA * invMass);
  return true;
}

// Collide player/pedestrian circle vs building AABBs; slide along walls.
export function collideCircleVsBuildings(pos, radius, buildings) {
  for (const b of buildings) {
    const a = b.aabb;
    const cx = Math.max(a.minX, Math.min(pos.x, a.maxX));
    const cz = Math.max(a.minZ, Math.min(pos.z, a.maxZ));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      const d = Math.sqrt(d2) || 1e-5;
      const nx = dx / d;
      const nz = dz / d;
      const push = radius - d + 0.001;
      pos.x += nx * push;
      pos.z += nz * push;
    }
  }
}

// Car-hits-pedestrian test: returns true if the pedestrian is in front of the car.
export function carHitsPed(car, ped) {
  const dx = ped.group.position.x - car.group.position.x;
  const dz = ped.group.position.z - car.group.position.z;
  // Forward projection
  const fwd = dx * car.dir.x + dz * car.dir.z;
  // Lateral projection
  const lat = dx * (-car.dir.z) + dz * (car.dir.x);
  if (fwd < 0 || fwd > car.length / 2 + ped.radius) return false;
  if (Math.abs(lat) > car.width / 2 + ped.radius) return false;
  return true;
}
