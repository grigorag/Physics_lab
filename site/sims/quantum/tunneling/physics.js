// Quantum tunnelling — physics (DOM-free).
//
// Units: energy in eV, length in nm, time in fs. The particle is an electron.
//   iħ ∂ψ/∂t = −(ħ²/2m) ∂²ψ/∂x² + U(x)ψ,   U = U₀ for 0 < x < a, else 0.

export const HBAR = 0.6582119569;     // ħ, eV·fs
export const H2M = 0.0380998212;      // ħ²/(2mₑ), eV·nm²

/** Wave number of a free electron with kinetic energy E, nm⁻¹. */
export const waveNumber = (E) => Math.sqrt(Math.max(E, 0) / H2M);

/** Speed of a free electron with kinetic energy E, nm/fs. */
export const speed = (E) => (2 * H2M * waveNumber(E)) / HBAR;

/** Decay constant κ inside the barrier (E < U₀), nm⁻¹. */
export const kappa = (E, U0) => waveNumber(U0 - E);

/**
 * Stationary (plane-wave) transmission coefficient of a rectangular barrier
 * of height U0 (eV) and width a (nm) at energy E (eV).
 */
export function transmission(E, U0, a) {
  if (E <= 0) return 0;
  if (U0 <= 0 || a <= 0) return 1;
  const d = U0 - E;
  if (Math.abs(d) < 1e-9 * U0) return 1 / (1 + (U0 * a * a) / (4 * H2M));
  if (d > 0) {
    const s = Math.sinh(waveNumber(d) * a);
    return 1 / (1 + (U0 * U0 * s * s) / (4 * E * d));
  }
  const s = Math.sin(waveNumber(-d) * a);
  return 1 / (1 + (U0 * U0 * s * s) / (4 * E * -d));
}

/** Standard deviation of the wave number in a Gaussian packet whose |ψ|² has width sigma (nm). */
export const sigmaK = (sigma) => 1 / (2 * sigma);

/**
 * Transmission expected for a Gaussian packet: T(E(k)) averaged over the
 * packet's momentum distribution (components with k ≤ 0 never arrive).
 */
export function packetTransmission(E, U0, a, sigma) {
  const k0 = waveNumber(E);
  const sk = sigmaK(sigma);
  const n = 600;
  const span = 6 * sk;
  const dk = (2 * span) / n;
  let sum = 0, norm = 0;
  for (let i = 0; i <= n; i++) {
    const k = k0 - span + i * dk;
    const w = Math.exp(-((k - k0) ** 2) / (2 * sk * sk)) * (i === 0 || i === n ? 0.5 : 1);
    norm += w;
    if (k > 0) sum += w * transmission(H2M * k * k, U0, a);
  }
  return sum / norm;
}

/**
 * Crank–Nicolson solver for a Gaussian packet hitting the barrier.
 * The scheme is unitary (the norm is conserved to rounding error).
 * Grid points sit at xMin + (j + ½)·dx, so the barrier edges x = 0 and x = a
 * fall midway between points when a is a multiple of dx.
 *
 *   const s = createSolver({ E, U0, a, sigma, x0 });
 *   s.step(n);  s.t;  s.probabilities() → { left, inside, right, norm }
 *   s.re, s.im, s.n, s.dx, s.xMin — the wave function ψ (nm^-½)
 */
