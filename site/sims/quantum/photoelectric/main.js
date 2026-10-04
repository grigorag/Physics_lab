// Photoelectric effect — a vacuum phototube in a circuit.
//
// All numbers come from physics.js (Einstein's equation and a simple
// photocurrent model, described there). The flying electrons illustrate the
// same model: energies uniform in 0…Ek_max, screen speed ∝ √Ek, uniform field
// between the plates.
// Units: λ in nm, energies in eV, U in V, I in μA.

import { fluidCanvas } from '../../../assets/js/core/canvas.js';
import { bindRange, bindSelect, bindPlayPause, onClick } from '../../../assets/js/core/controls.js';
import { byId, setText, setHTML } from '../../../assets/js/core/dom.js';
import { startLoop } from '../../../assets/js/core/loop.js';
import { clear, line, circle, text, roundRect } from '../../../assets/js/core/draw.js';
import { COLORS, themed, alpha, onThemeChange, fontsReady } from '../../../assets/js/core/theme.js';
import { clamp, lerp, rand, TAU } from '../../../assets/js/core/math.js';
import { wavelengthToRGB, rgba } from '../../../assets/js/core/color.js';
import {
  METALS, H_EV, I_FULL, solve, photocurrent, emitElectron, stepElectron,
} from './physics.js';

const INITIAL = { lambda: 400, intensity: 60, U: 0, metal: 'na' };
const EMIT_RATE = 40;        // drawn electrons per second at 100 % intensity
const MAX_ELECTRONS = 500;
const U_MAX = 5;

const C = themed((light) => ({
  glass: light ? '#8a94b3' : '#5b6688',
  glassFill: light ? 'rgba(90,110,170,0.06)' : 'rgba(140,160,230,0.05)',
  metal: light ? '#8791ad' : '#8b95b8',
  metalEdge: light ? '#59627f' : '#c3cbe6',
  wire: light ? '#59627f' : '#8d97ba',
  dial: light ? '#ffffff' : '#141a2b',
  electron: COLORS.blue,
  curve: COLORS.pink,
  point: COLORS.coral,
  plus: COLORS.red,
  minus: COLORS.blue,
  beamGain: light ? 1.25 : 1,          // beam opacity factor
  beamShade: light ? 0.82 : 1,         // darker photons on the light background
}));

// ---------- State ----------
const state = { ...INITIAL };
let paused = false;
let time = 0;
let emitAcc = 0;
let chartsDirty = true;
const electrons = [];        // { x, v, y, vy } — x along the gap (0…1), y along the plate (0…1)

const metal = () => METALS.find((m) => m.id === state.metal);
const result = () => solve(state.lambda, metal().A, state.U, state.intensity / 100);

// ---------- Formatting ----------
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
function sci(x, digits = 2) {
  const [mant, exp] = x.toExponential(digits).split('e');
  return `${mant}·10${[...String(+exp)].map((ch) => SUP[ch]).join('')}`;
}
const signed = (v, digits = 2) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(digits);

const BANDS = [
  [380, 'ուլտրամանուշակագույն (ՈՒՄ)'], [440, 'մանուշակագույն'], [485, 'կապույտ'],
  [500, 'երկնագույն'], [565, 'կանաչ'], [590, 'դեղին'], [625, 'նարնջագույն'],
  [760, 'կարմիր'], [Infinity, 'ինֆրակարմիր (ԻԿ)'],
];
const bandName = (lambda) => BANDS.find(([limit]) => lambda < limit)[1];

/** Beam colour [r, g, b]: the spectral colour; violet-ish for the invisible UV. */
function lightRGB(lambda) {
  if (lambda < 380) return [150, 95, 255];
  return wavelengthToRGB(clamp(lambda, 380, 780));
}

// ---------- Canvases ----------
function sceneLayout(W) {
  const H = Math.round(clamp(W * 0.5, 300, 420));
  const tx0 = Math.round(W * 0.1), tx1 = Math.round(W * 0.9);
  const ty0 = Math.round(H * 0.27), ty1 = Math.round(H * 0.63);
  const tw = tx1 - tx0, th = ty1 - ty0;
  return {
    W, H, tx0, tx1, ty0, ty1,
    xc: Math.round(tx0 + tw * 0.13),          // cathode face
    xa: Math.round(tx1 - tw * 0.13),          // anode face
    py0: ty0 + th * 0.16, py1: ty1 - th * 0.16,
    yw: H - 52,                                // bottom wire
    lamp: { x: W * 0.52, y: 26 },
  };
}

