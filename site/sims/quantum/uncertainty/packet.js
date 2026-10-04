// Tab 1 — a wave packet as a sum of plane waves (free electron).
// Units: x in nm, k in nm⁻¹, t in fs. The window follows the packet centre.

import { fluidCanvas } from '../../../assets/js/core/canvas.js';
import { bindRange, bindCheckbox, bindSegmented, onClick } from '../../../assets/js/core/controls.js';
import { byId, setText, setHTML } from '../../../assets/js/core/dom.js';
import { clear, line, text } from '../../../assets/js/core/draw.js';
import { COLORS, alpha, onThemeChange, fontsReady, font } from '../../../assets/js/core/theme.js';
import { clamp } from '../../../assets/js/core/math.js';
import {
  HBAR, ME, EV, DISP, P_PER_K,
  buildComponents, sampleWave, groupVelocity, uncertainties,
} from './physics.js';
import { sci, fixedPow } from './shared.js';

const HALF = 6;          // half-width of the x window, nm
const T_MAX = 30;        // the animation stops here, fs
const RATE = 2;          // fs of physics per second of animation
const P_AXIS = 30;       // momentum axis: 0 … 30 ·10⁻²⁵ kg·m/s
const P_UNIT = 1e-25;
const PAD = 14;          // left/right padding of all three plots
const MAX_N = 2400;      // samples across the window

