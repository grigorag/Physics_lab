// Special relativity in 1+1 dimensions — DOM-free.
//
// Units: x in light-seconds, t in seconds, so c = 1 light-second per second
// and ct (in light-seconds) is numerically equal to t (in seconds).

export const gamma = (beta) => 1 / Math.sqrt(1 - beta * beta);

/** Rapidity φ = artanh β. Boosts compose by adding rapidities. */
export const rapidity = (beta) => Math.atanh(beta);

/** Lorentz transformation to a frame moving with velocity βc along +x. */
export function boost(x, t, beta) {
  const g = gamma(beta);
  return { x: g * (x - beta * t), t: g * (t - beta * x) };
}

/** The same boost written with a rapidity (handy for continuous animation). */
export function boostPhi(x, t, phi) {
  const ch = Math.cosh(phi);
  const sh = Math.sinh(phi);
  return { x: ch * x - sh * t, t: ch * t - sh * x };
}

/** Invariant interval s² = (cΔt)² − Δx². */
export const interval2 = (dx, dt) => dt * dt - dx * dx;

export const EPS = 1e-6;

/** 'time' | 'space' | 'light' for a separation (dx, dt). */
export function classify(dx, dt) {
  const s2 = interval2(dx, dt);
  if (Math.abs(s2) < EPS) return 'light';
  return s2 > 0 ? 'time' : 'space';
}

/**
 * Everything about a pair of events a → b (S coordinates) seen from S and
 * from S′ (velocity βc).
 */
export function pair(a, b, beta) {
  const dx = b.x - a.x;
  const dt = b.t - a.t;
  const pa = boost(a.x, a.t, beta);
  const pb = boost(b.x, b.t, beta);
  const dxp = pb.x - pa.x;
  const dtp = pb.t - pa.t;
  const kind = classify(dx, dt);
  return {
    dx, dt, dxp, dtp,
    s2: interval2(dx, dt),
    s2p: interval2(dxp, dtp),
    kind,
    // space-like: frame in which the events are simultaneous
    betaSim: kind === 'space' ? dt / dx : null,
    // time-like: frame in which they happen at the same place
    betaRest: kind === 'time' ? dx / dt : null,
  };
}