let L = null;
const scene = fluidCanvas(byId('scene'), {
  height: (w) => sceneLayout(w).H,
  onResize: () => { L = sceneLayout(scene.width); },
});
L = sceneLayout(scene.width);

const chartHeight = (w) => Math.round(clamp(w * 0.62, 220, 300));
const ivChart = fluidCanvas(byId('ivChart'), { height: chartHeight, onResize: () => { chartsDirty = true; } });
const ekChart = fluidCanvas(byId('ekChart'), { height: chartHeight, onResize: () => { chartsDirty = true; } });

// ---------- Controls ----------
const metalSelect = byId('metal');
for (const m of METALS) {
  metalSelect.add(new Option(`${m.name} (${m.symbol}) — ${m.A.toFixed(2)} էՎ`, m.id));
}
metalSelect.value = state.metal;

const lambdaCtl = bindRange('lambda', {
  format: (v) => `${v.toFixed(0)} նմ`,
  onInput: (v) => { state.lambda = v; sync(); },
});
const intensityCtl = bindRange('intensity', {
  format: (v) => `${v.toFixed(0)} %`,
  onInput: (v) => { state.intensity = v; sync(); },
});
const voltageCtl = bindRange('voltage', {
  format: (v) => `${signed(v)} Վ`,
  onInput: (v) => { state.U = v; sync(); },
});
const metalCtl = bindSelect('metal', { onChange: (v) => { state.metal = v; sync(); } });

bindPlayPause('playBtn', { onChange: (p) => { paused = p; } });
onClick('resetBtn', () => {
  Object.assign(state, INITIAL);
  lambdaCtl.set(state.lambda, { silent: true });
  intensityCtl.set(state.intensity, { silent: true });
  voltageCtl.set(state.U, { silent: true });
  metalCtl.input.value = state.metal;
  electrons.length = 0;
  sync();
});

function regimeText(r) {
  if (state.intensity === 0) {
    return '<b>Լույս չկա.</b> կաթոդը լուսավորված չէ, ֆոտոհոսանքը զրո է։';
  }
  if (!r.emits) {
    return `<b>Ֆոտոէֆեկտ չկա՝ ν &lt; ν₀</b> (λ &gt; λ₀ = ${r.lambda0.toFixed(0)} նմ)։ Ֆոտոնի էներգիան՝ ${r.E.toFixed(2)} էՎ, փոքր է ելքի աշխատանքից՝ ${metal().A.toFixed(2)} էՎ։ Ինտենսիվությունը մեծացնելը չի օգնի. փոքրացրեք ալիքի երկարությունը։`;
  }
  if (r.I === 0) {
    return `<b>Հոսանքը փակված է՝ U ≤ −U₀.</b> արգելակող դաշտը հետ է դարձնում նույնիսկ ամենաարագ էլեկտրոններին (U₀ = ${r.U0.toFixed(2)} Վ)։`;
  }
  if (state.U < 0) {
    return `<b>Արգելակող լարում՝ −U₀ &lt; U &lt; 0.</b> անոդին հասնում են միայն այն էլեկտրոնները, որոնց կինետիկ էներգիան մեծ է e|U| = ${Math.abs(state.U).toFixed(2)} էՎ-ից՝ պոկվածների ${(r.fraction * 100).toFixed(0)} %-ը։`;
  }
  return '<b>Հագեցման հոսանք.</b> բոլոր պոկված էլեկտրոնները հասնում են անոդին։ Հոսանքը համեմատական է լույսի ինտենսիվությանը և լարումը մեծացնելիս այլևս չի աճում։';
}

