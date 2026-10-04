// Helpers shared by the tabs: palette, number formatting, particle drawing.

import { COLORS, themed, alpha } from '../../../assets/js/core/theme.js';
import { TAU } from '../../../assets/js/core/math.js';

/** Sim-local palette (rebuilt in place when the theme changes). */
export const C = themed((light) => ({
  u235: COLORS.green,
  u238: light ? '#9aa0b4' : '#5d6584',
  neutron: COLORS.blue,
  proton: COLORS.coral,
  nucleon: light ? '#5f8fcf' : '#6f9fe0',
  fragment: COLORS.coral,
  flash: COLORS.amber,
  rod: light ? '#4a5068' : '#9aa3bf',
  moderator: alpha(COLORS.blue, light ? 0.07 : 0.09),
  fuelFill: alpha(COLORS.green, light ? 0.09 : 0.1),
  fuelLine: alpha(COLORS.green, 0.45),
  lumpFill: alpha(COLORS.green, light ? 0.06 : 0.07),
  lumpLine: alpha(COLORS.green, 0.5),
}));

/** Fixed-point number with a typographic minus. */
export function fmt(v, digits = 2) {
  const s = v.toFixed(digits);
  if (parseFloat(s) === 0) return s.replace('-', '');
  return s.replace('-', '−');
}

const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };

/** Scientific notation as text: 3.20·10⁻¹¹. */
export function sci(v, digits = 2) {
  if (v === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(v)));
  const m = v / 10 ** e;
  if (e >= -2 && e <= 3) return fmt(v, Math.max(0, digits - e));
  return `${fmt(m, digits)}·10${String(e).split('').map((c) => SUP[c]).join('')}`;
}

/** Integer with thin-space thousands separators. */
export const int = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** Verdict for a multiplication factor. */
export function kVerdict(k) {
  if (!(k === k)) return null;
  if (k < 0.9) return { cls: 'red', text: 'մարող' };
  if (k <= 1.1) return { cls: 'amber', text: 'կրիտիկական' };
  return { cls: 'green', text: 'աճող' };
}

/**
 * Draws the particles of a world through a world→screen map.
 * opts: { X, Y, s (px per unit), fragmentLife, rNuc }
 */
export function drawParticles(ctx, w, { X, Y, s, fragmentLife = Infinity, rNuc }) {
  // Nuclei: one path per kind
  for (const [type, color] of [[238, C.u238], [235, C.u235]]) {
    ctx.beginPath();
    for (const q of w.nuclei) {
      if (!q.alive || q.type !== type) continue;
      const x = X(q.x), y = Y(q.y);
      ctx.moveTo(x + rNuc, y);
      ctx.arc(x, y, rNuc, 0, TAU);
    }
    ctx.fillStyle = color;
    ctx.fill();
  }

  // Fission fragments
  ctx.fillStyle = C.fragment;
  for (const f of w.fragments) {
    const a = fragmentLife === Infinity ? 1 : Math.max(0, 1 - f.age / fragmentLife);
    if (a <= 0) continue;
    ctx.globalAlpha = 0.85 * a;
    const r = Math.max(1.2, rNuc * (f.big ? 0.62 : 0.5));
    ctx.beginPath();
    ctx.arc(X(f.x), Y(f.y), r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Flashes of released energy
  for (const f of w.flashes) {
    const k = f.age / 0.4;
    const r = rNuc * (1.5 + 5 * k);
    const g = ctx.createRadialGradient(X(f.x), Y(f.y), 0, X(f.x), Y(f.y), r);
    g.addColorStop(0, alpha(C.flash, 0.75 * (1 - k)));
    g.addColorStop(1, alpha(C.flash, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(X(f.x), Y(f.y), r, 0, TAU);
    ctx.fill();
  }

  // Neutrons with short tails
  const tail = 0.05 / w.speed;               // s of flight shown as a tail
  ctx.strokeStyle = alpha(C.neutron, 0.45);
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const n of w.neutrons) {
    const x = X(n.x), y = Y(n.y);
    ctx.moveTo(x, y);
    ctx.lineTo(x - n.vx * tail * s, y + n.vy * tail * s);
  }
  ctx.stroke();
  ctx.fillStyle = C.neutron;
  ctx.beginPath();
  const rn = Math.max(1.8, rNuc * 0.7);
  for (const n of w.neutrons) {
    const x = X(n.x), y = Y(n.y);
    ctx.moveTo(x + rn, y);
    ctx.arc(x, y, rn, 0, TAU);
  }
  ctx.fill();
}

export function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}
