// α, β and γ radiation — physics only (no DOM).
//
// Part 1 — deflection in a uniform field.
//   Axes: x to the right, y up, z out of the screen (towards the viewer).
//   Heading θ is measured from +y towards +x: velocity v = v·(sin θ, cos θ, 0).
//   Magnetic field B = (0, 0, Bz):  F = q·(v × B) = q·v·Bz·(cos θ, −sin θ, 0)
//     → for v along +y and B INTO the screen (Bz < 0) a positive charge is pushed LEFT (−x).
//   Electric field E = (Ex, 0, 0):  F = q·Ex·(1, 0, 0).
//   The particle moves along its path with curvature κ = dθ/ds = F⊥ / (p·v)
//   (κ > 0 turns towards +x). Energy changes by dT/ds = F·v̂ (only in E).
//   Kinematics are relativistic (the 1 MeV β electron moves at 0.94c).
//
// Part 2 — absorption of the three radiations in air, paper, aluminium, lead.

export const C_LIGHT = 299792458;          // m/s
export const E_CHARGE = 1.602176634e-19;   // C
export const U_KG = 1.66053907e-27;        // kg

export const PARTICLES = {
  // ⁴He nucleus, 5 MeV (typical for ²²⁶Ra / ²¹⁰Po)
  alpha: { z: 2, mc2: 3727.379, massU: 4.0015, T: 5 },
  // electron, 1 MeV (β energies form a continuous spectrum; 1 MeV is a typical upper value)
  beta: { z: -1, mc2: 0.5109989, massU: 5.48580e-4, T: 1 },
  // photon, 1 MeV
  gamma: { z: 0, mc2: 0, massU: 0, T: 1 },
};
export const TYPES = ['alpha', 'beta', 'gamma'];

/** p·c (MeV), total energy E (MeV), v/c and p·v (MeV) for kinetic energy T (MeV). */
export function kinematics(T, mc2) {
  if (mc2 === 0) return { pc: T, E: T, beta: 1, pv: T };
  const pc = Math.sqrt(T * T + 2 * T * mc2);
  const E = T + mc2;
  return { pc, E, beta: pc / E, pv: (pc * pc) / E };
}

/** Radius of curvature r = p / (|q|·B) in metres (B in tesla); Infinity without a force. */
export function radius(type, B) {
  const p = PARTICLES[type];
  if (p.z === 0 || B <= 0) return Infinity;
  return (kinematics(p.T, p.mc2).pc * 1e6) / (C_LIGHT * Math.abs(p.z) * B);
}

/**
 * field = { kind: 'B' | 'E', value: tesla or V/m (≥ 0), sign: ±1 }
 *   sign = sign of Bz (−1: B into the screen ⊗) or of Ex (+1: E points right).
 * Returns the x-direction of the force on a particle moving along +y: −1, 0 or +1.
 */
export function forceSign(type, field) {
  const z = PARTICLES[type].z;
  return field.value > 0 ? Math.sign(z * field.sign) : 0;
}

/** Curvature κ (1/m, + turns towards +x) and dT/ds (MeV/m) at heading θ and kinetic energy T. */
export function curvature(type, field, theta, T) {
  const p = PARTICLES[type];
  if (p.z === 0 || field.value <= 0) return { kappa: 0, dTds: 0 };
  const k = kinematics(T, p.mc2);
  if (field.kind === 'B') {
    return { kappa: (p.z * field.sign * field.value * C_LIGHT) / (k.pc * 1e6), dTds: 0 };
  }
  const qE = p.z * field.sign * field.value;                    // eV per metre
  return { kappa: (qE * Math.cos(theta)) / (k.pv * 1e6), dTds: (qE * Math.sin(theta)) / 1e6 };
}

/**
 * Advance a particle { x, y (cm), theta, T (MeV) } by path length ds (cm) as an
 * exact circular arc with the local curvature. `exag` multiplies the curvature
 * (display exaggeration, 1 = true scale).
 */
export function advance(s, type, field, ds, exag = 1) {
  const { kappa, dTds } = curvature(type, field, s.theta, s.T);
  const k = (kappa / 100) * exag;                              // 1/cm
  const th0 = s.theta;
  const th1 = th0 + k * ds;
  if (Math.abs(k * ds) < 1e-9) {
    s.x += Math.sin(th0) * ds;
    s.y += Math.cos(th0) * ds;
  } else {
    s.x += (Math.cos(th0) - Math.cos(th1)) / k;
    s.y += (Math.sin(th1) - Math.sin(th0)) / k;
  }
  s.theta = th1;
  if (dTds) s.T = Math.max(1e-6, s.T + (dTds * ds) / 100);
}

/**
 * Real sideways deflection (m, signed) on a plate at distance L (m) for a particle
 * entering along +y; NaN when it turns back before reaching the plate (r < L).
 */
