// Helpers shared by both tabs: number formatting, the two-lane scrolling
// chart and the centre-zero pointer meter (galvanometer / voltmeter).

import { fluidCanvas } from '../../../assets/js/core/canvas.js';
import { clear, line, text, circle, roundRect } from '../../../assets/js/core/draw.js';
import { COLORS } from '../../../assets/js/core/theme.js';
import { clamp, DEG } from '../../../assets/js/core/math.js';

/** Fixed-point number with a typographic minus and no "−0.00". */
export function fmt(v, digits = 2) {
  const s = v.toFixed(digits);
  if (parseFloat(s) === 0) return s.replace('-', '');
  return s.replace('-', '−');
}

/** Number with ~3 significant digits (fixed point). */
export function fmtSig(v, sig = 3) {
  const a = Math.abs(v);
  if (a === 0 || !Number.isFinite(v)) return '0';
  const digits = clamp(sig - 1 - Math.floor(Math.log10(a)), 0, 6);
  return fmt(v, digits);
}

/** Smallest 1·10ⁿ, 2·10ⁿ or 5·10ⁿ that is ≥ v. */
export function niceCeil(v) {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const f = v / p;
  return (f <= 1.0001 ? 1 : f <= 2.0001 ? 2 : f <= 3.0001 ? 3 : f <= 5.0001 ? 5 : 10) * p;
}

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

/** Tick label for ±scale: few digits, typographic minus. */
function tickLabel(v) {
  const a = Math.abs(v);
  if (a < 1e-12) return '0';
  const digits = a >= 10 ? 0 : a >= 1 ? (Number.isInteger(v) ? 0 : 1) : clamp(1 - Math.floor(Math.log10(a)), 1, 4);
  return fmt(v, digits);
}

/**
 * Scrolling time chart with one lane per quantity, sharing the time axis.
 * getData() → {
 *   samples: [[t, …], …], t, window,
 *   timeUnit: { factor, label }   (e.g. { factor: 1000, label: 't, մվ' })
 *   lanes: [{ color, label, scale, get: (sample) => value }],
 * }
 * Each lane is drawn from −scale to +scale (in the lane's display units).
 */
export function createLaneChart(canvas, getData) {
  const view = fluidCanvas(canvas, {
    height: (w) => clamp(Math.round(w * 0.36), 230, 290),
    onResize: () => draw(),
  });

  function draw() {
    const { ctx, width: W, height: H } = view;
    if (!W) return;
    const { samples, t, window, lanes, timeUnit = { factor: 1, label: 't, վ' } } = getData();
    clear(ctx, W, H, COLORS.canvasBg);

    const padL = 50, padR = 12, padB = 22, padT = 6;
    const labelH = 18, gap = 8;
    const plotW = W - padL - padR;
    const laneH = (H - padT - padB - lanes.length * (labelH + gap) + gap) / lanes.length;
    const t0 = Math.max(0, t - window);
    const X = (tt) => padL + ((tt - t0) / window) * plotW;

    // Time grid (shared)
    const unitT = timeUnit.factor;
    const step = niceStep((window * unitT) / (W < 520 ? 4 : 8)) / unitT;
    const digits = Math.max(0, -Math.floor(Math.log10(step * unitT) + 1e-9));
    const top0 = padT + labelH;
    const bottom = H - padB;
    for (let k = Math.ceil(t0 / step - 1e-9); k * step <= t0 + window + 1e-9; k++) {
      const x = X(k * step);
      line(ctx, x, top0, x, bottom, { color: COLORS.grid, width: 1 });
      if (x < W - padR - 44) {
        text(ctx, (k * step * unitT).toFixed(digits), x, bottom + 11, {
          color: COLORS.text3, size: 10, family: 'mono', align: 'center',
        });
      }
    }
    text(ctx, timeUnit.label, W - padR, bottom + 11, { color: COLORS.text3, size: 11, align: 'right' });

    lanes.forEach((lane, i) => {
      const ly = padT + i * (laneH + labelH + gap);
      const top = ly + labelH;
      const mid = top + laneH / 2;
      const half = laneH / 2 / 1.1;

      // Label
      line(ctx, padL, ly + 8, padL + 14, ly + 8, { color: COLORS[lane.color], width: 2.5, cap: 'round' });
      text(ctx, lane.label, padL + 20, ly + 8, { color: COLORS.text2, size: 11 });

      // Guides: +scale, 0, −scale
      for (const v of [1, 0, -1]) {
        const y = mid - v * half;
        line(ctx, padL, y, W - padR, y, v === 0
          ? { color: COLORS.axis, width: 1 }
          : { color: COLORS.axis, width: 1, dash: [3, 5] });
        text(ctx, tickLabel(v * lane.scale), padL - 6, y, {
          color: COLORS.text3, size: 10, family: 'mono', align: 'right',
        });
      }
      line(ctx, padL, top, padL, top + laneH, { color: COLORS.axis, width: 1 });

      if (samples.length < 2) return;
      ctx.save();
      ctx.beginPath();
      ctx.rect(padL, top - 1, plotW, laneH + 2);
      ctx.clip();
      ctx.strokeStyle = COLORS[lane.color];
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      let started = false;
      for (const s of samples) {
        if (s[0] < t0 - window * 0.02) continue;
        const x = X(s[0]);
        const y = mid - clamp(lane.get(s) / lane.scale, -1.15, 1.15) * half;
        if (started) ctx.lineTo(x, y); else { ctx.moveTo(x, y); started = true; }
      }
      ctx.stroke();
      ctx.restore();
    });
  }

  return { draw };
}

