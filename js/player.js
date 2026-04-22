// First-person player controls + sledgehammer for SPegetti Slammer.
//
// Controls
//   WASD    - move (W+S cancel each other, A+D cancel each other)
//   Shift   - hold to run
//   Mouse   - look (pointer lock)
//   Click   - swing hammer (3.5s cooldown, alternates side)
//
// Hammer: two hitboxes (handle + head). During the active slice of a swing,
// check overlaps against targets.

import * as THREE from "three";

const WALK_SPEED = 4.2;
const RUN_SPEED = 8.0;
const COOLDOWN = 3.5;               // seconds per swing
const SWING_DURATION = 0.45;        // seconds from start to finish
const ACTIVE_START = 0.12;          // when hit detection opens (seconds into swing)
const ACTIVE_END = 0.34;            // when hit detection closes
const PLAYER_RADIUS = 0.4;
const PLAYER_EYE_HEIGHT = 1.7;

const TMP_BOX = new THREE.Box3();

export class Player {
  constructor(camera, city, { onHammerHit } = {}) {
    this.camera = camera;
    this.city = city;
    this.onHammerHit = onHammerHit || (() => {});

    this.position = new THREE.Vector3(0, PLAYER_EYE_HEIGHT, 0);
    this.radius = PLAYER_RADIUS;
    this.height = PLAYER_EYE_HEIGHT + 0.3;
    this.yaw = 0;
    this.pitch = 0;
    this.velocity = new THREE.Vector3();
    this.state = "alive"; // "alive" | "dead"
    this.respawnAt = 0;

    // Input state
    this.keys = { w: false, a: false, s: false, d: false, shift: false };
    this.locked = false;
    this.lmbDown = false;

    // Swing state
    this.swingCooldown = 0;
    this.swingTimer = -1; // -1 = not swinging; else time since swing start
    this.swingSide = 1;   // +1 = right, -1 = left; alternates each swing
    this.swingHasHit = new Set(); // entities hit in this swing (dedup)

    this._bindEvents();
    this._buildHammer();
    this._placeAtRandomSidewalk();
  }

  _placeAtRandomSidewalk() {
    const p = this.city.pedSpawn();
    this.position.set(p.x, PLAYER_EYE_HEIGHT, p.z);
  }

