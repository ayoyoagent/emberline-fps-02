// EMBERLINE weapons: five guns + frag + kevlar. The WEAPONS table is pure
// data (Node-testable); the view models are procedural low-poly boxes with a
// gunmetal body, amber rail accent and iron sights, plus the Blender-baked
// trigger hand (hand.js) gripping each weapon. One rig, shared across
// weapons: scale 0.8 at (0.25, -0.21, -0.44) — the kick code uses the same
// base z, or the model snaps every frame.
import * as THREE from 'three';
import { HAND } from './hand.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', price: 0, damage: 34, headMult: 3.0,
    mag: 12, reserve: 36, gap: 0.15, reload: 1.2, auto: false,
    spreadStill: 0.004, spreadMove: 0.03, falloffStart: 20, falloffMin: 0.6,
  },
  smg: {
    id: 'smg', name: 'Vex-9 SMG', price: 1500, damage: 26, headMult: 2.0,
    mag: 24, reserve: 72, gap: 0.075, reload: 1.6, auto: true,
    spreadStill: 0.006, spreadMove: 0.042, falloffStart: 18, falloffMin: 0.45,
  },
  rifle: {
    id: 'rifle', name: 'AR-77 Longshot', price: 2700, damage: 33, headMult: 3.2,
    mag: 25, reserve: 75, gap: 0.105, reload: 2.1, auto: true,
    spreadStill: 0.003, spreadMove: 0.034, falloffStart: 25, falloffMin: 0.6,
  },
  sniper: {
    id: 'sniper', name: 'Lance-50', price: 4750, damage: 115, headMult: 4.0,
    mag: 5, reserve: 15, gap: 1.1, reload: 3.0, auto: false, scoped: true,
    spreadStill: 0.001, spreadMove: 0.05, falloffStart: 40, falloffMin: 0.8,
  },
  grenade: {
    id: 'grenade', name: 'Frag Grenade', price: 300, damage: 120, radius: 5.5,
    fuse: 3.0, maxCarry: 2,
  },
  armor: { id: 'armor', name: 'Kevlar Vest', price: 650, armour: 100, absorb: 0.5 },
};

export const BUY_ORDER = ['pistol', 'smg', 'rifle', 'sniper', 'grenade', 'armor'];

// Damage at range, with a headshot multiplier. Pure function.
export function damageAt(weapon, distance, head) {
  let dmg = weapon.damage;
  if (distance > weapon.falloffStart) {
    const t = Math.min(1, (distance - weapon.falloffStart) / 30);
    dmg *= 1 - (1 - weapon.falloffMin) * t;
  }
  if (head) dmg *= weapon.headMult;
  return dmg;
}

const GUNMETAL = 0x23262b;
const GUN_DARK = 0x17191c;
const GRIP_GREY = 0x3a3d42;
const AMBER = 0xf5a623;
const GLOVE_TAN = 0x6b5a48;
const SLEEVE_OLIVE = 0x5a6148;

function buildHandMesh() {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(HAND.positions.length);
  const nor = new Float32Array(HAND.normals.length);
  for (let i = 0; i < pos.length; i += 1) pos[i] = HAND.positions[i] / 1000;
  for (let i = 0; i < nor.length; i += 1) nor[i] = HAND.normals[i] / 1000;
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setIndex(HAND.indices);
  const mat = new THREE.MeshStandardMaterial({ color: GLOVE_TAN, roughness: 0.9, metalness: 0.05 });
  return new THREE.Mesh(geo, mat);
}