/** Readouts and texts ← state. */
function sync() {
  const r = result();
  setText('nuHint', `Հաճախություն՝ ν = c/λ = ${sci(r.nu)} Հց · ${bandName(state.lambda)}`);
  setText('eVal', `${r.E.toFixed(2)} էՎ`);
  setText('aVal', `${metal().A.toFixed(2)} էՎ`);
  setText('l0Val', `${r.lambda0.toFixed(0)} նմ`);
  setText('nu0Val', `${sci(r.nu0)} Հց`);
  setText('ekVal', r.emits ? `${r.ekMax.toFixed(2)} էՎ` : '—');
  setText('vVal', r.emits ? `${sci(r.vMax)} մ/վ` : '—');
  setText('u0Val', r.emits ? `${r.U0.toFixed(2)} Վ` : '—');
  setText('iVal', `${r.I.toFixed(2)} մկԱ`);
  setHTML('regime', regimeText(r));
  chartsDirty = true;
}

// ---------- Electrons ----------
function stepElectrons(dt) {
  const r = result();
  if (r.emits) {
    emitAcc += EMIT_RATE * (state.intensity / 100) * dt;
    while (emitAcc >= 1) {
      emitAcc -= 1;
      if (electrons.length < MAX_ELECTRONS) {
        electrons.push({ ...emitElectron(r.ekMax), y: rand(0.05, 0.95), vy: rand(-0.02, 0.02) });
      }
    }
  } else {
    emitAcc = 0;
  }
  for (let i = electrons.length - 1; i >= 0; i--) {
    const el = electrons[i];
    el.y = clamp(el.y + el.vy * dt, 0.02, 0.98);
    if (stepElectron(el, state.U, dt)) electrons.splice(i, 1);
  }
}

