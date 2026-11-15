// EMBERLINE bots: 4 Ember + 5 Ashfall. Each one shares the player's exact
// physics (createMover) — no teleporting, no wallhacks (LOS only, raycast
// throttled to ~120 ms per bot, staggered). State machine:
// spawn -> push -> hold -> engage -> retreat (HP < 30) -> plant / defuse ->
// rotate. Reaction delay 250-600 ms, bursts of 3-5 with aim error scaled by
// range and target speed, strafe between bursts.
import * as THREE from 'three';
import { createMover, keysToward } from './player.js';
import { bfsPath, nearestNode, NAV_NODES, SITES } from './world.js';
import { WEAPONS, damageAt } from './weapons.js';

const BOT_SPEED = 4.2;
const REACTION_MIN = 0.25;
const REACTION_MAX = 0.6;
const LOS_INTERVAL = 0.12;
const ENGAGE_RANGE = 45;
const RETREAT_HP = 30;

const EMBER_BOTS = [
  { name: 'Kestrel', weapon: 'rifle', carrier: true },
  { name: 'Bramble', weapon: 'rifle' },
  { name: 'Flint', weapon: 'smg' },
  { name: 'Rowan', weapon: 'sniper' },
];
const ASHFALL_BOTS = [
  { name: 'Vex', weapon: 'rifle' },
  { name: 'Cinder', weapon: 'rifle' },
  { name: 'Slate', weapon: 'smg' },
  { name: 'Thorn', weapon: 'sniper' },
  { name: 'Ash', weapon: 'rifle' },
];

function teamColor(team) {
  return team === 'ember' ? 0xf5a623 : 0x3fb8bf;
}

function buildSoldier(team) {
  const group = new THREE.Group();
  const accent = teamColor(team);
  const vest = new THREE.MeshStandardMaterial({ color: 0x2e3134, roughness: 0.85 });
  const accentMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.7 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc79a72, roughness: 0.8 });
  const jeans = new THREE.MeshStandardMaterial({ color: 0x3a4552, roughness: 0.9 });
  const boot = new THREE.MeshStandardMaterial({ color: 0x1d1a16, roughness: 0.85 });
  const gun = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.5, metalness: 0.5 });

  const parts = {};
  function add(mat, w, h, d, x, y, z, parent = group) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  }
  // Legs (pivot at hip for the walk cycle).
  const legL = new THREE.Group();
  legL.position.set(-0.11, 0.85, 0);
  add(jeans, 0.17, 0.8, 0.19, 0, -0.4, 0, legL);
  add(boot, 0.18, 0.12, 0.3, 0, -0.79, 0.04, legL);
  const legR = new THREE.Group();
  legR.position.set(0.11, 0.85, 0);
  add(jeans, 0.17, 0.8, 0.19, 0, -0.4, 0, legR);
  add(boot, 0.18, 0.12, 0.3, 0, -0.79, 0.04, legR);
  group.add(legL, legR);
  parts.legL = legL;
  parts.legR = legR;
  // Torso: vest + team chest stripe + shoulder pads.
  add(vest, 0.46, 0.62, 0.26, 0, 1.16, 0);
  add(accentMat, 0.48, 0.08, 0.28, 0, 1.32, 0);
  add(accentMat, 0.14, 0.1, 0.28, -0.26, 1.44, 0);
  add(accentMat, 0.14, 0.1, 0.28, 0.26, 1.44, 0);
  // Backpack + bedroll.
  add(new THREE.MeshStandardMaterial({ color: 0x4a4438, roughness: 0.95 }), 0.34, 0.42, 0.14, 0, 1.2, 0.2);
  add(new THREE.MeshStandardMaterial({ color: 0x5a6148, roughness: 0.95 }), 0.36, 0.12, 0.16, 0, 1.46, 0.2);
  // Head: skin + helmet with brim.
  add(skin, 0.24, 0.24, 0.24, 0, 1.62, 0);
  add(new THREE.MeshStandardMaterial({ color: team === 'ember' ? 0x6b5a35 : 0x35565e, roughness: 0.85 }), 0.28, 0.12, 0.28, 0, 1.76, 0);
  add(new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.8 }), 0.3, 0.04, 0.34, 0, 1.7, 0.02);
  // Arms reaching forward to the rifle.
  const armL = new THREE.Group();
  armL.position.set(-0.28, 1.42, 0);
  add(vest, 0.12, 0.5, 0.14, 0, -0.22, 0.12, armL);
  armL.rotation.x = -1.1;
  const armR = new THREE.Group();
  armR.position.set(0.28, 1.42, 0);
  add(vest, 0.12, 0.5, 0.14, 0, -0.22, 0.12, armR);
  armR.rotation.x = -1.1;
  group.add(armL, armR);
  parts.armL = armL;
  parts.armR = armR;
  // Held rifle.
  const rifle = add(gun, 0.07, 0.09, 0.62, 0, 1.28, -0.28);
  rifle.rotation.x = 0.06;
  parts.rifle = rifle;

  // Hitboxes stay torso + head only.
  const torsoHit = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.7, 0.34), new THREE.MeshBasicMaterial({ visible: false }));
  torsoHit.position.set(0, 1.16, 0);
  const headHit = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshBasicMaterial({ visible: false }));
  headHit.position.set(0, 1.62, 0);
  group.add(torsoHit, headHit);
  return { group, parts, torsoHit, headHit };
}

