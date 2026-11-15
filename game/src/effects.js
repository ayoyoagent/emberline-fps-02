// Pooled visual effects: tracers, impact sparks/dust, muzzle smoke,
// explosions (fireball + expanding ring + smoke column + flickering light),
// animated barrel flames with point lights, and screen shake. Fixed pools,
// no per-frame allocations: every particle is preallocated and reused.
import * as THREE from 'three';

const TRACER_POOL = 24;
const SPARK_POOL = 160;
const SMOKE_POOL = 40;

function makeGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

export function createEffects(scene, flameTexture) {
  const glowTex = makeGlowTexture();
  const group = new THREE.Group();
  scene.add(group);

  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const tracers = [];
  for (let i = 0; i < TRACER_POOL; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, tracerMat.clone());
    line.visible = false;
    line.frustumCulled = false;
    group.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIdx = 0;

  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(SPARK_POOL * 3);
  const sparkCol = new Float32Array(SPARK_POOL * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3));
  const sparkMat = new THREE.PointsMaterial({
    size: 0.09, vertexColors: true, transparent: true, opacity: 0.95,
    map: glowTex, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const sparkPoints = new THREE.Points(sparkGeo, sparkMat);
  sparkPoints.frustumCulled = false;
  group.add(sparkPoints);
  const sparks = [];
  for (let i = 0; i < SPARK_POOL; i += 1) {
    sparks.push({ life: 0, vx: 0, vy: 0, vz: 0, x: 0, y: -100, z: 0 });
  }
  let sparkIdx = 0;

  const smokeTex = glowTex;
  const smokes = [];
  for (let i = 0; i < SMOKE_POOL; i += 1) {
    const mat = new THREE.SpriteMaterial({ map: smokeTex, color: 0x8a8578, transparent: true, opacity: 0, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.visible = false;
    group.add(sprite);
    smokes.push({ sprite, life: 0, max: 1, vx: 0, vy: 0, vz: 0, grow: 1 });
  }
  let smokeIdx = 0;

  const boomMat = new THREE.SpriteMaterial({ map: flameTexture || glowTex, color: 0xffa030, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const boom = new THREE.Sprite(boomMat);
  boom.visible = false;
  group.add(boom);
  const ringGeo = new THREE.RingGeometry(0.4, 0.55, 32);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  group.add(ring);
  const boomLight = new THREE.PointLight(0xff8030, 0, 26);
  group.add(boomLight);
  let boomLife = 0;
  let boomMax = 1;

  const flames = [];
  function addFire(x, y, z, scale = 1) {
    const mat = new THREE.SpriteMaterial({ map: flameTexture || glowTex, color: 0xffb340, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(x, y + 0.35 * scale, z);
    sprite.scale.set(0.7 * scale, 1.0 * scale, 1);
    group.add(sprite);
    const light = new THREE.PointLight(0xff8030, 14, 9);
    light.position.set(x, y + 0.5, z);
    group.add(light);
    flames.push({ sprite, light, base: scale, phase: Math.random() * 10 });
    return sprite;
  }

  let trauma = 0;
  const shakeOffset = { x: 0, y: 0 };
  const tmpV = new THREE.Vector3();

  function spawnTracer(from, to) {
    const t = tracers[tracerIdx];
    tracerIdx = (tracerIdx + 1) % TRACER_POOL;
    const pos = t.line.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    t.line.visible = true;
    t.life = 0.07;
  }

  function spawnImpact(point, kind) {
    const count = kind === 'flesh' ? 8 : 12;
    for (let n = 0; n < count; n += 1) {
      const s = sparks[sparkIdx];
      sparkIdx = (sparkIdx + 1) % SPARK_POOL;
      s.x = point.x;
      s.y = point.y;
      s.z = point.z;
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * 2.5 + 0.5;
      const sp = Math.random() * 2.5 + 0.8;
      s.vx = Math.cos(a) * sp;
      s.vy = up;
      s.vz = Math.sin(a) * sp;
      s.life = 0.25 + Math.random() * 0.3;
      const c = kind === 'flesh' ? [0.9, 0.15, 0.1] : kind === 'wood' ? [0.85, 0.6, 0.25] : [1.0, 0.8, 0.4];
      sparkCol[sparkIdx * 3] = c[0];
      sparkCol[sparkIdx * 3 + 1] = c[1];
      sparkCol[sparkIdx * 3 + 2] = c[2];
    }
    sparkGeo.attributes.color.needsUpdate = true;
  }

  function spawnSmoke(point, big = false) {
    const s = smokes[smokeIdx];
    smokeIdx = (smokeIdx + 1) % SMOKE_POOL;
    s.sprite.position.copy(point);
    s.sprite.visible = true;
    s.life = 0;
    s.max = big ? 2.2 : 0.9;
    s.vx = (Math.random() - 0.5) * 0.4;
    s.vy = big ? 1.6 : 0.5;
    s.vz = (Math.random() - 0.5) * 0.4;
    s.grow = big ? 3.2 : 1.1;
    s.sprite.material.opacity = big ? 0.55 : 0.4;
    const sc = big ? 1.2 : 0.45;
    s.sprite.scale.set(sc, sc, 1);
  }

  function spawnExplosion(point, big = true) {
    boom.position.copy(point);
    boom.position.y += 0.8;
    boom.visible = true;
    boomLife = 0;
    boomMax = big ? 0.9 : 0.5;
    ring.position.set(point.x, point.y + 0.15, point.z);
    ring.visible = true;
    boomLight.position.set(point.x, point.y + 1.2, point.z);
    for (let n = 0; n < 26; n += 1) {
      const s = sparks[sparkIdx];
      sparkIdx = (sparkIdx + 1) % SPARK_POOL;
      s.x = point.x;
      s.y = point.y + 0.5;
      s.z = point.z;
      const a = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 7;
      s.vx = Math.cos(a) * sp;
      s.vy = Math.random() * 6 + 1;
      s.vz = Math.sin(a) * sp;
      s.life = 0.4 + Math.random() * 0.5;
      sparkCol[sparkIdx * 3] = 1.0;
      sparkCol[sparkIdx * 3 + 1] = 0.55 + Math.random() * 0.3;
      sparkCol[sparkIdx * 3 + 2] = 0.15;
    }
    sparkGeo.attributes.color.needsUpdate = true;
    for (let n = 0; n < (big ? 6 : 3); n += 1) {
      tmpV.set(point.x + (Math.random() - 0.5) * 1.5, point.y + 0.6 + Math.random(), point.z + (Math.random() - 0.5) * 1.5);
      spawnSmoke(tmpV, big);
    }
    trauma = Math.min(1, trauma + (big ? 0.85 : 0.4));
  }

  function update(dt, time) {
    for (const t of tracers) {
      if (!t.line.visible) continue;
      t.life -= dt;
      if (t.life <= 0) t.line.visible = false;
      else t.line.material.opacity = Math.max(0, t.life / 0.07) * 0.9;
    }
    let anySpark = false;
    for (let i = 0; i < SPARK_POOL; i += 1) {
      const s = sparks[i];
      if (s.life <= 0) {
        sparkPos[i * 3 + 1] = -100;
        continue;
      }
      anySpark = true;
      s.life -= dt;
      s.vy -= 9 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      if (s.y < 0.02) {
        s.y = 0.02;
        s.vy *= -0.3;
        s.vx *= 0.7;
        s.vz *= 0.7;
      }
      sparkPos[i * 3] = s.x;
      sparkPos[i * 3 + 1] = s.y;
      sparkPos[i * 3 + 2] = s.z;
    }
    if (anySpark) sparkGeo.attributes.position.needsUpdate = true;
    for (const s of smokes) {
      if (!s.sprite.visible) continue;
      s.life += dt;
      const t = s.life / s.max;
      if (t >= 1) {
        s.sprite.visible = false;
        continue;
      }
      s.sprite.position.x += s.vx * dt;
      s.sprite.position.y += s.vy * dt;
      s.sprite.position.z += s.vz * dt;
      const sc = s.sprite.scale.x + s.grow * dt;
      s.sprite.scale.set(sc, sc, 1);
      s.sprite.material.opacity = (s.max > 1.5 ? 0.55 : 0.4) * (1 - t);
    }
    if (boom.visible) {
      boomLife += dt;
      const t = boomLife / boomMax;
      if (t >= 1) {
        boom.visible = false;
        ring.visible = false;
        boomLight.intensity = 0;
      } else {
        const sc = 1 + t * 7;
        boom.scale.set(sc, sc * 1.15, 1);
        boomMat.opacity = 0.95 * (1 - t);
        const r = 0.5 + t * 6;
        ring.scale.set(r, r, 1);
        ringMat.opacity = 0.7 * (1 - t);
        boomLight.intensity = 60 * (1 - t) * (0.8 + Math.random() * 0.4);
      }
    }
    for (const f of flames) {
      const w = Math.sin(time * 11 + f.phase) * 0.5 + Math.sin(time * 23 + f.phase * 2) * 0.5;
      const s = f.base * (1 + w * 0.12);
      f.sprite.scale.set(0.7 * s, (1.0 + w * 0.18) * f.base, 1);
      f.sprite.material.opacity = 0.85 + w * 0.12;
      f.light.intensity = 14 * (1 + w * 0.25);
    }
    trauma = Math.max(0, trauma - dt * 1.4);
    const sh = trauma * trauma;
    shakeOffset.x = sh * 0.06 * (Math.random() * 2 - 1);
    shakeOffset.y = sh * 0.06 * (Math.random() * 2 - 1);
  }

  return {
    group,
    addFire,
    spawnTracer,
    spawnImpact,
    spawnSmoke,
    spawnExplosion,
    shake(amount) {
      trauma = Math.min(1, trauma + amount);
    },
    shakeOffset,
    update,
  };
}
