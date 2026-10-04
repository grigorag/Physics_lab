// Coupled mass–spring chain driven from the left end.
//
// interior:  a_i = (k/m)(d_{i+1} + d_{i-1} − 2 d_i) − (c/m) v_i
// i = 0 is the driver (source); the last mass is either anchored to a fixed
// wall or left free. d and v are scalar displacements/velocities along the
// oscillation axis (vertical for transverse, horizontal for longitudinal).

export const N = 36;        // number of masses
export const m = 1;         // mass of each ball
const SUBSTEPS = 12;

export function createChain() {
  return { d: new Float64Array(N), v: new Float64Array(N), t: 0 };
}

export function resetChain(s) {
  s.d.fill(0);
  s.v.fill(0);
  s.t = 0;
}

/**
 * Advance the chain by dt seconds.
 * @param {{d:Float64Array, v:Float64Array, t:number}} s
 * @param {{amp:number, damp:number, freq:number, k:number}} P
 * @param {{drive:'continuous'|'pulse', rightWall:boolean}} opts
 */
export function step(s, P, { drive, rightWall }, dt) {
  const { d, v } = s;
  dt /= SUBSTEPS;
  const k = P.k, c = P.damp;
  const omega = 2 * Math.PI * P.freq;
  for (let n = 0; n < SUBSTEPS; n++) {
    s.t += dt;
    const t = s.t;
    // driver / source on mass 0
    if (drive === 'continuous') {
      d[0] = P.amp * Math.sin(omega * t);
      v[0] = P.amp * omega * Math.cos(omega * t);
    } else { // single pulse: one period then hold at rest
      const T = 1 / P.freq;
      d[0] = (t < T) ? P.amp * Math.sin(omega * t) : 0;
      v[0] = (t < T) ? P.amp * omega * Math.cos(omega * t) : 0;
    }
    // integrate masses 1 .. (last). Right boundary is either a fixed wall
    // (last mass clamped to 0) or a free end (last mass moves, no spring beyond it).
    const top = rightWall ? N - 1 : N;
    for (let i = 1; i < top; i++) {
      const right = (i < N - 1) ? d[i + 1] : d[i]; // free end: no right neighbour
      const a = (k / m) * (right + d[i - 1] - 2 * d[i]) - (c / m) * v[i];
      v[i] += a * dt;
    }
    for (let i = 1; i < top; i++) d[i] += v[i] * dt;
    if (rightWall) { d[N - 1] = 0; v[N - 1] = 0; }
  }
}

// ---- discrete-lattice cutoff frequency ----
// A chain of identical masses+springs has a MAX frequency it can carry:
//   omega_max = 2*sqrt(k/m)  ->  f_c = sqrt(k/m)/pi
// Above f_c the source drives an evanescent (exponentially decaying) disturbance
// that does NOT propagate — the "wave won't pass from ball to ball" effect.
export const cutoffFreq = (k) => Math.sqrt(k / m) / Math.PI;

// ---- standing-wave harmonics (fixed-fixed chain) ----
//   f_n = sqrt(k/m)/pi * sin( n*pi / (2*(N-1)) ),  n = 1 .. N-2
export const harmFreq = (n, k) => Math.sqrt(k / m) / Math.PI * Math.sin(n * Math.PI / (2 * (N - 1)));