function buildViewModel(id) {
  const gunmetal = new THREE.MeshStandardMaterial({ color: GUNMETAL, roughness: 0.45, metalness: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: GUN_DARK, roughness: 0.6, metalness: 0.4 });
  const grip = new THREE.MeshStandardMaterial({ color: GRIP_GREY, roughness: 0.8, metalness: 0.15 });
  const amber = new THREE.MeshStandardMaterial({ color: AMBER, roughness: 0.5, metalness: 0.3, emissive: 0x201404 });
  const model = new THREE.Group();
  const muzzle = new THREE.Object3D();
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    model.add(m);
    return m;
  };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cyl = (r, len, seg = 10) => new THREE.CylinderGeometry(r, r, len, seg);

  if (id === 'pistol') {
    add(box(0.075, 0.09, 0.26), gunmetal, 0, 0, -0.05); // slide
    add(box(0.07, 0.07, 0.14), dark, 0, -0.02, 0.1); // frame
    add(box(0.06, 0.14, 0.09), grip, 0, -0.1, 0.09, 0.25); // grip, tilted
    add(box(0.012, 0.02, 0.012), dark, 0, 0.055, -0.17); // front sight
    add(box(0.05, 0.015, 0.02), dark, 0, 0.055, 0.1); // rear sight
    add(box(0.02, 0.012, 0.05), amber, 0, 0.02, -0.1); // rail accent
    muzzle.position.set(0, 0.01, -0.2);
  } else if (id === 'smg') {
    add(box(0.08, 0.1, 0.4), gunmetal, 0, 0, -0.08); // receiver
    add(cyl(0.028, 0.22), dark, 0, 0.02, -0.36, Math.PI / 2, 0, 0); // suppressor
    add(box(0.07, 0.09, 0.2), dark, 0, -0.01, -0.28); // handguard
    add(box(0.06, 0.16, 0.08), grip, 0, -0.11, 0.02, 0.2); // grip
    add(box(0.05, 0.18, 0.06), dark, 0, -0.12, -0.12, 0.05); // magazine
    add(box(0.07, 0.07, 0.16), grip, 0, -0.02, 0.22); // stock
    add(box(0.012, 0.02, 0.012), dark, 0, 0.06, -0.3); // front sight
    add(box(0.02, 0.012, 0.16), amber, 0, 0.055, -0.08); // rail accent
    muzzle.position.set(0, 0.02, -0.48);
  } else if (id === 'rifle') {
    add(box(0.09, 0.11, 0.46), gunmetal, 0, 0, -0.06); // receiver
    add(cyl(0.024, 0.34), dark, 0, 0.025, -0.42, Math.PI / 2, 0, 0); // barrel
    add(box(0.08, 0.09, 0.26), dark, 0, 0, -0.3); // handguard
    add(box(0.06, 0.15, 0.09), grip, 0, -0.11, 0.06, 0.18); // grip
    add(box(0.05, 0.17, 0.07), dark, 0, -0.12, -0.14, 0.02); // magazine, slight tilt
    add(box(0.075, 0.09, 0.22), grip, 0, -0.02, 0.28); // stock
    add(box(0.012, 0.025, 0.012), dark, 0, 0.065, -0.5); // front sight post
    add(box(0.06, 0.02, 0.03), dark, 0, 0.065, 0.12); // rear sight
    add(box(0.02, 0.012, 0.3), amber, 0, 0.06, -0.14); // rail accent
    muzzle.position.set(0, 0.025, -0.6);
  } else {
    // sniper
    add(box(0.09, 0.11, 0.5), gunmetal, 0, 0, -0.04); // receiver
    add(cyl(0.026, 0.5), dark, 0, 0.025, -0.5, Math.PI / 2, 0, 0); // long barrel
    add(cyl(0.035, 0.16), dark, 0, 0.025, -0.74, Math.PI / 2, 0, 0); // muzzle brake
    add(box(0.075, 0.09, 0.3), dark, 0, 0, -0.34); // handguard
    add(cyl(0.032, 0.2), gunmetal, 0, 0.075, -0.08, Math.PI / 2, 0, 0); // scope tube
    add(cyl(0.045, 0.03), dark, 0, 0.075, -0.19, Math.PI / 2, 0, 0); // scope objective
    add(box(0.06, 0.15, 0.09), grip, 0, -0.11, 0.06, 0.18); // grip
    add(box(0.05, 0.14, 0.06), dark, 0, -0.11, -0.12, 0.02); // magazine
    add(box(0.075, 0.1, 0.26), grip, 0, -0.02, 0.3); // stock
    add(box(0.02, 0.012, 0.24), amber, 0, 0.06, -0.1); // rail accent
    muzzle.position.set(0, 0.025, -0.83);
  }
  model.add(muzzle);

  // Trigger hand at the grip + olive sleeve stub.
  const hand = buildHandMesh();
  const gripPos = id === 'pistol' ? [0, -0.1, 0.09] : [0, -0.11, 0.06];
  hand.position.set(gripPos[0] + 0.01, gripPos[1] + 0.02, gripPos[2] + 0.01);
  hand.rotation.set(0.25, 0, -0.15);
  model.add(hand);
  const sleeve = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.055, 0.16, 10),
    new THREE.MeshStandardMaterial({ color: SLEEVE_OLIVE, roughness: 0.95 }),
  );
  sleeve.position.set(gripPos[0] + 0.07, gripPos[1] - 0.1, gripPos[2] + 0.16);
  sleeve.rotation.set(0.7, 0, -0.6);
  model.add(sleeve);
  // Support hand on the handguard for long guns (simple glove fist).
  if (id !== 'pistol') {
    const fist = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.08, 0.1),
      new THREE.MeshStandardMaterial({ color: GLOVE_TAN, roughness: 0.9 }),
    );
    fist.position.set(0, -0.07, id === 'sniper' ? -0.34 : -0.3);
    model.add(fist);
    const sleeve2 = sleeve.clone();
    sleeve2.position.set(0.02, -0.16, id === 'sniper' ? -0.28 : -0.24);
    sleeve2.rotation.set(1.1, 0, -0.4);
    model.add(sleeve2);
  }
  return { model, muzzle };
}

