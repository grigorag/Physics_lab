// Helpers shared by both tabs: axes, markers of the characteristic speeds,
// number formatting, colour mixing.

import { line, text } from '../../../assets/js/core/draw.js';
import { COLORS, font } from '../../../assets/js/core/theme.js';
import { lerp } from '../../../assets/js/core/math.js';

/** 1, 2 or 5 × 10ⁿ step not smaller than raw. */
export function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
export const sup = (n) => [...String(n)].map((c) => SUP[c] ?? c).join('');

/** Fixed-point number with a typographic minus. */
export const fmt = (v, d = 2) => v.toFixed(d).replace('-', '−');

/** Linear mix of two '#rrggbb' colours → '#rrggbb'. */
export function mix(a, b, t) {
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round(lerp((A >> s) & 255, (B >> s) & 255, t));
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

/** Colour along the stops for t in 0…1. */
export function ramp(stops, t) {
  const k = Math.min(stops.length - 1.0001, Math.max(0, t) * (stops.length - 1));
  const i = Math.floor(k);
  return mix(stops[i], stops[i + 1], k - i);
}

/**
 * Plot frame: grid, ticks, axes and axis titles.
 * box = { l, t, w, h }, xs/ys = { max, step, fmt }, labels = { x, y }.
 */
export function drawAxes(ctx, box, xs, ys, labels) {
  const { l, t, w, h } = box;
  const X = (v) => l + (v / xs.max) * w;
  const Y = (v) => t + h - (v / ys.max) * h;
  for (let v = 0; v <= xs.max + 1e-9; v += xs.step) {
    line(ctx, X(v), t, X(v), t + h, { color: COLORS.grid, width: 1 });
    text(ctx, xs.fmt(v), X(v), t + h + 7, { color: COLORS.text3, size: 10, family: 'mono', align: 'center', baseline: 'top' });
  }
  for (let v = ys.step; v <= ys.max + 1e-9; v += ys.step) {
    line(ctx, l, Y(v), l + w, Y(v), { color: COLORS.grid, width: 1 });
    text(ctx, ys.fmt(v), l - 6, Y(v), { color: COLORS.text3, size: 10, family: 'mono', align: 'right' });
  }
  line(ctx, l, t - 4, l, t + h, { color: COLORS.axis, width: 1.2 });
  line(ctx, l, t + h, l + w + 4, t + h, { color: COLORS.axis, width: 1.2 });
  text(ctx, labels.x, l + w, t + h + 24, { color: COLORS.text2, size: 11, align: 'right', baseline: 'top' });
  ctx.save();
  ctx.translate(12, t + h / 2);
  ctx.rotate(-Math.PI / 2);
  text(ctx, labels.y, 0, 0, { color: COLORS.text2, size: 11, align: 'center' });
  ctx.restore();
  return { X, Y };
}

/** "v" with a subscript (or an overline for the mean), right-aligned at x. */
function speedLabel(ctx, kind, x, y, color) {
  const sub = kind === 'vp' ? 'հ' : kind === 'rms' ? 'քմ' : '';
  ctx.save();
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.font = font(9.5, { weight: 600 });
  const sw = sub ? ctx.measureText(sub).width : 0;
  ctx.font = font(13, { weight: 600, family: 'mono', style: 'italic' });
  const vw = ctx.measureText('v').width;
  const x0 = x - vw - sw;
  ctx.fillText('v', x0, y);
  if (sub) {
    ctx.font = font(9.5, { weight: 600 });
    ctx.fillText(sub, x0 + vw + 0.5, y + 4);
  } else {
    ctx.fillRect(x0 + 1, y - 7.5, vw - 1, 1.3);
  }
  ctx.restore();
}

/**
 * Dashed lines at v_p, v̄, v_rms from the x axis up to staggered label rows
 * in the top margin (rightmost line → highest row, so labels and lines never cross).
 * rows: y of the three label rows from top to bottom.
 */
export function drawMarkers(ctx, { X, Y }, speeds, rows, color, yAxis) {
  const order = [['rms', speeds.rms, rows[0]], ['mean', speeds.mean, rows[1]], ['vp', speeds.vp, rows[2]]];
  for (const [kind, v, ry] of order) {
    const x = X(v);
    line(ctx, x, yAxis, x, ry, { color, width: 1, dash: [3, 4] });
    speedLabel(ctx, kind, x - 4, ry, color);
  }
}
