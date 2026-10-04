// Planetary motion and Kepler's laws.
//
// World coordinates are astronomical units with the Sun at the origin, x to
// the right and y up. The view (px per ա.մ. and the centre) eases towards a
// box that fits the predicted orbit and the kept ones. Motion comes from the
// analytic Kepler solution in physics.js; the animation only advances t in
// small sub-steps (≤ 0.025 rad of true anomaly each) to draw the trail and to
// detect perihelion passages for the measured period.

import { fluidCanvas, onDrag } from '../../../assets/js/core/canvas.js';
import { startLoop } from '../../../assets/js/core/loop.js';
import {
  bindRange, bindCheckbox, bindSegmented, bindPlayPause, onClick,
} from '../../../assets/js/core/controls.js';
import { byId, $$, setText } from '../../../assets/js/core/dom.js';
import { clear, line, arrow, circle, text } from '../../../assets/js/core/draw.js';
import {
  COLORS, themed, alpha, font, onThemeChange, fontsReady,
} from '../../../assets/js/core/theme.js';
import { clamp } from '../../../assets/js/core/math.js';
import {
  makeOrbit, energyOf, PLANETS, KMS_PER_AUYR, SQRT2, PARABOLA_SNAP, TAU,
} from './physics.js';

const C = themed((light) => ({
  sun: COLORS.amber,
  sunCore: light ? '#f2b636' : '#ffd36b',
  sunGlow: alpha(COLORS.amber, light ? 0.22 : 0.3),
  planet: COLORS.blue,
  planetRim: light ? '#0e3f73' : '#cfe6ff',
  trail: COLORS.blue,
  orbit: alpha(COLORS.text3, 0.9),
  v: COLORS.coral,
  f: COLORS.teal,
  sectorA: alpha(COLORS.purple, light ? 0.17 : 0.24),
  sectorB: alpha(COLORS.purple, light ? 0.07 : 0.1),
  sectorCur: alpha(COLORS.purple, light ? 0.3 : 0.38),
  sectorEdge: alpha(COLORS.purple, 0.45),
  sectorText: light ? '#3d2fb0' : '#c4bdff',
  semiA: COLORS.pink,
  semiB: COLORS.green,
  guide: light ? 'rgba(30,42,90,0.3)' : 'rgba(170,180,215,0.3)',
  ghosts: [COLORS.green, COLORS.pink, COLORS.red, COLORS.purple],
}));

const PRESETS = {
  // Launched at perihelion: r₀ = a(1 − e), v₀ = √(1 + e)·v_շ.
  earth: { r0: 1, k: 1, beta: 0, M: 1 },
  mars: { r0: 1.381, k: 1.0457, beta: 0, M: 1 },           // a = 1.524, e = 0.093
  mercury: { r0: 0.3074, k: 1.0980, beta: 0, M: 1 },       // a = 0.387, e = 0.206
  halley: { r0: 0.587, k: 1.4025, beta: 0, M: 1 },         // a = 17.8, e = 0.967
};
const MAX_GHOSTS = 4;
const SECTORS = 12;

// ---------- State ----------
const P = { ...PRESETS.earth };
let orbit = null;
let cur = null;               // current state (from orbit.state(t))
let t = 0;                    // years since launch
let paused = false;
let speedMul = 1;
let escaped = false;
let trail = [];               // {x, y, t}
let passages = [];            // perihelion passage times
let E0 = 0, drift = 0;        // initial energy and the largest |ΔE| seen
let sectors = [];             // equal-time sectors: { t1, t2, area, pts, span }
let sectorDt = 0;
let ghosts = [];              // { orbit, color }
let ghostCount = 0;
let vScale = 1, gScale = 1;   // px per (ա.մ./տարի), px per (ա.մ./տարի²)
let chartDirty = true;
const show = { elements: true, areas: false, vel: true, force: true, trail: true };

const rView = (o) => 3 * o.r0;          // unbound: drawn part of the branch
const rStop = (o) => 10 * o.r0;         // unbound: stop the animation here

/** Years of simulated time per real second at ×1. */
function baseRate(o) {
  if (o.bound) return o.T / 8;
  return Math.abs(o.timeFromNu(o.nuLimit(rView(o)))) / 4;
}

function rebuild() {
  orbit = makeOrbit(P);
  const o = orbit;

  // Equal-time sectors, anchored at a perihelion passage.
  const tp = o.firstPerihelion;
  sectors = [];
  if (o.bound) {
    sectorDt = o.T / SECTORS;
    for (let i = 0; i < SECTORS; i++) {
      sectors.push(sector(tp + i * sectorDt, tp + (i + 1) * sectorDt, i));
    }
  } else {
    sectorDt = Math.abs(o.timeFromNu(o.nuLimit(rView(o)))) / 4;
    for (let i = -4; i < 4; i++) sectors.push(sector(tp + i * sectorDt, tp + (i + 1) * sectorDt, i));
  }
  if (!dragMode) scalesFor(o);
  restart();
  chartDirty = true;
  updateStatic();
}

function sector(t1, t2, i) {
  const { area, pts } = orbit.sweptArea(t1, t2, orbit.e > 0.8 ? 400 : 160);
  return { t1, t2, area, pts, i };
}

