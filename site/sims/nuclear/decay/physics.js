// Radioactive decay — DOM-free physics.
//
// Time is measured in half-lives of the parent isotope: τ = t / T.
// Every undecayed nucleus decays during a step Δτ with the exact probability
// p = 1 − e^(−λΔt) = 1 − 2^(−Δτ), so the statistics do not depend on the step.
// Optional chain: parent → daughter (half-life T₂ = r·T) → stable.

export const LN2 = Math.LN2;

/** Real half-lives. T is given in `unit`. */
export const ISOTOPES = {
  po214: { name: 'Պոլոնիում-214', sym: '²¹⁴Po', product: '²¹⁰Pb', mode: 'α', T: 164, unit: 'մկվ' },
  rn220: { name: 'Ռադոն-220', sym: '²²⁰Rn', product: '²¹⁶Po', mode: 'α', T: 55.6, unit: 'վ' },
  i131: { name: 'Յոդ-131', sym: '¹³¹I', product: '¹³¹Xe', mode: 'β⁻', T: 8.02, unit: 'օր' },
  co60: { name: 'Կոբալտ-60', sym: '⁶⁰Co', product: '⁶⁰Ni', mode: 'β⁻', T: 5.27, unit: 'տարի' },
  cs137: { name: 'Ցեզիում-137', sym: '¹³⁷Cs', product: '¹³⁷Ba', mode: 'β⁻', T: 30.1, unit: 'տարի' },
  c14: { name: 'Ածխածին-14', sym: '¹⁴C', product: '¹⁴N', mode: 'β⁻', T: 5730, unit: 'տարի' },
  u238: { name: 'Ուրան-238', sym: '²³⁸U', product: '²³⁴Th', mode: 'α', T: 4.47e9, unit: 'տարի' },
  custom: { name: 'Ընտրովի', sym: 'X', product: 'Y', mode: null, T: null, unit: 'վ' },
};

/** Nucleus kinds. */
export const PARENT = 0;
export const DAUGHTER = 1;   // radioactive daughter (chain mode only)
export const STABLE = 2;

export function createSample(n0) {
  return {
    n0,
    tau: 0,
    kind: new Uint8Array(n0),            // PARENT / DAUGHTER / STABLE
    when: new Float64Array(n0).fill(-1e9), // stamp of the last decay (for the flash)
    n1: n0, n2: 0, n3: 0,
  };
}

/**
 * Advances the sample by dtau half-lives in ONE step and returns the number of
 * decays. Exact for the parent at any dtau; in chain mode keep dtau ≪ min(1, r)
 * so that a nucleus rarely needs to decay twice within one step.
 */
export function step(s, dtau, { chain = false, r = 1, stamp = 0, rng = Math.random } = {}) {
  const p1 = -Math.expm1(-LN2 * dtau);               // 1 − e^(−λ₁Δt)
  const p2 = chain ? -Math.expm1((-LN2 * dtau) / r) : 0;
  const after = chain ? DAUGHTER : STABLE;
  const { kind, when } = s;
  let d1 = 0, d2 = 0;
  for (let i = 0; i < s.n0; i++) {
    const k = kind[i];
    if (k === PARENT) {
      if (rng() < p1) { kind[i] = after; when[i] = stamp; d1++; }
    } else if (k === DAUGHTER) {
      if (rng() < p2) { kind[i] = STABLE; when[i] = stamp; d2++; }
    }
  }
  s.n1 -= d1;
  if (chain) { s.n2 += d1 - d2; s.n3 += d2; } else { s.n3 += d1; }
  s.tau += dtau;
  return d1 + d2;
}

/**
 * Theoretical fractions at τ (in parent half-lives), r = T₂/T.
 * a = total activity in units of N₀/T.
 */
export function theory(tau, chain = false, r = 1) {
  const l1 = LN2;
  const n1 = Math.pow(2, -tau);
  if (!chain) return { n1, n2: 0, n3: 1 - n1, a: l1 * n1 };
  const l2 = LN2 / r;
  const n2 = Math.abs(l2 - l1) < 1e-9
    ? l1 * tau * Math.exp(-l1 * tau)
    : (l1 / (l2 - l1)) * (Math.exp(-l1 * tau) - Math.exp(-l2 * tau));
  return { n1, n2, n3: 1 - n1 - n2, a: l1 * n1 + l2 * n2 };
}

/** Largest theoretical total activity on [0, tauMax] (units of N₀/T). */
export function peakActivity(chain, r, tauMax) {
  if (!chain) return LN2;
  let best = 0;
  for (let i = 0; i <= 600; i++) best = Math.max(best, theory((tauMax * i) / 600, true, r).a);
  return best;
}

/** Age from the remaining fraction f = N/N₀: t = T·log₂(N₀/N). */
export const ageFromFraction = (T, f) => T * Math.log2(1 / f);
