// Twin paradox — DOM-free physics.
//
// Units: time in years, distance in light-years, so c = 1 and v = β.
// Everything is described in the Earth frame (x, t): twin A rests at x = 0,
// twin B flies to x = D at speed β, turns round instantly and flies back.
// All quantities are analytic functions of (β, D, t).

const EPS = 1e-9;

/** Interval between light signals (years of the sender's own time), chosen so
 *  that even a long trip shows at most ~60 signals; 1 year for T ≤ 60. */
export function signalStep(T) {
  for (const s of [1, 2, 5, 10, 25, 50]) if (T / s <= 60 + EPS) return s;
  return 100;
}

/** The whole trip for a given speed and distance. */
export function trip(beta, D) {
  const gamma = 1 / Math.sqrt(1 - beta * beta);
  const T = (2 * D) / beta;                 // Earth time of the round trip
  const tau = T / gamma;                    // traveller's proper time
  const kOut = Math.sqrt((1 + beta) / (1 - beta));   // Doppler factor, receding
  const tr = {
    beta, D, gamma, T, tau,
    half: T / 2,                            // Earth time of the turnaround
    Dc: D / gamma,                          // contracted distance (traveller's frame)
    kOut,
    kIn: 1 / kOut,                          // Doppler factor, approaching
    jump: 2 * beta * D,                     // jump of "now on Earth" at turnaround
    step: signalStep(T),
  };
  tr.fromEarth = earthSignals(tr);
  tr.fromRocket = rocketSignals(tr);
  return tr;
}

/** Rocket position (light-years) at Earth time t. */
export function rocketX(tr, t) {
  return t <= tr.half ? tr.beta * t : tr.beta * (tr.T - t);
}

/** Traveller's proper time at Earth time t. */
export const properTime = (tr, t) => t / tr.gamma;

/**
 * Light pulses sent by Earth every `step` years of Earth time.
 * Each: { i, te, xe, tr, xr, leg } — emission and reception events in the
 * Earth frame; leg is the leg of the trip on which the traveller receives it.
 */
function earthSignals(tr) {
  const out = [];
  const n = Math.floor(tr.T / tr.step + EPS);
  for (let i = 1; i <= n; i++) {
    const te = i * tr.step;
    // outbound: te + x = t, x = βt  →  t = te / (1 − β)
    let t = te / (1 - tr.beta);
    let leg = 'out';
    if (t > tr.half + EPS) {
      // inbound: t − te = β(T − t)  →  t = (te + βT) / (1 + β)
      t = Math.min((te + tr.beta * tr.T) / (1 + tr.beta), tr.T);
      leg = 'in';
    }
    out.push({ i, te, xe: 0, tr: t, xr: rocketX(tr, t), leg });
  }
  return out;
}

/**
 * Light pulses sent by the traveller every `step` years of proper time.
 * leg is the leg of the trip on which the pulse was emitted.
 */
function rocketSignals(tr) {
  const out = [];
  const n = Math.floor(tr.tau / tr.step + EPS);
  for (let i = 1; i <= n; i++) {
    const te = Math.min(i * tr.step * tr.gamma, tr.T);
    const xe = rocketX(tr, te);
    out.push({ i, te, xe, tr: Math.min(te + xe, tr.T), xr: 0, leg: te <= tr.half + EPS ? 'out' : 'in' });
  }
  return out;
}

/** Signal counters at Earth time t. */
export function counts(tr, t) {
  const c = {
    aSent: 0, bRecv: 0, bRecvOut: 0, bRecvIn: 0,
    bSent: 0, aRecv: 0, aRecvOut: 0, aRecvIn: 0,
  };
  for (const s of tr.fromEarth) {
    if (s.te <= t + EPS) c.aSent++;
    if (s.tr <= t + EPS) { c.bRecv++; if (s.leg === 'out') c.bRecvOut++; else c.bRecvIn++; }
  }
  for (const s of tr.fromRocket) {
    if (s.te <= t + EPS) c.bSent++;
    if (s.tr <= t + EPS) { c.aRecv++; if (s.leg === 'out') c.aRecvOut++; else c.aRecvIn++; }
  }
  return c;
}

/** Earth time from which Earth starts receiving the "approach" signals. */
export const earthSwitch = (tr) => tr.half + tr.D;

/**
 * The Earth-clock reading that the traveller regards as simultaneous with his
 * own "now" at Earth time t (where his line of simultaneity meets x = 0).
 */
export function earthNowForTraveller(tr, t) {
  const g2 = tr.gamma * tr.gamma;
  return t <= tr.half ? t / g2 : tr.T - (tr.T - t) / g2;
}
