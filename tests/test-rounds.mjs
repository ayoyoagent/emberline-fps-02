// EMBERLINE logic tests (Node, no DOM, no THREE beyond the local stub):
// match lifecycle, economy, plant/defuse channels, nav-graph BFS, weapon
// stats + damage falloff, and shared mover physics. Run: node tests/test-rounds.mjs
import { createMatch, createChannel, BUY_TIME, ROUND_TIME, SPIKE_TIME, START_MONEY } from '../game/src/rounds.js';
import { bfsPath, nearestNode, NAV_NODES, COLLIDERS } from '../game/src/world.js';
import { WEAPONS, damageAt } from '../game/src/weapons.js';
import { createMover } from '../game/src/player.js';
import * as THREE from 'three';

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond) { pass += 1; console.log('PASS', name); }
  else { fail += 1; console.log('FAIL', name); }
};

// --- match lifecycle ---
const m = createMatch();
check('start money 800', m.state.money === START_MONEY);
check('starts in buy phase', m.state.phase === 'buy');
check('buy rifle fails (800 < 2700)', m.buy('rifle').ok === false);
check('buy smg fails (800 < 1500)', m.buy('smg').ok === false);
m.state.money = 3000;
check('buy rifle ok at 3000', m.buy('rifle').ok === true);
check('money after rifle 300', m.state.money === 300);
check('buy armor fails at 300', m.buy('armor').ok === false);
m.state.money = 1000;
check('buy armor ok at 1000', m.buy('armor').ok === true && m.state.money === 350);
check('buy grenade ok at 350', m.buy('grenade').ok === true && m.state.money === 50);
m.state.money = 1000;
check('buy grenade 2nd ok', m.buy('grenade').ok === true);
check('buy grenade 3rd fails (max 2)', m.buy('grenade').ok === false);
m.step(BUY_TIME + 0.1, { ember: 5, ashfall: 5 }, false);
check('buy phase -> live', m.state.phase === 'live');
check('buy outside buy phase fails', m.buy('smg').ok === false);
m.step(0.1, { ember: 0, ashfall: 3 }, false);
check('elimination -> ashfall wins round', m.state.roundWinner === 'ashfall' && m.state.score.ashfall === 1);
check('loss reward applied (700 + 1900)', m.state.money === 700 + 1900);
check('phase end', m.state.phase === 'end');
check('next round', m.nextRound() === true && m.state.round === 2 && m.state.phase === 'buy');
m.step(BUY_TIME + 0.1, { ember: 5, ashfall: 5 }, false);
m.step(ROUND_TIME + 0.1, { ember: 3, ashfall: 2 }, false);
check('time expiry -> ashfall', m.state.roundWinner === 'ashfall' && m.state.roundReason === 'time');
m.nextRound();
m.step(BUY_TIME + 0.1, { ember: 5, ashfall: 5 }, false);
m.step(50, { ember: 3, ashfall: 2 }, false); // 50s left on the round clock
m.step(40, { ember: 3, ashfall: 2 }, true); // spike planted: clock stops mattering
check('spike planted: no time loss', m.state.phase === 'live' && m.state.spike === 'planted');
m.step(SPIKE_TIME + 0.1, { ember: 3, ashfall: 2 }, true);
check('spike timer -> detonation, ember wins', m.state.roundWinner === 'ember' && m.state.roundReason === 'detonation');

// loss ladder: 1900 / 2400 / 2900, capped at 2 steps
const mL = createMatch();
check('loss ladder step 0 = 1900', mL.lossReward() === 1900);
mL.state.losses = 1;
check('loss ladder step 1 = 2400', mL.lossReward() === 2400);
mL.state.losses = 2;
check('loss ladder step 2 = 2900', mL.lossReward() === 2900);
mL.state.losses = 5;
check('loss ladder capped at 2900', mL.lossReward() === 2900);

// kill + objective rewards
const mK = createMatch();
mK.onKill();
check('kill reward +300', mK.state.money === START_MONEY + 300);
mK.onObjective();
check('objective reward +300', mK.state.money === START_MONEY + 600);

// defuse ends the round for Ashfall
const mD = createMatch();
mD.step(BUY_TIME + 0.1, { ember: 5, ashfall: 5 }, false);
mD.step(1, { ember: 5, ashfall: 5 }, true);
mD.onDefuse();
check('defuse -> ashfall wins round', mD.state.roundWinner === 'ashfall' && mD.state.roundReason === 'defuse');

