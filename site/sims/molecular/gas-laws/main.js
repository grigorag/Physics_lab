// Gas laws — an ideal gas in a cylinder with a piston.
//
// The state (p, V, T) follows pV = νRT exactly (see physics.js); the bouncing
// molecules only illustrate it: their rms speed ∝ √T and the chamber length ∝ V.
// Units: T in K, V in litres, p in kPa, ν in mol.

import { fluidCanvas, onDrag, pointerPos } from '../../../assets/js/core/canvas.js';
import { bindRange, bindSegmented, bindPlayPause, onClick } from '../../../assets/js/core/controls.js';
import { byId, setText, setHTML } from '../../../assets/js/core/dom.js';
import { startLoop } from '../../../assets/js/core/loop.js';
import { clear, line, arrow, circle, text, roundRect } from '../../../assets/js/core/draw.js';
import { COLORS, themed, alpha, onThemeChange, fontsReady } from '../../../assets/js/core/theme.js';
import { clamp, lerp, TAU } from '../../../assets/js/core/math.js';
import {
  R, LIMITS, DISC_R, pressure, meanKineticEnergy,
  volumeRange, tempRangeIsobaric, tempRangeIsochoric, nuRange, createGas,
} from './physics.js';

const INITIAL = { nu: 1, T: 300, V: 24.9 };
const MOLECULES_PER_MOLE = 60;     // drawn molecules per mole (illustration only)
const V_RMS_300 = 0.75;            // rms speed at 300 K, chamber heights per second
const TRACE_MAX = 6000;

const C = themed((light) => ({
  wall: light ? '#7d88a6' : '#5b6688',
  piston: light ? '#b9c1d6' : '#8791b3',
  pistonEdge: light ? '#5f6a8a' : '#c3cbe6',
  dial: light ? '#ffffff' : '#141a2b',
  glass: light ? '#e9edf6' : '#1b2236',
  cold: COLORS.blue,
  mid: COLORS.purple,
  hot: light ? '#d8401f' : '#ff6a3d',
  load: COLORS.teal,
  curve: COLORS.teal,
  trace: COLORS.amber,
  point: COLORS.coral,
}));

// ---------- State ----------
const state = { process: 'isothermal', ...INITIAL };
const p = () => pressure(state.nu, state.T, state.V);
const snapshot = () => ({ p: p(), V: state.V, T: state.T });

let trace = [snapshot()];
let heat = 0;            // +1 heating … −1 cooling, decays to 0
let paused = false;
let chartDirty = true;
let limitMsg = '';
const flashes = [];      // wall hits: { x, y, age } in chamber units

const gas = createGas();

// ---------- Scene geometry ----------
function sceneLayout(W) {
  const pad = 12;
  const colW = clamp(W * 0.13, 66, 104);          // instruments column
  const wt = 5;                                   // wall thickness
  const pt = Math.round(clamp(W * 0.02, 10, 16)); // piston thickness
  const rod = 22;
  const x0 = Math.round(pad + colW + 10 + wt);    // inner face of the closed end
  const Lmax = W - pad - x0 - pt - rod;           // chamber length at V max
  const Hc = Math.round(clamp(Lmax / 2.2, 150, 300));
  const y0 = 30;
  const bottom = 44;
  return { W, H: y0 + Hc + bottom, pad, colW, wt, pt, rod, x0, Lmax, Hc, y0, y1: y0 + Hc, aspect: Lmax / Hc };
}

let L = null;
const scene = fluidCanvas(byId('scene'), {
  height: (w) => sceneLayout(w).H,
  onResize: relayout,
});
const chart = fluidCanvas(byId('chart'), {
  height: (w) => Math.round(clamp(w * 0.44, 240, 360)),
  onResize: () => { chartDirty = true; },
});

function relayout() {
  const next = sceneLayout(scene.width);
  if (L) gas.stretch(next.aspect / L.aspect);
  L = next;
}
relayout();

