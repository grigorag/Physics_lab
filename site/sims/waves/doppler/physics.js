// Doppler effect: DOM-free physics.
//
// Model: a source moves along +x at constant speed v_s and emits a wavefront
// once per period T = 1/f0. A front is a circle centred where the source WAS
// at emission; its radius grows at the speed of sound c. The observer moves
// along x at v_o. A front "arrives" when the observer is on its circle; the
// frequency is measured from the arrival times of two consecutive fronts.
//
// Units: metres, seconds, hertz (the emitted frequency is a slowed-down
// display frequency, so that the fronts can be seen).

export const C_SOUND = 340;      // m/s
const DT = 1 / 240;              // fixed sub-step, s
const PRE = 12;                  // s of history simulated before a restart

/**
 * Ratio f / f0 for an observer that sees the source in direction n
 * (nx = x-component of the unit vector FROM the emission point TO the observer).
 *   u_s = v_s·nx   – source velocity component towards the observer
 *   u_o = −v_o·nx  – observer velocity component towards the source
 *   f/f0 = (c + u_o) / (c − u_s)
 */
export function dopplerRatio(vs, vo, nx, c = C_SOUND) {
  return (c - vo * nx) / (c - vs * nx);
}

/** Mach angle (degrees) of the shock cone, or null for v_s <= c. */
export function machAngleDeg(M) {
  return M > 1 ? (Math.asin(1 / M) * 180) / Math.PI : null;
}

/**
 * Retarded times τ > 0 (ascending): how long ago the fronts that reach the
 * observer NOW were emitted. dx, dy = observer − source (now), v = source speed.
 * Solves |(dx + vτ, dy)| = cτ.
 */
export function retardedTimes(dx, dy, v, c = C_SOUND) {
  const r2 = dx * dx + dy * dy;
  if (r2 < 1e-9) return [0];
  const a = c * c - v * v;
  if (Math.abs(a) < 1e-6 * c * c) {            // v = c: linear equation
    const den = -2 * dx * v;
    const tau = r2 / den;
    return tau > 0 ? [tau] : [];
  }
  const disc = dx * dx * v * v + a * r2;
  if (disc < 0) return [];
  const s = Math.sqrt(disc);
  return [(dx * v + s) / a, (dx * v - s) / a].filter((t) => t > 1e-12).sort((p, q) => p - q);
}

/**
 * Formula frequency for the current geometry.
 * Returns [] if no front reaches the observer, else entries
 * { tau, nx, us, uo, ratio } – one for a subsonic source, up to two for a
 * supersonic one (the "normal" branch first).
 */
export function formulaAt(dx, dy, vs, vo, c = C_SOUND) {
  return retardedTimes(dx, dy, vs, c).map((tau) => {
    const nx = tau < 1e-9 ? (dx >= 0 ? 1 : -1) : (dx + vs * tau) / (c * tau);
    return { tau, nx, us: vs * nx, uo: -vo * nx, ratio: dopplerRatio(vs, vo, nx, c) };
  });
}

