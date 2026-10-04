// World-coordinate drawing helpers shared by both tabs.
// x to the right, y up; the scale and origin are set on every redraw.

import { arrow as arrowPx, circle, text } from '../../../assets/js/core/draw.js';

export function createWorld(view) {
  const { ctx } = view;
  const w = { scale: 1, ox: 0, oy: 0 };

  w.x = (x) => w.ox + x * w.scale;
  w.y = (y) => w.oy - y * w.scale;
  w.fromPx = (p) => ({ x: (p.x - w.ox) / w.scale, y: (w.oy - p.y) / w.scale });

  /** Visible world rectangle (+ margin in world units). */
  w.bounds = (margin = 0) => ({
    xMin: -w.ox / w.scale - margin,
    xMax: (view.width - w.ox) / w.scale + margin,
    yMin: -(view.height - w.oy) / w.scale - margin,
    yMax: w.oy / w.scale + margin,
  });

  /** Point where a ray from (x0,y0) along (dx,dy) leaves the visible world. */
  w.rayEnd = (x0, y0, dx, dy, margin = 2) => {
    const b = w.bounds(margin);
    let t = Infinity;
    if (dx > 0) t = Math.min(t, (b.xMax - x0) / dx);
    if (dx < 0) t = Math.min(t, (b.xMin - x0) / dx);
    if (dy > 0) t = Math.min(t, (b.yMax - y0) / dy);
    if (dy < 0) t = Math.min(t, (b.yMin - y0) / dy);
    return [x0 + dx * t, y0 + dy * t];
  };

  /** End of the segment (x0,y0)→(x1,y1), shortened if it leaves the visible world. */
  w.clipEnd = (x0, y0, x1, y1, margin = 2) => {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) return [x1, y1];
    const [ex, ey] = w.rayEnd(x0, y0, dx / len, dy / len, margin);
    return Math.hypot(ex - x0, ey - y0) < len ? [ex, ey] : [x1, y1];
  };

  w.line = (x1, y1, x2, y2, color, width = 1, dash = null) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(w.x(x1), w.y(y1));
    ctx.lineTo(w.x(x2), w.y(y2));
    ctx.stroke();
    ctx.restore();
  };
  /** Solid ray from (x0,y0) along a direction to the edge of the view. */
  w.ray = (x0, y0, dx, dy, color, width = 1.5) => {
    const len = Math.hypot(dx, dy);
    const [ex, ey] = w.rayEnd(x0, y0, dx / len, dy / len);
    w.line(x0, y0, ex, ey, color, width);
  };
  /** Dashed segment, shortened at the edge of the view. */
  w.dashed = (x0, y0, x1, y1, color, width = 1) => {
    const [ex, ey] = w.clipEnd(x0, y0, x1, y1);
    w.line(x0, y0, ex, ey, color, width, [4, 4]);
  };
  w.arrow = (x1, y1, x2, y2, color, width = 1.5) =>
    arrowPx(ctx, w.x(x1), w.y(y1), w.x(x2), w.y(y2), { color, width, head: 8, spread: 0.38 });
  w.dot = (x, y, r, fill, stroke, width = 1.5) =>
    circle(ctx, w.x(x), w.y(y), r, { fill, stroke, width });
  w.label = (str, x, y, color, align = 'left', baseline = 'middle', size = 12) =>
    text(ctx, str, w.x(x), w.y(y), { color, align, baseline, size, family: 'mono' });

  /** Small filled triangle at (x,y) pointing along (dx,dy) (world direction). */
  w.chevron = (x, y, dx, dy, color, size = 6) => {
    const a = Math.atan2(-dy, dx);              // screen angle (y is flipped)
    const px = w.x(x), py = w.y(y);
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(px + Math.cos(a) * size, py + Math.sin(a) * size);
    ctx.lineTo(px + Math.cos(a + 2.5) * size, py + Math.sin(a + 2.5) * size);
    ctx.lineTo(px + Math.cos(a - 2.5) * size, py + Math.sin(a - 2.5) * size);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  w.grid = (color) => {
    const b = w.bounds();
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.5;
    for (let x = Math.ceil(b.xMin); x <= b.xMax; x++) {
      ctx.beginPath(); ctx.moveTo(w.x(x), 0); ctx.lineTo(w.x(x), view.height); ctx.stroke();
    }
    for (let y = Math.ceil(b.yMin); y <= b.yMax; y++) {
      ctx.beginPath(); ctx.moveTo(0, w.y(y)); ctx.lineTo(view.width, w.y(y)); ctx.stroke();
    }
    ctx.restore();
  };

  return w;
}
