// Maxwell speed distribution — DOM-free physics.
//
// 1. Theory for real gases (3D): f(v) = 4π (M/2πRT)^{3/2} v² exp(−Mv²/2RT),
//    characteristic speeds and the fraction of molecules faster than v₀.
// 2. A 2D hard-disc gas in a box (arbitrary units: m = k = 1) whose speed
//    distribution relaxes to the 2D equilibrium form f(v) = (v/σ²) exp(−v²/2σ²),
//    σ² = kT/m. Collisions are perfectly elastic, so the total kinetic energy
//    is conserved exactly (up to rounding).

import { TAU } from '../../../assets/js/core/math.js';

export const R = 8.314;                 // J/(mol·K)

/** Molar masses as used in school problems (kg/mol). */
export const GASES = {
  H2:  { name: 'H₂',  M: 0.002 },
  He:  { name: 'He',  M: 0.004 },
  N2:  { name: 'N₂',  M: 0.028 },
  O2:  { name: 'O₂',  M: 0.032 },
  Ar:  { name: 'Ar',  M: 0.040 },
  CO2: { name: 'CO₂', M: 0.044 },
};

// ---------------------------------------------------------------------------
// 3D theory (SI units: v in m/s, f in s/m)
// ---------------------------------------------------------------------------

/** Most probable, mean and rms speeds (m/s). */
export function speeds3D(T, M) {
  return {
    vp: Math.sqrt((2 * R * T) / M),
    mean: Math.sqrt((8 * R * T) / (Math.PI * M)),
    rms: Math.sqrt((3 * R * T) / M),
  };
}

/** Maxwell density f(v) for a 3D gas, s/m. */
export function maxwell3D(v, T, M) {
  const a = M / (2 * R * T);                       // = 1/v_p²
  return 4 * Math.PI * Math.pow(a / Math.PI, 1.5) * v * v * Math.exp(-a * v * v);
}

/** Composite Simpson rule on [a, b] with n (even) intervals. */
export function simpson(f, a, b, n = 2000) {
  if (n % 2) n++;
  const h = (b - a) / n;
  let s = f(a) + f(b);
  for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2);
  return (s * h) / 3;
}

/** ∫₀^∞ f(v) dv, computed numerically on [0, 10 v_p] (should be 1). */
export function area3D(T, M) {
  const { vp } = speeds3D(T, M);
  return simpson((v) => maxwell3D(v, T, M), 0, 10 * vp, 4000);
}

/**
 * Fraction of molecules with v > v0, by numerical integration of f(v).
 * Returned as log10 of the fraction, so that astronomically small values
 * (N₂ above the escape speed: ~10⁻³⁰⁰) do not underflow to 0.
 * With u = v/v_p, x = v0/v_p:
 *   P = (4/√π) ∫ₓ^∞ u² e^{−u²} du = e^{−x²} · (4/√π) ∫ₓ^∞ u² e^{−(u²−x²)} du.
 */
export function log10FractionAbove(v0, T, M) {
  const { vp } = speeds3D(T, M);
  const x = Math.max(0, v0) / vp;
  const L = Math.min(8, 30 / (x + 1));             // the scaled integrand has decayed by then
  const J = (4 / Math.sqrt(Math.PI)) * simpson((u) => u * u * Math.exp(-(u - x) * (u + x)), x, x + L, 4000);
  return Math.log10(J) - x * x * Math.LOG10E;
}

// ---------------------------------------------------------------------------
// 2D equilibrium (arbitrary units, s2 = σ² = kT/m)
// ---------------------------------------------------------------------------

export const rayleigh2D = (v, s2) => (v / s2) * Math.exp((-v * v) / (2 * s2));

/** Most probable, mean and rms speeds of the 2D distribution. */
export function speeds2D(s2) {
  const s = Math.sqrt(s2);
  return { vp: s, mean: s * Math.sqrt(Math.PI / 2), rms: s * Math.SQRT2 };
}

