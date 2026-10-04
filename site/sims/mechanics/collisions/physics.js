// DOM-free physics of the collisions lab.
//
// 1D: two carts on a frictionless track, event-driven. Within one animation
//     step the exact time of every contact (cart–cart or cart–wall) is solved
//     analytically, the bodies are advanced to it, the collision is resolved
//     and the rest of the step continues. Carts therefore never overlap.
// 2D: two smooth discs; the impulse acts along the line of centres. Motion
//     before and after the contact is rectilinear, so positions are explicit
//     functions of time.

// ---------------------------------------------------------------- 1D

export const TRACK = { L: 14, x1: 4.5, x2: 9.5 };

/** Cart length on the track grows with the mass. */
export const cartWidth = (m) => 0.8 + 0.18 * m;

export const kinetic = (m, v) => 0.5 * m * v * v;

export function createCarts({ m1, m2, v1, v2, e, walls }) {
  return {
    m1, m2, v1, v2, e, walls,
    w1: cartWidth(m1), w2: cartWidth(m2),
    x1: TRACK.x1, x2: TRACK.x2,
    stuck: false,        // perfectly inelastic: the carts travel together
    t: 0,
    Q: 0,                // heat released so far
    hits: 0,             // number of cart–cart collisions
  };
}

/** Time until the next contact, and what kind. */
function nextEvent(s) {
  let best = { dt: Infinity, type: null };
  const eps = 1e-12;
  if (!s.stuck && s.v1 - s.v2 > eps) {
    const gap = (s.x2 - s.w2 / 2) - (s.x1 + s.w1 / 2);
    best = { dt: Math.max(gap, 0) / (s.v1 - s.v2), type: 'carts' };
  }
  if (s.walls) {
    if (s.v1 < -eps) {
      const dt = Math.max(s.x1 - s.w1 / 2, 0) / -s.v1;
      if (dt < best.dt) best = { dt, type: 'left' };
    }
    if (s.v2 > eps) {
      const dt = Math.max(TRACK.L - (s.x2 + s.w2 / 2), 0) / s.v2;
      if (dt < best.dt) best = { dt, type: 'right' };
    }
  }
  return best;
}

function move(s, dt) {
  if (dt <= 0) return;
  s.x1 += s.v1 * dt;
  s.x2 += s.v2 * dt;
  if (s.stuck) s.x2 = s.x1 + (s.w1 + s.w2) / 2;
  s.t += dt;
}

/** Resolves a contact in place and returns a description of it. */
function resolve(s, type) {
  const { m1, m2, e } = s;
  const before = { v1: s.v1, v2: s.v2 };
  if (type === 'carts') {
    const M = m1 + m2;
    const P = m1 * s.v1 + m2 * s.v2;
    const u = s.v1 - s.v2;
    s.v1 = (P - m2 * e * u) / M;
    s.v2 = (P + m1 * e * u) / M;
    s.hits++;
    if (e === 0) {
      s.v2 = s.v1;
      s.stuck = true;
    }
    const dQ = Math.max(0, kinetic(m1, before.v1) + kinetic(m2, before.v2)
      - kinetic(m1, s.v1) - kinetic(m2, s.v2));
    s.Q += dQ;
    return {
      type, t: s.t, before, after: { v1: s.v1, v2: s.v2 }, dQ,
      x: s.x1 + s.w1 / 2,                       // contact point
    };
  }
  // Elastic wall: the cart touching it reverses its velocity (a stuck pair moves as one body).
  if (type === 'left') {
    s.v1 = -s.v1;
    if (s.stuck) s.v2 = s.v1;
  } else {
    s.v2 = -s.v2;
    if (s.stuck) s.v1 = s.v2;
  }
  return { type, t: s.t, before, after: { v1: s.v1, v2: s.v2 }, dQ: 0, x: type === 'left' ? 0 : TRACK.L };
}

/** Advances the state by dt seconds; returns the contacts that happened. */
export function advance(s, dt) {
  const events = [];
  let rem = dt;
  for (let n = 0; n < 60 && rem > 0; n++) {
    const ev = nextEvent(s);
    if (ev.dt > rem) break;
    move(s, ev.dt);
    rem -= ev.dt;
    events.push(resolve(s, ev.type));
  }
  move(s, rem);
  return events;
}

/** The first cart–cart collision of the run, found on a copy of the state. */
export function predictCollision(s0) {
  const s = { ...s0 };
  for (let n = 0; n < 60; n++) {
    const ev = nextEvent(s);
    if (!Number.isFinite(ev.dt)) return null;
    move(s, ev.dt);
    const r = resolve(s, ev.type);
    if (r.type === 'carts') return r;
  }
  return null;
}

