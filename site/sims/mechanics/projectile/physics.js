// Projectile motion: a body launched at an angle to the horizon.
//
// SI units throughout. A trajectory object describes one complete flight:
//   { T, L, H, tTop, xTop, at(t) → { x, y, vx, vy } }
// T – flight time, L – range, H – maximum height above the ground.
//
//   idealTrajectory  – no air resistance, closed-form solution;
//   dragTrajectory   – quadratic drag, a = g − k·|v|·v  (k = F/(m·v²), in 1/m),
//                      integrated once with RK4 at a fixed step and then
//                      sampled by time, so the animation is frame-rate independent.

import { DEG } from '../../../assets/js/core/math.js';

/** Fixed integration step for the drag solution, s. */
export const DT = 0.002;
const MAX_STEPS = 400000;

function launchVelocity({ v0, angle }) {
  return {
    vx0: angle >= 90 ? 0 : v0 * Math.cos(angle * DEG),
    vy0: v0 * Math.sin(angle * DEG),
  };
}

export function idealTrajectory(p) {
  const { h0, g } = p;
  const { vx0, vy0 } = launchVelocity(p);
  const T = (vy0 + Math.sqrt(vy0 * vy0 + 2 * g * h0)) / g;
  const tTop = vy0 / g;
  return {
    T,
    L: vx0 * T,
    H: h0 + (vy0 * vy0) / (2 * g),
    tTop,
    xTop: vx0 * tTop,
    at(t) {
      const tt = Math.min(Math.max(t, 0), T);
      return {
        x: vx0 * tt,
        y: tt >= T ? 0 : h0 + vy0 * tt - (g * tt * tt) / 2,
        vx: vx0,
        vy: vy0 - g * tt,
      };
    },
  };
}

export function dragTrajectory(p) {
  const { h0, g, k } = p;
  const { vx0, vy0 } = launchVelocity(p);

  // state s = [x, y, vx, vy]
  const deriv = (s) => {
    const v = Math.hypot(s[2], s[3]);
    return [s[2], s[3], -k * v * s[2], -g - k * v * s[3]];
  };
  const add = (s, d, h) => [s[0] + d[0] * h, s[1] + d[1] * h, s[2] + d[2] * h, s[3] + d[3] * h];
  const rk4 = (s) => {
    const k1 = deriv(s);
    const k2 = deriv(add(s, k1, DT / 2));
    const k3 = deriv(add(s, k2, DT / 2));
    const k4 = deriv(add(s, k3, DT));
    return s.map((v, i) => v + (DT / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
  };
  const mix = (a, b, f) => a.map((v, i) => v + (b[i] - v) * f);

  const samples = [[0, h0, vx0, vy0]];   // samples[i] is the state at t = i·DT (the last one at t = T)
  let s = samples[0];
  let T = 0;
  let top = { t: 0, x: 0, y: h0 };

  for (let i = 0; i < MAX_STEPS; i++) {
    const n = rk4(s);
    if (s[3] > 0 && n[3] <= 0) {                 // vy changes sign: highest point
      const f = s[3] / (s[3] - n[3]);
      const m = mix(s, n, f);
      top = { t: (i + f) * DT, x: m[0], y: Math.max(m[1], s[1], n[1]) };
    }
    if (n[1] <= 0) {                             // crossed the ground: interpolate the landing
      const f = s[1] > 0 ? s[1] / (s[1] - n[1]) : 0;
      const end = mix(s, n, f);
      end[1] = 0;
      T = (i + f) * DT;
      samples.push(end);
      break;
    }
    samples.push(n);
    s = n;
    T = (i + 1) * DT;
  }

  const last = samples.length - 1;
  return {
    T,
    L: samples[last][0],
    H: top.y,
    tTop: top.t,
    xTop: top.x,
    at(t) {
      if (t >= T || last === 0) {
        const e = samples[last];
        return { x: e[0], y: e[1], vx: e[2], vy: e[3] };
      }
      const tt = Math.max(t, 0);
      const i = Math.min(Math.floor(tt / DT), last - 1);
      const t1 = i + 1 === last ? T : (i + 1) * DT;
      const span = t1 - i * DT;
      const f = span > 0 ? Math.min((tt - i * DT) / span, 1) : 1;
      const m = mix(samples[i], samples[i + 1], f);
      return { x: m[0], y: m[1], vx: m[2], vy: m[3] };
    },
  };
}

/** n+1 points [x, y] of the trajectory, uniformly in time on [0, tEnd]. */
export function samplePath(traj, tEnd = traj.T, n = 160) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const s = traj.at((tEnd * i) / n);
    pts.push([s.x, s.y]);
  }
  return pts;
}
