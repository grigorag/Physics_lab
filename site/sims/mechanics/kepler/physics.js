// Two-body motion around the Sun — analytic Kepler solution (DOM-free).
//
// Units: astronomical units (ա.մ.), years, solar masses.
//   GM☉ = 4π² ա.մ.³/տարի²,  so for a central mass M (in M☉) μ = 4π²·M.
// The planet starts at (r0, 0) with speed k·v_c (v_c = √(μ/r0) — circular
// speed) tilted by β from the perpendicular to the radius (β > 0 — outwards).
// Position at any time comes from the conic + Kepler's equation (elliptic,
// parabolic or hyperbolic), so orbits close exactly and energy is conserved
// for any step size.

export const TAU = Math.PI * 2;
export const MU_SUN = 4 * Math.PI * Math.PI;   // ա.մ.³/տարի²
export const KMS_PER_AUYR = 4.740;             // 1 ա.մ./տարի in կմ/վ
export const SQRT2 = Math.SQRT2;
/** Speed factors this close to √2 are treated as exactly parabolic. */
export const PARABOLA_SNAP = 0.0008;
const CIRCLE_E = 1e-3;

/** Real planets for the Kepler III chart: [name, a (ա.մ.), T (տարի)]. */
export const PLANETS = [
  ['Մերկուրի', 0.387, 0.241],
  ['Վեներա', 0.723, 0.615],
  ['Երկիր', 1, 1],
  ['Մարս', 1.524, 1.881],
  ['Յուպիտեր', 5.203, 11.86],
];

const wrapPi = (x) => x - TAU * Math.floor((x + Math.PI) / TAU);

/** Solves E − e·sin E = M (ellipse). */
function solveElliptic(M, e) {
  M = wrapPi(M);
  let E = e > 0.8 ? (M >= 0 ? Math.PI : -Math.PI) : M + e * Math.sin(M);
  for (let i = 0; i < 60; i++) {
    const f = E - e * Math.sin(E) - M;
    const d = f / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-14) break;
  }
  return E;
}

/** Solves e·sinh H − H = M (hyperbola). */
function solveHyperbolic(M, e) {
  let H = Math.sign(M) * Math.log(2 * Math.abs(M) / e + 1.8);
  for (let i = 0; i < 80; i++) {
    const f = e * Math.sinh(H) - H - M;
    const d = f / (e * Math.cosh(H) - 1);
    H -= d;
    if (Math.abs(d) < 1e-14 * Math.max(1, Math.abs(H))) break;
  }
  return H;
}

/**
 * Builds the orbit for the launch parameters.
 * @param {{r0:number, k:number, beta:number, M:number}} p  beta in degrees
 */
