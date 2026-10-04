// Einstein's train — relativity of simultaneity. DOM-free.
//
// Units: metres and microseconds, so c = 300 m/µs (3·10⁸ m/s, rounded).
// Two inertial frames:
//   S  (platform): origin at the platform observer;
//   S′ (train):    origin at the train observer, moving at v = βc along +x.
// The clocks are zeroed when the two observers pass each other
// (x = x′ = 0 at t = t′ = 0).
//
// Everything is derived from ONE table of events written in the platform
// frame; the train-frame picture is its Lorentz transform.

export const C = 300;        // speed of light, m/µs
export const L0 = 600;       // proper length of the train, m
export const UNIT = 100;     // proper length of one carriage / one platform slab, m

export const gamma = (beta) => 1 / Math.sqrt(1 - beta * beta);

/** Lorentz transformation S → S′ of an event {x, t}. */
export function lorentz({ x, t }, beta) {
  const g = gamma(beta);
  return { x: g * (x - beta * C * t), t: g * (t - (beta * x) / C) };
}

/** The event table in the platform frame S. */
export function platformEvents(beta) {
  const L = L0 / gamma(beta);        // contracted train = distance between the strikes
  const v = beta * C;
  const tB = L / (2 * (C + v));      // train observer runs towards the front flash
  const tA = L / (2 * (C - v));      // … and away from the rear one
  const tP = L / (2 * C);            // platform observer is midway between the marks
  return [
    { id: 'strikeA', x: -L / 2, t: 0 },
    { id: 'strikeB', x: L / 2, t: 0 },
    { id: 'trainB', x: v * tB, t: tB },
    { id: 'trainA', x: v * tA, t: tA },
    { id: 'platA', x: 0, t: tP },
    { id: 'platB', x: 0, t: tP },
  ];
}

/**
 * Everything needed to draw one frame of reference.
 * @param {number} beta   v/c of the train relative to the platform
 * @param {'platform'|'train'} frame
 */
export function scenario(beta, frame) {
  const g = gamma(beta);
  const inTrain = frame === 'train';
  const list = platformEvents(beta).map((e) => ({ id: e.id, ...(inTrain ? lorentz(e, beta) : { x: e.x, t: e.t }) }));
  const ev = Object.fromEntries(list.map((e) => [e.id, e]));
  const events = list.map((e, i) => ({ ...e, i })).sort((a, b) => (a.t - b.t) || (a.i - b.i));

  const L = L0 / g;
  const sc = {
    beta, gamma: g, frame, ev, events,
    vTrain: inTrain ? 0 : beta * C,          // velocity of the train observer
    vPlat: inTrain ? -beta * C : 0,          // velocity of the platform observer
    trainHalf: (inTrain ? L0 : L) / 2,       // half-length of the train in this frame
    platHalf: (inTrain ? L / g : L) / 2,     // half-distance between the platform marks
    carLen: inTrain ? UNIT : UNIT / g,
    slabLen: inTrain ? UNIT / g : UNIT,
  };
  sc.trainLen = 2 * sc.trainHalf;
  sc.markSep = 2 * sc.platHalf;
  sc.strikeGap = ev.strikeA.t - ev.strikeB.t;   // 0 in S, βL₀/c in S′

  // Time window: a little before the first event … a little after the last.
  sc.t0 = events[0].t - 0.5;
  sc.t1 = events[events.length - 1].t + 0.4;

  // Space window: both bodies stay in view during the whole time window.
  let xmin = Infinity, xmax = -Infinity;
  for (const t of [sc.t0, sc.t1]) {
    xmin = Math.min(xmin, sc.vTrain * t - sc.trainHalf, sc.vPlat * t - sc.platHalf);
    xmax = Math.max(xmax, sc.vTrain * t + sc.trainHalf, sc.vPlat * t + sc.platHalf);
  }
  const pad = (xmax - xmin) * 0.07;
  sc.xmin = xmin - pad;
  sc.xmax = xmax + pad;
  return sc;
}

/** Positions of the two fronts of a flash at time t (null before the strike). */
export function fronts(strike, t) {
  if (t < strike.t) return null;
  const r = C * (t - strike.t);
  return { r, left: strike.x - r, right: strike.x + r };
}
