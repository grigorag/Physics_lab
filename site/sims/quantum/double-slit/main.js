// Double-slit experiment with single particles.
//
// One dark canvas, three zones sharing the same horizontal screen coordinate x:
//   1. scheme: source → barrier with two slits (propagation is downwards;
//      the slit geometry is not to scale),
//   2. the detection screen seen face-on: every detected particle is one dot,
//   3. histogram of hits vs. x with the theoretical distribution.
// The landing points are sampled from the quantum probability density
// (physics.js); the particles are emitted as a Poisson stream.

import { fluidCanvas } from '../../../assets/js/core/canvas.js';
import { startLoop } from '../../../assets/js/core/loop.js';
import {
  bindRange, bindCheckbox, bindSegmented, bindPlayPause, onClick,
} from '../../../assets/js/core/controls.js';
import { byId, setText } from '../../../assets/js/core/dom.js';
import { clear, line, circle, text, roundRect } from '../../../assets/js/core/draw.js';
import { DARK, alpha, fontsReady } from '../../../assets/js/core/theme.js';
import { clamp, lerp, TAU } from '../../../assets/js/core/math.js';
import { wavelengthToRGB, rgba } from '../../../assets/js/core/color.js';
import {
  electronWavelength, electronSpeed, fringeSpacing, envelopeHalfWidth,
  screenHalfWidth, niceCeil, createSampler,
} from './physics.js';

// ---------- Constants ----------
const FINE_BINS = 720;                 // fine histogram; shown bins are groups of these
const GROUPS = [1, 2, 3, 4, 5, 6, 8, 9, 10, 12, 15, 16, 18, 20, 24];
const MAX_STORED = 300000;             // hits kept for repainting the screen after a resize
const FLIGHT_TIME = 0.42;              // s, source → screen animation
const FLIGHT_SPLIT = 0.4;              // part of the flight spent before the barrier
const FLIGHTS_PER_SECOND = 24;         // at high rates only this many particles are animated
const ELECTRON_RGB = [165, 228, 255];

const C = {
  wall: '#7d8db3',
  shutter: DARK.red,
  label: DARK.text2,
  faint: DARK.text3,
  theory: '#f2f4ff',
  stripBg: '#04060b',
  stripRim: 'rgba(120,140,200,0.35)',
  detector: '#3a4566',
  detectorOn: DARK.amber,
};

// ---------- State ----------
let kind = 'photon';
let slits = 'both';
let detector = false;
let paused = false;
let showTheory = true;

let p = null;            // { lambda, d, a, L } in SI
let W = 1;               // half-width of the shown screen region, m
let sampler = null;
let pdfMax = 1;
let dotRGB = [255, 180, 0];

const fine = new Uint32Array(FINE_BINS);
const hitX = new Float32Array(MAX_STORED);   // x / W, −1..1
const hitY = new Float32Array(MAX_STORED);   // 0..1 across the strip height
let total = 0;
let viaLeft = 0, viaRight = 0;

let flights = [];        // { x, y, slit, t }
let flashes = [];        // { x, y, t }   (x = x/W, y = 0..1)
let sourceGlow = 0;
const detGlow = [0, 0];
let emitAcc = 0;
let statsDirty = true;

// ---------- Canvas ----------
const view = fluidCanvas(byId('scene'), {
  height: (w) => (w < 560 ? 440 : 480),
  onResize: () => { repaintDots(); },
});
const { ctx } = view;
const layer = document.createElement('canvas');   // accumulated dots of the screen
const lctx = layer.getContext('2d');

function layout() {
  const w = view.width, h = view.height;
  const narrow = w < 560;
  const x0 = narrow ? 34 : 46, x1 = w - (narrow ? 10 : 16);
  const srcY = 24;
  const barY = narrow ? 84 : 90;
  const stripY = narrow ? 138 : 150;
  const stripH = narrow ? 84 : 96;
  const histY = stripY + stripH + 30;
  const histB = h - 30;
  return {
    w, h, narrow, x0, x1, cx: (x0 + x1) / 2, plotW: x1 - x0,
    srcY, barY, stripY, stripH, histY, histB,
    sepPx: lerp(30, 84, (sSep.value - 0.1) / 0.4),
    slitPx: lerp(5, 13, (sSlit.value - 0.02) / 0.06),
  };
}