export function makeOrbit({ r0, k, beta, M }) {
  const mu = MU_SUN * M;
  const parabolic = Math.abs(k - SQRT2) < PARABOLA_SNAP;
  if (parabolic) k = SQRT2;
  const vc = Math.sqrt(mu / r0);
  const v0 = k * vc;
  const b = beta * Math.PI / 180;
  const x0 = r0, y0 = 0;
  const vx0 = v0 * Math.sin(b), vy0 = v0 * Math.cos(b);

  const h = x0 * vy0 - y0 * vx0;              // specific angular momentum (z)
  const s = h >= 0 ? 1 : -1;                  // direction of revolution
  const energy = v0 * v0 / 2 - mu / r0;       // per unit mass, ա.մ.²/տարի²
  const rv = x0 * vx0 + y0 * vy0;
  const ex = ((v0 * v0 - mu / r0) * x0 - rv * vx0) / mu;
  const ey = ((v0 * v0 - mu / r0) * y0 - rv * vy0) / mu;
  let e = Math.hypot(ex, ey);
  const p = h * h / mu;                       // semi-latus rectum

  let type;
  if (parabolic) { type = 'parabola'; e = 1; }
  else if (e < CIRCLE_E) type = 'circle';
  else if (e < 1) type = 'ellipse';
  else type = 'hyperbola';

  const omega = e > 1e-12 ? Math.atan2(ey, ex) : 0;            // perihelion direction
  const nu0 = wrapPi(s * (Math.atan2(y0, x0) - omega));        // true anomaly at launch
  const q = p / (1 + e);                                       // perihelion distance
  const bound = e < 1;
  const a = parabolic ? Infinity : -mu / (2 * energy);         // < 0 for a hyperbola
  const T = bound ? TAU * Math.sqrt(a * a * a / mu) : Infinity;
  const n = parabolic ? 0 : Math.sqrt(mu / Math.abs(a * a * a));

  /** Time since perihelion for true anomaly ν (|ν| < ν∞ when unbound). */
  function timeFromNu(nu) {
    if (bound) {
      const E = 2 * Math.atan(Math.sqrt((1 - e) / (1 + e)) * Math.tan(nu / 2));
      return (E - e * Math.sin(E)) / n;
    }
    if (parabolic) {
      const D = Math.tan(nu / 2);
      return 0.5 * Math.sqrt(p * p * p / mu) * (D + D * D * D / 3);
    }
    const H = 2 * Math.atanh(Math.sqrt((e - 1) / (e + 1)) * Math.tan(nu / 2));
    return (e * Math.sinh(H) - H) / n;
  }

  /** True anomaly at time τ since perihelion. */
  function nuAt(tau) {
    if (bound) {
      const E = solveElliptic(n * tau, e);
      return 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
    }
    if (parabolic) {
      const sArg = 2 * tau * Math.sqrt(mu / (p * p * p));      // D + D³/3 = sArg
      const w = 1.5 * sArg;
      const root = Math.sqrt(w * w + 1);
      const D = Math.cbrt(w + root) + Math.cbrt(w - root);
      return 2 * Math.atan(D);
    }
    const H = solveHyperbolic(n * tau, e);
    return 2 * Math.atan(Math.sqrt((e + 1) / (e - 1)) * Math.tanh(H / 2));
  }

  const tau0 = timeFromNu(nu0);   // time since perihelion at launch (may be < 0)

  const rOfNu = (nu) => p / (1 + e * Math.cos(nu));
  const angleOfNu = (nu) => omega + s * nu;

  /** State at time t after launch. */
  function state(t) {
    const nu = nuAt(tau0 + t);
    const r = rOfNu(nu);
    const phi = angleOfNu(nu);
    const c = Math.cos(phi), sn = Math.sin(phi);
    const k1 = Math.sqrt(mu / p);
    const vr = k1 * e * Math.sin(nu);
    const vt = s * k1 * (1 + e * Math.cos(nu));
    return {
      t, nu, r, phi,
      x: r * c, y: r * sn,
      vx: vr * c - vt * sn,
      vy: vr * sn + vt * c,
      v: Math.hypot(vr, vt),
    };
  }

  /** Point on the conic for true anomaly ν. */
  const pointAt = (nu) => {
    const r = rOfNu(nu), phi = angleOfNu(nu);
    return { x: r * Math.cos(phi), y: r * Math.sin(phi), r };
  };

  /** Largest |ν| reached on an unbound orbit before r exceeds R. */
  const nuLimit = (R) => (bound ? Math.PI : Math.acos(Math.max(-1, Math.min(1, (p / R - 1) / e))));

  /** Polyline of the orbit (whole ellipse, or the unbound branch with r ≤ R). */
  function path(R, n = 360) {
    const lim = bound ? Math.PI : nuLimit(R);
    const pts = [];
    for (let i = 0; i <= n; i++) pts.push(pointAt(-lim + (2 * lim * i) / n));
    return pts;
  }

  const Q = bound ? a * (1 + e) : Infinity;                    // aphelion distance
  const vAt = (r) => Math.sqrt(Math.max(0, mu * (2 / r - (parabolic ? 0 : 1 / a))));

  /** Area swept between times t1 and t2 after launch, measured as a fine polygon fan. */
  function sweptArea(t1, t2, samples = 160) {
    const n1 = nuAt(tau0 + t1);
    let n2 = nuAt(tau0 + t2);
    if (bound && n2 <= n1) n2 += TAU;         // the sector crosses aphelion
    const pts = [];
    for (let i = 0; i <= samples; i++) pts.push(pointAt(n1 + ((n2 - n1) * i) / samples));
    let A = 0;
    for (let i = 1; i < pts.length; i++) A += pts[i - 1].x * pts[i].y - pts[i].x * pts[i - 1].y;
    return { area: Math.abs(A) / 2, pts };
  }

  return {
    mu, M, r0, k, beta, vc, v0, h, s, e, p, q, Q, a, T, n, omega, energy,
    type, bound, parabolic, tau0, nu0,
    b: bound ? a * Math.sqrt(1 - e * e) : NaN,
    vq: vAt(q),
    vQ: bound ? vAt(Q) : NaN,
    vInf: !bound && !parabolic ? Math.sqrt(2 * energy) : 0,
    arealVelocity: Math.abs(h) / 2,
    state, nuAt, timeFromNu, pointAt, path, nuLimit, sweptArea,
    /** Time after launch of the first perihelion passage at or after launch. */
    firstPerihelion: bound ? ((-tau0 % T) + T) % T : -tau0,
  };
}

/** Energy per unit mass for a state. */
export const energyOf = (o, s) => (s.v * s.v) / 2 - o.mu / s.r;
