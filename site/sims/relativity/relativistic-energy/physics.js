// Relativistic energy and momentum of a particle. DOM-free.
// Energies in MeV, momentum as pc in MeV, speeds as β = v/c.
// The basic variable is k = Eₖ / mc² (so γ = 1 + k).

export const C = 299792458;          // m/s
export const C_KM_S = 299792.458;    // km/s

export const PARTICLES = {
  electron: { name: 'էլեկտրոն', mc2: 0.511 },
  muon:     { name: 'մյուոն',   mc2: 105.7 },
  proton:   { name: 'պրոտոն',   mc2: 938.3 },
};

export const K_MIN = 1e-3;
export const K_MAX = 1e4;

/** β from k = Eₖ/mc²:  β = √(k(k+2)) / (k+1). */
export const betaFromK = (k) => Math.sqrt(k * (k + 2)) / (k + 1);

/** k from β:  k = γ − 1, written so that small β keeps its precision. */
export function kFromBeta(b) {
  const s = Math.sqrt(1 - b * b);
  return (b * b) / (s * (1 + s));
}

/** Classical prediction v/c = √(2Eₖ/mc²). */
export const betaClassical = (k) => Math.sqrt(2 * k);

/** Everything about a particle of rest energy mc2 (MeV) with Eₖ = k·mc². */
export function compute(k, mc2) {
  const gamma = 1 + k;
  const beta = betaFromK(k);
  // 1 − β without cancellation: 1 − β² = 1/γ²
  const omb = 1 / (gamma * gamma * (1 + beta));
  const betaCl = betaClassical(k);
  return {
    k, mc2, gamma, beta, omb, betaCl,
    Ek: k * mc2,                           // MeV; also the accelerating voltage in MV (|q| = e)
    E: gamma * mc2,
    pc: mc2 * Math.sqrt(k * (k + 2)),      // = γβ·mc²
    pcCl: mc2 * beta,                      // classical p = mv at the true speed
    EkCl: 0.5 * mc2 * beta * beta,         // classical mv²/2 at the true speed
    err: betaCl / beta - 1,                // relative error of the classical speed
  };
}

/** Rest energy in joules of a mass in kilograms. */
export const restEnergyJ = (kg) => kg * C * C;

export const PETROL_Q = 4.6e7;       // J/kg, specific heat of combustion of petrol
export const PLANT_W = 1e9;          // W, a large power plant
