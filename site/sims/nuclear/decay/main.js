// Law of radioactive decay — a sample of N₀ nuclei that decay at random.
//
// Internally time is counted in half-lives of the parent (τ = t/T, see
// physics.js). For the real isotopes one half-life takes SEC_PER_T seconds of
// real time at speed ×1; the custom isotope runs in real time (T in seconds).

import { fluidCanvas } from '../../../assets/js/core/canvas.js';
import {
  bindRange, bindCheckbox, bindSelect, bindSegmented, bindPlayPause, onClick,
} from '../../../assets/js/core/controls.js';
import { byId } from '../../../assets/js/core/dom.js';
import { startLoop } from '../../../assets/js/core/loop.js';
import { clear, line, text, circle } from '../../../assets/js/core/draw.js';
import { COLORS, themed, alpha, onThemeChange, fontsReady, font } from '../../../assets/js/core/theme.js';
import { clamp } from '../../../assets/js/core/math.js';
import {
  LN2, ISOTOPES, PARENT, DAUGHTER, createSample, step, theory, peakActivity, ageFromFraction,
} from './physics.js';
import { fmtSig, sup } from './format.js';

const SEC_PER_T = 4;       // real seconds per half-life at ×1 (real isotopes)
const FLASH = 0.7;         // flash duration of a decaying nucleus, real s
const BINS_PER_WINDOW = 30;

const C = themed((light) => ({
  parent: COLORS.amber,
  daughter: COLORS.pink,
  stable: COLORS.blue,
  flash: light ? '#ff7a00' : '#fff1b8',
  act: COLORS.purple,
  age: COLORS.green,
}));

// ---------- State ----------
const cfg = {
  iso: 'co60', customT: 5, n0: 1600, chain: false, r: 0.5,
  speed: 1, theory: true, activity: true, log: false, ageF: 0.25,
};

let sample = null;
let hist = [];           // { tau, n1, n2, n3 }
let bins = [];           // decays per histogram bin
let binW = 0.2;          // bin width, half-lives
let baseWindow = 6;      // chart window, half-lives
let aTop = LN2;          // activity at the top of the chart, units of N₀/T
let clock = 0;           // real time, s (for flashes)
let chartDirty = true;

const isotope = () => ISOTOPES[cfg.iso];
const isCustom = () => cfg.iso === 'custom';
const halfLife = () => (isCustom() ? cfg.customT : isotope().T);     // in unit()
const unit = () => isotope().unit;
const secPerT = () => (isCustom() ? cfg.customT : SEC_PER_T);
const done = () => sample.n1 === 0 && sample.n2 === 0;

// ---------- Canvases ----------
const scene = fluidCanvas(byId('scene'), {
  height: (w) => Math.round(clamp(w * 0.42, 260, 380)),
  onResize: layoutScene,
});
const chart = fluidCanvas(byId('chart'), {
  height: (w) => Math.round(clamp(w * 0.5, 250, 340)),
  onResize: () => { chartDirty = true; },
});

// ---------- Controls ----------
const play = bindPlayPause('playBtn', {
  paused: false,
  label: (p) => (p ? (sample && done() ? '▶ Կրկնել' : sample && sample.tau > 0 ? '▶ Շարունակել' : '▶ Սկսել') : '⏸ Դադար'),
  onChange: (p) => {
    if (!p && done()) reset();
    play.render();
  },
});
onClick('stepBtn', stepOneT);
onClick('resetBtn', reset);

