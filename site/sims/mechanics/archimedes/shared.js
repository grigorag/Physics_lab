// Helpers shared by both tabs: formatting, palette, small drawing utilities.

import { roundRect, arrow } from '../../../assets/js/core/draw.js';
import { COLORS, themed, alpha, font } from '../../../assets/js/core/theme.js';

/** Fixed-point number, decimal point. */
export const fmt = (v, digits = 2) => v.toFixed(digits);

/** Newtons with a sensible number of digits. */
export const fmtN = (F) => `${fmt(F, F < 100 ? 2 : 1)} Ն`;

// Liquid tints (hex) and the opacity of the filled liquid.
const LIQUID_TINT = {
  water:    ['#3d8fe0', 0.30],
  brine:    ['#35b3a8', 0.30],
  kerosene: ['#d9a21b', 0.28],
  spirit:   ['#9a8cf0', 0.26],
  glycerin: ['#79c46a', 0.30],
  mercury:  ['#9aa6b8', 0.62],
};

// Body colors. Fill is shared, the rim is derived from the theme.
const MATERIAL_FILL = {
  al:    '#9db3cf',
  fe:    '#6c7487',
  pb:    '#59607a',
  glass: '#7fd3cf',
  pine:  '#c8924f',
  cork:  '#d2ae76',
  ice:   '#bfe6f5',
  pe:    '#e7e9f0',
};

export const C = themed((light) => ({
  rim: light ? 'rgba(22,26,44,0.62)' : 'rgba(232,234,246,0.7)',
  glass: light ? 'rgba(22,26,44,0.5)' : 'rgba(200,210,240,0.55)',
  metal: light ? '#7d88a8' : '#5a6794',
  table: light ? '#8791b0' : '#4a557f',
  weight: COLORS.red,
  spring: COLORS.teal,
  buoy: COLORS.blue,
  normal: COLORS.amber,
  pillBg: light ? 'rgba(252,253,255,0.88)' : 'rgba(11,14,23,0.82)',
}));

export function liquidColor(id, a = null) {
  const [hex, op] = LIQUID_TINT[id] ?? LIQUID_TINT.water;
  return alpha(hex, a ?? op);
}

/** Body fill: a material colour, or (for the custom density) a shade by density. */
export function bodyFill(id, rho) {
  if (MATERIAL_FILL[id]) return MATERIAL_FILL[id];
  const t = Math.min(1, Math.max(0, Math.log(rho / 100) / Math.log(120)));   // 100…12000
  const l = 80 - 48 * t;
  return `hsl(268 38% ${l}%)`;
}

/** Block with a rim (the liquid tint is added on top by the caller). */
export function drawBlock(ctx, x, y, w, h, fill, id) {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.globalAlpha = id === 'glass' || id === 'ice' ? 0.78 : 0.94;
  roundRect(ctx, x, y, w, h, 3);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = C.rim;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

/** Text on a small rounded background so it stays legible over any scene. */
export function pill(ctx, str, x, y, { color = COLORS.text, size = 11, align = 'left', family = 'sans', weight = 600 } = {}) {
  ctx.save();
  ctx.font = font(size, { weight, family });
  const w = ctx.measureText(str).width + 8;
  const h = size + 6;
  const x0 = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
  ctx.fillStyle = C.pillBg;
  roundRect(ctx, x0, y - h / 2, w, h, 4);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x0 + 4, y + 0.5);
  ctx.restore();
}

/** Vector symbol with an optional subscript, on a small background: F_Ա */
export function symbolPill(ctx, main, sub, x, y, { color, align = 'left', size = 12, value = '' } = {}) {
  ctx.save();
  const fMain = font(size, { weight: 700, style: 'italic', family: 'display' });
  const fSub = font(size - 3, { weight: 700 });
  ctx.font = fMain;
  const w1 = ctx.measureText(main).width;
  ctx.font = fSub;
  const w2 = sub ? ctx.measureText(sub).width : 0;
  const fVal = font(size - 1, { weight: 600, family: 'mono' });
  ctx.font = fVal;
  const w3 = value ? ctx.measureText(` ${value}`).width : 0;
  const w = w1 + w2 + w3 + 8;
  const h = size + 6;
  const x0 = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
  ctx.fillStyle = C.pillBg;
  roundRect(ctx, x0, y - h / 2, w, h, 4);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = fMain;
  ctx.fillText(main, x0 + 4, y + 0.5);
  if (sub) {
    ctx.font = fSub;
    ctx.fillText(sub, x0 + 4 + w1, y + 4);
  }
  if (value) {
    ctx.font = fVal;
    ctx.fillText(` ${value}`, x0 + 4 + w1 + w2, y + 0.5);
  }
  ctx.restore();
}

/** Arrow with a thin outline in the canvas colour, readable over any body. */
export function haloArrow(ctx, x1, y1, x2, y2, color, width = 2.5) {
  arrow(ctx, x1, y1, x2, y2, { color: C.pillBg, width: width + 3, head: 11, spread: 0.5 });
  arrow(ctx, x1, y1, x2, y2, { color, width, head: 10, spread: 0.45 });
}
