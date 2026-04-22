// World / city generator for SPegetti Slammer.
// Exports:
//   buildCity(scene) -> {
//     size, blockPitch, blockBuilding, roadWidth, sidewalkWidth,
//     buildings:  Array<{box: THREE.Box3, mesh}>,   // AABB colliders
//     sidewalks:  Array<AABB>,                      // walkable zones for pedestrians
//     roads:      Array<AABB>,                      // drivable zones for cars
//     crosswalks: Array<AABB>,                      // connects sidewalk lanes across roads
//     intersections: Array<{x,z,nRoad}>,            // intersection centers
//     pedPath:    function returns a random starting pose + direction on a sidewalk
//     carPath:    function returns a random starting pose + direction on a road lane
//     withinBounds(v) -> bool
//   }
//
// The city is a grid of blocks separated by roads. Each block has a central
// building footprint, sidewalks around it, and a road on every side. Crosswalks
// run across each road at every intersection.

import * as THREE from "three";

const BLOCKS = 12;               // 12x12 blocks
const BLOCK = 36;                // block pitch (building + 2x sidewalk)
const ROAD_W = 10;               // road width between blocks (2 lanes)
const SIDEWALK_W = 3.5;          // sidewalk width around each building
const BUILDING_SIZE = BLOCK - 2 * SIDEWALK_W; // building footprint size
const LANE_OFFSET = ROAD_W / 4;  // center of each lane, offset from road midline

const PITCH = BLOCK + ROAD_W;    // block-to-block distance
const HALF_GRID = (BLOCKS * PITCH) / 2;

export const CITY_CONSTANTS = {
  BLOCKS, BLOCK, ROAD_W, SIDEWALK_W, BUILDING_SIZE, LANE_OFFSET, PITCH, HALF_GRID,
};

function makeAABB(minX, minZ, maxX, maxZ) {
  return { minX, minZ, maxX, maxZ };
}
function aabbContains(a, x, z) {
  return x >= a.minX && x <= a.maxX && z >= a.minZ && z <= a.maxZ;
}

