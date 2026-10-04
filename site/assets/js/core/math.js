// Numeric and 2D-vector helpers.

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;          // degrees → radians: a * DEG

export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (min, max) => min + Math.random() * (max - min);

// 2D vectors as plain {x, y} objects.
export const vec = {
  add:   (a, b) => ({ x: a.x + b.x, y: a.y + b.y }),
  sub:   (a, b) => ({ x: a.x - b.x, y: a.y - b.y }),
  scale: (a, s) => ({ x: a.x * s, y: a.y * s }),
  dot:   (a, b) => a.x * b.x + a.y * b.y,
  cross: (a, b) => a.x * b.y - a.y * b.x,
  len:   (a) => Math.hypot(a.x, a.y),
  norm:  (a) => { const l = Math.hypot(a.x, a.y) || 1; return { x: a.x / l, y: a.y / l }; },
};
