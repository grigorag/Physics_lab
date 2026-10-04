// Tab 2: the 3D Maxwell distribution of real gases in SI units.

import { fluidCanvas } from '../../../assets/js/core/canvas.js';
import { bindRange, bindSelect, onClick } from '../../../assets/js/core/controls.js';
import { byId, setText, setHTML } from '../../../assets/js/core/dom.js';
import { clear, line, text, arrow } from '../../../assets/js/core/draw.js';
import { COLORS, alpha, font, onThemeChange, fontsReady } from '../../../assets/js/core/theme.js';
import { clamp } from '../../../assets/js/core/math.js';
import { GASES, speeds3D, maxwell3D, area3D, log10FractionAbove } from './physics.js';
import { niceStep, sup, drawAxes, drawMarkers, fmt } from './shared.js';

const T_MAX = 1500;
const Y_REF_T = 100;            // K: the f axis is sized for this temperature
const X_NICE = [1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 8000, 10000, 12000, 15000, 20000];
const ESCAPE = 11200;           // m/s, Earth's escape speed

/** Fraction (given as log10) → percent text; tiny values as a power of ten. */
export function percentText(log10P) {
  const lp = log10P + 2;                        // log10 of the percentage
  if (lp >= -2) {
    const p = Math.min(100, 10 ** lp);
    return `${p >= 10 ? p.toFixed(1) : p.toPrecision(3)} %`;
  }
  let e = Math.floor(lp);
  let m = 10 ** (lp - e);
  if (m >= 9.95) { m = 1; e += 1; }
  return `${m.toFixed(1)}·10${sup(e)} %`;
}

