// Light clock and time dilation — DOM-free physics.
//
// A light clock is two mirrors a distance h apart with a light pulse bouncing
// between them. One "tick" is a full round trip, so in the clock's own frame
//   Δt₀ = 2h / c            (proper period).
// In a frame where the clock moves at v = βc the pulse still travels at c, but
// along a longer (zig-zag) path, so the period is Δt = γ·Δt₀.
//
// Times in this module are measured in units of Δt₀ unless a name says "ns".

export const C_KMS = 299792.458;                    // speed of light, km/s
export const H_M = 1.5;                             // mirror separation, m
export const T0_NS = ((2 * H_M) / 299792458) * 1e9; // proper tick period ≈ 10.007 ns

/** Lorentz factor γ = 1/√(1 − β²). */
export const gamma = (beta) => 1 / Math.sqrt(1 - beta * beta);

/**
 * State of a clock that has run for proper time tau (in ticks).
 * y: height of the pulse between the mirrors, 0 (bottom) … 1 (top).
 */
export function pulse(tau) {
  const ticks = Math.floor(tau + 1e-9);
  const phase = Math.max(0, tau - ticks);
  return { ticks, phase, y: phase < 0.5 ? 2 * phase : 2 - 2 * phase, up: phase < 0.5 };
}

/**
 * Velocity of the pulse of a clock moving at β, in units of c, in the frame
 * where the clock moves: horizontal β, vertical ±√(1 − β²). Its magnitude is 1.
 */
export function pulseVelocity(beta, up = true) {
  const vy = Math.sqrt(1 - beta * beta);
  return { vx: beta, vy: up ? vy : -vy };
}

/**
 * Vertices of the pulse path between proper times tau0 and tau1: the two end
 * points and every mirror bounce (multiples of ½) strictly between them.
 */
export function pathVertices(tau0, tau1) {
  const out = [tau0];
  for (let n = Math.floor(tau0 * 2 + 1e-9) + 1; n / 2 < tau1; n++) out.push(n / 2);
  out.push(tau1);
  return out;
}