const chamberLength = () => (L.aspect * state.V) / LIMITS.V[1];        // chamber heights
const pistonX = () => L.x0 + (L.Lmax * state.V) / LIMITS.V[1];        // px
const moleculeCount = () => Math.round(state.nu * MOLECULES_PER_MOLE);

gas.setCount(moleculeCount(), chamberLength());

// ---------- Controls ----------
const hintBox = byId('hintBox');
const sceneHint = byId('sceneHint');

const vCtl = bindRange('vSlider', { format: (v) => `${v.toFixed(1)} լ`, onInput: setVolume });
const tCtl = bindRange('tSlider', { format: (v) => `${v.toFixed(0)} Կ`, onInput: setTemperature });
const nuCtl = bindRange('nuSlider', { format: (v) => `${v.toFixed(1)} մոլ`, onInput: setAmount });

const processCtl = bindSegmented('process', {
  onChange: (v) => { state.process = v; limitMsg = ''; sync(); },
});
bindSegmented('axes', { onChange: (v) => { axes = v; chartDirty = true; } });
let axes = 'pV';

bindPlayPause('playBtn', { onChange: (v) => { paused = v; } });
onClick('clearBtn', () => { trace = [snapshot()]; chartDirty = true; });
onClick('resetBtn', () => {
  Object.assign(state, INITIAL);
  heat = 0;
  limitMsg = '';
  trace = [snapshot()];
  gas.setCount(moleculeCount(), chamberLength());
  sync();
});

const MSG_P = `Սահմանը. ճնշումը չպետք է գերազանցի ${LIMITS.P_MAX} կՊա-ն։`;
const MSG_V = `Սահմանը. ծավալը պետք է մնա ${LIMITS.V[0]}–${LIMITS.V[1]} լ միջակայքում։`;

const PROCESS = {
  isothermal: {
    law: '<b>Բոյլ-Մարիոտի օրենք</b> · T = const<br>pV = const։ Փոխեք ծավալը սահիչով կամ քաշեք մխոցը. ճնշումը փոխվում է ծավալին հակադարձ համեմատական։',
    hint: 'Ջերմաստիճանը փոխելու համար ընտրեք իզոբար կամ իզոխոր պրոցես։',
    name: 'իզոթերմ',
    tag: () => `T = ${state.T.toFixed(0)} Կ`,
    badge: 'T = const',
  },
  isobaric: {
    law: '<b>Գեյ-Լյուսակի օրենք</b> · p = const<br>V/T = const։ Մխոցն ազատ է, արտաքին ճնշումը՝ հաստատուն։ Փոխեք ջերմաստիճանը. ծավալը փոխվում է նրան ուղիղ համեմատական։',
    hint: 'Ծավալն այս պրոցեսում ինքն է փոխվում՝ ջերմաստիճանին համեմատական։',
    name: 'իզոբար',
    tag: () => `p = ${p().toFixed(1)} կՊա`,
    badge: 'p = const',
  },
  isochoric: {
    law: '<b>Շառլի օրենք</b> · V = const<br>p/T = const։ Մխոցն ամրացված է։ Փոխեք ջերմաստիճանը. ճնշումը փոխվում է նրան ուղիղ համեմատական։',
    hint: 'Ծավալը փոխելու համար ընտրեք իզոթերմ պրոցես։',
    name: 'իզոխոր',
    tag: () => `V = ${state.V.toFixed(1)} լ`,
    badge: 'V = const',
  },
};

// ---------- State changes ----------
function pushTrace(pt) {
  const last = trace[trace.length - 1];
  if (last && last.V === pt.V && last.T === pt.T && last.p === pt.p) return;
  trace.push(pt);
  if (trace.length > TRACE_MAX) trace.splice(0, trace.length - TRACE_MAX);
}

/** Adds the path from u0 to u1 along the current process to the trace
 *  (sampled, so a big jump still follows the hyperbola / straight line). */
