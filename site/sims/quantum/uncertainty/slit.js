// Tab 2 — electrons pass a single slit and build up a diffraction pattern.
// The slit "measures" the transverse coordinate (Δx ≈ a); the price is a
// spread of the transverse momentum (Δpₓ ≈ h/a).
//
// The angles in the picture are true (screen at distance L, y = L·tanθ);
// only the slit opening is magnified.

import { fluidCanvas } from '../../../assets/js/core/canvas.js';
import { bindRange, bindPlayPause, onClick } from '../../../assets/js/core/controls.js';
import { byId, setText, setHTML } from '../../../assets/js/core/dom.js';
import { clear, line, text } from '../../../assets/js/core/draw.js';
import { COLORS, themed, alpha, onThemeChange, fontsReady } from '../../../assets/js/core/theme.js';
import { clamp, DEG } from '../../../assets/js/core/math.js';
import {
  H, ME, EV, screenDensity, sampleScreen, screenBins, firstMinimumTan, centralShare,
} from './physics.js';
import { sci } from './shared.js';

const T_MAX = 1 / 1.3;     // tanθ at the edge of the screen
const BINS = 81;
const GAP_PX = 10;         // drawn slit opening, px per nm
const WAVE_PX = 60;        // drawn wavelength, px per nm
const MAX_DOTS = 8000;
const BEAM_HALF = 36;      // half-height of the incoming beam, px
const SPEED = 320;         // px/s at p = 3.3·10⁻²⁴ kg·m/s

const C = themed((light) => ({
  wall: light ? '#59627f' : '#8a94b8',
  screen: light ? '#e9edf6' : '#161b2b',
  dot: COLORS.teal,
  curve: COLORS.amber,
  minimum: COLORS.coral,
  front: alpha(COLORS.blue, light ? 0.3 : 0.28),
}));

