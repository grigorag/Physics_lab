// Tab 2 — beats: two tones y₁(t), y₂(t) and their sum with its envelope.
//
// The charts show the window [t, t + W] of the analytic signals, scrolling
// to the left. The time runs W/8 s per real second, i.e. slowed down ×(8/W),
// so a window always takes 8 s to scroll past. When the oscillations are
// denser than the pixels (zoomed out), each pixel column shows the min–max
// band of the signal instead of a (aliased) polyline.

import { fluidCanvas } from '../../../assets/js/core/canvas.js';
import { bindRange, bindCheckbox, bindPlayPause, onClick } from '../../../assets/js/core/controls.js';
import { byId, setText } from '../../../assets/js/core/dom.js';
import { clear, line, text } from '../../../assets/js/core/draw.js';
import { COLORS, themed, alpha, font } from '../../../assets/js/core/theme.js';
import { clamp } from '../../../assets/js/core/math.js';
import {
  tone, beatSum, envelope, beatFrequency, meanFrequency, envelopeMax, envelopeMin,
} from './physics.js';
import { bindListen } from './audio.js';
import { fmtHz, fmtTime, fmtSec, fmt, niceStep, decimalsFor } from './shared.js';

const SCROLL_SECONDS = 8;     // real seconds for the window to scroll past
const GAIN = 0.1;             // audio volume of each tone at amplitude 1

const C = themed(() => ({
  y1: COLORS.blue,
  y2: COLORS.teal,
  sum: COLORS.purple,
  env: COLORS.coral,
  panelBorder: COLORS.grid,
}));

