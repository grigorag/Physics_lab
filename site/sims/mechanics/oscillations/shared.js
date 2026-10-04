// Helpers shared by the two tabs: number formatting, charts, scene details.

import { fluidCanvas } from '../../../assets/js/core/canvas.js';
import { clear, line, text, roundRect } from '../../../assets/js/core/draw.js';
import { COLORS, font } from '../../../assets/js/core/theme.js';
import { clamp } from '../../../assets/js/core/math.js';

/** Fixed-point number with a typographic minus and no "−0.00". */
export function fmt(v, digits = 2) {
  const s = v.toFixed(digits);
  if (parseFloat(s) === 0) return s.replace('-', '');
  return s.replace('-', '−');
}

/** Formatter for energies that picks one unit (Ջ / մՋ / մկՋ) from the scale. */
export function energyFormat(max) {
  if (max >= 1) return (E) => `${fmt(E, 2)} Ջ`;
  if (max >= 1e-3) return (E) => `${fmt(E * 1e3, 1)} մՋ`;
  return (E) => `${fmt(E * 1e6, 1)} մկՋ`;
}

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

/**
 * Scrolling time graph of normalised curves.
 * getData() → {
 *   samples: [[t, …], …], t, window,
 *   series: [{ color: 'blue', label, visible, scale, get: (sample) => value }],
 * }
 * Each curve is divided by its own `scale` (its amplitude), so ±1 = ±max.
 */
export function createTimeChart(canvas, getData) {
  const view = fluidCanvas(canvas, {
    height: (w) => clamp(Math.round(w * 0.3), 180, 230),
    onResize: () => draw(),
  });

  function draw() {
    const { ctx, width: W, height: H } = view;
    if (!W) return;
    const { samples, t, window, series } = getData();
    clear(ctx, W, H, COLORS.canvasBg);

    const padL = 42, padR = 12, padB = 24;

    // Legend: flows left to right, wraps when the canvas is narrow.
    ctx.font = font(11);
    const shown = series.filter((s) => s.visible);
    let lx = padL, ly = 14;
    const items = shown.map((s) => {
      const w = 20 + ctx.measureText(s.label).width;
      if (lx + w > W - padR && lx > padL) { lx = padL; ly += 16; }
      const item = { s, x: lx, y: ly };
      lx += w + 16;
      return item;
    });
    for (const { s, x, y } of items) {
      line(ctx, x, y, x + 14, y, { color: COLORS[s.color], width: 2.5, cap: 'round' });
      text(ctx, s.label, x + 20, y, { color: COLORS.text2, size: 11 });
    }

    const top = ly + 14;
    const bottom = H - padB;
    const mid = (top + bottom) / 2;
    const half = (bottom - top) / 2 / 1.12;      // ±1 leaves a little headroom
    const plotW = W - padL - padR;

    const t0 = Math.max(0, t - window);
    const X = (tt) => padL + ((tt - t0) / window) * plotW;

    // Horizontal guides: +max, 0, −max
    for (const [v, lbl] of [[1, '+max'], [0, '0'], [-1, '−max']]) {
      const y = mid - v * half;
      line(ctx, padL, y, W - padR, y, v === 0
        ? { color: COLORS.axis, width: 1 }
        : { color: COLORS.axis, width: 1, dash: [3, 5] });
      text(ctx, lbl, padL - 6, y, { color: COLORS.text3, size: 10, family: 'mono', align: 'right' });
    }

    // Time ticks
    const step = niceStep(window / (W < 520 ? 4 : 8));
    const digits = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
    const unitX = W - padR;
    for (let k = Math.ceil(t0 / step - 1e-9); k * step <= t0 + window + 1e-9; k++) {
      const x = X(k * step);
      line(ctx, x, top, x, bottom, { color: COLORS.grid, width: 1 });
      if (x < unitX - 44) {
        text(ctx, (k * step).toFixed(digits), x, bottom + 12, {
          color: COLORS.text3, size: 10, family: 'mono', align: 'center',
        });
      }
    }
    text(ctx, 't, վ', unitX, bottom + 12, { color: COLORS.text3, size: 11, align: 'right' });
    line(ctx, padL, top, padL, bottom, { color: COLORS.axis, width: 1 });

    // Curves
    if (samples.length < 2) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(padL, top - 2, plotW, bottom - top + 4);
    ctx.clip();
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    for (const s of shown) {
      ctx.strokeStyle = COLORS[s.color];
      ctx.beginPath();
      let started = false;
      for (const smp of samples) {
        if (smp[0] < t0 - window * 0.01) continue;
        const x = X(smp[0]);
        const y = mid - (s.get(smp) / s.scale) * half;
        if (started) ctx.lineTo(x, y); else { ctx.moveTo(x, y); started = true; }
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  return { draw };
}

/**
 * Horizontal energy bars.
 * getData() → { max, rows: [{ sub: 'կ' | 'պ' | '', color: 'amber', value }] }
 */
export function createEnergyChart(canvas, getData) {
  const ROW = 26;
  const view = fluidCanvas(canvas, { height: () => 3 * ROW + 16, onResize: () => draw() });

  function draw() {
    const { ctx, width: W, height: H } = view;
    if (!W) return;
    const { max, rows } = getData();
    const format = energyFormat(max);
    clear(ctx, W, H, COLORS.canvasBg);

    const x0 = 44, x1 = W - 96;
    rows.forEach((row, i) => {
      const y = 8 + i * ROW + ROW / 2;
      text(ctx, 'E', 14, y, { color: COLORS.text2, size: 13, style: 'italic', family: 'display' });
      if (row.sub) text(ctx, row.sub, 24, y + 5, { color: COLORS.text2, size: 10 });

      ctx.fillStyle = COLORS.surface2;
      roundRect(ctx, x0, y - 7, x1 - x0, 14, 4);
      ctx.fill();
      const w = clamp(max > 0 ? row.value / max : 0, 0, 1) * (x1 - x0);
      if (w > 0.5) {
        ctx.fillStyle = COLORS[row.color];
        roundRect(ctx, x0, y - 7, w, 14, Math.min(4, w / 2));
        ctx.fill();
      }
      text(ctx, format(row.value), W - 10, y, {
        color: COLORS.text, size: 11, family: 'mono', align: 'right',
      });
    });
  }

  return { draw };
}

/** Hatched support the oscillator hangs from; (cx, y) is the attachment point. */
export function drawSupport(ctx, cx, y, halfWidth, color) {
  line(ctx, cx - halfWidth, y, cx + halfWidth, y, { color, width: 2.5, cap: 'round' });
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = cx - halfWidth + 4; x <= cx + halfWidth - 6; x += 9) {
    ctx.moveTo(x, y - 2);
    ctx.lineTo(x + 7, y - 10);
  }
  ctx.stroke();
  ctx.restore();
}

/** Small italic label next to a vector tip. */
export function vectorLabel(ctx, str, x, y, color) {
  text(ctx, str, x, y, { color, size: 13, style: 'italic', weight: 600, family: 'display', align: 'center' });
}