export function deflection(type, field, L) {
  const s = forceSign(type, field);
  if (s === 0) return 0;
  const p = PARTICLES[type];
  if (field.kind === 'B') {
    const r = radius(type, field.value);
    return r >= L ? s * (r - Math.sqrt(r * r - L * L)) : NaN;
  }
  // Uniform E ⊥ v₀: x = (E_tot / qE)·(cosh(qE·y / pc) − 1)  (exact relativistic solution)
  const k = kinematics(p.T, p.mc2);
  const qE = Math.abs(p.z) * field.value;
  return s * ((k.E * 1e6) / qE) * (Math.cosh((qE * L) / (k.pc * 1e6)) - 1);
}

// ---------------------------------------------------------------------------
// Part 2 — penetration
// ---------------------------------------------------------------------------

export const MATERIALS = {
  air: { rho: 0.001205, muGamma: 7.7e-5 },   // ρ in g/cm³, μ(γ, 1 MeV) in cm⁻¹
  paper: { rho: 0.8, muGamma: 0.056 },
  al: { rho: 2.70, muGamma: 0.166 },
  pb: { rho: 11.35, muGamma: 0.77 },
};

export const PAPER_CM = 0.01;                  // one sheet, 0.1 mm
export const ALPHA_RANGE_AIR = 3.6;            // cm, 5 MeV α  (Geiger: R ≈ 0.318·E^1.5)
export const BETA_MU_MASS = 17;                // cm²/g, β with E_max ≈ 1 MeV (≈ 17·E_max^−1.14)
export const BETA_RANGE_MASS = 0.41;           // g/cm², maximum range of 1 MeV β
export const BETA_RANGE_AL = BETA_RANGE_MASS / MATERIALS.al.rho;   // ≈ 0.15 cm
export const MU_LEAD = MATERIALS.pb.muGamma;
export const HVL_LEAD = Math.LN2 / MU_LEAD;    // ≈ 0.90 cm

/**
 * Layers from the source (x = 0) to the counter: the air gap, then paper,
 * aluminium and lead stacked right in front of the counter. Thicknesses in cm.
 */
export function buildLayers({ air, paper, al, pb }) {
  const layers = [];
  let x = 0;
  const add = (id, t) => {
    if (t > 0) { layers.push({ id, x0: x, x1: x + t, ...MATERIALS[id] }); x += t; }
  };
  add('air', air);
  add('paper', paper);
  add('al', al);
  add('pb', pb);
  return { layers, end: x };
}

/**
 * Passage of one radiation type through the layers:
 *   tau(x)     accumulated attenuation exponent, intensity = e^(−tau) until the cutoff
 *   cutoff     depth (cm) beyond which nothing gets through (range of α and β); Infinity for γ
 *   stopLayer  id of the layer where the range ends (null if it is not reached)
 *   transmitted  I/I₀ at the counter
 * α: constant number until its range (3.6 cm of air; any solid layer stops it at once).
 * β: ≈ exponential attenuation with μ/ρ = 17 cm²/g, cut off at its maximum range 0.41 g/cm².
 * γ: I = I₀·e^(−Σμᵢxᵢ), no range at all.
 */
export function passage(type, { layers, end }) {
  const rate = (l) => (type === 'gamma' ? l.muGamma : type === 'beta' ? BETA_MU_MASS * l.rho : 0);
  let cutoff = Infinity;
  let stopLayer = null;

  if (type === 'alpha') {
    for (const l of layers) {
      if (l.id === 'air') {
        if (l.x1 - l.x0 > ALPHA_RANGE_AIR) { cutoff = l.x0 + ALPHA_RANGE_AIR; stopLayer = 'air'; break; }
      } else {
        cutoff = l.x0 + Math.min(l.x1 - l.x0, 0.004) / 2;     // stops within a few tens of µm
        stopLayer = l.id;
        break;
      }
    }
  } else if (type === 'beta') {
    let mass = 0;
    for (const l of layers) {
      const m = l.rho * (l.x1 - l.x0);
      if (mass + m >= BETA_RANGE_MASS) {
        cutoff = l.x0 + (BETA_RANGE_MASS - mass) / l.rho;
        stopLayer = l.id;
        break;
      }
      mass += m;
    }
  }

  function tau(x) {
    let t = 0;
    for (const l of layers) {
      if (x <= l.x0) break;
      t += rate(l) * (Math.min(x, l.x1) - l.x0);
    }
    return t;
  }
  const intensity = (x) => (x > cutoff ? 0 : Math.exp(-tau(x)));
  const transmitted = cutoff <= end ? 0 : Math.exp(-tau(end));

  /** Depth where one particle is absorbed (random), or Infinity if it reaches the counter. */
  function sampleStop() {
    const target = -Math.log(1 - Math.random());
    let x;
    if (tau(end) < target) x = Infinity;
    else {
      let lo = 0, hi = end;
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (tau(mid) >= target) hi = mid; else lo = mid;
      }
      x = hi;
    }
    return Math.min(x, cutoff);
  }

  return { tau, cutoff, stopLayer, intensity, transmitted, sampleStop };
}

/** γ behind lead only: I/I₀ = e^(−μx). */
export const gammaLead = (x) => Math.exp(-MU_LEAD * x);
