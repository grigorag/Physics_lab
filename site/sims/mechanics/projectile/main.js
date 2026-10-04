// Projectile motion — a body launched at an angle to the horizon.
//
// World coordinates are metres: x to the right from the launch point, y up
// from the ground. The scale (px per metre, equal on both axes) follows the
// predicted trajectory and the remembered ones, so everything stays in view.
// The flight itself is a function of time (analytic, or pre-integrated with
// drag), so the animation only advances t — see physics.js.

import { fluidCanvas, onDrag } from '../../../assets/js/core/canvas.js';
import { startLoop } from '../../../assets/js/core/loop.js';
import {
  bindRange, bindCheckbox, bindSegmented, bindPlayPause, onClick,
} from '../../../assets/js/core/controls.js';
import { byId, $$, setText } from '../../../assets/js/core/dom.js';
import { clear, line, arrow, circle, text } from '../../../assets/js/core/draw.js';
import { COLORS, themed, alpha, font } from '../../../assets/js/core/theme.js';
import { clamp, DEG } from '../../../assets/js/core/math.js';
import { idealTrajectory, dragTrajectory, samplePath } from './physics.js';

const C = themed((light) => ({
  path: COLORS.amber,
  pathSoft: alpha(COLORS.amber, 0.55),
  ideal: COLORS.text3,
  ball: COLORS.amber,
  ballRim: light ? '#6b3f00' : '#ffd58a',
  v: COLORS.coral,
  vx: COLORS.blue,
  vy: COLORS.teal,
  ground: light ? 'rgba(30,42,90,0.05)' : 'rgba(120,140,200,0.06)',
  launcher: light ? '#5d6788' : '#8a94b8',
  tower: light ? '#c9cfe0' : '#2a3250',
  guide: light ? 'rgba(30,42,90,0.28)' : 'rgba(170,180,215,0.3)',
  history: [COLORS.purple, COLORS.green, COLORS.red, COLORS.blue, COLORS.teal],
}));

const MAX_HISTORY = 5;

// ---------- State ----------
const P = { angle: 45, v0: 20, h0: 0, g: 9.8, drag: false, k: 0.01 };
let cur = null;             // { p, traj, path, ideal, idealPath } for the current parameters
let phase = 'idle';         // 'idle' | 'flying' | 'landed'
let t = 0;                  // flight time of the current throw, s
let paused = false;
let speed = 1;
let showVectors = true;
let history = [];           // landed throws: { key, path, traj, angle, color }
let shotCount = 0;

const keyOf = (p) => [p.angle, p.v0, p.h0, p.g, p.drag ? p.k : 0].join('|');

function recompute() {
  const p = { ...P };
  const ideal = idealTrajectory(p);
  const traj = p.drag ? dragTrajectory(p) : ideal;
  cur = {
    p,
    key: keyOf(p),
    traj,
    path: samplePath(traj),
    ideal,
    idealPath: p.drag ? samplePath(ideal) : null,
  };
}

/** Moves a finished throw to the list of remembered trajectories. */
function retire() {
  if (phase !== 'landed' || history.some((h) => h.key === cur.key)) return;
  history.push({
    key: cur.key, path: cur.path, traj: cur.traj, angle: cur.p.angle, color: shotCount++ % C.history.length,
  });
  if (history.length > MAX_HISTORY) history.shift();
}

function toIdle() {
  retire();
  phase = 'idle';
  t = 0;
}

function paramsChanged() {
  toIdle();
  recompute();
}

function launch() {
  toIdle();
  phase = 'flying';
  paused = false;
  playCtl.set(false);
}

// ---------- Canvas & world transform ----------
const view = fluidCanvas(byId('cv'), {
  height: (w) => Math.round(clamp(w * 0.58, 300, 560)),
  onResize: () => { S = 0; },
});
const { ctx } = view;

let S = 0;                  // px per metre (eased towards the fitting scale)
let X0 = 0, GY = 0;         // pixel position of world (0, 0)
const px = (x) => X0 + x * S;
const py = (y) => GY - y * S;

const vecLen = () => clamp(view.width * 0.09, 46, 84);   // px for a vector of magnitude v₀

