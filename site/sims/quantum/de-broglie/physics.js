// De Broglie waves — DOM-free physics (SI units, non-relativistic).

export const H = 6.62607015e-34;      // Planck constant, J·s
export const C = 299792458;           // speed of light, m/s
export const E = 1.602176634e-19;     // elementary charge, C
export const AMU = 1.66053907e-27;    // atomic mass unit, kg
export const M_E = 9.1093837e-31;     // electron mass, kg

/** Objects of the «wavelength» tab. q is the charge in units of e (0 = neutral);
 *  maxLogV is log10 of the largest speed offered (0.1c for particles). */
const LOG_01C = Math.log10(0.1 * C);
export const OBJECTS = {
  electron: { m: M_E,            q: 1, maxLogV: LOG_01C },
  proton:   { m: 1.67262192e-27, q: 1, maxLogV: LOG_01C },
  alpha:    { m: 6.6446573e-27,  q: 2, maxLogV: LOG_01C },
  c60:      { m: 720.6 * AMU,    q: 0, maxLogV: 5 },
  dust:     { m: 1e-9,           q: 0, maxLogV: 4 },
  ball:     { m: 0.1,            q: 0, maxLogV: 2 },
};

/** λ = h / (m v) */
export const deBroglie = (m, v) => H / (m * v);

/** Speed after the accelerating voltage U: q e U = m v² / 2. */
export const speedFromVoltage = (m, q, U) => Math.sqrt((2 * q * E * U) / m);

/** Voltage that accelerates the particle to speed v. */
export const voltageForSpeed = (m, q, v) => (m * v * v) / (2 * q * E);

/** Bragg angle θ (rad) from 2 d sinθ = n λ, or null when there is no such reflection. */
export function braggAngle(lambda, d, n = 1) {
  const s = (n * lambda) / (2 * d);
  return s <= 1 ? Math.asin(s) : null;
}

/** Radius of the diffraction ring on a flat screen at distance L behind the foil:
 *  the ray is deflected by 2θ, so r = L·tan 2θ (≈ L·2θ ≈ L·λ/d for small angles).
 *  null when the ray does not travel forward. */
export function ringRadius(L, theta) {
  if (theta === null || 2 * theta >= Math.PI / 2 - 1e-6) return null;
  return L * Math.tan(2 * theta);
}

/** Lattice plane spacings of graphite used in the classic electron-diffraction tube, m. */
export const GRAPHITE_D = [0.213e-9, 0.123e-9];

/** Standard normal random number (Box–Muller). */
export function gauss() {
  let u = 0;
  while (u === 0) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}
