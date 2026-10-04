// Charged particle in a uniform magnetic field — Lorentz force, helical motion.
//
// World coordinates: B points along +Y (vertical up). The particle circles in
// the XZ plane with the Larmor radius R = m·v⊥ / (|q|·B) at the cyclotron
// frequency ω = |q|·B / m, and drifts along Y with v∥ (drawn scaled by 0.18).
// All quantities are in arbitrary (conventional) units.

import { fluidCanvas, onDrag } from '../../../assets/js/core/canvas.js';
import { startLoop } from '../../../assets/js/core/loop.js';
import { bindRange, bindSegmented, bindPlayPause, onClick } from '../../../assets/js/core/controls.js';
import { setText } from '../../../assets/js/core/dom.js';
import { clear, line, arrow, circle, text } from '../../../assets/js/core/draw.js';
import { COLORS } from '../../../assets/js/core/theme.js';
import { clamp, TAU } from '../../../assets/js/core/math.js';
import { project } from './projection.js';

const C = {
  axisX: 'rgba(240,113,74,0.75)',
  axisY: 'rgba(46,203,161,0.9)',
  axisZ: 'rgba(55,138,221,0.75)',
  bLine: 'rgba(46,203,161,0.28)',
  bHead: 'rgba(46,203,161,0.38)',
  velocity: COLORS.coral,
  force: COLORS.amber,
  positive: COLORS.purple,
  positiveRim: '#b0aaff',
  negative: COLORS.coral,
  negativeRim: '#ffaa88',
  drop: 'rgba(124,111,247,0.18)',
  caption: 'rgba(46,203,161,0.6)',
};

const SPEED = 1.32;          // time units per second (= 0.022 per frame at 60 fps)
const TRAIL_DT = 0.022;      // time spacing between trail samples
const T_WRAP = 14 * Math.PI; // the motion restarts after this time
const DRIFT = 0.18;          // visual scale of the drift along B

// ---------- State ----------
let t = 0;
let paused = false;
let q = 1;
const cam = { rotX: -0.55, rotY: 0.52, cx: 0, cy: 0, scale: 1 };
let zoom = 1.0;

// ---------- Canvas ----------
const view = fluidCanvas(document.getElementById('cv'), {
  height: (w) => Math.max(340, Math.round(w * 0.62)),
});
const { ctx } = view;
const P = (x, y, z) => project(cam, x, y, z);

// ---------- Controls ----------
function restart() {
  t = 0;
  updateStats();
}

const BCtl = bindRange('Bfield', { format: (v) => v.toFixed(1), onInput: restart });
const mCtl = bindRange('massSlider', { format: (v) => String(v), onInput: restart });
const vpCtl = bindRange('vPerp', { format: (v) => v.toFixed(1), onInput: restart });
const vzCtl = bindRange('vPar', { format: (v) => v.toFixed(1), onInput: restart });
const trailCtl = bindRange('trailLen', { format: (v) => String(v), onInput: restart });

bindSegmented('charge', {
  onChange: (v) => { q = parseFloat(v); restart(); },
});

bindPlayPause('playBtn', {
  paused,
  label: (p) => (p ? '▶ Սկսել' : '⏸ Դադար'),
  onChange: (p) => { paused = p; },
});

onClick('resetBtn', () => { t = 0; });

function updateStats() {
  const B = BCtl.value;
  const m = mCtl.value;
  const vp = vpCtl.value;
  const vz = vzCtl.value;
  const aq = Math.abs(q);
  const r = (m * vp) / (aq * B);
  const omega = (aq * B) / m;
  const T = (TAU * m) / (aq * B);
  const pitch = vz * T;
  setText('rLarmor', r.toFixed(3) + ' պայմ l.');
  setText('omegaC', omega.toFixed(3) + ' ռադ/վ');
  setText('periodC', T.toFixed(3) + ' վ');
  setText('pitchC', pitch.toFixed(3) + ' պայմ l.');
}

// ---------- Camera: drag to rotate, wheel to zoom ----------
onDrag(view, {
  move: (p, d) => {
    cam.rotY += d.x * 0.007;
    cam.rotX = clamp(cam.rotX + d.y * 0.007, -1.5, 0.2);
  },
});

view.canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoom = clamp(zoom * (e.deltaY < 0 ? 1.08 : 0.93), 0.4, 3);
}, { passive: false });

// ---------- Drawing helpers ----------
/** Arrow between two projected points with an optional label at the tip. */
function arrow3d(p1, p2, color, width, label) {
  arrow(ctx, p1.sx, p1.sy, p2.sx, p2.sy, { color, width, head: Math.max(6, 10 * p2.s), spread: 0.42 });
  if (label) {
    text(ctx, label, p2.sx + 5, p2.sy - 4, { color, size: 11, family: 'mono', baseline: 'alphabetic' });
  }
}

/** Filled arrowhead at p2 pointing away from p1. */
function arrowHead(p1, p2, size, color) {
  const a = Math.atan2(p2.sy - p1.sy, p2.sx - p1.sx);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(p2.sx, p2.sy);
  ctx.lineTo(p2.sx - size * Math.cos(a - 0.42), p2.sy - size * Math.sin(a - 0.42));
  ctx.lineTo(p2.sx - size * Math.cos(a + 0.42), p2.sy - size * Math.sin(a + 0.42));
  ctx.closePath();
  ctx.fill();
}

