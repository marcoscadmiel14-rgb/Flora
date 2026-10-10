// Small, allocation-free math helpers shared by sim and render.
// Vectors are plain {x, y} objects; hot paths should write into `out` params.

export interface Vec2 {
  x: number;
  y: number;
}

export const TAU = Math.PI * 2;

export function v2(x = 0, y = 0): Vec2 {
  return { x, y };
}

export function set(out: Vec2, x: number, y: number): Vec2 {
  out.x = x;
  out.y = y;
  return out;
}

export function copy(out: Vec2, a: Vec2): Vec2 {
  out.x = a.x;
  out.y = a.y;
  return out;
}

export function add(out: Vec2, a: Vec2, b: Vec2): Vec2 {
  out.x = a.x + b.x;
  out.y = a.y + b.y;
  return out;
}

export function sub(out: Vec2, a: Vec2, b: Vec2): Vec2 {
  out.x = a.x - b.x;
  out.y = a.y - b.y;
  return out;
}

export function scale(out: Vec2, a: Vec2, s: number): Vec2 {
  out.x = a.x * s;
  out.y = a.y * s;
  return out;
}

export function addScaled(out: Vec2, a: Vec2, b: Vec2, s: number): Vec2 {
  out.x = a.x + b.x * s;
  out.y = a.y + b.y * s;
  return out;
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

export function cross(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

export function len(a: Vec2): number {
  return Math.hypot(a.x, a.y);
}

export function lenSq(a: Vec2): number {
  return a.x * a.x + a.y * a.y;
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function distSq(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** Normalizes in place-safe fashion; a zero vector stays zero. */
export function normalize(out: Vec2, a: Vec2): Vec2 {
  const l = Math.hypot(a.x, a.y);
  if (l > 1e-9) {
    out.x = a.x / l;
    out.y = a.y / l;
  } else {
    out.x = 0;
    out.y = 0;
  }
  return out;
}

export function rotate(out: Vec2, a: Vec2, angle: number): Vec2 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const x = a.x * c - a.y * s;
  out.y = a.x * s + a.y * c;
  out.x = x;
  return out;
}

export function fromAngle(out: Vec2, angle: number, length = 1): Vec2 {
  out.x = Math.cos(angle) * length;
  out.y = Math.sin(angle) * length;
  return out;
}

export function angleOf(a: Vec2): number {
  return Math.atan2(a.y, a.x);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function invLerp(a: number, b: number, v: number): number {
  return a === b ? 0 : (v - a) / (b - a);
}

/** Frame-rate independent exponential approach: fraction of the gap closed after dt. */
export function damp(current: number, target: number, rate: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-rate * dt));
}

/** Smallest signed difference between two angles, in (-PI, PI]. */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

export function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(current + maxDelta, target);
  return Math.max(current - maxDelta, target);
}

export function easeOutCubic(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}

export function easeInCubic(t: number): number {
  return t * t * t;
}

export function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

/** Closest point parameter t in [0,1] on segment ab to point p. */
export function segmentT(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
  const abx = bx - ax;
  const aby = by - ay;
  const l2 = abx * abx + aby * aby;
  if (l2 < 1e-12) return 0;
  return clamp(((px - ax) * abx + (py - ay) * aby) / l2, 0, 1);
}

/** Squared distance from point p to segment ab. */
export function segmentDistSq(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
  const t = segmentT(ax, ay, bx, by, px, py);
  const cx = ax + (bx - ax) * t - px;
  const cy = ay + (by - ay) * t - py;
  return cx * cx + cy * cy;
}
