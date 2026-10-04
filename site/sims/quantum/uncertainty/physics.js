// Physics of the uncertainty-relation lab. DOM-free.
//
// Units used throughout the wave-packet part: x in nm, k in nm⁻¹, t in fs.
// The particle is an electron; p = ħk, ω = ħk²/(2m).

export const HBAR = 1.054571817e-34;   // J·s
export const H = 6.62607015e-34;       // J·s
export const ME = 9.1093837015e-31;    // kg
export const EV = 1.602176634e-19;     // J

/** ω = DISP·k²  (nm²/fs): ħ/(2m) converted from m²/s. */
export const DISP = (HBAR / (2 * ME)) * 1e18 / 1e15;
/** Momentum (kg·m/s) of a wave number of 1 nm⁻¹. */
export const P_PER_K = HBAR * 1e9;

// ---------------------------------------------------------------------------
// Wave packet = sum of plane waves with Gaussian weights around k₀.
// |φ(k)|² ∝ exp(−(k−k₀)²/(2Δk²)), so the amplitudes are exp(−(k−k₀)²/(4Δk²)).
// ---------------------------------------------------------------------------

/** How far (in units of Δk) the components reach for each choice of N. */
const SPAN = { 1: 0, 3: 1.5, 7: 2.4, 21: 3 };
const MANY = 301;
const MANY_SPAN = 5;

/**
 * @param {number} k0   central wave number, nm⁻¹
 * @param {number} dk   width Δk of the momentum distribution, nm⁻¹
 * @param {number} n    1, 3, 7, 21, or 0 for "many" (a practically continuous set)
 * @returns {{k:Float64Array, w:Float64Array, step:number, period:number, many:boolean}}
 *   w are amplitudes normalised to Σw = 1 (so ψ(0, 0) = 1);
 *   period is the spatial period of the sum (Infinity for a single wave).
 */
export function buildComponents(k0, dk, n) {
  const many = !n;
  const count = many ? MANY : n;
  const span = many ? MANY_SPAN : SPAN[n];
  const step = count > 1 ? (2 * span * dk) / (count - 1) : 0;
  const k = new Float64Array(count);
  const w = new Float64Array(count);
  let sum = 0;
  for (let j = 0; j < count; j++) {
    const d = (j - (count - 1) / 2) * step;
    k[j] = k0 + d;
    w[j] = Math.exp(-(d * d) / (4 * dk * dk));
    sum += w[j];
  }
  for (let j = 0; j < count; j++) w[j] /= sum;
  return { k, w, step, period: step > 0 ? (2 * Math.PI) / step : Infinity, many };
}

/**
 * ψ(x, t) = Σ wⱼ·exp(i(kⱼx − ωⱼt)) on a uniform grid x = x0 + i·dx, i < n.
 * Fills re[] and im[].
 */
export function sampleWave(comp, t, x0, dx, n, re, im) {
  re.fill(0, 0, n);
  im.fill(0, 0, n);
  const { k, w } = comp;
  for (let j = 0; j < k.length; j++) {
    const ph = k[j] * x0 - DISP * k[j] * k[j] * t;
    let c = w[j] * Math.cos(ph);
    let s = w[j] * Math.sin(ph);
    const rc = Math.cos(k[j] * dx);
    const rs = Math.sin(k[j] * dx);
    for (let i = 0; i < n; i++) {
      re[i] += c;
      im[i] += s;
      const c2 = c * rc - s * rs;
      s = s * rc + c * rs;
      c = c2;
    }
  }
}

/** Group velocity (nm/fs) of the packet: v = ħk₀/m. */
export const groupVelocity = (k0) => 2 * DISP * k0;

/** Analytic width of a free Gaussian packet: σ(t) = σ₀·√(1 + (ħt/2mσ₀²)²). */
export const sigmaAnalytic = (s0, t) => s0 * Math.hypot(1, (DISP * t) / (s0 * s0));

/**
 * Mean and standard deviation of x computed numerically from |ψ(x, t)|²
 * on [center − half, center + half].
 */
export function positionSpread(comp, t, center, half, n = 1600) {
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  const dx = (2 * half) / n;
  sampleWave(comp, t, center - half + dx / 2, dx, n, re, im);
  let m0 = 0, m1 = 0, m2 = 0;
  for (let i = 0; i < n; i++) {
    const rho = re[i] * re[i] + im[i] * im[i];
    const x = -half + dx / 2 + i * dx;         // relative to the centre
    m0 += rho; m1 += rho * x; m2 += rho * x * x;
  }
  const mean = m1 / m0;
  return { mean: center + mean, sigma: Math.sqrt(Math.max(m2 / m0 - mean * mean, 0)) };
}