/** True when nothing more can happen and every moving cart has left the track. */
export function isFinished(s) {
  if (Number.isFinite(nextEvent(s).dt)) return false;
  const out = (x, w, v) => v === 0 || x + w / 2 < -1 || x - w / 2 > TRACK.L + 1;
  return out(s.x1, s.w1, s.v1) && out(s.x2, s.w2, s.v2);
}

export const centreOfMass = (s) => (s.m1 * s.x1 + s.m2 * s.x2) / (s.m1 + s.m2);

// ---------------------------------------------------------------- 2D

export const ARENA = { x0: -5, x1: 7, start: -4.3 };

/** Disc radius grows with the mass. */
export const puckRadius = (m) => 0.28 + 0.05 * m;

/**
 * Disc 1 starts at (start, b) with velocity (v, 0); disc 2 sits at the origin at rest.
 * Returns the whole analytic solution of the experiment.
 */
export function solvePlane({ m1, m2, v, b, e }) {
  const r1 = puckRadius(m1);
  const r2 = puckRadius(m2);
  const d = r1 + r2;
  const res = { r1, r2, d, m1, m2, v, b, e, hit: b < d - 1e-9 };
  const P1 = { x: m1 * v, y: 0 };
  res.p0 = P1;
  res.ke0 = kinetic(m1, v);
  if (!res.hit) {
    Object.assign(res, {
      tc: Infinity, c1: null, n: null,
      v1: { x: v, y: 0 }, v2: { x: 0, y: 0 },
    });
  } else {
    const nx = Math.sqrt(d * d - b * b) / d;      // unit normal, from disc 1 to disc 2
    const ny = -b / d;
    const xc = -Math.sqrt(d * d - b * b);         // x of disc 1 at the moment of contact
    const mu = (m1 * m2) / (m1 + m2);
    const J = (1 + e) * mu * v * nx;              // impulse along the normal
    res.n = { x: nx, y: ny };
    res.c1 = { x: xc, y: b };
    res.tc = (xc - ARENA.start) / v;
    res.v1 = { x: v - (J / m1) * nx, y: -(J / m1) * ny };
    res.v2 = { x: (J / m2) * nx, y: (J / m2) * ny };
  }
  const { v1, v2 } = res;
  res.p1 = { x: m1 * v1.x, y: m1 * v1.y };
  res.p2 = { x: m2 * v2.x, y: m2 * v2.y };
  res.ke1 = kinetic(m1, Math.hypot(v1.x, v1.y));
  res.ke2 = kinetic(m2, Math.hypot(v2.x, v2.y));
  res.Q = Math.max(0, res.ke0 - res.ke1 - res.ke2);
  const s1 = Math.hypot(v1.x, v1.y);
  const s2 = Math.hypot(v2.x, v2.y);
  const tiny = 1e-9;
  // Angles are measured from the direction of the initial velocity (+x).
  res.th1 = s1 > tiny ? Math.atan2(v1.y, v1.x) : null;
  res.th2 = s2 > tiny ? Math.atan2(v2.y, v2.x) : null;
  res.phi = s1 > tiny && s2 > tiny
    ? Math.acos(Math.max(-1, Math.min(1, (v1.x * v2.x + v1.y * v2.y) / (s1 * s2))))
    : null;

  // Time after the contact until both discs are out of the arena (capped).
  const exitTime = (c, vel, r) => {
    const sp = Math.hypot(vel.x, vel.y);
    if (sp < 1e-6) return Infinity;
    let t = Infinity;
    const lim = (pos, vc, lo, hi) => (vc > 0 ? (hi - pos) / vc : vc < 0 ? (lo - pos) / vc : Infinity);
    t = Math.min(lim(c.x, vel.x, ARENA.x0 - r, ARENA.x1 + r), lim(c.y, vel.y, -5 - r, 5 + r));
    return t;
  };
  if (res.hit) {
    const after = Math.max(exitTime(res.c1, v1, r1), exitTime({ x: 0, y: 0 }, v2, r2));
    res.tEnd = res.tc + Math.min(3.2, Number.isFinite(after) ? after : 3.2);
  } else {
    res.tEnd = (ARENA.x1 + r1 - ARENA.start) / v;
  }
  return res;
}

/** Disc centres at time t (t = 0 is the launch). */
export function planePositions(r, t) {
  if (!r.hit || t < r.tc) {
    return {
      p1: { x: ARENA.start + r.v * t, y: r.b },
      p2: { x: 0, y: 0 },
      v1: { x: r.v, y: 0 },
      v2: { x: 0, y: 0 },
      after: false,
    };
  }
  const dt = t - r.tc;
  return {
    p1: { x: r.c1.x + r.v1.x * dt, y: r.c1.y + r.v1.y * dt },
    p2: { x: r.v2.x * dt, y: r.v2.y * dt },
    v1: r.v1,
    v2: r.v2,
    after: true,
  };
}