const xToPx = (g, xr) => g.x0 + (xr + 1) * 0.5 * g.plotW;   // xr = x / W

// ---------- Units and formatting ----------
/** Length unit for the screen axis: micrometres for narrow patterns, else millimetres. */
const screenUnit = () => (W < 1e-3 ? { name: 'մկմ', scale: 1e-6 } : { name: 'մմ', scale: 1e-3 });
const sig3 = (v) => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2));
const trimNum = (v) => String(Number(v.toPrecision(6)));
function fmtLen(m) {
  const u = screenUnit();
  return `${sig3(m / u.scale)} ${u.name}`;
}
const fmtCount = (n) => n.toLocaleString('en-US').replace(/,/g, ' ');

// Slit sizes: the sliders are in millimetres for photons and in tens of
// micrometres for electrons (their wavelength is thousands of times smaller).
const slitScale = () => (kind === 'photon' ? 1e-3 : 1e-5);
const fmtSlit = (v) => (kind === 'photon' ? `${v.toFixed(2)} մմ` : `${(v * 10).toFixed(1)} մկմ`);

const rateOf = (s) => Number(Math.pow(10, (s / 100) * 3.7).toPrecision(2));

// ---------- Controls ----------
const sWl = bindRange('wl', { format: (v) => `${v.toFixed(0)} նմ`, onInput: rebuild });
const sVolt = bindRange('volt', { format: (v) => `${v.toFixed(0)} Վ`, onInput: rebuild });
const sSep = bindRange('sep', { format: fmtSlit, onInput: rebuild });
const sSlit = bindRange('slitW', { format: fmtSlit, onInput: rebuild });
const sDist = bindRange('dist', { format: (v) => `${v.toFixed(1)} մ`, onInput: rebuild });
const sRate = bindRange('rate', {
  format: (s) => { const r = rateOf(s); return `${r < 10 ? r.toFixed(1) : r} մասն./վ`; },
});

bindSegmented('kind', {
  onChange: (v) => {
    kind = v;
    byId('wlField').hidden = kind !== 'photon';
    byId('uField').hidden = kind !== 'electron';
    byId('speedRow').hidden = kind !== 'electron';
    setText('lamLabel', kind === 'photon' ? 'Ալիքի երկարություն λ' : 'Դը Բրոյլի ալիքի երկարություն λ');
    sSep.render();
    sSlit.render();
    rebuild();
  },
});
bindSegmented('slits', { onChange: (v) => { slits = v; rebuild(); } });
bindCheckbox('detector', { onChange: (v) => { detector = v; rebuild(); } });
bindCheckbox('theory', { onChange: (v) => { showTheory = v; } });
bindPlayPause('playBtn', { paused, onChange: (v) => { paused = v; } });
onClick('addBtn', () => { for (let i = 0; i < 1000; i++) detect(sampler.sample(), Math.random()); });
onClick('clearBtn', clearHits);

// ---------- Model ----------
function clearHits() {
  fine.fill(0);
  total = 0;
  viaLeft = viaRight = 0;
  flights = [];
  flashes = [];
  emitAcc = 0;
  statsDirty = true;
  repaintDots();
}

/** New parameters → new distribution; the old hits no longer belong to it. */
function rebuild() {
  const lambda = kind === 'photon' ? sWl.value * 1e-9 : electronWavelength(sVolt.value);
  p = { lambda, d: sSep.value * slitScale(), a: sSlit.value * slitScale(), L: sDist.value };
  W = screenHalfWidth(p);
  sampler = createSampler(p, slits, detector, W);
  pdfMax = 0;
  for (let i = 0; i <= 2000; i++) pdfMax = Math.max(pdfMax, sampler.pdf(-W + (i / 1000) * W));

  if (kind === 'photon') {
    // spectral colour, lifted a little towards white so that dim violet/red stay visible
    dotRGB = wavelengthToRGB(sWl.value).map((c) => Math.round(c + (255 - c) * 0.22));
  } else {
    dotRGB = ELECTRON_RGB;
  }
  byId('dotSwatch').style.setProperty('--c', rgba(dotRGB));
  clearHits();
  renderStatic();
}