const RIG_POS = [0.25, -0.21, -0.44];

export function createWeaponSystem(camera) {
  const rig = new THREE.Group();
  rig.position.set(RIG_POS[0], RIG_POS[1], RIG_POS[2]);
  rig.scale.setScalar(0.8);
  camera.add(rig);

  const models = {};
  for (const id of ['pistol', 'smg', 'rifle', 'sniper']) {
    models[id] = buildViewModel(id);
    models[id].model.visible = id === 'pistol';
    rig.add(models[id].model);
  }

  // Muzzle flash: sprite + light on the camera, reused by every weapon.
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffc860, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide,
  });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), flashMat);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(0xffb340, 0, 7);
  camera.add(flashLight);

  const ammo = {};
  for (const id of ['pistol', 'smg', 'rifle', 'sniper']) {
    ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
  }
  const state = {
    current: 'pistol',
    owned: new Set(['pistol']),
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    bobPhase: 0,
    aiming: false,
    grenades: 0,
    armour: 0,
  };

  function currentDef() {
    return WEAPONS[state.current];
  }

  function step(dt, moving) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    state.bobPhase += dt * (moving ? 11 : 4);
    const bob = moving ? Math.sin(state.bobPhase) * 0.006 : 0;
    const bobY = moving ? Math.abs(Math.cos(state.bobPhase)) * 0.008 : 0;
    const aimT = state.aiming ? 1 : 0;
    rig.position.x = RIG_POS[0] + (0.0 - RIG_POS[0]) * aimT * 0.7 + bob;
    rig.position.y = RIG_POS[1] + (0.02) * aimT + bobY;
    rig.position.z = RIG_POS[2] + state.kick;
    rig.rotation.x = state.kick * 2.2;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      const def = currentDef();
      rig.rotation.x = -0.55 * Math.min(1, (def.reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const a = ammo[state.current];
        const need = def.mag - a.mag;
        const take = Math.min(need, a.reserve);
        a.mag += take;
        a.reserve -= take;
      }
    }
    const m = models[state.current].muzzle;
    const mp = new THREE.Vector3();
    m.getWorldPosition(mp);
    flash.position.copy(camera.worldToLocal(mp.clone()));
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 40;
    flashLight.position.copy(flash.position);
    flashLight.intensity = state.flash > 0 ? 22 : 0;
  }

  return {
    state,
    ammo,
    rig,
    models,
    step,
    currentDef,
    ready() {
      const a = ammo[state.current];
      return a.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      const def = currentDef();
      state.cooldown = def.gap;
      state.flash = 0.06;
      state.kick = def.id === 'sniper' ? 0.11 : 0.055;
    },
    takeRound() {
      const a = ammo[state.current];
      if (a.mag <= 0) return false;
      a.mag -= 1;
      return true;
    },
    reload() {
      const def = currentDef();
      const a = ammo[state.current];
      if (state.reloadLeft > 0 || a.mag === def.mag || a.reserve === 0) return false;
      state.reloadLeft = def.reload;
      return true;
    },
    spread(speed) {
      const def = currentDef();
      const move = Math.min(1, speed / 4.6);
      const aimMul = state.aiming ? 0.45 : 1;
      return (def.spreadStill + move * def.spreadMove) * aimMul;
    },
    switchTo(id) {
      if (!state.owned.has(id) || !models[id]) return false;
      for (const key of Object.keys(models)) models[key].model.visible = key === id;
      state.current = id;
      state.reloadLeft = 0;
      state.aiming = false;
      return true;
    },
    buy(id) {
      state.owned.add(id);
      if (id === 'grenade') state.grenades = Math.min(2, state.grenades + 1);
      if (id === 'armor') state.armour = 100;
      if (models[id]) this.switchTo(id);
      return true;
    },
    refill() {
      for (const id of ['pistol', 'smg', 'rifle', 'sniper']) {
        ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
      }
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
    muzzleWorld(out) {
      return models[state.current].muzzle.getWorldPosition(out);
    },
  };
}