function drawScene() {
  // Floor grid in the XZ plane (Y = 0)
  const n = 4;
  for (let i = -n; i <= n; i++) {
    const a1 = P(i, 0, -n), a2 = P(i, 0, n);
    const b1 = P(-n, 0, i), b2 = P(n, 0, i);
    line(ctx, a1.sx, a1.sy, a2.sx, a2.sy, { color: COLORS.grid, width: 0.5 });
    line(ctx, b1.sx, b1.sy, b2.sx, b2.sy, { color: COLORS.grid, width: 0.5 });
  }

  // B field arrows along +Y
  const Bpos = [[-2, 0, -2], [-2, 0, 0], [-2, 0, 2], [0, 0, -2], [0, 0, 2], [2, 0, -2], [2, 0, 0], [2, 0, 2]];
  for (const [bx, by, bz] of Bpos) {
    const p1 = P(bx, by, bz);
    const p2 = P(bx, by + 1.1, bz);
    line(ctx, p1.sx, p1.sy, p2.sx, p2.sy, { color: C.bLine, width: 0.8 });
    arrowHead(p1, p2, 5 * p2.s, C.bHead);
  }

  // Coordinate axes
  const L = 3.2;
  const o = P(0, 0, 0);
  arrow3d(o, P(L, 0, 0), C.axisX, 1.5, 'X');
  arrow3d(o, P(0, L, 0), C.axisY, 1.5, 'Y (B↑)');
  arrow3d(o, P(0, 0, L), C.axisZ, 1.5, 'Z');
}

// ---------- Frame ----------
function frame(dt) {
  const { width: W, height: H } = view;
  if (!W) return;
  cam.cx = W * 0.5;
  cam.cy = H * 0.52;
  cam.scale = Math.min(W, H) * 0.12 * zoom;

  const B = BCtl.value;
  const m = mCtl.value;
  const vp = vpCtl.value;
  const vz = vzCtl.value;
  const maxTrail = trailCtl.value;

  const omega = (Math.abs(q) * B) / m;
  const R = (m * vp) / (Math.abs(q) * B);
  const sign = q > 0 ? 1 : -1;
  const pos = (ti) => [R * Math.cos(sign * omega * ti), vz * ti * DRIFT, R * Math.sin(sign * omega * ti)];

  clear(ctx, W, H, COLORS.canvasBg);
  drawScene();

  // Advance time
  if (!paused) t += dt * SPEED;
  const tCur = t % T_WRAP;

  // Trail: circle in XZ + drift along Y, sampled every TRAIL_DT back from now
  const trailCount = Math.min(Math.floor(tCur / TRAIL_DT), maxTrail);
  const trail = [];
  for (let i = 0; i <= trailCount; i++) {
    const ti = tCur - (trailCount - i) * TRAIL_DT;
    if (ti >= 0) trail.push(P(...pos(ti)));
  }
  for (let i = 1; i < trail.length; i++) {
    const a = i / trail.length;
    const color = `rgba(${Math.round(124 + a * 40)},${Math.round(111 + a * 20)},${Math.round(247 - a * 30)},${(0.15 + a * 0.75).toFixed(2)})`;
    line(ctx, trail[i - 1].sx, trail[i - 1].sy, trail[i].sx, trail[i].sy, { color, width: 1.2 + a * 1.8, cap: 'round' });
  }

  // Particle
  const [px, py, pz] = pos(tCur);
  const pp = P(px, py, pz);

  // Velocity vector
  const vx = -sign * R * omega * Math.sin(sign * omega * tCur);
  const vy = vz * DRIFT;
  const vzc = sign * R * omega * Math.cos(sign * omega * tCur);
  const vMag = Math.hypot(vx, vy, vzc) || 1;
  const vs = 0.65 / vMag;
  arrow3d(pp, P(px + vx * vs, py + vy * vs, pz + vzc * vs), C.velocity, 2, 'v');

  // Lorentz force F = q (v × B), B = (0, B, 0)  →  v × B = (−vz·B, 0, vx·B)
  const Fx = q * (-vzc * B);
  const Fz = q * (vx * B);
  const FMag = Math.hypot(Fx, Fz);
  if (FMag > 0.001) {
    const fs = 0.55 / FMag;
    arrow3d(pp, P(px + Fx * fs, py, pz + Fz * fs), C.force, 2, 'F');
  }

  // Particle sphere with its charge sign
  const pr = Math.max(7, 11 * pp.s);
  circle(ctx, pp.sx, pp.sy, pr, {
    fill: q > 0 ? C.positive : C.negative,
    stroke: q > 0 ? C.positiveRim : C.negativeRim,
    width: 1.5,
  });
  text(ctx, q > 0 ? '+' : '−', pp.sx, pp.sy + 0.5, {
    color: '#fff', size: Math.round(pr * 1.1), family: 'mono', align: 'center', baseline: 'middle',
  });

  // Drop line to the floor
  const gnd = P(px, 0, pz);
  line(ctx, pp.sx, pp.sy, gnd.sx, gnd.sy, { color: C.drop, width: 0.8, dash: [3, 4], cap: 'round' });

  // Top-right caption
  text(ctx, 'B ↑ ուղղաձիգ՝ վեր', W - 12, 18, {
    color: C.caption, size: 11, weight: 400, family: 'mono', align: 'right', baseline: 'alphabetic',
  });
}

updateStats();
startLoop(frame);
