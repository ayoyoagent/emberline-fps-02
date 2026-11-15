// EMBERLINE boot + the one loop: a fixed 60 Hz simulation feeding a render
// at the display's rate. ?shot=start|play|fire|map|end with &seed=N sets up
// a deterministic frame for a capture, renders it twice, then freezes it
// and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld, FIRE_SPOTS, SITES, EMBER_SPAWNS, ASHFALL_SPAWNS } from './world.js';
import { createMover } from './player.js';
import { createInput } from './input.js';
import { createWeaponSystem, WEAPONS, BUY_ORDER, damageAt } from './weapons.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';
import { createBots } from './bots.js';
import { createSpike } from './spike.js';
import { createMatch, BUY_TIME, ROUND_TIME, MAX_ROUNDS } from './rounds.js';
import { createTextures } from './textures.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 200);
scene.add(camera);

const world = createWorld(scene);
const tex = createTextures(THREE);
const effects = createEffects(scene, tex.flame);
for (const [fx, fy, fz] of FIRE_SPOTS) effects.addFire(fx, fy, fz, fx === -3 ? 1.3 : 1);
const weapon = createWeaponSystem(camera);
const audio = createAudio();
const hud = createHud();
const spike = createSpike(scene, SITES);
const player = createMover(world.colliders, 0, 16, 0);
const input = createInput(renderer.domElement, onLockChange);
const bots = createBots(scene, world.colliders, world.shootables);
let match = createMatch();

const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const shootables = world.shootables.concat(bots.allHitMeshes);
const direction = new THREE.Vector3();
const muzzlePos = new THREE.Vector3();
const tmpV = new THREE.Vector3();

// Player hitboxes (invisible): bots raycast against these, the player's own
// raycast never sees them.
const playerTorso = new THREE.Mesh(
  new THREE.BoxGeometry(0.7, 0.9, 0.45),
  new THREE.MeshBasicMaterial({ visible: false }),
);
playerTorso.userData = { isPlayer: true, part: 'torso' };
const playerHead = new THREE.Mesh(
  new THREE.BoxGeometry(0.32, 0.32, 0.32),
  new THREE.MeshBasicMaterial({ visible: false }),
);
playerHead.userData = { isPlayer: true, part: 'head' };
scene.add(playerTorso, playerHead);
bots.setPlayerHitMeshes([playerTorso, playerHead]);

const body = player.state;
const markerHoldMs = shot ? 4000 : 90;
let elapsed = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let prevPhase = match.state.phase;
let endLeft = 0;
let playerHp = 100;
let playerArmour = 0;
let playerAlive = true;
let fovTarget = 74;
let prevFiring = false;
let stepAcc = 0;
let channelBy = null; // 'player' | bot object | null
let channelKind = null; // 'plant' | 'defuse' | null
let grenades = [];

function siteAt(x, z) {
  for (const [key, site] of Object.entries(SITES)) {
    if (Math.hypot(site.x - x, site.z - z) <= site.r) return key;
  }
  return null;
}

function aliveCounts() {
  return { ember: bots.aliveCount('ember') + (playerAlive ? 1 : 0), ashfall: bots.aliveCount('ashfall') };
}

