// Helpers shared by the two tabs: number formatting and canvas symbols.

import { text } from '../../../assets/js/core/draw.js';
import { font } from '../../../assets/js/core/theme.js';

/** Fixed-point number with a typographic minus and no "−0.00". */
export function fmt(v, digits = 2) {
  const s = v.toFixed(digits);
  if (parseFloat(s) === 0) return s.replace('-', '');
  return s.replace('-', '−');
}

/** Signed small number for conservation checks: values below the print precision show as 0. */
export const fmtZero = (v, digits = 3) => fmt(Math.abs(v) < 0.5 * 10 ** -digits ? 0 : v, digits);

/**
 * Italic symbol with a subscript and an optional prime, e.g. p₁′:
 *   symbol(ctx, 'p', '1', x, y, { color, prime: true })
 */
export function symbol(ctx, base, sub, x, y, {
  color, size = 13, align = 'center', prime = false, weight = 600,
} = {}) {
  const main = base;
  const subSize = Math.round(size * 0.72);
  ctx.save();
  ctx.font = font(size, { style: 'italic', weight, family: 'display' });
  const w0 = ctx.measureText(main).width;
  const w2 = prime ? ctx.measureText('′').width : 0;
  ctx.font = font(subSize, { weight });
  const w1 = sub ? ctx.measureText(sub).width + 1 : 0;
  ctx.restore();
  const total = w0 + w1 + w2;
  const x0 = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  text(ctx, main, x0, y, { color, size, style: 'italic', weight, family: 'display' });
  if (sub) text(ctx, sub, x0 + w0 + 1, y + size * 0.28, { color, size: subSize, weight });
  if (prime) text(ctx, '′', x0 + w0 + w1, y, { color, size, style: 'italic', weight, family: 'display' });
  return total;
}

/** Round to a "nice" scale limit (1, 2, 5 × 10ⁿ). */
export function niceMax(v) {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}
