// Rutherford scattering — DOM-free physics.
//
// Units: energies in MeV, lengths in femtometres (fm). With ke² = 1.44 MeV·fm
// the Coulomb energy of charges q₁e and q₂e at distance r is q₁q₂·1.44/r MeV.
//
// Trajectories are integrated in "path-length time" s = v₀·t (fm), where v₀ is
// the speed of the α-particle far from the target. In these units
//   d²r/ds² = (d₀/2)·r̂ / r²        (point nucleus),
// with d₀ = k·2Ze²/E the head-on distance of closest approach, and the
// conserved energy (divided by E) is  v² + U(r)/E = 1.

export const KE2 = 1.44;          // ke², MeV·fm
export const Z_ALPHA = 2;         // charge of the α-particle, in e
export const ATOM_R = 1e5;        // radius of the atom (Thomson sphere), fm = 100 pm

export const TARGETS = {
  au: { Z: 79, A: 197, name: 'Ոսկի', symbol: 'Au' },
  ag: { Z: 47, A: 108, name: 'Արծաթ', symbol: 'Ag' },
  al: { Z: 13, A: 27, name: 'Ալյումին', symbol: 'Al' },
};

/** Radius of a nucleus with mass number A, fm. */
export const nuclearRadius = (A) => 1.2 * Math.cbrt(A);
export const R_ALPHA = nuclearRadius(4);

/** d₀: closest approach in a head-on collision, fm (E in MeV). */
export const headOnDistance = (Z, E) => (Z_ALPHA * Z * KE2) / E;

/** Scattering angle (rad) for impact parameter b: tan(θ/2) = d₀ / (2b). */
export const scatteringAngle = (b, d0) => (b <= 0 ? Math.PI : 2 * Math.atan(d0 / (2 * b)));

/** Distance of closest approach for impact parameter b. */
export const closestApproach = (b, d0) => d0 / 2 + Math.hypot(d0 / 2, b);

/** Potential energy divided by E at distance r. */
function potential(r, d0, thomson) {
  if (thomson && r < ATOM_R) return (d0 / (2 * ATOM_R)) * (3 - (r * r) / (ATOM_R * ATOM_R));
  return d0 / r;
}

/**
 * Integrates one trajectory (velocity Verlet, step proportional to the
 * distance from the centre). The particle starts far to the left, moving
 * along +x at height y = b ≥ 0.
 *
 * @param {object} o
 * @param {number} o.b        impact parameter, fm
 * @param {number} o.d0       head-on closest approach, fm
 * @param {boolean} [o.thomson]  uniformly charged sphere of radius ATOM_R instead of a point nucleus
 * @param {{x:number, y:number}} o.box  half-extents (fm) of the region whose points are recorded
 * @returns {{xs:number[], ys:number[], ts:number[], theta:number, rmin:number, drift:number}}
 *          recorded points with their time s, the scattering angle (rad) from
 *          the final velocity, the smallest distance reached and the relative energy drift.
 */
export function trace({ b, d0, thomson = false, box }) {
  const far = thomson ? 40 * ATOM_R : 500 * Math.max(d0, b) + 2 * box.x;
  const floor = thomson ? ATOM_R / 300 : d0 / 400;
  const k = d0 / 2;
  const R3 = ATOM_R ** 3;

  let x = -far, y = b;
  let r = Math.hypot(x, y);
  let vx = Math.sqrt(1 - potential(r, d0, thomson)), vy = 0;
  let t = 0;
  let rmin = r;

  const acc = () => {
    const f = thomson && r < ATOM_R ? k / R3 : k / (r * r * r);
    return [f * x, f * y];
  };
  let [ax, ay] = acc();

  const xs = [], ys = [], ts = [];
  const bx = box.x * 1.08, by = box.y * 1.08;
  const record = () => { if (Math.abs(x) <= bx && Math.abs(y) <= by) { xs.push(x); ys.push(y); ts.push(t); } };

  for (let i = 0; i < 40000; i++) {
    const ds = Math.max(0.02 * r, floor);
    vx += 0.5 * ax * ds; vy += 0.5 * ay * ds;
    x += vx * ds; y += vy * ds;
    r = Math.hypot(x, y);
    [ax, ay] = acc();
    vx += 0.5 * ax * ds; vy += 0.5 * ay * ds;
    t += ds;
    if (r < rmin) rmin = r;
    record();
    if (r > far && x * vx + y * vy > 0) break;
  }

  const energy = vx * vx + vy * vy + potential(r, d0, thomson);
  return { xs, ys, ts, theta: Math.atan2(vy, vx), rmin, drift: Math.abs(energy - 1) };
}