function resetPositions() {
  const site = match.state.round % 2 === 1 ? 'A' : 'B';
  player.state.position.set(EMBER_SPAWNS[0][0], 0, EMBER_SPAWNS[0][1]);
  player.state.velocity.set(0, 0, 0);
  player.state.yaw = 0;
  player.state.pitch = 0;
  playerHp = 100;
  playerAlive = true;
  channelBy = null;
  channelKind = null;
  spike.reset();
  const emberBots = bots.bots.filter((b) => b.team === 'ember');
  const ashBots = bots.bots.filter((b) => b.team === 'ashfall');
  emberBots.forEach((bot, i) => {
    const s = EMBER_SPAWNS[(i + 1) % EMBER_SPAWNS.length];
    bots.resetBot(bot, s[0], s[1], 0);
    bot.assignedSite = site;
    bot.state = 'spawn';
    bot.holdTimer = 0.4 + i * 0.2;
    bot.defuseRunner = false;
  });
  ashBots.forEach((bot, i) => {
    const s = ASHFALL_SPAWNS[i % ASHFALL_SPAWNS.length];
    bots.resetBot(bot, s[0], s[1], Math.PI);
    bot.assignedSite = site;
    bot.state = 'spawn';
    bot.holdTimer = 0.4 + i * 0.2;
    bot.defuseRunner = false;
  });
  match.state.carrier = match.state.round % 2 === 1 ? 'player' : 'kestrel';
  for (const bot of bots.bots) bot.visual.group.rotation.set(0, bot.mover.state.yaw, 0);
}

function startRound() {
  resetPositions();
  // Refill magazines from reserve at the start of each round.
  for (const id of ['pistol', 'smg', 'rifle', 'sniper']) {
    const a = weapon.ammo[id];
    const take = Math.min(WEAPONS[id].mag - a.mag, a.reserve);
    a.mag += take;
    a.reserve -= take;
  }
  hud.setHealth(playerHp, 100);
  hud.setArmour(playerArmour);
  hud.setAmmo(weapon.ammo[weapon.state.current].mag, weapon.ammo[weapon.state.current].reserve);
  hud.setWeapon(WEAPONS[weapon.state.current].name.toUpperCase());
  hud.setGrenades(weapon.state.grenades);
  hud.setMoney(match.state.money);
  hud.setScore(match.state.score.ember, match.state.score.ashfall);
  hud.setRound(match.state.round, MAX_ROUNDS);
  hud.banner(`ROUND ${match.state.round}`, `Plant the spike at Site ${match.state.round % 2 === 1 ? 'A' : 'B'} — or eliminate Ashfall`, 2800);
}

function damageBot(victim, dmg, head, attacker) {
  if (!victim.alive) return;
  let remaining = dmg;
  if (victim.armour > 0) {
    const absorbed = Math.min(victim.armour, remaining * 0.5);
    victim.armour -= absorbed;
    remaining -= absorbed;
  }
  victim.hp -= remaining;
  if (victim.hp <= 0) {
    victim.hp = 0;
    victim.alive = false;
    victim.visual.group.rotation.set(-Math.PI / 2, victim.mover.state.yaw, 0);
    victim.visual.group.position.y = 0.25;
    const killerName = attacker === 'player' ? 'YOU' : attacker.name;
    const killerTeam = attacker === 'player' ? 'ember' : attacker.team;
    hud.killfeed(killerName, victim.name, head, killerTeam);
    if (attacker === 'player') {
      match.onKill();
      audio.kill();
      hud.hitMarker(true, markerHoldMs);
      hud.setMoney(match.state.money);
    }
  } else if (attacker === 'player') {
    hud.hitMarker(false, markerHoldMs);
  }
}

function damagePlayer(dmg, fromPos, head) {
  if (!playerAlive) return;
  let remaining = dmg * (head ? 1.5 : 1);
  if (playerArmour > 0) {
    const absorbed = Math.min(playerArmour, remaining * 0.5);
    playerArmour -= absorbed;
    remaining -= absorbed;
  }
  playerHp -= remaining;
  hud.setHealth(playerHp, 100);
  hud.setArmour(playerArmour);
  audio.hurt();
  // Damage direction: angle of the attacker relative to where we look.
  const dx = fromPos.x - body.position.x;
  const dz = fromPos.z - body.position.z;
  const worldAngle = Math.atan2(dx, dz);
  const rel = worldAngle - body.yaw;
  hud.damageFrom((rel * 180) / Math.PI);
  // Taking damage breaks a plant/defuse channel.
  if (channelBy === 'player') {
    spike.plantChannel.break();
    spike.defuseChannel.break();
    channelBy = null;
    channelKind = null;
    hud.setChannel(null);
  }
  if (playerHp <= 0) {
    playerHp = 0;
    playerAlive = false;
    hud.setHealth(0, 100);
    hud.banner('YOU ARE DOWN', 'Your team fights on — next round you return', 3000);
    if (document.pointerLockElement) document.exitPointerLock();
  }
}

