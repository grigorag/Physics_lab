// Cycles of 1 mol of a monatomic ideal gas (DOM-free).
//
// Units: p in kPa, V in litres, T in K. Since 1 kPa · 1 l = 1 J, every energy
// (Q, A, ΔU) comes out directly in joules.
// Sign convention (Armenian school): Q = ΔU + A, where A is the work done BY
// the gas and Q the heat RECEIVED by the gas.

import { lerp, rand, TAU } from '../../../assets/js/core/math.js';

export const R = 8.314;            // J/(mol·K)
export const CV = 1.5 * R;         // monatomic gas
export const CP = 2.5 * R;
export const GAMMA = 5 / 3;

const pOf = (T, V) => (R * T) / V;
const TOf = (p, V) => (p * V) / R;
const state = (p, V, T) => ({ p, V, T });

// ---------- Stages ----------
// Each stage: { kind, a, b (end states), at(s) → state for s ∈ [0,1],
//               energies(s) → { dU, Q, A } accumulated from a to at(s) }.

/** Isothermal process at T from Va to Vb: ΔU = 0, Q = A = RT·ln(Vb/Va). */
function isotherm(T, Va, Vb) {
  const at = (s) => { const V = lerp(Va, Vb, s); return state(pOf(T, V), V, T); };
  return {
    kind: 'isotherm', a: at(0), b: at(1), at,
    energies(s = 1) {
      const A = R * T * Math.log(at(s).V / Va);
      return { dU: 0, Q: A, A };
    },
  };
}

/** Adiabatic process from (Va, Ta) to Vb: T·V^(γ−1) = const, Q = 0, A = −ΔU. */
function adiabat(Va, Ta, Vb) {
  const at = (s) => {
    const V = lerp(Va, Vb, s);
    const T = Ta * (Va / V) ** (GAMMA - 1);
    return state(pOf(T, V), V, T);
  };
  return {
    kind: 'adiabat', a: at(0), b: at(1), at,
    energies(s = 1) {
      const dU = CV * (at(s).T - Ta);
      return { dU, Q: 0, A: -dU };
    },
  };
}

/** Isochoric process at V from Ta to Tb: A = 0, Q = ΔU = Cv·ΔT. */
function isochor(V, Ta, Tb) {
  const at = (s) => { const T = lerp(Ta, Tb, s); return state(pOf(T, V), V, T); };
  return {
    kind: 'isochor', a: at(0), b: at(1), at,
    energies(s = 1) {
      const dU = CV * (at(s).T - Ta);
      return { dU, Q: dU, A: 0 };
    },
  };
}

/** Isobaric process at p from Va to Vb: A = pΔV, ΔU = Cv·ΔT, Q = Cp·ΔT. */
function isobar(p, Va, Vb) {
  const at = (s) => { const V = lerp(Va, Vb, s); return state(p, V, TOf(p, V)); };
  return {
    kind: 'isobar', a: at(0), b: at(1), at,
    energies(s = 1) {
      const dT = at(s).T - at(0).T;
      return { dU: CV * dT, Q: CP * dT, A: p * (at(s).V - Va) };
    },
  };
}

// ---------- Cycles ----------

/** Carnot: 1→2 isotherm T1 (V1→V2), 2→3 adiabat, 3→4 isotherm T2, 4→1 adiabat. */
export function carnot({ T1, T2, V1, V2 }) {
  const k = (T1 / T2) ** (1 / (GAMMA - 1));        // V3/V2 = V4/V1
  const V3 = V2 * k, V4 = V1 * k;
  return finish('carnot', [
    isotherm(T1, V1, V2),
    adiabat(V2, T1, V3),
    isotherm(T2, V3, V4),
    adiabat(V4, T2, V1),
  ]);
}

/** Rectangle: 1→2 isochoric heating at V1, 2→3 isobaric expansion at p2,
 *  3→4 isochoric cooling at V2, 4→1 isobaric compression at p1. */