export function createSolver({
  E, U0, a, sigma, x0, xMin = -24, xMax = 24, dx = 0.01, dtFactor = 0.02,
}) {
  const n = Math.round((xMax - xMin) / dx);
  const jL = Math.round(-xMin / dx);            // first point inside the barrier
  const jR = jL + Math.round(a / dx);           // first point to the right of it
  const k0 = waveNumber(E);
  const eMax = H2M * (k0 + 2 * sigmaK(sigma)) ** 2;
  const dt = (dtFactor * HBAR) / eMax;

  const re = new Float64Array(n);
  const im = new Float64Array(n);
  const amp = (2 * Math.PI * sigma * sigma) ** -0.25;
  for (let j = 0; j < n; j++) {
    const x = xMin + (j + 0.5) * dx;
    const g = amp * Math.exp(-((x - x0) ** 2) / (4 * sigma * sigma));
    re[j] = g * Math.cos(k0 * (x - x0));
    im[j] = g * Math.sin(k0 * (x - x0));
  }

  // (1 + iαH) χ = ψ,  ψ_new = 2χ − ψ   with α = dt/2ħ,
  // H = tridiag(−r, 2r + U_j, −r),  r = (ħ²/2m)/dx².
  const alpha = dt / (2 * HBAR);
  const r = H2M / (dx * dx);
  const o = -alpha * r;                         // off-diagonal = i·o
  // Thomas algorithm, forward sweep precomputed: inv_j = 1/(d_j − off·c_{j−1}), c_j = off·inv_j.
  const invRe = new Float64Array(n), invIm = new Float64Array(n);
  const cRe = new Float64Array(n), cIm = new Float64Array(n);
  let pr = 0, pi = 0;                           // c_{j−1}
  for (let j = 0; j < n; j++) {
    const u = j >= jL && j < jR ? U0 : 0;
    // denominator = (1 + i·α(2r+u)) − (i·o)(pr + i·pi)
    const dr = 1 + o * pi;
    const di = alpha * (2 * r + u) - o * pr;
    const m = dr * dr + di * di;
    invRe[j] = dr / m;
    invIm[j] = -di / m;
    pr = -o * invIm[j];                         // (i·o)(invRe + i·invIm)
    pi = o * invRe[j];
    cRe[j] = pr;
    cIm[j] = pi;
  }
  const yRe = new Float64Array(n), yIm = new Float64Array(n);

  function stepOnce() {
    let ar = 0, ai = 0;                         // y_{j−1}
    for (let j = 0; j < n; j++) {
      const br = re[j] + o * ai;                // ψ_j − (i·o)·y_{j−1}
      const bi = im[j] - o * ar;
      ar = br * invRe[j] - bi * invIm[j];
      ai = br * invIm[j] + bi * invRe[j];
      yRe[j] = ar;
      yIm[j] = ai;
    }
    let xr = 0, xi = 0;                         // χ_{j+1}
    for (let j = n - 1; j >= 0; j--) {
      const cr = yRe[j] - (cRe[j] * xr - cIm[j] * xi);
      const ci = yIm[j] - (cRe[j] * xi + cIm[j] * xr);
      re[j] = 2 * cr - re[j];
      im[j] = 2 * ci - im[j];
      xr = cr;
      xi = ci;
    }
  }

  const solver = {
    re, im, n, dx, xMin, dt, jL, jR, t: 0,
    step(count = 1) {
      for (let i = 0; i < count; i++) stepOnce();
      solver.t += count * dt;
    },
    probabilities() {
      let left = 0, inside = 0, right = 0;
      for (let j = 0; j < jL; j++) left += re[j] * re[j] + im[j] * im[j];
      for (let j = jL; j < jR; j++) inside += re[j] * re[j] + im[j] * im[j];
      for (let j = jR; j < n; j++) right += re[j] * re[j] + im[j] * im[j];
      left *= dx; inside *= dx; right *= dx;
      return { left, inside, right, norm: left + inside + right };
    },
  };
  return solver;
}

/**
 * Classical particle with the same energy: position (nm) at time t (fs).
 * It turns back at x = 0 if E ≤ U₀, otherwise crosses the barrier more slowly.
 */
export function classicalPosition(t, { E, U0, a, x0 }) {
  const v = speed(E);
  const t1 = -x0 / v;
  if (t <= t1) return { x: x0 + v * t, dir: 1 };
  if (E <= U0) return { x: -v * (t - t1), dir: -1 };
  const v2 = v * Math.sqrt(1 - U0 / E);
  const t2 = t1 + a / v2;
  if (t <= t2) return { x: v2 * (t - t1), dir: 1 };
  return { x: a + v * (t - t2), dir: 1 };
}