function walk(u0, u1, stateAt, du) {
  const n = clamp(Math.ceil(Math.abs(u1 - u0) / du), 1, 80);
  for (let i = 1; i <= n; i++) pushTrace(stateAt(lerp(u0, u1, i / n)));
}

function limited(value, [lo, hi], msg) {
  const c = clamp(value, lo, hi);
  limitMsg = Math.abs(c - value) > 1e-9 ? msg : '';
  return c;
}

/** Isothermal: the student changes V, p follows. */
function setVolume(v) {
  if (state.process !== 'isothermal') { sync(); return; }
  const { nu, T } = state;
  const c = limited(v, volumeRange(nu, T), MSG_P);
  walk(state.V, c, (V) => ({ V, T, p: pressure(nu, T, V) }), 0.5);
  state.V = c;
  sync();
}

/** Isobaric: V follows T at the pressure of the moment; isochoric: p follows T. */
function setTemperature(t) {
  const { nu, V, process } = state;
  if (process === 'isothermal') { sync(); return; }
  const from = state.T;
  if (process === 'isobaric') {
    const p0 = p();
    const c = limited(t, tempRangeIsobaric(nu, p0), MSG_V);
    walk(from, c, (T) => ({ T, p: p0, V: (nu * R * T) / p0 }), 5);
    state.T = c;
    state.V = (nu * R * c) / p0;
  } else {
    const c = limited(t, tempRangeIsochoric(nu, V), MSG_P);
    walk(from, c, (T) => ({ T, V, p: pressure(nu, T, V) }), 5);
    state.T = c;
  }
  if (state.T !== from) heat = Math.sign(state.T - from);
  sync();
}

/** Another amount of gas is another experiment: the trace starts anew. */
function setAmount(n) {
  const isobaric = state.process === 'isobaric';
  const p0 = p();
  const c = limited(n, nuRange(state.process, { T: state.T, V: state.V, p: p0 }), isobaric ? MSG_V : MSG_P);
  state.nu = Math.round(c * 10) / 10;
  if (isobaric) state.V = (state.nu * R * state.T) / p0;
  gas.setCount(moleculeCount(), chamberLength());
  trace = [snapshot()];
  sync();
}

const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };

/** Controls, readouts and texts ← state. */
function sync() {
  const proc = PROCESS[state.process];
  vCtl.set(state.V.toFixed(1), { silent: true });
  tCtl.set(state.T, { silent: true });
  nuCtl.set(state.nu, { silent: true });
  vCtl.input.disabled = state.process !== 'isothermal';
  tCtl.input.disabled = state.process === 'isothermal';

  setText('pVal', `${p().toFixed(1)} կՊա`);
  setText('vVal', `${state.V.toFixed(2)} լ`);
  setText('tVal', `${state.T.toFixed(0)} Կ (${(state.T - 273).toFixed(0)} °C)`);
  setText('nuVal', `${state.nu.toFixed(1)} մոլ`);
  setText('pvtVal', `${((p() * state.V) / state.T).toFixed(2)} Ջ/Կ`);
  const [mant, exp] = meanKineticEnergy(state.T).toExponential(2).split('e');
  setText('ekVal', `${mant}·10${[...String(+exp)].map((ch) => SUP[ch]).join('')} Ջ`);

  setHTML('lawBox', proc.law);
  hintBox.textContent = limitMsg || proc.hint;
  hintBox.classList.toggle('hint--warn', !!limitMsg);
  sceneHint.hidden = state.process !== 'isothermal';
  chartDirty = true;
}