function doPlant(siteKey) {
  spike.plant(siteKey, elapsed);
  match.onObjective();
  hud.setMoney(match.state.money);
  hud.banner('SPIKE PLANTED', `Detonation in 45 seconds — defend Site ${siteKey}`, 3000);
  audio.planted();
  bots.onSpikePlanted(siteKey);
  channelBy = null;
  channelKind = null;
  hud.setChannel(null);
}

function doDefuse() {
  match.onDefuse();
  hud.setMoney(match.state.money);
  channelBy = null;
  channelKind = null;
  hud.setChannel(null);
}

function buyItem(id) {
  if (match.state.phase !== 'buy') return;
  const res = match.buy(id);
  if (!res.ok) {
    audio.denied();
    return;
  }
  weapon.buy(id);
  if (id === 'armor') playerArmour = 100;
  audio.buy();
  hud.setMoney(match.state.money);
  hud.setAmmo(weapon.ammo[weapon.state.current].mag, weapon.ammo[weapon.state.current].reserve);
  hud.setWeapon(WEAPONS[weapon.state.current].name.toUpperCase());
  hud.setGrenades(weapon.state.grenades);
  hud.setArmour(playerArmour);
  if (match.state.phase === 'buy') hud.showBuy(match.state.money, weapon.state.owned);
}

function throwGrenade() {
  if (weapon.state.grenades <= 0 || match.state.phase !== 'live') return;
  weapon.state.grenades -= 1;
  hud.setGrenades(weapon.state.grenades);
  camera.getWorldDirection(direction);
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.4, metalness: 0.6 }),
  );
  mesh.position.copy(camera.position).addScaledVector(direction, 0.5);
  scene.add(mesh);
  grenades.push({
    mesh,
    vel: direction.clone().multiplyScalar(15).add(new THREE.Vector3(0, 3.5, 0)),
    fuse: WEAPONS.grenade.fuse,
  });
  audio.step();
}

function explodeGrenade(g) {
  const p = g.mesh.position;
  effects.spawnExplosion(p, true);
  audio.explosion();
  const R = WEAPONS.grenade.radius;
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const bp = bot.mover.state.position;
    const d = Math.hypot(bp.x - p.x, bp.z - p.z) + Math.abs(bp.y + 1 - p.y) * 0.5;
    if (d < R) damageBot(bot, WEAPONS.grenade.damage * (1 - (d / R) * 0.7), false, 'player');
  }
  if (playerAlive) {
    const d = Math.hypot(body.position.x - p.x, body.position.z - p.z);
    if (d < R) damagePlayer(WEAPONS.grenade.damage * (1 - (d / R) * 0.7) * 0.6, p, false);
  }
  scene.remove(g.mesh);
}

function shoot(spread) {
  if (!weapon.takeRound()) {
    audio.dryFire();
    return false;
  }
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  weapon.muzzleWorld(muzzlePos);
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const hit = raycaster.intersectObjects(shootables, false)[0];
  const end = hit ? hit.point : camera.position.clone().addScaledVector(direction, 60);
  effects.spawnTracer(muzzlePos, end);
  if (hit) {
    if (hit.object.userData.bot) {
      const victim = hit.object.userData.bot;
      const head = hit.object.userData.part === 'head';
      const dmg = damageAt(weapon.currentDef(), camera.position.distanceTo(hit.point), head);
      damageBot(victim, dmg, head, 'player');
      effects.spawnImpact(hit.point, 'flesh');
    } else {
      effects.spawnImpact(hit.point, 'spark');
      if (Math.random() < 0.3) effects.spawnSmoke(hit.point, false);
    }
  }
  weapon.pullTrigger();
  audio.shot(weapon.state.current);
  player.recoil(0.009 + random() * 0.004, (random() * 2 - 1) * 0.004);
  hud.setAmmo(weapon.ammo[weapon.state.current].mag, weapon.ammo[weapon.state.current].reserve);
  return true;
}

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch + effects.shakeOffset.y, body.yaw + effects.shakeOffset.x, 0, 'YXZ');
  playerTorso.position.set(body.position.x, body.position.y + 0.95, body.position.z);
  playerHead.position.set(body.position.x, body.position.y + 1.55, body.position.z);
  playerTorso.rotation.y = body.yaw;
  playerHead.rotation.y = body.yaw;
}