// ---------- Scene ----------
function drawScene() {
  const { ctx } = scene;
  const { W, H, tx0, tx1, ty0, ty1, xc, xa, py0, py1, yw, lamp } = L;
  const r = result();
  const k = state.intensity / 100;
  const rgb = lightRGB(state.lambda);
  const plateW = 7;

  clear(ctx, W, H, COLORS.canvasBg);

  // Light beam: lamp → cathode face.
  if (k > 0) {
    const g = ctx.createLinearGradient(lamp.x, lamp.y, xc, (py0 + py1) / 2);
    const a = Math.min(0.75, (0.08 + 0.4 * k) * C.beamGain);
    g.addColorStop(0, rgba(rgb, a));
    g.addColorStop(1, rgba(rgb, a * 0.75));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(lamp.x - 5, lamp.y - 5);
    ctx.lineTo(lamp.x + 5, lamp.y + 5);
    ctx.lineTo(xc, py1);
    ctx.lineTo(xc, py0);
    ctx.closePath();
    ctx.fill();

    // Photons: short streaks running down the beam.
    const shade = rgb.map((c) => Math.round(c * C.beamShade));
    const n = Math.round(4 + 14 * k);
    ctx.strokeStyle = rgba(shade, 0.9);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const t = (i * 0.618 + time * 0.8) % 1;
      const yEnd = lerp(py0 + 4, py1 - 4, (i * 0.371) % 1);
      const dx = xc - lamp.x, dy = yEnd - lamp.y;
      const len = Math.hypot(dx, dy);
      const px = lamp.x + dx * t, py = lamp.y + dy * t;
      ctx.moveTo(px, py);
      ctx.lineTo(px - (dx / len) * 9, py - (dy / len) * 9);
    }
    ctx.stroke();
  }

  // Lamp
  circle(ctx, lamp.x, lamp.y, 10, { fill: k > 0 ? rgba(rgb, 0.35 + 0.65 * k) : C.dial, stroke: C.wire, width: 2 });
  ctx.strokeStyle = C.wire;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  const back = Math.atan2(lamp.y - (py0 + py1) / 2, lamp.x - xc);
  ctx.arc(lamp.x, lamp.y, 14, back - 1.1, back + 1.1);
  ctx.stroke();
  text(ctx, `λ = ${state.lambda.toFixed(0)} նմ`, lamp.x + 26, lamp.y - 6, { color: COLORS.text, size: 12, family: 'mono' });
  const band = state.lambda < 380 ? 'ՈՒՄ' : state.lambda >= 760 ? 'ԻԿ' : bandName(state.lambda);
  text(ctx, band, lamp.x + 26, lamp.y + 10, { color: COLORS.text3, size: 11 });

  // Tube
  roundRect(ctx, tx0, ty0, tx1 - tx0, ty1 - ty0, (ty1 - ty0) / 2);
  ctx.fillStyle = C.glassFill;
  ctx.fill();

  // Electrons
  const er = W < 500 ? 2.2 : 2.8;
  ctx.fillStyle = C.electron;
  ctx.beginPath();
  for (const el of electrons) {
    const ex = lerp(xc + er, xa - er, clamp(el.x, 0, 1));
    const ey = lerp(py0, py1, el.y);
    ctx.moveTo(ex + er, ey);
    ctx.arc(ex, ey, er, 0, TAU);
  }
  ctx.fill();

  roundRect(ctx, tx0, ty0, tx1 - tx0, ty1 - ty0, (ty1 - ty0) / 2);
  ctx.strokeStyle = C.glass;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Circuit: cathode lead → battery → ammeter → anode lead.
  const xcl = xc - plateW / 2, xal = xa + plateW / 2;
  const xb = lerp(xcl, xal, 0.28), xm = lerp(xcl, xal, 0.72);
  const mr = 13;
  ctx.strokeStyle = C.wire;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(xcl, py1); ctx.lineTo(xcl, yw); ctx.lineTo(xb - 4, yw);
  ctx.moveTo(xb + 4, yw); ctx.lineTo(xm - mr, yw);
  ctx.moveTo(xm + mr, yw); ctx.lineTo(xal, yw); ctx.lineTo(xal, py1);
  ctx.stroke();

  // Electrodes
  ctx.fillStyle = C.metal;
  ctx.strokeStyle = C.metalEdge;
  ctx.lineWidth = 1;
  for (const x of [xc - plateW, xa]) {
    ctx.fillRect(x, py0, plateW, py1 - py0);
    ctx.strokeRect(x + 0.5, py0 + 0.5, plateW - 1, py1 - py0 - 1);
  }
  // Lit cathode face
  if (k > 0) line(ctx, xc, py0, xc, py1, { color: rgba(rgb, 0.5 + 0.5 * k), width: 2 });

  text(ctx, `կաթոդ (${metal().symbol})`, Math.max(xc, 44), ty0 - 12, { color: COLORS.text2, size: 12, align: 'center' });
  text(ctx, 'անոդ', xa, ty0 - 12, { color: COLORS.text2, size: 12, align: 'center' });

  // Battery: long thin plate = "+", short thick plate = "−". U > 0 ⇒ "+" faces the anode.
  const dir = Math.sign(state.U);
  const plusX = dir >= 0 ? xb + 4 : xb - 4;
  const minusX = dir >= 0 ? xb - 4 : xb + 4;
  const batColor = dir === 0 ? COLORS.text3 : COLORS.text;
  line(ctx, plusX, yw - 12, plusX, yw + 12, { color: batColor, width: 2 });
  line(ctx, minusX, yw - 6, minusX, yw + 6, { color: batColor, width: 4 });
  if (dir !== 0) {
    text(ctx, '+', plusX + (plusX > xb ? 9 : -9), yw - 12, { color: C.plus, size: 13, weight: 700, family: 'mono', align: 'center' });
    text(ctx, '−', minusX + (minusX > xb ? 9 : -9), yw - 12, { color: C.minus, size: 13, weight: 700, family: 'mono', align: 'center' });
    // Electrode polarity next to the leads
    const sign = (positive) => ({ s: positive ? '+' : '−', color: positive ? C.plus : C.minus });
    const cs = sign(dir < 0), as = sign(dir > 0);
    text(ctx, cs.s, xcl - 11, ty1 + 14, { color: cs.color, size: 15, weight: 700, family: 'mono', align: 'center' });
    text(ctx, as.s, xal + 11, ty1 + 14, { color: as.color, size: 15, weight: 700, family: 'mono', align: 'center' });
  }
  text(ctx, `U = ${signed(state.U)} Վ`, xb, yw + 30, { color: COLORS.text, size: 11, family: 'mono', align: 'center' });

  // Ammeter
  circle(ctx, xm, yw, mr, { fill: C.dial, stroke: C.wire, width: 2 });
  text(ctx, 'A', xm, yw + 0.5, { color: r.I > 0 ? COLORS.text : COLORS.text3, size: 13, weight: 700, family: 'mono', align: 'center' });
  text(ctx, `I = ${r.I.toFixed(2)} մկԱ`, xm, yw + 30, { color: r.I > 0 ? COLORS.text : COLORS.text3, size: 11, family: 'mono', align: 'center' });
}