bindSelect('iso', {
  onChange: (v) => { cfg.iso = v; reset(); },
});
bindRange('customT', {
  format: (v) => `${v.toFixed(1)} վ`,
  onInput: (v) => { cfg.customT = v; reset(); },
});
bindSegmented('n0', { onChange: (v) => { cfg.n0 = +v; reset(); } });
bindCheckbox('chain', { onChange: (v) => { cfg.chain = v; reset(); } });
bindSegmented('t2', { onChange: (v) => { cfg.r = +v; reset(); } });
bindSegmented('speed', { onChange: (v) => { cfg.speed = +v; updateTexts(); } });
bindCheckbox('theory', { onChange: (v) => { cfg.theory = v; updateTexts(); } });
bindCheckbox('activity', { onChange: (v) => { cfg.activity = v; updateTexts(); } });
bindCheckbox('logScale', { onChange: (v) => { cfg.log = v; chartDirty = true; } });
bindRange('ageF', {
  format: (v) => v.toFixed(2),
  onInput: (v) => { cfg.ageF = v; updateTexts(); },
});

// ---------- Simulation ----------
function reset() {
  sample = createSample(cfg.n0);
  hist = [{ tau: 0, n1: cfg.n0, n2: 0, n3: 0 }];
  baseWindow = cfg.chain ? 6 * Math.max(1, cfg.r) : 6;
  binW = baseWindow / BINS_PER_WINDOW;
  bins = [];
  aTop = peakActivity(cfg.chain, cfg.r, baseWindow);
  layoutScene();
  updateTexts();
  play.render();
}

function pushHist() {
  const last = hist[hist.length - 1];
  if (last && last.tau === sample.tau) hist.pop();
  hist.push({ tau: sample.tau, n1: sample.n1, n2: sample.n2, n3: sample.n3 });
}

/** Advances by dtau half-lives in small sub-steps that never straddle a
 *  histogram bin, so every decay is counted in the right bin. */
function advance(dtau, recordEach = false) {
  const { chain, r } = cfg;
  const maxStep = 0.02 * (chain ? Math.min(1, r) : 1);
  const target = sample.tau + dtau;
  while (target - sample.tau > 1e-12 && !done()) {
    const binEnd = (Math.floor(sample.tau / binW + 1e-9) + 1) * binW;
    const h = Math.min(target - sample.tau, maxStep, binEnd - sample.tau);
    const bin = Math.floor((sample.tau + h / 2) / binW);
    bins[bin] = (bins[bin] || 0) + step(sample, h, { chain, r, stamp: clock });
    if (recordEach) pushHist();
  }
  if (!done()) sample.tau = target;      // no round-off drift: whole T stays whole
  pushHist();
  chartDirty = true;
}

function stepOneT() {
  if (done()) return;
  play.set(true);
  advance(1, true);
  play.render();
}

// ---------- Texts (things that change on input, not every frame) ----------
const capAUnit = byId('capAUnit');
function actUnit() { return `տրոհում/${unit()}`; }

function updateTexts() {
  const iso = isotope();
  byId('customField').hidden = !isCustom();
  byId('t2Field').hidden = !cfg.chain;
  byId('n2Row').hidden = !cfg.chain;
  byId('capD').hidden = !cfg.chain;
  byId('capS').hidden = !cfg.chain;
  byId('capTh').hidden = !cfg.theory;
  byId('capA').hidden = !cfg.activity;
  byId('capP').textContent = cfg.chain ? 'մայր միջուկներ N₁' : 'չտրոհված միջուկներ N';
  byId('nLabel').textContent = cfg.chain ? 'Մայր միջուկներ N₁' : 'Չտրոհված միջուկներ N';
  byId('dLabel').textContent = cfg.chain ? 'Տրոհված մայր միջուկներ' : 'Տրոհված միջուկներ';
  byId('aLabel').textContent = cfg.chain ? 'Ակտիվություն A = λ₁N₁ + λ₂N₂' : 'Ակտիվություն A = λN';
  capAUnit.textContent = actUnit();

  const T = halfLife();
  byId('isoHint').textContent = isCustom()
    ? 'Ընտրովի իզոտոպի ժամանակն ընթանում է իրական արագությամբ (×1-ի դեպքում)։'
    : `${iso.mode}-տրոհում՝ ${iso.sym} → ${iso.product}։ T = ${fmtSig(T, 3)} ${iso.unit}։`;
  byId('t2Out').textContent = `${fmtSig(T * cfg.r, 3)} ${unit()}`;
  byId('speedHint').textContent = isCustom()
    ? `×${speedText()} արագությամբ 1 վ իրական ժամանակը համապատասխանում է ${fmtSig(cfg.speed, 2)} վ-ի։`
    : `×${speedText()} արագությամբ մեկ կիսատրոհման պարբերությունը տևում է ${fmtSig(SEC_PER_T / cfg.speed, 2)} վ։`;

  const ageT = ISOTOPES.c14.T;
  const age = ageFromFraction(ageT, cfg.ageF);
  byId('ageVal').textContent = `${fmtSig(age, 3)} տարի (${(age / ageT).toFixed(2)} T)`;
  byId('ageHint').textContent = cfg.iso === 'c14'
    ? 'Կենդանի օրգանիզմում ¹⁴C-ի բաժինը հաստատուն է, մահից հետո այն նվազում է տրոհման օրենքով։ Կանաչ կետը գրաֆիկի վրա ցույց է տալիս այդ տարիքը։'
    : 'Կենդանի օրգանիզմում ¹⁴C-ի բաժինը հաստատուն է, մահից հետո այն նվազում է տրոհման օրենքով։ Ընտրեք «Ածխածին-14»՝ արդյունքը գրաֆիկի վրա տեսնելու համար։';
  chartDirty = true;
}

