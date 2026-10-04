// Shared hard-disc physics for both experiments.
// Units: canvas pixels; velocities in px per 60-fps frame.
//
// A particle is { x, y, vx, vy, r, m }.

import { rand, TAU } from '../../../assets/js/core/math.js';

/** Random direction with speed temp·[0.7, 1.3] — the initial thermal velocity. */
export function thermalVelocity(temp) {
  const angle = rand(0, TAU);
  const speed = temp * rand(0.7, 1.3);
  return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
}

/** Reflect a particle off the walls of the W × H box. */
export function bounceBox(p, W, H) {
  if (p.x - p.r < 0) { p.x = p.r; p.vx *= -1; }
  if (p.x + p.r > W) { p.x = W - p.r; p.vx *= -1; }
  if (p.y - p.r < 0) { p.y = p.r; p.vy *= -1; }
  if (p.y + p.r > H) { p.y = H - p.r; p.vy *= -1; }
}

/** Elastic collision between two discs a and b (equal or different mass). */
export function collide(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const minDist = a.r + b.r;
  if (d === 0 || d > minDist) return;

  const nx = dx / d, ny = dy / d;
  const overlap = (minDist - d) / 2;
  a.x -= nx * overlap; a.y -= ny * overlap;
  b.x += nx * overlap; b.y += ny * overlap;

  const rvx = a.vx - b.vx, rvy = a.vy - b.vy;
  const velAlongNormal = rvx * nx + rvy * ny;
  if (velAlongNormal < 0) return; // already separating

  const impulse = (2 * velAlongNormal) / (a.m + b.m);
  a.vx -= impulse * b.m * nx; a.vy -= impulse * b.m * ny;
  b.vx += impulse * a.m * nx; b.vy += impulse * a.m * ny;
}

/** Pairwise collisions within one list (O(n²), fine for a few hundred discs). */
export function collideAll(list) {
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) collide(list[i], list[j]);
  }
}

/** Temperature change: rescale every velocity by newTemp / oldTemp. */
export function rescale(list, ratio) {
  for (const p of list) { p.vx *= ratio; p.vy *= ratio; }
}
