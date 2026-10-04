// Tab 1 — the RC circuit: schematic with animated charge, stats, two charts.

import { fluidCanvas, pointerPos } from '../../../assets/js/core/canvas.js';
import {
  bindRange, bindSegmented, bindCheckbox, bindPlayPause, onClick,
} from '../../../assets/js/core/controls.js';
import { byId, setText } from '../../../assets/js/core/dom.js';
import { clear, line, text, circle } from '../../../assets/js/core/draw.js';
import { COLORS, themed, alpha, font } from '../../../assets/js/core/theme.js';
import { clamp, DEG, TAU } from '../../../assets/js/core/math.js';
import { createRC } from './physics.js';
import { createRCChart } from './charts.js';
import {
  UNITS, makeFormatter, fmtOhm, fmtMicroF, fmtVolt, fmtFactor,
} from './format.js';

const C = themed((light) => ({
  wire: COLORS.text2,
  idle: alpha(COLORS.text3, 0.5),
  part: COLORS.text,
  lever: COLORS.amber,
  dot: light ? '#b97a00' : COLORS.amber,
  plus: COLORS.red,
  minus: COLORS.blue,
  field: COLORS.purple,
}));

const snap2 = (x) => Number(x.toPrecision(2));

export function createRCTab() {
  const view = fluidCanvas(byId('rcScene'), {
    height: (w) => clamp(Math.round(w * 0.5), 300, 440),
    onResize: () => render(),
  });
  const { ctx } = view;

  // ---------- Model and UI state ----------
  const model = createRC({ eps: 10, R: 1e4, C: 1e-4 });
  const ui = {
    swAng: 35 * DEG,       // current lever angle (animated)
    phase: 0,              // charge-dot phase, px
    hover: false,
    auto: false,
    speed: 1,              // model seconds per real second (manual)
    tangent: true,
  };
  let paused = false;

  // ---------- Controls ----------
  const sw = bindSegmented('rcSwitch', { onChange: (v) => model.setMode(v) });
  const play = bindPlayPause('rcPlay', { onChange: (p) => { paused = p; } });
  bindRange('rcEps', {
    format: (v) => fmtVolt(v),
    onInput: () => applyParams(),
  });
  const rSlider = bindRange('rcR', {
    format: (v) => fmtOhm(snap2(10 ** v)),
    onInput: () => applyParams(),
  });
  const cSlider = bindRange('rcC', {
    format: (v) => fmtMicroF(snap2(10 ** v) * 1e-6),
    onInput: () => applyParams(),
  });
  const epsSlider = byId('rcEps');
  const speedSlider = bindRange('rcSpeed', {
    format: (v) => fmtFactor(10 ** v),
    onInput: (v) => { ui.speed = 10 ** v; },
  });
  const autoBox = bindCheckbox('rcAuto', {
    onChange: (on) => { ui.auto = on; speedSlider.input.disabled = on; },
  });
  bindCheckbox('rcTangent', { onChange: (on) => { ui.tangent = on; drawCharts(); } });
  onClick('rcReset', () => { model.reset(); ui.phase = 0; drawCharts(); });

  function readParams() {
    return {
      eps: parseFloat(epsSlider.value),
      R: snap2(10 ** rSlider.value),
      C: snap2(10 ** cSlider.value) * 1e-6,
    };
  }
  function applyParams() {
    model.setParams(readParams());
    drawCharts();
  }
  ui.speed = 10 ** speedSlider.value;
  model.setParams(readParams());

  // ---------- Charts ----------
  const chartU = createRCChart(byId('rcChartU'), 'u', () => ({ model, tangent: ui.tangent }));
  const chartI = createRCChart(byId('rcChartI'), 'i', () => ({ model, tangent: ui.tangent }));
  const drawCharts = () => { chartU.draw(); chartI.draw(); };

  // ---------- Switch interaction ----------
  let switchHit = null;     // circle {x, y, r} in canvas coordinates, set by render
  const hitSwitch = (p) => switchHit && Math.hypot(p.x - switchHit.x, p.y - switchHit.y) <= switchHit.r;
  const canvas = view.canvas;
  canvas.addEventListener('pointerdown', (e) => {
    if (!hitSwitch(pointerPos(view, e))) return;
    sw.set(model.mode === 'charge' ? 'discharge' : 'charge');
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    const hit = hitSwitch(pointerPos(view, e));
    if (hit !== ui.hover) {
      ui.hover = hit;
      canvas.style.cursor = hit ? 'pointer' : '';
    }
  });
  canvas.addEventListener('pointerleave', () => { ui.hover = false; canvas.style.cursor = ''; });

  // ---------- Layout of the schematic ----------
  function layout(W, H) {
    const s = clamp(W / 640, 0.62, 1.1);
    const L = { s };
    L.xS = Math.max(34, W * 0.09);
    const Ls = 46 * s, a = 35 * DEG;
    L.Ls = Ls;
    L.a = a;
    L.d = Ls * Math.sin(a);
    L.dx = Ls * Math.cos(a);
    L.xc = L.xS + W * 0.10;
    L.xP = L.xc + L.dx;
    L.rM = Math.max(12, 16 * s);
    L.xV = W - Math.max(32, W * 0.07);
    L.xC = L.xV - W * 0.17;
    L.xA = L.xC - Math.max(46, W * 0.13);
    L.xR = (L.xP + L.xA) / 2;
    L.rw = clamp(56 * s, 34, 64);
    L.rh = Math.max(11, 14 * s);
    L.yTop = Math.max(L.d + 34, H * 0.30);
    L.y1 = L.yTop - L.d;
    L.y2 = L.yTop + L.d;
    L.yBot = H * 0.88;
    L.yMid = (L.yTop + L.yBot) / 2;
    L.g = clamp(H * 0.095, 26, 40);
    L.pw = clamp(W * 0.065, 26, 52);
    L.yPT = L.yMid - L.g / 2;     // upper plate
    L.yPB = L.yMid + L.g / 2;     // lower plate
    L.yBat = (L.y1 + L.yBot) / 2 - 6;
    return L;
  }

  // ---------- Paths of the moving charges ----------
  function makePath(pts) {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    }
    return { pts, cum, len: cum[cum.length - 1] };
  }
  function pointAt(path, s) {
    let i = 1;
    while (i < path.cum.length - 1 && path.cum[i] < s) i++;
    const seg = path.cum[i] - path.cum[i - 1] || 1;
    const t = (s - path.cum[i - 1]) / seg;
    const [x0, y0] = path.pts[i - 1], [x1, y1] = path.pts[i];
    return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
  }
  function chargePath(L, mode) {
    return makePath(mode === 'charge'
      ? [[L.xC, L.yPB], [L.xC, L.yBot], [L.xS, L.yBot], [L.xS, L.y1], [L.xc, L.y1],
         [L.xP, L.yTop], [L.xC, L.yTop], [L.xC, L.yPT]]
      : [[L.xC, L.yPT], [L.xC, L.yTop], [L.xP, L.yTop], [L.xc, L.y2],
         [L.xc, L.yBot], [L.xC, L.yBot], [L.xC, L.yPB]]);
  }

  // ---------- Drawing ----------
  function poly(pts, color, width = 2) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    ctx.restore();
  }

  function render() {
    const { width: W, height: H } = view;
    if (!W) return;
    const L = layout(W, H);
    const { s } = L;
    const mode = model.mode;
    const charging = mode === 'charge';
    const P = model.P;
    const U = model.U(), I = model.I();
    clear(ctx, W, H, COLORS.canvasBg);

    // -- wires: active ones bright, idle ones faint --
    const on = C.wire, off = C.idle;
    poly([[L.xc, L.y2], [L.xc, L.yBot]], charging ? off : on);
    poly([[L.xS, L.y1], [L.xc, L.y1]], charging ? on : off);
    poly([[L.xS, L.y1], [L.xS, L.yBot]], charging ? on : off);
    poly([[L.xS, L.yBot], [L.xc, L.yBot]], charging ? on : off);
    poly([[L.xc, L.yBot], [L.xV, L.yBot]], on);
    poly([[L.xP, L.yTop], [L.xV, L.yTop]], on);
    poly([[L.xC, L.yTop], [L.xC, L.yPT]], on);
    poly([[L.xC, L.yPB], [L.xC, L.yBot]], on);
    poly([[L.xV, L.yTop], [L.xV, L.yMid - L.rM]], on);
    poly([[L.xV, L.yMid + L.rM], [L.xV, L.yBot]], on);

    // -- moving charges (conventional current direction) --
    const Iref = P.eps / P.R;
    const fwd = (charging ? I : -I) / Iref;
    const path = chargePath(L, mode);
    const n = Math.max(6, Math.round(path.len / (20 * s)));
    const spacing = path.len / n;
    const ph = ((ui.phase % spacing) + spacing) % spacing;
    const level = Math.min(1, Math.abs(fwd) * 4);
    ctx.fillStyle = alpha(C.dot, 0.25 + 0.75 * level);
    for (let k = 0; k < n; k++) {
      const [x, y] = pointAt(path, (ph + k * spacing) % path.len);
      ctx.beginPath();
      ctx.arc(x, y, 3 * Math.max(0.85, s), 0, TAU);
      ctx.fill();
    }

    // -- junctions --
    for (const [x, y] of [[L.xC, L.yTop], [L.xC, L.yBot], [L.xc, L.yBot], [L.xV, L.yTop], [L.xV, L.yBot]]) {
      circle(ctx, x, y, 2.6, { fill: C.wire });
    }

    // -- source ε --
    {
      const x = L.xS, y = L.yBat;
      ctx.fillStyle = COLORS.canvasBg;
      ctx.fillRect(x - 16, y - 9, 32, 19);
      line(ctx, x - 13 * s - 3, y - 4, x + 13 * s + 3, y - 4, { color: C.part, width: 2 });
      line(ctx, x - 7 * s - 2, y + 4, x + 7 * s + 2, y + 4, { color: C.part, width: 4.5 });
      text(ctx, '+', x + 13 * s + 8, y - 8, { color: C.plus, size: 13, weight: 700, align: 'center' });
      text(ctx, '−', x + 13 * s + 8, y + 9, { color: C.minus, size: 13, weight: 700, align: 'center' });
      ctx.save();
      ctx.font = font(11);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 5;
      ctx.strokeStyle = COLORS.canvasBg;
      ctx.strokeText(`ε = ${P.eps.toFixed(1)} Վ`, x, y + 26);
      ctx.fillStyle = COLORS.text;
      ctx.fillText(`ε = ${P.eps.toFixed(1)} Վ`, x, y + 26);
      ctx.restore();
    }

    // -- switch --
    {
      const px = L.xP, py = L.yTop;
      const tipX = px - L.Ls * Math.cos(ui.swAng);
      const tipY = py - L.Ls * Math.sin(ui.swAng);
      for (const [cx, cy, lbl, up] of [[L.xc, L.y1, '1', true], [L.xc, L.y2, '2', false]]) {
        circle(ctx, cx, cy, 3.6, { fill: COLORS.canvasBg, stroke: C.part, width: 1.8 });
        text(ctx, lbl, cx - 10, cy + (up ? -9 : 10), {
          color: COLORS.text, size: 12, weight: 700, align: 'center',
        });
      }
      if (ui.hover) {
        ctx.beginPath();
        ctx.arc(switchHit.x, switchHit.y, switchHit.r, 0, TAU);
        ctx.fillStyle = alpha(C.lever, 0.1);
        ctx.fill();
      }
      line(ctx, px, py, tipX, tipY, { color: C.lever, width: 3.2, cap: 'round' });
      circle(ctx, px, py, 4, { fill: C.lever });
    }

    // -- resistor R --
    {
      ctx.fillStyle = COLORS.canvasBg;
      ctx.strokeStyle = C.part;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.rect(L.xR - L.rw / 2, L.yTop - L.rh / 2, L.rw, L.rh);
      ctx.fill();
      ctx.stroke();
      text(ctx, `R = ${fmtOhm(P.R)}`, L.xR, L.yTop - L.rh / 2 - 11, { color: COLORS.text, size: 11, align: 'center' });
    }

    // -- ammeter --
    {
      circle(ctx, L.xA, L.yTop, L.rM, { fill: COLORS.canvasBg, stroke: C.part, width: 2 });
      text(ctx, 'A', L.xA, L.yTop + 1, { color: COLORS.text, size: 13, weight: 700, align: 'center' });
      text(ctx, fmtI(I), L.xA, L.yTop + L.rM + 11, { color: COLORS.coral, size: 11, family: 'mono', align: 'center' });
    }

    // -- voltmeter --
    {
      circle(ctx, L.xV, L.yMid, L.rM, { fill: COLORS.canvasBg, stroke: C.part, width: 2 });
      text(ctx, 'V', L.xV, L.yMid + 1, { color: COLORS.text, size: 13, weight: 700, align: 'center' });
      ctx.save();
      ctx.font = font(11, { family: 'mono' });
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 5;
      ctx.strokeStyle = COLORS.canvasBg;
      ctx.strokeText(fmtVolt(U), L.xV, L.yMid + L.rM + 12);
      ctx.fillStyle = COLORS.blue;
      ctx.fillText(fmtVolt(U), L.xV, L.yMid + L.rM + 12);
      ctx.restore();
    }

    // -- capacitor with charge on the plates (∝ q) --
    {
      const frac = clamp(U / Math.max(P.eps, U, 1e-9), 0, 1);
      const x0 = L.xC - L.pw, x1 = L.xC + L.pw;
      ctx.fillStyle = alpha(C.field, 0.04 + 0.2 * frac);
      ctx.fillRect(x0, L.yPT, x1 - x0, L.yPB - L.yPT);
      if (frac > 0.02) {
        const nl = 5;
        for (let k = 0; k < nl; k++) {
          const x = x0 + 8 + ((x1 - x0 - 16) * k) / (nl - 1);
          line(ctx, x, L.yPT + 2, x, L.yPB - 2, { color: alpha(C.field, 0.15 + 0.6 * frac), width: 1 });
        }
      }
      line(ctx, x0, L.yPT, x1, L.yPT, { color: C.part, width: 3.5, cap: 'round' });
      line(ctx, x0, L.yPB, x1, L.yPB, { color: C.part, width: 3.5, cap: 'round' });

      const nMax = Math.max(3, Math.floor((x1 - x0 - 8) / 11));
      const want = frac * nMax;
      const full = Math.floor(want);
      for (let k = 0; k < nMax; k++) {
        const a = k < full ? 1 : k === full ? want - full : 0;
        if (a < 0.03) continue;
        const x = x0 + 6 + ((x1 - x0 - 12) * k) / (nMax - 1);
        // + on the upper plate, − on the lower one
        const yt = L.yPT + 8, yb = L.yPB - 8;
        line(ctx, x - 3, yt, x + 3, yt, { color: alpha(C.plus, a), width: 1.8 });
        line(ctx, x, yt - 3, x, yt + 3, { color: alpha(C.plus, a), width: 1.8 });
        line(ctx, x - 3, yb, x + 3, yb, { color: alpha(C.minus, a), width: 1.8 });
      }
      text(ctx, `C = ${fmtMicroF(P.C)}`, x0 - 8, L.yMid, { color: COLORS.text, size: 11, align: 'right' });
      if (view.width >= 520) {
        text(ctx, '+q', x1 + 6, L.yPT - 1, { color: C.plus, size: 11, weight: 700 });
        text(ctx, '−q', x1 + 6, L.yPB + 3, { color: C.minus, size: 11, weight: 700 });
      }
    }

    // click target of the switch
    switchHit = {
      x: (L.xc + L.xP) / 2 - 2, y: L.yTop,
      r: Math.max(34, L.Ls * 0.95),
    };
  }

  const fmtI = (I) => makeFormatter(model.P.eps / model.P.R, UNITS.current, { n: 4 })(I);

  // ---------- Stats ----------
  function updateStats() {
    const P = model.P;
    const tau = model.tau;
    const fT = makeFormatter(tau, UNITS.time);
    const fI = makeFormatter(P.eps / P.R, UNITS.current, { n: 4 });
    const fQ = makeFormatter(P.C * P.eps, UNITS.charge, { k: 10 });
    const fW = makeFormatter(0.5 * P.C * P.eps * P.eps, UNITS.energy);
    const U = model.U();
    setText('rcTau', fT(tau));
    setText('rcT', fT(model.tSwitch));
    setText('rcUc', fmtVolt(U));
    setText('rcUr', fmtVolt(model.UR()));
    setText('rcI', fI(model.I()));
    setText('rcQ', fQ(model.q()));
    setText('rcW', fW(model.W()));
    setText('rcHeat', fW(model.heat()));
    setText('rcScale', `1 վ → ${makeFormatter(timeScale(), UNITS.time, { n: 2 })(timeScale())}`);
  }

  // Model seconds per real second.
  const timeScale = () => (ui.auto ? model.tau / 2 : ui.speed);

  // ---------- Frame ----------
  let lastMode = model.mode;
  function frame(dt) {
    if (!paused) {
      model.advance(dt * timeScale());
      const P = model.P;
      const fwd = (model.mode === 'charge' ? model.I() : -model.I()) / (P.eps / P.R);
      ui.phase += clamp(fwd, -1.5, 1.5) * 110 * dt;
    }
    if (model.mode !== lastMode) { lastMode = model.mode; ui.phase = 0; }
    // lever glides to its position
    const target = model.mode === 'charge' ? 35 * DEG : -35 * DEG;
    ui.swAng += (target - ui.swAng) * Math.min(1, dt * 16);
    render();
    drawCharts();
    updateStats();
  }

  return { frame, render, drawCharts, activate() { render(); drawCharts(); } };
}
