// Physics of the three experiments — no DOM here.
//
// 1. String (Melde's experiment). A string of length L, fixed at both ends,
//    is pushed by a vibrator at x_d with a force F₀·cos ωt. Expanding in the
//    normal modes sin(nπx/L), every mode is a driven damped oscillator
//      q̈ₙ + 2β·q̇ₙ + ωₙ²·qₙ = gₙ·cos ωt,   ωₙ = nπv/L,  v = √(T/μ),
//      gₙ = (2F₀ / μL)·sin(nπx_d/L).
//    Its steady state qₙ = Re[Qₙ e^{iωt}], Qₙ = gₙ / (ωₙ² − ω² + 2iβω), is
//    used directly (analytic, so independent of the frame rate).
//
// 2. Air column. Displacement s(x,t) = Re[S(x)·e^{iωt}] of a tube driven by a
//    small pressure source at the open end x = 0; the far end x = L is open
//    (pressure node, s′ = 0) or closed (displacement node, s = 0). Losses are
//    modelled by a complex wave number k̃ = k(1 − i/2Q). S is normalised so
//    that the largest displacement at an exact resonance is ≈ 1.
//
// 3. One driven damped oscillator  ẍ + 2γẋ + ω₀²x = (F₀/m)·cos θ,  θ̇ = ω,
//    integrated with RK4 at fixed sub-steps (shows the transient too).

import { TAU } from '../../../assets/js/core/math.js';

// ---------------------------------------------------------------- string ---

export const STRING = {
  xd: 0.05,      // vibrator position as a fraction of L
  F0: 0.4,       // vibrator force amplitude, N
  modes: 80,     // normal modes kept in the sum
};

export const stringSpeed = (T, mu) => Math.sqrt(T / mu);

/** n-th eigenfrequency fₙ = n·v/(2L), Hz. */
export const stringHarmonic = (n, { T, mu, L }) => (n * stringSpeed(T, mu)) / (2 * L);

/**
 * Steady-state modal amplitudes for driving frequency f.
 * Returns { re, im } (index n−1): qₙ(t) = re·cos ωt − im·sin ωt.
 */
export function stringModes({ T, mu, L, beta }, f, out = null) {
  const N = STRING.modes;
  const re = out?.re ?? new Float64Array(N);
  const im = out?.im ?? new Float64Array(N);
  const v = stringSpeed(T, mu);
  const w = TAU * f;
  for (let n = 1; n <= N; n++) {
    const wn = (n * Math.PI * v) / L;
    const g = ((2 * STRING.F0) / (mu * L)) * Math.sin(n * Math.PI * STRING.xd);
    const a = wn * wn - w * w;
    const b = 2 * beta * w;
    const den = a * a + b * b;
    re[n - 1] = (g * a) / den;
    im[n - 1] = (-g * b) / den;
  }
  return { re, im };
}

/** Table sin(nπ·xs[j]) for the mode sum, laid out [j·N + (n−1)]. */
export function modeTable(xs) {
  const N = STRING.modes;
  const tab = new Float64Array(xs.length * N);
  xs.forEach((x, j) => {
    for (let n = 1; n <= N; n++) tab[j * N + n - 1] = Math.sin(n * Math.PI * x);
  });
  return tab;
}

/**
 * String shape y(x,t) = P(x)·cos ωt + R(x)·sin ωt (metres) at the points
 * whose sin-table is `tab`. Fills P and R; returns the largest envelope
 * √(P² + R²).
 */
export function stringShape(modes, tab, P, R) {
  const N = STRING.modes;
  let max = 0;
  for (let j = 0; j < P.length; j++) {
    let p = 0, r = 0;
    const o = j * N;
    for (let n = 0; n < N; n++) {
      p += modes.re[n] * tab[o + n];
      r -= modes.im[n] * tab[o + n];
    }
    P[j] = p;
    R[j] = r;
    const e = Math.hypot(p, r);
    if (e > max) max = e;
  }
  return max;
}

// ------------------------------------------------------------- air column ---

export const PIPE_Q = 30;

/** Speed of sound in air, m/s, for t in °C. */
export const soundSpeed = (tC) => 331 + 0.6 * tC;

/** i-th resonance (i = 1, 2, …) and its harmonic number. */
export function pipeResonance(i, type, L, v) {
  if (type === 'open') return { n: i, f: (i * v) / (2 * L) };
  const n = 2 * i - 1;
  return { n, f: (n * v) / (4 * L) };
}

// complex helpers on [re, im] pairs
const csin = (a, b) => [Math.sin(a) * Math.cosh(b), Math.cos(a) * Math.sinh(b)];
const ccos = (a, b) => [Math.cos(a) * Math.cosh(b), -Math.sin(a) * Math.sinh(b)];
function cdiv([a, b], [c, d]) {
  const den = c * c + d * d;
  return [(a * c + b * d) / den, (b * c - a * d) / den];
}

/**
 * Air column at frequency f. xs are fractions of L (0 = driven open end).
 * Fills Sre/Sim (displacement, s = Sre·cos ωt − Sim·sin ωt) and Pabs (pressure
 * amplitude, same normalisation). Returns the largest |S|.
 */