  _bindEvents() {
    document.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === "w") this.keys.w = true;
      else if (k === "a") this.keys.a = true;
      else if (k === "s") this.keys.s = true;
      else if (k === "d") this.keys.d = true;
      else if (k === "shift") this.keys.shift = true;
    });
    document.addEventListener("keyup", (e) => {
      const k = e.key.toLowerCase();
      if (k === "w") this.keys.w = false;
      else if (k === "a") this.keys.a = false;
      else if (k === "s") this.keys.s = false;
      else if (k === "d") this.keys.d = false;
      else if (k === "shift") this.keys.shift = false;
    });
    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement !== null;
    });
    document.addEventListener("mousemove", (e) => {
      if (!this.locked) return;
      const sens = 0.0022;
      this.yaw -= e.movementX * sens;
      this.pitch -= e.movementY * sens;
      const clamp = Math.PI / 2 - 0.05;
      if (this.pitch > clamp) this.pitch = clamp;
      if (this.pitch < -clamp) this.pitch = -clamp;
    });
    document.addEventListener("mousedown", (e) => {
      if (!this.locked) return;
      if (e.button === 0) this._trySwing();
    });
  }

  _buildHammer() {
    // The hammer is attached to the camera so it stays in view. It has two
    // child groups: swingPivot (rotates for the swing animation) and the
    // hammer mesh (handle + head). We also expose hitbox meshes used only
    // for hit detection (not rendered).
    this.hammerHolder = new THREE.Group();
    this.hammerHolder.position.set(0.45, -0.45, -0.7); // right hand, slightly down/forward
    this.camera.add(this.hammerHolder);

    this.swingPivot = new THREE.Group();
    this.hammerHolder.add(this.swingPivot);

    // Rest pose: stick pointing back-up over shoulder
    this.hammerHolder.rotation.set(-0.3, -0.25, -0.3);

    const handleLen = 1.2;
    const handleGeo = new THREE.CylinderGeometry(0.04, 0.05, handleLen, 10);
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x5a3419, roughness: 0.75 });
    const handle = new THREE.Mesh(handleGeo, handleMat);
    // Orient handle so its long axis points along +y of swingPivot; we translate so the
    // grip end is near origin and head is up at +handleLen.
    handle.position.y = handleLen / 2;
    this.swingPivot.add(handle);

    const headGeo = new THREE.BoxGeometry(0.22, 0.22, 0.5);
    const headMat = new THREE.MeshStandardMaterial({ color: 0x303030, roughness: 0.4, metalness: 0.6 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = handleLen + 0.08;
    this.swingPivot.add(head);

    // Metallic bands on the head for visual pop
    const bandMat = new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.3, metalness: 0.8 });
    const band1 = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.52), bandMat);
    band1.position.copy(head.position); band1.position.y = head.position.y + 0.09;
    const band2 = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.52), bandMat);
    band2.position.copy(head.position); band2.position.y = head.position.y - 0.09;
    this.swingPivot.add(band1, band2);

    // Hit detection proxy meshes: we use their world matrices to build world-space AABBs each frame.
    // Not added to the scene (they just ride along with swingPivot).
    this.handleHitbox = new THREE.Mesh(new THREE.BoxGeometry(0.1, handleLen, 0.1));
    this.handleHitbox.position.y = handleLen / 2;
    this.handleHitbox.visible = false;
    this.swingPivot.add(this.handleHitbox);

    this.headHitbox = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.7));
    this.headHitbox.position.y = handleLen + 0.1;
    this.headHitbox.visible = false;
    this.swingPivot.add(this.headHitbox);
  }

  _trySwing() {
    if (this.state !== "alive") return;
    if (this.swingCooldown > 0) return;
    this.swingTimer = 0;
    this.swingCooldown = COOLDOWN;
    this.swingHasHit.clear();
    // Side flips next swing
  }

  getCooldownFraction() {
    return 1 - Math.max(0, this.swingCooldown) / COOLDOWN;
  }

  die() {
    this.state = "dead";
    this.respawnAt = performance.now() / 1000 + 5;
  }

  update(dt, world, now) {
    // Tick cooldowns / swing progress
    if (this.swingCooldown > 0) this.swingCooldown = Math.max(0, this.swingCooldown - dt);
    if (this.swingTimer >= 0) {
      this.swingTimer += dt;
      if (this.swingTimer > SWING_DURATION) {
        this.swingTimer = -1;
        this.swingSide *= -1;
      }
    }

    // Pose the swing pivot for animation
    this._updateSwingPose();

    if (this.state === "dead") {
      if (now > this.respawnAt) this._respawn();
      this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
      this.camera.position.copy(this.position);
      return;
    }

    // Movement input with opposite-key cancellation
    let fz = 0;
    if (this.keys.w) fz -= 1;
    if (this.keys.s) fz += 1;
    if (this.keys.w && this.keys.s) fz = 0; // explicit cancel
    let fx = 0;
    if (this.keys.d) fx += 1;
    if (this.keys.a) fx -= 1;
    if (this.keys.a && this.keys.d) fx = 0;

    const speed = this.keys.shift ? RUN_SPEED : WALK_SPEED;
    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    // Forward is -z in camera space with YXZ; but we use yaw on y-axis directly.
    // World forward vector = (-sin(yaw), 0, -cos(yaw))
    // Right vector = (cos(yaw), 0, -sin(yaw))
    const forwardX = -sin, forwardZ = -cos;
    const rightX = cos, rightZ = -sin;

    let vx = forwardX * fz + rightX * fx;
    let vz = forwardZ * fz + rightZ * fx;
    const mag = Math.hypot(vx, vz);
    if (mag > 0) { vx = (vx / mag) * speed; vz = (vz / mag) * speed; }

    this.position.x += vx * dt;
    this.position.z += vz * dt;

    // Collide with buildings
    for (const b of world.buildings) {
      const a = b.aabb;
      const cx = Math.max(a.minX, Math.min(this.position.x, a.maxX));
      const cz = Math.max(a.minZ, Math.min(this.position.z, a.maxZ));
      const dx = this.position.x - cx;
      const dz = this.position.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < this.radius * this.radius) {
        const d = Math.sqrt(d2) || 1e-5;
        this.position.x += (dx / d) * (this.radius - d + 0.001);
        this.position.z += (dz / d) * (this.radius - d + 0.001);
      }
    }

    // Keep in bounds
    const limit = world.halfGrid + 1;
    if (this.position.x > limit) this.position.x = limit;
    if (this.position.x < -limit) this.position.x = -limit;
    if (this.position.z > limit) this.position.z = limit;
    if (this.position.z < -limit) this.position.z = -limit;

    // Camera orientation + position
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    this.camera.position.copy(this.position);

    // Hit detection during active swing window
    if (this.swingTimer >= ACTIVE_START && this.swingTimer <= ACTIVE_END) {
      this._checkHammerHits();
    }
  }

  _respawn() {
    this.state = "alive";
    this._placeAtRandomSidewalk();
    this.velocity.set(0, 0, 0);
  }

  _updateSwingPose() {
    if (this.swingTimer < 0) {
      // Rest pose: hammer held over the shoulder (resting)
      this.swingPivot.rotation.set(-0.1, 0, this.swingSide > 0 ? -0.2 : 0.2);
      return;
    }
    const t = this.swingTimer / SWING_DURATION; // 0..1
    // Easing: ease-in then ease-out
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    // The hammer rotates around z (side swing) by ~2.2 radians and around x slightly
    // for a natural overhead-down arc. Side determined by swingSide.
    const startZ = this.swingSide > 0 ? -0.6 : 0.6;
    const endZ = this.swingSide > 0 ? 1.6 : -1.6;
    this.swingPivot.rotation.z = startZ + (endZ - startZ) * e;
    this.swingPivot.rotation.x = -0.2 + e * 0.9;
    this.swingPivot.rotation.y = (this.swingSide > 0 ? -0.3 : 0.3) * (1 - e);
  }

  _checkHammerHits() {
    // Build world AABBs for both hitboxes
    this.headHitbox.updateWorldMatrix(true, false);
    this.handleHitbox.updateWorldMatrix(true, false);
    const headBox = new THREE.Box3().setFromObject(this.headHitbox);
    const handleBox = new THREE.Box3().setFromObject(this.handleHitbox);
    // Expand slightly for forgiveness
    headBox.expandByScalar(0.05);
    handleBox.expandByScalar(0.05);

    this.onHammerHit({ headBox, handleBox, hits: this.swingHasHit });
  }
}
