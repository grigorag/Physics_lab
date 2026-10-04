// The specific-binding-energy chart E/A(A), shared by the "curve" and the
// "reaction" tabs. Pure drawing: takes a context and options, returns the
// screen positions of the points for hit-testing.

import { line, arrow, text, roundRect } from '../../../assets/js/core/draw.js';
import { COLORS, alpha, font } from '../../../assets/js/core/theme.js';
import { NUCLIDES, semfTrend } from './physics.js';
import { C, label } from './shared.js';

export const A_MAX = 240;
export const E_MAX = 10;
const A_PEAK = 60;                      // the iron–nickel maximum
const KEY_LABELS = new Set(['H2', 'He4', 'Li6', 'C12', 'O16', 'Fe56', 'U235']);

export function chartLayout(W, H) {
  const narrow = W < 520;
  const m = { l: narrow ? 36 : 48, r: 12, t: 12, b: narrow ? 40 : 44 };
  const pw = W - m.l - m.r;
  const ph = H - m.t - m.b;
  return {
    W, H, m, narrow, pw, ph,
    x: (A) => m.l + (A / A_MAX) * pw,
    y: (e) => m.t + ph * (1 - e / E_MAX),
  };
}

function axes(ctx, L) {
  const { m, W, H, x, y, narrow } = L;
  const x0 = m.l, x1 = W - m.r, y0 = H - m.b, y1 = m.t;
  const stepA = narrow ? 40 : 20;
  for (let A = 0; A <= A_MAX; A += stepA) {
    line(ctx, x(A), y0, x(A), y1, { color: COLORS.grid });
    text(ctx, String(A), x(A), y0 + 11, { color: COLORS.text3, size: 10.5, family: 'mono', align: 'center' });
  }
  for (let e = 0; e <= E_MAX; e += 1) {
    line(ctx, x0, y(e), x1, y(e), { color: COLORS.grid });
    if (!narrow || e % 2 === 0) {
      text(ctx, String(e), x0 - 6, y(e), { color: COLORS.text3, size: 10.5, family: 'mono', align: 'right' });
    }
  }
  line(ctx, x0, y0, x1, y0, { color: COLORS.axis });
  line(ctx, x0, y0, x0, y1, { color: COLORS.axis });
  text(ctx, 'զանգվածային թիվ A', (x0 + x1) / 2, H - 10, { color: COLORS.text2, size: 11.5, align: 'center' });
  ctx.save();
  ctx.translate(11, (y0 + y1) / 2);
  ctx.rotate(-Math.PI / 2);
  text(ctx, 'E/A, ՄէՎ/նուկլոն', 0, 0, { color: COLORS.text2, size: 11.5, align: 'center' });
  ctx.restore();
}

function curve(ctx, L) {
  ctx.save();
  ctx.strokeStyle = alpha(C.curve, 0.75);
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let A = 6; A <= A_MAX; A += 0.5) {
    const px = L.x(A), py = L.y(semfTrend(A));
    if (A === 6) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.restore();
}

/** The fusion / fission regions, the maximum and the direction arrows. */
function regions(ctx, L) {
  const { x, y, m, H, W, narrow } = L;
  const xp = x(A_PEAK);
  ctx.fillStyle = alpha(C.fusion, 0.06);
  ctx.fillRect(m.l, m.t, xp - m.l, H - m.b - m.t);
  ctx.fillStyle = alpha(C.fission, 0.05);
  ctx.fillRect(xp, m.t, W - m.r - xp, H - m.b - m.t);

  // Maximum ≈ 8.8 MeV per nucleon (⁶²Ni, ⁵⁶Fe).
  line(ctx, m.l, y(8.79), W - m.r, y(8.79), { color: alpha(C.peak, 0.7), dash: [5, 4] });
  line(ctx, xp, y(8.79), xp, H - m.b, { color: alpha(C.peak, 0.45), dash: [3, 4] });
  const t = narrow ? 'առավելագույնը ≈ 8.8 ՄէՎ (Fe, Ni)' : 'առավելագույնը ≈ 8.8 ՄէՎ/նուկլոն (⁵⁶Fe, ⁶²Ni)';
  ctx.font = font(11, { weight: 600 });
  const tw = ctx.measureText(t).width;
  const tx = Math.min(Math.max(xp - 30, m.l + 6), W - m.r - tw - 6);
  text(ctx, t, tx, y(9.45), { color: C.peak, size: 11, weight: 600 });

  // Direction arrows.
  const ya = y(narrow ? 4.2 : 4);
  arrow(ctx, x(12), ya, x(A_PEAK - 8), ya, { color: C.fusion, width: 2.5, head: 10 });
  text(ctx, 'սինթեզ →', x((12 + A_PEAK - 8) / 2), ya - 13, { color: C.fusion, size: 12, weight: 700, align: 'center' });
  arrow(ctx, x(232), ya, x(A_PEAK + 30), ya, { color: C.fission, width: 2.5, head: 10 });
  text(ctx, '← բաժանում', x((232 + A_PEAK + 30) / 2), ya - 13, { color: C.fission, size: 12, weight: 700, align: 'center' });
}

