// Tab 1 — standing waves on a string driven by a vibrator (Melde's experiment).

import { fluidCanvas } from '../../../assets/js/core/canvas.js';
import { bindRange, onClick } from '../../../assets/js/core/controls.js';
import { byId, setText, $$ } from '../../../assets/js/core/dom.js';
import { clear, line, text, circle, roundRect } from '../../../assets/js/core/draw.js';
import { COLORS, themed, alpha } from '../../../assets/js/core/theme.js';
import { clamp } from '../../../assets/js/core/math.js';
import {
  STRING, stringSpeed, stringHarmonic, stringModes, modeTable, stringShape,
  findExtrema, spectrumGrid,
} from './physics.js';
import {
  fmt, fmtHz, niceStep, createSlowClock, slowLabel, drawMarkers,
  createSpectrumChart, renderHarmonics,
} from './shared.js';

const NX = 241;                      // drawing grid
const NS = 61;                       // grid for the response curve
const A0 = 0.002;                    // m: amplitude at which the picture is half-full
const HARMONICS = 6;

const C = themed((light) => ({
  string: COLORS.blue,
  env: COLORS.blue,
  node: COLORS.coral,
  anti: COLORS.teal,
  post: light ? '#8a94b4' : '#4a5579',
  postFill: light ? '#d9deeb' : '#232a41',
  weight: light ? '#7d88a8' : '#5a6794',
  vibrator: COLORS.amber,
  muted: COLORS.text3,
}));