export function createSlit() {
  const view = fluidCanvas(byId('slScene'), {
    height: (w) => clamp(Math.round(w * 0.5), 320, 440),
    onResize: () => { dirty = true; },
  });
  const { ctx } = view;

  // ---------- State ----------
  let dirty = true;
  let emitAcc = 0, blockAcc = 0, phase = 0;
  let flying = [];                    // { y0, T, s, blocked }
  let dots = [];                      // { T, r }
  let counts = new Uint32Array(BINS);
  let total = 0, central = 0;
  let expected = screenBins(1, 0.2, T_MAX, BINS);
  let shareTheory = 0;

  // ---------- Controls ----------
  const width = bindRange('slWidth', { format: (v) => `${v.toFixed(2)} նմ`, onInput: reset });
  const mom = bindRange('slP', { format: (v) => `${v.toFixed(1)}·10⁻²⁴ կգ·մ/վ`, onInput: reset });
  const rate = bindRange('slRate', { format: (v) => `${v.toFixed(0)} վ⁻¹` });
  const play = bindPlayPause('slPlay');
  onClick('slClear', () => clearScreen());

  const p = () => mom.value * 1e-24;                 // kg·m/s
  const lambda = () => (H / p()) * 1e9;              // nm

  function clearScreen() {
    flying = [];
    dots = [];
    counts = new Uint32Array(BINS);
    total = 0;
    central = 0;
    emitAcc = 0;
    blockAcc = 0;
    dirty = true;
    updateCounts();
  }

  /** Parameters changed: new distribution, empty screen. */
  function reset() {
    const a = width.value, lam = lambda();
    expected = screenBins(a, lam, T_MAX, BINS);
    shareTheory = centralShare(a, lam, T_MAX);

    const sin1 = lam / a;
    const dp = p() * sin1;                           // = h/a
    setText('slDx', `${a.toFixed(2)} նմ`);
    setText('slTheta', `${sin1.toFixed(3)}  (θ₁ = ${(Math.asin(sin1) / DEG).toFixed(1)}°)`);
    setText('slDp', `${sci(dp)} կգ·մ/վ`);
    setText('slProd', `${sci(a * 1e-9 * dp)} Ջ·վ`);
    setText('slH', `${sci(H)} Ջ·վ`);
    setText('slLambda', `${lam.toFixed(3)} նմ`);
    setText('slV', `${sci(p() / ME)} մ/վ`);
    setText('slE', `${((p() * p()) / (2 * ME) / EV).toFixed(1)} էՎ`);
    setHTML('slNote',
      `Ճեղքով անցած էլեկտրոնի կոորդինատը հայտնի է <b>${a.toFixed(2)} նմ</b> ճշտությամբ, իսկ լայնական իմպուլսը «լղոզվում» է մոտ <b>±${sci(dp)} կգ·մ/վ</b>-ով. փունջը բացվում է ±${(Math.asin(sin1) / DEG).toFixed(1)}° անկյան տակ։`);
    clearScreen();
  }

  function updateCounts() {
    setText('slCount', String(total));
    const theory = `${(shareTheory * 100).toFixed(1)} %`;
    setText('slShare', total
      ? `${((central / total) * 100).toFixed(1)} % / ${theory}`
      : `— / ${theory}`);
  }

  // ---------- Geometry ----------
  function geometry() {
    const { width: W, height: Hh } = view;
    const half = Hh / 2 - 22;
    const L = half / T_MAX;
    const stripW = W < 520 ? 22 : 32;
    // The slit sits near the left edge; the histogram takes what is left.
    // (right of the legend overlay on wide canvases)
    const slitX = Math.max(30, Math.min(W > 560 ? Math.max(W * 0.3, 240) : W * 0.22, W - 10 - 84 - 8 - stripW - L));
    const screenX = slitX + L;
    const histW = W - 10 - 8 - stripW - screenX;
    return {
      W, Hh, half, L, stripW, histW, screenX,
      cy: Hh / 2,
      slitX,
      histX: screenX + stripW + 8,
      gap: width.value * GAP_PX,
    };
  }

  // ---------- Simulation ----------
  function land(e) {
    total++;
    if (Math.abs(e.T) < firstMinimumTan(width.value, lambda())) central++;
    counts[clamp(Math.floor(((e.T + T_MAX) / (2 * T_MAX)) * BINS), 0, BINS - 1)]++;
    if (dots.length >= MAX_DOTS) dots.shift();
    dots.push({ T: e.T, r: Math.random() });
  }

  function step(dt, g) {
    const a = width.value, lam = lambda();
    phase += dt;

    // Electrons that will pass the slit…
    emitAcc += rate.value * dt;
    while (emitAcc >= 1) {
      emitAcc -= 1;
      flying.push({
        y0: (Math.random() - 0.5) * g.gap * 0.86,
        T: sampleScreen(a, lam, T_MAX),
        s: 0,
        blocked: false,
      });
    }
    // …and (decoration only) the ones stopped by the wall.
    blockAcc += Math.min(rate.value * ((2 * BEAM_HALF - g.gap) / g.gap), 140) * dt;
    while (blockAcc >= 1) {
      blockAcc -= 1;
      const side = Math.random() < 0.5 ? -1 : 1;
      flying.push({
        y0: side * (g.gap / 2 + 2 + Math.random() * (BEAM_HALF - g.gap / 2 - 2)),
        T: 0, s: 0, blocked: true,
      });
    }

    const ds = SPEED * (mom.value / 3.3) * dt;
    const d1 = g.slitX + 6;
    let landed = false;
    flying = flying.filter((e) => {
      e.s += ds;
      if (e.blocked) return e.s < d1 - 5;
      const d2 = Math.hypot(g.L, e.T * g.L + e.y0);
      if (e.s < d1 + d2) return true;
      land(e);
      landed = true;
      return false;
    });
    if (landed) updateCounts();
  }

  // ---------- Drawing ----------
  function draw(g) {
    const { W, Hh, cy, half, L, slitX, screenX, stripW, histX, histW, gap } = g;
    const a = width.value, lam = lambda();
    clear(ctx, W, Hh, COLORS.canvasBg);
    const top = cy - half, bottom = cy + half;

    // Incoming plane wave: fronts move to the right.
    const spacing = lam * WAVE_PX;
    const shift = (phase * 30) % spacing;
    for (let x = slitX - 8 - spacing + shift; x > 0; x -= spacing) {
      if (x > slitX - 8) continue;
      line(ctx, x, cy - BEAM_HALF - 8, x, cy + BEAM_HALF + 8, { color: C.front, width: 1.5 });
    }

    // Axis and the directions of the first minima
    line(ctx, slitX, cy, screenX, cy, { color: COLORS.axis, width: 1, dash: [3, 5] });
    const t1 = firstMinimumTan(a, lam);
    for (const sgn of [-1, 1]) {
      line(ctx, slitX, cy, screenX, cy - sgn * t1 * L, { color: C.minimum, width: 1.2, dash: [5, 4] });
    }
    if (t1 * L > 26) {
      const ang = Math.atan(t1);
      const r = Math.min(64, L * 0.3);
      ctx.strokeStyle = C.minimum;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(slitX, cy, r, -ang, 0);
      ctx.stroke();
      text(ctx, 'θ₁', slitX + (r + 12) * Math.cos(ang / 2), cy - (r + 12) * Math.sin(ang / 2), {
        color: C.minimum, size: 12, align: 'center',
      });
    }

    // Wall with the slit
    ctx.fillStyle = C.wall;
    ctx.fillRect(slitX - 4, top - 8, 8, half + 8 - gap / 2);
    ctx.fillRect(slitX - 4, cy + gap / 2, 8, half + 8 - gap / 2);
    text(ctx, `a = ${a.toFixed(2)} նմ`, slitX + 10, bottom + 2, { color: COLORS.text2, size: 11, family: 'mono', baseline: 'bottom' });

    // Screen strip
    ctx.fillStyle = C.screen;
    ctx.fillRect(screenX, top, stripW, 2 * half);
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1;
    ctx.strokeRect(screenX + 0.5, top + 0.5, stripW - 1, 2 * half - 1);

    // Hits
    ctx.fillStyle = alpha(C.dot, 0.85);
    for (const d of dots) {
      ctx.fillRect(screenX + 2 + d.r * (stripW - 5), cy - d.T * L - 0.8, 1.7, 1.7);
    }

    // Electrons in flight
    const d1 = slitX + 6;
    ctx.fillStyle = C.dot;
    for (const e of flying) {
      let x, y;
      if (e.s < d1 || e.blocked) {
        x = e.s - 6; y = cy + e.y0;
      } else {
        const d2 = Math.hypot(L, e.T * L + e.y0);
        const f = (e.s - d1) / d2;
        x = slitX + f * L;
        y = cy + e.y0 - f * (e.T * L + e.y0);
      }
      ctx.beginPath();
      ctx.arc(x, y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Histogram of the hits + expected distribution
    line(ctx, histX, top, histX, bottom, { color: COLORS.axis, width: 1 });
    const c = (BINS - 1) / 2;
    const full = histW * 0.86;
    const binH = (2 * half) / BINS;
    if (total) {
      ctx.fillStyle = alpha(C.dot, 0.5);
      for (let i = 0; i < BINS; i++) {
        if (!counts[i]) continue;
        const len = Math.min((counts[i] / total / expected.share[c]) * full, histW);
        ctx.fillRect(histX, bottom - (i + 1) * binH + 0.5, len, Math.max(binH - 1, 1));
      }
    }
    const peak = expected.share[c] * BINS * expected.mean;   // bin-averaged density at the centre
    ctx.strokeStyle = C.curve;
    ctx.lineWidth = 1.8;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let y = -half; y <= half; y += 0.5) {
      const len = Math.min((screenDensity(-y / L, a, lam) / peak) * full, histW);
      if (y === -half) ctx.moveTo(histX + len, cy + y); else ctx.lineTo(histX + len, cy + y);
    }
    ctx.stroke();
    if (t1 < T_MAX) {
      for (const sgn of [-1, 1]) {
        const y = cy - sgn * t1 * L;
        line(ctx, screenX - 5, y, histX + 12, y, { color: C.minimum, width: 1.5 });
      }
    }

    // Captions
    const cap = { color: COLORS.text3, size: 10, align: 'center' };
    text(ctx, 'ճեղք', slitX, top - 14, cap);
    text(ctx, 'էկրան', screenX + stripW / 2, top - 10, cap);
    text(ctx, histW < 150 ? 'բաշխում' : 'հարվածների բաշխումը', histX + histW / 2, top - 10, cap);
  }

  function frame(dt) {
    if (!view.width) return;
    const g = geometry();
    if (!play.paused) {
      step(dt, g);
      dirty = true;
    }
    if (!dirty) return;
    dirty = false;
    draw(g);
  }

  onThemeChange(() => { dirty = true; });
  fontsReady().then(() => { dirty = true; });
  reset();

  return { frame, get state() { return { total, central, counts }; } };
}