export const RATIO_2D = Math.sqrt(Math.PI) / 2;          // v̄ / v_rms in 2D ≈ 0.886
export const RATIO_3D = Math.sqrt(8 / (3 * Math.PI));    // v̄ / v_rms in 3D ≈ 0.921

// ---------------------------------------------------------------------------
// 2D hard-disc gas
// ---------------------------------------------------------------------------

// Half of the 8 neighbouring cells (E, SW, S, SE) as (dx, dy) pairs: each pair of cells is visited once.
const NB = [1, 0, -1, 1, 0, 1, 1, 1];

function gaussian() {
  return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(TAU * Math.random());
}

/**
 * @param {object} o
 * @param {number} o.width   box width (box height is 1)
 * @param {number} o.radius  disc radius
 * @param {number} o.max     maximum number of discs
 */
export function createGas2D({ width, radius, max }) {
  const W = width, H = 1, r = radius;
  const x = new Float64Array(max), y = new Float64Array(max);
  const vx = new Float64Array(max), vy = new Float64Array(max);
  let n = 0;

  // Uniform grid (cell ≥ 2r): a disc can only touch discs in the 3 × 3 block of cells around it.
  const cols = Math.max(1, Math.floor(W / (2 * r)));
  const rows = Math.max(1, Math.floor(H / (2 * r)));
  const cw = W / cols, ch = H / rows;
  const start = new Int32Array(cols * rows + 1);
  const order = new Int32Array(max);
  const cellOf = new Int32Array(max);

  function buildGrid() {
    start.fill(0);
    for (let i = 0; i < n; i++) {
      const cx = Math.min(cols - 1, Math.max(0, Math.floor(x[i] / cw)));
      const cy = Math.min(rows - 1, Math.max(0, Math.floor(y[i] / ch)));
      const c = cy * cols + cx;
      cellOf[i] = c;
      start[c + 1]++;
    }
    for (let c = 0; c < cols * rows; c++) start[c + 1] += start[c];
    const fill = start.slice(0, cols * rows);
    for (let i = 0; i < n; i++) order[fill[cellOf[i]]++] = i;
  }

  /** Elastic collision of equal discs i, j (if they touch and approach). */
  function collide(i, j) {
    const dx = x[j] - x[i], dy = y[j] - y[i];
    const d2 = dx * dx + dy * dy;
    const md = 2 * r;
    if (d2 >= md * md || d2 === 0) return;
    const d = Math.sqrt(d2);
    const nx = dx / d, ny = dy / d;
    const vn = (vx[i] - vx[j]) * nx + (vy[i] - vy[j]) * ny;
    if (vn > 0) {
      // Equal masses: exchange the velocity components along the line of centres.
      vx[i] -= vn * nx; vy[i] -= vn * ny;
      vx[j] += vn * nx; vy[j] += vn * ny;
    }
    // Separate the overlapping discs (positions only — no effect on energy).
    const push = (md - d) / 2;
    x[i] -= nx * push; y[i] -= ny * push;
    x[j] += nx * push; y[j] += ny * push;
  }

  function collisions() {
    buildGrid();
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const c = cy * cols + cx;
        for (let a = start[c]; a < start[c + 1]; a++) {
          const i = order[a];
          // same cell (pairs once)
          for (let b = a + 1; b < start[c + 1]; b++) collide(i, order[b]);
          // half of the neighbours: E, SW, S, SE
          for (let k = 0; k < 8; k += 2) {
            const qx = cx + NB[k], qy = cy + NB[k + 1];
            if (qx < 0 || qx >= cols || qy >= rows) continue;
            const q = qy * cols + qx;
            for (let b = start[q]; b < start[q + 1]; b++) collide(i, order[b]);
          }
        }
      }
    }
  }

  function walls() {
    for (let i = 0; i < n; i++) {
      if (x[i] < r) { x[i] = r; if (vx[i] < 0) vx[i] = -vx[i]; }
      else if (x[i] > W - r) { x[i] = W - r; if (vx[i] > 0) vx[i] = -vx[i]; }
      if (y[i] < r) { y[i] = r; if (vy[i] < 0) vy[i] = -vy[i]; }
      else if (y[i] > H - r) { y[i] = H - r; if (vy[i] > 0) vy[i] = -vy[i]; }
    }
  }

  function maxSpeed() {
    let m = 0;
    for (let i = 0; i < n; i++) m = Math.max(m, vx[i] * vx[i] + vy[i] * vy[i]);
    return Math.sqrt(m);
  }

  const gas = {
    W, H, r, x, y, vx, vy,
    get n() { return n; },

    /**
     * New gas of `count` discs at temperature s2 = kT/m.
     * mode 'thermal': Maxwell velocities; 'equal': all with speed √(2kT/m)
     * (same energy as at temperature T) in random directions.
     */
    reset(count, mode, s2) {
      n = Math.min(count, max);
      // Random positions without overlaps (rejection sampling).
      for (let i = 0; i < n; i++) {
        let tries = 0;
        do {
          x[i] = r + Math.random() * (W - 2 * r);
          y[i] = r + Math.random() * (H - 2 * r);
          tries++;
        } while (tries < 200 && overlaps(i));
      }
      const s = Math.sqrt(s2);
      for (let i = 0; i < n; i++) {
        if (mode === 'equal') {
          const a = TAU * Math.random();
          const v = s * Math.SQRT2;
          vx[i] = v * Math.cos(a); vy[i] = v * Math.sin(a);
        } else {
          vx[i] = s * gaussian(); vy[i] = s * gaussian();
        }
      }
      // Thermal start: fix the energy exactly to N·kT (the sample mean fluctuates).
      if (mode !== 'equal') gas.scaleTo(s2);
    },

    /** Rescale all velocities so that ⟨v²⟩/2 = s2 (= kT/m in 2D). */
    scaleTo(s2) {
      const e = gas.energy();
      if (e <= 0) return;
      const k = Math.sqrt((n * s2) / e);
      for (let i = 0; i < n; i++) { vx[i] *= k; vy[i] *= k; }
    },

    /** Advance by dt (simulation time). Sub-steps keep each move below r/2. */
    step(dt) {
      if (!n || dt <= 0) return;
      const vmax = maxSpeed();
      const sub = Math.min(80, Math.max(1, Math.ceil((dt * vmax) / (0.5 * r))));
      const h = dt / sub;
      for (let s = 0; s < sub; s++) {
        for (let i = 0; i < n; i++) { x[i] += vx[i] * h; y[i] += vy[i] * h; }
        collisions();
        walls();
      }
    },

    /** Total kinetic energy Σ m v²/2 with m = 1. */
    energy() {
      let e = 0;
      for (let i = 0; i < n; i++) e += vx[i] * vx[i] + vy[i] * vy[i];
      return e / 2;
    },

    /** Mean and rms speed of the molecules now. */
    stats() {
      let s1 = 0, s2 = 0;
      for (let i = 0; i < n; i++) {
        const v2 = vx[i] * vx[i] + vy[i] * vy[i];
        s1 += Math.sqrt(v2); s2 += v2;
      }
      return { mean: s1 / n, rms: Math.sqrt(s2 / n) };
    },

    /** Adds the counts of speeds in [0, binW·bins) to out[]. */
    histogram(out, binW) {
      for (let i = 0; i < n; i++) {
        const k = Math.floor(Math.hypot(vx[i], vy[i]) / binW);
        if (k < out.length) out[k]++;
      }
    },
  };

  function overlaps(i) {
    const md2 = 4 * r * r;
    for (let j = 0; j < i; j++) {
      const dx = x[j] - x[i], dy = y[j] - y[i];
      if (dx * dx + dy * dy < md2) return true;
    }
    return false;
  }

  return gas;
}