function fitScale() {
  const { width: W, height: H } = view;
  const small = W < 520;
  const padL = small ? 34 : 44;
  X0 = padL + (small ? 20 : 28);
  GY = H - 44;
  const padR = showVectors ? vecLen() * 0.8 + 14 : 30;
  const padT = 48;
  let xNeed = Math.max(cur.traj.L, cur.ideal.L);
  let yNeed = Math.max(cur.traj.H, cur.ideal.H);
  for (const h of history) {
    xNeed = Math.max(xNeed, h.traj.L);
    yNeed = Math.max(yNeed, h.traj.H);
  }
  return {
    padL,
    target: Math.min((W - X0 - padR) / Math.max(xNeed, 0.5), (GY - padT) / Math.max(yNeed, 0.5)),
  };
}

// ---------- Drawing ----------
function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

function polyline(pts, { color, width = 2, dash = null }) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(px(x), py(y)) : ctx.moveTo(px(x), py(y))));
  ctx.stroke();
  ctx.restore();
}

/** Mono label with a subscript, e.g. v with index x. Returns nothing. */
function subLabel(base, sub, x, y, color, align = 'left') {
  ctx.save();
  ctx.font = font(12, { family: 'mono', weight: 600 });
  const wBase = ctx.measureText(base).width;
  ctx.font = font(9, { family: 'mono', weight: 600 });
  const wSub = sub ? ctx.measureText(sub).width : 0;
  ctx.restore();
  const left = align === 'right' ? x - wBase - wSub : align === 'center' ? x - (wBase + wSub) / 2 : x;
  text(ctx, base, left, y, { color, size: 12, family: 'mono', weight: 600 });
  if (sub) text(ctx, sub, left + wBase, y + 4, { color, size: 9, family: 'mono', weight: 600 });
}

function drawAxes(padL) {
  const { width: W, height: H } = view;
  const step = niceStep((W < 520 ? 46 : 70) / S);
  const digits = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  const fmt = (v) => v.toFixed(digits);

  // ground
  ctx.fillStyle = C.ground;
  ctx.fillRect(0, GY, W, H - GY);

  // grid + tick labels
  ctx.save();
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  for (let i = 0; px(i * step) < W; i++) {
    const x = Math.round(px(i * step)) + 0.5;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, GY); ctx.stroke();
  }
  for (let i = 1; py(i * step) > 0; i++) {
    const y = Math.round(py(i * step)) + 0.5;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W, y); ctx.stroke();
  }
  ctx.restore();

  line(ctx, 0, GY + 0.5, W, GY + 0.5, { color: COLORS.axis, width: 1.5 });
  line(ctx, padL + 0.5, 8, padL + 0.5, GY, { color: COLORS.axis, width: 1 });

  const lbl = { color: COLORS.text3, size: 10, family: 'mono' };
  for (let i = 0; px(i * step) < W - 14; i++) {
    const x = px(i * step);
    line(ctx, x, GY, x, GY + 5, { color: COLORS.axis });
    text(ctx, fmt(i * step), x, GY + 13, { ...lbl, align: 'center' });
  }
  for (let i = 1; py(i * step) > 26; i++) {
    const y = py(i * step);
    line(ctx, padL - 4, y, padL, y, { color: COLORS.axis });
    text(ctx, fmt(i * step), padL - 7, y, { ...lbl, align: 'right' });
  }
  text(ctx, 'y, մ', padL + 7, 13, { color: COLORS.text3, size: 11 });
  text(ctx, 'x, մ', W - 8, GY - 10, { color: COLORS.text3, size: 11, align: 'right' });
}

function drawLauncher(p) {
  const x = px(0), y = py(p.h0);
  // tower under the launch point
  if (p.h0 > 0) {
    ctx.fillStyle = C.tower;
    ctx.fillRect(x - 11, y + 5, 22, GY - y - 5);
    ctx.fillStyle = C.launcher;
    ctx.fillRect(x - 15, y + 5, 30, 4);
  }
  // barrel
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-p.angle * DEG);
  ctx.fillStyle = C.launcher;
  ctx.beginPath();
  ctx.roundRect(-9, -6, 35, 12, 4);
  ctx.fill();
  ctx.restore();
  circle(ctx, x, y, 4, { fill: COLORS.canvasBg, stroke: C.launcher, width: 2 });
}