const speedText = () => ({ 0.25: '¼', 0.5: '½' }[cfg.speed] ?? String(cfg.speed));

const statCache = new Map();
function setStat(id, str) {
  if (statCache.get(id) === str) return;
  statCache.set(id, str);
  byId(id).textContent = str;
}

function updateStats() {
  const T = halfLife();
  const u = unit();
  const { tau, n1, n2, n0 } = sample;
  const th = theory(tau, cfg.chain, cfg.r);
  const lam = LN2 / T;
  setStat('tVal', `${fmtSig(tau * T, 3)} ${u}`);
  setStat('ttVal', tau.toFixed(2));
  setStat('nVal', String(n1));
  setStat('n2Val', `${n2} (տես.՝ ${Math.round(th.n2 * n0)})`);
  setStat('dVal', String(n0 - n1));
  setStat('fVal', (n1 / n0).toFixed(3));
  setStat('fthVal', th.n1.toFixed(3));
  setStat('lamVal', `${fmtSig(lam, 4)} ${u}⁻¹`);
  setStat('tauVal', `${fmtSig(T / LN2, 3)} ${u}`);
  const A = lam * n1 + (cfg.chain ? (lam / cfg.r) * n2 : 0);
  setStat('aVal', `${fmtSig(A, 3)} ${actUnit()}`);
}

// ---------- Scene: the sample as a grid ----------
let G = null;     // grid layout

/** Factor pair cols × rows = n whose aspect is closest to `aspect`. */
function bestGrid(n, aspect) {
  let best = [n, 1], err = Infinity;
  for (let a = 1; a * a <= n; a++) {
    if (n % a) continue;
    for (const [c, r] of [[a, n / a], [n / a, a]]) {
      const e = Math.abs(Math.log(c / r / aspect));
      if (e < err) { err = e; best = [c, r]; }
    }
  }
  return best;
}

function legendItems() {
  const iso = isotope();
  return cfg.chain
    ? [['parent', 'մայր', 'n1'], ['daughter', 'դուստր', 'n2'], ['stable', 'կայուն', 'n3']]
    : [['parent', iso.sym, 'n1'], ['stable', iso.product, 'n3']];
}

function layoutScene() {
  if (!sample) return;
  const { ctx, width: W, height: H } = scene;
  if (!W) return;
  // Header strip: legend with counts on the left, elapsed time on the right.
  ctx.font = font(12);
  const itemW = legendItems().reduce((s, [, lbl]) => s + 18 + ctx.measureText(lbl).width + 6 + 40 + 14, 0);
  const twoRows = itemW + 150 > W - 24;
  const strip = twoRows ? 50 : 32;
  const pad = 12;
  const gw = W - 2 * pad, gh = H - strip - pad;
  const [cols, rows] = bestGrid(sample.n0, gw / gh);
  const c = Math.min(gw / cols, gh / rows);
  G = {
    cols, rows, c, strip, twoRows,
    ox: (W - cols * c) / 2 + c / 2,
    oy: strip + (gh - rows * c) / 2 + c / 2,
  };
}