export function createString() {
  const P = { T: 100, mu: 0.01, L: 1, beta: 2 };
  let f = 150;

  const xs = Array.from({ length: NX }, (_, j) => j / (NX - 1));
  const tab = modeTable(xs);
  const xsS = Array.from({ length: NS }, (_, j) => j / (NS - 1));
  const tabS = modeTable(xsS);
  const Pt = new Float64Array(NX), Rt = new Float64Array(NX);   // target shape
  const Pd = new Float64Array(NX), Rd = new Float64Array(NX);   // displayed (smoothed)
  const env = new Float64Array(NX);
  const tmpP = new Float64Array(NS), tmpR = new Float64Array(NS);
  let modes = null;
  let ampMax = 0;               // steady-state largest amplitude, m
  let spectrum = { fs: [], amps: [] };
  let peakAmp = [];             // amplitude at each exact fₙ
  const clock = createSlowClock();

  const v = () => stringSpeed(P.T, P.mu);
  const f1 = () => stringHarmonic(1, P);
  const fMax = () => Math.ceil(6.6 * f1());

  // ---------- Canvas ----------
  const view = fluidCanvas(byId('sScene'), {
    height: (w) => clamp(Math.round(w * 0.42), 290, 400),
    onResize: () => draw(),
  });
  const { ctx } = view;

  const chart = createSpectrumChart(byId('sSpectrum'), () => ({
    title: 'Ամպլիտուդի կախումը վիբրատորի հաճախությունից',
    fs: spectrum.fs,
    amps: spectrum.amps,
    fMin: 0,
    fMax: fMax(),
    peaks: Array.from({ length: HARMONICS }, (_, i) => ({ f: stringHarmonic(i + 1, P), label: `f${'₁₂₃₄₅₆'[i]}` })),
    f,
    a: ampMax,
    yUnit: 'A, մմ',
    yScale: 1000,
  }));

  // ---------- Physics updates ----------
  function updateShape() {
    modes = stringModes(P, f, modes);
    ampMax = stringShape(modes, tab, Pt, Rt);
  }

  function updateSpectrum() {
    const hw = P.beta / Math.PI;    // half-width of a peak in Hz (≈ β/π)
    const peaks = Array.from({ length: HARMONICS + 1 }, (_, i) => stringHarmonic(i + 1, P));
    const fs = spectrumGrid(0.5, fMax(), peaks, () => Math.max(hw, 0.02));
    let m = null;
    const amps = fs.map((ff) => {
      m = stringModes(P, ff, m);
      return stringShape(m, tabS, tmpP, tmpR);
    });
    spectrum = { fs, amps };
    const bufP = new Float64Array(NX), bufR = new Float64Array(NX);
    peakAmp = peaks.map((fp) => {
      m = stringModes(P, fp, m);
      return stringShape(m, tab, bufP, bufR);
    });
  }

  // ---------- Controls ----------
  const fCtl = bindRange('sF', {
    format: (val) => fmtHz(val),
    onInput: (val) => setF(val, false),
  });

  function setF(val, moveSlider = true) {
    f = clamp(val, 1, fMax());
    if (moveSlider) fCtl.set(f, { silent: true });
    fCtl.show(fmtHz(f));
    updateShape();
    refresh();
  }

  function paramsChanged() {
    fCtl.input.max = fMax();
    if (f > fMax()) f = fMax();
    fCtl.set(f, { silent: true });
    fCtl.show(fmtHz(f));
    updateShape();
    updateSpectrum();
    refresh();
  }

  bindRange('sT', { format: (x) => `${x.toFixed(0)} Ն`, onInput: (x) => { P.T = x; paramsChanged(); } });
  bindRange('sMu', { format: (x) => `${(x * 1000).toFixed(0)} գ/մ`, onInput: (x) => { P.mu = x; paramsChanged(); } });
  bindRange('sL', { format: (x) => `${x.toFixed(2)} մ`, onInput: (x) => { P.L = x; paramsChanged(); } });
  bindRange('sBeta', { format: (x) => `${x.toFixed(1)} վ⁻¹`, onInput: (x) => { P.beta = x; paramsChanged(); } });

  for (const [id, df] of [['sMinus1', -1], ['sMinus01', -0.1], ['sPlus01', 0.1], ['sPlus1', 1]]) {
    onClick(id, () => setF(Math.round((f + df) * 10) / 10));
  }
  const harmButtons = $$('#sHarm button');
  harmButtons.forEach((b, i) => {
    b.type = 'button';
    b.addEventListener('click', () => setF(stringHarmonic(i + 1, P)));
  });

  // ---------- Readouts ----------
  let resonant = 0;      // harmonic number when at resonance, else 0
  let extrema = { nodes: [], antinodes: [] };

  function refresh() {
    const list = Array.from({ length: HARMONICS }, (_, i) => ({ n: i + 1, f: stringHarmonic(i + 1, P) }));
    const near = renderHarmonics(harmButtons, list, f);
    const ratio = ampMax / (peakAmp[near.n - 1] || 1);
    resonant = ratio > 0.5 ? near.n : 0;
    const lambda = v() / f;
    setText('sV', `${fmt(v(), 1)} մ/վ`);
    setText('sLambda', `${fmt(lambda, lambda < 1 ? 3 : 2)} մ`);
    setText('sHalf', fmt((2 * P.L) / lambda, 2));
    setText('sAmp', `${fmt(ampMax * 1000, ampMax < 0.001 ? 2 : 1)} մմ`);
    setText('sNear', `f${'₁₂₃₄₅₆'[near.n - 1]} = ${fmtHz(near.f)}`);
    extrema = findExtrema(Array.from(Pt, (p, j) => Math.hypot(p, Rt[j])), { endNodes: true });
    setText('sNodes', resonant
      ? `${extrema.nodes.length} / ${extrema.antinodes.length}`
      : '— (ռեզոնանս չկա)');
    chart.draw();
  }

  // ---------- Drawing ----------
  function draw() {
    const { width: W, height: H } = view;
    if (!W) return;
    clear(ctx, W, H, COLORS.canvasBg);

    const xL = 30, xR = W - 62;
    // top band (0…62 px) is kept for the info text; below: Φ letters,
    // envelope, then λ/2 bracket and the vibrator box
    const Hamp = Math.min(H * 0.3, (H - 126) / 2);
    const yc = Math.round(76 + Hamp);
    const X = (j) => xL + (j / (NX - 1)) * (xR - xL);

    let dispMax = 0;
    for (let j = 0; j < NX; j++) {
      env[j] = Math.hypot(Pd[j], Rd[j]);
      if (env[j] > dispMax) dispMax = env[j];
    }
    const s = Hamp / (dispMax + A0);           // px per metre
    const ct = Math.cos(clock.phase), st = Math.sin(clock.phase);

    // floor
    line(ctx, 10, H - 10, W - 10, H - 10, { color: C.post, width: 1 });

    // left post (fixed end)
    ctx.fillStyle = C.postFill;
    roundRect(ctx, xL - 10, yc - 14, 10, H - 10 - (yc - 14), 2);
    ctx.fill();
    ctx.strokeStyle = C.post;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // vibrator
    const xv = xL + STRING.xd * (xR - xL);
    const jv = Math.round(STRING.xd * (NX - 1));
    const yv = yc - (Pd[jv] * ct + Rd[jv] * st) * s;
    const boxTop = yc + Hamp + 12;
    const boxH = Math.min(26, H - 14 - boxTop);
    line(ctx, xv, yv, xv, boxTop, { color: C.vibrator, width: 2.5 });
    ctx.fillStyle = alpha(C.vibrator, 0.25);
    roundRect(ctx, xv - 16, boxTop, 32, boxH, 4);
    ctx.fill();
    ctx.strokeStyle = C.vibrator;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    text(ctx, 'վիբրատոր', xv + 22, boxTop + boxH / 2, { color: C.muted, size: 11 });

    // pulley + hanging weight (sets the tension)
    const r = 9;
    circle(ctx, xR, yc + r, r, { stroke: C.post, width: 2 });
    circle(ctx, xR, yc + r, 2, { fill: C.post });
    line(ctx, xR, yc + r, xR, H - 10, { color: C.post, width: 2 });
    const wTop = yc + Math.min(Hamp * 0.55, 50);
    line(ctx, xR + r, yc + r, xR + r, wTop, { color: C.string, width: 1.5 });
    ctx.fillStyle = alpha(C.weight, 0.35);
    roundRect(ctx, xR + r - 12, wTop, 24, 28, 3);
    ctx.fill();
    ctx.strokeStyle = C.weight;
    ctx.stroke();
    text(ctx, `T = ${P.T.toFixed(0)} Ն`, xR - 6, wTop + 14, { color: C.muted, size: 11, align: 'right' });

    // envelope (blurred outline of the fast motion)
    ctx.beginPath();
    for (let j = 0; j < NX; j++) ctx.lineTo(X(j), yc - env[j] * s);
    for (let j = NX - 1; j >= 0; j--) ctx.lineTo(X(j), yc + env[j] * s);
    ctx.closePath();
    ctx.fillStyle = alpha(C.env, 0.1);
    ctx.fill();
    for (const sign of [-1, 1]) {
      ctx.beginPath();
      for (let j = 0; j < NX; j++) ctx.lineTo(X(j), yc + sign * env[j] * s);
      ctx.strokeStyle = alpha(C.env, 0.35);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    line(ctx, xL, yc, xR, yc, { color: COLORS.axis, width: 1, dash: [3, 5] });

    // the string itself
    ctx.beginPath();
    for (let j = 0; j < NX; j++) ctx.lineTo(X(j), yc - (Pd[j] * ct + Rd[j] * st) * s);
    ctx.strokeStyle = C.string;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // nodes and antinodes (only at resonance)
    if (resonant) {
      const ex = findExtrema(env, { endNodes: true });
      for (const i of ex.nodes) circle(ctx, X(i), yc, 4, { fill: COLORS.canvasBg, stroke: C.node, width: 2 });
      for (const i of ex.antinodes) circle(ctx, X(i), yc, 3, { fill: C.anti });
      drawMarkers(ctx, {
        nodes: ex.nodes,
        antinodes: ex.antinodes,
        X,
        yNode: () => yc + 16,
        yAnti: (i) => Math.max(12, yc - env[Math.round(i)] * s - 12),
        nodeColor: C.node,
        antiColor: C.anti,
      });
      // λ/2 between the last two nodes
      const n = ex.nodes.length;
      if (n >= 2) {
        const xa = X(ex.nodes[n - 2]), xb = X(ex.nodes[n - 1]);
        const yb = yc + Hamp + 4;
        line(ctx, xa, yb, xb, yb, { color: C.muted, width: 1 });
        line(ctx, xa, yb - 4, xa, yb + 4, { color: C.muted, width: 1 });
        line(ctx, xb, yb - 4, xb, yb + 4, { color: C.muted, width: 1 });
        text(ctx, 'λ/2', (xa + xb) / 2, yb + 10, { color: C.muted, size: 11, align: 'center' });
      }
    }

    // info and amplitude scale bar
    text(ctx, `f = ${fmtHz(f)}`, 14, 16, { color: COLORS.text, size: 13, weight: 600 });
    text(ctx, slowLabel(f), 14, 34, { color: C.muted, size: 11 });
    if (resonant) {
      text(ctx, `ռեզոնանս՝ n = ${resonant}`, 14, 52, { color: COLORS.teal, size: 11, weight: 600 });
    }
    const barMm = niceStep(42 / (s / 1000));
    const barPx = barMm * (s / 1000);
    const bx = W - 16;
    line(ctx, bx, 12, bx, 12 + barPx, { color: C.muted, width: 1.5 });
    line(ctx, bx - 4, 12, bx + 1, 12, { color: C.muted, width: 1.5 });
    line(ctx, bx - 4, 12 + barPx, bx + 1, 12 + barPx, { color: C.muted, width: 1.5 });
    text(ctx, `${fmt(barMm, barMm < 1 ? (barMm < 0.1 ? 2 : 1) : 0)} մմ`, bx - 7, 12 + barPx / 2,
      { color: C.muted, size: 10, align: 'right', family: 'mono' });
    text(ctx, `L = ${P.L.toFixed(2)} մ`, (xL + xR) / 2, H - 22, { color: C.muted, size: 11, align: 'center' });
  }

  // ---------- Frame ----------
  function frame(dt) {
    clock.advance(dt, f);
    const k = 1 - Math.exp(-dt / 0.12);
    for (let j = 0; j < NX; j++) {
      Pd[j] += (Pt[j] - Pd[j]) * k;
      Rd[j] += (Rt[j] - Rd[j]) * k;
    }
    draw();
  }

  paramsChanged();
  Pd.set(Pt);
  Rd.set(Rt);

  return {
    frame,
    redraw: () => { chart.draw(); draw(); },
    /** for testing */
    state: () => ({ v: v(), f, ampMax, f1: f1(), nodes: extrema.nodes.length, antinodes: extrema.antinodes.length, resonant }),
    setF,
  };
}
