// Physics of the lab, free of any DOM code.
//
//  1. A single two-level atom and a photon (tab «Ատոմ և ֆոտոն»).
//  2. A stochastic three-level laser: atoms + photons as particles
//     (tab «Լազեր»).

/* ------------------------------------------------------------------ */
/* Two-level atom                                                      */
/* ------------------------------------------------------------------ */

export const HC = 1239.84;             // h·c in eV·nm

export const ATOM = {
  dE: 2.0,        // E2 − E1, eV
  tol: 0.026,     // |hν − ΔE| below this counts as resonance (slider step 0.05)
  tau: 2.0,       // mean lifetime of the excited state, s (slowed down to be watchable)
};

/** Photon wavelength in nm for an energy in eV. */
export const wavelength = (E) => HC / E;

/** Can a photon of energy E (eV) be absorbed by / stimulate the model atom? */
export const resonant = (E) => Math.abs(E - ATOM.dE) < ATOM.tol;

/** Exponentially distributed lifetime with mean tau. */
export const randomLifetime = (tau, rnd = Math.random) => -tau * Math.log(1 - rnd());

/* ------------------------------------------------------------------ */
/* Three-level laser                                                   */
/* ------------------------------------------------------------------ */
//
// Lengths are in units of the cavity length (mirrors at x = 0 and x = 1,
// the optical axis is y = 0); time is in seconds.
//
// Atoms sit in `rows` rows parallel to the axis. Each atom is in level
//   1 (ground) → pumped to 3 at rate W,
//   3 → 2 quickly and without radiation (lifetime TAU3),
//   2 (metastable) → 1 spontaneously (lifetime tau2) or by stimulated emission.
//
// Photons of the laser transition are particles moving with speed C:
//   · "axial" ones run along a row. Each time such a photon passes an atom it
//     interacts with probability P_INT: a level-2 atom emits an identical
//     photon (stimulated emission), a level-1 atom absorbs the photon.
//     The two probabilities are equal (Einstein: B12 = B21), so light is
//     amplified only when N2 > N1.
//   · spontaneous photons fly in a random direction; only those emitted
//     almost along the axis (|sin θ| < AXIAL) join the axial ones, the rest
//     leave through the sides without interacting.
// The left mirror reflects everything, the output mirror reflects with
// probability R and transmits otherwise (that is the output beam).

export const LASER = {
  C: 2.5,            // photon speed, cavity lengths per second
  P_INT: 0.08,       // interaction probability per passed atom
  TAU3: 0.1,         // lifetime of level 3, s
  AXIAL: 0.12,       // |sin θ| below which a spontaneous photon is "axial"
  LOSS: 0.02,        // scattering loss per unit path inside the cavity
  H: 1 / 240,        // fixed sub-step, s
  MAX_PHOTONS: 2000,
  MED_X0: 0.1,       // active medium spans MED_X0 … MED_X1
  MED_X1: 0.9,
  ROW_GAP: 0.062,
  MIRROR_HALF: 0.2,  // half-height of the mirrors
  X_MIN: -0.25,      // photons beyond these bounds are forgotten
  X_MAX: 1.5,
  Y_MAX: 0.4,
  RATE_T: 1.0,       // averaging time of the event rates, s
};

