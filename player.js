// SPegetti Slammer - main entry point.
// Scene / renderer / main loop / gameplay wiring.

import * as THREE from "three";
import { buildCity } from "./world.js";
import { Pedestrian, Car, Spaghetti, pushOutCircles, carHitsPed } from "./entities.js";
import { Player } from "./player.js";

const NUM_PEDESTRIANS = 140;
const NUM_CARS = 55;
const NUM_BOTS = 8;

// -------- DOM refs --------
const canvas = document.getElementById("game");
const menuEl = document.getElementById("menu");
const playBtn = document.getElementById("play-btn");
const footnote = document.querySelector("#menu .footnote");
const hudEl = document.getElementById("hud");
const killCountEl = document.getElementById("kill-count");
const bumpCountEl = document.getElementById("bump-count");
const cooldownBar = document.getElementById("cooldown-bar");
const cooldownLabel = document.getElementById("cooldown-label");
const deathOverlay = document.getElementById("death-overlay");
const respawnCountdown = document.getElementById("respawn-countdown");

// -------- Three.js bootstrap --------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
scene.add(camera);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight, false);
});

// -------- Build world --------
const city = buildCity(scene);

// -------- Entities --------
/** @type {Pedestrian[]} */
const pedestrians = [];
for (let i = 0; i < NUM_PEDESTRIANS; i++) pedestrians.push(new Pedestrian(city, scene));
/** @type {Pedestrian[]} */
const bots = [];
for (let i = 0; i < NUM_BOTS; i++) bots.push(new Pedestrian(city, scene, { isBot: true }));
/** @type {Car[]} */
const cars = [];
for (let i = 0; i < NUM_CARS; i++) cars.push(new Car(city, scene));

/** @type {Spaghetti[]} */
const spaghettis = [];

// -------- Score state --------
let killCount = 0;
let bumpCount = 0;

// -------- Helpers --------
const tmpBox = new THREE.Box3();

function boxIntersectsEntity(box, entity) {
  entity.getAABB(tmpBox);
  return box.intersectsBox(tmpBox);
}

function spaghettify(entity, isHuman = true) {
  const pos = entity.getPosition().clone();
  spaghettis.push(new Spaghetti(scene, pos, isHuman));
  entity.die();
  const now = performance.now() / 1000;
  entity.respawnAt = now + 5;
  killCount += 1;
  killCountEl.textContent = killCount;
}

function bumpEntity(entity, awayFrom) {
  const px = entity.getPosition();
  const dx = px.x - awayFrom.x;
  const dz = px.z - awayFrom.z;
  const d = Math.hypot(dx, dz) || 1e-5;
  if (entity.bump) {
    entity.bump(dx / d, dz / d, 7);
  } else {
    // For cars (no bump impl): nudge position slightly (they'll drift back)
    px.x += (dx / d) * 0.4;
    px.z += (dz / d) * 0.4;
  }
  bumpCount += 1;
  bumpCountEl.textContent = bumpCount;
}

// -------- Player --------
const player = new Player(camera, city, {
  onHammerHit: ({ headBox, handleBox, hits }) => {
    const playerPos = new THREE.Vector3(player.position.x, 0, player.position.z);

    // HEAD hits -> spaghetti
    const checkHead = (entity, isHuman) => {
      if (hits.has(entity)) return;
      if (entity.state === "dead") return;
      if (boxIntersectsEntity(headBox, entity)) {
        hits.add(entity);
        spaghettify(entity, isHuman);
        return true;
      }
      return false;
    };
    const checkHandle = (entity) => {
      if (hits.has(entity)) return;
      if (entity.state === "dead") return;
      if (boxIntersectsEntity(handleBox, entity)) {
        hits.add(entity);
        bumpEntity(entity, playerPos);
      }
    };

    for (const p of pedestrians) {
      if (checkHead(p, true)) continue;
      checkHandle(p);
    }
    for (const b of bots) {
      if (checkHead(b, true)) continue;
      checkHandle(b);
    }
    for (const c of cars) {
      if (hits.has(c) || c.state === "dead") continue;
      if (boxIntersectsEntity(headBox, c)) {
        hits.add(c);
        spaghettify(c, false);
      } else if (boxIntersectsEntity(handleBox, c)) {
        hits.add(c);
        bumpEntity(c, playerPos);
      }
    }
  },
});

// -------- Menu wiring --------
footnote.textContent = "Click to Play — then click the canvas to lock the mouse.";
playBtn.disabled = false;

playBtn.addEventListener("click", () => {
  menuEl.classList.add("hidden");
  hudEl.classList.remove("hidden");
  canvas.requestPointerLock();
});

canvas.addEventListener("click", () => {
  if (!document.pointerLockElement) canvas.requestPointerLock();
});

// Esc releases the pointer; user can click canvas to re-acquire.

// -------- Main loop --------
let last = performance.now() / 1000;
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now() / 1000;
  const dt = Math.min(0.05, now - last);
  last = now;

  // Update entities
  for (const p of pedestrians) p.update(dt, now);
  for (const b of bots) b.update(dt, now);
  for (const c of cars) c.update(dt, now);

  // Player
  player.update(dt, city, now);

  // Pedestrian/bot bump resolution (circle-circle push-out)
  const allHumans = [...pedestrians, ...bots];
  for (let i = 0; i < allHumans.length; i++) {
    const a = allHumans[i];
    if (a.state !== "alive") continue;
    // vs other humans (O(n^2) light enough for this count)
    for (let j = i + 1; j < allHumans.length; j++) {
      const b = allHumans[j];
      if (b.state !== "alive") continue;
      pushOutCircles(a.group.position, a.radius, b.group.position, b.radius, 1, 1);
    }
    // vs player
    if (player.state === "alive") {
      pushOutCircles(a.group.position, a.radius, player.position, player.radius, 1, 1.1);
    }
  }

  // Car-vs-human collisions -> spaghetti
  for (const c of cars) {
    if (c.state !== "alive") continue;
    for (const h of allHumans) {
      if (h.state !== "alive") continue;
      if (carHitsPed(c, h)) {
        spaghettify(h, true);
      }
    }
    // Car vs player
    if (player.state === "alive") {
      const fakePed = { group: { position: player.position }, radius: player.radius };
      if (carHitsPed(c, fakePed)) {
        player.die();
      }
    }
  }

  // Spaghetti physics / ttl
  for (let i = spaghettis.length - 1; i >= 0; i--) {
    if (!spaghettis[i].update(dt, now)) spaghettis.splice(i, 1);
  }

  // HUD updates
  const cd = player.getCooldownFraction();
  cooldownBar.style.width = `${Math.floor(cd * 100)}%`;
  cooldownLabel.textContent = cd >= 1 ? "Hammer Ready" : "Recharging...";

  if (player.state === "dead") {
    deathOverlay.classList.remove("hidden");
    const remain = Math.max(0, Math.ceil(player.respawnAt - now));
    respawnCountdown.textContent = remain;
  } else {
    deathOverlay.classList.add("hidden");
  }

  renderer.render(scene, camera);
}
animate();
