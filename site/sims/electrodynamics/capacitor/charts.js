// Scrolling U_C(t) and I(t) charts of the RC circuit.
// The curves are evaluated analytically from the model's segments, so they are
// exact at any time scale and frame rate.

import { fluidCanvas } from '../../../assets/js/core/canvas.js';
import { clear, line, text } from '../../../assets/js/core/draw.js';
import { COLORS, font, alpha } from '../../../assets/js/core/theme.js';
import { clamp } from '../../../assets/js/core/math.js';
import { segU, segI } from './physics.js';
import { UNITS, pickUnit, sig, minus } from './format.js';

const WINDOW_TAUS = 10;

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}
const decimalsFor = (step) => clamp(-Math.floor(Math.log10(step) + 1e-9), 0, 6);

/** Text with a background-colored outline, readable over curves. */
function haloText(ctx, str, x, y, opts) {
  ctx.save();
  ctx.font = font(opts.size ?? 11, { weight: opts.weight ?? 600, family: 'mono' });
  ctx.textAlign = opts.align ?? 'left';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = COLORS.canvasBg;
  ctx.strokeText(str, x, y);
  ctx.fillStyle = opts.color;
  ctx.fillText(str, x, y);
  ctx.restore();
}

/**
 * kind: 'u' | 'i'.   getState() → { model, tangent }
 */
