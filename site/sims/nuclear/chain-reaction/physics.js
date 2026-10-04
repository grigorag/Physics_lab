// Chain-reaction physics — DOM-free.
//
// A 2D Monte-Carlo model in arbitrary length units (պ. մ.):
//   • neutrons fly in straight lines with a constant speed;
//   • a neutron that comes closer than `rc` to a ²³⁵U nucleus splits it:
//     two fragments + 2 or 3 new neutrons (2.43 on average) in random directions;
//   • ²³⁸U nuclei and absorber rectangles (control rods) swallow neutrons;
//   • a neutron that leaves the fuel region is lost.
// Motion is integrated with fixed sub-steps and swept (segment-vs-circle)
// collision tests, so the result does not depend on the frame rate.

export const MEV_PER_FISSION = 200;          // average energy of one fission, MeV
export const MEV_TO_J = 1.602e-13;           // 1 MeV in joules
export const NU_MEAN = 2.43;                 // average number of neutrons per fission
const P_THREE = NU_MEAN - 2;                 // probability of 3 neutrons (otherwise 2)

export const STEP = 1 / 120;                 // s, fixed sub-step
const TAU = Math.PI * 2;

/* ------------------------------------------------------------------ */
/* Single fission: channels and energy from the mass defect             */
/* ------------------------------------------------------------------ */

export const U_TO_MEV = 931.5;               // 1 a.m.u. · c² in MeV
export const M_N = 1.008665;                 // neutron mass, a.m.u.
export const M_U235 = 235.043930;            // atomic masses, a.m.u.

export const CHANNELS = {
  BaKr: {
    heavy: { sym: 'Ba', A: 141, Z: 56, m: 140.914411 },
    light: { sym: 'Kr', A: 92, Z: 36, m: 91.926156 },
    neutrons: 3,
  },
  XeSr: {
    heavy: { sym: 'Xe', A: 140, Z: 54, m: 139.921641 },
    light: { sym: 'Sr', A: 94, Z: 38, m: 93.915361 },
    neutrons: 2,
  },
};

/** Mass defect (a.m.u.) and kinetic energy released at once (MeV) for
 *  ²³⁵U + n → heavy + light + k·n. */
export function channelEnergy(ch) {
  const dm = M_U235 + M_N - ch.heavy.m - ch.light.m - ch.neutrons * M_N;
  return { dm, Q: dm * U_TO_MEV };
}

/* ------------------------------------------------------------------ */
/* Fuel layouts                                                         */
/* ------------------------------------------------------------------ */

/** Random points inside a region with a minimum mutual distance (dart throwing). */
function scatter(count, sample, minDist, existing = []) {
  const pts = [];
  const all = existing.slice();
  const d2 = minDist * minDist;
  let tries = 0;
  while (pts.length < count && tries < count * 300) {
    tries++;
    const p = sample();
    let ok = true;
    for (let i = 0; i < all.length; i++) {
      const dx = all[i].x - p.x, dy = all[i].y - p.y;
      if (dx * dx + dy * dy < d2) { ok = false; break; }
    }
    if (ok) { pts.push(p); all.push(p); }
  }
  return pts;
}

/** Marks exactly round(fraction·N) random nuclei as ²³⁵U, the rest as ²³⁸U. */
function assignIsotopes(pts, fraction) {
  const n235 = Math.round(pts.length * fraction);
  const order = pts.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const type = new Array(pts.length).fill(238);
  for (let i = 0; i < n235; i++) type[order[i]] = 235;
  return pts.map((p, i) => ({ x: p.x, y: p.y, type: type[i], alive: true, back: 0 }));
}

/** Round lump of radius R with `density` nuclei per unit area. */
export function buildLump({ R, density, enrichment, rc }) {
  const count = Math.round(density * Math.PI * R * R);
  const rIn = R - rc;
  const pts = scatter(count, () => {
    const r = rIn * Math.sqrt(Math.random());
    const a = Math.random() * TAU;
    return { x: r * Math.cos(a), y: r * Math.sin(a) };
  }, 2.2 * rc);
  return {
    nuclei: assignIsotopes(pts, enrichment),
    inside: (x, y) => x * x + y * y <= R * R,
  };
}

/**
 * Reactor core: `strips` vertical fuel assemblies separated by moderator
 * gaps; a control rod can slide into every gap from above (y axis points up).
 */
export function buildReactor({ strips = 6, stripW = 0.24, gap = 0.2, H = 1.6, rodW = 0.06,
  density, enrichment, rc }) {
  const W = strips * stripW + (strips - 1) * gap;
  const x0 = -W / 2;
  const fuel = [];
  for (let i = 0; i < strips; i++) {
    const a = x0 + i * (stripW + gap);
    fuel.push({ x0: a, x1: a + stripW });
  }
  const perStrip = Math.round(density * stripW * H);
  const pts = [];
  for (const s of fuel) {
    pts.push(...scatter(perStrip, () => ({
      x: s.x0 + rc + Math.random() * (stripW - 2 * rc),
      y: -H / 2 + rc + Math.random() * (H - 2 * rc),
    }), 2.2 * rc));
  }
  const rodX = [];
  for (let i = 0; i < strips - 1; i++) rodX.push(fuel[i].x1 + gap / 2);
  const edge = W / 2 + gap / 2;           // a moderator margin around the core
  return {
    W, H, gap, strips: fuel, rodX, rodW, edge,
    nuclei: assignIsotopes(pts, enrichment),
    inside: (x, y) => Math.abs(x) <= edge && Math.abs(y) <= H / 2,
    /** Absorbing rectangles for an insertion depth 0…1. */
    rods: (depth) => (depth <= 0 ? [] : rodX.map((x) => ({
      x0: x - rodW / 2, x1: x + rodW / 2, y0: H / 2 - depth * H, y1: H / 2 + 1,
    }))),
  };
}

