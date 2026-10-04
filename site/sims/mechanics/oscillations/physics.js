// Physics of the two oscillators. SI units throughout.
//
// Both are integrated with classical RK4 at a small fixed step, independent of
// the frame rate. At STEP = 0.5 ms the energy drift without damping is far
// below anything visible (relative error ~1e-8 per second in the worst case).

import { TAU } from '../../../assets/js/core/math.js';

export const STEP = 1 / 2000;          // integration step, s
const SAMPLES_PER_WINDOW = 600;        // resolution of the recorded history

/** Mathematical pendulum: φ″ = −(g/l)·sin φ − γ·φ′. */
export const pendulumAccel = (phi, omega, { g, l, gamma }) =>
  -(g / l) * Math.sin(phi) - gamma * omega;

/** Mass on a spring with viscous drag: m·x″ = −k·x − b·x′. */
export const springAccel = (x, v, { k, m, b }) => (-k * x - b * v) / m;

/** Small-angle period of the pendulum, T = 2π√(l/g). */
export const pendulumPeriod = (l, g) => TAU * Math.sqrt(l / g);

/** Period of the spring oscillator, T = 2π√(m/k). */
export const springPeriod = (m, k) => TAU * Math.sqrt(m / k);

export function pendulumEnergy(phi, omega, { m, g, l }) {
  const v = l * omega;
  return { kin: 0.5 * m * v * v, pot: m * g * l * (1 - Math.cos(phi)) };
}

export function springEnergy(x, v, { m, k }) {
  return { kin: 0.5 * m * v * v, pot: 0.5 * k * x * x };
}

/**
 * One-degree-of-freedom oscillator q″ = accel(q, q′).
 *
 *   const osc = createOscillator((q, u) => …);
 *   osc.reset(q0);  osc.advance(dt);
 *   osc.state   → { q, u, t }
 *   osc.period  → measured period: time between the last two zero crossings
 *                 in the same direction (null until two have happened)
 *   osc.samples → recent history [t, q, u, a] covering the last `window` s
 */
export function createOscillator(accel) {
  const s = { q: 0, u: 0, t: 0 };
  let carry = 0;
  let period = null;
  let lastUp = null, lastDown = null;
  let window = 10;
  let sampleEvery = 1, sinceSample = 0;
  let samples = [];

  function rk4(h) {
    const { q, u } = s;
    const a1 = accel(q, u);
    const u2 = u + 0.5 * h * a1, a2 = accel(q + 0.5 * h * u, u2);
    const u3 = u + 0.5 * h * a2, a3 = accel(q + 0.5 * h * u2, u3);
    const u4 = u + h * a3,       a4 = accel(q + h * u3, u4);
    s.q = q + (h / 6) * (u + 2 * u2 + 2 * u3 + u4);
    s.u = u + (h / 6) * (a1 + 2 * a2 + 2 * a3 + a4);
    s.t += h;
  }

  function record() {
    samples.push([s.t, s.q, s.u, accel(s.q, s.u)]);
    const tMin = s.t - window * 1.02;
    let drop = 0;
    while (drop < samples.length && samples[drop][0] < tMin) drop++;
    if (drop) samples.splice(0, drop);
  }

  return {
    state: s,
    get period() { return period; },
    get samples() { return samples; },
    get window() { return window; },
    get accel() { return accel(s.q, s.u); },

    /** Length of the recorded history in seconds (call before reset). */
    setWindow(seconds) {
      window = seconds;
      sampleEvery = Math.max(1, Math.round(seconds / SAMPLES_PER_WINDOW / STEP));
    },

    reset(q0, u0 = 0) {
      s.q = q0; s.u = u0; s.t = 0;
      carry = 0; sinceSample = 0;
      period = null; lastUp = null; lastDown = null;
      samples = [];
      record();
    },

    /** Advance by dt seconds of simulated time in fixed sub-steps. */
    advance(dt) {
      carry += dt;
      while (carry >= STEP) {
        carry -= STEP;
        const q0 = s.q;
        rk4(STEP);
        if ((q0 < 0 && s.q >= 0) || (q0 > 0 && s.q <= 0)) {
          // crossing time by linear interpolation inside the step
          const tc = s.t - STEP * (s.q / (s.q - q0));
          if (s.q > q0) {
            if (lastUp !== null) period = tc - lastUp;
            lastUp = tc;
          } else {
            if (lastDown !== null) period = tc - lastDown;
            lastDown = tc;
          }
        }
        if (++sinceSample >= sampleEvery) { sinceSample = 0; record(); }
      }
    },
  };
}