/** Registers one detected particle. hit = { x, slit }, yf = 0..1 across the strip. */
function detect(hit, yf) {
  const xr = hit.x / W;
  const bin = clamp(Math.floor((xr + 1) * 0.5 * FINE_BINS), 0, FINE_BINS - 1);
  fine[bin]++;
  if (total < MAX_STORED) { hitX[total] = xr; hitY[total] = yf; }
  total++;
  if (hit.slit === 1) viaLeft++;
  else if (hit.slit === 2) viaRight++;
  paintDot(xr, yf, false);
  statsDirty = true;
}

/** Poisson-distributed number of emissions for the expected value `mean`. */
function poisson(mean) {
  if (mean <= 0) return 0;
  if (mean > 30) {
    const g = Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(TAU * Math.random());
    return Math.max(0, Math.round(mean + Math.sqrt(mean) * g));
  }
  const limit = Math.exp(-mean);
  let k = 0, prod = Math.random();
  while (prod > limit) { k++; prod *= Math.random(); }
  return k;
}

function step(dt) {
  if (!paused) {
    const rate = rateOf(sRate.value);
    const n = poisson(rate * dt);
    const animateChance = Math.min(1, FLIGHTS_PER_SECOND / rate);
    for (let i = 0; i < n; i++) {
      const hit = sampler.sample();
      const yf = Math.random();
      if (Math.random() < animateChance) {
        flights.push({ x: hit.x, slit: hit.slit, y: yf, t: 0 });
        sourceGlow = 1;
      } else {
        detect(hit, yf);
        if (detector && hit.slit) detGlow[hit.slit - 1] = Math.max(detGlow[hit.slit - 1], 0.6);
      }
    }
  }

  // particles in flight (they finish their flight even when emission is paused)
  for (const f of flights) {
    const before = f.t;
    f.t += dt / FLIGHT_TIME;
    if (detector && f.slit && before < FLIGHT_SPLIT && f.t >= FLIGHT_SPLIT) detGlow[f.slit - 1] = 1;
    if (f.t >= 1) {
      detect(f, f.y);
      flashes.push({ x: f.x / W, y: f.y, t: 0 });
    }
  }
  flights = flights.filter((f) => f.t < 1);
  for (const f of flashes) f.t += dt / 0.45;
  flashes = flashes.filter((f) => f.t < 1);
  sourceGlow = Math.max(0, sourceGlow - dt / 0.25);
  detGlow[0] = Math.max(0, detGlow[0] - dt / 0.3);
  detGlow[1] = Math.max(0, detGlow[1] - dt / 0.3);
}

// ---------- Dots layer ----------
function paintDot(xr, yf, small) {
  const x = (xr + 1) * 0.5 * (layer.width / view.dpr);
  const y = 3 + yf * (layer.height / view.dpr - 6);
  if (small) {
    lctx.fillRect(x - 1, y - 1, 2, 2);
  } else {
    lctx.beginPath();
    lctx.arc(x, y, 1.5, 0, TAU);
    lctx.fill();
  }
}

function repaintDots() {
  const g = layout();
  layer.width = Math.max(1, Math.round(g.plotW * view.dpr));
  layer.height = Math.max(1, Math.round(g.stripH * view.dpr));
  lctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  lctx.globalCompositeOperation = 'lighter';
  lctx.fillStyle = rgba(dotRGB, 0.85);
  const n = Math.min(total, MAX_STORED);
  const small = n > 30000;
  for (let i = 0; i < n; i++) paintDot(hitX[i], hitY[i], small);
}