function botContext() {
  return {
    time: elapsed,
    phase: match.state.phase,
    playerAlive,
    playerPos: body.position,
    playerSpeed: player.groundSpeed(),
    spikePlanted: match.state.spike === 'planted',
    plantedSite: spike.plantedSite,
    damageBot,
    damagePlayer,
    onBotShot(bot, from, to) {
      effects.spawnTracer(from, to);
      const d = from.distanceTo(body.position);
      if (d < 32) audio.shot(bot.weaponId);
    },
    requestPlant(bot) {
      if (channelBy || match.state.spike !== 'none' || match.state.phase !== 'live') return;
      if (bot.carrier && bot.team === 'ember') {
        channelBy = bot;
        channelKind = 'plant';
        spike.plantChannel.start();
      }
    },
    requestDefuse(bot) {
      if (channelBy || match.state.spike !== 'planted' || match.state.phase !== 'live') return;
      channelBy = bot;
      channelKind = 'defuse';
      spike.defuseChannel.start();
    },
  };
}

function step(dt) {
  elapsed += dt;
  const phaseBefore = match.state.phase;

  // --- Player channels (hold E) ---
  const eHeld = input.state.keys.has('KeyE');
  const moving = input.state.keys.has('KeyW') || input.state.keys.has('KeyA') || input.state.keys.has('KeyS') || input.state.keys.has('KeyD');
  if (match.state.phase === 'live' && playerAlive) {
    const site = siteAt(body.position.x, body.position.z);
    if (!channelBy && eHeld && !moving) {
      if (match.state.spike === 'none' && match.state.carrier === 'player' && site) {
        channelBy = 'player';
        channelKind = 'plant';
        spike.plantChannel.start();
      } else if (match.state.spike === 'planted' && spike.plantedSite === site) {
        channelBy = 'player';
        channelKind = 'defuse';
        spike.defuseChannel.start();
      }
    }
    if (channelBy === 'player') {
      if (!eHeld || moving) {
        spike.plantChannel.break();
        spike.defuseChannel.break();
        channelBy = null;
        channelKind = null;
        hud.setChannel(null);
      } else if (channelKind === 'plant') {
        const siteKey = siteAt(body.position.x, body.position.z);
        if (!siteKey) {
          spike.plantChannel.break();
          channelBy = null;
          channelKind = null;
          hud.setChannel(null);
        } else if (spike.plantChannel.hold(dt)) {
          doPlant(siteKey);
        } else {
          hud.setChannel('PLANTING SPIKE — HOLD E', spike.plantChannel.progress / spike.plantChannel.duration);
          if (Math.floor(elapsed * 2) !== Math.floor((elapsed - dt) * 2)) audio.plantBeep();
        }
      } else if (channelKind === 'defuse') {
        if (spike.defuseChannel.hold(dt)) doDefuse();
        else {
          hud.setChannel('DEFUSING — HOLD E', spike.defuseChannel.progress / spike.defuseChannel.duration);
          if (Math.floor(elapsed * 2) !== Math.floor((elapsed - dt) * 2)) audio.defuseBeep();
        }
      }
    }
  }
  // --- Bot channels ---
  if (channelBy && channelBy !== 'player') {
    const bot = channelBy;
    if (!bot.alive) {
      spike.plantChannel.break();
      spike.defuseChannel.break();
      channelBy = null;
      channelKind = null;
    } else if (channelKind === 'plant') {
      if (spike.plantChannel.hold(dt)) doPlant(bot.assignedSite);
    } else if (channelKind === 'defuse') {
      if (spike.defuseChannel.hold(dt)) doDefuse();
    }
  }

  // --- Match machine ---
  match.step(dt, aliveCounts(), match.state.spike === 'planted');
  if (match.state.phase !== phaseBefore) {
    if (match.state.phase === 'live') {
      hud.hideBuy();
      hud.banner(`ROUND ${match.state.round}`, match.state.carrier === 'player' ? 'You carry the spike' : 'Kestrel carries the spike', 2600);
    } else if (match.state.phase === 'end' || match.state.phase === 'over') {
      endLeft = 5;
      hud.fade();
      const w = match.state.roundWinner;
      const reason = match.state.roundReason;
      const reasonText = { elimination: 'Elimination', time: 'Time expired', detonation: 'Spike detonated', defuse: 'Spike defused' }[reason] || '';
      hud.banner(w === 'ember' ? 'EMBER WINS THE ROUND' : 'ASHFALL WINS THE ROUND', reasonText, 4200);
      if (w === 'ember') audio.roundWin();
      else audio.roundLose();
      hud.setScore(match.state.score.ember, match.state.score.ashfall);
      hud.setMoney(match.state.money);
      if (match.state.phase === 'over') {
        hud.showOverlay('end', `Final score Ember ${match.state.score.ember} — Ashfall ${match.state.score.ashfall}.`);
        if (document.pointerLockElement) document.exitPointerLock();
      }
    }
  }
  if (match.state.phase === 'end' || match.state.phase === 'over') {
    endLeft -= dt;
    if (endLeft <= 0 && match.state.phase === 'end') {
      if (match.nextRound()) startRound();
    }
  }

  // --- Player + weapon ---
  if (playerAlive) {
    player.step(dt, input.state.keys);
    // Footsteps.
    stepAcc += player.groundSpeed() * dt;
    if (stepAcc > 2.2) {
      stepAcc = 0;
      audio.step();
    }
  }
  weapon.step(dt, player.groundSpeed() > 0.5);
  weapon.state.aiming = input.state.aiming && playerAlive;
  fovTarget = weapon.state.aiming ? (weapon.state.current === 'sniper' ? 28 : 60) : 74;
  camera.fov += (fovTarget - camera.fov) * Math.min(1, dt * 10);
  camera.updateProjectionMatrix();
  hud.setScope(weapon.state.aiming && weapon.state.current === 'sniper');
  hud.setCrosshairSpread(4 + weapon.spread(player.groundSpeed()) * 900);

  // --- Bots (they hold at spawn during the buy phase) ---
  if (match.state.phase === 'live') {
    bots.update(dt, botContext());
  }

  // --- Grenades ---
  for (let i = grenades.length - 1; i >= 0; i -= 1) {
    const g = grenades[i];
    g.fuse -= dt;
    g.vel.y -= 12 * dt;
    g.mesh.position.addScaledVector(g.vel, dt);
    if (g.mesh.position.y < 0.12) {
      g.mesh.position.y = 0.12;
      g.vel.y *= -0.4;
      g.vel.x *= 0.6;
      g.vel.z *= 0.6;
    }
    if (g.fuse <= 0) {
      explodeGrenade(g);
      grenades.splice(i, 1);
    }
  }

  // --- Spike visuals + effects ---
  spike.update(dt, elapsed);
  effects.update(dt, elapsed);

  // --- HUD timers ---
  if (match.state.phase === 'live') {
    hud.setTimer(match.state.spike === 'planted' ? match.state.spikeTimeLeft : match.state.timeLeft, match.state.spike === 'planted');
  } else if (match.state.phase === 'buy') {
    hud.setTimer(match.state.timeLeft, false);
  }
  hud.setHealth(playerHp, 100);
  hud.setArmour(playerArmour);
  hud.setMoney(match.state.money);
}