export function rectangle({ p1, p2, V1, V2 }) {
  return finish('rect', [
    isochor(V1, TOf(p1, V1), TOf(p2, V1)),
    isobar(p2, V1, V2),
    isochor(V2, TOf(p2, V2), TOf(p1, V2)),
    isobar(p1, V2, V1),
  ]);
}

/** Otto: 1→2 adiabatic compression V1→V1/r, 2→3 isochoric heating to T3,
 *  3→4 adiabatic expansion, 4→1 isochoric cooling. */
export function otto({ V1, r, T1, T3 }) {
  const V2 = V1 / r;
  const T2 = T1 * r ** (GAMMA - 1);
  const T4 = T3 / r ** (GAMMA - 1);
  return finish('otto', [
    adiabat(V1, T1, V2),
    isochor(V2, T2, T3),
    adiabat(V2, T3, V1),
    isochor(V1, T4, T1),
  ]);
}

/** Totals over the cycle: Q1 (received), Q2 (given away, positive), A, ΔU, η. */
function finish(type, stages) {
  const e = stages.map((s) => s.energies(1));
  const corners = stages.map((s) => s.a);
  const Q1 = e.reduce((sum, x) => sum + Math.max(0, x.Q), 0);
  const Q2 = e.reduce((sum, x) => sum + Math.max(0, -x.Q), 0);
  const A = e.reduce((sum, x) => sum + x.A, 0);
  const dU = e.reduce((sum, x) => sum + x.dU, 0);
  const Ts = corners.map((c) => c.T);
  const Vs = corners.map((c) => c.V);
  const ps = corners.map((c) => c.p);
  const Tmax = Math.max(...Ts), Tmin = Math.min(...Ts);
  return {
    type, stages, energies: e, corners,
    Q1, Q2, A, dU,
    eta: A / Q1,
    etaCarnot: 1 - Tmin / Tmax,
    Tmax, Tmin,
    Vmin: Math.min(...Vs), Vmax: Math.max(...Vs),
    pmin: Math.min(...ps), pmax: Math.max(...ps),
  };
}

// ---------------------------------------------------------------------------
// Animation: hard discs in a box [0, length] × [0, 1] (unit = cylinder width),
// adapted from the gas-laws lab. A thermostat keeps the rms speed ∝ √T.
// ---------------------------------------------------------------------------

export const DISC_R = 0.035;

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
  if (vn < 0) return;
  a.vx -= vn * nx; a.vy -= vn * ny;
  b.vx += vn * nx; b.vy += vn * ny;
}

export function createGas(n) {
  const list = Array.from({ length: n }, () => ({
    x: rand(DISC_R, 1), y: rand(DISC_R, 1 - DISC_R), vx: gaussian(), vy: gaussian(),
  }));

  return {
    particles: list,
    /** Advance by dt seconds in a box of the given length (cylinder widths). */
    step(dt, length, vRms) {
      if (dt <= 0) return;
      const sub = Math.max(1, Math.ceil(dt * 180));
      const h = dt / sub;
      const r = DISC_R;
      const xMax = Math.max(r, length - r);
      for (let s = 0; s < sub; s++) {
        for (const p of list) {
          p.x += p.vx * h;
          p.y += p.vy * h;
          if (p.x < r) { p.x = r; if (p.vx < 0) p.vx = -p.vx; }
          if (p.x > xMax) { p.x = xMax; if (p.vx > 0) p.vx = -p.vx; }
          if (p.y < r) { p.y = r; if (p.vy < 0) p.vy = -p.vy; }
          if (p.y > 1 - r) { p.y = 1 - r; if (p.vy > 0) p.vy = -p.vy; }
        }
        for (let i = 0; i < list.length; i++) {
          for (let j = i + 1; j < list.length; j++) collide(list[i], list[j]);
        }
      }
      let sum = 0;
      for (const p of list) sum += p.vx * p.vx + p.vy * p.vy;
      const k = sum > 0 ? vRms / Math.sqrt(sum / list.length) : 1;
      for (const p of list) { p.vx *= k; p.vy *= k; }
    },
  };
}