/** A small rounded tag next to a point. */
export function tag(ctx, str, px, py, { color = COLORS.text, bg = COLORS.canvasBg, size = 11, side = 'right', L } = {}) {
  ctx.font = font(size, { weight: 600, family: 'mono' });
  const w = ctx.measureText(str).width + 10;
  const h = size + 7;
  let x = side === 'right' ? px + 8 : px - 8 - w;
  if (L) x = Math.min(Math.max(x, L.m.l + 2), L.W - L.m.r - w - 2);
  let y = py - h - 4;
  if (L && y < L.m.t + 2) y = py + 6;
  ctx.save();
  ctx.fillStyle = alpha(bg, 0.88);
  ctx.strokeStyle = alpha(color, 0.5);
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, h, 5);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  text(ctx, str, x + 5, y + h / 2 + 0.5, { color, size, weight: 600, family: 'mono' });
}

/**
 * opts.selected   key of the highlighted nuclide (or null)
 * opts.showCurve  draw the Weizsäcker trend
 * opts.allLabels  label every point (otherwise a few key ones)
 * opts.focus      Set of keys to keep bright (others are dimmed); null = all
 * opts.regions    draw fusion/fission regions and arrows
 * Returns [{ key, x, y }] for hit-testing.
 */
export function drawChart(ctx, L, { selected = null, showCurve = true, allLabels = false, focus = null, regions: showRegions = true } = {}) {
  if (showRegions) regions(ctx, L);
  axes(ctx, L);
  if (showCurve) curve(ctx, L);

  const pts = [];
  for (const n of NUCLIDES) {
    const px = L.x(n.A), py = L.y(n.eps);
    pts.push({ key: n.key, x: px, y: py });
    const dim = focus && !focus.has(n.key);
    ctx.beginPath();
    ctx.arc(px, py, dim ? 3 : 4, 0, Math.PI * 2);
    ctx.fillStyle = dim ? alpha(COLORS.text3, 0.35) : C.point;
    ctx.fill();
    if (!dim) {
      ctx.strokeStyle = COLORS.canvasBg;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }
  // Labels after the points so they sit on top.
  if (!focus) {
    for (const n of NUCLIDES) {
      if (n.key === selected) continue;
      if (!allLabels && !KEY_LABELS.has(n.key)) continue;
      const px = L.x(n.A), py = L.y(n.eps);
      const right = n.A < 200;
      text(ctx, label(n), px + (right ? 6 : -6), py + 10, {
        color: COLORS.text2, size: 10.5, family: 'mono', align: right ? 'left' : 'right',
      });
    }
  }
  if (selected) {
    const n = NUCLIDES.find((k) => k.key === selected);
    const px = L.x(n.A), py = L.y(n.eps);
    ctx.beginPath();
    ctx.arc(px, py, 9, 0, Math.PI * 2);
    ctx.strokeStyle = C.peak;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fillStyle = C.peak;
    ctx.fill();
    tag(ctx, `${label(n)}  ${n.eps.toFixed(2)} ՄէՎ`, px, py, { color: C.peak, side: n.A > 150 ? 'left' : 'right', L });
  }
  return pts;
}
