// Tab 3 — a driven damped oscillator and its resonance curve.
// The top of the spring is moved by an eccentric: ξ = a·cos θ with a = F₀/k,
// so the spring pushes the load with the extra force k·ξ = F₀·cos θ.

import { fluidCanvas } from '../../../assets/js/core/canvas.js';
import { bindRange, bindPlayPause, onClick } from '../../../assets/js/core/controls.js';
import { byId, setText } from '../../../assets/js/core/dom.js';
import { clear, line, text, circle, roundRect } from '../../../assets/js/core/draw.js';
import { COLORS, themed, alpha } from '../../../assets/js/core/theme.js';
import { clamp, TAU } from '../../../assets/js/core/math.js';
import {
  createDriven, stepDriven, drivenAmplitude, drivenPhase, naturalFreq, qualityFactor,
} from './physics.js';
import { fmt, niceStep } from './shared.js';

const C = themed((light) => ({
  support: light ? '#7d88a8' : '#5a6794',
  supportFill: light ? '#d9deeb' : '#232a41',
  spring: light ? '#5d6890' : '#8a96c0',
  load: COLORS.blue,
  loadRim: light ? '#164f8a' : '#a9d3f7',
  x: COLORS.blue,
  force: COLORS.amber,
  cur: COLORS.coral,
  muted: COLORS.text3,
}));

const OVERLAYS = [2, 4];        // other damping values, as multiples of γ