export function buildCity(scene) {
  const buildings = [];
  const sidewalks = [];
  const roads = [];
  const crosswalks = [];
  const intersections = [];

  // -------- Ground --------
  const groundSize = BLOCKS * PITCH + ROAD_W * 4;
  const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 1 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // -------- Shared materials --------
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.9 });
  const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.95 });
  const crosswalkMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.9 });
  const laneLineMat = new THREE.MeshBasicMaterial({ color: 0xf7d65a });

  // -------- Roads (horizontal + vertical strips) --------
  // Block centers run along each axis at blockCenter(i) = -HALF_GRID + PITCH/2 + i*PITCH
  // for i in [0, BLOCKS-1]. Roads run BETWEEN blocks (and along the outer ring) with
  // centers at roadCenter(k) = -HALF_GRID + k * PITCH for k in [0, BLOCKS].
  const blockCenter = (i) => -HALF_GRID + PITCH / 2 + i * PITCH;
  const roadCenter = (i) => -HALF_GRID + i * PITCH;

  // Horizontal roads (extend along x, cross at each z=roadCenter(j))
  for (let j = 0; j <= BLOCKS; j++) {
    const zc = roadCenter(j);
    const length = BLOCKS * PITCH + ROAD_W; // a bit wider for continuity
    const geo = new THREE.PlaneGeometry(length, ROAD_W);
    const m = new THREE.Mesh(geo, roadMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, 0.01, zc);
    m.receiveShadow = true;
    scene.add(m);
    roads.push(makeAABB(-length / 2, zc - ROAD_W / 2, length / 2, zc + ROAD_W / 2));

    // Dashed yellow lane line down the middle
    for (let t = -length / 2 + 2; t < length / 2; t += 4) {
      const dashGeo = new THREE.PlaneGeometry(2, 0.15);
      const dash = new THREE.Mesh(dashGeo, laneLineMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(t + 1, 0.02, zc);
      scene.add(dash);
    }
  }
  // Vertical roads
  for (let i = 0; i <= BLOCKS; i++) {
    const xc = roadCenter(i);
    const length = BLOCKS * PITCH + ROAD_W;
    const geo = new THREE.PlaneGeometry(ROAD_W, length);
    const m = new THREE.Mesh(geo, roadMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(xc, 0.01, 0);
    m.receiveShadow = true;
    scene.add(m);
    roads.push(makeAABB(xc - ROAD_W / 2, -length / 2, xc + ROAD_W / 2, length / 2));

    for (let t = -length / 2 + 2; t < length / 2; t += 4) {
      const dashGeo = new THREE.PlaneGeometry(0.15, 2);
      const dash = new THREE.Mesh(dashGeo, laneLineMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(xc, 0.02, t + 1);
      scene.add(dash);
    }
  }

  // -------- Intersections list --------
  for (let j = 0; j <= BLOCKS; j++) {
    for (let i = 0; i <= BLOCKS; i++) {
      intersections.push({ x: roadCenter(i), z: roadCenter(j) });
    }
  }

  // -------- Crosswalks (stripes at each intersection, each of 4 sides) --------
  const crosswalkStripeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const it of intersections) {
    // N, S, E, W crosswalks. Each crosswalk lies JUST outside the intersection on each road, i.e. on the sidewalk side.
    // Crosswalk bounding box length = ROAD_W (across the road), width = SIDEWALK_W (along the sidewalk).
    const cwOffsets = [
      { dx: 0, dz: +ROAD_W / 2 + SIDEWALK_W / 2, w: ROAD_W, d: SIDEWALK_W, vertical: false },
      { dx: 0, dz: -ROAD_W / 2 - SIDEWALK_W / 2, w: ROAD_W, d: SIDEWALK_W, vertical: false },
      { dx: +ROAD_W / 2 + SIDEWALK_W / 2, dz: 0, w: SIDEWALK_W, d: ROAD_W, vertical: true },
      { dx: -ROAD_W / 2 - SIDEWALK_W / 2, dz: 0, w: SIDEWALK_W, d: ROAD_W, vertical: true },
    ];
    for (const cw of cwOffsets) {
      const cx = it.x + cw.dx;
      const cz = it.z + cw.dz;
      if (Math.abs(cx) > HALF_GRID + 0.1 || Math.abs(cz) > HALF_GRID + 0.1) continue;
      crosswalks.push(makeAABB(cx - cw.w / 2, cz - cw.d / 2, cx + cw.w / 2, cz + cw.d / 2));

      // Paint stripes
      const stripes = 5;
      for (let s = 0; s < stripes; s++) {
        const f = (s + 0.5) / stripes;
        if (cw.vertical) {
          const sz = cw.d * (f - 0.5);
          const g = new THREE.PlaneGeometry(cw.w * 0.85, cw.d / stripes * 0.55);
          const m = new THREE.Mesh(g, crosswalkStripeMat);
          m.rotation.x = -Math.PI / 2;
          m.position.set(cx, 0.025, cz + sz);
          scene.add(m);
        } else {
          const sx = cw.w * (f - 0.5);
          const g = new THREE.PlaneGeometry(cw.w / stripes * 0.55, cw.d * 0.85);
          const m = new THREE.Mesh(g, crosswalkStripeMat);
          m.rotation.x = -Math.PI / 2;
          m.position.set(cx + sx, 0.025, cz);
          scene.add(m);
        }
      }
    }
  }

  // -------- Per-block sidewalks + building --------
  const buildingGeoCache = {};
  function getBuildingMaterial(seed) {
    const hue = (seed * 137.1) % 360;
    const col = new THREE.Color(`hsl(${Math.floor(hue)}, 15%, ${35 + (seed % 7) * 3}%)`);
    return new THREE.MeshStandardMaterial({ color: col, roughness: 0.85 });
  }

  for (let bj = 0; bj < BLOCKS; bj++) {
    for (let bi = 0; bi < BLOCKS; bi++) {
      const cx = blockCenter(bi);
      const cz = blockCenter(bj);

      // Sidewalk pad (whole block top)
      const padGeo = new THREE.PlaneGeometry(BLOCK, BLOCK);
      const pad = new THREE.Mesh(padGeo, sidewalkMat);
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(cx, 0.02, cz);
      pad.receiveShadow = true;
      scene.add(pad);
      sidewalks.push(makeAABB(cx - BLOCK / 2, cz - BLOCK / 2, cx + BLOCK / 2, cz + BLOCK / 2));

      // Building
      const seed = bi * 31 + bj * 97;
      const height = 10 + (seed % 30);
      const key = `${BUILDING_SIZE}-${BUILDING_SIZE}-${height}`;
      if (!buildingGeoCache[key]) buildingGeoCache[key] = new THREE.BoxGeometry(BUILDING_SIZE, height, BUILDING_SIZE);
      const mat = getBuildingMaterial(seed);
      const bmesh = new THREE.Mesh(buildingGeoCache[key], mat);
      bmesh.position.set(cx, height / 2, cz);
      bmesh.castShadow = true;
      bmesh.receiveShadow = true;
      scene.add(bmesh);

      // Window decals: create a small emissive detail via a lighter top strip
      const roofGeo = new THREE.BoxGeometry(BUILDING_SIZE, 0.4, BUILDING_SIZE);
      const roofMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 1 });
      const roof = new THREE.Mesh(roofGeo, roofMat);
      roof.position.set(cx, height + 0.2, cz);
      scene.add(roof);

      // Building as AABB collider (shrunken 0.1 to avoid wall-hug glitches)
      const bbMin = new THREE.Vector3(cx - BUILDING_SIZE / 2, 0, cz - BUILDING_SIZE / 2);
      const bbMax = new THREE.Vector3(cx + BUILDING_SIZE / 2, height, cz + BUILDING_SIZE / 2);
      buildings.push({
        box: new THREE.Box3(bbMin, bbMax),
        aabb: makeAABB(bbMin.x, bbMin.z, bbMax.x, bbMax.z),
        mesh: bmesh,
      });
    }
  }

  // -------- Helper: pick a random pedestrian starting position on a sidewalk --------
  function pedSpawn() {
    // Pick a random block, then a position in the sidewalk ring (not on building footprint).
    while (true) {
      const bi = Math.floor(Math.random() * BLOCKS);
      const bj = Math.floor(Math.random() * BLOCKS);
      const cx = blockCenter(bi);
      const cz = blockCenter(bj);
      // Pick a side 0..3 of the block to walk along
      const side = Math.floor(Math.random() * 4);
      const offset = (Math.random() - 0.5) * (BLOCK - SIDEWALK_W);
      const sidewalkCenter = BLOCK / 2 - SIDEWALK_W / 2;
      let x, z, dirX, dirZ;
      if (side === 0) {       // north edge
        x = cx + offset; z = cz - sidewalkCenter;
        dirX = Math.random() < 0.5 ? 1 : -1; dirZ = 0;
      } else if (side === 1) {// south edge
        x = cx + offset; z = cz + sidewalkCenter;
        dirX = Math.random() < 0.5 ? 1 : -1; dirZ = 0;
      } else if (side === 2) {// east edge
        x = cx + sidewalkCenter; z = cz + offset;
        dirX = 0; dirZ = Math.random() < 0.5 ? 1 : -1;
      } else {                // west edge
        x = cx - sidewalkCenter; z = cz + offset;
        dirX = 0; dirZ = Math.random() < 0.5 ? 1 : -1;
      }
      return { x, z, dirX, dirZ };
    }
  }

  // -------- Helper: pick a random car starting position on a road lane --------
  function carSpawn() {
    // Pick a horizontal or vertical road, then a lane direction.
    const horizontal = Math.random() < 0.5;
    if (horizontal) {
      const j = Math.floor(Math.random() * (BLOCKS + 1));
      const zc = roadCenter(j);
      // Lane: traveling +x is on z = zc + LANE_OFFSET; -x on z = zc - LANE_OFFSET.
      const goPos = Math.random() < 0.5;
      const z = zc + (goPos ? LANE_OFFSET : -LANE_OFFSET);
      const x = (Math.random() - 0.5) * (BLOCKS * PITCH - 10);
      return { x, z, dirX: goPos ? 1 : -1, dirZ: 0 };
    } else {
      const i = Math.floor(Math.random() * (BLOCKS + 1));
      const xc = roadCenter(i);
      const goPos = Math.random() < 0.5;
      const x = xc + (goPos ? -LANE_OFFSET : LANE_OFFSET); // drive on right side: +z goes on x = xc - LANE_OFFSET
      const z = (Math.random() - 0.5) * (BLOCKS * PITCH - 10);
      return { x, z, dirX: 0, dirZ: goPos ? 1 : -1 };
    }
  }

  function isOnSidewalkOrCrosswalk(x, z) {
    for (const sw of sidewalks) if (aabbContains(sw, x, z)) return true;
    for (const cw of crosswalks) if (aabbContains(cw, x, z)) return true;
    return false;
  }
  function isOnRoad(x, z) {
    for (const r of roads) if (aabbContains(r, x, z)) return true;
    return false;
  }
  function withinBounds(x, z) {
    return Math.abs(x) < HALF_GRID + 2 && Math.abs(z) < HALF_GRID + 2;
  }

  // Outer lighting (hemispheric + directional sun)
  const hemi = new THREE.HemisphereLight(0xcfe9ff, 0x3a2a1a, 0.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(60, 120, 40);
  sun.castShadow = false;
  scene.add(sun);
  scene.background = new THREE.Color(0x89b4d6);
  scene.fog = new THREE.Fog(0x89b4d6, 160, 520);

  return {
    blocks: BLOCKS,
    pitch: PITCH,
    block: BLOCK,
    roadWidth: ROAD_W,
    sidewalkWidth: SIDEWALK_W,
    buildings,
    sidewalks,
    roads,
    crosswalks,
    intersections,
    halfGrid: HALF_GRID,
    roadCenter, blockCenter,
    pedSpawn, carSpawn,
    isOnSidewalkOrCrosswalk, isOnRoad, withinBounds,
  };
}
