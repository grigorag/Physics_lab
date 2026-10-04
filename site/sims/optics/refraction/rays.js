// Drawing helpers shared by both experiments: the themed palette, light rays
// whose brightness follows their intensity, angle arcs and text "pills".

import { COLORS, themed, alpha, font } from '../../../assets/js/core/theme.js';
import { roundRect } from '../../../assets/js/core/draw.js';

export const C = themed((light) => ({
  ray: light ? '#d92a1c' : '#ff5a47',          // red laser beam, visible on both grounds
  medium: light ? '#1f72c4' : '#4ea8ef',       // tint of an optically dense medium
  laser: light ? '#3a4160' : '#c9cfe6',
  laserRim: light ? '#161a2c' : '#ffffff',
  incident: COLORS.amber,                      // α
  reflected: COLORS.teal,                      // β
  refracted: COLORS.purple,                    // γ
}));

/** Tint strength of a medium with refractive index n (air stays clear). */
export const mediumTint = (n) => alpha(C.medium, Math.min(0.34, 0.2 * (n - 1)));

/**
 * A light ray from (x1,y1) to (x2,y2) with an arrowhead on the way.
 * intensity 0…1 sets opacity and width (square-root scale, so that a 4 %
 * reflection is still visible).
 */
export function drawRay(ctx, x1, y1, x2, y2, { intensity = 1, arrowAt = 0.56, dash = null } = {}) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 1 || intensity <= 0) return;
  const k = Math.sqrt(Math.min(1, intensity));
  const a = 0.16 + 0.84 * k;
  const w = 1.2 + 2 * k;
  const ux = (x2 - x1) / len, uy = (y2 - y1) / len;

  ctx.save();
  ctx.lineCap = 'round';
  if (dash) ctx.setLineDash(dash);
  if (!dash) {
    ctx.strokeStyle = alpha(C.ray, a * 0.16);
    ctx.lineWidth = w * 3.2;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  ctx.strokeStyle = alpha(C.ray, a);
  ctx.lineWidth = dash ? 1.2 : w;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();

  if (arrowAt != null && len > 30) {
    const h = 8 + 3 * k;
    const px = x1 + ux * (len * arrowAt + h / 2), py = y1 + uy * (len * arrowAt + h / 2);
    const nx = -uy, ny = ux;
    ctx.setLineDash([]);
    ctx.fillStyle = alpha(C.ray, a);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px - ux * h + nx * h * 0.42, py - uy * h + ny * h * 0.42);
    ctx.lineTo(px - ux * h - nx * h * 0.42, py - uy * h - ny * h * 0.42);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Text on a translucent rounded background, so it stays legible over lines. */
export function pill(ctx, str, x, y, { color = COLORS.text, size = 12, align = 'center', family = 'mono', weight = 600 } = {}) {
  ctx.save();
  ctx.font = font(size, { family, weight });
  const w = ctx.measureText(str).width;
  const left = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  ctx.fillStyle = alpha(COLORS.canvasBg, 0.82);
  roundRect(ctx, left - 5, y - size * 0.5 - 4, w + 10, size + 8, 6);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(str, left, y + 0.5);
  ctx.restore();
  return w;
}

/**
 * Arc of the angle between the normal direction `n` and the ray direction `u`
 * (unit vectors pointing away from the vertex), with a label next to it.
 * The label goes inside the wedge when it fits there within `maxRadius`,
 * otherwise just outside the ray (`opposite`: beyond the normal instead);
 * `towards` is the side to use when the ray coincides with the normal.
 */
export function angleArc(ctx, ox, oy, n, u, r, color, label, { labelGap = 17, size = 12, towards = { x: -n.y, y: n.x }, maxRadius = r * 2, opposite = false, clampX = null } = {}) {
  const a0 = Math.atan2(n.y, n.x);
  const a1 = Math.atan2(u.y, u.x);
  let diff = a1 - a0;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;

  ctx.save();
  if (Math.abs(diff) > 1e-4) {
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.arc(ox, oy, r, a0, a1, diff < 0);
    ctx.closePath();
    ctx.fillStyle = alpha(color, 0.16);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ox, oy, r, a0, a1, diff < 0);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
  ctx.restore();

  if (!label) return;
  ctx.save();
  ctx.font = font(size, { family: 'mono', weight: 600 });
  const half = ctx.measureText(label).width / 2 + 5;
  ctx.restore();
  // Unit tangent pointing from the normal towards the ray.
  const dn = u.x * n.x + u.y * n.y;
  let tx = u.x - dn * n.x, ty = u.y - dn * n.y;
  const tl = Math.hypot(tx, ty);
  if (tl < 1e-6) { tx = towards.x; ty = towards.y; } else { tx /= tl; ty /= tl; }

  // Inside the wedge, on the bisector, where the wedge is wide enough for the text…
  const rho = Math.max(r + labelGap, (half + 9) / Math.max(1e-6, Math.sin(Math.abs(diff) / 2)));
  const mid = a0 + diff / 2;
  let px = ox + Math.cos(mid) * Math.min(rho, maxRadius);
  let py = oy + Math.sin(mid) * Math.min(rho, maxRadius);
  if (rho > maxRadius) {
    // …otherwise just outside the ray, on the side away from the normal —
    // unless that would push the label across the boundary.
    const du = tx * u.x + ty * u.y;
    let qx = tx - du * u.x, qy = ty - du * u.y;
    const ql = Math.hypot(qx, qy) || 1;
    qx /= ql; qy /= ql;
    const gap = Math.abs(qx) * half + Math.abs(qy) * (size / 2 + 4) + 7;
    const x = ox + u.x * (r + 22) + qx * gap;
    const y = oy + u.y * (r + 22) + qy * gap;
    if ((x - ox) * n.x + (y - oy) * n.y >= size / 2 + 10) { px = x; py = y; }
  }
  if (opposite) {
    // On the far side of the normal, next to the arc.
    px = ox - tx * (half + 6) + n.x * r * 0.6;
    py = oy - ty * (half + 6) + n.y * r * 0.6;
  }
  if (clampX) px = Math.min(Math.max(px, clampX[0] + half + 2), clampX[1] - half - 2);
  pill(ctx, label, px, py, { color, size });
}