export function pipeShape(type, L, v, f, xs, Sre, Sim, Pabs) {
  const k = (TAU * f) / v;
  const kr = k, ki = -k / (2 * PIPE_Q);          // k̃ = k(1 − i/2Q)
  const c = (k * L) / (2 * PIPE_Q);              // normalisation
  const den = type === 'open' ? csin(kr * L, ki * L) : ccos(kr * L, ki * L);
  let max = 0;
  xs.forEach((x, j) => {
    const a = kr * L * (1 - x), b = ki * L * (1 - x);
    // open:   S ∝ cos k̃(L−x) / sin k̃L,  p ∝ sin k̃(L−x) / sin k̃L
    // closed: S ∝ sin k̃(L−x) / cos k̃L,  p ∝ cos k̃(L−x) / cos k̃L
    const s = type === 'open' ? ccos(a, b) : csin(a, b);
    const p = type === 'open' ? csin(a, b) : ccos(a, b);
    const S = cdiv(s, den);
    const Pq = cdiv(p, den);
    Sre[j] = c * S[0];
    Sim[j] = c * S[1];
    Pabs[j] = c * Math.hypot(Pq[0], Pq[1]);
    const m = Math.hypot(Sre[j], Sim[j]);
    if (m > max) max = m;
  });
  return max;
}

// ------------------------------------------------- driven damped oscillator ---

/** Steady-state amplitude A = (F₀/m) / √((ω₀² − ω²)² + (2γω)²), m. */
export function drivenAmplitude(f, { k, m, gamma, F0 }) {
  const w = TAU * f;
  const w0sq = k / m;
  return (F0 / m) / Math.hypot(w0sq - w * w, 2 * gamma * w);
}

/** Phase lag of x behind the force, rad (0 … π). */
export function drivenPhase(f, { k, m, gamma }) {
  const w = TAU * f;
  return Math.atan2(2 * gamma * w, k / m - w * w);
}

export const naturalFreq = ({ k, m }) => Math.sqrt(k / m) / TAU;
export const qualityFactor = ({ k, m, gamma }) => (gamma > 0 ? Math.sqrt(k / m) / (2 * gamma) : Infinity);

/** Oscillator state {t, x, v, theta}; theta is the phase of the force. */
export function createDriven() {
  return { t: 0, x: 0, v: 0, theta: 0 };
}

const H = 0.002;   // RK4 sub-step, s

/** Advances the oscillator by dt (s) with driving frequency f. */
export function stepDriven(s, dt, f, { k, m, gamma, F0 }) {
  const w = TAU * f;
  const w0sq = k / m;
  const acc = (x, v, th) => (F0 / m) * Math.cos(th) - 2 * gamma * v - w0sq * x;
  const steps = Math.max(1, Math.ceil(dt / H));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    const { x, v, theta: th } = s;
    const k1x = v, k1v = acc(x, v, th);
    const k2x = v + 0.5 * h * k1v, k2v = acc(x + 0.5 * h * k1x, k2x, th + 0.5 * h * w);
    const k3x = v + 0.5 * h * k2v, k3v = acc(x + 0.5 * h * k2x, k3x, th + 0.5 * h * w);
    const k4x = v + h * k3v, k4v = acc(x + h * k3x, k4x, th + h * w);
    s.x = x + (h / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
    s.v = v + (h / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
    s.theta = (th + h * w) % TAU;
    s.t += h;
  }
}

// ---------------------------------------------------------------- helpers ---

/**
 * Nodes and antinodes of an envelope sampled on a uniform grid.
 * Nodes: local minima below 15 % of the maximum; antinodes: local maxima
 * above 55 %. `endNodes` forces both ends to be nodes (fixed string).
 * Returns indices (fractional, refined by a parabola through 3 points).
 */
export function findExtrema(env, { endNodes = false } = {}) {
  const n = env.length;
  let max = 0;
  for (const e of env) max = Math.max(max, e);
  const nodes = [], antinodes = [];
  if (max <= 0) return { nodes, antinodes };
  const refine = (i) => {
    const a = env[i - 1], b = env[i], c = env[i + 1];
    const d = a - 2 * b + c;
    return d !== 0 ? i + (0.5 * (a - c)) / d : i;
  };
  if (endNodes) nodes.push(0);
  else if (env[0] <= env[1] && env[0] < 0.15 * max) nodes.push(0);
  else if (env[0] >= env[1] && env[0] > 0.55 * max) antinodes.push(0);
  for (let i = 1; i < n - 1; i++) {
    const e = env[i];
    if (e <= env[i - 1] && e < env[i + 1] && e < 0.15 * max) nodes.push(refine(i));
    else if (e >= env[i - 1] && e > env[i + 1] && e > 0.55 * max) antinodes.push(refine(i));
  }
  if (endNodes) nodes.push(n - 1);
  else if (env[n - 1] <= env[n - 2] && env[n - 1] < 0.15 * max) nodes.push(n - 1);
  else if (env[n - 1] >= env[n - 2] && env[n - 1] > 0.55 * max) antinodes.push(n - 1);
  return { nodes, antinodes };
}

/**
 * Frequencies for a response curve on [f0, f1]: a uniform grid plus dense
 * points around every peak, so narrow resonances are not missed.
 */
export function spectrumGrid(f0, f1, peaks, halfWidth, count = 360) {
  const fs = [];
  for (let i = 0; i <= count; i++) fs.push(f0 + ((f1 - f0) * i) / count);
  for (const fp of peaks) {
    const w = halfWidth(fp);
    for (let j = -24; j <= 24; j++) {
      const f = fp + (j / 6) * w;
      if (f > f0 && f < f1) fs.push(f);
    }
  }
  return fs.sort((a, b) => a - b);
}