export function createResonance() {
  const P = { k: 40, m: 1, gamma: 0.15, F0: 0.5 };
  let f = 0.8;
  const osc = createDriven();
  let samples = [];             // [t, x, F/F0]
  let paused = false;

  const f0 = () => naturalFreq(P);
  const ampSS = () => drivenAmplitude(f, P);
  /** Largest steady-state amplitude over all frequencies (for scaling). */
  function peakAmplitude(gamma = P.gamma) {
    const w0sq = P.k / P.m;
    const wr2 = w0sq - 2 * gamma * gamma;
    const fr = wr2 > 0 ? Math.sqrt(wr2) / TAU : 0;
    return drivenAmplitude(fr, { ...P, gamma });
  }
  const chartWindow = () => clamp(5 / Math.min(f, f0()), 3, 12);

  // ---------- Canvases ----------
  const scene = fluidCanvas(byId('rScene'), {
    height: (w) => clamp(Math.round(w * 0.42), 300, 380),
    onResize: () => drawScene(),
  });
  const curves = fluidCanvas(byId('rCurves'), {
    height: (w) => clamp(Math.round(w * 0.46), 300, 400),
    onResize: () => drawCurves(),
  });

  // ---------- Controls ----------
  const fCtl = bindRange('rF', { format: (x) => `${x.toFixed(2)} Հց`, onInput: (x) => { f = x; refresh(); } });
  bindRange('rK', { format: (x) => `${x.toFixed(0)} Ն/մ`, onInput: (x) => { P.k = x; refresh(); } });
  bindRange('rM', { format: (x) => `${x.toFixed(1)} կգ`, onInput: (x) => { P.m = x; refresh(); } });
  bindRange('rGamma', { format: (x) => `${x.toFixed(2)} վ⁻¹`, onInput: (x) => { P.gamma = x; refresh(); } });
  bindRange('rF0', { format: (x) => `${x.toFixed(2)} Ն`, onInput: (x) => { P.F0 = x; refresh(); } });
  onClick('rToF0', () => { f = f0(); fCtl.set(f, { silent: true }); fCtl.show(`${f.toFixed(2)} Հց`); refresh(); });
  const play = bindPlayPause('rPlay', { onChange: (p) => { paused = p; } });
  onClick('rReset', () => {
    Object.assign(osc, createDriven());
    samples = [];
    play.set(false);
    paused = false;
    refresh();
  });

  // ---------- Readouts ----------
  function measured() {
    const span = Math.min(1 / f, chartWindow());
    let a = 0;
    for (let i = samples.length - 1; i >= 0 && samples[i][0] >= osc.t - span; i--) {
      a = Math.max(a, Math.abs(samples[i][1]));
    }
    return a;
  }

  function refresh() {
    const phi = drivenPhase(f, P);
    const Q = qualityFactor(P);
    setText('rF0v', `${f0().toFixed(3)} Հց`);
    setText('rRatio', fmt(f / f0(), 2));
    setText('rAmp', `${fmt(ampSS() * 100, ampSS() < 0.1 ? 2 : 1)} սմ`);
    setText('rPhase', `${fmt(phi / Math.PI * 180, 0)}°`);
    setText('rQ', Number.isFinite(Q) ? fmt(Q, 1) : '∞');
    drawCurves();
  }

  function readMeasured() {
    const a = measured();
    setText('rAmpM', `${fmt(a * 100, a < 0.1 ? 2 : 1)} սմ`);
  }

  // ---------- Scene: oscillator + strip chart ----------
  function drawScene() {
    const { ctx, width: W, height: H } = scene;
    if (!W) return;
    clear(ctx, W, H, COLORS.canvasBg);

    const ow = clamp(W * 0.28, 120, 190);
    const cx = ow / 2 + 18;
    const wheelY = 30, wheelR = 15;
    const topY0 = 78;                        // spring top at ξ = 0
    const yEq = Math.round(H * 0.6);
    const box = 34;
    const range = Math.min(yEq - (topY0 + 30) - box / 2, H - 14 - yEq - box / 2);
    const Apk = Math.max(peakAmplitude(), P.F0 / P.k);
    const s = range / (1.25 * Apk);          // px per metre
    const a = P.F0 / P.k;
    const xi = a * Math.cos(osc.theta);
    const yTop = topY0 - xi * s;
    const yM = clamp(yEq - osc.x * s, yTop + 24, H - box / 2 - 2);

    // eccentric wheel + guide
    ctx.fillStyle = C.supportFill;
    roundRect(ctx, cx - 30, 6, 60, 8, 2);
    ctx.fill();
    circle(ctx, cx, wheelY, wheelR, { fill: alpha(C.support, 0.2), stroke: C.support, width: 2 });
    const px = cx + wheelR * 0.7 * Math.sin(osc.theta), py = wheelY - wheelR * 0.7 * Math.cos(osc.theta);
    line(ctx, cx, wheelY, px, py, { color: C.force, width: 2 });
    circle(ctx, px, py, 3, { fill: C.force });
    line(ctx, cx - 12, 58, cx - 6, 58, { color: C.support, width: 2 });
    line(ctx, cx + 6, 58, cx + 12, 58, { color: C.support, width: 2 });
    line(ctx, cx, wheelY + wheelR + 2, cx, yTop, { color: C.force, width: 3, cap: 'round' });
    roundRect(ctx, cx - 10, yTop - 3, 20, 6, 2);
    ctx.fillStyle = C.force;
    ctx.fill();

    // spring
    const coils = 10;
    const y1 = yTop + 3, y2 = yM - box / 2;
    ctx.beginPath();
    ctx.moveTo(cx, y1);
    ctx.lineTo(cx, y1 + 6);
    for (let i = 1; i <= coils * 2; i++) {
      const yy = y1 + 6 + ((y2 - y1 - 12) * i) / (coils * 2);
      ctx.lineTo(cx + (i === coils * 2 ? 0 : i % 2 ? 11 : -11), yy);
    }
    ctx.lineTo(cx, y2);
    ctx.strokeStyle = C.spring;
    ctx.lineWidth = 1.6;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // load
    ctx.fillStyle = alpha(C.load, 0.85);
    roundRect(ctx, cx - 23, yM - box / 2, 46, box, 6);
    ctx.fill();
    ctx.strokeStyle = C.loadRim;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    text(ctx, 'm', cx, yM, { color: COLORS.canvasBg, size: 15, style: 'italic', weight: 700, family: 'display', align: 'center' });

    // ruler (cm) left of the load
    const rx = cx - 44;
    const stepCm = niceStep((range / s) * 100 / 3);
    line(ctx, rx, yEq - range, rx, yEq + range, { color: C.muted, width: 1 });
    for (let v = -Math.floor(range / s * 100 / stepCm) * stepCm; v * s / 100 <= range + 1e-6; v += stepCm) {
      const y = yEq - (v / 100) * s;
      line(ctx, rx - 3, y, rx + 3, y, { color: C.muted, width: 1 });
      if (Math.abs(v) > 1e-9 && rx > 24) {
        text(ctx, fmt(v, stepCm < 1 ? 1 : 0), rx - 6, y, { color: C.muted, size: 9, family: 'mono', align: 'right' });
      }
    }
    text(ctx, 'x, սմ', rx, yEq - range - 10, { color: C.muted, size: 10, align: 'center' });

    // strip chart: newest at the left, next to the load
    const x0 = ow + 26, x1 = W - 12;
    const win = chartWindow();
    const X = (t) => x0 + ((osc.t - t) / win) * (x1 - x0);
    const Ass = ampSS();
    line(ctx, x0, yEq, x1, yEq, { color: COLORS.axis, width: 1 });
    for (const sg of [-1, 1]) {
      const y = yEq - sg * Ass * s;
      if (Math.abs(y - yEq) <= range * 1.3) {
        line(ctx, x0, y, x1, y, { color: alpha(C.x, 0.5), width: 1, dash: [4, 5] });
      }
    }
    text(ctx, '+A', x1, yEq - Ass * s - 8, { color: C.x, size: 10, align: 'right' });
    line(ctx, cx + 26, yM, x0, yM, { color: alpha(C.x, 0.4), width: 1, dash: [2, 3] });

    const step = niceStep(win / (W < 520 ? 3 : 6));
    for (let k = 0; k * step <= win + 1e-9; k++) {
      const x = x0 + (k * step / win) * (x1 - x0);
      line(ctx, x, 24, x, H - 22, { color: COLORS.grid, width: 1 });
      if (x < x1 - 30) {
        text(ctx, k === 0 ? '0' : `−${fmt(k * step, step < 1 ? 1 : 0)}`, x, H - 12,
          { color: C.muted, size: 10, family: 'mono', align: 'center' });
      }
    }
    text(ctx, 't, վ', x1, H - 12, { color: C.muted, size: 11, align: 'right' });
    line(ctx, x0 + 4, 12, x0 + 20, 12, { color: C.x, width: 2.2, cap: 'round' });
    text(ctx, 'x(t)', x0 + 25, 12, { color: COLORS.text2, size: 11 });
    line(ctx, x0 + 64, 12, x0 + 80, 12, { color: C.force, width: 2, cap: 'round' });
    text(ctx, 'F(t)', x0 + 85, 12, { color: COLORS.text2, size: 11 });

    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, 0, x1 - x0, H);
    ctx.clip();
    const fAmp = Math.min(range * 0.45, 46);
    for (const [idx, color, scale, width] of [[2, C.force, fAmp, 1.5], [1, C.x, s, 2.2]]) {
      ctx.beginPath();
      let started = false;
      for (let i = samples.length - 1; i >= 0; i--) {
        const smp = samples[i];
        const x = X(smp[0]);
        const y = yEq - smp[idx] * scale;
        if (started) ctx.lineTo(x, y); else { ctx.moveTo(x, y); started = true; }
        if (x > x1) break;
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- Resonance curve + phase ----------
  function drawCurves() {
    const { ctx, width: W, height: H } = curves;
    if (!W) return;
    clear(ctx, W, H, COLORS.canvasBg);
    const padL = 48, padR = 14;
    const aTop = 30, aBot = Math.round(H * 0.6);
    const pTop = aBot + 30, pBot = H - 24;
    const fAx = Math.max(2.2 * f0(), 1.15 * f);
    const X = (ff) => padL + (ff / fAx) * (W - padL - padR);
    const N = 400;
    const fs = Array.from({ length: N + 1 }, (_, i) => (fAx * i) / N);

    const yMax = 1.15 * Math.max(peakAmplitude(), ampSS()) * 100;      // cm
    const YA = (cm) => aBot - (cm / yMax) * (aBot - aTop);
    const YP = (deg) => pTop + (deg / 180) * (pBot - pTop);

    text(ctx, 'Ռեզոնանսային կոր A(f)', padL + 8, 12, { color: COLORS.text2, size: 11 });
    text(ctx, 'Փուլային շեղում φ(f)', padL + 8, pTop - 14, { color: COLORS.text2, size: 11 });

    // grids
    const st = niceStep(yMax / 3);
    for (let v = 0; v <= yMax + 1e-9; v += st) {
      line(ctx, padL, YA(v), W - padR, YA(v), { color: COLORS.grid, width: 1 });
      text(ctx, fmt(v, st < 1 ? (st < 0.1 ? 2 : 1) : 0), padL - 6, YA(v),
        { color: COLORS.text3, size: 10, family: 'mono', align: 'right' });
    }
    text(ctx, 'A, սմ', padL - 6, aTop - 14, { color: COLORS.text3, size: 10, align: 'right' });
    for (const d of [0, 90, 180]) {
      line(ctx, padL, YP(d), W - padR, YP(d), d === 90
        ? { color: COLORS.axis, width: 1, dash: [3, 4] }
        : { color: COLORS.grid, width: 1 });
      text(ctx, `${d}°`, padL - 6, YP(d), { color: COLORS.text3, size: 10, family: 'mono', align: 'right' });
    }
    const xs = niceStep(fAx / (W < 520 ? 4 : 8));
    for (let k = 1; k * xs <= fAx + 1e-9; k++) {
      const x = X(k * xs);
      line(ctx, x, aTop, x, aBot, { color: COLORS.grid, width: 1 });
      line(ctx, x, pTop, x, pBot, { color: COLORS.grid, width: 1 });
      if (x < W - padR - 36) {
        text(ctx, fmt(k * xs, xs < 1 ? 1 : 0), x, pBot + 12, { color: COLORS.text3, size: 10, family: 'mono', align: 'center' });
      }
    }
    text(ctx, 'f, Հց', W - padR, pBot + 12, { color: COLORS.text3, size: 11, align: 'right' });
    line(ctx, padL, aBot, W - padR, aBot, { color: COLORS.axis, width: 1 });
    line(ctx, padL, aTop - 6, padL, aBot, { color: COLORS.axis, width: 1 });
    line(ctx, padL, pTop, padL, pBot, { color: COLORS.axis, width: 1 });

    // f₀
    const xf0 = X(f0());
    line(ctx, xf0, aTop - 6, xf0, pBot, { color: COLORS.axis, width: 1, dash: [2, 4] });
    text(ctx, 'f₀', xf0 + 4, aTop - 4, { color: COLORS.text3, size: 11 });

    const plot = (getY, color, width, dash = null) => {
      ctx.save();
      ctx.beginPath();
      fs.forEach((ff, i) => {
        const y = getY(ff);
        if (i) ctx.lineTo(X(ff), y); else ctx.moveTo(X(ff), y);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineJoin = 'round';
      if (dash) ctx.setLineDash(dash);
      ctx.stroke();
      ctx.restore();
    };

    ctx.save();
    ctx.beginPath();
    ctx.rect(padL, aTop - 6, W - padL - padR, aBot - aTop + 6);
    ctx.clip();
    for (const mult of OVERLAYS) {
      const g = P.gamma * mult;
      const Pg = { ...P, gamma: g };
      plot((ff) => YA(drivenAmplitude(ff, Pg) * 100), alpha(C.x, 0.4), 1.2, [5, 4]);
      const pk = peakAmplitude(g) * 100;
      const wr2 = P.k / P.m - 2 * g * g;
      const xr = X(wr2 > 0 ? Math.sqrt(wr2) / TAU : 0);
      text(ctx, `${mult}γ`, Math.max(padL + 12, xr) + 14, Math.max(aTop + 6, YA(pk) - 2),
        { color: alpha(C.x, 0.8), size: 10 });
    }
    plot((ff) => YA(drivenAmplitude(ff, P) * 100), C.x, 2.2);
    ctx.restore();
    for (const mult of OVERLAYS) {
      const Pg = { ...P, gamma: P.gamma * mult };
      plot((ff) => YP(drivenPhase(ff, Pg) * 180 / Math.PI), alpha(C.x, 0.4), 1.2, [5, 4]);
    }
    plot((ff) => YP(drivenPhase(ff, P) * 180 / Math.PI), C.x, 2.2);

    // current driving frequency
    const xf = X(f);
    line(ctx, xf, aTop - 6, xf, pBot, { color: C.cur, width: 1.3 });
    circle(ctx, xf, YA(ampSS() * 100), 5, { fill: C.cur, stroke: COLORS.canvasBg, width: 1.5 });
    circle(ctx, xf, YP(drivenPhase(f, P) * 180 / Math.PI), 5, { fill: C.cur, stroke: COLORS.canvasBg, width: 1.5 });
  }

  // ---------- Frame ----------
  let readTimer = 0;
  function frame(dt) {
    if (!paused && dt > 0) {
      stepDriven(osc, dt, f, P);
      samples.push([osc.t, osc.x, Math.cos(osc.theta)]);
      const tMin = osc.t - 12.5;
      let cut = 0;
      while (cut < samples.length && samples[cut][0] < tMin) cut++;
      if (cut) samples.splice(0, cut);
    }
    readTimer += dt;
    if (readTimer > 0.2) { readTimer = 0; readMeasured(); }
    drawScene();
  }

  refresh();
  readMeasured();

  return {
    frame,
    redraw: () => { drawCurves(); drawScene(); },
    state: () => ({
      f0: f0(), f, A: ampSS(), Am: measured(), phase: drivenPhase(f, P) * 180 / Math.PI, Q: qualityFactor(P),
      fPeak: (() => { let best = 0, bf = 0; for (let ff = 0.01; ff < 5; ff += 0.0005) { const a = drivenAmplitude(ff, P); if (a > best) { best = a; bf = ff; } } return bf; })(),
    }),
    setF: (x) => { f = x; fCtl.set(x, { silent: true }); refresh(); },
  };
}
