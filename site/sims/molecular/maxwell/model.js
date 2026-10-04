// Tab 1: a 2D hard-disc gas whose speed histogram relaxes to the equilibrium
// (2D Maxwell) distribution. Arbitrary units: m = k = 1, box height = 1,
// kT/m = T / 300, so v_p = 1 at 300 K.

import { fluidCanvas } from '../../../assets/js/core/canvas.js';
import { bindRange, bindSegmented, bindCheckbox, bindPlayPause, onClick } from '../../../assets/js/core/controls.js';
import { byId, setText, setHTML } from '../../../assets/js/core/dom.js';
import { clear } from '../../../assets/js/core/draw.js';
import { COLORS, themed, alpha, onThemeChange } from '../../../assets/js/core/theme.js';
import { clamp, TAU } from '../../../assets/js/core/math.js';
import { createGas2D, rayleigh2D, speeds2D, RATIO_2D } from './physics.js';
import { niceStep, ramp, drawAxes, drawMarkers, fmt } from './shared.js';

const BOX_W = 2;              // box aspect: 2 × 1
const RADIUS = 0.007;         // disc radius (box heights)
const N_MAX = 600;
const TIME_SCALE = 0.25;      // simulated time per second of real time
const BIN = 0.2;              // histogram bin width (speed units)
const V_AXIS = 7.2;           // speed axis length; covers > 4 σ at 1000 K
const NBINS = Math.round(V_AXIS / BIN);
const Y_BASE = 1.15;          // f axis: holds the 2D peak at 100 K (1.05)
const V_COLOR = 4.5;          // speed at the hot end of the colour scale
const AVG_WINDOW = 1;         // s of real time
const PAD = 8;                // px around the box

const s2Of = (T) => T / 300;  // σ² = kT/m in model units

const C = themed(() => ({
  stops: [COLORS.blue, COLORS.teal, COLORS.amber, COLORS.red],
}));
const NCOL = 24;
const speedColor = (v) => ramp(C.stops, v / V_COLOR);

