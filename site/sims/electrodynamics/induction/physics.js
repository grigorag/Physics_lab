// Physics of electromagnetic induction. SI units throughout, no DOM.
//
// Tab 1 — bar magnet and coil.
//   The magnet is modelled by two magnetic poles ±q_m a distance p apart on the
//   coil axis (Gilbert model), q_m = p_m / p, where p_m is the magnetic moment.
//   The flux of B through one circular turn of radius a lying at axial
//   coordinate s is
//       Φ₁ = (μ₀q_m/2)·[ d_N/√(d_N² + a²) − d_S/√(d_S² + a²) ],  d = x_pole − s.
//   (The H-flux of each pole jumps by μ₀q_m when the pole crosses the turn;
//   the magnetisation inside the magnet adds exactly that jump back, so the
//   B-flux is smooth.) This is also the on-axis flux of a short solenoid, and it
//   is a smooth bell-shaped function of the magnet position: largest when the
//   magnet sits in the middle of the coil, ~1/x³ far away.
//   The coil has N turns spread evenly over its length ℓ; averaging over the
//   turns has a closed form because ∫ d/√(d² + a²) dd = √(d² + a²):
//       ⟨d/√(d² + a²)⟩ = [√((d + ℓ/2)² + a²) − √((d − ℓ/2)² + a²)] / ℓ.
//   The flux linkage is N·Φ, the EMF ε = −N·dΦ/dt, the current I = ε/R.
//
// Tab 2 — a rectangular frame rotating in a uniform field (AC generator).
//   Φ = B·S·cos ωt,  ε = −N·dΦ/dt = N·B·S·ω·sin ωt.

import { TAU } from '../../../assets/js/core/math.js';

export const MU0 = 4e-7 * Math.PI;              // Հն/մ

export const COIL = { radius: 0.03, length: 0.08 };            // m
export const MAGNET = { length: 0.10, half: 0.012, poleSep: 0.085 };   // m

/** Mean of d/√(d² + a²) over the turns of the coil (d = pole − coil centre). */
function meanCos(d) {
  const { radius: a, length: L } = COIL;
  return (Math.hypot(d + L / 2, a) - Math.hypot(d - L / 2, a)) / L;
}

/** d/dd of meanCos. */
function meanCosSlope(d) {
  const { radius: a, length: L } = COIL;
  return ((d + L / 2) / Math.hypot(d + L / 2, a) - (d - L / 2) / Math.hypot(d - L / 2, a)) / L;
}

/**
 * Mean magnetic flux through one turn of the coil, Wb.
 *   xm     — magnet centre on the axis, m
 *   xc     — coil centre, m
 *   moment — magnetic moment of the magnet p_m, A·m²
 *   dir    — +1 when the N pole is on the right (+x) end, −1 when flipped
 * Positive flux points along +x.
 */
export function fluxPerTurn(xm, xc, moment, dir) {
  const p = MAGNET.poleSep;
  const k = (MU0 * moment) / p / 2;
  const xN = xm + dir * p / 2;
  const xS = xm - dir * p / 2;
  return k * (meanCos(xN - xc) - meanCos(xS - xc));
}

/** ∂Φ/∂x_m: flux gradient with respect to the magnet position, Wb/m. */
export function fluxGradient(xm, xc, moment, dir) {
  const p = MAGNET.poleSep;
  const k = (MU0 * moment) / p / 2;
  const xN = xm + dir * p / 2;
  const xS = xm - dir * p / 2;
  return k * (meanCosSlope(xN - xc) - meanCosSlope(xS - xc));
}

/**
 * Time derivative of a sampled signal, averaged over the last `span` seconds:
 *   rate = (f(t) − f(t − span)) / span,
 * with f(t − span) linearly interpolated from the history. This is a moving
 * average of df/dt over a fixed time window, so it does not depend on the
 * frame rate; once the signal has been constant for `span` seconds the rate is
 * exactly zero.
 */
export function createRateMeter(span = 0.08) {
  let hist = [];          // [{ t, v }], oldest first

  return {
    reset(t, v) { hist = [{ t, v }]; },
    push(t, v) {
      hist.push({ t, v });
      // Keep one sample older than t − span for the interpolation.
      while (hist.length > 2 && hist[1].t <= t - span) hist.shift();
    },
    get rate() {
      const n = hist.length;
      if (n < 2) return 0;
      const last = hist[n - 1];
      const tq = last.t - span;
      const first = hist[0];
      if (first.t >= tq) {
        // Not enough history yet: average over what we have.
        const dt = last.t - first.t;
        return dt > 0 ? (last.v - first.v) / dt : 0;
      }
      const b = hist[1];
      const f = (tq - first.t) / (b.t - first.t);
      const vq = first.v + (b.v - first.v) * f;
      return (last.v - vq) / span;
    },
  };
}

// ---------- Field lines of the magnet ----------

/** B of the two-pole model in the meridian plane (magnet-local coordinates,
 *  N pole at +p/2 on the x axis), up to a constant factor. */
function poleField(x, y) {
  const p = MAGNET.poleSep / 2;
  const dxN = x - p, dxS = x + p;
  const rN = Math.hypot(dxN, y), rS = Math.hypot(dxS, y);
  const kN = 1 / (rN * rN * rN), kS = 1 / (rS * rS * rS);
  return { x: dxN * kN - dxS * kS, y: y * kN - y * kS };
}

/**
 * Field lines of the magnet in its own coordinates (N pole at +x), traced
 * from the N pole to the S pole with RK2. Returns arrays of [x, y, …] in m.
 */
export function magnetFieldLines(angles, { step = 0.002, maxLen = 1.6, reach = 0.9 } = {}) {
  const p = MAGNET.poleSep / 2;
  const r0 = 0.004;
  const lines = [];
  for (const a of angles) {
    let x = p + r0 * Math.cos(a), y = r0 * Math.sin(a);
    const pts = [x, y];
    for (let len = 0; len < maxLen; len += step) {
      let f = poleField(x, y);
      let m = Math.hypot(f.x, f.y);
      const xm = x + (f.x / m) * step / 2, ym = y + (f.y / m) * step / 2;
      f = poleField(xm, ym);
      m = Math.hypot(f.x, f.y);
      x += (f.x / m) * step;
      y += (f.y / m) * step;
      pts.push(x, y);
      if (Math.hypot(x + p, y) < r0) break;            // reached the S pole
      if (Math.abs(x) > reach || Math.abs(y) > reach) break;
    }
    lines.push(pts);
  }
  return lines;
}

// ---------- Tab 2: rotating frame ----------

export const frameOmega = (f) => TAU * f;

/** Flux through the frame, Wb (θ = ωt is the angle between the normal and B). */
export const frameFlux = (B, S, theta) => B * S * Math.cos(theta);

/** EMF of N turns, V. */
export const frameEmf = (N, B, S, f, theta) => N * B * S * frameOmega(f) * Math.sin(theta);

/** Amplitude ε_max = N·B·S·ω, V. */
export const frameEmfMax = (N, B, S, f) => N * B * S * frameOmega(f);