function drawScene() {
  const { ctx, width: W, height: H } = scene;
  if (!W || !G) return;
  clear(ctx, W, H, COLORS.canvasBg);
  const { cols, c, ox, oy } = G;
  const { kind, when, n0 } = sample;
  const round = c >= 5;
  const rr = round ? c * 0.36 : 0;
  const sq = Math.max(1, c - (c > 3 ? 0.9 : 0.5));

  // Nuclei, one path per kind.
  const colors = [C.parent, C.daughter, C.stable];
  for (let k = 0; k < 3; k++) {
    ctx.beginPath();
    let any = false;
    for (let i = 0; i < n0; i++) {
      if (kind[i] !== k) continue;
      any = true;
      const x = ox + (i % cols) * c, y = oy + Math.floor(i / cols) * c;
      if (round) { ctx.moveTo(x + rr, y); ctx.arc(x, y, rr, 0, Math.PI * 2); }
      else ctx.rect(x - sq / 2, y - sq / 2, sq, sq);
    }
    if (!any) continue;
    ctx.fillStyle = k === 2 ? alpha(colors[k], 0.75) : colors[k];
    ctx.fill();
  }

  // Flashes of fresh decays: a bright core and a fading ring.
  for (let i = 0; i < n0; i++) {
    const age = clock - when[i];
    if (age >= FLASH || age < 0) continue;
    const k = age / FLASH;
    const x = ox + (i % cols) * c, y = oy + Math.floor(i / cols) * c;
    circle(ctx, x, y, Math.max(1.5, c * (0.45 + 0.9 * k)), { fill: alpha(C.flash, 0.55 * (1 - k)) });
    circle(ctx, x, y, Math.max(1, c * 0.32), { fill: alpha(C.flash, 0.9 * (1 - k) ** 2) });
  }

  // Header strip
  ctx.fillStyle = COLORS.surface2;
  ctx.fillRect(0, 0, W, G.strip);
  line(ctx, 0, G.strip, W, G.strip, { color: COLORS.axis, width: 1 });
  let x = 12;
  const y1 = 16;
  for (const [key, lbl, field] of legendItems()) {
    circle(ctx, x + 5, y1, 5, { fill: C[key] });
    text(ctx, lbl, x + 15, y1, { color: COLORS.text2, size: 12 });
    ctx.font = font(12);
    const lw = ctx.measureText(lbl).width;
    const val = String(sample[field]);
    text(ctx, val, x + 21 + lw, y1, { color: COLORS.text, size: 12, family: 'mono', weight: 600 });
    ctx.font = font(12, { family: 'mono', weight: 600 });
    x += 21 + lw + Math.max(36, ctx.measureText(String(n0)).width) + 16;
  }
  const tStr = `t = ${fmtSig(sample.tau * halfLife(), 3)} ${unit()} = ${sample.tau.toFixed(2)} T`;
  if (G.twoRows) text(ctx, tStr, 12, 38, { color: COLORS.text2, size: 12, family: 'mono' });
  else text(ctx, tStr, W - 12, y1, { color: COLORS.text2, size: 12, family: 'mono', align: 'right' });
}

// ---------- Chart ----------
/** Time-axis scale: values in unit(), divided by 10^k when they are huge. */
function timeAxis() {
  const T = halfLife();
  const e = T * baseWindow >= 1e5 ? 3 * Math.floor(Math.log10(T) / 3) : 0;
  return { f: 10 ** e, label: e ? `t, 10${sup(e)} ${unit()}` : `t, ${unit()}` };
}

