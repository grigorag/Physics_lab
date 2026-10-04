// Physics of the lab. DOM-free.
//
// 1. RC circuit (exact piecewise-exponential solution).
//    Within one "segment" the circuit has fixed ε, R, C and a fixed switch
//    position, so the capacitor voltage is
//        U(t) = U∞ + (U0 − U∞)·e^(−(t − T0)/τ),   τ = R·C
//    with U∞ = ε (switch in position 1) or 0 (position 2).
//    Current I = (U∞ − U)/R  (positive while charging the upper plate),
//    heat in R:  Q(t) = Q0 + ½·C·(U∞ − U0)²·(1 − e^(−2(t − T0)/τ)).
//    Switching or changing R, C, ε opens a new segment that starts from the
//    present U and Q, so the solution stays exact and continuous.
//
// 2. Parallel-plate capacitor: C = ε0·εr·S/d, connected (U fixed) or
//    disconnected (q fixed).

export const EPS0 = 8.8541878128e-12;   // F/m

export const segU = (s, t) => s.Uinf + (s.U0 - s.Uinf) * Math.exp(-(t - s.T0) / s.tau);
export const segI = (s, t) => (s.Uinf - segU(s, t)) / s.R;
export const segQ = (s, t) => s.Q0 + 0.5 * s.C * (s.Uinf - s.U0) ** 2 * -Math.expm1(-2 * (t - s.T0) / s.tau);

const MAX_SEGS = 600;

export function createRC({ eps = 10, R = 1e4, C = 1e-4 } = {}) {
  const P = { eps, R, C };
  let T = 0;            // model time, s
  let Tsw = 0;          // time of the last switch / reset
  let mode = 'charge';  // 'charge' (position 1) | 'discharge' (position 2)
  const segs = [];

  function open(U0, Q0) {
    const prev = segs[segs.length - 1];
    if (prev && prev.T0 === T) segs.pop();        // zero-length segment: replace it
    else if (prev) prev.T1 = T;
    segs.push({
      T0: T, T1: null, U0, Q0,
      Uinf: mode === 'charge' ? P.eps : 0,
      R: P.R, C: P.C, tau: P.R * P.C,
    });
    if (segs.length > MAX_SEGS) segs.splice(0, 100);
  }
  open(0, 0);

  const cur = () => segs[segs.length - 1];

  const model = {
    P, segs,
    get T() { return T; },
    get mode() { return mode; },
    get tSwitch() { return T - Tsw; },
    get seg() { return cur(); },
    get tau() { return P.R * P.C; },
    U: () => segU(cur(), T),
    I: () => segI(cur(), T),
    UR() { return this.I() * P.R; },
    q() { return P.C * this.U(); },
    W() { const U = this.U(); return 0.5 * P.C * U * U; },
    heat: () => segQ(cur(), T),

    advance(dt) { T += dt; },

    setMode(m) {
      if (m === mode) return;
      const U = this.U(), Q = this.heat();
      mode = m;
      Tsw = T;
      open(U, Q);
    },

    setParams({ eps: e = P.eps, R: r = P.R, C: c = P.C } = {}) {
      const rebase = r !== P.R || c !== P.C || (e !== P.eps && mode === 'charge');
      const U = this.U(), Q = this.heat();
      P.eps = e; P.R = r; P.C = c;
      if (rebase) open(U, Q);
    },

    /** Discharge completely and forget the history (the switch stays put). */
    reset() {
      segs.length = 0;
      T = 0;
      Tsw = 0;
      open(0, 0);
    },
  };
  return model;
}

/**
 * Parallel-plate capacitor. S in m², d in m.
 * connected: the voltage U is imposed;  otherwise the charge q0 is fixed.
 */
export function plateState({ S, d, epsr, connected, U, q0 }) {
  const C = EPS0 * epsr * S / d;
  const u = connected ? U : q0 / C;
  const q = connected ? C * U : q0;
  return { C, q, U: u, E: u / d, W: 0.5 * q * u };
}
