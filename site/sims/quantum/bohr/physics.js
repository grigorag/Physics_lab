// Bohr model of the hydrogen atom — DOM-free physics.
//
// Units: energy in eV, lengths in nm, frequency in Hz, speed in m/s.
// The Rydberg constant is the one for hydrogen (finite proton mass), so the
// lines agree with tabulated values. Wavelengths above 200 nm are converted to
// air (as spectral tables do); the far ultraviolet stays in vacuum.

export const N_MAX = 6;

export const R_H = 1.0967758e7;          // Rydberg constant for hydrogen, 1/m
export const HC = 1239.84198;            // h·c, eV·nm
export const C_LIGHT = 2.99792458e8;     // m/s
export const RYDBERG_EV = HC * R_H * 1e-9;   // ionisation energy, ≈ 13.598 eV
export const A0 = 0.0529177;             // Bohr radius, nm
export const V1 = 2.18769e6;             // electron speed on the first orbit, m/s

export const energy = (n) => -RYDBERG_EV / (n * n);        // eV
export const radius = (n) => A0 * n * n;                   // nm
export const speed = (n) => V1 / n;                        // m/s
/** Orbital angular frequency relative to n = 1 (ω = v/r ∝ 1/n³). */
export const relOmega = (n) => 1 / (n * n * n);

/** Refractive index of standard air (Edlén), λ in nm (vacuum). */
function airIndex(lambdaVac) {
  const s2 = (1000 / lambdaVac) ** 2;                      // (1/µm)²
  return 1 + 1e-8 * (8342.13 + 2406030 / (130 - s2) + 15997 / (38.9 - s2));
}

export const REGION = { UV: 'uv', VISIBLE: 'visible', IR: 'ir' };
export const VISIBLE_MIN = 380;
export const VISIBLE_MAX = 750;

/** Photon of the transition between levels a and b (order does not matter). */
export function transition(a, b) {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const dE = energy(hi) - energy(lo);                      // eV, > 0
  const lambdaVac = HC / dE;                               // nm
  const lambda = lambdaVac > 200 ? lambdaVac / airIndex(lambdaVac) : lambdaVac;
  const region = lambda < VISIBLE_MIN ? REGION.UV : lambda > VISIBLE_MAX ? REGION.IR : REGION.VISIBLE;
  return { lo, hi, dE, lambda, lambdaVac, nu: C_LIGHT / (lambdaVac * 1e-9), region };
}

/** (1/lo² − 1/hi²) as a reduced fraction [num, den]. */
export function rydbergFraction(lo, hi) {
  let num = hi * hi - lo * lo;
  let den = lo * lo * hi * hi;
  const gcd = (x, y) => (y ? gcd(y, x % y) : x);
  const g = gcd(num, den);
  return [num / g, den / g];
}

/** Next step of a spontaneous cascade: any lower level, equally likely. */
export const randomLower = (n, rnd = Math.random) => 1 + Math.floor(rnd() * (n - 1));
/** Random excited level 2…N_MAX. */
export const randomExcited = (rnd = Math.random) => 2 + Math.floor(rnd() * (N_MAX - 1));
