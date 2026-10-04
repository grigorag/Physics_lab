// Mirror optics (DOM-free).
//
// Paraxial school construction: the pole of the mirror is the origin, the
// optical axis is the x axis, light comes from the left. All rays reflect on
// the vertical plane x = 0. The object tip is T = (−d, h), d > 0.
//
// Sign convention of the mirror formula 1/d + 1/f = 1/F:
//   d > 0 always (the object is in front of the mirror);
//   F > 0 concave, F < 0 convex;
//   f > 0 real image (in front, x = −f), f < 0 virtual image (behind, x = −f > 0).
// Magnification Γ = H/h = −f/d  (Γ < 0: inverted, Γ > 0: upright).

export const EPS = 1e-3;

/** Image of an object at distance d from a mirror of focal length F. */
export function mirrorImage(d, F) {
  if (Math.abs(d - F) < EPS) return { inf: true, f: Infinity, gamma: Infinity, real: false };
  const f = (d * F) / (d - F);
  return { inf: false, f, gamma: -f / d, real: f > 0 };
}

/**
 * Kind of image, for the description:
 *  'convex' | 'inside' (d < F) | 'atF' | 'between' (F < d < 2F) | 'atC' | 'beyond' (d > 2F)
 */
export function imageKind(d, F) {
  if (F < 0) return 'convex';
  if (Math.abs(d - F) < EPS) return 'atF';
  if (d < F) return 'inside';
  if (Math.abs(d - 2 * F) < EPS) return 'atC';
  return d < 2 * F ? 'between' : 'beyond';
}

/**
 * The four principal rays of an object tip T = (−d, h) and a mirror F.
 * For each ray: `y` = height where it meets the plane x = 0, `dir` = direction
 * of the reflected ray (pointing away from the mirror, to the left), `via` = the
 * point (F or C) the incident ray is aimed at (null for ray 4).
 * A ray that is undefined for this d is null.
 */
export function principalRays(d, h, F) {
  const s = F > 0 ? 1 : -1;
  const focus = [-F, 0];
  const centre = [-2 * F, 0];

  // 1: parallel to the axis → reflected through F (convex: as if from F)
  const r1 = { y: h, dir: [-Math.abs(F), -s * h], via: focus };

  // 2: through F → reflected parallel to the axis (undefined when d = F)
  const r2 = Math.abs(d - F) < EPS ? null : { y: (-h * F) / (d - F), dir: [-1, 0], via: focus };

  // 3: through C → reflected back on itself (undefined when d = 2F: the ray is vertical)
  let r3 = null;
  if (Math.abs(d - 2 * F) >= EPS) {
    const y = (2 * F * h) / (2 * F - d);
    r3 = { y, dir: [-d, h - y], via: centre };
  }

  // 4: to the pole → reflected symmetrically about the axis
  const r4 = { y: 0, dir: [-d, -h], via: null };

  return { r1, r2, r3, r4 };
}

/**
 * Plane mirror at x = 0 (vertical). Object point P = (px, py), px < 0, and eye
 * E = (ex, ey), ex < 0. The image of P is P' = (−px, py). The reflection point
 * lies where the line P'E crosses the mirror plane.
 */
export function planeReflection(px, py, ex, ey) {
  const a = -px;                           // distance object → mirror
  const t = a / (a - ex);                  // a − ex = a + |ex|
  const yr = py + (ey - py) * t;
  // Angles from the normal (the horizontal): incidence on the side of P, reflection on the side of E.
  const alpha = Math.atan2(Math.abs(yr - py), a);
  const beta = Math.atan2(Math.abs(ey - yr), -ex);
  return { yr, alpha, beta, image: [a, py] };
}