// ---------- Dragging the piston (isothermal only) ----------
function overPiston(pos) {
  const xp = pistonX();
  return pos.x > xp - 14 && pos.x < xp + L.pt + L.rod + 14 && pos.y > L.y0 - 10 && pos.y < L.y1 + 10;
}
let grab = 0;
onDrag(scene, {
  start(pos) {
    if (state.process !== 'isothermal' || !overPiston(pos)) return false;
    grab = pos.x - pistonX();
  },
  move(pos) {
    const v = ((pos.x - grab - L.x0) / L.Lmax) * LIMITS.V[1];
    setVolume(Math.round(clamp(v, LIMITS.V[0], LIMITS.V[1]) * 10) / 10);
  },
});
scene.canvas.addEventListener('pointermove', (e) => {
  const can = state.process === 'isothermal' && overPiston(pointerPos(scene, e));
  scene.canvas.style.cursor = can ? 'ew-resize' : '';
});

// ---------- Colors ----------
function mix(hexA, hexB, t) {
  const a = parseInt(hexA.slice(1), 16), b = parseInt(hexB.slice(1), 16);
  const ch = (shift) => Math.round(lerp((a >> shift) & 255, (b >> shift) & 255, t));
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}
function tempColor(T) {
  const t = clamp((T - LIMITS.T[0]) / (LIMITS.T[1] - LIMITS.T[0]), 0, 1);
  return t < 0.5 ? mix(C.cold, C.mid, t * 2) : mix(C.mid, C.hot, t * 2 - 1);
}

