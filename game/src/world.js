// EMBERLINE map: "Ember Yard", a bright daylight freight yard, 52 x 38 m.
// Revised layout (not the practice Yard 7): A-long's long sightline is broken
// by staggered crates, mid has double doors plus a peek window, B-short is a
// zigzag of corners, each site has a guardhouse and a clear plant spot, and a
// warehouse in the west-centre is enterable (two doors, two windows, roof).
// Collision is axis-aligned boxes; movement is circle-vs-AABB with slide
// (player.js). All geometry data is plain numbers so Node tests can import
// the nav graph without THREE; createWorld() builds the meshes.

import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createTextures } from './textures.js';

// --- nav graph: name -> [x, z] (metres, y = 0 ground) ---
export const NAV_NODES = {
  emberSpawn: [0, 16],
  aLong1: [-22, 11],
  aLong2: [-22, 5],
  aLong3: [-22, -2],
  aLong4: [-22, -8],
  aEntry: [-20, -10],
  siteA: [-19, -13],
  whDoorS: [-11, 3.5],
  wh1: [-11, 0],
  wh2: [-11, -4],
  whDoorN: [-11, -7.5],
  mid1: [0, 11],
  mid2: [0, 6],
  mid3: [0, -1],
  mid4: [0, -7],
  midA: [-10, -11],
  midB: [10, -11],
  bShort1: [20, 13],
  bShort2: [15.5, 13],
  bShort3: [15.5, 3],
  bShort4: [15.5, -4.5],
  bShort5: [19, -5],
  bEntry: [18, -10],
  siteB: [17, -13],
  ashSpawn: [0, -16],
  ashA: [-9, -15],
  ashB: [9, -15],
};

export const NAV_EDGES = [
  ['emberSpawn', 'aLong1'],
  ['aLong1', 'aLong2'],
  ['aLong2', 'aLong3'],
  ['aLong3', 'aLong4'],
  ['aLong4', 'aEntry'],
  ['aEntry', 'siteA'],
  ['emberSpawn', 'mid1'],
  ['mid1', 'mid2'],
  ['mid2', 'mid3'],
  ['mid3', 'mid4'],
  ['mid4', 'midA'],
  ['mid4', 'midB'],
  ['midA', 'siteA'],
  ['midB', 'siteB'],
  ['emberSpawn', 'bShort1'],
  ['bShort1', 'bShort2'],
  ['bShort2', 'bShort3'],
  ['bShort3', 'bShort4'],
  ['bShort4', 'bShort5'],
  ['bShort5', 'bEntry'],
  ['bEntry', 'siteB'],
  ['siteA', 'ashA'],
  ['siteB', 'ashB'],
  ['ashA', 'ashSpawn'],
  ['ashB', 'ashSpawn'],
  ['midA', 'ashA'],
  ['midB', 'ashB'],
  ['aLong1', 'mid1'],
  ['aLong2', 'whDoorS'],
  ['mid2', 'whDoorS'],
  ['whDoorS', 'wh1'],
  ['wh1', 'wh2'],
  ['wh2', 'whDoorN'],
  ['whDoorN', 'midA'],
  ['whDoorN', 'aEntry'],
  ['midA', 'aEntry'],
];

const ADJ = {};
for (const name of Object.keys(NAV_NODES)) ADJ[name] = [];
for (const [a, b] of NAV_EDGES) {
  ADJ[a].push(b);
  ADJ[b].push(a);
}

