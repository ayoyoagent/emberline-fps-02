// Shared mover physics for the player and every bot: acceleration,
// friction, gravity, crouch and jump, resolved as a box against the world's
// colliders one axis at a time, so a wall never swallows a mover. No
// teleporting: bots move through this exact code.
import * as THREE from 'three';

const RADIUS = 0.34;
const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
export const WALK_SPEED = 4.6;
export const SPRINT_SPEED = 6.2;
export const CROUCH_SPEED = 2.4;
const GROUND_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 9;
const GRAVITY = 20;
const JUMP_SPEED = 6.2;

export function createMover(colliders, startX = 0, startZ = 0, startYaw = 0) {
  const mover = {
    position: new THREE.Vector3(startX, 0, startZ),
    velocity: new THREE.Vector3(),
    yaw: startYaw,
    pitch: 0,
    eye: STAND_EYE,
    onGround: true,
    crouching: false,
    height: STAND_HEIGHT,
  };
  const probe = new THREE.Box3();
  const wish = new THREE.Vector3();

  // lift keeps the feet and the crown out of the horizontal tests, so
  // standing on the floor is not read as walking into a wall.
  function overlaps(x, y, z, height, lift) {
    probe.min.set(x - RADIUS, y + lift, z - RADIUS);
    probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return collider;
    return null;
  }

  function look(dx, dy, sensitivity = 0.0022) {
    mover.yaw -= dx * sensitivity;
    mover.pitch = Math.max(-1.45, Math.min(1.45, mover.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    mover.pitch = Math.min(1.45, mover.pitch + pitchKick);
    mover.yaw += yawKick;
  }

  function step(dt, keys) {
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (crouching && !mover.crouching) {
      mover.crouching = true;
      mover.height = CROUCH_HEIGHT;
    } else if (!crouching && mover.crouching && !overlaps(mover.position.x, mover.position.y, mover.position.z, STAND_HEIGHT, 0.02)) {
      mover.crouching = false;
      mover.height = STAND_HEIGHT;
    }
    const eyeTarget = mover.crouching ? CROUCH_EYE : STAND_EYE;
    mover.eye += (eyeTarget - mover.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (forward || strafe) {
      const sin = Math.sin(mover.yaw);
      const cos = Math.cos(mover.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }

    const sprinting = (keys.has('ShiftLeft') || keys.has('ShiftRight')) && forward > 0 && !mover.crouching;
    const speed = mover.crouching ? CROUCH_SPEED : sprinting ? SPRINT_SPEED : WALK_SPEED;
    const blend = Math.min(1, (mover.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt / speed);
    mover.velocity.x += (wish.x * speed - mover.velocity.x) * blend;
    mover.velocity.z += (wish.z * speed - mover.velocity.z) * blend;
    if (mover.onGround && !wish.lengthSq()) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      mover.velocity.x *= damp;
      mover.velocity.z *= damp;
    }

    if (keys.has('Space') && mover.onGround) {
      mover.velocity.y = JUMP_SPEED;
      mover.onGround = false;
    }
    mover.velocity.y -= GRAVITY * dt;

    const nextX = mover.position.x + mover.velocity.x * dt;
    if (!overlaps(nextX, mover.position.y, mover.position.z, mover.height, 0.04)) mover.position.x = nextX;
    else mover.velocity.x = 0;
    const nextZ = mover.position.z + mover.velocity.z * dt;
    if (!overlaps(mover.position.x, mover.position.y, nextZ, mover.height, 0.04)) mover.position.z = nextZ;
    else mover.velocity.z = 0;

    mover.position.y += mover.velocity.y * dt;
    mover.onGround = false;
    const hit = overlaps(mover.position.x, mover.position.y, mover.position.z, mover.height, 0);
    if (hit && mover.velocity.y <= 0) {
      mover.position.y = hit.max.y;
      mover.velocity.y = 0;
      mover.onGround = true;
    } else if (hit) {
      mover.position.y = hit.min.y - mover.height;
      mover.velocity.y = 0;
    }
    if (mover.position.y < 0) {
      mover.position.y = 0;
      mover.velocity.y = 0;
      mover.onGround = true;
    }
    mover.velocity.y = Math.max(-30, mover.velocity.y);
  }

  return {
    state: mover,
    step,
    look,
    recoil,
    groundSpeed() {
      return Math.hypot(mover.velocity.x, mover.velocity.z);
    },
  };
}

// Keys for a bot that wants to walk toward a world-space target point:
// returns the synthetic key set the mover understands.
export function keysToward(mover, targetX, targetZ, opts = {}) {
  const keys = new Set();
  const dx = targetX - mover.position.x;
  const dz = targetZ - mover.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.15) return keys;
  // Desired heading: yaw 0 faces -Z. Heading angle of the target.
  const want = Math.atan2(-dx, -dz);
  let diff = want - mover.yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) > 0.5) {
    // Too far off-axis: turn in place (handled by the caller setting yaw).
    return keys;
  }
  keys.add('KeyW');
  if (opts.sprint) keys.add('ShiftLeft');
  if (opts.crouch) keys.add('KeyC');
  if (opts.strafeLeft) keys.add('KeyA');
  if (opts.strafeRight) keys.add('KeyD');
  return keys;
}