function handlePressed(codes) {
  for (const code of codes) {
    if (code === 'KeyB') {
      if (match.state.phase === 'buy') {
        const showing = !document.getElementById('buy-menu').classList.contains('hidden');
        if (showing) hud.hideBuy();
        else hud.showBuy(match.state.money, weapon.state.owned);
      }
    } else if (code === 'KeyR') {
      if (weapon.reload()) audio.reload();
    } else if (code === 'KeyG') {
      throwGrenade();
    } else if (code === 'Digit1') buyItem('pistol');
    else if (code === 'Digit2') buyItem('smg');
    else if (code === 'Digit3') buyItem('rifle');
    else if (code === 'Digit4') buyItem('sniper');
    else if (code === 'Digit5') buyItem('grenade');
    else if (code === 'Digit6') buyItem('armor');
    else if (code === 'KeyQ') {
      const order = BUY_ORDER.slice(0, 4).filter((id) => weapon.state.owned.has(id));
      const idx = order.indexOf(weapon.state.current);
      const next = order[(idx + 1) % order.length];
      if (next) {
        weapon.switchTo(next);
        hud.setWeapon(WEAPONS[next].name.toUpperCase());
        hud.setAmmo(weapon.ammo[next].mag, weapon.ammo[next].reserve);
      }
    }
  }
  // Number keys also switch owned weapons outside buy phase.
  for (const code of codes) {
    if (match.state.phase !== 'buy') {
      const map = { Digit1: 'pistol', Digit2: 'smg', Digit3: 'rifle', Digit4: 'sniper' };
      if (map[code] && weapon.state.owned.has(map[code])) {
        weapon.switchTo(map[code]);
        hud.setWeapon(WEAPONS[map[code]].name.toUpperCase());
        hud.setAmmo(weapon.ammo[map[code]].mag, weapon.ammo[map[code]].reserve);
      }
    }
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (playerAlive) player.look(look.x, look.y);
    handlePressed(input.takePressed());
    const def = weapon.currentDef();
    const firing = input.state.firing && playerAlive && (match.state.phase === 'live' || match.state.phase === 'buy');
    if (firing && weapon.ready() && (def.auto || !prevFiring)) {
      shoot(shot ? 0 : weapon.spread(player.groundSpeed()));
    }
    prevFiring = input.state.firing;
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
  syncCamera();
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  body.pitch = 0;
  body.yaw = 0;
  if (name === 'start') {
    resetPositions();
    startRound();
    body.position.set(0, 0, 16);
    body.yaw = 0;
    settle(20);
    hud.showBuy(match.state.money, weapon.state.owned);
    hud.setTimer(BUY_TIME, false);
  } else if (name === 'play') {
    resetPositions();
    match.state.phase = 'live';
    match.state.timeLeft = 80;
    match.state.round = 3;
    match.state.score = { ember: 1, ashfall: 1 };
    playerHp = 78;
    playerArmour = 50;
    weapon.state.owned.add('rifle');
    weapon.switchTo('rifle');
    weapon.ammo.rifle = { mag: 18, reserve: 50 };
    match.state.money = 2350;
    body.position.set(1.5, 0, 13);
    body.yaw = 0.1;
    // Stage two Ashfall bots in mid for the firefight.
    const vex = bots.bots.find((b) => b.name === 'Vex');
    const cinder = bots.bots.find((b) => b.name === 'Cinder');
    bots.resetBot(vex, 1, 2, Math.PI);
    bots.resetBot(cinder, 5, -3, Math.PI);
    vex.state = 'hold';
    cinder.state = 'hold';
    settle(30);
    aimAt(new THREE.Vector3(1, 1.3, 2));
    shoot(0);
    settle(6);
    hud.setHealth(playerHp, 100);
    hud.setArmour(playerArmour);
    hud.setScore(1, 1);
    hud.setRound(3, MAX_ROUNDS);
    hud.setTimer(80, false);
    hud.setMoney(2350);
    hud.setAmmo(17, 50);
  } else if (name === 'fire') {
    resetPositions();
    match.state.phase = 'live';
    match.state.timeLeft = 62;
    match.state.round = 5;
    match.state.score = { ember: 2, ashfall: 2 };
    weapon.state.owned.add('rifle');
    weapon.switchTo('rifle');
    weapon.ammo.rifle = { mag: 22, reserve: 50 };
    match.state.money = 3100;
    body.position.set(-1, 0, 9);
    body.yaw = -0.35;
    const thorn = bots.bots.find((b) => b.name === 'Thorn');
    bots.resetBot(thorn, 6, -2, Math.PI * 0.8);
    thorn.state = 'hold';
    settle(20);
    aimAt(new THREE.Vector3(6, 1.2, -2));
    shoot(0);
    effects.spawnExplosion(new THREE.Vector3(7, 0.3, -4), true);
    audio.explosion();
    settle(4);
    hud.setScore(2, 2);
    hud.setRound(5, MAX_ROUNDS);
    hud.setTimer(62, false);
    hud.setMoney(3100);
    hud.setAmmo(21, 50);
  } else if (name === 'map') {
    resetPositions();
    match.state.phase = 'live';
    match.state.timeLeft = 88;
    match.state.round = 2;
    body.position.set(0, 0, 16);
    settle(10);
    camera.position.set(0, 30, 30);
    camera.lookAt(0, 0, -3);
    hud.setScore(0, 0);
    hud.setRound(2, MAX_ROUNDS);
    hud.setTimer(88, false);
    paintTwiceThenReady(true);
    return;
  } else {
    // end
    resetPositions();
    match.state.phase = 'end';
    match.state.score = { ember: 3, ashfall: 2 };
    match.state.roundWinner = 'ember';
    match.state.roundReason = 'elimination';
    match.state.round = 6;
    body.position.set(-14, 0, -8);
    body.yaw = 0.6;
    const vex = bots.bots.find((b) => b.name === 'Vex');
    bots.resetBot(vex, -17, -11, Math.PI * 0.5);
    vex.alive = false;
    vex.visual.group.rotation.set(-Math.PI / 2, 0, 0);
    settle(10);
    hud.banner('EMBER WINS THE ROUND', 'Elimination — Site A', 8000);
    hud.setScore(3, 2);
    hud.setRound(6, MAX_ROUNDS);
    hud.setMoney(4050);
    hud.setTimer(0, false);
  }
  hud.setAmmo(weapon.ammo[weapon.state.current].mag, weapon.ammo[weapon.state.current].reserve);
  hud.setWeapon(WEAPONS[weapon.state.current].name.toUpperCase());
  paintTwiceThenReady(false);
}

function paintTwiceThenReady(mapCam) {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    if (!mapCam) syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

hud.onPlay(() => {
  audio.unlock();
  if (shot) return;
  if (match.state.phase === 'over') {
    match = createMatch();
    weapon.refill();
    weapon.state.owned = new Set(['pistol']);
    weapon.switchTo('pistol');
    weapon.state.grenades = 0;
    playerArmour = 0;
    startRound();
  }
  input.requestLock();
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    hud.hideBuy();
    if (match.state.phase === 'buy') hud.showBuy(match.state.money, weapon.state.owned);
  } else if (match.state.phase !== 'over') {
    hud.showOverlay(started ? 'paused' : 'start');
  }
}

// Buy menu buttons are clickable when the pointer is free (buy phase start).
for (const btn of document.querySelectorAll('[data-buy]')) {
  btn.addEventListener('click', () => buyItem(btn.dataset.buy));
}

syncCamera();
startRound();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