// ---------- Angular distribution on the screen ----------

/**
 * Screened Rutherford distribution of the scattering angle θ ∈ [0, π]:
 *   p(θ) ∝ 1 / (sin²(θ/2) + sin²(θs/2))²
 * For θ ≫ θs it is Rutherford's 1/sin⁴(θ/2); below θs it flattens, as the
 * atomic electrons screen the nucleus for distant passages.
 * (This is the density per unit angle along a narrow screen strip in the
 * plane of the drawing, i.e. per unit solid angle.)
 */
export function makeRutherfordSampler(thetaS) {
  const N = 6000;
  const a2 = Math.sin(thetaS / 2) ** 2;
  const f = (th) => 1 / (Math.sin(th / 2) ** 2 + a2) ** 2;
  const grid = new Float64Array(N + 1);
  const cum = new Float64Array(N + 1);
  for (let i = 0; i <= N; i++) grid[i] = Math.PI * (i / N) ** 3;   // dense near 0
  for (let i = 1; i <= N; i++) {
    // Simpson's rule on each cell
    const lo = grid[i - 1], hi = grid[i];
    cum[i] = cum[i - 1] + ((hi - lo) / 6) * (f(lo) + 4 * f((lo + hi) / 2) + f(hi));
  }
  const total = cum[N];

  /** Fraction of particles with θ below th (rad). */
  function cdf(th) {
    if (th <= 0) return 0;
    if (th >= Math.PI) return 1;
    const pos = N * Math.cbrt(th / Math.PI);
    const i = Math.min(N - 1, Math.floor(pos));
    const w = (th - grid[i]) / (grid[i + 1] - grid[i]);
    return (cum[i] + w * (cum[i + 1] - cum[i])) / total;
  }

  return {
    /** θ (rad) for a uniform random number u ∈ [0, 1). */
    sample(u) {
      const target = u * total;
      let lo = 0, hi = N;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] <= target) lo = mid; else hi = mid;
      }
      const w = (target - cum[lo]) / (cum[hi] - cum[lo]);
      return grid[lo] + w * (grid[hi] - grid[lo]);
    },
    cdf,
    /** Fraction with a ≤ θ ≤ b (rad). */
    fraction: (a, b) => cdf(b) - cdf(a),
    /** Normalised density per radian (screened). */
    pdf: (th) => f(th) / total,
    /** Pure Rutherford density C / sin⁴(θ/2) with the same constant C. */
    rutherford: (th) => 1 / (total * Math.sin(th / 2) ** 4),
  };
}

/** erf(x), Abramowitz–Stegun 7.1.26 (|error| < 1.5e-7). */
function erf(x) {
  const s = Math.sign(x);
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}

/**
 * Thomson ("plum pudding") foil: many tiny random deflections add up to a
 * narrow Gaussian of standard deviation sigma (rad).
 */
export function makeThomsonSampler(sigma) {
  const cdf = (th) => erf(Math.max(th, 0) / (sigma * Math.SQRT2));
  return {
    /** |θ| from two uniform random numbers. */
    sample: (u1, u2) => Math.abs(sigma * Math.sqrt(-2 * Math.log(1 - u1)) * Math.cos(2 * Math.PI * u2)),
    cdf,
    fraction: (a, b) => cdf(b) - cdf(a),
  };
}