function scalesFor(o) {
  const small = view.width < 520;
  vScale = Math.min((small ? 46 : 60) / o.vc, (small ? 105 : 140) / o.vq);
  gScale = (small ? 60 : 80) / (o.mu / (o.q * o.q));
}

function restart() {
  t = 0;
  escaped = false;
  cur = orbit.state(0);
  trail = [{ x: cur.x, y: cur.y, t: 0 }];
  passages = orbit.bound && Math.abs(cur.nu) < 1e-9 ? [0] : [];
  E0 = energyOf(orbit, cur);
  drift = 0;
}

/** Perihelion passage time in (ta, tb), where ν changes sign from − to +. */
function refinePassage(ta, tb) {
  for (let i = 0; i < 50; i++) {
    const tm = (ta + tb) / 2;
    if (orbit.nuAt(orbit.tau0 + tm) < 0) ta = tm; else tb = tm;
  }
  return (ta + tb) / 2;
}

function advance(dtSim) {
  const o = orbit;
  let remaining = dtSim;
  let prev = cur;
  for (let guard = 0; remaining > 0 && guard < 5000; guard++) {
    const step = Math.min(remaining, (0.025 * prev.r * prev.r) / Math.abs(o.h));
    const next = o.state(t + step);
    if (o.bound && prev.nu < 0 && next.nu >= 0 && next.nu < 1) {
      const tp = refinePassage(t, t + step);
      if (!passages.length || tp - passages[passages.length - 1] > 0.5 * o.T) passages.push(tp);
    }
    t += step;
    remaining -= step;
    prev = next;
    trail.push({ x: next.x, y: next.y, t });
    const dE = Math.abs(energyOf(o, next) - E0);
    if (dE > drift) drift = dE;
    if (!o.bound && next.r > rStop(o)) { escaped = true; break; }
  }
  cur = prev;
  if (passages.length > 3) passages.splice(0, passages.length - 3);
  if (o.bound) {
    const keep = t - 0.92 * o.T;
    let cut = 0;
    while (cut < trail.length - 2 && trail[cut].t < keep) cut++;
    if (cut) trail.splice(0, cut);
  } else if (trail.length > 6000) trail.splice(0, trail.length - 6000);
}

// ---------- Canvas & view ----------
const view = fluidCanvas(byId('cv'), {
  height: (w) => Math.round(clamp(w * 0.62, 320, 600)),
  onResize: () => { scalesFor(orbit); vw.S = 0; },
});
const { ctx } = view;
const legend = document.querySelector('.canvas-wrap .legend');
const vw = { S: 0, cx: 0, cy: 0 };         // px per ա.մ., world point at the canvas centre
const X = (x) => view.width / 2 + (x - vw.cx) * vw.S;
const Y = (y) => view.height / 2 - (y - vw.cy) * vw.S;
const toWorld = (p) => ({ x: (p.x - view.width / 2) / vw.S + vw.cx, y: -(p.y - view.height / 2) / vw.S + vw.cy });

function orbitPath(o, n = 240) {
  return o.path(rView(o), n);
}

function fitTarget() {
  const { width: W, height: H } = view;
  let x0 = 0, x1 = 0, y0 = 0, y1 = 0;
  const add = (p) => {
    if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
  };
  orbitPath(orbit, 120).forEach(add);
  add({ x: orbit.r0, y: 0 });
  if (!orbit.bound) trail.forEach((p, i) => { if (i % 8 === 0 || i === trail.length - 1) add(p); });
  ghosts.forEach((g) => orbitPath(g.orbit, 120).forEach(add));
  const pad = W < 520 ? 30 : 46;
  // room for the perihelion / aphelion labels beyond the vertices
  let ex = 0, ey = 0;
  if (show.elements && orbit.type !== 'circle') {
    ex = (W < 520 ? 34 : 90) * Math.abs(Math.cos(orbit.omega));
    ey = 26 * Math.abs(Math.sin(orbit.omega));
  }
  const S = Math.min((W - 2 * pad - 2 * ex) / Math.max(x1 - x0, 1e-3), (H - 2 * pad - 2 * ey) / Math.max(y1 - y0, 1e-3));
  let cx = (x0 + x1) / 2;
  // keep the content clear of the legend (top left) when there is room to the right
  if (legend.offsetParent && getComputedStyle(legend).position === 'absolute') {
    const left = (W - (x1 - x0) * S) / 2 - ex;
    const need = legend.offsetLeft + legend.offsetWidth + 10;
    const top = (H - (y1 - y0) * S) / 2;
    if (left < need && top < legend.offsetTop + legend.offsetHeight + 6) {
      cx -= Math.max(0, Math.min(need - left, left - pad)) / S;
    }
  }
  return { S, cx, cy: (y0 + y1) / 2 };
}

function easeView(dt) {
  if (dragMode && vw.S) return;
  const tg = fitTarget();
  if (!vw.S) { Object.assign(vw, tg); return; }
  const k = 1 - Math.exp(-dt * 5);
  // ease the scale in log space so huge zooms (Halley) feel even
  vw.S = Math.exp(Math.log(vw.S) + (Math.log(tg.S) - Math.log(vw.S)) * k);
  vw.cx += (tg.cx - vw.cx) * k;
  vw.cy += (tg.cy - vw.cy) * k;
}