export function createBots(scene, colliders, shootables) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 60;
  const bots = [];
  const allHitMeshes = [];
  let playerHitMeshes = [];

  function makeBot(def, team, index) {
    const visual = buildSoldier(team);
    scene.add(visual.group);
    const bot = {
      name: def.name,
      team,
      index,
      weaponId: def.weapon,
      carrier: !!def.carrier,
      mover: createMover(colliders, 0, 16, team === 'ember' ? 0 : Math.PI),
      hp: 100,
      armour: 0,
      alive: true,
      state: 'spawn',
      route: [],
      routeIdx: 0,
      targetNode: null,
      assignedSite: 'A',
      holdTimer: 0,
      losTimer: index * (LOS_INTERVAL / 9),
      reaction: 0,
      target: null, // { kind: 'player' | 'bot', ref, pos }
      lastSeen: -10,
      burstLeft: 0,
      burstTimer: 0,
      strafeDir: 1,
      strafeTimer: 0,
      yawTarget: 0,
      walkPhase: Math.random() * 6,
      visual,
      hitMeshes: [visual.torsoHit, visual.headHit],
    };
    visual.torsoHit.userData = { bot, part: 'torso' };
    visual.headHit.userData = { bot, part: 'head' };
    allHitMeshes.push(visual.torsoHit, visual.headHit);
    bots.push(bot);
    return bot;
  }

  EMBER_BOTS.forEach((def, i) => makeBot(def, 'ember', i));
  ASHFALL_BOTS.forEach((def, i) => makeBot(def, 'ashfall', 4 + i));

  function resetBot(bot, x, z, yaw) {
    bot.mover.state.position.set(x, 0, z);
    bot.mover.state.velocity.set(0, 0, 0);
    bot.mover.state.yaw = yaw;
    bot.mover.state.pitch = 0;
    bot.hp = 100;
    bot.armour = bot.team === 'ashfall' && bot.name === 'Vex' ? 50 : 0;
    bot.alive = true;
    bot.state = 'spawn';
    bot.route = [];
    bot.routeIdx = 0;
    bot.target = null;
    bot.burstLeft = 0;
    bot.holdTimer = 0;
    bot.visual.group.visible = true;
    bot.visual.group.rotation.set(0, yaw, 0);
    bot.visual.group.position.set(x, 0, z);
  }

  function setRoute(bot, toNode) {
    const from = nearestNode(bot.mover.state.position.x, bot.mover.state.position.z);
    const path = bfsPath(from, toNode);
    bot.route = path || [toNode];
    bot.routeIdx = 0;
  }

  function angleTo(mover, x, z) {
    return Math.atan2(-(x - mover.position.x), -(z - mover.position.z));
  }

  function turnToward(bot, targetYaw, dt, rate = 6) {
    const m = bot.mover.state;
    let diff = targetYaw - m.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const step = Math.max(-rate * dt, Math.min(rate * dt, diff));
    m.yaw += step;
    return Math.abs(diff) < 0.15;
  }

  function losClear(from, to) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const dist = dir.length();
    if (dist < 0.01) return true;
    dir.normalize();
    raycaster.set(from, dir);
    raycaster.far = dist;
    const hits = raycaster.intersectObjects(shootables, false);
    return hits.length === 0;
  }

  function scanForTarget(bot, ctx) {
    const eye = new THREE.Vector3(
      bot.mover.state.position.x,
      bot.mover.state.position.y + 1.5,
      bot.mover.state.position.z,
    );
    let best = null;
    let bestD = ENGAGE_RANGE;
    if (ctx.playerAlive) {
      const pp = ctx.playerPos;
      const d = Math.hypot(pp.x - eye.x, pp.z - eye.z);
      if (d < bestD) {
        const to = new THREE.Vector3(pp.x, pp.y + 1.3, pp.z);
        if (losClear(eye, to)) {
          best = { kind: 'player', ref: null, pos: to, dist: d };
          bestD = d;
        }
      }
    }
    for (const other of bots) {
      if (other === bot || !other.alive || other.team === bot.team) continue;
      const op = other.mover.state.position;
      const d = Math.hypot(op.x - eye.x, op.z - eye.z);
      if (d >= bestD) continue;
      const to = new THREE.Vector3(op.x, op.y + 1.3, op.z);
      if (losClear(eye, to)) {
        best = { kind: 'bot', ref: other, pos: to, dist: d };
        bestD = d;
      }
    }
    return best;
  }

  function fireBurstShot(bot, ctx) {
    const def = WEAPONS[bot.weaponId];
    const eye = new THREE.Vector3(
      bot.mover.state.position.x,
      bot.mover.state.position.y + 1.5,
      bot.mover.state.position.z,
    );
    const target = bot.target;
    if (!target) return;
    const tpos = target.kind === 'player' ? ctx.playerPos : target.ref.mover.state.position;
    const aim = new THREE.Vector3(tpos.x, tpos.y + 1.25, tpos.z);
    const dist = eye.distanceTo(aim);
    // Aim error scales with range and target speed.
    const speed = target.kind === 'player' ? ctx.playerSpeed : target.ref.mover.groundSpeed();
    const err = 0.02 + dist * 0.0012 + speed * 0.006;
    aim.x += (Math.random() * 2 - 1) * err * dist * 0.5;
    aim.y += (Math.random() * 2 - 1) * err * dist * 0.4;
    aim.z += (Math.random() * 2 - 1) * err * dist * 0.5;
    const dir = aim.sub(eye).normalize();
    raycaster.set(eye, dir);
    raycaster.far = 80;
    const hits = raycaster.intersectObjects(shootables.concat(allHitMeshes, playerHitMeshes), false);
    const end = eye.clone().add(dir.clone().multiplyScalar(60));
    if (hits.length) {
      const hit = hits[0];
      end.copy(hit.point);
      if (hit.object.userData.bot) {
        const victim = hit.object.userData.bot;
        const head = hit.object.userData.part === 'head';
        const dmg = damageAt(def, eye.distanceTo(hit.point), head);
        ctx.damageBot(victim, dmg, head, bot);
      } else if (hit.object.userData.isPlayer) {
        const head = hit.object.userData.part === 'head';
        const dmg = damageAt(def, eye.distanceTo(hit.point), head);
        ctx.damagePlayer(dmg, bot.mover.state.position, head);
      }
    }
    ctx.onBotShot(bot, eye, end);
    // Recoil + sound are the caller's job via onBotShot.
  }

  function updateBot(bot, dt, ctx) {
    if (!bot.alive) return;
    const m = bot.mover.state;
    const now = ctx.time;

    // --- Target scan (throttled, staggered) ---
    bot.losTimer -= dt;
    if (bot.losTimer <= 0) {
      bot.losTimer = LOS_INTERVAL;
      const seen = scanForTarget(bot, ctx);
      if (seen) {
        if (!bot.target) bot.reaction = REACTION_MIN + Math.random() * (REACTION_MAX - REACTION_MIN);
        bot.target = seen;
        bot.lastSeen = now;
        if (bot.state !== 'engage' && bot.state !== 'retreat') bot.state = 'engage';
      } else if (bot.target && now - bot.lastSeen > 1.5) {
        bot.target = null;
        if (bot.state === 'engage') {
          bot.state = 'push';
          if (bot.routeIdx < bot.route.length) bot.targetNode = bot.route[bot.routeIdx];
        }
      }
    }

    // --- Retreat at low HP ---
    if (bot.hp < RETREAT_HP && bot.state !== 'retreat' && bot.state !== 'plant' && bot.state !== 'defuse') {
      bot.state = 'retreat';
      const spawnNode = bot.team === 'ember' ? 'emberSpawn' : 'ashSpawn';
      setRoute(bot, spawnNode);
      bot.routeIdx = Math.min(1, bot.route.length - 1);
    }

    // --- State behaviour ---
    let keys = new Set();
    if (bot.state === 'spawn') {
      bot.holdTimer -= dt;
      if (bot.holdTimer <= 0) {
        bot.state = 'push';
        const site = bot.assignedSite;
        if (bot.team === 'ember') {
          const lane = bot.name === 'Kestrel' || bot.name === 'Bramble' ? (site === 'A' ? 'aLong1' : 'bShort1') : 'mid1';
          setRoute(bot, lane);
        } else {
          setRoute(bot, site === 'A' ? 'ashA' : 'ashB');
        }
      }
    } else if (bot.state === 'push' || bot.state === 'retreat') {
      if (bot.routeIdx >= bot.route.length) {
        if (bot.state === 'retreat') {
          bot.state = 'hold';
          bot.holdTimer = 3;
        } else if (bot.carrier && bot.team === 'ember' && !ctx.spikePlanted) {
          bot.state = 'plant';
        } else if (bot.defuseRunner && ctx.spikePlanted) {
          bot.state = 'defuse';
        } else {
          bot.state = 'hold';
          bot.holdTimer = 1.5;
        }
      } else {
        const nodeName = bot.route[bot.routeIdx];
        const [nx, nz] = NAV_NODES[nodeName];
        const d = Math.hypot(nx - m.position.x, nz - m.position.z);
        if (d < 0.8) {
          bot.routeIdx += 1;
        } else {
          const yawT = angleTo(m, nx, nz);
          if (turnToward(bot, yawT, dt)) {
            keys = keysToward(m, nx, nz, { sprint: bot.route.length - bot.routeIdx > 3 && bot.state === 'push' });
          }
        }
      }
    } else if (bot.state === 'hold') {
      bot.holdTimer -= dt;
      // Peek: slowly sweep yaw while holding.
      m.yaw += Math.sin(now * 0.7 + bot.index) * dt * 0.4;
      if (bot.holdTimer <= 0) {
        if (bot.carrier && bot.team === 'ember' && !ctx.spikePlanted) {
          setRoute(bot, bot.assignedSite === 'A' ? 'siteA' : 'siteB');
          bot.state = 'push';
        } else if (ctx.spikePlanted && bot.team === 'ashfall') {
          bot.defuseRunner = true;
          setRoute(bot, ctx.plantedSite === 'A' ? 'siteA' : 'siteB');
          bot.state = 'push';
        } else {
          bot.state = 'push';
          if (bot.routeIdx >= bot.route.length) setRoute(bot, bot.team === 'ember' ? (bot.assignedSite === 'A' ? 'siteA' : 'siteB') : (bot.assignedSite === 'A' ? 'ashA' : 'ashB'));
        }
      }
    } else if (bot.state === 'engage') {
      if (bot.target) {
        const tpos = bot.target.kind === 'player' ? ctx.playerPos : bot.target.ref.mover.state.position;
        const yawT = angleTo(m, tpos.x, tpos.z);
        turnToward(bot, yawT, dt, 8);
        bot.reaction -= dt;
        if (bot.reaction <= 0) {
          bot.burstTimer -= dt;
          if (bot.burstLeft <= 0 && bot.burstTimer <= 0) {
            bot.burstLeft = 3 + Math.floor(Math.random() * 3);
            bot.burstTimer = 0;
          }
          if (bot.burstLeft > 0 && bot.burstTimer <= 0) {
            fireBurstShot(bot, ctx);
            bot.burstLeft -= 1;
            bot.burstTimer = WEAPONS[bot.weaponId].gap + 0.05;
            if (bot.burstLeft === 0) bot.burstTimer = 0.5 + Math.random() * 0.7;
          }
          // Strafe between bursts.
          bot.strafeTimer -= dt;
          if (bot.strafeTimer <= 0) {
            bot.strafeDir *= -1;
            bot.strafeTimer = 0.6 + Math.random() * 0.8;
          }
          if (bot.burstLeft === 0) {
            keys = new Set([bot.strafeDir > 0 ? 'KeyD' : 'KeyA']);
          }
        }
      }
    } else if (bot.state === 'plant') {
      const site = SITES[bot.assignedSite];
      const d = Math.hypot(site.x - m.position.x, site.z - m.position.z);
      if (d > site.r * 0.7) {
        const yawT = angleTo(m, site.x, site.z);
        if (turnToward(bot, yawT, dt)) keys = keysToward(m, site.x, site.z);
      } else {
        ctx.requestPlant(bot);
      }
    } else if (bot.state === 'defuse') {
      const site = SITES[ctx.plantedSite];
      const d = Math.hypot(site.x - m.position.x, site.z - m.position.z);
      if (d > site.r * 0.6) {
        const yawT = angleTo(m, site.x, site.z);
        if (turnToward(bot, yawT, dt)) keys = keysToward(m, site.x, site.z);
      } else {
        ctx.requestDefuse(bot);
      }
    }

    // --- Physics (shared mover; bots walk at BOT_SPEED via key shim) ---
    const prevSpeed = m.velocity.length();
    bot.mover.step(dt, keys);
    // Clamp bot speed to BOT_SPEED (the mover's walk speed is the player's).
    const hSpeed = Math.hypot(m.velocity.x, m.velocity.z);
    if (hSpeed > BOT_SPEED) {
      m.velocity.x *= BOT_SPEED / hSpeed;
      m.velocity.z *= BOT_SPEED / hSpeed;
    }

    // --- Visual sync + walk cycle ---
    const g = bot.visual.group;
    g.position.set(m.position.x, m.position.y, m.position.z);
    g.rotation.y = m.yaw;
    const moving = hSpeed > 0.5;
    if (moving) bot.walkPhase += dt * hSpeed * 1.6;
    const swing = moving ? Math.sin(bot.walkPhase) * 0.5 : 0;
    bot.visual.parts.legL.rotation.x = swing;
    bot.visual.parts.legR.rotation.x = -swing;
    bot.visual.parts.armL.rotation.x = -1.1 - swing * 0.25;
    bot.visual.parts.armR.rotation.x = -1.1 + swing * 0.25;
    void prevSpeed;
  }

  function update(dt, ctx) {
    for (const bot of bots) updateBot(bot, dt, ctx);
  }

  function onSpikePlanted(siteKey) {
    // Two nearest living Ashfall bots rotate to the planted site to defuse.
    const site = SITES[siteKey];
    const ash = bots
      .filter((b) => b.team === 'ashfall' && b.alive)
      .map((b) => ({ b, d: Math.hypot(b.mover.state.position.x - site.x, b.mover.state.position.z - site.z) }))
      .sort((a, b2) => a.d - b2.d);
    for (const { b } of ash.slice(0, 2)) {
      setRoute(b, siteKey === 'A' ? 'siteA' : 'siteB');
      b.state = 'push';
      b.defuseRunner = true;
    }
  }

  function markDefuseRunner(bot) {
    bot.state = 'defuse';
  }

  return {
    bots,
    allHitMeshes,
    update,
    resetBot,
    setRoute,
    onSpikePlanted,
    markDefuseRunner,
    setPlayerHitMeshes(meshes) {
      playerHitMeshes = meshes;
    },
    aliveCount(team) {
      return bots.filter((b) => b.team === team && b.alive).length;
    },
  };
}
