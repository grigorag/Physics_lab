// Helpers shared by the three tabs: labels, number formats, nucleon colours.

import { COLORS, themed } from '../../../assets/js/core/theme.js';
import { TAU } from '../../../assets/js/core/math.js';

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
export const sup = (n) => String(n).replace(/\d/g, (d) => SUP[d]);

/** Canvas label of a particle: '⁴He', 'n'. */
export const label = (p) => (p.key === 'n' ? 'n' : `${sup(p.A)}${p.sym}`);
/** HTML label: '<sup>4</sup>He'. */
export const html = (p) => (p.key === 'n' ? 'n' : `<sup>${p.A}</sup>${p.sym}`);

/** Fixed decimals with a decimal point. */
export const fx = (v, d) => v.toFixed(d);

/** 3.37·10¹⁴ */
export function sci(v, digits = 2) {
  if (v === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(v)));
  const m = v / 10 ** e;
  const exp = e < 0 ? `⁻${sup(-e)}` : sup(e);
  return `${m.toFixed(digits)}·10${exp}`;
}

export const C = themed((light) => ({
  proton: COLORS.red,
  neutron: light ? '#7d88a8' : '#9ba6c6',
  ballEdge: light ? 'rgba(20,26,50,0.35)' : 'rgba(0,0,0,0.45)',
  shine: light ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.55)',
  metal: light ? '#8a93ad' : '#6d7898',
  metalDark: light ? '#5d6683' : '#9aa4c4',
  point: COLORS.green,
  fusion: COLORS.teal,
  fission: COLORS.coral,
  curve: COLORS.purple,
  peak: COLORS.amber,
  energy: COLORS.amber,
}));

/** A shaded nucleon ball. */
export function ball(ctx, x, y, r, color) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, C.shine);
  g.addColorStop(0.35, color);
  g.addColorStop(1, color);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = g;
  ctx.fill();
  if (r > 2.5) {
    ctx.strokeStyle = C.ballEdge;
    ctx.lineWidth = r > 6 ? 1 : 0.6;
    ctx.stroke();
  }
}