// ---------- Drawing ----------
function drawScheme(g) {
  const { cx, srcY, barY, stripY, x0, x1 } = g;
  const xs = [cx - g.sepPx / 2, cx + g.sepPx / 2];
  const open = [slits !== 'right', slits !== 'left'];
  const col = rgba(dotRGB);

  // source
  if (sourceGlow > 0) {
    const r = 26;
    const grad = ctx.createRadialGradient(cx, srcY + 12, 0, cx, srcY + 12, r);
    grad.addColorStop(0, rgba(dotRGB, 0.55 * sourceGlow));
    grad.addColorStop(1, rgba(dotRGB, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(cx - r, srcY + 12 - r, 2 * r, 2 * r);
  }
  roundRect(ctx, cx - 19, srcY - 12, 38, 20, 5);
  ctx.fillStyle = '#1b2236';
  ctx.fill();
  ctx.strokeStyle = C.wall;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 6, srcY + 8); ctx.lineTo(cx - 4, srcY + 14); ctx.lineTo(cx + 4, srcY + 14); ctx.lineTo(cx + 6, srcY + 8);
  ctx.stroke();
  circle(ctx, cx, srcY - 2, 3.5, { fill: col });
  text(ctx, kind === 'photon' ? 'ֆոտոնների աղբյուր' : 'էլեկտրոնների աղբյուր', cx - 28, srcY - 2,
    { color: C.label, size: 11, align: 'right' });

  // barrier with the two slits
  ctx.fillStyle = C.wall;
  let from = x0;
  for (let i = 0; i < 2; i++) {
    ctx.fillRect(from, barY - 3, xs[i] - g.slitPx / 2 - from, 6);
    from = xs[i] + g.slitPx / 2;
  }
  ctx.fillRect(from, barY - 3, x1 - from, 6);
  for (let i = 0; i < 2; i++) {
    if (open[i]) continue;
    ctx.fillStyle = C.shutter;
    ctx.fillRect(xs[i] - g.slitPx / 2 - 2, barY - 5, g.slitPx + 4, 10);
  }
  text(ctx, 'պատնեշ', x0 + 2, barY - 13, { color: C.label, size: 11 });

  // d dimension above the barrier
  const dy = barY - 11;
  line(ctx, xs[0], dy, xs[1], dy, { color: C.faint, width: 1 });
  line(ctx, xs[0], dy - 3, xs[0], dy + 3, { color: C.faint, width: 1 });
  line(ctx, xs[1], dy - 3, xs[1], dy + 3, { color: C.faint, width: 1 });
  text(ctx, 'd', xs[1] + 7, dy - 1, { color: C.label, size: 11, style: 'italic' });

  // which-slit detectors
  if (detector) {
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const bx = xs[i] + side * (g.slitPx / 2 + 13);
      const by = barY + 12;
      const glow = detGlow[i];
      roundRect(ctx, bx - 8, by - 5, 16, 10, 3);
      ctx.fillStyle = glow > 0 ? alpha(C.detectorOn, 0.25 + 0.75 * glow) : C.detector;
      ctx.fill();
      ctx.strokeStyle = glow > 0 ? C.detectorOn : C.wall;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      line(ctx, bx - side * 8, by, xs[i] + side * 2, by, { color: glow > 0 ? C.detectorOn : C.wall, width: 1.2 });
    }
    text(ctx, 'դետեկտոր', xs[0] - g.slitPx / 2 - 27, barY + 13, { color: C.label, size: 11, align: 'right' });
  }

  // L dimension
  const lx = x1 - 8;
  line(ctx, lx, barY + 5, lx, stripY - 2, { color: C.faint, width: 1 });
  line(ctx, lx - 3, barY + 5, lx + 3, barY + 5, { color: C.faint, width: 1 });
  line(ctx, lx - 3, stripY - 2, lx + 3, stripY - 2, { color: C.faint, width: 1 });
  text(ctx, `L = ${sDist.value.toFixed(1)} մ`, lx - 7, (barY + stripY) / 2 + 2, { color: C.label, size: 11, align: 'right' });
  text(ctx, 'էկրան', x0 + 2, stripY - 9, { color: C.label, size: 11 });

  return xs;
}

/** Position of a flying particle at progress q (0..1) when it goes through the slit at sx. */
function flightPos(g, sx, f, q) {
  const ax = g.cx, ay = g.srcY + 15;
  if (q <= FLIGHT_SPLIT) {
    const s = q / FLIGHT_SPLIT;
    return [lerp(ax, sx, s), lerp(ay, g.barY, s)];
  }
  const s = (q - FLIGHT_SPLIT) / (1 - FLIGHT_SPLIT);
  const ex = xToPx(g, f.x / W), ey = g.stripY + 3 + f.y * (g.stripH - 6);
  return [lerp(sx, ex, s), lerp(g.barY, ey, s)];
}