export function bfsPath(from, to) {
  if (!NAV_NODES[from] || !NAV_NODES[to]) return null;
  if (from === to) return [from];
  const prev = { [from]: null };
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift();
    for (const next of ADJ[cur]) {
      if (prev[next] !== undefined) continue;
      prev[next] = cur;
      if (next === to) {
        const path = [to];
        let node = to;
        while (prev[node] !== null) {
          node = prev[node];
          path.unshift(node);
        }
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

export function nearestNode(x, z) {
  let best = null;
  let bestD = Infinity;
  for (const [name, [nx, nz]] of Object.entries(NAV_NODES)) {
    const d = (nx - x) * (nx - x) + (nz - z) * (nz - z);
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  }
  return best;
}

export const SITES = {
  A: { x: -18.5, z: -12.5, r: 3.5 },
  B: { x: 17, z: -12.5, r: 3.5 },
};

export const EMBER_SPAWNS = [[0, 16], [-2, 16.5], [2, 16.5], [-4, 15], [4, 15]];
export const ASHFALL_SPAWNS = [[0, -16], [-2, -16.5], [2, -16.5], [-4, -15], [4, -15]];

// Burning barrels / braziers: [x, y, z] of the flame base.
export const FIRE_SPOTS = [
  [2.5, 1.0, 4.5], // mid barrel
  [-13.5, 1.0, -4.5], // warehouse barrel
  [15.5, 1.0, -9.5], // B site barrel
  [-16, 1.0, -10.5], // A site barrel
  [-3, 0.9, 17.5], // Ember spawn brazier
];

// Colliders as plain [minX, minY, minZ, maxX, maxY, maxZ] so the mover and
// the tests share one source of truth. Filled by buildColliders() below.
export const COLLIDERS = [];

function solid(x0, y0, z0, x1, y1, z1) {
  COLLIDERS.push([x0, y0, z0, x1, y1, z1]);
}

// Box described by centre + size; returns its AABB.
function solidBox(cx, cy, cz, w, h, d) {
  solid(cx - w / 2, cy - h / 2, cz - d / 2, cx + w / 2, cy + h / 2, cz + d / 2);
}

export function buildColliders() {
  COLLIDERS.length = 0;
  // Ground slab.
  solid(-26.5, -0.4, -19.5, 26.5, 0, 19.5);
  // Perimeter walls (h 4.5, t 0.6).
  solidBox(-26.3, 2.25, 0, 0.6, 4.5, 39.6);
  solidBox(26.3, 2.25, 0, 0.6, 4.5, 39.6);
  solidBox(0, 2.25, -19.3, 53.2, 4.5, 0.6);
  solidBox(0, 2.25, 19.3, 53.2, 4.5, 0.6);
  // --- Warehouse (x -15..-5, z -6..2, h 3.6, t 0.4) ---
  solidBox(-15, 1.8, -2, 0.4, 3.6, 8); // west wall
  solidBox(-5, 0.55, -2, 0.4, 1.1, 8); // east wall, bottom strip
  solidBox(-5, 2.85, -2, 0.4, 1.5, 8); // east wall, top strip
  solidBox(-5, 1.6, -5.25, 0.4, 1.0, 1.5); // east pillar N
  solidBox(-5, 1.6, -1.7, 0.4, 1.0, 2.4); // east pillar mid
  solidBox(-5, 1.6, 1.55, 0.4, 1.0, 0.9); // east pillar S
  solidBox(-13.75, 1.8, 2, 2.5, 3.6, 0.4); // south wall W
  solidBox(-7.25, 1.8, 2, 4.5, 3.6, 0.4); // south wall E
  solidBox(-13.75, 1.8, -6, 2.5, 3.6, 0.4); // north wall W
  solidBox(-7.25, 1.8, -6, 4.5, 3.6, 0.4); // north wall E
  solidBox(-10, 3.75, -2, 10.4, 0.3, 8.4); // roof slab
  solidBox(-12.5, 0.6, -3.5, 1.2, 1.2, 1.2); // interior crate
  solidBox(-7, 0.6, 0.5, 1.2, 1.2, 1.2); // interior crate
  solidBox(-7, 1.8, 0.5, 1.2, 1.2, 1.2); // stacked crate
  solidBox(-13.5, 0.5, -4.5, 0.7, 1.0, 0.7); // burning barrel
  // --- Mid wall (z=2, x -5..7): double doors + peek window ---
  solidBox(-3.25, 1.8, 2, 3.5, 3.6, 0.4);
  solidBox(2.35, 1.8, 2, 1.7, 3.6, 0.4);
  solidBox(4, 0.55, 2, 1.6, 1.1, 0.4); // under window
  solidBox(4, 2.85, 2, 1.6, 1.5, 0.4); // over window
  solidBox(5.9, 1.8, 2, 2.2, 3.6, 0.4);
  solidBox(0, 3.3, 2, 3, 0.6, 0.4); // door lintel
  // --- B-short zigzag walls (h 3.0, t 0.8) ---
  solidBox(17.5, 1.5, 9, 0.8, 3, 6);
  solidBox(21, 1.5, 5.5, 6, 3, 0.8);
  solidBox(21.5, 1.5, 1, 0.8, 3, 6);
  solidBox(18.5, 1.5, -2.5, 5, 3, 0.8);
  // --- A-long staggered crates + container wall ---
  solidBox(-23.3, 0.7, 8, 1.4, 1.4, 1.4);
  solidBox(-21, 0.6, 3, 1.2, 1.2, 1.2);
  solidBox(-21, 1.8, 3, 1.2, 1.2, 1.2);
  solidBox(-23.5, 0.7, -3, 1.4, 1.4, 1.4);
  solidBox(-20.5, 0.5, -7, 1.0, 1.0, 1.0);
  solidBox(-24, 1.3, -10, 2.4, 2.6, 6); // container wall
  // --- Site A: container stack + guardhouse ---
  solidBox(-19, 1.3, -15.5, 6, 2.6, 2.4);
  solidBox(-21.5, 3.9, -14, 2.4, 2.6, 6);
  solidBox(-14, 1.3, -18, 3, 2.6, 0.4); // guardhouse N
  solidBox(-15.5, 1.3, -16.5, 0.4, 2.6, 3); // guardhouse W
  solidBox(-14.05, 1.3, -15, 0.9, 2.6, 0.4); // guardhouse S west
  solidBox(-12.95, 1.3, -15, 0.9, 2.6, 0.4); // guardhouse S east (door gap between)
  solidBox(-12.5, 0.55, -16.5, 0.4, 1.1, 3); // guardhouse E bottom
  solidBox(-12.5, 2.05, -16.5, 0.4, 1.1, 3); // guardhouse E top
  solidBox(-12.5, 1.6, -17.7, 0.4, 1.0, 0.6); // guardhouse E pillar N
  solidBox(-12.5, 1.6, -15.6, 0.4, 1.0, 0.6); // guardhouse E pillar S
  solidBox(-14, 2.7, -16.5, 3.4, 0.3, 3.4); // guardhouse roof
  // --- Site B: silo + guardhouse + crates ---
  solidBox(21, 2.5, -13, 4.4, 5, 4.4); // silo (AABB approx of the cylinder)
  solidBox(14, 1.3, -18, 3, 2.6, 0.4);
  solidBox(15.5, 1.3, -16.5, 0.4, 2.6, 3);
  solidBox(14.95, 1.3, -15, 0.9, 2.6, 0.4);
  solidBox(13.85, 1.3, -15, 0.9, 2.6, 0.4);
  solidBox(12.5, 0.55, -16.5, 0.4, 1.1, 3);
  solidBox(12.5, 2.05, -16.5, 0.4, 1.1, 3);
  solidBox(12.5, 1.6, -17.7, 0.4, 1.0, 0.6);
  solidBox(12.5, 1.6, -15.6, 0.4, 1.0, 0.6);
  solidBox(14, 2.7, -16.5, 3.4, 0.3, 3.4);
  solidBox(15, 0.6, -10, 1.2, 1.2, 1.2);
  solidBox(19.5, 0.7, -16, 1.4, 1.4, 1.4);
  solidBox(15.5, 0.5, -9.5, 0.7, 1.0, 0.7); // B burning barrel
  solidBox(-16, 0.5, -10.5, 0.7, 1.0, 0.7); // A burning barrel
  solidBox(2.5, 0.5, 4.5, 0.7, 1.0, 0.7); // mid burning barrel
  solidBox(-3, 0.35, 17.5, 1.1, 0.7, 1.1); // Ember spawn brazier
  // --- Crane (legs only collide; jib is high) ---
  solidBox(11, 3, 2, 0.8, 6, 0.8);
  solidBox(13, 3, 2, 0.8, 6, 0.8);
  // --- Catwalk along the north wall (deck + pillars) ---
  solidBox(0, 3.1, -17.6, 16, 0.25, 1.2);
  for (const px of [-8, -4, 0, 4, 8]) solidBox(px, 1.5, -17.6, 0.3, 3, 0.3);
  // --- Spawn cover walls ---
  solidBox(0, 0.55, 14, 4, 1.1, 0.6);
  solidBox(0, 0.55, -14, 4, 1.1, 0.6);
  // --- Scattered yard crates ---
  solidBox(6, 0.6, 8, 1.2, 1.2, 1.2);
  solidBox(-6, 0.5, 9, 1.0, 1.0, 1.0);
  solidBox(8, 0.7, -4, 1.4, 1.4, 1.4);
  solidBox(-3, 0.6, -9, 1.2, 1.2, 1.2);
  return COLLIDERS;
}

buildColliders();

// One texture tile covers TILE_M metres: box UVs are scaled per face so a
// brick stays brick-sized on a 52 m wall and on a 1.2 m crate.
const TILE_M = 2;
function scaleBoxUVs(geo, w, h, d) {
  const uv = geo.attributes.uv;
  // BoxGeometry faces in order: +x, -x, +y, -y, +z, -z (4 verts each).
  const faceSize = [
    [d, h], [d, h], [w, d], [w, d], [w, h], [w, h],
  ];
  for (let f = 0; f < 6; f += 1) {
    const [fw, fh] = faceSize[f];
    for (let v = 0; v < 4; v += 1) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * (fw / TILE_M), uv.getY(i) * (fh / TILE_M));
    }
  }
}

export function createWorld(scene) {
  const tex = createTextures(THREE);
  const group = new THREE.Group();
  scene.add(group);

  const flat = (hex, rough = 0.92, metal = 0.03) =>
    new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: rough, metalness: metal });
  const mats = {
    ground: tex.floor
      ? new THREE.MeshStandardMaterial({ map: tex.floor, color: 0xffffff, roughness: 0.95 })
      : flat(PALETTE.surface),
    brick: tex.brick
      ? new THREE.MeshStandardMaterial({ map: tex.brick, color: 0xffffff, roughness: 0.9 })
      : flat(PALETTE.brick),
    concrete: tex.concrete
      ? new THREE.MeshStandardMaterial({ map: tex.concrete, color: 0xffffff, roughness: 0.95 })
      : flat('#b9b3a6'),
    wood: tex.wood
      ? new THREE.MeshStandardMaterial({ map: tex.wood, color: 0xffffff, roughness: 0.9 })
      : flat(PALETTE.hairline),
    rust: tex.corrugated
      ? new THREE.MeshStandardMaterial({ map: tex.corrugated, color: 0xc96f3a, roughness: 0.75, metalness: 0.25 })
      : flat(PALETTE.rust, 0.7, 0.3),
    teal: tex.corrugated
      ? new THREE.MeshStandardMaterial({ map: tex.corrugated, color: 0x4fa8a0, roughness: 0.75, metalness: 0.25 })
      : flat('#4fa8a0', 0.7, 0.3),
    amber: tex.corrugated
      ? new THREE.MeshStandardMaterial({ map: tex.corrugated, color: 0xe8a13a, roughness: 0.75, metalness: 0.25 })
      : flat(PALETTE.accent, 0.7, 0.3),
    steel: flat(PALETTE.muted, 0.55, 0.5),
    dark: flat(PALETTE.ink, 0.8, 0.1),
    hazard: tex.hazard
      ? new THREE.MeshStandardMaterial({ map: tex.hazard, color: 0xffffff, roughness: 0.85 })
      : flat(PALETTE.accent),
  };

  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, material, opts = {}) {
    const geo = new THREE.BoxGeometry(w, h, d);
    if (material.map) scaleBoxUVs(geo, w, h, d);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (opts.shoot !== false) shootables.push(mesh);
    if (opts.collide !== false) {
      colliders.push(new THREE.Box3(
        new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2),
        new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2),
      ));
    }
    return mesh;
  }

  function cyl(rt, rb, h, x, y, z, material, segments = 20) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, segments), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    shootables.push(mesh);
    return mesh;
  }

  function signPlane(texMap, w, h, x, y, z, ry) {
    if (!texMap) return;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: texMap, transparent: true }),
    );
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    group.add(mesh);
  }

  // Ground.
  const groundGeo = new THREE.BoxGeometry(53, 0.4, 39);
  if (mats.ground.map) {
    const uv = groundGeo.attributes.uv;
    for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * (53 / TILE_M), uv.getY(i) * (39 / TILE_M));
  }
  const ground = new THREE.Mesh(groundGeo, mats.ground);
  ground.position.set(0, -0.2, 0);
  ground.receiveShadow = true;
  group.add(ground);
  shootables.push(ground);

  // Perimeter walls (brick outside face, concrete inside is overkill — brick).
  box(0.6, 4.5, 39.6, -26.3, 2.25, 0, mats.brick);
  box(0.6, 4.5, 39.6, 26.3, 2.25, 0, mats.brick);
  box(53.2, 4.5, 0.6, 0, 2.25, -19.3, mats.brick);
  box(53.2, 4.5, 0.6, 0, 2.25, 19.3, mats.brick);
  // Hazard trim along the base of the north wall.
  box(53.2, 0.3, 0.1, 0, 0.15, -18.95, mats.hazard, { collide: false });

  // Warehouse: concrete shell, corrugated roof, wooden door frames.
  box(0.4, 3.6, 8, -15, 1.8, -2, mats.concrete);
  box(0.4, 1.1, 8, -5, 0.55, -2, mats.concrete);
  box(0.4, 1.5, 8, -5, 2.85, -2, mats.concrete);
  box(0.4, 1.0, 1.5, -5, 1.6, -5.25, mats.concrete);
  box(0.4, 1.0, 2.4, -5, 1.6, -1.7, mats.concrete);
  box(0.4, 1.0, 0.9, -5, 1.6, 1.55, mats.concrete);
  box(2.5, 3.6, 0.4, -13.75, 1.8, 2, mats.concrete);
  box(4.5, 3.6, 0.4, -7.25, 1.8, 2, mats.concrete);
  box(2.5, 3.6, 0.4, -13.75, 1.8, -6, mats.concrete);
  box(4.5, 3.6, 0.4, -7.25, 1.8, -6, mats.concrete);
  box(10.4, 0.3, 8.4, -10, 3.75, -2, mats.rust); // roof
  box(10.4, 0.5, 0.25, -10, 4.05, -6.1, mats.dark, { collide: false }); // parapet N
  box(10.4, 0.5, 0.25, -10, 4.05, 2.1, mats.dark, { collide: false }); // parapet S
  box(0.25, 0.5, 8.4, -15.1, 4.05, -2, mats.dark, { collide: false });
  box(0.25, 0.5, 8.4, -4.9, 4.05, -2, mats.dark, { collide: false });
  // Warehouse interior crates (wood).
  box(1.2, 1.2, 1.2, -12.5, 0.6, -3.5, mats.wood);
  box(1.2, 1.2, 1.2, -7, 0.6, 0.5, mats.wood);
  box(1.2, 1.2, 1.2, -7, 1.8, 0.5, mats.wood);
  // Hazard strips framing the warehouse doors.
  box(0.5, 0.25, 0.45, -12.5, 3.35, 2, mats.hazard, { collide: false });
  box(0.5, 0.25, 0.45, -9.5, 3.35, 2, mats.hazard, { collide: false });

  // Mid wall: brick, double doors (open gap) + peek window.
  box(3.5, 3.6, 0.4, -3.25, 1.8, 2, mats.brick);
  box(1.7, 3.6, 0.4, 2.35, 1.8, 2, mats.brick);
  box(1.6, 1.1, 0.4, 4, 0.55, 2, mats.brick);
  box(1.6, 1.5, 0.4, 4, 2.85, 2, mats.brick);
  box(2.2, 3.6, 0.4, 5.9, 1.8, 2, mats.brick);
  box(3, 0.6, 0.4, 0, 3.3, 2, mats.wood); // door lintel
  // Door leaves, swung open against the wall.
  const doorL = box(0.12, 3.0, 1.4, -1.7, 1.5, 2.6, mats.steel, { collide: false });
  doorL.rotation.y = 0.5;
  const doorR = box(0.12, 3.0, 1.4, 1.7, 1.5, 2.6, mats.steel, { collide: false });
  doorR.rotation.y = -0.5;

  // B-short zigzag.
  box(0.8, 3, 6, 17.5, 1.5, 9, mats.brick);
  box(6, 3, 0.8, 21, 1.5, 5.5, mats.brick);
  box(0.8, 3, 6, 21.5, 1.5, 1, mats.brick);
  box(5, 3, 0.8, 18.5, 1.5, -2.5, mats.brick);

  // A-long: staggered wooden crates + a rust container wall.
  box(1.4, 1.4, 1.4, -23.3, 0.7, 8, mats.wood);
  box(1.2, 1.2, 1.2, -21, 0.6, 3, mats.wood);
  box(1.2, 1.2, 1.2, -21, 1.8, 3, mats.wood);
  box(1.4, 1.4, 1.4, -23.5, 0.7, -3, mats.wood);
  box(1.0, 1.0, 1.0, -20.5, 0.5, -7, mats.wood);
  box(2.4, 2.6, 6, -24, 1.3, -10, mats.rust);

  // Site A: container stack.
  box(6, 2.6, 2.4, -19, 1.3, -15.5, mats.amber);
  box(2.4, 2.6, 6, -21.5, 3.9, -14, mats.teal);
  signPlane(tex.signA, 2.2, 2.2, -19, 2.2, -14.25, 0);
  signPlane(tex.signA, 2.2, 2.2, -22.7, 1.4, -14, Math.PI / 2);

  // Site A guardhouse (concrete, door south, window east).
  box(3, 2.6, 0.4, -14, 1.3, -18, mats.concrete);
  box(0.4, 2.6, 3, -15.5, 1.3, -16.5, mats.concrete);
  box(0.9, 2.6, 0.4, -14.05, 1.3, -15, mats.concrete);
  box(0.9, 2.6, 0.4, -12.95, 1.3, -15, mats.concrete);
  box(0.4, 1.1, 3, -12.5, 0.55, -16.5, mats.concrete);
  box(0.4, 1.1, 3, -12.5, 2.05, -16.5, mats.concrete);
  box(0.4, 1.0, 0.6, -12.5, 1.6, -17.7, mats.concrete);
  box(0.4, 1.0, 0.6, -12.5, 1.6, -15.6, mats.concrete);
  box(3.4, 0.3, 3.4, -14, 2.7, -16.5, mats.rust);

  // Site B: silo + guardhouse + crates.
  cyl(2.2, 2.2, 5, 21, 2.5, -13, mats.teal, 24);
  cyl(2.35, 2.35, 0.5, 21, 5.1, -13, mats.dark, 24);
  colliders.push(new THREE.Box3(new THREE.Vector3(18.8, 0, -15.2), new THREE.Vector3(23.2, 5, -10.8))); // silo AABB
  signPlane(tex.signB, 2.2, 2.2, 17, 2.2, -10.6, Math.PI);
  box(3, 2.6, 0.4, 14, 1.3, -18, mats.concrete);
  box(0.4, 2.6, 3, 15.5, 1.3, -16.5, mats.concrete);
  box(0.9, 2.6, 0.4, 14.95, 1.3, -15, mats.concrete);
  box(0.9, 2.6, 0.4, 13.85, 1.3, -15, mats.concrete);
  box(0.4, 1.1, 3, 12.5, 0.55, -16.5, mats.concrete);
  box(0.4, 1.1, 3, 12.5, 2.05, -16.5, mats.concrete);
  box(0.4, 1.0, 0.6, 12.5, 1.6, -17.7, mats.concrete);
  box(0.4, 1.0, 0.6, 12.5, 1.6, -15.6, mats.concrete);
  box(3.4, 0.3, 3.4, 14, 2.7, -16.5, mats.rust);
  box(1.2, 1.2, 1.2, 15, 0.6, -10, mats.wood);
  box(1.4, 1.4, 1.4, 19.5, 0.7, -16, mats.wood);

  // Burning barrels (dark cylinders; the flame + light come from effects.js).
  for (const [bx, , bz] of FIRE_SPOTS) {
    if (bx === -3) continue; // brazier is a different prop
    cyl(0.32, 0.36, 1.0, bx, 0.5, bz, mats.dark, 12);
  }
  // Ember spawn brazier: stone ring + bowl.
  cyl(0.55, 0.65, 0.35, -3, 0.18, 17.5, mats.concrete, 10);
  cyl(0.4, 0.3, 0.3, -3, 0.5, 17.5, mats.dark, 10);
  colliders.push(new THREE.Box3(new THREE.Vector3(-3.55, 0, 16.95), new THREE.Vector3(-2.45, 0.7, 18.05)));

  // Crane: two legs, a jib with a hanging container, counterweight.
  // Sited mid-yard east (z=2) so it reads as a structure from spawn instead
  // of clipping the frame edges.
  box(0.8, 6, 0.8, 11, 3, 2, mats.steel);
  box(0.8, 6, 0.8, 13, 3, 2, mats.steel);
  box(1.2, 1.0, 1.2, 12, 6.2, 2, mats.dark, { collide: false });
  const jib = box(11, 0.7, 0.7, 12.5, 6.6, 2, mats.amber, { collide: false });
  jib.castShadow = true;
  box(2.2, 1.6, 1.4, 6.5, 5.9, 2, mats.dark, { collide: false });
  const hang = box(2.4, 2.4, 2.4, 16.5, 3.6, 2, mats.teal, { collide: false });
  hang.castShadow = true;
  // Cables (thin dark boxes).
  box(0.06, 1.8, 0.06, 15.8, 5.4, 2, mats.dark, { collide: false, shoot: false });
  box(0.06, 1.8, 0.06, 17.2, 5.4, 2, mats.dark, { collide: false, shoot: false });

  // Catwalk along the north wall (deck + pillars).
  box(16, 0.25, 1.2, 0, 3.1, -17.6, mats.steel);
  for (const px of [-8, -4, 0, 4, 8]) box(0.3, 3, 0.3, px, 1.5, -17.6, mats.steel);
  box(16, 0.15, 0.1, 0, 4.1, -18.1, mats.steel, { collide: false }); // handrail

  // Spawn cover walls.
  box(4, 1.1, 0.6, 0, 0.55, 14, mats.concrete);
  box(4, 1.1, 0.6, 0, 0.55, -14, mats.concrete);

  // Scattered yard crates.
  box(1.2, 1.2, 1.2, 6, 0.6, 8, mats.wood);
  box(1.0, 1.0, 1.0, -6, 0.5, 9, mats.wood);
  box(1.4, 1.4, 1.4, 8, 0.7, -4, mats.wood);
  box(1.2, 1.2, 1.2, -3, 0.6, -9, mats.wood);

  // --- Daylight: pale sky, warm sun, soft fill ---
  scene.background = new THREE.Color(PALETTE.canvas);
  scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 40, 110);
  const sky = new THREE.HemisphereLight(0xdcecf7, 0x8a7f6d, 1.15);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
  sun.position.set(18, 26, 14);
  sun.target.position.set(0, 0, -2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 24;
  sun.shadow.camera.bottom = -24;
  sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xbfd4e6, 0.5);
  fill.position.set(-14, 12, 16);
  scene.add(fill);

  return { colliders, shootables, group, sun };
}