/** Keeps samples [t, …] of the last `window` seconds (plus a small margin). */
export function trimSamples(samples, t, window) {
  const tMin = t - window * 1.05;
  let k = 0;
  while (k < samples.length - 2 && samples[k + 1][0] < tMin) k++;
  if (k) samples.splice(0, k);
}

/**
 * Centre-zero pointer meter. (cx, cy) is the centre of the box; R the scale
 * radius. Returns the positions of the two terminals (bottom left / right).
 *   value / full sets the needle; labels are −full, 0, +full.
 */
export function drawMeter(ctx, cx, cy, R, { value, full, unit, letter, needle, face, rim }) {
  const SWING = 50 * DEG;
  const boxW = 2.3 * R, boxH = 1.32 * R;
  const bx = cx - boxW / 2, by = cy - boxH / 2;
  const P = { x: cx, y: by + boxH - 0.14 * R };        // needle pivot

  ctx.save();
  ctx.fillStyle = face;
  ctx.strokeStyle = rim;
  ctx.lineWidth = 1.5;
  roundRect(ctx, bx, by, boxW, boxH, 10);
  ctx.fill();
  ctx.stroke();

  // Scale arc and ticks
  const Rs = R * 0.98;
  ctx.strokeStyle = COLORS.text2;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(P.x, P.y, Rs, -Math.PI / 2 - SWING, -Math.PI / 2 + SWING);
  ctx.stroke();
  for (let k = -10; k <= 10; k++) {
    const a = (k / 10) * SWING;
    const major = k % 5 === 0;
    const r1 = Rs, r2 = Rs + (major ? 7 : 4);
    const sx = Math.sin(a), sy = -Math.cos(a);
    line(ctx, P.x + sx * r1, P.y + sy * r1, P.x + sx * r2, P.y + sy * r2, {
      color: major ? COLORS.text2 : COLORS.text3, width: major ? 1.4 : 1,
    });
  }
  const size = R < 60 ? 9 : 10;
  for (const k of [-1, 0, 1]) {
    const a = k * SWING;
    const r = Rs - (k ? 13 : 10);
    text(ctx, tickLabel(k * full), P.x + Math.sin(a) * r, P.y - Math.cos(a) * r + 2, {
      color: COLORS.text2, size, family: 'mono', align: k < 0 ? 'left' : k > 0 ? 'right' : 'center',
    });
  }
  text(ctx, letter, cx - R * 0.84, P.y - R * 0.12, { color: COLORS.text3, size: R < 60 ? 14 : 17, weight: 700, family: 'display', align: 'center' });
  text(ctx, unit, cx + R * 0.84, P.y - R * 0.12, { color: COLORS.text3, size: R < 60 ? 10 : 11, align: 'center' });

  // Needle
  const ratio = clamp(value / full, -1.12, 1.12);
  const a = ratio * SWING;
  const L = Rs + 2;
  line(ctx, P.x, P.y, P.x + Math.sin(a) * L, P.y - Math.cos(a) * L, { color: needle, width: 2, cap: 'round' });
  circle(ctx, P.x, P.y, 4, { fill: COLORS.text2 });
  ctx.restore();

  // Terminals on the top edge.
  return { left: { x: bx + 0.16 * boxW, y: by }, right: { x: bx + 0.84 * boxW, y: by }, top: by, bottom: by + boxH };
}

/** Small terminal post. */
export function terminal(ctx, x, y, color) {
  circle(ctx, x, y, 3.5, { fill: color });
}