// ---------- Charts ----------
const M = { l: 40, r: 14, t: 30, b: 40 };

/** Clears the chart and returns the plot rectangle. */
function plotArea(view) {
  const { ctx, width: W, height: H } = view;
  clear(ctx, W, H, COLORS.canvasBg);
  return { ctx, W, H, x0: M.l, y0: M.t, pw: W - M.l - M.r, ph: H - M.t - M.b };
}

function marker(ctx, x, y) {
  circle(ctx, x, y, 5.5, { fill: C.point, stroke: COLORS.canvasBg, width: 2 });
}

function drawIV() {
  if (!ivChart.width) return;
  const { ctx, W, H, x0, y0, pw, ph } = plotArea(ivChart);
  const r = result();
  const I_TOP = I_FULL * 1.08;
  const X = (u) => x0 + ((u + U_MAX) / (2 * U_MAX)) * pw;
  const Y = (i) => y0 + ph - (i / I_TOP) * ph;
  const yb = y0 + ph;

  for (let u = -U_MAX; u <= U_MAX; u++) {
    line(ctx, X(u), y0, X(u), yb, { color: COLORS.grid, width: 1 });
    if (pw > 300 || u % 2 !== 0 || u === 0) {
      text(ctx, u < 0 ? `−${-u}` : String(u), X(u), yb + 7, { color: COLORS.text3, size: 10, family: 'mono', align: 'center', baseline: 'top' });
    }
  }
  for (let i = 0; i <= I_FULL; i += 2) {
    line(ctx, x0, Y(i), x0 + pw, Y(i), { color: COLORS.grid, width: 1 });
    if (i > 0) text(ctx, String(i), x0 - 7, Y(i), { color: COLORS.text3, size: 10, family: 'mono', align: 'right' });
  }
  line(ctx, x0, yb, x0 + pw + 5, yb, { color: COLORS.axis, width: 1.2 });
  line(ctx, X(0), y0 - 8, X(0), yb, { color: COLORS.axis, width: 1.2 });
  text(ctx, 'I, մկԱ', X(0) + 7, 13, { color: COLORS.text2, size: 11, family: 'mono' });
  text(ctx, 'U, Վ', x0 + pw, H - 10, { color: COLORS.text2, size: 11, family: 'mono', align: 'right' });

  if (r.emits && r.iSat > 0) {
    // Saturation level
    line(ctx, x0, Y(r.iSat), X(0), Y(r.iSat), { color: alpha(C.curve, 0.5), width: 1, dash: [3, 4] });
    text(ctx, 'Iհ', x0 + 5, Y(r.iSat) - 8, { color: C.curve, size: 11, family: 'mono' });
    // Stopping voltage
    if (r.U0 <= U_MAX) {
      const xs = X(-r.U0);
      line(ctx, xs, yb, xs, yb - ph * 0.42, { color: COLORS.text3, width: 1, dash: [3, 3] });
      const flip = xs - 34 < x0;
      text(ctx, '−U₀', xs + (flip ? 5 : -5), yb - ph * 0.42 + 6, { color: COLORS.text2, size: 11, family: 'mono', align: flip ? 'left' : 'right' });
      circle(ctx, xs, yb, 3, { fill: COLORS.text2 });
    }
  } else if (state.intensity > 0) {
    text(ctx, 'ֆոտոէֆեկտ չկա (ν < ν₀)', x0 + pw * 0.25, y0 + ph * 0.45, { color: COLORS.text3, size: 12, align: 'center' });
  }

  // I(U): piecewise linear, see physics.js
  const k = state.intensity / 100;
  const us = [-U_MAX, Math.max(-U_MAX, -r.U0), 0, U_MAX];
  ctx.strokeStyle = C.curve;
  ctx.lineWidth = 2.4;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  us.forEach((u, i) => {
    const y = Y(photocurrent(u, r.ekMax, k));
    if (i) ctx.lineTo(X(u), y); else ctx.moveTo(X(u), y);
  });
  ctx.stroke();

  const px = X(state.U), py = Y(r.I);
  if (r.I > 0) {
    line(ctx, px, py, px, yb, { color: alpha(C.point, 0.55), width: 1, dash: [2, 3] });
    line(ctx, px, py, X(0), py, { color: alpha(C.point, 0.55), width: 1, dash: [2, 3] });
  }
  marker(ctx, px, py);
}