function drawChart() {
  const { ctx, width: W, height: H } = chart;
  if (!W) return;
  clear(ctx, W, H, COLORS.canvasBg);
  const narrow = W < 520;
  const n0 = sample.n0;
  const m = { l: 46, r: cfg.activity ? (narrow ? 56 : 64) : 16, t: 34, b: 40 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const xMax = Math.max(baseWindow, Math.ceil(sample.tau - 1e-9));
  const X = (tau) => m.l + (tau / xMax) * pw;
  const yTopLin = n0 * 1.06;
  const L0 = Math.log(0.6), L1 = Math.log(n0 * 1.35);
  const Y = cfg.log
    ? (v) => m.t + ph * (1 - (Math.log(Math.max(v, 0.6)) - L0) / (L1 - L0))
    : (v) => m.t + ph * (1 - v / yTopLin);
  const bottom = m.t + ph;
  const T = halfLife();
  const ax = timeAxis();
  const small = { color: COLORS.text3, size: 10, family: 'mono' };

  // Vertical markers at T, 2T, … with labels on top and values below.
  const every = Math.max(1, Math.ceil(xMax / (narrow ? 6 : 12)));
  for (let k = 0; k <= xMax; k++) {
    const x = X(k);
    if (k > 0) line(ctx, x, m.t, x, bottom, { color: COLORS.axis, width: 1, dash: [3, 4] });
    if (k % every) continue;
    if (k > 0) text(ctx, k === 1 ? 'T' : `${k}T`, x, m.t - 8, { ...small, color: COLORS.text2, align: 'center' });
    text(ctx, k === 0 ? '0' : fmtSig((k * T) / ax.f, 3), x, bottom + 8, { ...small, align: 'center', baseline: 'top' });
  }
  text(ctx, ax.label, m.l + pw, H - 9, { color: COLORS.text2, size: 11, family: 'mono', align: 'right' });

  // Horizontal markers N₀/2, N₀/4, N₀/8 and the left axis.
  const leftTicks = [];
  for (const [d, lbl] of [[2, 'N₀/2'], [4, 'N₀/4'], [8, 'N₀/8']]) {
    const y = Y(n0 / d);
    line(ctx, m.l, y, m.l + pw, y, { color: COLORS.axis, width: 1, dash: [3, 4] });
    text(ctx, lbl, m.l + pw - 4, y - 7, { ...small, align: 'right' });
    leftTicks.push(n0 / d);
  }
  line(ctx, m.l, Y(n0), m.l + pw, Y(n0), { color: COLORS.grid, width: 1 });
  leftTicks.push(n0);
  if (cfg.log) {
    for (let v = 1; v < n0; v *= 10) {
      line(ctx, m.l, Y(v), m.l + pw, Y(v), { color: COLORS.grid, width: 1 });
      if (leftTicks.every((t) => Math.abs(Y(t) - Y(v)) > 13)) leftTicks.push(v);
    }
  } else {
    leftTicks.push(0);
  }
  for (const v of leftTicks) text(ctx, String(v), m.l - 6, Y(v), { ...small, align: 'right' });
  line(ctx, m.l, m.t - 4, m.l, bottom, { color: COLORS.axis, width: 1.2 });
  line(ctx, m.l, bottom, m.l + pw + 4, bottom, { color: COLORS.axis, width: 1.2 });
  text(ctx, cfg.log ? 'N (լոգ.)' : 'N', 8, 12, { color: COLORS.text2, size: 11, family: 'mono' });

  // Activity: right axis in the same proportions (A ↔ N-equivalent value).
  const aEq = (aN0T) => (aN0T / aTop) * n0;        // a in units of N₀/T → chart value
  if (cfg.activity) {
    const xr = m.l + pw;
    line(ctx, xr, m.t - 4, xr, bottom, { color: alpha(C.act, 0.7), width: 1.2 });
    for (const v of [n0, n0 / 2, n0 / 4]) {
      const A = (v / n0) * aTop * (n0 / T);           // in decays per unit()
      text(ctx, fmtSig(A, narrow ? 2 : 3), xr + 5, Y(v), { ...small, color: C.act });
    }
    text(ctx, 'A', W - 8, 12, { color: C.act, size: 11, family: 'mono', align: 'right' });
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(m.l, m.t - 2, pw + 1, ph + 2);
  ctx.clip();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Histogram of decays per bin, converted to activity.
  if (cfg.activity) {
    for (let j = 0; j < bins.length; j++) {
      if ((j + 1) * binW > sample.tau + 1e-9 || !bins[j]) continue;
      const v = bins[j] / (binW * aTop);              // = aEq(count / (binW·N₀))
      const x0 = X(j * binW) + 0.5, x1 = X((j + 1) * binW) - 0.5;
      const y = Y(v);
      ctx.fillStyle = alpha(C.act, cfg.log ? 0.07 : 0.22);
      ctx.fillRect(x0, y, x1 - x0, bottom - y);
      line(ctx, x0, y, x1, y, { color: alpha(C.act, 0.9), width: 1.5 });
    }
  }

  const poly = (fn, color, width, n = 300) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const tau = (xMax * i) / n;
      const y = Y(fn(tau));
      if (i) ctx.lineTo(X(tau), y); else ctx.moveTo(X(tau), y);
    }
    ctx.stroke();
  };
  const series = [['n1', C.parent], ...(cfg.chain ? [['n2', C.daughter], ['n3', C.stable]] : [])];

  // Theoretical curves: wide translucent bands under the measured ones.
  if (cfg.theory) {
    for (const [key, color] of series) poly((tau) => theory(tau, cfg.chain, cfg.r)[key] * n0, alpha(color, 0.3), 7);
    if (cfg.activity && cfg.chain) {
      ctx.setLineDash([5, 4]);
      poly((tau) => aEq(theory(tau, true, cfg.r).a), alpha(C.act, 0.85), 1.5);
      ctx.setLineDash([]);
    }
  }

  // Measured curves (step-like: N only changes at decays).
  for (const [key, color] of series) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    hist.forEach((s, i) => {
      const x = X(s.tau);
      if (i) { ctx.lineTo(x, Y(hist[i - 1][key])); ctx.lineTo(x, Y(s[key])); } else ctx.moveTo(x, Y(s[key]));
    });
    ctx.stroke();
  }
  ctx.restore();

  // Current point
  circle(ctx, X(sample.tau), Y(sample.n1), 4.5, { fill: C.parent, stroke: COLORS.canvasBg, width: 2 });

  // Radiocarbon dating marker
  if (cfg.iso === 'c14') {
    const ta = Math.log2(1 / cfg.ageF);
    if (ta <= xMax) {
      const px = X(ta), py = Y(cfg.ageF * n0);
      line(ctx, px, py, px, bottom, { color: alpha(C.age, 0.8), width: 1.2, dash: [2, 3] });
      line(ctx, m.l, py, px, py, { color: alpha(C.age, 0.8), width: 1.2, dash: [2, 3] });
      circle(ctx, px, py, 5, { fill: C.age, stroke: COLORS.canvasBg, width: 2 });
      const lbl = `${fmtSig(ta * T, 3)} տարի`;
      const right = px < m.l + pw * 0.6;
      text(ctx, lbl, px + (right ? 9 : -9), py - 12, {
        color: C.age, size: 11, family: 'mono', weight: 600, align: right ? 'left' : 'right',
      });
    }
  }
}

// ---------- Main loop ----------
startLoop((dt) => {
  clock += dt;
  if (!play.paused && sample && !done()) {
    advance((dt * cfg.speed) / secPerT());
    if (done()) play.set(true);
  }
  drawScene();
  updateStats();
  if (chartDirty) { chartDirty = false; drawChart(); }
});

onThemeChange(() => { chartDirty = true; });
fontsReady().then(() => { layoutScene(); chartDirty = true; });
reset();