export function createModel() {
  const gas = createGas2D({ width: BOX_W, radius: RADIUS, max: N_MAX });
  const state = { N: 300, T: 300, mode: 'equal', avg: true, paused: false, t: 0, E0: 1 };
  let history = [];                       // [{ age, counts }]
  const sum = new Float64Array(NBINS);
  let statTimer = 0;
  let ratioAvg = 1;                       // v̄/v_rms smoothed over ≈0.7 s (for the hint)

  // ---------- Canvases ----------
  const scene = fluidCanvas(byId('box'), {
    height: (w) => Math.round((w - 2 * PAD) / BOX_W + 2 * PAD),
    onResize: () => drawScene(),
  });
  const chart = fluidCanvas(byId('hist'), {
    height: (w) => Math.round(clamp(w * 0.4, 230, 300)),
    onResize: () => drawChart(),
  });

  // ---------- Controls ----------
  const nCtl = bindRange('nSlider', { format: (v) => String(v), onInput: (v) => { state.N = v; restart(); } });
  bindRange('tSim', {
    format: (v) => `${v} Կ`,
    onInput: (v) => {
      state.T = v;
      gas.scaleTo(s2Of(v));               // heating / cooling rescales every speed by √(T'/T)
      state.E0 = gas.energy();
      clearHistory();
      redrawIfPaused();
    },
  });
  bindSegmented('startMode', { onChange: (v) => { state.mode = v; restart(); } });
  bindCheckbox('avg', { onChange: (on) => { state.avg = on; redrawIfPaused(); } });
  bindPlayPause('simPlay', { onChange: (p) => { state.paused = p; } });
  onClick('simReset', restart);

  function clearHistory() {
    history = [];
    sum.fill(0);
    sample(0);
  }

  function restart() {
    state.N = nCtl.value;
    gas.reset(state.N, state.mode, s2Of(state.T));
    state.E0 = gas.energy();
    state.t = 0;
    const s0 = gas.stats();
    ratioAvg = s0.mean / s0.rms;
    clearHistory();
    updateStats();
    redrawIfPaused();
  }

  function redrawIfPaused() {
    if (state.paused) { updateStats(); drawScene(); drawChart(); }
  }

  /** Records the present histogram; drops records older than the window. */
  function sample(dt) {
    for (const h of history) h.age += dt;
    while (history.length && history[0].age > AVG_WINDOW) {
      const old = history.shift();
      for (let k = 0; k < NBINS; k++) sum[k] -= old.counts[k];
    }
    const counts = new Float64Array(NBINS);
    gas.histogram(counts, BIN);
    for (let k = 0; k < NBINS; k++) sum[k] += counts[k];
    history.push({ age: 0, counts });
  }

  /** Probability density per bin: count / (N · bin width). */
  function densities() {
    const out = new Float64Array(NBINS);
    if (state.avg) {
      const m = history.length * gas.n * BIN;
      for (let k = 0; k < NBINS; k++) out[k] = sum[k] / m;
    } else {
      const counts = history[history.length - 1].counts;
      for (let k = 0; k < NBINS; k++) out[k] = counts[k] / (gas.n * BIN);
    }
    return out;
  }

  // ---------- Readouts ----------
  const relaxHint = byId('relaxHint');
  function updateStats() {
    const { mean, rms } = gas.stats();
    const ratio = mean / rms;
    const th = speeds2D(s2Of(state.T));
    setHTML('mMean', `${fmt(mean, 3)} <small>(տեսութ. ${fmt(th.mean, 3)})</small>`);
    setHTML('mRms', `${fmt(rms, 3)} <small>(տեսութ. ${fmt(th.rms, 3)})</small>`);
    setText('mRatio', fmt(ratio, 3));
    setText('mEnergy', fmt(gas.energy() / state.E0, 6));
    setText('mTime', `${state.t.toFixed(1)} վ`);
    const done = Math.abs(ratioAvg - RATIO_2D) < 0.01;
    relaxHint.classList.toggle('hint--ok', done);
    relaxHint.innerHTML = done
      ? 'Բաշխումը հավասարակշռված է. հիստոգրամը համընկնում է տեսական կորին, իսկ <span class="vbar">v</span> / v<sub>քմ</sub> ≈ √π / 2։'
      : 'Բաշխումը դեռ հավասարակշռված չէ. բախումները փոխում են մոլեկուլների արագությունները…';
  }

  // ---------- Drawing ----------
  function drawScene() {
    const { ctx, width: W, height: H } = scene;
    if (!W) return;
    clear(ctx, W, H, COLORS.canvasBg);
    const s = (W - 2 * PAD) / BOX_W;
    const bx = PAD, by = PAD;
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx - 1, by - 1, BOX_W * s + 2, s + 2);

    const rPx = Math.max(1.6, RADIUS * s);
    const buckets = Array.from({ length: NCOL }, () => []);
    for (let i = 0; i < gas.n; i++) {
      const v = Math.hypot(gas.vx[i], gas.vy[i]);
      buckets[Math.min(NCOL - 1, Math.floor((v / V_COLOR) * NCOL))].push(i);
    }
    buckets.forEach((list, b) => {
      if (!list.length) return;
      ctx.fillStyle = ramp(C.stops, (b + 0.5) / NCOL);
      ctx.beginPath();
      for (const i of list) {
        const x = bx + gas.x[i] * s, y = by + gas.y[i] * s;
        ctx.moveTo(x + rPx, y);
        ctx.arc(x, y, rPx, 0, TAU);
      }
      ctx.fill();
    });
  }

  function drawChart() {
    const { ctx, width: W, height: H } = chart;
    if (!W || !history.length) return;
    clear(ctx, W, H, COLORS.canvasBg);
    const dens = densities();
    const s2 = s2Of(state.T);
    const peak = Math.max(...dens);
    const yMax0 = Math.max(Y_BASE, peak * 1.06);
    const yStep = niceStep(yMax0 / 4);
    const ys = { max: Math.ceil(yMax0 / yStep - 1e-9) * yStep, step: yStep, fmt: (v) => fmt(v, yStep < 0.1 ? 2 : 1) };
    const box = { l: 44, t: 58, w: W - 44 - 14, h: H - 58 - 44 };
    const xs = { max: V_AXIS, step: W < 480 ? 2 : 1, fmt: (v) => String(v) };
    const map = drawAxes(ctx, box, xs, ys, { x: 'արագություն v (պայմ. միավոր)', y: 'f(v)' });
    const { X, Y } = map;

    // Histogram bars, coloured like the molecules.
    const gap = (X(BIN) - X(0)) > 6 ? 1 : 0;
    for (let k = 0; k < NBINS; k++) {
      if (dens[k] <= 0) continue;
      const v0 = k * BIN;
      ctx.fillStyle = alpha(speedColor(v0 + BIN / 2), 0.8);
      ctx.fillRect(X(v0) + gap / 2, Y(dens[k]), X(BIN) - X(0) - gap, box.t + box.h - Y(dens[k]));
    }

    // Theoretical 2D curve.
    ctx.save();
    ctx.strokeStyle = COLORS.text;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i <= 240; i++) {
      const v = (V_AXIS * i) / 240;
      const y = Y(rayleigh2D(v, s2));
      i ? ctx.lineTo(X(v), y) : ctx.moveTo(X(v), y);
    }
    ctx.stroke();
    ctx.restore();

    drawMarkers(ctx, map, speeds2D(s2), [13, 30, 47], COLORS.text2, box.t + box.h);
  }

  // ---------- Frame ----------
  restart();
  onThemeChange(() => { drawScene(); drawChart(); });

  return {
    frame(dt) {
      if (!state.paused && dt > 0) {
        gas.step(dt * TIME_SCALE);
        state.t += dt;
        sample(dt);
        const st = gas.stats();
        ratioAvg += (st.mean / st.rms - ratioAvg) * Math.min(1, dt / 0.7);
        statTimer += dt;
        if (statTimer > 0.2) { statTimer = 0; updateStats(); }
      }
      drawScene();
      drawChart();
    },
    gas, state,
  };
}
