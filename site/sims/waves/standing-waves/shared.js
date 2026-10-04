// Helpers shared by the tabs: formatting, the response-curve chart,
// slowed-down animation phase, node/antinode labels.

import { fluidCanvas } from '../../../assets/js/core/canvas.js';
import { clear, line, text, circle } from '../../../assets/js/core/draw.js';
import { COLORS, alpha } from '../../../assets/js/core/theme.js';
import { clamp, TAU } from '../../../assets/js/core/math.js';

/** Fixed-point number with a typographic minus and no "−0.0". */
export function fmt(v, digits = 1) {
  const s = v.toFixed(digits);
  if (parseFloat(s) === 0) return s.replace('-', '');
  return s.replace('-', '−');
}

/** Frequency: 1 decimal below 1000 Հց, whole numbers above. */
export const fmtHz = (f) => `${fmt(f, f < 1000 ? 1 : 0)} Հց`;

const SUB = '₀₁₂₃₄₅₆₇₈₉';
export const sub = (n) => String(n).split('').map((d) => SUB[+d]).join('');

/** Terms used on the canvases and in the text. */
export const NODE = 'Հ';        // հանգույց
export const ANTINODE = 'Փ';    // փնջվածք

export function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

/**
 * Slowed-down clock for fast oscillations: whatever the real frequency f,
 * the picture oscillates at most DISPLAY_HZ times per second.
 */
export const DISPLAY_HZ = 0.6;
export function createSlowClock() {
  return {
    phase: 0,
    advance(dt, f) { this.phase = (this.phase + TAU * Math.min(f, DISPLAY_HZ) * dt) % TAU; },
    factor: (f) => Math.max(1, f / DISPLAY_HZ),
  };
}

/** "×83" — the slow-down factor shown on the canvas. */
export const slowLabel = (f) => {
  const k = Math.max(1, f / DISPLAY_HZ);
  return k < 1.05 ? 'իրական ժամանակ' : `դանդաղեցված ${k < 10 ? k.toFixed(1) : Math.round(k)} անգամ`;
};

/** Node / antinode marker letters along a horizontal axis. */
export function drawMarkers(ctx, { nodes, antinodes, X, yNode, yAnti, nodeColor, antiColor }) {
  for (const i of nodes) {
    text(ctx, NODE, X(i), yNode(i), { color: nodeColor, size: 12, weight: 700, align: 'center' });
  }
  for (const i of antinodes) {
    text(ctx, ANTINODE, X(i), yAnti(i), { color: antiColor, size: 12, weight: 700, align: 'center' });
  }
}

/**
 * Response curve: amplitude versus driving frequency with the resonances
 * and the current frequency marked.
 * getData() → { fs, amps, fMin, fMax, peaks: [{ f, label }], f, a,
 *               yUnit, yScale, yDigits, title }
 */
export function createSpectrumChart(canvas, getData) {
  const view = fluidCanvas(canvas, {
    height: (w) => clamp(Math.round(w * 0.24), 175, 215),
    onResize: () => draw(),
  });

  function draw() {
    const { ctx, width: W, height: H } = view;
    if (!W) return;
    const d = getData();
    clear(ctx, W, H, COLORS.canvasBg);
    const padL = 46, padR = 14, top = 42, bottom = H - 24;
    const plotW = W - padL - padR;
    const X = (f) => padL + ((f - d.fMin) / (d.fMax - d.fMin)) * plotW;

    let yMax = 0;
    for (const a of d.amps) yMax = Math.max(yMax, a);
    yMax = Math.max(yMax, d.a) * 1.12 || 1;
    const Y = (a) => bottom - (a / yMax) * (bottom - top);

    text(ctx, d.title, padL, 12, { color: COLORS.text2, size: 11 });

    // y ticks
    const yStepVal = niceStep((yMax * d.yScale) / 3);
    for (let v = 0; v <= yMax * d.yScale + 1e-9; v += yStepVal) {
      const y = Y(v / d.yScale);
      line(ctx, padL, y, W - padR, y, { color: COLORS.grid, width: 1 });
      text(ctx, fmt(v, yStepVal < 1 ? (yStepVal < 0.1 ? 2 : 1) : 0), padL - 6, y,
        { color: COLORS.text3, size: 10, family: 'mono', align: 'right' });
    }
    text(ctx, d.yUnit, padL - 6, top - 14, { color: COLORS.text3, size: 10, align: 'right' });

    // x ticks
    const xStep = niceStep((d.fMax - d.fMin) / (W < 520 ? 4 : 8));
    const unitX = W - padR;
    for (let k = Math.ceil(d.fMin / xStep); k * xStep <= d.fMax + 1e-9; k++) {
      const f = k * xStep;
      const x = X(f);
      if (x < unitX - 40) {
        text(ctx, fmt(f, xStep < 1 ? 1 : 0), x, bottom + 12,
          { color: COLORS.text3, size: 10, family: 'mono', align: 'center' });
      }
    }
    text(ctx, 'f, Հց', unitX, bottom + 12, { color: COLORS.text3, size: 11, align: 'right' });
    line(ctx, padL, bottom, W - padR, bottom, { color: COLORS.axis, width: 1 });
    line(ctx, padL, top - 4, padL, bottom, { color: COLORS.axis, width: 1 });

    // resonances
    let lastLabel = -Infinity;
    for (const p of d.peaks) {
      if (p.f < d.fMin || p.f > d.fMax) continue;
      const x = X(p.f);
      line(ctx, x, top, x, bottom, { color: COLORS.axis, width: 1, dash: [2, 4] });
      if (x - lastLabel > 26) {
        text(ctx, p.label, x, top - 8, { color: COLORS.text3, size: 10, align: 'center', family: 'mono' });
        lastLabel = x;
      }
    }

    // curve
    ctx.save();
    ctx.beginPath();
    ctx.rect(padL, top - 6, plotW, bottom - top + 6);
    ctx.clip();
    ctx.beginPath();
    d.fs.forEach((f, i) => {
      const x = X(f), y = Y(d.amps[i]);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
    ctx.lineTo(X(d.fs[d.fs.length - 1]), bottom);
    ctx.lineTo(X(d.fs[0]), bottom);
    ctx.closePath();
    ctx.fillStyle = alpha(COLORS.blue, 0.1);
    ctx.fill();
    ctx.beginPath();
    d.fs.forEach((f, i) => {
      const x = X(f), y = Y(d.amps[i]);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
    ctx.strokeStyle = COLORS.blue;
    ctx.lineWidth = 1.8;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();

    // current frequency
    const xf = X(clamp(d.f, d.fMin, d.fMax));
    line(ctx, xf, top - 4, xf, bottom, { color: COLORS.coral, width: 1.5 });
    circle(ctx, xf, Y(d.a), 4.5, { fill: COLORS.coral, stroke: COLORS.canvasBg, width: 1.5 });
  }

  return { draw };
}

/** Writes the six harmonic buttons: label + value; highlights the nearest. */
export function renderHarmonics(buttons, list, f) {
  let best = 0;
  list.forEach((h, i) => { if (Math.abs(h.f - f) < Math.abs(list[best].f - f)) best = i; });
  buttons.forEach((b, i) => {
    const h = list[i];
    b.innerHTML = `<span>f${sub(h.n)}</span><small>${fmtHz(h.f)}</small>`;
    b.setAttribute('aria-pressed', String(i === best));
  });
  return list[best];
}