export function createBeats(engine) {
  const view = fluidCanvas(byId('bCv'), {
    height: (w) => clamp(Math.round(w * 0.85), 430, 600),
    onResize: () => draw(),
  });
  const { ctx } = view;

  // ---------- State ----------
  const S = { f1: 440, df: 4, A1: 1, A2: 1, win: 1, t: 0 };
  const f2 = () => S.f1 + S.df;

  // ---------- Controls ----------
  bindRange('bF1', {
    format: (v) => fmtHz(v),
    onInput: (v) => { S.f1 = v; changed(); },
  });
  bindRange('bDf', {
    format: (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v), 1)} Հց`,
    onInput: (v) => { S.df = v; changed(); },
  });
  bindRange('bA1', {
    format: (v) => v.toFixed(2),
    onInput: (v) => { S.A1 = v; changed(); },
  });
  bindRange('bA2', {
    format: (v) => v.toFixed(2),
    onInput: (v) => { S.A2 = v; changed(); },
  });
  bindRange('bZoom', {
    format: (v) => fmtTime(10 ** v),
    onInput: (v) => { S.win = 10 ** v; changed(); },
  });
  const showEnv = bindCheckbox('bShowEnv');

  const play = bindPlayPause('bPlay', {
    onChange: (paused) => { if (paused) listen.stop(); },
  });
  onClick('bRestart', () => { S.t = 0; });
  const listen = bindListen('bListen', engine, () => [
    { freq: S.f1, gain: GAIN * S.A1 },
    { freq: f2(), gain: GAIN * S.A2 },
  ]);

  function changed() {
    listen.refresh();
    updateStats();
  }

  // ---------- Stats ----------
  function updateStats() {
    const a = f2();
    const fb = beatFrequency(S.f1, a);
    setText('bStatF1', fmtHz(S.f1));
    setText('bStatF2', fmtHz(a));
    setText('bStatMean', fmtHz(meanFrequency(S.f1, a)));
    setText('bStatBeat', fmtHz(fb));
    setText('bStatPeriod', fb > 1e-9 ? fmtSec(1 / fb) : '—');
    setText('bStatMax', envelopeMax(S.A1, S.A2).toFixed(2));
    setText('bStatMin', envelopeMin(S.A1, S.A2).toFixed(2));
    setText('bSlow', `×${Math.round(SCROLL_SECONDS / S.win)}`);

    const note = byId('bNote');
    if (fb < 1e-9) {
      note.textContent = `f₁ = f₂ = ${fmtHz(S.f1)}. Երկու տատանումները փուլով համընկնում են և անընդհատ ուժեղացնում են իրար. զարկեր չկան, ամպլիտուդը հաստատուն է և հավասար՝ A₁ + A₂ = ${envelopeMax(S.A1, S.A2).toFixed(2)}։`;
    } else {
      const rough = fb > 15 ? ' Այդպիսի արագ զարկերն արդեն չեն լսվում որպես առանձին ուժեղացումներ. ձայնը դառնում է «խռպոտ»։' : '';
      note.textContent = `f₁ = ${fmtHz(S.f1)}, f₂ = ${fmtHz(a)}. Զարկերի հաճախությունը |f₁ − f₂| = ${fmtHz(fb)} է. ձայնի ուժգնությունը վայրկյանում ${fb % 1 === 0 ? fb : fb.toFixed(1)} անգամ աճում և նվազում է (զարկի պարբերությունը՝ ${fmtSec(1 / fb)}), իսկ հնչում է միջին ${fmtHz(meanFrequency(S.f1, a))} հաճախությամբ։${rough}`;
    }
  }

  // ---------- Drawing ----------
  /** Signal drawn over the plot area: polyline when resolvable, min–max band otherwise. */
  function drawSignal(fn, fmax, { x0, plotW, mid, half, scale, t0, win, color, widthPx = 1.8, bandAlpha = 0.85 }) {
    const cyclesPerPx = (fmax * win) / plotW;
    const Y = (v) => mid - (v / scale) * half;
    if (cyclesPerPx <= 0.1) {
      const n = Math.ceil(plotW * Math.max(1, cyclesPerPx * 24));
      ctx.strokeStyle = color;
      ctx.lineWidth = widthPx;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const f = i / n;
        const x = x0 + f * plotW;
        const y = Y(fn(t0 + f * win));
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    } else {
      // Each column looks at (at least) one full carrier cycle, so the band
      // follows the envelope instead of aliasing against the pixel grid.
      const dt = win / plotW;
      const span = Math.max(dt, 1.1 / fmax);
      const sub = clamp(Math.ceil(span * fmax * 12), 12, 60);
      ctx.fillStyle = alpha(color, bandAlpha);
      for (let i = 0; i < plotW; i++) {
        let lo = Infinity, hi = -Infinity;
        const tc = t0 + (i + 0.5) * dt;
        for (let s = 0; s <= sub; s++) {
          const v = fn(tc + (s / sub - 0.5) * span);
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
        const yTop = Y(hi), yBot = Y(lo);
        ctx.fillRect(x0 + i, yTop, 1, Math.max(yBot - yTop, 1.2));
      }
    }
  }

  function draw() {
    const { width: W, height: H } = view;
    if (!W) return;
    clear(ctx, W, H, COLORS.canvasBg);

    const { f1, A1, A2, win } = S;
    const a = f2();
    const t0 = S.t;
    const padL = 46, padR = 12, top = 4, axisH = 30, head = 16, gap = 6;
    const x0 = padL;
    const plotW = Math.max(40, Math.floor(W - padL - padR));
    const avail = H - top - axisH - 3 * head - 2 * gap;
    const hs = [avail * 0.24, avail * 0.24, avail * 0.52];
    const fmax = Math.max(f1, a);

    const panels = [];
    let y = top;
    hs.forEach((h, i) => {
      panels.push({ head: y, y0: y + head, h, mid: y + head + h / 2, half: h / 2 - 3 });
      y += head + h + gap;
    });
    const bottom = panels[2].y0 + panels[2].h;

    // time grid
    const step = niceStep(win / (W < 520 ? 4 : 8));
    const digits = decimalsFor(step);
    const kFirst = Math.ceil(t0 / step - 1e-9);
    const tickX = (tt) => x0 + ((tt - t0) / win) * plotW;
    for (let k = kFirst; k * step <= t0 + win + 1e-9; k++) {
      const x = tickX(k * step);
      line(ctx, x, panels[0].y0, x, bottom, { color: COLORS.grid, width: 1 });
      if (x < W - padR - 40) {
        text(ctx, (k * step).toFixed(digits), x, bottom + 13, { color: COLORS.text3, size: 10, family: 'mono', align: 'center' });
      }
    }
    text(ctx, 't, վ', W - padR, bottom + 13, { color: COLORS.text3, size: 11, align: 'right' });

    const scales = [1.1, 1.1, 2.6];
    const heads = [
      [C.y1, `y₁ — ${fmtHz(f1)}, A₁ = ${A1.toFixed(2)}`],
      [C.y2, `y₂ — ${fmtHz(a)}, A₂ = ${A2.toFixed(2)}`],
      [C.sum, 'y = y₁ + y₂'],
    ];
    const beatsOn = beatFrequency(f1, a) > 1e-9;
    const fb = beatFrequency(f1, a);

    panels.forEach((p, i) => {
      text(ctx, heads[i][1], x0, p.head + 8, { color: heads[i][0], size: 11, weight: 600 });
      ctx.strokeStyle = C.panelBorder;
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 + 0.5, p.y0 + 0.5, plotW - 1, p.h - 1);
      line(ctx, x0, p.mid, x0 + plotW, p.mid, { color: COLORS.axis, width: 1 });
      text(ctx, '0', x0 - 6, p.mid, { color: COLORS.text3, size: 10, family: 'mono', align: 'right' });
    });

    // guide levels
    const level = (p, v, label, color = COLORS.axis) => {
      const yy = p.mid - (v / scales[panels.indexOf(p)]) * p.half;
      for (const s of [1, -1]) {
        const ys = p.mid - s * (p.mid - yy);
        line(ctx, x0, ys, x0 + plotW, ys, { color: alpha(color, 0.45), width: 1, dash: [3, 5] });
      }
      if (label) text(ctx, label, x0 - 6, yy, { color: COLORS.text3, size: 10, family: 'mono', align: 'right' });
    };
    level(panels[0], A1, A1.toFixed(2));
    level(panels[1], A2, A2.toFixed(2));
    const amax = envelopeMax(A1, A2), amin = envelopeMin(A1, A2);
    level(panels[2], amax, amax.toFixed(2));
    if (amin > 0.12 * amax) level(panels[2], amin, amin.toFixed(2));

    // curves, clipped to the plot area
    const common = { x0, plotW, t0, win };
    const draws = [
      [panels[0], (t) => tone(A1, f1, t), f1, C.y1],
      [panels[1], (t) => tone(A2, a, t), a, C.y2],
      [panels[2], (t) => beatSum(A1, f1, A2, a, t), fmax, C.sum],
    ];
    draws.forEach(([p, fn, fm, color], i) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, p.y0, plotW, p.h);
      ctx.clip();
      drawSignal(fn, fm, { ...common, mid: p.mid, half: p.half, scale: scales[i], color, bandAlpha: i === 2 ? 0.75 : 0.6 });
      ctx.restore();
    });

    // envelope of the sum (dashed), maxima and beat period
    const ps = panels[2];
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, ps.y0, plotW, ps.h);
    ctx.clip();
    if (beatsOn) {
      const nFirst = Math.ceil(t0 * fb - 1e-9);
      const nLast = Math.floor((t0 + win) * fb + 1e-9);
      if (nLast - nFirst < 40) {
        for (let n = nFirst; n <= nLast; n++) {
          const x = tickX(n / fb);
          line(ctx, x, ps.y0, x, ps.y0 + ps.h, { color: alpha(C.env, 0.35), width: 1, dash: [2, 4] });
        }
      }
    }
    if (showEnv.checked) {
      for (const sign of [1, -1]) {
        ctx.strokeStyle = C.env;
        ctx.lineWidth = 2;
        ctx.setLineDash([7, 5]);
        ctx.beginPath();
        const n = Math.min(plotW, 600);
        for (let i = 0; i <= n; i++) {
          const f = i / n;
          const e = envelope(A1, f1, A2, a, t0 + f * win);
          const yy = ps.mid - sign * (e / scales[2]) * ps.half;
          if (i === 0) ctx.moveTo(x0 + f * plotW, yy); else ctx.lineTo(x0 + f * plotW, yy);
        }
        ctx.stroke();
      }
    }
    ctx.restore();

    // beat period bracket between two neighbouring envelope maxima
    if (beatsOn) {
      const nFirst = Math.ceil(t0 * fb - 1e-9);
      if ((nFirst + 1) / fb <= t0 + win + 1e-9) {
        const xa = tickX(nFirst / fb), xb = tickX((nFirst + 1) / fb);
        const yb = ps.y0 + 15;
        line(ctx, xa, yb, xb, yb, { color: C.env, width: 1.6 });
        line(ctx, xa, yb - 4, xa, yb + 4, { color: C.env, width: 1.6 });
        line(ctx, xb, yb - 4, xb, yb + 4, { color: C.env, width: 1.6 });
        const str = `Tզ = ${fmtSec(1 / fb)}`;
        ctx.font = font(11, { weight: 600 });
        const tw = ctx.measureText(str).width;
        if (xb - xa >= tw + 8) {
          text(ctx, str, (xa + xb) / 2, yb - 7, { color: C.env, size: 11, weight: 600, align: 'center' });
        } else if (xb + 6 + tw <= x0 + plotW) {
          text(ctx, str, xb + 6, yb, { color: C.env, size: 11, weight: 600 });
        }
      }
    }
  }

  // ---------- Frame ----------
  updateStats();
  return {
    frame(dt) {
      if (!play.paused) S.t += dt * (S.win / SCROLL_SECONDS);
      draw();
    },
    stopAudio: () => listen.stop(),
  };
}