function drawEk() {
  if (!ekChart.width) return;
  const { ctx, W, H, x0, y0, pw, ph } = plotArea(ekChart);
  const r = result();
  const N_MAX = 30;                    // frequency axis, 10¹⁴ Hz (λ = 100 nm ↔ 30·10¹⁴ Hz)
  const E_MIN = -6, E_MAX = 11;        // eV
  const X = (n) => x0 + (n / N_MAX) * pw;
  const Y = (e) => y0 + ((E_MAX - e) / (E_MAX - E_MIN)) * ph;
  const yb = y0 + ph;
  const ek = (n, A) => H_EV * n * 1e14 - A;

  for (let n = 0; n <= N_MAX; n += 5) {
    line(ctx, X(n), y0, X(n), yb, { color: COLORS.grid, width: 1 });
    if (n > 0) text(ctx, String(n), X(n), yb + 7, { color: COLORS.text3, size: 10, family: 'mono', align: 'center', baseline: 'top' });
  }
  for (let e = E_MIN; e <= 10; e += 2) {
    line(ctx, x0, Y(e), x0 + pw, Y(e), { color: COLORS.grid, width: 1 });
    text(ctx, e < 0 ? `−${-e}` : String(e), x0 - 7, Y(e), { color: COLORS.text3, size: 10, family: 'mono', align: 'right' });
  }
  line(ctx, x0, y0 - 8, x0, yb, { color: COLORS.axis, width: 1.2 });
  line(ctx, x0, Y(0), x0 + pw + 5, Y(0), { color: COLORS.axis, width: 1.2 });
  text(ctx, 'Eկ max, էՎ', x0 + 7, 13, { color: COLORS.text2, size: 11, family: 'mono' });
  text(ctx, 'ν, 10¹⁴ Հց', x0 + pw, H - 10, { color: COLORS.text2, size: 11, family: 'mono', align: 'right' });

  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, pw, ph);
  ctx.clip();
  const A = metal().A;
  // Other metals: parallel lines (same slope h)
  for (const m of METALS) {
    if (m.id === state.metal) continue;
    line(ctx, X(0), Y(ek(0, m.A)), X(N_MAX), Y(ek(N_MAX, m.A)), { color: alpha(C.curve, 0.22), width: 1 });
  }
  // Selected metal: dashed below the threshold, solid above
  const n0 = r.nu0 / 1e14;
  line(ctx, X(0), Y(-A), X(n0), Y(0), { color: alpha(C.curve, 0.8), width: 1.4, dash: [5, 4] });
  line(ctx, X(n0), Y(0), X(N_MAX), Y(ek(N_MAX, A)), { color: C.curve, width: 2.4, cap: 'round' });
  ctx.restore();

  circle(ctx, X(n0), Y(0), 3, { fill: COLORS.text2 });
  text(ctx, 'ν₀', X(n0) + 5, Y(0) + 11, { color: COLORS.text2, size: 11, family: 'mono' });
  circle(ctx, x0, Y(-A), 3, { fill: COLORS.text2 });
  text(ctx, '−A', x0 + 7, Y(-A) + 10, { color: COLORS.text2, size: 11, family: 'mono' });
  text(ctx, `${metal().name} · թեքությունը՝ h`, x0 + pw - 2, 13, { color: C.curve, size: 11, align: 'right' });

  // Current light
  const n = r.nu / 1e14;
  const px = X(n), py = Y(r.ekMax);
  if (r.emits) {
    line(ctx, px, py, px, Y(0), { color: alpha(C.point, 0.55), width: 1, dash: [2, 3] });
    line(ctx, px, py, x0, py, { color: alpha(C.point, 0.55), width: 1, dash: [2, 3] });
    marker(ctx, px, py);
  } else {
    circle(ctx, px, py, 5, { fill: COLORS.canvasBg, stroke: C.point, width: 2 });
  }
}

// ---------- Main loop ----------
startLoop((dt) => {
  if (!paused) {
    time += dt;
    stepElectrons(dt);
  }
  drawScene();
  if (chartsDirty) {
    chartsDirty = false;
    drawIV();
    drawEk();
  }
});

onThemeChange(() => { chartsDirty = true; });
fontsReady().then(() => { chartsDirty = true; });
sync();
