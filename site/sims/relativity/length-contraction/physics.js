// Special relativity: length contraction and the cosmic-muon example.
// DOM-free; SI units unless a name says otherwise.

export const C = 299792458;            // speed of light, m/s
export const MUON_TAU = 2.2e-6;        // mean proper lifetime of a muon, s

/** Lorentz factor γ = 1/√(1 − β²). */
export const gamma = (beta) => 1 / Math.sqrt(1 - beta * beta);

/** L/L₀ = √(1 − β²). */
export const contraction = (beta) => Math.sqrt(1 - beta * beta);

/** Rocket of proper length L0 (m) moving at βc past the station. */
export function rocket(beta, L0) {
  const g = gamma(beta);
  const v = beta * C;
  const L = L0 / g;
  return {
    beta, v, gamma: g, L0, L,
    percent: (1 - 1 / g) * 100,
    // Nose and tail pass one station point: both events at the same place in
    // the station frame (Δt = L/v); in the rocket frame the point travels L₀.
    tStation: v > 0 ? L / v : Infinity,
    tRocket: v > 0 ? L0 / v : Infinity,
    // Rocket-frame delay between the station's two "simultaneous" marks.
    markDelay: (v * L0) / (C * C),
  };
}

/** Muons created at altitude hKm (km) flying down at βc. */
export function muon(beta, hKm) {
  const g = gamma(beta);
  const v = beta * C;
  const h = hKm * 1000;
  const tEarth = h / v;                 // flight time, Earth frame
  const tMuon = tEarth / g;             // flight time, muon frame (proper)
  return {
    beta, gamma: g, v,
    lifeEarth: g * MUON_TAU,
    rangeClassicalKm: (v * MUON_TAU) / 1000,
    rangeKm: (v * g * MUON_TAU) / 1000,
    hMuonKm: hKm / g,
    tEarth, tMuon,
    survive: Math.exp(-tMuon / MUON_TAU),
    surviveClassical: Math.exp(-tEarth / MUON_TAU),
  };
}