function drawFlights(g, xs) {
  ctx.save();
  ctx.lineCap = 'round';
  for (const f of flights) {
    // a known slit → one path; unknown (both slits, nobody looks) → both paths, fainter
    const via = f.slit ? [xs[f.slit - 1]] : xs;
    const a = f.slit ? 1 : 0.5;
    for (const sx of via) {
      const q0 = Math.max(0, f.t - 0.12);
      const [hx, hy] = flightPos(g, sx, f, f.t);
      const [tx, ty] = flightPos(g, sx, f, q0);
      ctx.strokeStyle = rgba(dotRGB, 0.35 * a);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      if (q0 < FLIGHT_SPLIT && f.t > FLIGHT_SPLIT) ctx.lineTo(sx, g.barY);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      circle(ctx, hx, hy, 2.6, { fill: rgba(dotRGB, a) });
    }
  }
  ctx.restore();
}

function drawStrip(g) {
  ctx.fillStyle = C.stripBg;
  ctx.fillRect(g.x0, g.stripY, g.plotW, g.stripH);
  ctx.drawImage(layer, g.x0, g.stripY, g.plotW, g.stripH);
  ctx.strokeStyle = C.stripRim;
  ctx.lineWidth = 1;
  ctx.strokeRect(g.x0 + 0.5, g.stripY + 0.5, g.plotW - 1, g.stripH - 1);

  for (const f of flashes) {
    const x = xToPx(g, f.x), y = g.stripY + 3 + f.y * (g.stripH - 6);
    circle(ctx, x, y, 2 + 9 * f.t, { stroke: rgba(dotRGB, 0.9 * (1 - f.t)), width: 1.5 });
    circle(ctx, x, y, 2.4, { fill: `rgba(255,255,255,${0.9 * (1 - f.t)})` });
  }
}

