// Relativistic velocity addition (1D). All speeds are in units of c (β).
// DOM-free.

export const C_KM_S = 299792.458;          // speed of light, km/s

/** Relativistic sum: ship speed v (station frame) ⊕ probe speed w (ship frame). */
export function addRel(v, w) {
  if (Math.abs(w) === 1) return Math.sign(w);        // light stays light, exactly
  if (Math.abs(v) === 1) return Math.sign(v);
  return (v + w) / (1 + v * w);
}

/** Classical (Galilean) sum. */
export const addClassical = (v, w) => v + w;

/** Lorentz factor; Infinity at |β| = 1, NaN above. */
export function gamma(beta) {
  const b2 = beta * beta;
  if (b2 === 1) return Infinity;
  if (b2 > 1) return NaN;
  return 1 / Math.sqrt(1 - b2);
}

/** Relative error of the classical sum with respect to the true one, in %. */
export function classicalError(v, w) {
  const u = addRel(v, w);
  const cl = addClassical(v, w);
  if (u === 0) return 0;
  return (Math.abs(cl - u) / Math.abs(u)) * 100;
}

/** Speed after n successive boosts of `step`, each relative to the previous stage. */
export function stageSpeed(n, step = 0.5) {
  let u = 0;
  for (let i = 0; i < n; i++) u = addRel(u, step);
  return u;
}
