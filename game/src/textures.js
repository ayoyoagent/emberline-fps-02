// Procedural canvas textures, seeded and deterministic (mulberry32). No
// downloaded assets. Returns all-null when there is no DOM (Node tests),
// and world.js falls back to flat colours. One texture tile covers TILE_M
// metres; world.js scales box UVs per face so bricks stay brick-sized.
// New in this build vs the practice look: wood planks, hazard stripes,
// canvas signage ("A"/"B" + arrows), soot + cracks on the brick, moss and
// oil stains on the floor, rust dents on the corrugated metal.

export const TILE_M = 2;

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

function makeCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return [canvas, canvas.getContext('2d')];
}

function toTexture(canvas, THREE, srgb = true) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function brickTexture(THREE) {
  const [c, g] = makeCanvas(512);
  const rnd = mulberry32(0xB91C);
  g.fillStyle = '#c9b8a4';
  g.fillRect(0, 0, 512, 512);
  const bw = 64;
  const bh = 32;
  for (let row = 0; row < 16; row += 1) {
    const off = row % 2 ? bw / 2 : 0;
    for (let col = -1; col < 9; col += 1) {
      const tone = 0.82 + rnd() * 0.36;
      const r = Math.floor(164 * tone);
      const gg = Math.floor(85 * tone);
      const b = Math.floor(63 * tone);
      g.fillStyle = `rgb(${r},${gg},${b})`;
      g.fillRect(col * bw + off + 2, row * bh + 2, bw - 4, bh - 4);
      g.fillStyle = 'rgba(0,0,0,0.08)';
      for (let s = 0; s < 6; s += 1) {
        g.fillRect(col * bw + off + 4 + rnd() * (bw - 10), row * bh + 4 + rnd() * (bh - 8), 3, 2);
      }
    }
  }
  for (let i = 0; i < 7; i += 1) {
    const x = rnd() * 512;
    const y = rnd() * 512;
    const rad = 30 + rnd() * 70;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, 'rgba(30,25,20,0.28)');
    grad.addColorStop(1, 'rgba(30,25,20,0)');
    g.fillStyle = grad;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  g.strokeStyle = 'rgba(40,30,25,0.5)';
  g.lineWidth = 1;
  for (let i = 0; i < 5; i += 1) {
    let x = rnd() * 512;
    let y = rnd() * 512;
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 0; s < 6; s += 1) {
      x += (rnd() - 0.5) * 36;
      y += rnd() * 22;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  return toTexture(c, THREE);
}

function concreteTexture(THREE) {
  const [c, g] = makeCanvas(512);
  const rnd = mulberry32(0xC0C0);
  g.fillStyle = '#b9b3a6';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 5200; i += 1) {
    const v = 150 + Math.floor(rnd() * 70);
    g.fillStyle = `rgba(${v},${v - 4},${v - 12},${0.12 + rnd() * 0.2})`;
    g.fillRect(rnd() * 512, rnd() * 512, 1 + rnd() * 3, 1 + rnd() * 3);
  }
  for (let i = 0; i < 9; i += 1) {
    const x = rnd() * 512;
    const w = 6 + rnd() * 18;
    const grad = g.createLinearGradient(x, 0, x, 512);
    grad.addColorStop(0, 'rgba(70,72,66,0.25)');
    grad.addColorStop(1, 'rgba(70,72,66,0)');
    g.fillStyle = grad;
    g.fillRect(x, 0, w, 512);
  }
  g.strokeStyle = 'rgba(60,58,52,0.35)';
  g.lineWidth = 2;
  for (const y of [128, 256, 384]) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(512, y);
    g.stroke();
  }
  return toTexture(c, THREE);
}