export function createWorld({ width = 1800 } = {}) {
  const w = {
    c: C_SOUND,
    width,
    height: 900,
    vs: 0.5 * C_SOUND,
    vo: 0,
    f0: 1,
    lineY: 450,        // y of the source's line of motion
    obsDy: 0,          // observer's offset from that line
    xs0: 0.08 * width, // source position at the start of a run
    xoUser: 0.62 * width, // where the user put the observer
    xoBase: 0.62 * width, // observer position at tc = 0
    tc: 0,             // run time (negative while the history is being built)
    clock: 0,          // total running time (for the chart)
    offset: 0,         // clock − tc
    fronts: [],
    nextN: 0,
    nextEmit: 0,
    measured: null,    // latest measured frequency (Hz; ±Infinity possible) or null
    measuredT: -1e9,   // clock time of that measurement
    lastArrival: -1e9, // clock time of the last arrival (for the flash)
    onMeasure: null,   // ({ t, f }) after every measurement
    onBreak: null,     // () when the measurement series is interrupted
  };

  const xsAt = (t) => w.xs0 + w.vs * t;
  const xoAt = (t) => w.xoBase + w.vo * t;
  Object.defineProperties(w, {
    xs: { get: () => xsAt(w.tc) },
    xo: { get: () => xoAt(w.tc) },
    yo: { get: () => w.lineY + w.obsDy },
    ys: { get: () => w.lineY },
  });

  const distTo = (f, t) => Math.hypot(xoAt(t) - f.x, w.yo - f.y);

  function emit(te) {
    const f = { n: w.nextN++, t0: te, x: xsAt(te), y: w.lineY, lastT: te, lastD: 0, done: false, tArr: null };
    f.lastD = distTo(f, te);
    if (f.lastD <= 0) { f.done = true; f.tArr = te; }
    w.fronts.push(f);
  }

  function arrive(f, i) {
    w.lastArrival = w.offset + f.tArr;
    const pairs = [w.fronts[i - 1], w.fronts[i + 1]];
    for (const [k, g] of pairs.entries()) {
      if (!g || g.tArr === null || Math.abs(g.n - f.n) !== 1) continue;
      // interval between consecutive emissions, in order of emission
      const dt = k === 0 ? f.tArr - g.tArr : g.tArr - f.tArr;
      const fm = Math.abs(dt) < 2e-4 ? Infinity : 1 / dt;
      w.measured = fm;
      w.measuredT = w.offset + f.tArr;
      if (w.tc >= 0 || f.tArr >= 0) w.onMeasure?.({ t: w.offset + f.tArr, f: fm });
    }
  }

  function sub(h) {
    const t1 = w.tc + h;
    while (w.nextEmit <= t1 + 1e-12) {
      emit(w.nextEmit);
      w.nextEmit += 1 / w.f0;
    }
    const Rkeep = 3 * Math.hypot(w.width, w.height);
    for (let i = 0; i < w.fronts.length; i++) {
      const f = w.fronts[i];
      if (f.done) continue;
      const d1 = distTo(f, t1) - w.c * (t1 - f.t0);
      if (f.lastD > 0 && d1 <= 0) {
        f.tArr = f.lastT + ((t1 - f.lastT) * f.lastD) / (f.lastD - d1);
        f.done = true;
        arrive(f, i);
      }
      f.lastT = t1;
      f.lastD = d1;
    }
    w.fronts = w.fronts.filter((f) => w.c * (t1 - f.t0) < Rkeep);
    w.tc = t1;
  }

  /** Begin a new run: source at its start, history of fronts already in place. */
  w.reset = ({ chartBreak = true } = {}) => {
    w.fronts = [];
    w.nextN = 0;
    w.measured = null;
    w.measuredT = -1e9;
    w.lastArrival = -1e9;
    w.xoBase = w.xoUser;
    w.tc = -PRE;
    w.nextEmit = -PRE;
    w.offset = w.clock;             // tc = 0 is "now" on the chart clock
    for (let t = -PRE; t < 0 - 1e-9;) {
      const h = Math.min(DT, -t);
      sub(h);
      t = w.tc;
    }
    w.tc = 0;
    if (chartBreak) w.onBreak?.();
  };

  /** Put the observer at x (m) and dy (m from the line) – "teleport", fronts stay. */
  w.placeObserver = (x, dy) => {
    w.xoUser = x;
    w.xoBase = x - w.vo * w.tc;
    w.obsDy = dy;
    w.relocate();
  };

  /** Recompute where every unarrived front stands relative to the observer. */
  w.relocate = () => {
    for (const f of w.fronts) {
      f.lastT = w.tc;
      f.lastD = distTo(f, w.tc) - w.c * (w.tc - f.t0);
      f.done = f.lastD <= 0;        // already passed: arrival time unknown
      f.tArr = null;
    }
    w.measured = null;
    w.onBreak?.();
  };

  w.setHeight = (h) => {
    const newLine = h / 2;
    const dy = newLine - w.lineY;
    w.height = h;
    w.lineY = newLine;
    for (const f of w.fronts) f.y += dy;
  };

  w.setFrequency = (f0) => {
    const last = w.nextEmit - 1 / w.f0;
    w.f0 = f0;
    w.nextEmit = Math.max(last + 1 / f0, w.tc);
  };

  w.step = (dt) => {
    const n = Math.max(1, Math.ceil(dt / DT));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      sub(h);
      w.clock += h;
    }
    if (w.xs > w.width * 1.04) {
      w.reset();
    } else if (w.xo < -0.04 * w.width || w.xo > 1.04 * w.width) {
      w.xoBase = w.xoUser - w.vo * w.tc;     // observer returns to where it was placed
      w.relocate();
    }
  };

  /** Instantaneous formula values for the current geometry. */
  w.live = () => formulaAt(w.xo - w.xs, w.yo - w.ys, w.vs, w.vo, w.c);

  return w;
}
