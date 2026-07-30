import * as THREE from 'three';

function canvas(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function noise(ctx, size, alpha, cell = 1) {
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = alpha;
  }
  ctx.putImageData(img, 0, 0);
}

function finish(c, repeat = [4, 4]) {
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeConcreteTexture() {
  const size = 512;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#565a56';
  ctx.fillRect(0, 0, size, size);
  noise(ctx, size, 18, 1);
  // panel seams
  ctx.strokeStyle = 'rgba(20,22,20,0.5)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= size; i += 128) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
  }
  // stains
  ctx.globalAlpha = 0.15;
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? '#1a1c1a' : '#7a7d76';
    const x = Math.random() * size, y = Math.random() * size, r = Math.random() * 40 + 10;
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.6, Math.random() * Math.PI, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  return finish(c, [6, 6]);
}

export function makeMetalTexture(baseColor = '#4a5058') {
  const size = 512;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);
  // brushed streaks
  for (let i = 0; i < 800; i++) {
    ctx.strokeStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
    ctx.beginPath();
    const y = Math.random() * size;
    ctx.moveTo(0, y);
    ctx.lineTo(size, y + (Math.random() - 0.5) * 6);
    ctx.stroke();
  }
  noise(ctx, size, 10, 1);
  // rivets grid
  ctx.fillStyle = 'rgba(10,10,10,0.5)';
  for (let x = 32; x < size; x += 96) {
    for (let y = 32; y < size; y += 96) {
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
    }
  }
  return finish(c, [4, 4]);
}

export function makeCamoTexture() {
  const size = 512;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const colors = ['#3a3f2d', '#54593f', '#23261c', '#6b6a4a'];
  ctx.fillStyle = colors[0];
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = colors[1 + Math.floor(Math.random() * 3)];
    ctx.beginPath();
    const x = Math.random() * size, y = Math.random() * size;
    const pts = 6 + Math.floor(Math.random() * 4);
    ctx.moveTo(x, y);
    for (let p = 0; p < pts; p++) {
      const a = (p / pts) * Math.PI * 2;
      const r = Math.random() * 34 + 14;
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill();
  }
  return finish(c, [1, 1]);
}

export function makeGroundTexture() {
  const size = 512;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2c2b26';
  ctx.fillRect(0, 0, size, size);
  noise(ctx, size, 22, 1);
  ctx.globalAlpha = 0.25;
  for (let i = 0; i < 200; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? '#1c1b17' : '#3d3b32';
    const x = Math.random() * size, y = Math.random() * size, r = Math.random() * 3 + 0.5;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // crack lines
  ctx.strokeStyle = 'rgba(10,10,8,0.3)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 14; i++) {
    ctx.beginPath();
    let x = Math.random() * size, y = Math.random() * size;
    ctx.moveTo(x, y);
    for (let s = 0; s < 6; s++) {
      x += (Math.random() - 0.5) * 60;
      y += (Math.random() - 0.5) * 60;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return finish(c, [24, 24]);
}

export function makeEmissiveStripTexture(color = '#6effa0') {
  const size = 128;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = color;
  ctx.fillRect(0, size * 0.4, size, size * 0.2);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function makeStarfieldTexture() {
  const size = 1024;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, '#02050a');
  grad.addColorStop(0.6, '#060a12');
  grad.addColorStop(1, '#0e1610');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * size, y = Math.random() * size * 0.75;
    const b = Math.random();
    ctx.fillStyle = `rgba(255,255,255,${b * 0.8})`;
    ctx.fillRect(x, y, b > 0.85 ? 2 : 1, b > 0.85 ? 2 : 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