function floorTexture(THREE) {
  const [c, g] = makeCanvas(512);
  const rnd = mulberry32(0xF100);
  const cols = ['#b5aea0', '#ada693', '#bab3a5', '#a8a191'];
  for (let ty = 0; ty < 2; ty += 1) {
    for (let tx = 0; tx < 2; tx += 1) {
      g.fillStyle = cols[ty * 2 + tx];
      g.fillRect(tx * 256, ty * 256, 256, 256);
      const grad = g.createRadialGradient(tx * 256 + 128, ty * 256 + 128, 20, tx * 256 + 128, ty * 256 + 128, 180);
      grad.addColorStop(0, 'rgba(255,255,255,0.10)');
      grad.addColorStop(1, 'rgba(0,0,0,0.12)');
      g.fillStyle = grad;
      g.fillRect(tx * 256, ty * 256, 256, 256);
    }
  }
  g.strokeStyle = 'rgba(70,66,58,0.55)';
  g.lineWidth = 4;
  g.strokeRect(2, 2, 508, 508);
  g.beginPath();
  g.moveTo(256, 0);
  g.lineTo(256, 512);
  g.moveTo(0, 256);
  g.lineTo(512, 256);
  g.stroke();
  for (let i = 0; i < 26; i += 1) {
    const onJoint = rnd() < 0.6;
    const x = onJoint ? (rnd() < 0.5 ? 256 + (rnd() - 0.5) * 14 : rnd() * 512) : rnd() * 512;
    const y = onJoint ? (rnd() < 0.5 ? rnd() * 512 : 256 + (rnd() - 0.5) * 14) : rnd() * 512;
    g.fillStyle = `rgba(110,125,80,${0.15 + rnd() * 0.25})`;
    g.beginPath();
    g.arc(x, y, 3 + rnd() * 9, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 6; i += 1) {
    const x = rnd() * 512;
    const y = rnd() * 512;
    const rad = 22 + rnd() * 42;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, 'rgba(25,22,18,0.5)');
    grad.addColorStop(1, 'rgba(25,22,18,0)');
    g.fillStyle = grad;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  g.strokeStyle = 'rgba(50,48,44,0.45)';
  g.lineWidth = 1;
  for (let i = 0; i < 6; i += 1) {
    let x = rnd() * 512;
    let y = rnd() * 512;
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 0; s < 5; s += 1) {
      x += (rnd() - 0.5) * 44;
      y += (rnd() - 0.5) * 44;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  return toTexture(c, THREE);
}

function corrugatedTexture(THREE) {
  const [c, g] = makeCanvas(512);
  const rnd = mulberry32(0xC099);
  g.fillStyle = '#d8d8d4';
  g.fillRect(0, 0, 512, 512);
  for (let x = 0; x < 512; x += 32) {
    const grad = g.createLinearGradient(x, 0, x + 32, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0.25)');
    grad.addColorStop(0.5, 'rgba(0,0,0,0.18)');
    grad.addColorStop(1, 'rgba(255,255,255,0.1)');
    g.fillStyle = grad;
    g.fillRect(x, 0, 32, 512);
  }
  for (let i = 0; i < 26; i += 1) {
    const x = rnd() * 512;
    const y = rnd() * 300;
    const len = 30 + rnd() * 130;
    const grad = g.createLinearGradient(x, y, x, y + len);
    grad.addColorStop(0, `rgba(138,74,43,${0.25 + rnd() * 0.35})`);
    grad.addColorStop(1, 'rgba(138,74,43,0)');
    g.fillStyle = grad;
    g.fillRect(x, y, 3 + rnd() * 6, len);
  }
  for (let i = 0; i < 12; i += 1) {
    const x = rnd() * 512;
    const y = rnd() * 512;
    const rad = 8 + rnd() * 18;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, 'rgba(0,0,0,0.22)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  return toTexture(c, THREE);
}

function woodTexture(THREE) {
  const [c, g] = makeCanvas(512);
  const rnd = mulberry32(0x9000);
  g.fillStyle = '#8a6f4d';
  g.fillRect(0, 0, 512, 512);
  for (let p = 0; p < 6; p += 1) {
    const y0 = p * 86;
    const tone = 0.85 + rnd() * 0.3;
    g.fillStyle = `rgb(${Math.floor(138 * tone)},${Math.floor(111 * tone)},${Math.floor(77 * tone)})`;
    g.fillRect(0, y0 + 2, 512, 82);
    g.strokeStyle = 'rgba(60,42,24,0.35)';
    g.lineWidth = 1;
    for (let i = 0; i < 5; i += 1) {
      const gy = y0 + 8 + rnd() * 70;
      g.beginPath();
      g.moveTo(0, gy);
      for (let x = 0; x <= 512; x += 64) g.lineTo(x, gy + (rnd() - 0.5) * 8);
      g.stroke();
    }
    if (rnd() < 0.7) {
      const kx = rnd() * 512;
      const ky = y0 + 20 + rnd() * 46;
      g.strokeStyle = 'rgba(50,34,18,0.6)';
      g.beginPath();
      g.ellipse(kx, ky, 7, 4, 0, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = 'rgba(30,22,14,0.6)';
    g.fillRect(0, y0, 512, 3);
  }
  return toTexture(c, THREE);
}

function hazardTexture(THREE) {
  const [c, g] = makeCanvas(256);
  g.fillStyle = '#e8a13a';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#1d1a16';
  for (let x = -256; x < 512; x += 64) {
    g.beginPath();
    g.moveTo(x, 256);
    g.lineTo(x + 32, 256);
    g.lineTo(x + 32 + 256, 0);
    g.lineTo(x + 256, 0);
    g.closePath();
    g.fill();
  }
  const rnd = mulberry32(0x9A2);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  for (let i = 0; i < 30; i += 1) g.fillRect(rnd() * 256, rnd() * 256, 4 + rnd() * 14, 2 + rnd() * 4);
  return toTexture(c, THREE);
}

function signTexture(THREE, letter, arrow) {
  const [c, g] = makeCanvas(256);
  g.clearRect(0, 0, 256, 256);
  g.fillStyle = '#f5a623';
  g.beginPath();
  g.roundRect(8, 8, 240, 240, 18);
  g.fill();
  g.strokeStyle = '#1d1a16';
  g.lineWidth = 10;
  g.beginPath();
  g.roundRect(16, 16, 224, 224, 12);
  g.stroke();
  g.fillStyle = '#1d1a16';
  g.font = 'bold 150px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(letter, 128, 108);
  g.beginPath();
  if (arrow === 'up') {
    g.moveTo(128, 168);
    g.lineTo(98, 208);
    g.lineTo(118, 208);
    g.lineTo(118, 228);
    g.lineTo(138, 228);
    g.lineTo(138, 208);
    g.lineTo(158, 208);
  } else {
    g.moveTo(128, 228);
    g.lineTo(158, 188);
    g.lineTo(138, 188);
    g.lineTo(138, 168);
    g.lineTo(118, 168);
    g.lineTo(118, 188);
    g.lineTo(98, 188);
  }
  g.closePath();
  g.fill();
  return toTexture(c, THREE);
}

function flameTexture(THREE) {
  const [c, g] = makeCanvas(128);
  const grad = g.createRadialGradient(64, 84, 4, 64, 84, 62);
  grad.addColorStop(0, 'rgba(255,240,170,1)');
  grad.addColorStop(0.35, 'rgba(255,170,40,0.9)');
  grad.addColorStop(0.7, 'rgba(220,80,20,0.55)');
  grad.addColorStop(1, 'rgba(180,40,10,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(64, 6);
  g.bezierCurveTo(96, 44, 104, 78, 88, 108);
  g.bezierCurveTo(76, 126, 52, 126, 40, 108);
  g.bezierCurveTo(24, 78, 32, 44, 64, 6);
  g.fill();
  return toTexture(c, THREE, false);
}

export function createTextures(THREE) {
  if (typeof document === 'undefined' || !THREE) {
    return {
      brick: null, concrete: null, floor: null, corrugated: null,
      wood: null, hazard: null, signA: null, signB: null, flame: null,
    };
  }
  return {
    brick: brickTexture(THREE),
    concrete: concreteTexture(THREE),
    floor: floorTexture(THREE),
    corrugated: corrugatedTexture(THREE),
    wood: woodTexture(THREE),
    hazard: hazardTexture(THREE),
    signA: signTexture(THREE, 'A', 'up'),
    signB: signTexture(THREE, 'B', 'down'),
    flame: flameTexture(THREE),
  };
}