export function createLaser({ rows = 5, cols = 12, rnd = Math.random } = {}) {
  const L = LASER;
  const params = { W: 0.8, tau2: 4, R: 0.9, mirrors: true };

  const atoms = [];
  const rowAtoms = [];
  for (let r = 0; r < rows; r++) {
    const list = [];
    for (let c = 0; c < cols; c++) {
      const a = {
        x: L.MED_X0 + ((c + 0.5) / cols) * (L.MED_X1 - L.MED_X0) + (rnd() - 0.5) * 0.024,
        y: (r - (rows - 1) / 2) * L.ROW_GAP,
        row: r,
        s: 1,
      };
      atoms.push(a);
      list.push(a);
    }
    rowAtoms.push(list);
  }

  const sim = {
    params,
    atoms,
    photons: [],
    t: 0,
    count: atoms.length,
    n: [0, atoms.length, 0, 0],          // n[1..3]: populations
    cavity: 0,                           // axial photons between the mirrors
    rate: { pump: 0, relax: 0, spont: 0, stim: 0, abs: 0, out: 0 },   // events per second (averaged)
    total: { pump: 0, relax: 0, spont: 0, stim: 0, abs: 0, out: 0 },
    step,
    reset,
    lasing,
  };

  const ev = { pump: 0, relax: 0, spont: 0, stim: 0, abs: 0, out: 0 };
  let acc = 0;

  function setLevel(a, s) {
    sim.n[a.s]--;
    a.s = s;
    sim.n[s]++;
  }

  function addPhoton(p) {
    if (sim.photons.length < L.MAX_PHOTONS) sim.photons.push(p);
  }

  const axialPhoton = (a, x, dir) => ({
    x, y: a.y + (rnd() - 0.5) * 0.03, vx: dir * L.C, vy: 0, ax: true, row: a.row, out: false, dead: false,
  });

  function emitSpontaneous(a) {
    const th = rnd() * Math.PI * 2;
    const cs = Math.cos(th), sn = Math.sin(th);
    if (Math.abs(sn) < L.AXIAL) addPhoton(axialPhoton(a, a.x, cs > 0 ? 1 : -1));
    else addPhoton({ x: a.x, y: a.y, vx: cs * L.C, vy: sn * L.C, ax: false, row: -1, out: false, dead: false });
  }

  function subStep(h) {
    const pPump = 1 - Math.exp(-params.W * h);
    const pRelax = 1 - Math.exp(-h / L.TAU3);
    const pSpont = 1 - Math.exp(-h / params.tau2);

    for (const a of atoms) {
      if (a.s === 1) {
        if (pPump > 0 && rnd() < pPump) { setLevel(a, 3); ev.pump++; }
      } else if (a.s === 3) {
        if (rnd() < pRelax) { setLevel(a, 2); ev.relax++; }
      } else if (rnd() < pSpont) {
        setLevel(a, 1); ev.spont++;
        emitSpontaneous(a);
      }
    }

    const photons = sim.photons;
    const existing = photons.length;         // photons born now start moving next sub-step
    const pLoss = L.LOSS * L.C * h;
    let cavity = 0, anyDead = false;

    for (let i = 0; i < existing; i++) {
      const p = photons[i];
      const x0 = p.x;
      let x1 = x0 + p.vx * h;

      if (!p.ax) {
        // Off-axis photon: straight line, mirrors reflect it, no interaction.
        p.y += p.vy * h;
        if (params.mirrors && !p.out && Math.abs(p.y) < L.MIRROR_HALF) {
          if (x1 < 0 && x0 >= 0) { x1 = -x1; p.vx = -p.vx; }
          else if (x1 > 1 && x0 <= 1) {
            if (rnd() < params.R) { x1 = 2 - x1; p.vx = -p.vx; } else p.out = true;
          }
        }
        p.x = x1;
        if (x1 < L.X_MIN || x1 > L.X_MAX || Math.abs(p.y) > L.Y_MAX) { p.dead = true; anyDead = true; }
        continue;
      }

      if (p.out) {
        p.x = x1;
        if (x1 < L.X_MIN || x1 > L.X_MAX) { p.dead = true; anyDead = true; }
        continue;
      }

      if (rnd() < pLoss) { p.dead = true; anyDead = true; continue; }

      // Atoms of this row passed during the sub-step.
      const fwd = p.vx > 0;
      for (const a of rowAtoms[p.row]) {
        const passed = fwd ? (a.x > x0 && a.x <= x1) : (a.x < x0 && a.x >= x1);
        if (!passed || a.s === 3 || rnd() >= L.P_INT) continue;
        if (a.s === 2) {
          setLevel(a, 1); ev.stim++;
          addPhoton(axialPhoton(a, x1 - (fwd ? 1 : -1) * rnd() * 0.08, fwd ? 1 : -1));
        } else {
          setLevel(a, 2); ev.abs++;
          p.dead = true; anyDead = true;
          break;
        }
      }
      if (p.dead) continue;

      if (x1 > 1) {
        if (params.mirrors && rnd() < params.R) { x1 = 2 - x1; p.vx = -p.vx; }
        else { p.out = true; ev.out++; }
      } else if (x1 < 0) {
        if (params.mirrors) { x1 = -x1; p.vx = -p.vx; }
        else p.out = true;
      }
      p.x = x1;
      if (!p.out) cavity++;
    }

    for (let i = existing; i < photons.length; i++) if (photons[i].ax) cavity++;
    if (anyDead) sim.photons = photons.filter((p) => !p.dead);
    sim.cavity = cavity;

    const k = Math.exp(-h / L.RATE_T);
    for (const key in ev) {
      sim.total[key] += ev[key];
      sim.rate[key] = sim.rate[key] * k + (ev[key] / h) * (1 - k);
      ev[key] = 0;
    }
    sim.t += h;
  }

  /** Advance by dt seconds using fixed sub-steps. */
  function step(dt) {
    acc += dt;
    let guard = 0;
    while (acc >= L.H && guard++ < 60) { subStep(L.H); acc -= L.H; }
    if (acc >= L.H) acc = 0;
  }

  function reset() {
    for (const a of atoms) a.s = 1;
    sim.n = [0, atoms.length, 0, 0];
    sim.photons = [];
    sim.cavity = 0;
    sim.t = 0;
    acc = 0;
    for (const key in ev) { ev[key] = 0; sim.rate[key] = 0; sim.total[key] = 0; }
  }

  /** Stimulated emission inside the resonator dominates over spontaneous. */
  function lasing() {
    return params.mirrors && sim.cavity >= 30 && sim.rate.stim > 2 * sim.rate.spont;
  }

  return sim;
}
