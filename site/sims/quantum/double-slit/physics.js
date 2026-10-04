// Double-slit experiment with single particles — physics (no DOM).
//
// All quantities are SI (metres, volts). x is the coordinate on the detection
// screen, measured from the point opposite the middle between the slits; the
// left slit is at x = −d/2, the right one at x = +d/2.
//
// Far-field (Fraunhofer, small angles) amplitudes of the two slits on the screen:
//   s₁(x) = sinc(π a (x + d/2) / (λL)),   s₂(x) = sinc(π a (x − d/2) / (λL)),
// with the phase difference δ = 2π d x / (λL) between them.
//   both slits, path unknown:  P ∝ |s₁ + s₂ e^{iδ}|² = s₁² + s₂² + 2 s₁ s₂ cos δ
//   path measured (detector):  P ∝ s₁² + s₂²            (incoherent sum, no fringes)
//   one slit open:             P ∝ s₁²  or  s₂²
// For d ≪ λL/a the first line is the textbook cos²(π d x/λL) · sinc²(π a x/λL).

const H_PLANCK = 6.62607015e-34;   // J·s
const M_E = 9.1093837e-31;         // kg
const Q_E = 1.602176634e-19;       // C

/** de Broglie wavelength of an electron accelerated from rest by U volts (non-relativistic). */
export const electronWavelength = (U) => H_PLANCK / Math.sqrt(2 * M_E * Q_E * U);

/** Speed of that electron, m/s. */
export const electronSpeed = (U) => Math.sqrt((2 * Q_E * U) / M_E);

/** Distance between neighbouring interference maxima on the screen. */
export const fringeSpacing = ({ lambda, L, d }) => (lambda * L) / d;

/** Half-width of the central diffraction maximum of one slit (first zero). */
export const envelopeHalfWidth = ({ lambda, L, a }) => (lambda * L) / a;

const sinc = (u) => (Math.abs(u) < 1e-9 ? 1 : Math.sin(u) / u);

/**
 * Relative probability density on the screen (maximum ≈ 1).
 * @param {number} x
 * @param {{lambda:number, d:number, a:number, L:number}} p
 * @param {'both'|'left'|'right'} slits   which slits are open
 * @param {boolean} detector              which-slit detector on
 */
export function density(x, p, slits = 'both', detector = false) {
  const k = Math.PI / (p.lambda * p.L);
  const s1 = sinc(k * p.a * (x + p.d / 2));
  const s2 = sinc(k * p.a * (x - p.d / 2));
  if (slits === 'left') return s1 * s1;
  if (slits === 'right') return s2 * s2;
  if (detector) return 0.5 * (s1 * s1 + s2 * s2);
  return 0.25 * (s1 * s1 + s2 * s2 + 2 * s1 * s2 * Math.cos(2 * k * p.d * x));
}

const NICE = [1, 1.5, 2, 3, 4, 5, 6, 8, 10];

/** Smallest "round" number (1, 1.5, 2, 3 … × 10ⁿ) not below v. */
export function niceCeil(v) {
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / pow;
  return (NICE.find((n) => n >= m - 1e-9) ?? 10) * pow;
}

/**
 * Half-width of the screen region to show: wide enough for the central
 * diffraction maximum, but not so wide that the fringes become unresolvable.
 */
export function screenHalfWidth(p) {
  return niceCeil(Math.min(1.25 * envelopeHalfWidth(p), 6 * fringeSpacing(p)));
}

/** Cumulative distribution of fn on [−W, W] (trapezoid cells), for inverse-CDF sampling. */
function makeCdf(fn, W, n) {
  const f = new Float64Array(n + 1);
  const cdf = new Float64Array(n + 1);
  const h = (2 * W) / n;
  for (let i = 0; i <= n; i++) f[i] = fn(-W + i * h);
  for (let i = 1; i <= n; i++) cdf[i] = cdf[i - 1] + 0.5 * (f[i - 1] + f[i]) * h;
  const total = cdf[n];

  function sample(u) {
    const target = u * total;
    let lo = 0, hi = n;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] <= target) lo = mid; else hi = mid;
    }
    // invert the trapezoid inside the cell: f0·t + (f1−f0)·t²/2 = r, t in 0..1
    const f0 = f[lo], f1 = f[hi];
    const r = (target - cdf[lo]) / h;
    const df = f1 - f0;
    let t;
    if (Math.abs(df) < 1e-12 * (f0 + f1 + 1e-300)) t = f0 > 0 ? r / f0 : 0.5;
    else t = (-f0 + Math.sqrt(Math.max(0, f0 * f0 + 2 * df * r))) / df;
    return -W + (lo + Math.min(Math.max(t, 0), 1)) * h;
  }
  return { total, sample };
}

/**
 * Sampler of landing points on the screen region [−W, W].
 *   sampler.sample()  → { x, slit }   slit: 1 = left, 2 = right, 0 = unknowable
 *   sampler.pdf(x)    → normalised probability density (1/m) on [−W, W]
 * With the detector on (or one slit closed) the slit is known; with both slits
 * open and no detector the particle has no definite slit.
 */
export function createSampler(p, slits, detector, W, { n = 4096, random = Math.random } = {}) {
  const pattern = (x) => density(x, p, slits, detector);
  const all = makeCdf(pattern, W, n);
  let left = null, right = null;
  if (slits === 'both' && detector) {
    left = makeCdf((x) => density(x, p, 'left'), W, n);
    right = makeCdf((x) => density(x, p, 'right'), W, n);
  }

  return {
    W,
    pdf: (x) => pattern(x) / all.total,
    sample() {
      if (left) {
        // the detector registers the slit; each slit then gives its own pattern
        const viaLeft = random() * (left.total + right.total) < left.total;
        return { x: (viaLeft ? left : right).sample(random()), slit: viaLeft ? 1 : 2 };
      }
      const slit = slits === 'left' ? 1 : slits === 'right' ? 2 : 0;
      return { x: all.sample(random()), slit };
    },
  };
}
