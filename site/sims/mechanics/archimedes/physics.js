// Archimedes' principle — physics (DOM-free, SI units unless noted).

export const G = 9.8;                    // m/s²

/** Materials for tab 1 (kg/m³). */
export const WEIGH_MATERIALS = [
  { id: 'al',    name: 'ալյումին', rho: 2700 },
  { id: 'fe',    name: 'երկաթ',    rho: 7800 },
  { id: 'pb',    name: 'կապար',    rho: 11300 },
  { id: 'glass', name: 'ապակի',    rho: 2500 },
];

/** Materials for tab 2 (kg/m³); `custom` takes its density from a slider. */
export const FLOAT_MATERIALS = [
  { id: 'pine', name: 'փայտ (սոճի)', rho: 500 },
  { id: 'cork', name: 'խցան',        rho: 240 },
  { id: 'ice',  name: 'սառույց',     rho: 900 },
  { id: 'pe',   name: 'պոլիէթիլեն',  rho: 950 },
  { id: 'al',   name: 'ալյումին',    rho: 2700 },
  { id: 'fe',   name: 'երկաթ',       rho: 7800 },
  { id: 'custom', name: 'ընտրովի խտություն', rho: 1000 },
];

/** Liquids (kg/m³); `visc` scales the viscous drag in the dynamic tab. */
export const LIQUIDS = [
  { id: 'water',    name: 'ջուր',      rho: 1000,  visc: 1 },
  { id: 'brine',    name: 'աղաջուր',   rho: 1030,  visc: 1.1 },
  { id: 'kerosene', name: 'կերոսին',   rho: 800,   visc: 0.9 },
  { id: 'spirit',   name: 'սպիրտ',     rho: 790,   visc: 0.9 },
  { id: 'glycerin', name: 'գլիցերին',  rho: 1260,  visc: 2.2 },
  { id: 'mercury',  name: 'սնդիկ',     rho: 13600, visc: 0.7 },
];
export const WEIGH_LIQUIDS = LIQUIDS.filter((l) => l.id !== 'mercury');

/** Block of volume V (m³): square base a × a and height h = 1.25·a. */
export function blockDims(V) {
  const a = Math.cbrt(V / 1.25);
  return { a, h: 1.25 * a };
}

// ---------------------------------------------------------------------------
// Tab 1 — weighing with a dynamometer
// ---------------------------------------------------------------------------

/**
 * @param rho  body density, kg/m³
 * @param V    body volume, m³
 * @param rhoL liquid density, kg/m³
 * @param frac submerged fraction of the body's volume (0…1)
 */
export function weighing(rho, V, rhoL, frac) {
  const P = rho * G * V;                 // weight in air
  const Vsub = V * frac;                 // submerged volume = displaced volume
  const Fa = rhoL * G * Vsub;            // buoyant force
  const Pd = rhoL * G * Vsub;            // weight of the displaced liquid
  return { P, Vsub, Fa, Pd, Pp: P - Fa };
}

/** Submerged fraction of a block whose bottom is `z` below the surface. */
export function submergedFraction(z, h) {
  return Math.min(1, Math.max(0, z / h));
}

/** Smallest standard dynamometer range (N) that holds the load below 92 % of full scale. */
export function dynamometerRange(P) {
  const ranges = [2, 5, 10, 20, 50, 100, 200];
  return ranges.find((r) => P <= 0.92 * r) ?? 200;
}

// ---------------------------------------------------------------------------
// Tab 2 — floating
// ---------------------------------------------------------------------------

/** Tank (cross-section area A = width·depth) and initial liquid level L0. */
export const TANK = { width: 0.28, depth: 0.12, height: 0.24, L0: 0.14 };
export const TANK_AREA = TANK.width * TANK.depth;

/**
 * How deep the block (bottom at height y above the tank floor) is immersed,
 * counting the rise of the liquid level itself.
 *   returns { d: draught (m), level: liquid level (m), Vsub: submerged volume (m³) }
 */