function drawAngle(p) {
  const x = px(0), y = py(p.h0);
  const r = 40;
  line(ctx, x, y, x + r + 14, y, { color: C.guide, dash: [3, 3] });
  if (p.angle > 0) {
    ctx.save();
    ctx.strokeStyle = C.guide;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, -p.angle * DEG, true);
    ctx.stroke();
    ctx.restore();
  }
  // label: on the bisector, or above the direction line for small angles
  const a = (p.angle >= 34 ? p.angle / 2 : Math.min(p.angle + 26, 80)) * DEG;
  const rr = p.angle >= 34 ? r + 8 : r + 22;
  text(ctx, `α = ${p.angle}°`, x + Math.cos(a) * rr, y - Math.sin(a) * rr, {
    color: COLORS.text2, size: 11, family: 'mono',
  });
}

function drawVectors(s, v0) {
  const k = vecLen() / v0;
  const x = px(s.x), y = py(s.y);
  const ex = x + s.vx * k, ey = y - s.vy * k;
  line(ctx, ex, y, ex, ey, { color: C.guide, dash: [3, 3] });
  line(ctx, x, ey, ex, ey, { color: C.guide, dash: [3, 3] });
  arrow(ctx, x, y, ex, y, { color: C.vx, width: 2, head: 8 });
  arrow(ctx, x, y, x, ey, { color: C.vy, width: 2, head: 8 });
  arrow(ctx, x, y, ex, ey, { color: C.v, width: 2.5, head: 10 });

  const up = s.vy >= 0;
  if (Math.abs(s.vx * k) > 14) subLabel('v', 'x', ex + 5, y + (up ? 9 : -9), C.vx);
  if (Math.abs(s.vy * k) > 14) subLabel('v', 'y', x - 6, ey + (up ? -2 : 2), C.vy, 'right');
  subLabel('v', '', ex + 6, ey + (up ? -8 : 8), C.v);
}

function drawMarkers(traj, p) {
  const { width: W } = view;
  const xt = px(traj.xTop), yt = py(traj.H);
  const xl = px(traj.L);

  // highest point
  line(ctx, xt, yt, xt, GY, { color: C.guide, dash: [2, 4] });
  circle(ctx, xt, yt, 4, { fill: COLORS.canvasBg, stroke: C.path, width: 2 });
  const atLauncher = traj.tTop === 0;
  text(ctx, `H = ${traj.H.toFixed(2)} մ`, clamp(xt, px(0) + 34, W - 52), yt - (atLauncher ? 26 : 16), {
    color: COLORS.text, size: 12, family: 'mono', weight: 600, align: 'center',
  });

  // landing point
  circle(ctx, xl, GY, 4, { fill: C.path, stroke: COLORS.canvasBg, width: 1.5 });
  text(ctx, `L = ${traj.L.toFixed(2)} մ`, clamp(xl, 56, W - 52), GY + 31, {
    color: COLORS.text, size: 12, family: 'mono', weight: 600, align: 'center',
  });
  if (p.h0 * S > 30) {
    text(ctx, `h₀ = ${p.h0} մ`, px(0) + 18, py(p.h0) + 18, { color: COLORS.text2, size: 11, family: 'mono' });
  }
}

function draw(dt) {
  const { width: W, height: H } = view;
  if (!W) return;

  const { padL, target } = fitScale();
  S = S ? S + (target - S) * (1 - Math.exp(-dt * 9)) : target;
  if (Math.abs(S - target) < target * 1e-4) S = target;

  clear(ctx, W, H, COLORS.canvasBg);
  drawAxes(padL);

  // remembered throws
  for (const h of history) {
    if (h.key === cur.key && phase !== 'idle') continue;
    const col = C.history[h.color];
    polyline(h.path, { color: alpha(col, 0.5), width: 1.5 });
    circle(ctx, px(h.traj.L), GY, 3, { fill: alpha(col, 0.8) });
    text(ctx, `${h.angle}°`, px(h.traj.xTop), py(h.traj.H) + 12, {
      color: alpha(col, 0.9), size: 10, family: 'mono', align: 'center',
    });
  }

  const { p, traj } = cur;
  if (cur.idealPath) polyline(cur.idealPath, { color: C.ideal, width: 1.5, dash: [5, 5] });

  // prediction (dashed) and the travelled part (solid)
  if (phase !== 'landed') polyline(cur.path, { color: C.pathSoft, width: 1.5, dash: [6, 6] });
  if (phase === 'landed') polyline(cur.path, { color: C.path, width: 2.5 });
  else if (phase === 'flying' && t > 0) {
    polyline(samplePath(traj, t, Math.max(8, Math.ceil(160 * t / traj.T))), { color: C.path, width: 2.5 });
  }

  drawMarkers(traj, p);
  drawLauncher(p);
  if (phase === 'idle') drawAngle(p);

  const s = traj.at(t);
  circle(ctx, px(s.x), py(s.y), 6.5, { fill: C.ball, stroke: C.ballRim, width: 1.5 });
  if (showVectors && phase !== 'landed') drawVectors(s, p.v0);   // after landing the body is at rest

  updateReadouts(s);
}

