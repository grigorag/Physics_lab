// Canvas drawing primitives. All take the 2D context first and work in the
// view's logical (CSS-pixel) coordinates.

import { TAU } from './math.js';
import { font } from './theme.js';

export function clear(ctx, width, height, color) {
  if (color) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.clearRect(0, 0, width, height);
  }
}

export function line(ctx, x1, y1, x2, y2, { color = '#fff', width = 1, dash = null, cap = 'butt' } = {}) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = cap;
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

/** Arrow from (x1,y1) to (x2,y2). head = head length in px, spread = half-angle in rad. */
export function arrow(ctx, x1, y1, x2, y2, { color = '#fff', width = 2, head = 9, spread = 0.42 } = {}) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  const a = Math.atan2(dy, dx);
  const h = Math.min(head, len);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2 - Math.cos(a) * h * 0.8, y2 - Math.sin(a) * h * 0.8);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - h * Math.cos(a - spread), y2 - h * Math.sin(a - spread));
  ctx.lineTo(x2 - h * Math.cos(a + spread), y2 - h * Math.sin(a + spread));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function circle(ctx, x, y, r, { fill = null, stroke = null, width = 1.5 } = {}) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
  }
}

/**
 * Text with the site fonts.
 *   text(ctx, 'F', x, y, { color, size: 11, family: 'mono', align: 'center' })
 */
export function text(ctx, str, x, y, {
  color = '#e8eaf6',
  size = 12,
  weight = 500,
  family = 'sans',
  style = '',
  align = 'left',
  baseline = 'middle',
} = {}) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = font(size, { weight, family, style });
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(str, x, y);
  ctx.restore();
}

/** Rounded-rectangle path (call fill()/stroke() afterwards). */
export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