export function immersion(y, a, h) {
  const s0 = TANK.L0 - y;
  const A2 = a * a;
  if (s0 <= 0) return { d: 0, level: TANK.L0, Vsub: 0 };
  const dp = s0 / (1 - A2 / TANK_AREA);
  const d = Math.min(dp, h);
  return { d, level: TANK.L0 + (A2 * d) / TANK_AREA, Vsub: A2 * d };
}

/** Equilibrium: outcome and submerged fraction. */
export function floatOutcome(rho, rhoL) {
  if (rho === rhoL) return { kind: 'suspended', frac: 1 };
  if (rho < rhoL) return { kind: 'floats', frac: rho / rhoL };
  return { kind: 'sinks', frac: 1 };
}

export function floatQuantities(rho, V, rhoL) {
  const m = rho * V;
  const out = floatOutcome(rho, rhoL);
  return {
    m,
    P: m * G,
    Fmax: rhoL * G * V,
    ...out,
  };
}

const SUBSTEP = 1 / 600;                // s
const ZETA = 0.18;                      // damping ratio of the bobbing
const CD = 1.1;                         // quadratic drag coefficient

/**
 * A falling/floating block. State: y = height of the bottom above the floor (m),
 * v = vertical velocity (m/s, up positive). Gravity, buoyancy ∝ submerged volume,
 * viscous drag in the liquid, an inelastic floor. Fixed sub-steps.
 */
export function createBody() {
  const s = {
    y: 0, v: 0,
    // parameters
    rho: 500, V: 2e-4, rhoL: 1000, visc: 1, a: 0, h: 0, m: 0,
    // derived each step (for display)
    d: 0, level: TANK.L0, Vsub: 0, Fb: 0, N: 0,
  };
  let acc = 0;

  function setParams({ rho, V, rhoL, visc }) {
    const { a, h } = blockDims(V);
    Object.assign(s, { rho, V, rhoL, visc, a, h, m: rho * V });
    refresh();
  }

  /** Recompute immersion, buoyancy and floor reaction at the current y. */
  function refresh() {
    const im = immersion(s.y, s.a, s.h);
    s.d = im.d; s.level = im.level; s.Vsub = im.Vsub;
    s.Fb = s.rhoL * G * im.Vsub;
    s.N = s.y <= 1e-9 ? Math.max(0, s.m * G - s.Fb) : 0;
  }

  function substep(dt) {
    const k = s.rhoL * G * s.a * s.a;                       // hydrostatic stiffness
    const c1 = 2 * ZETA * Math.sqrt(k * s.m) * s.visc;
    const c2 = 0.5 * s.rhoL * CD * s.a * s.a * s.visc;
    const im = immersion(s.y, s.a, s.h);
    const w = Math.min(1, im.d / 0.004);                    // ramp the drag in over 4 mm
    // fully submerged bodies feel an extra linear drag (no hydrostatic restoring force there)
    const full = Math.min(1, Math.max(0, (im.d / s.h - 0.9) / 0.1));
    const drag = w * (c1 + c2 * Math.abs(s.v)) + full * 12 * s.visc * s.m + 0.002;
    const F = -s.m * G + s.rhoL * G * im.Vsub - drag * s.v;
    s.v += (F / s.m) * dt;
    s.y += s.v * dt;
    if (s.y <= 0) {
      s.y = 0;
      if (s.v < 0) s.v = 0;
    }
  }

  return {
    state: s,
    setParams,
    refresh,
    /** Place the body (held by the hand); velocity is cleared. */
    place(y) {
      s.y = Math.max(0, y);
      s.v = 0;
      refresh();
    },
    advance(dt) {
      acc += dt;
      while (acc >= SUBSTEP) { substep(SUBSTEP); acc -= SUBSTEP; }
      refresh();
    },
  };
}
