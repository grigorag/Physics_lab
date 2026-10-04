// Geometrical optics at a flat boundary: Snell's law, Fresnel reflectance,
// critical angle, and the lateral shift of a ray in a plane-parallel plate.
// All angles are in radians.

/** Speed of light in vacuum, m/s. */
export const C_LIGHT = 2.99792458e8;

/** Preset media (refractive indices as used in school problems). */
export const MEDIA = {
  air:     { name: 'Օդ',     n: 1.0 },
  water:   { name: 'Ջուր',   n: 1.33 },
  glass:   { name: 'Ապակի',  n: 1.5 },
  diamond: { name: 'Ալմաստ', n: 2.42 },
};

/** Critical angle of total internal reflection, or null when n1 <= n2. */
export const criticalAngle = (n1, n2) => (n1 > n2 ? Math.asin(n2 / n1) : null);

/**
 * A ray going from medium n1 into medium n2 at the angle of incidence `a`.
 * Returns { tir, gamma, R, T, critical }:
 *   gamma – angle of refraction (null at total internal reflection),
 *   R, T  – reflected / transmitted energy fractions for unpolarised light
 *           (Fresnel: R = (Rs + Rp) / 2, T = 1 − R).
 */
export function refract(n1, n2, a) {
  const critical = criticalAngle(n1, n2);
  const sinG = (n1 / n2) * Math.sin(a);
  if (sinG > 1) return { tir: true, gamma: null, R: 1, T: 0, critical };

  const gamma = Math.asin(sinG);
  const ci = Math.cos(a);
  const ct = Math.cos(gamma);
  const rs = (n1 * ci - n2 * ct) / (n1 * ci + n2 * ct);
  const rp = (n1 * ct - n2 * ci) / (n1 * ct + n2 * ci);
  const R = (rs * rs + rp * rp) / 2;
  return { tir: false, gamma, R, T: 1 - R, critical };
}

/**
 * Plane-parallel plate of thickness d and index n in a medium with index n0.
 * Returns the refraction angle inside, the lateral shift of the emerging ray
 * x = d·sin(α − γ)/cos γ and the path length inside the plate.
 */
export function plateShift(d, n, a, n0 = 1) {
  const gamma = Math.asin((n0 / n) * Math.sin(a));
  return {
    gamma,
    shift: (d * Math.sin(a - gamma)) / Math.cos(gamma),
    path: d / Math.cos(gamma),
  };
}
