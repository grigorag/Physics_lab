// Ideal-gas state and a qualitative hard-disc "gas" for the animation.
//
// Units of the state: T in K, V in litres, p in kPa, ν in mol.
// Since 1 kPa · 1 l = 1 J, p[kPa] = ν·R·T / V[l] with R in J/(mol·K).

import { rand, TAU } from '../../../assets/js/core/math.js';

export const R = 8.314;            // J/(mol·K)
export const K_B = 1.380649e-23;   // J/K

export const LIMITS = {
  T: [100, 600],     // K
  V: [5, 50],        // l
  NU: [0.5, 2],      // mol
  P_MAX: 500,        // kPa — top of the gauge and of the p axis
};

export const pressure = (nu, T, V) => (nu * R * T) / V;
export const meanKineticEnergy = (T) => 1.5 * K_B * T;

// Bounds are rounded inward to the slider grid, so a clamped value is still
// exactly what the slider shows.
const EPS = 1e-9;
const ceilTo = (x, q) => Math.ceil(x / q - EPS) * q;
const floorTo = (x, q) => Math.floor(x / q + EPS) * q;

/** Isothermal: volumes for which p stays ≤ P_MAX. */
export function volumeRange(nu, T) {
  return [Math.max(LIMITS.V[0], ceilTo((nu * R * T) / LIMITS.P_MAX, 0.1)), LIMITS.V[1]];
}

/** Isobaric at pressure p: temperatures for which V stays inside its range. */
export function tempRangeIsobaric(nu, p) {
  return [
    Math.max(LIMITS.T[0], ceilTo((LIMITS.V[0] * p) / (nu * R), 1)),
    Math.min(LIMITS.T[1], floorTo((LIMITS.V[1] * p) / (nu * R), 1)),
  ];
}

/** Isochoric at volume V: temperatures for which p stays ≤ P_MAX. */
export function tempRangeIsochoric(nu, V) {
  return [LIMITS.T[0], Math.min(LIMITS.T[1], floorTo((LIMITS.P_MAX * V) / (nu * R), 1))];
}

/** Amount of gas that keeps the dependent quantity in range.
 *  Isobaric: p and T are kept (V follows); otherwise T and V are kept (p follows). */
export function nuRange(process, { T, V, p }) {
  if (process === 'isobaric') {
    return [
      Math.max(LIMITS.NU[0], ceilTo((LIMITS.V[0] * p) / (R * T), 0.1)),
      Math.min(LIMITS.NU[1], floorTo((LIMITS.V[1] * p) / (R * T), 0.1)),
    ];
  }
  return [LIMITS.NU[0], Math.min(LIMITS.NU[1], floorTo((LIMITS.P_MAX * V) / (R * T), 0.1))];
}

// ---------------------------------------------------------------------------
// Animation: hard discs in a box [0, length] × [0, 1] (unit = chamber height).
// A thermostat keeps the rms speed exactly at the requested value, so the
// picture always matches the displayed temperature.
// ---------------------------------------------------------------------------

export const DISC_R = 0.012;

function gaussian() {
  return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(rand(0, TAU));
}

function collide(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const d2 = dx * dx + dy * dy;
  const minDist = 2 * DISC_R;
  if (d2 === 0 || d2 > minDist * minDist) return;
  const d = Math.sqrt(d2);
  const nx = dx / d, ny = dy / d;
  const overlap = (minDist - d) / 2;
  a.x -= nx * overlap; a.y -= ny * overlap;
  b.x += nx * overlap; b.y += ny * overlap;
  const vn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
  if (vn < 0) return;                       // already separating
  a.vx -= vn * nx; a.vy -= vn * ny;         // equal masses: swap normal components
  b.vx += vn * nx; b.vy += vn * ny;
}

export function createGas() {
  const list = [];

  function add(length) {
    list.push({
      x: rand(DISC_R, Math.max(DISC_R, length - DISC_R)),
      y: rand(DISC_R, 1 - DISC_R),
      vx: gaussian(), vy: gaussian(),
    });
  }

  return {
    particles: list,

    setCount(n, length) {
      while (list.length > n) list.pop();
      while (list.length < n) add(length);
    },

    /** The chamber was redrawn with another length-to-height ratio. */
    stretch(factor) {
      for (const p of list) p.x *= factor;
    },

    /**
     * Advance by dt seconds.
     * @param length  current chamber length (piston position), in chamber heights
     * @param vRms    required rms speed, chamber heights per second
     * @param onHit   (x, y) called for every wall hit
     */
    step(dt, length, vRms, onHit) {
      if (!list.length || dt <= 0) return;
      const sub = Math.max(1, Math.ceil(dt * 180));
      const h = dt / sub;
      const r = DISC_R;
      const xMax = Math.max(r, length - r);

      for (let s = 0; s < sub; s++) {
        for (const p of list) {
          p.x += p.vx * h;
          p.y += p.vy * h;
          if (p.x < r) { p.x = r; if (p.vx < 0) { p.vx = -p.vx; onHit?.(0, p.y); } }
          if (p.x > xMax) { p.x = xMax; if (p.vx > 0) { p.vx = -p.vx; onHit?.(length, p.y); } }
          if (p.y < r) { p.y = r; if (p.vy < 0) { p.vy = -p.vy; onHit?.(p.x, 0); } }
          if (p.y > 1 - r) { p.y = 1 - r; if (p.vy > 0) { p.vy = -p.vy; onHit?.(p.x, 1); } }
        }
        for (let i = 0; i < list.length; i++) {
          for (let j = i + 1; j < list.length; j++) collide(list[i], list[j]);
        }
      }

      // Thermostat: rms speed ∝ √T.
      let sum = 0;
      for (const p of list) sum += p.vx * p.vx + p.vy * p.vy;
      const k = sum > 0 ? vRms / Math.sqrt(sum / list.length) : 1;
      for (const p of list) { p.vx *= k; p.vy *= k; }
    },
  };
}