/* ------------------------------------------------------------------ */
/* The world                                                            */
/* ------------------------------------------------------------------ */

/**
 * @param {object} o
 * @param {number} o.rc        capture radius of a nucleus
 * @param {number} o.speed     neutron speed, units/s
 * @param {number} [o.refuel]  mean time after which a split ²³⁵U nucleus is replaced (0 = never)
 * @param {number} [o.kTau]    memory time of the k average, s (0 = whole run, fresh fuel only)
 * @param {number} [o.rateTau] smoothing time of the fission rate, s
 * @param {number} [o.fragmentLife] how long fragments stay visible, s
 */
export function createWorld({ rc, speed, refuel = 0, kTau = 0, rateTau = 1, fragmentLife = Infinity }) {
  const w = {
    rc, speed,
    nuclei: [], neutrons: [], fragments: [], flashes: [], absorbers: [],
    inside: () => true,
    t: 0,
    fired: 0, fissions: 0, escaped: 0, captured: 0, absorbed: 0,
    gens: [],                 // gens[g] = number of fissions in generation g (g ≥ 1)
    maxGen: 0,
    rate: 0,                  // smoothed fissions per second
    fuel0: 0,                 // initial number of ²³⁵U nuclei
    fuel: 0,                  // intact ²³⁵U nuclei now
    kParents: 0, kChildren: 0,
    setFuel, fire, step,
    /** Measured multiplication factor: fissions caused by the neutrons of one fission. */
    get k() { return w.kParents > 0.5 ? w.kChildren / w.kParents : NaN; },
    get energyMeV() { return w.fissions * MEV_PER_FISSION; },
  };
  let acc = 0;
  let grid = null;

  /* Uniform grid over the nuclei (they never move). */
  function buildGrid() {
    const cell = 0.05;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of w.nuclei) {
      x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y);
      x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y);
    }
    if (!w.nuclei.length) { grid = null; return; }
    const nx = Math.floor((x1 - x0) / cell) + 1;
    const ny = Math.floor((y1 - y0) / cell) + 1;
    const cells = Array.from({ length: nx * ny }, () => []);
    for (const q of w.nuclei) {
      cells[Math.floor((q.y - y0) / cell) * nx + Math.floor((q.x - x0) / cell)].push(q);
    }
    grid = { x0, y0, cell, nx, ny, cells };
  }

  function setFuel({ nuclei, inside }) {
    w.nuclei = nuclei;
    w.inside = inside;
    w.neutrons = []; w.fragments = []; w.flashes = [];
    w.t = 0; acc = 0;
    w.fired = w.fissions = w.escaped = w.captured = w.absorbed = 0;
    w.gens = []; w.maxGen = 0; w.rate = 0;
    w.kParents = w.kChildren = 0;
    w.fuel0 = w.fuel = nuclei.reduce((s, n) => s + (n.type === 235 ? 1 : 0), 0);
    buildGrid();
  }

  function addNeutron(x, y, angle, gen, parent) {
    w.neutrons.push({ x, y, vx: speed * Math.cos(angle), vy: speed * Math.sin(angle), gen, parent });
  }

  /** A free (source) neutron; the direction is random unless given. */
  function fire(x, y, angle = Math.random() * TAU) {
    w.fired++;
    addNeutron(x, y, angle, 0, null);
  }

  /** A neutron is gone: once all neutrons of a fission are gone, it enters the k average. */
  function finish(n) {
    const p = n.parent;
    if (!p) return;
    if (--p.pending === 0 && p.counted) {
      w.kParents += 1;
      w.kChildren += p.children;
    }
  }

  function fission(nuc, n) {
    nuc.alive = false;
    w.fuel--;
    if (refuel > 0) nuc.back = w.t + refuel * (0.5 + Math.random());
    w.fissions++;
    const gen = n.gen + 1;
    w.gens[gen] = (w.gens[gen] || 0) + 1;
    if (gen > w.maxGen) w.maxGen = gen;
    if (n.parent) n.parent.children++;

    const count = Math.random() < P_THREE ? 3 : 2;
    // In a lump the fuel burns out; count only fissions that happened in fresh fuel.
    const rec = { pending: count, children: 0, counted: kTau > 0 || w.fuel + 1 >= 0.85 * w.fuel0 };
    for (let i = 0; i < count; i++) addNeutron(nuc.x, nuc.y, Math.random() * TAU, gen, rec);

    const a = Math.random() * TAU;
    const fv = 0.25;
    w.fragments.push(
      { x: nuc.x, y: nuc.y, vx: fv * Math.cos(a), vy: fv * Math.sin(a), age: 0, big: true },
      { x: nuc.x, y: nuc.y, vx: -1.5 * fv * Math.cos(a), vy: -1.5 * fv * Math.sin(a), age: 0, big: false },
    );
    w.flashes.push({ x: nuc.x, y: nuc.y, age: 0 });
  }

  /** Earliest fraction (0…1) of the step at which the neutron touches a live nucleus. */
  function firstNucleus(n, dx, dy, stepLen) {
    if (!grid) return null;
    const { x0, y0, cell, nx, ny, cells } = grid;
    const rc2 = rc * rc;
    const cx = Math.floor((n.x + dx / 2 - x0) / cell);
    const cy = Math.floor((n.y + dy / 2 - y0) / cell);
    let best = null, tBest = 2;
    for (let j = cy - 1; j <= cy + 1; j++) {
      if (j < 0 || j >= ny) continue;
      for (let i = cx - 1; i <= cx + 1; i++) {
        if (i < 0 || i >= nx) continue;
        const list = cells[j * nx + i];
        for (let m = 0; m < list.length; m++) {
          const q = list[m];
          if (!q.alive) continue;
          const ex = q.x - n.x, ey = q.y - n.y;
          let tp = (ex * dx + ey * dy) / (stepLen * stepLen);
          tp = tp < 0 ? 0 : tp > 1 ? 1 : tp;
          const px = ex - dx * tp, py = ey - dy * tp;
          const d2 = px * px + py * py;
          if (d2 >= rc2) continue;
          const te = Math.max(0, tp - Math.sqrt(rc2 - d2) / stepLen);
          if (te < tBest) { tBest = te; best = q; }
        }
      }
    }
    return best ? { q: best, t: tBest } : null;
  }

  /** Earliest entry fraction into an absorber rectangle (slab method), or 2. */
  function firstAbsorber(n, dx, dy) {
    let tBest = 2;
    for (const r of w.absorbers) {
      let t0 = 0, t1 = 1;
      if (dx !== 0) {
        const a = (r.x0 - n.x) / dx, b = (r.x1 - n.x) / dx;
        t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b));
      } else if (n.x < r.x0 || n.x > r.x1) continue;
      if (dy !== 0) {
        const a = (r.y0 - n.y) / dy, b = (r.y1 - n.y) / dy;
        t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b));
      } else if (n.y < r.y0 || n.y > r.y1) continue;
      if (t0 <= t1 && t0 < tBest) tBest = t0;
    }
    return tBest;
  }

  function substep(h) {
    w.t += h;
    const stepLen = speed * h;
    const before = w.fissions;
    const list = w.neutrons;
    const len0 = list.length;
    const next = [];

    for (let i = 0; i < len0; i++) {
      const n = list[i];
      const dx = n.vx * h, dy = n.vy * h;
      const hit = firstNucleus(n, dx, dy, stepLen);
      const tRod = w.absorbers.length ? firstAbsorber(n, dx, dy) : 2;

      if (tRod <= 1 && (!hit || tRod < hit.t)) { w.absorbed++; finish(n); continue; }
      if (hit) {
        if (hit.q.type === 235) fission(hit.q, n); else w.captured++;
        finish(n);
        continue;
      }
      n.x += dx; n.y += dy;
      if (!w.inside(n.x, n.y)) { w.escaped++; finish(n); continue; }
      next.push(n);
    }
    // fission() appended the newborn neutrons after the first len0 entries;
    // they start moving in the next sub-step.
    for (let i = len0; i < list.length; i++) next.push(list[i]);
    w.neutrons = next;

    if (refuel > 0) {
      for (const q of w.nuclei) {
        if (!q.alive && q.type === 235 && w.t >= q.back) { q.alive = true; w.fuel++; }
      }
    }
    if (kTau > 0) {
      const f = Math.exp(-h / kTau);
      w.kParents *= f; w.kChildren *= f;
    }
    w.rate += ((w.fissions - before) / h - w.rate) * (h / rateTau);

    for (const f of w.fragments) {
      const damp = Math.exp(-f.age / 0.12);
      f.x += f.vx * damp * h; f.y += f.vy * damp * h;
      f.age += h;
    }
    for (const f of w.flashes) f.age += h;
    if (w.flashes.length && w.flashes[0].age > 0.4) w.flashes = w.flashes.filter((f) => f.age <= 0.4);
    if (w.fragments.length && w.fragments[0].age > fragmentLife) {
      w.fragments = w.fragments.filter((f) => f.age <= fragmentLife);
    }
  }

  /** Advances the world by dt seconds of simulation time (fixed sub-steps). */
  function step(dt) {
    acc += dt;
    let guard = 0;
    while (acc >= STEP && guard++ < 30) {
      substep(STEP);
      acc -= STEP;
    }
    if (acc >= STEP) acc = 0;              // far too slow: drop the backlog
  }

  return w;
}