export function createPacket() {
  const redraw = () => { dirty = true; };
  const wave = fluidCanvas(byId('pkWave'), {
    height: (w) => clamp(Math.round(w * 0.36), 230, 310), onResize: redraw,
  });
  const dens = fluidCanvas(byId('pkDens'), {
    height: (w) => clamp(Math.round(w * 0.24), 170, 210), onResize: redraw,
  });
  const mom = fluidCanvas(byId('pkMom'), {
    height: (w) => clamp(Math.round(w * 0.24), 170, 210), onResize: redraw,
  });

  // ---------- State ----------
  let dirty = true;
  let t = 0;
  let comp = null;
  const re = new Float64Array(MAX_N);
  const im = new Float64Array(MAX_N);

  // ---------- Controls ----------
  const width = bindRange('pkWidth', { format: (v) => `${v.toFixed(2)} նմ`, onInput: rebuild });
  const k0 = bindRange('pkK0', { format: (v) => `${v.toFixed(1)} նմ⁻¹`, onInput: rebuild });
  const count = bindSegmented('pkCount', { onChange: rebuild });
  const animate = bindCheckbox('pkAnimate', {
    onChange: (on) => { if (on && t >= T_MAX) t = 0; redraw(); },
  });
  onClick('pkReset', () => { t = 0; redraw(); });

  const dk = () => 1 / (2 * width.value);

  /** New set of plane waves; time returns to zero. */
  function rebuild() {
    comp = buildComponents(k0.value, dk(), Number(count.value));
    t = 0;
    setText('pkDkHint',
      `Իմպուլսների բաշխման լայնությունը՝ Δk = 1/(2Δx₀) = ${dk().toFixed(2)} նմ⁻¹, այսինքն՝ Δp = ħΔk։`);
    const p0 = P_PER_K * k0.value;
    setText('pkLambda', `${((2 * Math.PI) / k0.value).toFixed(3)} նմ`);
    setText('pkP0', `${sci(p0)} կգ·մ/վ`);
    setText('pkV', `${sci(p0 / ME)} մ/վ`);
    setText('pkE', `${((p0 * p0) / (2 * ME) / EV).toFixed(2)} էՎ`);
    redraw();
  }

  // ---------- Readouts ----------
  function updateStats(u) {
    const dp = u.dk * P_PER_K;                       // kg·m/s
    const product = u.dx * 1e-9 * dp;                // J·s
    const finite = Number.isFinite(u.dx);
    setText('pkDx', finite ? `${u.dx.toFixed(3)} նմ` : '∞');
    setText('pkDp', u.dk === 0 ? '0' : `${sci(dp)} կգ·մ/վ`);
    setText('pkProd', finite ? `${fixedPow(product, -34)} Ջ·վ` : 'անորոշ (∞ · 0)');
    setText('pkLimit', `${fixedPow(HBAR / 2, -34)} Ջ·վ`);
    setText('pkRatio', finite ? (product / HBAR).toFixed(3) : '—');
    setText('pkTime', `${t.toFixed(2)} ֆվ`);

    const n = comp.k.length;
    let note;
    if (n === 1) {
      note = '<b>Մեկ հարթ ալիք։</b> Իմպուլսը ճշգրիտ հայտնի է (Δp = 0), բայց էլեկտրոնը նույն հավանականությամբ կարող է լինել ցանկացած կետում (Δx → ∞)։';
    } else if (!comp.many) {
      note = `<b>${n} ալիքի գումար։</b> Ալիքները տեղ-տեղ ուժեղացնում են իրար, բայց պատկերը կրկնվում է ամեն ${comp.period.toFixed(1)} նմ-ը մեկ. մասնիկը դեռ լիովին տեղայնացված չէ։ Δx-ը հաշվված է մեկ խմբի համար։`;
    } else if (t === 0) {
      note = '<b>Գաուսյան փաթեթ։</b> Δx·Δp = ħ/2. սա հնարավոր ամենափոքր արժեքն է։ Փոխեք լայնությունը. արտադրյալը չի փոխվի։';
    } else {
      note = '<b>Փաթեթը լայնանում է։</b> Δp-ն մնում է նույնը, Δx-ն աճում է, ուստի Δx·Δp &gt; ħ/2։';
    }
    setHTML('pkNote', note);
  }

  // ---------- Drawing helpers ----------
  /** x axis (nm) shared by the two upper plots; returns the mapping. */
  function xAxis(view, top, bottom, xc) {
    const { ctx, width: W } = view;
    const plotW = W - 2 * PAD;
    const X = (x) => PAD + ((x - (xc - HALF)) / (2 * HALF)) * plotW;
    const labelStep = W < 520 ? 2 : 1;
    const unitX = W - PAD;
    for (let k = Math.ceil(xc - HALF - 1e-9); k <= xc + HALF + 1e-9; k++) {
      const x = X(k);
      line(ctx, x, top, x, bottom, { color: COLORS.grid, width: 1 });
      if (k % labelStep === 0 && x < unitX - 46 && x > PAD + 6) {
        text(ctx, String(k), x, bottom + 12, { color: COLORS.text3, size: 10, family: 'mono', align: 'center' });
      }
    }
    line(ctx, PAD, bottom, W - PAD, bottom, { color: COLORS.axis, width: 1 });
    text(ctx, 'x, նմ', unitX, bottom + 12, { color: COLORS.text3, size: 11, align: 'right' });
    return X;
  }

  /** Shaded ⟨q⟩ ± Δq band with a label on the row above the plot. */
  function band(view, x1, x2, top, bottom, label, labelY) {
    const { ctx, width: W } = view;
    const a = clamp(x1, PAD, W - PAD);
    const b = clamp(x2, PAD, W - PAD);
    ctx.fillStyle = alpha(COLORS.coral, 0.14);
    ctx.fillRect(a, top, b - a, bottom - top);
    const edge = { color: COLORS.coral, width: 1.2, dash: [4, 4] };
    if (x1 >= PAD && x1 <= W - PAD) line(ctx, x1, top, x1, bottom, edge);
    if (x2 >= PAD && x2 <= W - PAD) line(ctx, x2, top, x2, bottom, edge);
    ctx.font = font(11, { family: 'mono' });
    const tw = ctx.measureText(label).width;
    const cx = clamp((a + b) / 2, PAD + tw / 2, W - PAD - tw / 2);
    text(ctx, label, cx, labelY, { color: COLORS.coral, size: 11, family: 'mono', align: 'center' });
  }

  // ---------- Top: component waves, their sum and the envelope ----------
  function drawWave(xc, n, x0, dxs) {
    const { ctx, width: W, height: H } = wave;
    clear(ctx, W, H, COLORS.canvasBg);
    const top = 12, bottom = H - 26;
    const mid = (top + bottom) / 2;
    const amp = (bottom - top) / 2 / 1.08;
    const X = xAxis(wave, top, bottom, xc);
    line(ctx, PAD, mid, W - PAD, mid, { color: COLORS.axis, width: 1 });
    const px = (W - 2 * PAD) / n;

    ctx.save();
    ctx.beginPath();
    ctx.rect(PAD, top, W - 2 * PAD, bottom - top);
    ctx.clip();
    ctx.lineJoin = 'round';

    // A few of the plane waves. With many of them each one is tiny, so they
    // are magnified until the central one is clearly visible.
    const cnt = comp.k.length;
    const c = (cnt - 1) / 2;
    let shown;
    if (cnt <= 7) shown = [...comp.k.keys()];
    else {
      const per = Math.round(dk() / comp.step);       // components per Δk
      shown = [-2, -1, 0, 1, 2].map((m) => c + m * per);
    }
    const boost = Math.max(1, 0.2 / comp.w[c]);
    ctx.strokeStyle = alpha(COLORS.text3, cnt === 1 ? 0 : 0.6);
    ctx.lineWidth = 1;
    for (const j of shown) {
      const k = comp.k[j];
      const a = comp.w[j] * boost * amp;
      const ph0 = k * x0 - DISP * k * k * t;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const y = mid - a * Math.cos(ph0 + k * dxs * i);
        if (i) ctx.lineTo(PAD + (i + 0.5) * px, y); else ctx.moveTo(PAD + 0.5 * px, y);
      }
      ctx.stroke();
    }

    // Envelope ±|ψ|
    ctx.strokeStyle = COLORS.amber;
    ctx.lineWidth = 1.5;
    for (const sign of [1, -1]) {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const y = mid - sign * Math.hypot(re[i], im[i]) * amp;
        if (i) ctx.lineTo(PAD + (i + 0.5) * px, y); else ctx.moveTo(PAD + 0.5 * px, y);
      }
      ctx.stroke();
    }

    // The sum: Re ψ
    ctx.strokeStyle = COLORS.blue;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const y = mid - re[i] * amp;
      if (i) ctx.lineTo(PAD + (i + 0.5) * px, y); else ctx.moveTo(PAD + 0.5 * px, y);
    }
    ctx.stroke();
    ctx.restore();
    return X;
  }

  // ---------- Middle: probability density ----------
  function drawDensity(xc, n, u) {
    const { ctx, width: W, height: H } = dens;
    clear(ctx, W, H, COLORS.canvasBg);
    const top = 42, bottom = H - 26;
    const X = xAxis(dens, top, bottom, xc);
    const scale = (bottom - top) / 1.08;
    const px = (W - 2 * PAD) / n;
    text(ctx, '|ψ(x)|²', PAD + 2, 14, { color: COLORS.text2, size: 13 });

    ctx.save();
    ctx.beginPath();
    ctx.rect(PAD, top - 2, W - 2 * PAD, bottom - top + 2);
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(PAD, bottom);
    for (let i = 0; i < n; i++) {
      ctx.lineTo(PAD + (i + 0.5) * px, bottom - (re[i] * re[i] + im[i] * im[i]) * scale);
    }
    ctx.lineTo(W - PAD, bottom);
    ctx.fillStyle = alpha(COLORS.teal, 0.22);
    ctx.fill();
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const y = bottom - (re[i] * re[i] + im[i] * im[i]) * scale;
      if (i) ctx.lineTo(PAD + (i + 0.5) * px, y); else ctx.moveTo(PAD + 0.5 * px, y);
    }
    ctx.strokeStyle = COLORS.teal;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();

    if (Number.isFinite(u.dx)) {
      band(dens, X(u.x - u.dx), X(u.x + u.dx), top, bottom, `⟨x⟩ ± Δx,  Δx = ${u.dx.toFixed(2)} նմ`, 30);
    } else {
      text(ctx, 'Δx → ∞', W / 2, 30, { color: COLORS.coral, size: 11, family: 'mono', align: 'center' });
    }
  }

  // ---------- Bottom: momentum distribution ----------
  function drawMomentum(u) {
    const { ctx, width: W, height: H } = mom;
    clear(ctx, W, H, COLORS.canvasBg);
    const top = 42, bottom = H - 26;
    const plotW = W - 2 * PAD;
    const X = (p) => PAD + (p / P_AXIS) * plotW;       // p in 10⁻²⁵ kg·m/s
    const XK = (k) => X((k * P_PER_K) / P_UNIT);
    const scale = (bottom - top) / 1.08;
    text(ctx, '|φ(p)|²', PAD + 2, 14, { color: COLORS.text2, size: 13 });

    const unit = 'p, 10⁻²⁵ կգ·մ/վ';
    ctx.font = font(11);
    const unitW = ctx.measureText(unit).width;
    for (let p = 0; p <= P_AXIS; p += 5) {
      const x = X(p);
      line(ctx, x, top, x, bottom, { color: COLORS.grid, width: 1 });
      if (x < W - PAD - unitW - 12) {
        text(ctx, String(p), Math.max(x, PAD + 4), bottom + 12, {
          color: COLORS.text3, size: 10, family: 'mono', align: 'center',
        });
      }
    }
    line(ctx, PAD, bottom, W - PAD, bottom, { color: COLORS.axis, width: 1 });
    text(ctx, unit, W - PAD, bottom + 12, { color: COLORS.text3, size: 11, align: 'right' });

    const { k, w } = comp;
    const wMax = w[(k.length - 1) / 2];
    const h = (j) => (w[j] / wMax) ** 2 * scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(PAD, top - 2, plotW, bottom - top + 2);
    ctx.clip();
    if (comp.many) {
      ctx.beginPath();
      ctx.moveTo(XK(k[0]), bottom);
      for (let j = 0; j < k.length; j++) ctx.lineTo(XK(k[j]), bottom - h(j));
      ctx.lineTo(XK(k[k.length - 1]), bottom);
      ctx.fillStyle = alpha(COLORS.purple, 0.22);
      ctx.fill();
      ctx.beginPath();
      for (let j = 0; j < k.length; j++) {
        if (j) ctx.lineTo(XK(k[j]), bottom - h(j)); else ctx.moveTo(XK(k[j]), bottom - h(j));
      }
      ctx.strokeStyle = COLORS.purple;
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      for (let j = 0; j < k.length; j++) {
        const x = XK(k[j]);
        line(ctx, x, bottom, x, bottom - h(j), { color: COLORS.purple, width: 2.5, cap: 'round' });
        ctx.fillStyle = COLORS.purple;
        ctx.beginPath();
        ctx.arc(x, bottom - h(j), 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    if (u.dk > 0) {
      band(mom, XK(u.k - u.dk), XK(u.k + u.dk), top, bottom,
        `⟨p⟩ ± Δp,  Δp = ${sci(u.dk * P_PER_K)} կգ·մ/վ`, 30);
    } else {
      const x = XK(u.k);
      ctx.font = font(11, { family: 'mono' });
      const tw = ctx.measureText('Δp = 0').width;
      text(ctx, 'Δp = 0', clamp(x, PAD + tw / 2, W - PAD - tw / 2), 30, {
        color: COLORS.coral, size: 11, family: 'mono', align: 'center',
      });
    }
  }

  // ---------- Frame ----------
  function render() {
    if (!wave.width || !comp) return;
    const xc = groupVelocity(k0.value) * t;
    const n = Math.min(MAX_N, Math.round((wave.width - 2 * PAD) * 2));
    const dxs = (2 * HALF) / n;
    const x0 = xc - HALF + dxs / 2;
    sampleWave(comp, t, x0, dxs, n, re, im);
    const u = uncertainties(comp, k0.value, width.value, t);
    drawWave(xc, n, x0, dxs);
    drawDensity(xc, n, u);
    drawMomentum(u);
    updateStats(u);
  }

  function frame(dt) {
    if (animate.checked) {
      t = Math.min(t + RATE * dt, T_MAX);
      if (t >= T_MAX) animate.set(false, { silent: true });
      dirty = true;
    }
    if (!dirty) return;
    dirty = false;
    render();
  }

  onThemeChange(redraw);
  fontsReady().then(redraw);
  rebuild();

  return { frame, get state() { return { t, comp }; } };
}
