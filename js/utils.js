export function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function randRange(a, b) { return a + Math.random() * (b - a); }
export function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

// Axis-aligned box collider {minX,maxX,minY,maxY,minZ,maxZ}
export function makeBox(cx, cy, cz, sx, sy, sz) {
  return {
    minX: cx - sx / 2, maxX: cx + sx / 2,
    minY: cy - sy / 2, maxY: cy + sy / 2,
    minZ: cz - sz / 2, maxZ: cz + sz / 2,
  };
}

export function pointInBox(x, y, z, b) {
  return x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY && z >= b.minZ && z <= b.maxZ;
}

// Resolve a moving vertical cylinder (player/enemy) against a set of static boxes.
// Operates per-axis for stable sliding collision.
export function resolveCollisions(pos, radius, height, boxes) {
  for (const b of boxes) {
    const closestX = clamp(pos.x, b.minX, b.maxX);
    const closestZ = clamp(pos.z, b.minZ, b.maxZ);
    const dx = pos.x - closestX;
    const dz = pos.z - closestZ;
    const distSq = dx * dx + dz * dz;
    const feet = pos.y;
    const head = pos.y + height;
    const verticalOverlap = head > b.minY && feet < b.maxY;
    if (verticalOverlap && distSq < radius * radius) {
      const dist = Math.sqrt(distSq) || 0.0001;
      const push = radius - dist;
      pos.x += (dx / dist) * push;
      pos.z += (dz / dist) * push;
    }
  }
}

export function groundHeightAt(x, z, boxes, fallback = 0) {
  let best = fallback;
  for (const b of boxes) {
    if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) {
      if (b.maxY <= best + 6 && b.maxY > best) best = b.maxY;
      if (b.maxY > best && b.maxY < fallback + 6) best = b.maxY;
    }
  }
  return best;
}

// simple ray vs AABB, returns distance or Infinity
export function rayBoxDistance(origin, dir, b) {
  let tmin = -Infinity, tmax = Infinity;
  const mins = [b.minX, b.minY, b.minZ];
  const maxs = [b.maxX, b.maxY, b.maxZ];
  const o = [origin.x, origin.y, origin.z];
  const d = [dir.x, dir.y, dir.z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-8) {
      if (o[i] < mins[i] || o[i] > maxs[i]) return Infinity;
    } else {
      let t1 = (mins[i] - o[i]) / d[i];
      let t2 = (maxs[i] - o[i]) / d[i];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin >= 0 ? tmin : (tmax >= 0 ? tmax : Infinity);
}

export function lineOfSight(from, to, boxes, maxDist) {
  const dir = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
  const dist = Math.sqrt(dir.x ** 2 + dir.y ** 2 + dir.z ** 2);
  if (dist > maxDist) return false;
  dir.x /= dist; dir.y /= dist; dir.z /= dist;
  for (const b of boxes) {
    if (b.isCover === false) continue;
    const d = rayBoxDistance(from, dir, b);
    if (d < dist - 0.5) return false;
  }
  return true;
}