// ---------- Readouts ----------
const cache = {};
function put(id, html) {
  if (cache[id] === html) return;
  cache[id] = html;
  byId(id).innerHTML = html;
}
const n2 = (v) => (Math.abs(v) < 0.005 ? 0 : v).toFixed(2);

function updateReadouts(s) {
  const { traj, ideal, p } = cur;
  put('posOut',
    `t = <b>${n2(t)}</b> վ<br>x = <b>${n2(s.x)}</b> մ<br>y = <b>${n2(s.y)}</b> մ`);
  put('velOut',
    `v = <b>${n2(Math.hypot(s.vx, s.vy))}</b> մ/վ<br>` +
    `v<sub>x</sub> = <b>${n2(s.vx)}</b> մ/վ<br>v<sub>y</sub> = <b>${n2(s.vy)}</b> մ/վ`);
  const extra = (v) => (p.drag ? ` (առանց դիմ.՝ ${n2(v)})` : '');
  put('resOut',
    `T = <b>${n2(traj.T)}</b> վ${extra(ideal.T)}<br>` +
    `L = <b>${n2(traj.L)}</b> մ${extra(ideal.L)}<br>` +
    `H = <b>${n2(traj.H)}</b> մ${extra(ideal.H)}`);
}

// ---------- Controls ----------
const angleCtl = bindRange('angle', { format: (v) => `${v}°`, onInput: (v) => { P.angle = v; paramsChanged(); } });
bindRange('v0', { format: (v) => `${v} մ/վ`, onInput: (v) => { P.v0 = v; paramsChanged(); } });
bindRange('h0', { format: (v) => `${v} մ`, onInput: (v) => { P.h0 = v; paramsChanged(); } });
bindSegmented('gravity', {
  onChange: (v) => {
    P.g = parseFloat(v);
    setText('gOut', `${v} մ/վ²`);
    paramsChanged();
  },
});
setText('gOut', `${P.g} մ/վ²`);

bindCheckbox('drag', {
  onChange: (on) => {
    P.drag = on;
    byId('dragBox').hidden = !on;
    byId('legIdeal').hidden = !on;
    paramsChanged();
  },
});
bindRange('kdrag', { format: (v) => `${v.toFixed(3)} մ⁻¹`, onInput: (v) => { P.k = v; paramsChanged(); } });

bindCheckbox('vectors', {
  onChange: (on) => {
    showVectors = on;
    $$('.js-vec').forEach((el) => { el.hidden = !on; });
  },
});
bindSegmented('speed', { onChange: (v) => { speed = parseFloat(v); } });

onClick('launchBtn', launch);
const playCtl = bindPlayPause('pauseBtn', { onChange: (v) => { paused = v; } });
onClick('resetBtn', toIdle);
onClick('clearBtn', () => {
  history = [];
  if (phase === 'landed') { phase = 'idle'; t = 0; }
});

// Drag near the launcher to aim.
function aim(pt) {
  const dx = pt.x - px(0), dy = py(P.h0) - pt.y;
  if (Math.hypot(dx, dy) < 12) return;
  const a = clamp(Math.round(Math.atan2(dy, dx) / DEG), 0, 90);
  if (a !== P.angle) angleCtl.set(a);
}
onDrag(view, {
  start: (pt) => {
    if (Math.hypot(pt.x - px(0), pt.y - py(P.h0)) > Math.max(120, vecLen() * 1.8)) return false;
    aim(pt);
  },
  move: aim,
});

// ---------- Start ----------
recompute();

startLoop((dt) => {
  if (phase === 'flying' && !paused) {
    t += dt * speed;
    if (t >= cur.traj.T) {
      t = cur.traj.T;
      phase = 'landed';
    }
  }
  draw(dt);
});