export function createTheory() {
  const state = { gas: 'N2', T: 300, v0: 1000, pin: null };

  const view = fluidCanvas(byId('maxwell'), {
    height: (w) => Math.round(clamp(w * 0.56, 270, 440)),
    onResize: () => draw(),
  });

  bindSelect('gas', { onChange: (g) => { state.gas = g; update(); } });
  bindRange('tReal', { format: (v) => `${v} Կ`, onInput: (v) => { state.T = v; update(); } });
  const v0Ctl = bindRange('v0', { format: (v) => `${v} մ/վ`, onInput: (v) => { state.v0 = v; update(); } });
  onClick('escapeBtn', () => v0Ctl.set(ESCAPE));
  const pinBtn = byId('pinBtn');
  onClick('pinBtn', () => {
    state.pin = state.pin ? null : { gas: state.gas, T: state.T };
    update();
  });

  /** Axes fixed per gas (so heating visibly widens and lowers the curve):
   *  x covers the lightest gas shown at 1500 K; y holds the peak of the lightest
   *  gas at 100 K and grows only when a curve is taller (colder or heavier). */
  function axes() {
    const curves = [{ M: GASES[state.gas].M, T: state.T }];
    if (state.pin) curves.push({ M: GASES[state.pin.gas].M, T: state.pin.T });
    const peakOf = (T, M) => maxwell3D(speeds3D(T, M).vp, T, M) * 1e3;      // 10⁻³ s/m
    const mLight = Math.min(...curves.map((c) => c.M));
    const xNeed = 3.0 * speeds3D(T_MAX, mLight).vp;
    const xMax = X_NICE.find((x) => x >= xNeed) ?? X_NICE[X_NICE.length - 1];
    const peak = Math.max(peakOf(Y_REF_T, mLight), ...curves.map((c) => peakOf(c.T, c.M) * 1.05));
    const yStep = niceStep(peak / 5);
    return { xMax, yMax: Math.ceil(peak / yStep - 1e-9) * yStep, yStep };
  }

  function update() {
    const { M } = GASES[state.gas];
    const sp = speeds3D(state.T, M);
    setText('gasM', `M = ${Math.round(M * 1000)} գ/մոլ`);
    setText('tVp', `${Math.round(sp.vp)} մ/վ`);
    setText('tMean', `${Math.round(sp.mean)} մ/վ`);
    setText('tRms', `${Math.round(sp.rms)} մ/վ`);
    setText('tFrac', percentText(log10FractionAbove(state.v0, state.T, M)));
    setText('tArea', area3D(state.T, M).toFixed(4));
    pinBtn.textContent = state.pin ? 'Ջնջել պահված կորը' : 'Պահել կորը';
    pinBtn.setAttribute('aria-pressed', String(!!state.pin));
    if (state.pin) {
      const p = state.pin, ps = speeds3D(p.T, GASES[p.gas].M);
      const frac = percentText(log10FractionAbove(state.v0, p.T, GASES[p.gas].M));
      setHTML('pinInfo', `<b>Պահված կորը՝ ${GASES[p.gas].name}, ${p.T} Կ</b>. v<sub>հ</sub> = ${Math.round(ps.vp)} մ/վ, <span class="vbar">v</span> = ${Math.round(ps.mean)} մ/վ, v<sub>քմ</sub> = ${Math.round(ps.rms)} մ/վ, v &gt; v<sub>0</sub>՝ ${frac}`);
    } else {
      setHTML('pinInfo', '«Պահել կորը» կոճակով ամրացրեք ընթացիկ կորը, ապա փոխեք ջերմաստիճանը կամ գազը և համեմատեք։');
    }
    draw();
  }

  function curvePath(ctx, X, Y, T, M, xMax, from = 0) {
    ctx.beginPath();
    const n = 300;
    for (let i = 0; i <= n; i++) {
      const v = from + ((xMax - from) * i) / n;
      const y = Y(maxwell3D(v, T, M) * 1e3);
      i ? ctx.lineTo(X(v), y) : ctx.moveTo(X(v), y);
    }
  }

  function draw() {
    const { ctx, width: W, height: H } = view;
    if (!W) return;
    clear(ctx, W, H, COLORS.canvasBg);
    const { xMax, yMax, yStep } = axes();
    const box = { l: 50, t: 58, w: W - 50 - 16, h: H - 58 - 44 };
    const xStep = niceStep(xMax / (W < 480 ? 4 : 7));
    const map = drawAxes(ctx, box,
      { max: xMax, step: xStep, fmt: (v) => String(v) },
      { max: yMax, step: yStep, fmt: (v) => fmt(v, yStep < 0.1 ? 2 : yStep < 1 ? 1 : 0) },
      { x: 'արագություն v, մ/վ', y: 'f(v), 10⁻³ վ/մ' });
    const { X, Y } = map;
    const yAxis = box.t + box.h;
    const { M } = GASES[state.gas];

    ctx.save();
    ctx.beginPath();
    ctx.rect(box.l, box.t - 6, box.w + 4, box.h + 6);
    ctx.clip();
    ctx.lineJoin = 'round';

    // Shaded fraction v > v0 under the current curve.
    if (state.v0 < xMax) {
      curvePath(ctx, X, Y, state.T, M, xMax, state.v0);
      ctx.lineTo(X(xMax), yAxis);
      ctx.lineTo(X(state.v0), yAxis);
      ctx.closePath();
      ctx.fillStyle = alpha(COLORS.amber, 0.35);
      ctx.fill();
    }

    // Pinned reference curve.
    if (state.pin) {
      curvePath(ctx, X, Y, state.pin.T, GASES[state.pin.gas].M, xMax);
      ctx.strokeStyle = COLORS.blue;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Current curve.
    curvePath(ctx, X, Y, state.T, M, xMax);
    ctx.strokeStyle = COLORS.coral;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();

    drawMarkers(ctx, map, speeds3D(state.T, M), [13, 30, 47], COLORS.coral, yAxis);

    // Threshold speed v0.
    if (state.v0 > 0 && state.v0 <= xMax) {
      const x = X(state.v0);
      line(ctx, x, box.t, x, yAxis, { color: COLORS.amber, width: 1.5 });
      const right = x < box.l + box.w - 40;
      text(ctx, 'v₀', right ? x + 5 : x - 5, yAxis - 12, { color: COLORS.amber, size: 12, weight: 600, family: 'mono', style: 'italic', align: right ? 'left' : 'right' });
    } else if (state.v0 > xMax) {
      const y = yAxis - 14;
      const xr = box.l + box.w;
      arrow(ctx, xr - 26, y, xr - 2, y, { color: COLORS.amber, width: 1.5, head: 7 });
      text(ctx, `v₀ = ${state.v0} մ/վ`, xr - 32, y, { color: COLORS.amber, size: 11, family: 'mono', align: 'right' });
    }

    // Labels of the curves (top right, inside the plot).
    const tag = (s, color, row) => {
      const y = box.t + 10 + row * 17;
      ctx.font = font(11.5, { weight: 600 });
      const w = ctx.measureText(s).width;
      ctx.fillStyle = alpha(COLORS.canvasBg, 0.9);
      ctx.fillRect(box.l + box.w - w - 8, y - 8, w + 8, 16);
      text(ctx, s, box.l + box.w - 4, y, { color, size: 11.5, weight: 600, align: 'right' });
    };
    tag(`${GASES[state.gas].name}, ${state.T} Կ`, COLORS.coral, 0);
    if (state.pin) tag(`${GASES[state.pin.gas].name}, ${state.pin.T} Կ`, COLORS.blue, 1);
  }

  onThemeChange(draw);
  fontsReady().then(draw);
  update();

  return { frame() {}, state, draw };
}