function drawHistogram(g) {
  const { x0, x1, plotW, histY, histB } = g;
  const hh = histB - histY;
  const unit = screenUnit();

  // shown bins: groups of fine bins, each at least ~3.6 px wide
  const group = GROUPS.find((n) => (plotW * n) / FINE_BINS >= 3.6) ?? 24;
  const nb = FINE_BINS / group;
  const binPx = plotW / nb;
  const binW = (2 * W) / nb;

  const counts = new Float64Array(nb);
  let maxCount = 0;
  for (let b = 0; b < nb; b++) {
    let c = 0;
    for (let k = b * group; k < (b + 1) * group; k++) c += fine[k];
    counts[b] = c;
    if (c > maxCount) maxCount = c;
  }
  // vertical scale: counts per bin; the theory curve is the expected count N·P(x)·Δ
  const theoryPeak = total * pdfMax * binW;
  const yMax = total > 0 ? niceCeil(Math.max(maxCount, showTheory ? theoryPeak : 0, 4)) : 1;
  const yPx = (c) => histB - (c / yMax) * hh;

  // grid and axes
  for (const frac of [0.5, 1]) {
    line(ctx, x0, histB - frac * hh, x1, histB - frac * hh, { color: DARK.grid, width: 1 });
    if (total > 0) {
      text(ctx, trimNum(yMax * frac), x0 - 5, histB - frac * hh, { color: C.faint, size: 10, family: 'mono', align: 'right' });
    }
  }
  text(ctx, '0', x0 - 5, histB, { color: C.faint, size: 10, family: 'mono', align: 'right' });

  // bars
  ctx.fillStyle = rgba(dotRGB, 0.6);
  const gap = binPx > 5 ? 1 : 0.5;
  for (let b = 0; b < nb; b++) {
    if (!counts[b]) continue;
    const y = yPx(counts[b]);
    ctx.fillRect(x0 + b * binPx + gap / 2, y, binPx - gap, histB - y);
  }

  // theoretical distribution
  if (showTheory) {
    const k = total > 0 ? total * binW : 0.8 / pdfMax;   // no hits yet → just the shape
    ctx.beginPath();
    for (let px = 0; px <= plotW; px += 1) {
      const x = -W + (px / plotW) * 2 * W;
      const y = yPx(sampler.pdf(x) * k);
      if (px === 0) ctx.moveTo(x0 + px, y); else ctx.lineTo(x0 + px, y);
    }
    ctx.strokeStyle = C.theory;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  // x axis with ticks
  line(ctx, x0, histB + 0.5, x1, histB + 0.5, { color: DARK.axis, width: 1 });
  line(ctx, x0 - 0.5, histY, x0 - 0.5, histB, { color: DARK.axis, width: 1 });
  for (let i = -4; i <= 4; i++) {
    const x = xToPx(g, i / 4);
    const major = i % 2 === 0;
    line(ctx, x, histB, x, histB + (major ? 5 : 3), { color: DARK.axis, width: 1 });
    if (!major) continue;
    const v = ((i / 4) * W) / unit.scale;
    const align = i === -4 ? 'left' : i === 4 ? 'right' : 'center';
    const label = i === 4 ? `${trimNum(v)} ${unit.name}` : i === 0 ? 'x = 0' : trimNum(v);
    text(ctx, label, i === -4 ? x - 4 : x, histB + 15, { color: C.label, size: 10.5, family: 'mono', align });
  }

  // Δx bracket between the central and the next maximum
  const dxPx = (fringeSpacing(p) / W) * 0.5 * plotW;
  const by = g.stripY + g.stripH + 13;
  if (slits === 'both' && !detector && dxPx >= 14) {
    const a = xToPx(g, 0), b = a + dxPx;
    line(ctx, a, by, b, by, { color: C.theory, width: 1.2 });
    line(ctx, a, by - 4, a, by + 4, { color: C.theory, width: 1.2 });
    line(ctx, b, by - 4, b, by + 4, { color: C.theory, width: 1.2 });
    text(ctx, `Δx = ${fmtLen(fringeSpacing(p))}`, b + 7, by, { color: C.theory, size: 11 });
  }
  if (!g.narrow) {
    text(ctx, 'հարվածների թիվը', x0 + 2, by, { color: C.label, size: 11 });
  }
}

function draw() {
  const g = layout();
  clear(ctx, g.w, g.h, DARK.canvasBg);
  const xs = drawScheme(g);
  drawStrip(g);
  drawFlights(g, xs);
  drawHistogram(g);
}

// ---------- Readouts ----------
const MODE_TEXT = {
  wave: '<b>Երկու ճեղքն էլ բաց են, դետեկտորն անջատված է։</b> Հնարավոր չէ ասել, թե որ ճեղքով է անցել մասնիկը, և կետերն աստիճանաբար կազմում են ինտերֆերենցային շերտեր։',
  watched: '<b>Դետեկտորը գրանցում է, թե որ ճեղքով է անցնում յուրաքանչյուր մասնիկ։</b> Ինտերֆերենցային շերտերն անհետանում են. մնում է երկու ճեղքերի դիֆրակցիոն պատկերների գումարը։',
  single: '<b>Բաց է միայն մեկ ճեղքը։</b> Ստացվում է մեկ ճեղքի լայն դիֆրակցիոն պատկեր՝ առանց ինտերֆերենցային շերտերի։',
};

/** Values that depend only on the parameters. */
function renderStatic() {
  const nm = p.lambda * 1e9;
  setText('lamVal', kind === 'photon' ? `${nm.toFixed(0)} նմ` : `${nm.toPrecision(3)} նմ`);
  if (kind === 'electron') {
    setText('speedVal', `${(electronSpeed(sVolt.value) / 1e7).toFixed(2)}·10⁷ մ/վ`);
  }
  setText('dxVal', fmtLen(fringeSpacing(p)));
  setText('envVal', fmtLen(envelopeHalfWidth(p)));
  byId('modeBox').innerHTML = slits !== 'both' ? MODE_TEXT.single : detector ? MODE_TEXT.watched : MODE_TEXT.wave;
}

function renderCounts() {
  statsDirty = false;
  setText('nVal', fmtCount(total));
  const known = slits !== 'both' || detector;
  setText('leftVal', known ? fmtCount(viaLeft) : 'անհայտ է');
  setText('rightVal', known ? fmtCount(viaRight) : 'անհայտ է');
}

// ---------- Start ----------
rebuild();
fontsReady().then(draw);
startLoop((dt) => {
  step(dt);
  draw();
  if (statsDirty) renderCounts();
});