// ---------- Drawing ----------
function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

function polyline(pts, { color, width = 2, dash = null, close = false }) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))));
  if (close) ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function fan(pts, fill) {
  ctx.beginPath();
  ctx.moveTo(X(0), Y(0));
  pts.forEach((p) => ctx.lineTo(X(p.x), Y(p.y)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Text clamped into the canvas; align 'left' | 'right' | 'center'. */
function label(str, x, y, { color = COLORS.text2, size = 11, align = 'left', family = 'mono', weight = 500 } = {}) {
  ctx.save();
  ctx.font = font(size, { family, weight });
  const w = ctx.measureText(str).width;
  ctx.restore();
  let left = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
  left = clamp(left, 4, view.width - w - 4);
  text(ctx, str, left, clamp(y, 9, view.height - 9), { color, size, family, weight });
}

function drawGrid() {
  const { width: W, height: H } = view;
  const step = niceStep((W < 520 ? 55 : 80) / vw.S);
  ctx.save();
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const wx0 = toWorld({ x: 0, y: 0 }).x, wx1 = toWorld({ x: W, y: 0 }).x;
  const wy1 = toWorld({ x: 0, y: 0 }).y, wy0 = toWorld({ x: 0, y: H }).y;
  for (let gx = Math.ceil(wx0 / step) * step; gx <= wx1; gx += step) {
    const x = Math.round(X(gx)) + 0.5;
    ctx.moveTo(x, 0); ctx.lineTo(x, H);
  }
  for (let gy = Math.ceil(wy0 / step) * step; gy <= wy1; gy += step) {
    const y = Math.round(Y(gy)) + 0.5;
    ctx.moveTo(0, y); ctx.lineTo(W, y);
  }
  ctx.stroke();
  ctx.restore();

  // scale bar (bottom left)
  const len = step * vw.S;
  const x0 = 14, y0 = H - 14;
  line(ctx, x0, y0, x0 + len, y0, { color: COLORS.text3, width: 1.5 });
  line(ctx, x0, y0 - 4, x0, y0 + 1, { color: COLORS.text3, width: 1.5 });
  line(ctx, x0 + len, y0 - 4, x0 + len, y0 + 1, { color: COLORS.text3, width: 1.5 });
  const digits = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  text(ctx, `${step.toFixed(digits)} ա.մ.`, x0 + len + 6, y0 - 1, { color: COLORS.text3, size: 10, family: 'mono' });
}

function drawSun() {
  const x = X(0), y = Y(0);
  const g = ctx.createRadialGradient(x, y, 3, x, y, 24);
  g.addColorStop(0, C.sunGlow);
  g.addColorStop(1, alpha(COLORS.amber, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, 24, 0, TAU);
  ctx.fill();
  const r = 6 + 2 * Math.sqrt(P.M);
  circle(ctx, x, y, r, { fill: C.sunCore, stroke: C.sun, width: 1.5 });
}

function drawSectors() {
  const o = orbit;
  sectors.forEach((s) => fan(s.pts, (s.i & 1) ? C.sectorB : C.sectorA));

  // part of the current interval already swept
  let ta = null;
  if (o.bound) ta = t - ((((t - sectors[0].t1) % sectorDt) + sectorDt) % sectorDt);
  else {
    const first = sectors[0].t1, last = sectors[sectors.length - 1].t2;
    if (t > first && t < last) ta = first + Math.floor((t - first) / sectorDt) * sectorDt;
  }
  if (ta !== null && t - ta > 1e-9) {
    const part = o.sweptArea(ta, t, 120);
    fan(part.pts, C.sectorCur);
  }

  // boundaries and area labels
  ctx.save();
  ctx.strokeStyle = C.sectorEdge;
  ctx.lineWidth = 1;
  ctx.beginPath();
  sectors.forEach((s) => {
    const p = s.pts[0];
    ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(p.x), Y(p.y));
  });
  const lastPt = sectors[sectors.length - 1].pts.at(-1);
  ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(lastPt.x), Y(lastPt.y));
  ctx.stroke();
  ctx.restore();

  for (const s of sectors) {
    const m = s.pts[Math.floor(s.pts.length / 2)];
    const a0 = Math.atan2(s.pts[0].y, s.pts[0].x);
    const a1 = Math.atan2(s.pts.at(-1).y, s.pts.at(-1).x);
    let span = Math.abs(a1 - a0);
    if (span > Math.PI) span = TAU - span;
    const rr = Math.hypot(m.x, m.y) * vw.S * 0.62;
    if (rr < 28 || span * rr < 38) continue;
    text(ctx, fmtSig(s.area, 3), X(m.x * 0.62), Y(m.y * 0.62), {
      color: C.sectorText, size: 10, family: 'mono', align: 'center', weight: 600,
    });
  }
}

/** Two-line label (name + distance) placed outwards from a vertex; (dx, dy) — screen direction. */
function vertexLabel(name, r, x, y, dx, dy) {
  if (view.width < 520 && Math.abs(dx) > 0.3) dy = -1;   // narrow: above the vertex
  const align = dx > 0.3 ? 'left' : dx < -0.3 ? 'right' : 'center';
  const ax = x + dx * 12, ay = y + dy * 12;
  const y1 = dy > 0.3 ? ay + 6 : dy < -0.3 ? ay - 19 : ay - 7;
  label(name, ax, y1, { align, family: 'sans', size: 10, color: COLORS.text3 });
  label(`r = ${fmtAU(r)} ա.մ.`, ax, y1 + 13, { align, color: COLORS.text2 });
}

function drawElements() {
  const o = orbit;
  const ux = Math.cos(o.omega), uy = Math.sin(o.omega);   // towards perihelion
  const peri = { x: o.q * ux, y: o.q * uy };

  if (o.bound && o.type !== 'circle') {
    const c = { x: -o.a * o.e * ux, y: -o.a * o.e * uy };    // centre
    const aph = { x: -o.Q * ux, y: -o.Q * uy };
    const f2 = { x: 2 * c.x, y: 2 * c.y };
    const nx = -uy, ny = ux;                                // along the minor axis
    const co = { x: c.x + o.b * nx, y: c.y + o.b * ny };

    line(ctx, X(peri.x), Y(peri.y), X(aph.x), Y(aph.y), { color: C.guide, dash: [4, 4] });
    line(ctx, X(c.x), Y(c.y), X(c.x - o.b * nx), Y(c.y - o.b * ny), { color: C.guide, dash: [4, 4] });
    // a: centre → aphelion, b: centre → co-vertex
    line(ctx, X(c.x), Y(c.y), X(aph.x), Y(aph.y), { color: C.semiA, width: 2 });
    line(ctx, X(c.x), Y(c.y), X(co.x), Y(co.y), { color: C.semiB, width: 2 });
    const ma = { x: (c.x + aph.x) / 2, y: (c.y + aph.y) / 2 };
    if (o.a * vw.S > 40) {
      text(ctx, 'a', X(ma.x) - nx * 12, Y(ma.y) + ny * 12, { color: C.semiA, size: 13, family: 'mono', weight: 700, align: 'center' });
    }
    if (o.b * vw.S > 22) {
      const mb = { x: (c.x + co.x) / 2, y: (c.y + co.y) / 2 };
      text(ctx, 'b', X(mb.x) - ux * 10, Y(mb.y) + uy * 10, { color: C.semiB, size: 13, family: 'mono', weight: 700, align: 'center' });
    }
    circle(ctx, X(c.x), Y(c.y), 2.5, { fill: C.guide });

    // empty focus
    const fx = X(f2.x), fy = Y(f2.y);
    line(ctx, fx - 5, fy - 5, fx + 5, fy + 5, { color: COLORS.text2, width: 1.5 });
    line(ctx, fx - 5, fy + 5, fx + 5, fy - 5, { color: COLORS.text2, width: 1.5 });
    if (Math.hypot(f2.x, f2.y) * vw.S > 34 && o.q * vw.S > 40) {
      text(ctx, 'F₂', fx, fy - 13, { color: COLORS.text2, size: 11, family: 'mono', align: 'center' });
      text(ctx, 'F₁', X(0), Y(0) - 22, { color: COLORS.text2, size: 11, family: 'mono', align: 'center' });
    }

    // aphelion marker
    circle(ctx, X(aph.x), Y(aph.y), 3.5, { fill: COLORS.canvasBg, stroke: COLORS.text2, width: 1.5 });
    vertexLabel('աֆելիոն', o.Q, X(aph.x), Y(aph.y), -ux, uy);
  }

  // perihelion marker (also for unbound orbits)
  if (o.type !== 'circle') {
    circle(ctx, X(peri.x), Y(peri.y), 3.5, { fill: COLORS.canvasBg, stroke: COLORS.text2, width: 1.5 });
    vertexLabel('պերիհելիոն', o.q, X(peri.x), Y(peri.y), ux, -uy);
  } else {
    // circle: show the radius
    const ang = -0.75;
    const ex = o.a * Math.cos(ang), ey = o.a * Math.sin(ang);
    line(ctx, X(0), Y(0), X(ex), Y(ey), { color: C.semiA, width: 2 });
    text(ctx, `R = ${fmtAU(o.a)} ա.մ.`, X(ex / 2) + 8, Y(ey / 2) + 12, { color: C.semiA, size: 11, family: 'mono', weight: 600 });
  }
}

function drawTrail() {
  if (trail.length < 2) return;
  const n = trail.length;
  const chunks = orbit.bound ? 10 : 1;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = 2.5;
  for (let c = 0; c < chunks; c++) {
    const i0 = Math.floor((c * (n - 1)) / chunks), i1 = Math.floor(((c + 1) * (n - 1)) / chunks);
    if (i1 <= i0) continue;
    ctx.strokeStyle = alpha(C.trail, orbit.bound ? 0.12 + 0.88 * ((c + 1) / chunks) : 0.9);
    ctx.beginPath();
    for (let i = i0; i <= i1; i++) {
      const p = trail[i];
      if (i === i0) ctx.moveTo(X(p.x), Y(p.y)); else ctx.lineTo(X(p.x), Y(p.y));
    }
    ctx.stroke();
  }
  ctx.restore();
}

const launchPx = () => ({ x: X(P.r0), y: Y(0) });
function launchTip() {
  const o = orbit;
  const b = (o.beta * Math.PI) / 180;
  const L = o.v0 * vScale;
  const lp = launchPx();
  return { x: lp.x + L * Math.sin(b), y: lp.y - L * Math.cos(b) };
}

function drawLaunch() {
  const lp = launchPx();
  const tip = launchTip();
  const atStart = t === 0;
  const col = atStart ? C.v : alpha(C.v, 0.45);
  circle(ctx, lp.x, lp.y, 5, { stroke: alpha(COLORS.text2, 0.8), width: 1.5 });
  if (!atStart || !show.vel) arrow(ctx, lp.x, lp.y, tip.x, tip.y, { color: col, width: 1.8, head: 9 });
  circle(ctx, tip.x, tip.y, 5.5, { fill: alpha(C.v, 0.2), stroke: col, width: 1.5 });
  if (!atStart) text(ctx, 'v₀', tip.x + 8, tip.y - 6, { color: col, size: 11, family: 'mono', weight: 600 });
}

function drawPlanet() {
  const x = X(cur.x), y = Y(cur.y);
  if (show.force) {
    const g = orbit.mu / (cur.r * cur.r);
    const L = Math.min(g * gScale, cur.r * vw.S - 12);
    if (L > 4) {
      const ex = x - (cur.x / cur.r) * L, ey = y + (cur.y / cur.r) * L;
      arrow(ctx, x, y, ex, ey, { color: C.f, width: 2.2, head: 9 });
      if (L > 22) text(ctx, 'F', ex + (cur.y / cur.r) * 10, ey + (cur.x / cur.r) * 10, { color: C.f, size: 12, family: 'mono', weight: 700, align: 'center' });
    }
  }
  if (show.vel) {
    const ex = x + cur.vx * vScale, ey = y - cur.vy * vScale;
    arrow(ctx, x, y, ex, ey, { color: C.v, width: 2.5, head: 10 });
    const l = Math.hypot(ex - x, ey - y) || 1;
    text(ctx, 'v', ex + ((ex - x) / l) * 9, ey + ((ey - y) / l) * 9, { color: C.v, size: 12, family: 'mono', weight: 700, align: 'center' });
  }
  circle(ctx, x, y, 7, { fill: C.planet, stroke: C.planetRim, width: 1.5 });
}

function draw(dt) {
  const { width: W, height: H } = view;
  if (!W) return;
  easeView(dt);
  clear(ctx, W, H, COLORS.canvasBg);
  drawGrid();

  ghosts.forEach((g) => {
    polyline(orbitPath(g.orbit), { color: alpha(C.ghosts[g.color], 0.7), width: 1.5, dash: [6, 5], close: g.orbit.bound });
  });

  if (show.areas) drawSectors();
  polyline(orbitPath(orbit, 360), { color: C.orbit, width: 1.3, dash: [5, 5], close: orbit.bound });
  if (show.elements) drawElements();
  if (show.trail) drawTrail();
  drawSun();
  drawLaunch();
  drawPlanet();

  if (escaped) {
    label('Մարմինը հեռացավ անվերջություն․ սեղմեք «Վերագործարկել»', W / 2, H - 34, {
      align: 'center', family: 'sans', size: 12, color: COLORS.text, weight: 600,
    });
  }
}

// ---------- Kepler III chart ----------
const chart = fluidCanvas(byId('chart'), {
  height: (w) => Math.round(clamp(w * 0.42, 230, 320)),
  onResize: () => { chartDirty = true; },
});
const A_RANGE = [0.1, 50];
const T_RANGE = [0.02, 500];

function drawChart() {
  const { ctx: g, width: W, height: H } = chart;
  if (!W) return;
  const small = W < 520;
  const m = { l: small ? 40 : 50, r: 14, t: 26, b: 34 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const lx = (a) => m.l + ((Math.log10(a) - Math.log10(A_RANGE[0])) / Math.log10(A_RANGE[1] / A_RANGE[0])) * pw;
  const ly = (T) => m.t + ph - ((Math.log10(T) - Math.log10(T_RANGE[0])) / Math.log10(T_RANGE[1] / T_RANGE[0])) * ph;

  clear(g, W, H, COLORS.canvasBg);
  const lab = { color: COLORS.text3, size: 10, family: 'mono' };
  for (let d = -2; d <= 3; d++) {
    for (const f of [1, 2, 5]) {
      const v = f * 10 ** d;
      if (v >= A_RANGE[0] && v <= A_RANGE[1]) {
        const x = Math.round(lx(v)) + 0.5;
        line(g, x, m.t, x, m.t + ph, { color: f === 1 ? COLORS.grid : alpha(COLORS.text3, 0.06), width: 1 });
        if (f === 1) text(g, String(v), x, m.t + ph + 11, { ...lab, align: 'center' });
      }
      if (v >= T_RANGE[0] && v <= T_RANGE[1]) {
        const y = Math.round(ly(v)) + 0.5;
        line(g, m.l, y, m.l + pw, y, { color: f === 1 ? COLORS.grid : alpha(COLORS.text3, 0.06), width: 1 });
        if (f === 1) text(g, String(v), m.l - 6, y, { ...lab, align: 'right' });
      }
    }
  }
  line(g, m.l, m.t - 4, m.l, m.t + ph, { color: COLORS.axis, width: 1.2 });
  line(g, m.l, m.t + ph, m.l + pw + 4, m.t + ph, { color: COLORS.axis, width: 1.2 });
  text(g, 'T, տարի', m.l + 6, 12, { color: COLORS.text2, size: 11, family: 'mono' });
  text(g, 'a, ա.մ.', m.l + pw, H - 9, { color: COLORS.text2, size: 11, family: 'mono', align: 'right' });

  g.save();
  g.beginPath();
  g.rect(m.l, m.t, pw, ph);
  g.clip();
  const lawLine = (M, color, dash) => {
    g.save();
    g.strokeStyle = color;
    g.lineWidth = 1.5;
    if (dash) g.setLineDash(dash);
    g.beginPath();
    g.moveTo(lx(A_RANGE[0]), ly(Math.sqrt(A_RANGE[0] ** 3 / M)));
    g.lineTo(lx(A_RANGE[1]), ly(Math.sqrt(A_RANGE[1] ** 3 / M)));
    g.stroke();
    g.restore();
  };
  lawLine(1, alpha(COLORS.text3, 0.8));
  if (Math.abs(P.M - 1) > 1e-6) lawLine(P.M, alpha(COLORS.blue, 0.75), [5, 4]);
  g.restore();

  // line labels (where the line crosses a ≈ 0.15 … placed near the left)
  const aL = 22;
  text(g, 'T² = a³', lx(aL) - 8, ly(Math.sqrt(aL ** 3)) - 4, { color: COLORS.text3, size: 10, family: 'mono', align: 'right' });
  if (Math.abs(P.M - 1) > 1e-6) {
    const aR = 12;
    text(g, `T² = a³/${P.M.toFixed(2)}`, lx(aR) + 6, ly(Math.sqrt(aR ** 3 / P.M)) + (P.M > 1 ? 12 : -12), {
      color: COLORS.blue, size: 10, family: 'mono',
    });
  }

  // Solar-system planets (labels alternate above-left / below-right of the line)
  PLANETS.forEach(([name, a, T], i) => {
    const x = lx(a), y = ly(T);
    circle(g, x, y, 4, { fill: COLORS.text2, stroke: COLORS.canvasBg, width: 1.5 });
    const above = i % 2 === 0;
    text(g, name, above ? x - 6 : x + 6, above ? y - 9 : y + 10, {
      color: COLORS.text2, size: small ? 9 : 10, align: above ? 'right' : 'left',
    });
  });

  // kept orbits
  ghosts.forEach((gh) => {
    if (!gh.orbit.bound) return;
    circle(g, lx(clamp(gh.orbit.a, A_RANGE[0], A_RANGE[1])), ly(clamp(gh.orbit.T, T_RANGE[0], T_RANGE[1])), 5,
      { fill: C.ghosts[gh.color], stroke: COLORS.canvasBg, width: 1.5 });
  });

  // current orbit
  const o = orbit;
  if (o.bound) {
    const inside = o.a >= A_RANGE[0] && o.a <= A_RANGE[1] && o.T >= T_RANGE[0] && o.T <= T_RANGE[1];
    const x = lx(clamp(o.a, A_RANGE[0], A_RANGE[1])), y = ly(clamp(o.T, T_RANGE[0], T_RANGE[1]));
    line(g, x, y, x, m.t + ph, { color: alpha(COLORS.blue, 0.5), dash: [2, 3] });
    line(g, m.l, y, x, y, { color: alpha(COLORS.blue, 0.5), dash: [2, 3] });
    circle(g, x, y, 6.5, { fill: inside ? COLORS.blue : COLORS.canvasBg, stroke: COLORS.blue, width: 2 });
    const msg = inside
      ? `a = ${fmtAU(o.a)} ա.մ., T = ${fmtT(o.T)} տարի`
      : `a = ${fmtAU(o.a)} ա.մ.՝ գրաֆիկից դուրս`;
    circle(g, m.l + 14, m.t + 12, 5, { fill: COLORS.blue });
    text(g, msg, m.l + 24, m.t + 12, { color: COLORS.blue, size: small ? 10 : 11, family: 'mono', weight: 600 });
  } else {
    text(g, 'Ուղեծիրը փակ չէ․ պարբերություն չունի', m.l + pw - 4, m.t + 12, {
      color: COLORS.blue, size: 11, align: 'right', weight: 600,
    });
  }
}

// ---------- Formatting ----------
const fmtSig = (v, s = 4) => {
  if (!Number.isFinite(v)) return '∞';
  const d = Math.max(0, s - 1 - Math.floor(Math.log10(Math.abs(v) || 1)));
  return v.toFixed(Math.min(d, 4));
};
const fmtAU = (v) => (v < 10 ? v.toFixed(3) : v < 100 ? v.toFixed(2) : v.toFixed(1));
const fmtT = (v) => (v < 10 ? v.toFixed(3) : v < 100 ? v.toFixed(2) : v.toFixed(1));
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
function sci(v) {
  if (v === 0) return '0';
  const [mant, ex] = v.toExponential(1).split('e');
  return `${mant}·10${String(parseInt(ex, 10)).replace(/./g, (c) => SUP[c] ?? c)}`;
}
const kms = (v) => (v * KMS_PER_AUYR).toFixed(v * KMS_PER_AUYR < 100 ? 2 : 1);

const cache = {};
function put(id, html) {
  if (cache[id] === html) return;
  cache[id] = html;
  byId(id).innerHTML = html;
}

/** Stats that only change with the orbit. */
function updateStatic() {
  const o = orbit;
  put('sA', o.bound ? `${fmtAU(o.a)} ա.մ.` : o.parabolic ? '∞' : '— (հիպերբոլ)');
  put('sB', o.bound ? `${fmtAU(o.b)} ա.մ.` : '—');
  put('sE', o.parabolic ? '1 (պարաբոլ)' : o.e < 1e-6 ? '0.000' : o.e.toFixed(o.e < 0.01 ? 4 : 3));
  put('sT', o.bound ? `${fmtT(o.T)} տարի` : '∞ (չի վերադառնում)');
  put('sQ', `${fmtAU(o.q)} ա.մ.`);
  put('sVq', `${kms(o.vq)} կմ/վ`);
  put('sAp', o.bound ? `${fmtAU(o.Q)} ա.մ.` : '—');
  put('sVa', o.bound ? `${kms(o.vQ)} կմ/վ` : '—');
  const E = o.parabolic ? 0 : o.energy;
  put('sEn', `${o.parabolic ? '0' : fmtSig(E, 4)} (${E < 0 ? 'E < 0' : E > 0 ? 'E > 0' : 'E = 0'})`);
  put('sAreal', `${fmtSig(o.arealVelocity)} ա.մ.²/տարի`);

  const vII = SQRT2 * o.vc;
  put('kvHint', `v₀ = <b>${kms(o.v0)}</b> կմ/վ, v₁ = ${kms(o.vc)} կմ/վ, v₂ = √2·v₁ = ${kms(vII)} կմ/վ`);

  let msg;
  if (o.type === 'circle') {
    msg = `<b>Շրջանագիծ</b> (e = 0)։ v₀ = v₁, E &lt; 0՝ մոլորակը կապված է Արեգակին և շարժվում է հաստատուն արագությամբ։`;
  } else if (o.type === 'ellipse') {
    msg = '<b>Էլիպս</b>։ E &lt; 0՝ մոլորակը կապված է Արեգակին և պարբերաբար վերադառնում է։';
    if (P.beta === 0) msg += o.k < 1 ? ' Սկզբնական կետը աֆելիոնն է (v₀ &lt; v₁)։' : ' Սկզբնական կետը պերիհելիոնն է (v₀ &gt; v₁)։';
  } else if (o.type === 'parabola') {
    msg = '<b>Պարաբոլ</b>։ E = 0, v₀ = √2·v₁՝ երկրորդ տիեզերական արագությունը։ Մարմինը հեռանում է Արեգակից և այլևս չի վերադառնում։';
  } else {
    msg = `<b>Հիպերբոլ</b>։ E &gt; 0՝ մարմինը հաղթահարում է Արեգակի ձգողությունը և հեռանում է անվերջ։ Շատ հեռվում նրա արագությունը ձգտում է v<sub>∞</sub> = √(2E) = ${kms(o.vInf)} կմ/վ։`;
  }
  put('typeBox', msg);

  // equal areas
  const areas = sectors.map((s) => s.area);
  const lo = Math.min(...areas), hi = Math.max(...areas);
  const expected = o.arealVelocity * sectorDt;
  put('areaOut',
    `Δt = ${o.bound ? 'T/12 = ' : ''}<b>${fmtSig(sectorDt)}</b> տարի<br>` +
    `ΔS = (ΔS/Δt)·Δt = <b>${fmtSig(expected)}</b> ա.մ.²<br>` +
    `չափված՝ <b>${fmtSig(lo)}</b> … <b>${fmtSig(hi)}</b><br>` +
    `շեղում՝ <b>${(((hi - lo) / expected) * 100).toFixed(3)}</b> %`);
  speedOut();
}

/** Readouts that change every frame. */
function updateLive() {
  const o = orbit;
  const s = cur;
  const vPerp = Math.abs(s.x * s.vy - s.y * s.vx) / s.r;
  put('posOut',
    `t = <b>${fmtSig(t, 4)}</b> տարի<br>` +
    (o.bound ? `պտույտներ՝ <b>${(t / o.T).toFixed(2)}</b><br>` : '') +
    `r = <b>${fmtAU(s.r)}</b> ա.մ.<br>` +
    `F/F₀ = (r₀/r)² = <b>${fmtSig((o.r0 / s.r) ** 2, 3)}</b>`);
  put('velOut',
    `v = <b>${fmtSig(s.v)}</b> ա.մ./տարի<br>` +
    `v = <b>${kms(s.v)}</b> կմ/վ<br>` +
    `r·v<sub>⊥</sub>/2 = <b>${fmtSig((s.r * vPerp) / 2)}</b> ա.մ.²/տարի`);
  if (o.bound) {
    const n = passages.length;
    put('sTm', n >= 2 ? `${fmtT(passages[n - 1] - passages[n - 2])} տարի` : 'չափվում է…');
  } else put('sTm', '—');
  put('sDrift', o.parabolic || Math.abs(E0) < 1e-12 ? `|ΔE| = ${sci(drift)}` : sci(drift / Math.abs(E0)));
}

function speedOut() {
  const r = baseRate(orbit) * speedMul;
  setText('speedOut', `${fmtSig(r, 3)} տարի/վ`);
}

// ---------- Controls ----------
const fmtR0 = (v) => `${Math.abs(v * 100 - Math.round(v * 100)) < 1e-6 ? v.toFixed(2) : v.toFixed(3)} ա.մ.`;
const fmtK = (v) => (Math.abs(v - SQRT2) < PARABOLA_SNAP ? '√2 = 1.414' : v.toFixed(3));

function paramsChanged(fromPreset = false) {
  if (!fromPreset) presetCtl.set('custom', { silent: true });
  rebuild();
}

const r0Ctl = bindRange('r0', { format: fmtR0, onInput: (v) => { P.r0 = v; paramsChanged(); } });
const kCtl = bindRange('kv', { format: fmtK, onInput: (v) => { P.k = v; paramsChanged(); } });
const betaCtl = bindRange('beta', { format: (v) => `${v}°`, onInput: (v) => { P.beta = v; paramsChanged(); } });
const massCtl = bindRange('mass', { format: (v) => `${v.toFixed(2)} M☉`, onInput: (v) => { P.M = v; paramsChanged(); } });

const presetCtl = bindSegmented('preset', {
  onChange: (name) => {
    const p = PRESETS[name];
    if (!p) return;
    Object.assign(P, p);
    r0Ctl.set(P.r0, { silent: true });
    r0Ctl.show(fmtR0(P.r0));
    kCtl.set(P.k, { silent: true });
    kCtl.show(fmtK(P.k));
    betaCtl.set(P.beta, { silent: true });
    massCtl.set(P.M, { silent: true });
    paramsChanged(true);
    if (paused) playCtl.set(false);
    paused = false;
  },
});

bindCheckbox('elements', { onChange: (on) => { show.elements = on; } });
bindCheckbox('areas', {
  onChange: (on) => {
    show.areas = on;
    $$('.js-areas').forEach((el) => { el.hidden = !on; });
  },
});
bindCheckbox('vel', {
  onChange: (on) => { show.vel = on; $$('.js-vel').forEach((el) => { el.hidden = !on; }); },
});
bindCheckbox('force', {
  onChange: (on) => { show.force = on; $$('.js-force').forEach((el) => { el.hidden = !on; }); },
});
bindCheckbox('trail', { onChange: (on) => { show.trail = on; } });
bindSegmented('speed', { onChange: (v) => { speedMul = parseFloat(v); speedOut(); } });

const playCtl = bindPlayPause('playBtn', {
  onChange: (p) => {
    paused = p;
    if (!p && escaped) restart();
  },
});
onClick('resetBtn', () => { restart(); });

onClick('keepBtn', () => {
  const key = JSON.stringify(P);
  if (ghosts.some((g) => g.key === key)) return;
  ghosts.push({ key, orbit: makeOrbit(P), color: ghostCount++ % C.ghosts.length });
  if (ghosts.length > MAX_GHOSTS) ghosts.shift();
  chartDirty = true;
});
onClick('clearBtn', () => { ghosts = []; chartDirty = true; });

// ---------- Dragging the launch point and the initial velocity ----------
let dragMode = null;
onDrag(view, {
  start: (p, e) => {
    const reach = e.pointerType === 'touch' ? 24 : 14;
    const tip = launchTip(), lp = launchPx();
    if (Math.hypot(p.x - tip.x, p.y - tip.y) < reach) dragMode = 'vel';
    else if (Math.hypot(p.x - lp.x, p.y - lp.y) < reach) dragMode = 'r0';
    else return false;
    return undefined;
  },
  move: (p) => {
    if (dragMode === 'vel') {
      const lp = launchPx();
      const dx = p.x - lp.x, dy = lp.y - p.y;          // world-oriented, px
      const v = Math.hypot(dx, dy) / vScale;
      const k = clamp(Math.round((v / orbit.vc) * 1000) / 1000, 0.4, 1.5);
      const beta = clamp(Math.round((Math.atan2(dx, dy) * 180) / Math.PI), -60, 60);
      P.k = k; P.beta = beta;
      kCtl.set(k, { silent: true });
      kCtl.show(fmtK(k));
      betaCtl.set(beta, { silent: true });
    } else if (dragMode === 'r0') {
      const r0 = clamp(Math.round(toWorld(p).x * 100) / 100, 0.3, 3);
      P.r0 = r0;
      r0Ctl.set(r0, { silent: true });
    }
    paramsChanged();
  },
  end: () => {
    dragMode = null;
    scalesFor(orbit);
  },
});

// ---------- Start ----------
rebuild();
onThemeChange(() => { chartDirty = true; });
fontsReady().then(() => { chartDirty = true; });

startLoop((dt) => {
  if (!paused && !escaped && !dragMode) advance(dt * speedMul * baseRate(orbit));
  if (escaped && !paused) { paused = true; playCtl.set(true); }
  draw(dt);
  updateLive();
  if (chartDirty) { chartDirty = false; drawChart(); }
});

// Debug/test hook (used by automated checks; harmless otherwise).
window.__kepler = {
  get orbit() { return orbit; },
  get t() { return t; },
  get passages() { return passages; },
  get drift() { return drift; },
  get sectors() { return sectors; },
  advance: (years) => { advance(years); },
  tip: () => launchTip(),
  launch: () => launchPx(),
};