// first to 7 + 13-round decider + match over blocks further rounds
const m2 = createMatch();
for (let i = 0; i < 7; i += 1) { m2.endRound('ember', 'elimination'); if (m2.state.phase !== 'over') m2.state.phase = 'buy'; }
check('7 rounds -> ember match winner', m2.state.winner === 'ember' && m2.state.phase === 'over');
check('endRound after match over is rejected', m2.endRound('ashfall', 'elimination') === false);
check('nextRound after match over is rejected', m2.nextRound() === false);
const m3 = createMatch();
for (let i = 0; i < 6; i += 1) { m3.endRound('ember', 'elimination'); m3.state.phase = 'buy'; m3.state.round += 1; }
for (let i = 0; i < 6; i += 1) { m3.endRound('ashfall', 'elimination'); m3.state.phase = 'buy'; m3.state.round += 1; }
m3.state.round = 13;
m3.endRound('ember', 'elimination');
check('13th round decides (no draw)', m3.state.winner === 'ember');

// plant/defuse channels
const ch = createChannel(3.5);
ch.start();
check('channel holds without completing', ch.hold(1) === false && ch.progress === 1);
check('channel completes at duration', ch.hold(2.5) === true);
ch.start();
ch.hold(1);
ch.break();
check('channel break resets progress', ch.progress === 0 && ch.active === false);

// --- nav graph (Ember Yard, 27 nodes) ---
check('nav nodes count 27', Object.keys(NAV_NODES).length === 27);
check('bfs emberSpawn->siteA via A-long', JSON.stringify(bfsPath('emberSpawn', 'siteA')) === JSON.stringify(['emberSpawn', 'aLong1', 'aLong2', 'aLong3', 'aLong4', 'aEntry', 'siteA']));
check('bfs emberSpawn->siteB via mid', JSON.stringify(bfsPath('emberSpawn', 'siteB')) === JSON.stringify(['emberSpawn', 'mid1', 'mid2', 'mid3', 'mid4', 'midB', 'siteB']));
check('bfs ashSpawn->siteA short', bfsPath('ashSpawn', 'siteA').length === 3);
check('bfs aLong2->mid3 routes through the warehouse', JSON.stringify(bfsPath('aLong2', 'mid3')) === JSON.stringify(['aLong2', 'whDoorS', 'mid2', 'mid3']));
check('bfs unknown node is null', bfsPath('emberSpawn', 'nope') === null);
check('bfs same node is single', JSON.stringify(bfsPath('siteA', 'siteA')) === JSON.stringify(['siteA']));
check('nearest node to (0,15) is emberSpawn', nearestNode(0, 15) === 'emberSpawn');
check('nearest node to (-19,-13) is siteA', nearestNode(-19, -13) === 'siteA');
check('nearest node to (17,-13) is siteB', nearestNode(17, -13) === 'siteB');

// --- weapons ---
check('rifle damage 33', WEAPONS.rifle.damage === 33);
check('sniper head 115*4=460', WEAPONS.sniper.damage * WEAPONS.sniper.headMult === 460);
check('grenade fuse 3', WEAPONS.grenade.fuse === 3.0);
check('grenade radius 5.5', WEAPONS.grenade.radius === 5.5);
check('pistol is free', WEAPONS.pistol.price === 0);
check('damageAt rifle at 25m is full 33', damageAt(WEAPONS.rifle, 25, false) === 33);
check('damageAt rifle at 55m falls off to 19.8', Math.abs(damageAt(WEAPONS.rifle, 55, false) - 19.8) < 0.01);
check('damageAt rifle headshot at 10m is 105.6', Math.abs(damageAt(WEAPONS.rifle, 10, true) - 105.6) < 0.01);

// --- shared mover physics (Box3 colliders from the map) ---
const boxColliders = COLLIDERS.map(([x0, y0, z0, x1, y1, z1]) =>
  new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)));
const mover = createMover(boxColliders, 0, 17.5, 0);
for (let i = 0; i < 60; i += 1) mover.step(1 / 60, new Set(['KeyW']));
check('mover walks north (z decreases)', mover.state.position.z < 16.5);
check('mover stops at the spawn cover wall', mover.state.position.z > 14.5);
const mover2 = createMover(boxColliders, 0, 16, 0);
for (let i = 0; i < 30; i += 1) mover2.step(1 / 60, new Set(['KeyW', 'ControlLeft']));
check('crouch lowers the eye', mover2.state.eye < 1.3 && mover2.state.crouching === true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