export function createRCChart(canvas, kind, getState) {
  const view = fluidCanvas(canvas, {
    height: (w) => clamp(Math.round(w * 0.5), 200, 250),
    onResize: () => draw(),
  });
  const isU = kind === 'u';
  const color = () => (isU ? COLORS.blue : COLORS.coral);
  const val = isU ? segU : segI;

  function draw() {
    const { ctx, width: W, height: H } = view;
    if (!W) return;
    const { model, tangent } = getState();
    const { segs, T, P } = model;
    const seg = segs[segs.length - 1];
    clear(ctx, W, H, COLORS.canvasBg);

    const padL = 50, padR = 14, padT = 28, padB = 26;
    const plotW = W - padL - padR;
    const top = padT, bottom = H - padB;

    // ---- time window ----
    const win = WINDOW_TAUS * seg.tau;
    const tL = Math.max(0, T - win);
    const tR = tL + win;
    const X = (t) => padL + ((t - tL) / win) * plotW;

    // ---- sample the visible part of every segment ----
    const lines = [];
    let vmin = 0, vmax = 0;
    for (const s of segs) {
      const a = Math.max(s.T0, tL);
      const b = Math.min(s.T1 ?? T, T);
      if (b < a) continue;
      const n = clamp(Math.ceil(((b - a) / win) * plotW / 2), 1, 300);
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const t = a + ((b - a) * i) / n;
        const v = val(s, t);
        pts.push([t, v]);
        if (v > vmax) vmax = v;
        if (v < vmin) vmin = v;
      }
      lines.push(pts);
    }

    // ---- value axis ----
    let fac = 1, unitName = 'Վ';
    if (isU) {
      vmax = Math.max(vmax, P.eps);
    } else {
      [fac, unitName] = pickUnit(Math.max(vmax, -vmin) || 1, UNITS.current);
    }
    let hi = vmax / fac, lo = vmin / fac;
    if (hi - lo <= 0) hi = 1;
    const step = niceStep((hi - lo) / 4);
    const yMax = hi > 0 ? Math.ceil((hi * 1.04) / step - 1e-9) * step : 0;
    const yMin = lo < 0 ? Math.floor((lo * 1.04) / step + 1e-9) * step : 0;
    const Y = (v) => bottom - ((v / fac - yMin) / (yMax - yMin)) * (bottom - top);

    // ---- grid, ticks, axis labels ----
    const vd = decimalsFor(step);
    for (let y = Math.ceil(yMin / step - 1e-9) * step; y <= yMax + step * 1e-6; y += step) {
      const py = Y(y * fac);
      const zero = Math.abs(y) < step * 1e-6;
      line(ctx, padL, py, W - padR, py, { color: zero ? COLORS.axis : COLORS.grid, width: 1 });
      text(ctx, minus(y.toFixed(vd)), padL - 6, py, { color: COLORS.text3, size: 10, family: 'mono', align: 'right' });
    }
    const [tf, tName] = pickUnit(win, UNITS.time);
    const tStep = niceStep(win / tf / (W < 520 ? 4 : 8));
    const td = decimalsFor(tStep);
    for (let k = Math.ceil(tL / tf / tStep - 1e-9); k * tStep * tf <= tR * (1 + 1e-9); k++) {
      const x = X(k * tStep * tf);
      line(ctx, x, top, x, bottom, { color: COLORS.grid, width: 1 });
      if (x < W - padR - 40) {
        text(ctx, (k * tStep).toFixed(td), x, bottom + 12, { color: COLORS.text3, size: 10, family: 'mono', align: 'center' });
      }
    }
    text(ctx, `t, ${tName}`, W - padR, bottom + 12, { color: COLORS.text3, size: 11, align: 'right' });
    line(ctx, padL, top, padL, bottom, { color: COLORS.axis, width: 1 });

    // title with a subscript: U_C, Վ  /  I, մԱ
    if (isU) {
      text(ctx, 'U', padL, 13, { color: COLORS.text, size: 14, style: 'italic', family: 'display' });
      text(ctx, 'C', padL + 10, 17, { color: COLORS.text, size: 10, style: 'italic', family: 'display' });
      text(ctx, `, ${unitName}`, padL + 17, 13, { color: COLORS.text2, size: 11 });
    } else {
      text(ctx, 'I', padL, 13, { color: COLORS.text, size: 14, style: 'italic', family: 'display' });
      text(ctx, `, ${unitName}`, padL + 6, 13, { color: COLORS.text2, size: 11 });
    }

    // ---- clipped drawing area ----
    ctx.save();
    ctx.beginPath();
    ctx.rect(padL, top - 3, plotW, bottom - top + 6);
    ctx.clip();

    // ε level (voltage chart)
    if (isU) {
      const y = Y(P.eps);
      line(ctx, padL, y, W - padR, y, { color: alpha(COLORS.amber, 0.8), width: 1.2, dash: [6, 4] });
    }

    // τ and 5τ markers + 63 % level + tangent at the start of the latest segment
    const s0 = seg.T0;
    const marks = [[s0 + seg.tau, 'τ'], [s0 + 5 * seg.tau, '5τ']];
    for (const [t, lbl] of marks) {
      if (t < tL || t > tR) continue;
      const x = X(t);
      line(ctx, x, top, x, bottom, { color: alpha(COLORS.teal, 0.75), width: 1, dash: [2, 4] });
      text(ctx, lbl, x + 4, top + 8, { color: COLORS.teal, size: 10, weight: 700 });
    }
    if (tangent) {
      const v0 = val(seg, s0);
      const v1 = isU ? seg.Uinf : 0;
      line(ctx, X(s0), Y(v0), X(s0 + seg.tau), Y(v1), { color: alpha(color(), 0.6), width: 1.3, dash: [5, 4] });
    }

    // curves
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color();
    for (const pts of lines) {
      ctx.beginPath();
      pts.forEach(([t, v], i) => (i ? ctx.lineTo(X(t), Y(v)) : ctx.moveTo(X(t), Y(v))));
      ctx.stroke();
    }
    ctx.restore();

    // value at t0 + τ  (63 % of the way to the final level)
    const tTau = s0 + seg.tau;
    if (tTau >= tL && tTau <= tR) {
      const v = val(seg, tTau);
      const x = X(tTau), y = Y(v);
      line(ctx, padL, y, x, y, { color: alpha(COLORS.teal, 0.6), width: 1, dash: [2, 4] });
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.teal;
      ctx.fill();
      const rising = isU ? seg.Uinf > seg.U0 : segI(seg, s0) < 0;
      const label = isU ? `${sig(v, 3)} Վ` : `${sig(v / fac, 3)} ${unitName}`;
      haloText(ctx, label, Math.min(x + 7, W - padR - 48), y + (rising ? 11 : -11), { color: COLORS.teal, size: 10 });
    }

    // present moment
    if (T >= tL && T <= tR) {
      const x = X(T), y = Y(val(seg, T));
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = color();
      ctx.fill();
      ctx.strokeStyle = COLORS.canvasBg;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    if (isU) {
      haloText(ctx, 'ε', W - padR - 2, Y(P.eps) - 8, { color: COLORS.amber, size: 12, align: 'right', weight: 700 });
    }
  }

  return { draw };
}
