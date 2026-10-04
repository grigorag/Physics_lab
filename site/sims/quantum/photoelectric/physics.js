// Photoelectric effect — physics (no DOM).
//
// Units: wavelength in nm, energies in eV, voltage in V, frequency in Hz,
// photocurrent in μA.
//
// Einstein's equation:  hν = A + Ek_max   (A — work function of the cathode)
// Red limit:            ν₀ = A/h,  λ₀ = hc/A
// Stopping voltage:     e·U₀ = Ek_max  →  U₀ [V] = Ek_max [eV]
//
// Photocurrent model (a school-level idealisation, not a real tube):
//   • no emission when hν ≤ A, whatever the intensity;
//   • the saturation current is proportional to the light intensity only
//     (I_sat = I_FULL · intensity); its dependence on λ and on the metal
//     (quantum yield) is ignored;
//   • the photoelectrons leave the cathode along the tube axis with kinetic
//     energies distributed uniformly in 0 … Ek_max. With a retarding voltage
//     U < 0 only those with Ek > e|U| reach the anode, so
//         I = I_sat · (1 − |U|/U₀)   for −U₀ < U < 0,
//         I = 0                      for U ≤ −U₀,
//         I = I_sat                  for U ≥ 0.
//   The animated electrons follow exactly the same model, so the share of
//   electrons that reach the anode on screen matches the ammeter.

export const H_EV = 4.135667696e-15;     // Planck constant, eV·s
export const C_LIGHT = 2.99792458e8;     // m/s
export const HC = 1239.841984;           // h·c, eV·nm
const E_CHARGE = 1.602176634e-19;        // C  (J per eV)
const M_ELECTRON = 9.1093837e-31;        // kg

export const I_FULL = 10;                // saturation current at 100 % intensity, μA

/** Cathode metals and their work functions, eV. */
export const METALS = [
  { id: 'cs', name: 'Ցեզիում', symbol: 'Cs', A: 2.14 },
  { id: 'k',  name: 'Կալիում', symbol: 'K',  A: 2.30 },
  { id: 'na', name: 'Նատրիում', symbol: 'Na', A: 2.75 },
  { id: 'zn', name: 'Ցինկ',    symbol: 'Zn', A: 4.33 },
  { id: 'cu', name: 'Պղինձ',   symbol: 'Cu', A: 4.70 },
  { id: 'pt', name: 'Պլատին',  symbol: 'Pt', A: 5.65 },
];

export const photonEnergy = (lambda) => HC / lambda;                 // eV
export const frequency = (lambda) => C_LIGHT / (lambda * 1e-9);      // Hz
export const redLimitWavelength = (A) => HC / A;                     // nm
export const redLimitFrequency = (A) => A / H_EV;                    // Hz

/** Share of the emitted electrons that reach the anode at voltage U (0…1). */
export function reachFraction(U, U0) {
  if (U0 <= 0) return 0;
  if (U >= 0) return 1;
  return Math.max(0, 1 - -U / U0);
}

/** Photocurrent (μA) at voltage U for given Ek_max (eV) and intensity (0…1). */
export function photocurrent(U, ekMax, intensity) {
  if (ekMax <= 0) return 0;
  return I_FULL * intensity * reachFraction(U, ekMax);
}

/**
 * Everything the page shows, for wavelength λ (nm), work function A (eV),
 * voltage U (V, positive = anode positive) and intensity (0…1).
 */
export function solve(lambda, A, U, intensity) {
  const E = photonEnergy(lambda);
  const emits = E > A;
  const ekMax = emits ? E - A : 0;
  return {
    E,
    nu: frequency(lambda),
    emits,
    ekMax,
    U0: ekMax,
    lambda0: redLimitWavelength(A),
    nu0: redLimitFrequency(A),
    vMax: Math.sqrt((2 * ekMax * E_CHARGE) / M_ELECTRON),            // m/s
    iSat: emits ? I_FULL * intensity : 0,
    I: photocurrent(U, ekMax, intensity),
    fraction: emits ? reachFraction(U, ekMax) : 0,
  };
}

// ---------- Animated electrons ----------
// The gap cathode → anode is x ∈ [0, 1]. Screen speed v = SPEED_K·√Ek, so the
// uniform field between the plates (energy Ek(x) = Ek₀ + U·x in eV) gives a
// constant acceleration a = SPEED_K²·U/2. Each step integrates this exactly.

export const SPEED_K = 0.7;              // gap lengths per second at Ek = 1 eV

/** A new electron with kinetic energy uniform in 0 … ekMax. */
export function emitElectron(ekMax, rnd = Math.random) {
  return { x: 0, v: SPEED_K * Math.sqrt(rnd() * ekMax) };
}

/** Advances an electron by dt; returns 'anode', 'cathode' or null (still flying). */
export function stepElectron(el, U, dt) {
  const a = (SPEED_K * SPEED_K * U) / 2;
  el.x += el.v * dt + (a * dt * dt) / 2;
  el.v += a * dt;
  if (el.x >= 1) return 'anode';
  if (el.x <= 0 && el.v <= 0) return 'cathode';
  return null;
}