/** Mean and standard deviation of k from the weights |φ|² = w². */
export function momentumSpread(comp) {
  const { k, w } = comp;
  let m0 = 0, m1 = 0;
  for (let j = 0; j < k.length; j++) { m0 += w[j] * w[j]; m1 += w[j] * w[j] * k[j]; }
  const mean = m1 / m0;
  let m2 = 0;
  for (let j = 0; j < k.length; j++) m2 += w[j] * w[j] * (k[j] - mean) ** 2;
  return { mean, sigma: Math.sqrt(m2 / m0) };
}

/**
 * Δx and Δk of the packet at time t, both computed numerically.
 * A single wave is not localised at all (Δx = ∞); a finite set of waves
 * repeats with comp.period, so Δx is taken over one period around the centre.
 * s0 only chooses the integration range for the continuous packet.
 */
export function uncertainties(comp, k0, s0, t) {
  const kk = momentumSpread(comp);
  const center = groupVelocity(k0) * t;
  if (comp.k.length === 1) return { x: center, dx: Infinity, k: kk.mean, dk: 0 };
  const half = comp.many
    ? Math.min(7 * sigmaAnalytic(s0, t), comp.period / 2)
    : comp.period / 2;
  const xx = positionSpread(comp, t, center, half);
  return { x: xx.mean, dx: xx.sigma, k: kk.mean, dk: kk.sigma };
}

// ---------------------------------------------------------------------------
// Single slit (Fraunhofer diffraction of the electron wave).
// ---------------------------------------------------------------------------

/** Relative intensity in direction θ: sinc²(π·a·sinθ/λ). */
export function slitIntensity(sinTheta, a, lambda) {
  const b = (Math.PI * a * sinTheta) / lambda;
  if (Math.abs(b) < 1e-9) return 1;
  const s = Math.sin(b) / b;
  return s * s;
}

/**
 * Probability density on a flat screen as a function of T = tanθ = y/L
 * (not normalised): I(θ)·d(sinθ)/dT = I·cos³θ.
 */
export function screenDensity(T, a, lambda) {
  const c = 1 / Math.sqrt(1 + T * T);
  return slitIntensity(T * c, a, lambda) * c * c * c;
}

/** Random landing point T = tanθ on the screen |T| ≤ tMax (rejection sampling). */
export function sampleScreen(a, lambda, tMax, rnd = Math.random) {
  for (;;) {
    const T = (2 * rnd() - 1) * tMax;
    if (rnd() < screenDensity(T, a, lambda)) return T;
  }
}

/**
 * Expected share of hits in each of n equal bins over |T| ≤ tMax.
 * Returns { share, mean }: share[i] sums to 1; mean is the bin-averaged
 * screenDensity that corresponds to share = 1/n… i.e. share[i] = avgDensity[i] / (n·mean).
 */
export function screenBins(a, lambda, tMax, n) {
  const SUB = 24;
  const share = new Float64Array(n);
  const w = (2 * tMax) / n;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let q = 0; q < SUB; q++) s += screenDensity(-tMax + (i + (q + 0.5) / SUB) * w, a, lambda);
    share[i] = s / SUB;
    sum += share[i];
  }
  for (let i = 0; i < n; i++) share[i] /= sum;
  return { share, mean: sum / n };
}

/** tanθ of the first minimum (sinθ₁ = λ/a); Infinity if there is none. */
export function firstMinimumTan(a, lambda) {
  const s = lambda / a;
  return s < 1 ? s / Math.sqrt(1 - s * s) : Infinity;
}

/** Expected share of the hits on the screen that fall inside the central maximum. */
export function centralShare(a, lambda, tMax) {
  const t1 = Math.min(firstMinimumTan(a, lambda), tMax);
  const N = 4000;
  let all = 0, mid = 0;
  for (let i = 0; i < N; i++) {
    const T = -tMax + ((i + 0.5) / N) * 2 * tMax;
    const d = screenDensity(T, a, lambda);
    all += d;
    if (Math.abs(T) < t1) mid += d;
  }
  return mid / all;
}