// ---------- Scene ----------
function drawScene() {
  const { ctx } = scene;
  const { W, H, pad, colW, wt, pt, rod, x0, Lmax, Hc, y0, y1 } = L;
  const xp = pistonX();
  const gasColor = tempColor(state.T);
  const glow = Math.abs(heat);
  const glowColor = heat > 0 ? C.hot : C.cold;

  clear(ctx, W, H, COLORS.canvasBg);

  // Gas volume, tinted by temperature; heater / cooler glow from below.
  ctx.fillStyle = alpha(gasColor, 0.1);
  ctx.fillRect(x0, y0, xp - x0, Hc);
  if (glow > 0.02) {
    const g = ctx.createLinearGradient(0, y1, 0, y1 - Hc * 0.45);
    g.addColorStop(0, alpha(glowColor, 0.34 * glow));
    g.addColorStop(1, alpha(glowColor, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x0, y1 - Hc * 0.45, xp - x0, Hc * 0.45);
    const g2 = ctx.createLinearGradient(0, y1 + wt, 0, H - 4);
    g2.addColorStop(0, alpha(glowColor, 0.5 * glow));
    g2.addColorStop(1, alpha(glowColor, 0));
    ctx.fillStyle = g2;
    ctx.fillRect(x0, y1 + wt, xp - x0, H - 4 - y1 - wt);
  }

  // Molecules
  const rPx = Math.max(2, DISC_R * Hc);
  ctx.fillStyle = gasColor;
  ctx.beginPath();
  for (const m of gas.particles) {
    const mx = Math.min(x0 + m.x * Hc, xp - rPx);
    const my = y0 + m.y * Hc;
    ctx.moveTo(mx + rPx, my);
    ctx.arc(mx, my, rPx, 0, TAU);
  }
  ctx.fill();

  // Wall-hit flashes
  for (const f of flashes) {
    const k = 1 - f.age / 0.3;
    circle(ctx, Math.min(x0 + f.x * Hc, xp), y0 + f.y * Hc, 2 + 7 * (1 - k), { stroke: alpha(COLORS.amber, 0.75 * k), width: 1.5 });
  }

  // Cylinder: closed on the left, open on the right.
  const xEnd = x0 + Lmax + pt + 6;
  ctx.fillStyle = C.wall;
  ctx.fillRect(x0 - wt, y0 - wt, xEnd - x0 + wt, wt);
  ctx.fillRect(x0 - wt, y1, xEnd - x0 + wt, wt);
  ctx.fillRect(x0 - wt, y0 - wt, wt, Hc + 2 * wt);

  // Volume scale along the top wall
  for (let v = 0; v <= LIMITS.V[1]; v += 5) {
    const x = x0 + (Lmax * v) / LIMITS.V[1];
    const major = v % 10 === 0;
    line(ctx, x, y0 - wt - (major ? 7 : 4), x, y0 - wt, { color: COLORS.axis, width: 1 });
    if (major && v > 0) {
      text(ctx, `${v} լ`, x, y0 - wt - 9, { color: COLORS.text3, size: 10, family: 'mono', align: 'center', baseline: 'bottom' });
    }
  }

  // Piston, rod and handle
  const draggable = state.process === 'isothermal';
  const yMid = (y0 + y1) / 2;
  ctx.fillStyle = C.wall;
  ctx.fillRect(xp + pt, yMid - 3, rod - 4, 6);
  roundRect(ctx, xp + pt + rod - 6, yMid - 20, 6, 40, 3);
  ctx.fillStyle = draggable ? COLORS.coral : C.wall;
  ctx.fill();
  ctx.fillStyle = C.piston;
  ctx.fillRect(xp, y0, pt, Hc);
  ctx.strokeStyle = draggable ? COLORS.coral : C.pistonEdge;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(xp + 0.75, y0 + 0.75, pt - 1.5, Hc - 1.5);

  if (state.process === 'isobaric') {
    // Constant external load on the free piston.
    for (const k of [0.25, 0.75]) {
      const y = y0 + Hc * k;
      arrow(ctx, xp + pt + 20, y, xp + pt + 3, y, { color: C.load, width: 2, head: 7 });
    }
  } else if (state.process === 'isochoric') {
    // Locking pins through the walls.
    ctx.fillStyle = COLORS.text2;
    const bw = Math.max(4, pt - 6);
    ctx.fillRect(xp + (pt - bw) / 2, y0 - wt - 4, bw, wt + 12);
    ctx.fillRect(xp + (pt - bw) / 2, y1 - 8, bw, wt + 12);
  }

  // Heater / cooler plate under the gas
  ctx.fillStyle = glow > 0.02 ? mix(C.wall, glowColor, Math.min(1, glow * 1.2)) : alpha(C.wall, 0.55);
  roundRect(ctx, x0, y1 + wt + 5, Math.max(8, xp - x0), 6, 3);
  ctx.fill();
  text(ctx, PROCESS[state.process].badge, x0, y1 + wt + 25, { color: COLORS.text3, size: 11, family: 'mono' });
  if (glow > 0.15) {
    text(ctx, heat > 0 ? 'տաքացում' : 'սառեցում', x0 + 78, y1 + wt + 25, { color: alpha(glowColor, Math.min(1, glow * 1.4)), size: 11 });
  }

  drawGauge(pad + colW / 2, colW);
  drawThermometer(pad + colW / 2);
}

function drawGauge(gx, colW) {
  const { ctx } = scene;
  const r = Math.min(colW / 2 - 3, 36);
  const gy = L.y0 + r - 4;
  const a0 = TAU * 0.375, sweep = TAU * 0.75;      // 135° … 405°

  // Pipe to the cylinder
  ctx.fillStyle = C.wall;
  ctx.fillRect(gx + r - 1, gy - 2.5, L.x0 - L.wt - gx - r + 2, 5);

  circle(ctx, gx, gy, r, { fill: C.dial, stroke: C.wall, width: 2.5 });
  for (let v = 0; v <= LIMITS.P_MAX; v += 50) {
    const a = a0 + (sweep * v) / LIMITS.P_MAX;
    const major = v % 100 === 0;
    const r1 = r - (major ? 8 : 5.5), r2 = r - 3;
    line(ctx, gx + Math.cos(a) * r1, gy + Math.sin(a) * r1, gx + Math.cos(a) * r2, gy + Math.sin(a) * r2,
      { color: major ? COLORS.text2 : COLORS.text3, width: major ? 1.5 : 1 });
  }
  const a = a0 + (sweep * clamp(p() / LIMITS.P_MAX, 0, 1));
  line(ctx, gx - Math.cos(a) * 5, gy - Math.sin(a) * 5, gx + Math.cos(a) * (r - 9), gy + Math.sin(a) * (r - 9),
    { color: COLORS.coral, width: 2, cap: 'round' });
  circle(ctx, gx, gy, 2.5, { fill: COLORS.text2 });
  text(ctx, 'p', gx, gy + r * 0.52, { color: COLORS.text3, size: 10, family: 'mono', style: 'italic', align: 'center' });
  text(ctx, `${p().toFixed(1)} կՊա`, gx, gy + r + 13, { color: COLORS.text, size: 10.5, family: 'mono', align: 'center' });
  L.gaugeBottom = gy + r + 22;
}

function drawThermometer(gx) {
  const { ctx } = scene;
  const top = L.gaugeBottom + 8;
  const bulbY = L.H - 30, bulbR = 7, tubeW = 6;
  const bottom = bulbY - bulbR + 2;                 // 0 K level
  const T_TOP = 650;
  const yOf = (T) => bottom - ((bottom - top - 4) * T) / T_TOP;
  const color = tempColor(state.T);

  roundRect(ctx, gx - tubeW / 2, top, tubeW, bulbY - top, tubeW / 2);
  ctx.fillStyle = C.glass;
  ctx.fill();
  ctx.strokeStyle = C.wall;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  circle(ctx, gx, bulbY, bulbR, { fill: color, stroke: C.wall, width: 1.2 });
  ctx.fillStyle = color;
  ctx.fillRect(gx - tubeW / 2 + 1.5, yOf(state.T), tubeW - 3, bulbY - yOf(state.T));

  for (let T = 0; T <= 600; T += 100) {
    const y = yOf(T);
    const major = T % 200 === 0;
    line(ctx, gx + tubeW / 2 + 2, y, gx + tubeW / 2 + (major ? 7 : 5), y, { color: COLORS.axis, width: 1 });
    if (major) text(ctx, String(T), gx + tubeW / 2 + 9, y, { color: COLORS.text3, size: 9, family: 'mono' });
  }
  text(ctx, `${state.T.toFixed(0)} Կ`, gx, L.H - 11, { color: COLORS.text, size: 10.5, family: 'mono', align: 'center' });
}

// ---------- Diagram ----------
const AXIS = {
  V: { max: LIMITS.V[1], step: 10, label: 'V, լ' },
  T: { max: LIMITS.T[1], step: 100, label: 'T, Կ' },
  p: { max: LIMITS.P_MAX, step: 100, label: 'p, կՊա' },
};
const DIAGRAM = { pV: ['V', 'p'], VT: ['T', 'V'], pT: ['T', 'p'] };

/** The current process as a curve: state for the free variable u, the reachable
 *  range of u (solid) and the range of its continuation (dashed). */
function processCurve() {
  const { nu, T, V, process } = state;
  const p0 = p();
  if (process === 'isothermal') {
    return { at: (u) => ({ V: u, T, p: pressure(nu, T, u) }), solid: volumeRange(nu, T), full: [0.4, LIMITS.V[1]] };
  }
  if (process === 'isobaric') {
    return { at: (u) => ({ T: u, p: p0, V: (nu * R * u) / p0 }), solid: tempRangeIsobaric(nu, p0), full: [0, LIMITS.T[1]] };
  }
  return { at: (u) => ({ T: u, V, p: pressure(nu, u, V) }), solid: tempRangeIsochoric(nu, V), full: [0, LIMITS.T[1]] };
}

function drawChart() {
  const { ctx, width: W, height: H } = chart;
  if (!W) return;
  const [xk, yk] = DIAGRAM[axes];
  const ax = AXIS[xk], ay = AXIS[yk];
  const m = { l: 46, r: 18, t: 28, b: 42 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const X = (s) => m.l + (s[xk] / ax.max) * pw;
  const Y = (s) => m.t + ph - (s[yk] / ay.max) * ph;

  clear(ctx, W, H, COLORS.canvasBg);

  // Grid, ticks, axes
  for (let v = 0; v <= ax.max; v += ax.step) {
    const x = m.l + (v / ax.max) * pw;
    line(ctx, x, m.t, x, m.t + ph, { color: COLORS.grid, width: 1 });
    text(ctx, String(v), x, m.t + ph + 8, { color: COLORS.text3, size: 10, family: 'mono', align: 'center', baseline: 'top' });
  }
  for (let v = 0; v <= ay.max; v += ay.step) {
    const y = m.t + ph - (v / ay.max) * ph;
    line(ctx, m.l, y, m.l + pw, y, { color: COLORS.grid, width: 1 });
    if (v > 0) text(ctx, String(v), m.l - 7, y, { color: COLORS.text3, size: 10, family: 'mono', align: 'right' });
  }
  line(ctx, m.l, m.t - 6, m.l, m.t + ph, { color: COLORS.axis, width: 1.2 });
  line(ctx, m.l, m.t + ph, m.l + pw + 6, m.t + ph, { color: COLORS.axis, width: 1.2 });
  text(ctx, ay.label, m.l - 34, 12, { color: COLORS.text2, size: 11, family: 'mono' });
  text(ctx, ax.label, m.l + pw, H - 11, { color: COLORS.text2, size: 11, family: 'mono', align: 'right' });

  const proc = PROCESS[state.process];
  text(ctx, `${proc.name} · ${proc.tag()}`, W - m.r, 12, { color: C.curve, size: 11, align: 'right' });

  ctx.save();
  ctx.beginPath();
  ctx.rect(m.l, m.t - 4, pw + 4, ph + 4);
  ctx.clip();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const polyline = (points, color, width, dash) => {
    if (points.length < 2) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash || []);
    ctx.beginPath();
    points.forEach((s, i) => (i ? ctx.lineTo(X(s), Y(s)) : ctx.moveTo(X(s), Y(s))));
    ctx.stroke();
    ctx.setLineDash([]);
  };
  const sample = (at, [u0, u1], n = 96) => Array.from({ length: n + 1 }, (_, i) => at(lerp(u0, u1, i / n)));

  // Theoretical curve of the current process through the current state
  const curve = processCurve();
  polyline(sample(curve.at, curve.full), alpha(C.curve, 0.75), 1.3, [5, 5]);
  polyline(sample(curve.at, curve.solid), alpha(C.curve, 0.5), 5);

  // Path taken since the last reset
  polyline(trace, C.trace, 2.2);

  // Current state with guides to the axes
  const now = snapshot();
  const px = X(now), py = Y(now);
  line(ctx, px, py, px, m.t + ph, { color: alpha(C.point, 0.55), width: 1, dash: [2, 3] });
  line(ctx, px, py, m.l, py, { color: alpha(C.point, 0.55), width: 1, dash: [2, 3] });
  ctx.restore();
  circle(ctx, px, py, 5.5, { fill: C.point, stroke: COLORS.canvasBg, width: 2 });
}

// ---------- Main loop ----------
const onHit = (x, y) => { if (flashes.length < 40) flashes.push({ x, y, age: 0 }); };

startLoop((dt) => {
  if (!paused) {
    gas.step(dt, chamberLength(), V_RMS_300 * Math.sqrt(state.T / 300), onHit);
    for (const f of flashes) f.age += dt;
    while (flashes.length && flashes[0].age >= 0.3) flashes.shift();
  }
  heat *= Math.exp(-dt / 0.7);
  drawScene();
  if (chartDirty) { chartDirty = false; drawChart(); }
});

onThemeChange(() => { chartDirty = true; });
fontsReady().then(() => { chartDirty = true; });
sync();
