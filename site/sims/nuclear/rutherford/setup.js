// Tab 1 — the Geiger–Marsden apparatus seen from above.
//
// α-particles leave a lead block, pass a collimator and hit a thin gold foil
// at the centre of a circular fluorescent (ZnS) screen. Each particle is
// scattered by an angle drawn from the screened Rutherford distribution (or
// from a narrow Gaussian in Thomson's model) and makes a flash on the screen.
// A microscope that can be turned around the foil counts the flashes it sees.
//
// All particles are counted; only a thinned-out subset is drawn as flying
// dots (all of them at low rates). A drawn particle is counted when its dot
// reaches the screen, the others at the moment they are emitted.

import { fluidCanvas, onDrag } from '../../../assets/js/core/canvas.js';
import { bindRange, bindSegmented, bindPlayPause, onClick } from '../../../assets/js/core/controls.js';
import { byId, setText, setHTML } from '../../../assets/js/core/dom.js';
import { clear, line, circle, text, roundRect } from '../../../assets/js/core/draw.js';
import { COLORS, themed, alpha, onThemeChange, fontsReady } from '../../../assets/js/core/theme.js';
import { DEG, TAU, clamp } from '../../../assets/js/core/math.js';
import { makeRutherfordSampler, makeThomsonSampler } from './physics.js';

const THETA_S = 4.8 * DEG;        // screening angle of the model distribution (gives ≈ 1/8000 beyond 90°, as Geiger and Marsden found)
const THOMSON_SIGMA = 0.7 * DEG;  // spread of the many tiny deflections in Thomson's model
const BIN = 2;                    // histogram bin, degrees
const NBINS = 180 / BIN;
const FLASH_BINS = 720;           // flash memory around the ring, 0.5° each
const FLASH_TAU = 0.35;           // s, flash afterglow
const DET_HALF = 2;               // microscope field of view: φ ± 2°
const VISIBLE_PER_S = 150;        // flying dots drawn per second (at most, roughly)
const SPEED = 420;                // px/s of the flying dots
const MAX_DOTS = 700;

const SAMPLERS = {
  rutherford: makeRutherfordSampler(THETA_S),
  thomson: makeThomsonSampler(THOMSON_SIGMA),
};

const C = themed((light) => ({
  alpha: COLORS.red,
  beam: COLORS.red,
  flash: light ? '#0f9a4c' : '#7dffae',
  lead: light ? '#8c93a8' : '#4f566d',
  leadEdge: light ? '#5d6480' : '#7f87a3',
  gold: light ? '#c08a12' : '#e6b532',
  screen: light ? 'rgba(15,154,76,0.35)' : 'rgba(125,255,174,0.28)',
  scope: COLORS.purple,
  bar: COLORS.green,
  theory: COLORS.amber,
}));

function fmtCount(n) {
  return n.toLocaleString('en-US').replace(/,/g, ' ');
}
function fmtFrac(n, total) {
  if (!total) return '0';
  const f = n / total;
  const pct = f === 0 ? '0' : f >= 0.1 ? (f * 100).toFixed(1) : (f * 100).toPrecision(2);
  return `${fmtCount(n)} (${pct} %)`;
}
const fmtRate = (r) => (r >= 100 ? fmtCount(Math.round(r)) : r >= 10 ? r.toFixed(0) : r >= 1 ? r.toFixed(1) : r > 0 ? r.toPrecision(2) : '0');

export function createSetup({ onModel }) {
  // ---------- State ----------
  const makeData = () => ({
    total: 0,
    bins: new Float64Array(NBINS),    // counts per BIN° (both sides together)
    small: 0, mid: 0, back: 0,
    det: 0, detTime: 0,               // microscope counts and the time it has been watching
  });
  const data = { rutherford: makeData(), thomson: makeData() };
  const state = { model: 'rutherford', paused: false, carry: 0 };
  const flash = new Float32Array(FLASH_BINS);   // signed angle −180…180
  let dots = [];
  let histDirty = true;
  let statsTimer = 0;
  let L = null;   // layout

  // ---------- Controls ----------
  const model = bindSegmented('model1', { onChange: (v) => { setModel(v); onModel?.(v); } });
  const rate = bindRange('rate', {
    format: (v) => `${fmtCount(Math.round(10 ** v))} /վ`,
  });
  const det = bindRange('detAngle', {
    format: (v) => `${v.toFixed(0)}°`,
    onInput: () => { resetDetector(); histDirty = true; },
  });
  bindPlayPause('playBtn', { onChange: (p) => { state.paused = p; } });
  onClick('clearBtn', () => {
    data[state.model] = makeData();
    flash.fill(0);
    dots = [];
    histDirty = true;
    updateStats();
  });

  function setModel(v) {
    state.model = v;
    model.set(v, { silent: true });
    flash.fill(0);
    dots = [];
    histDirty = true;
    updateStats();
  }

  function resetDetector() {
    for (const d of Object.values(data)) { d.det = 0; d.detTime = 0; }
    updateStats();
  }

  // ---------- Canvases ----------
  const view = fluidCanvas(byId('setupCv'), {
    height: (w) => clamp(Math.round(w * 0.6), 300, 500),
    onResize: () => { L = null; },
  });
  const chart = fluidCanvas(byId('histCv'), {
    height: (w) => clamp(Math.round(w * 0.36), 190, 270),
    onResize: () => { histDirty = true; },
  });

  function layout() {
    const { width: W, height: H } = view;
    const R = Math.max(60, Math.min(H / 2 - 40, (W - 130) / 2));
    const cx = Math.round((W + 60) / 2 + 5);
    const cy = Math.round(H / 2 + 6);
    const src = { x: cx - R - 52, y: cy };
    const collim = cx - R + 12;
    return { W, H, R, cx, cy, src, collim, small: W < 520 };
  }

  // ---------- Dragging the microscope ----------
  onDrag(view, {
    start: (p) => {
      if (!L) return false;
      const r = Math.hypot(p.x - L.cx, p.y - L.cy);
      if (r < L.R * 0.55) return false;
      aim(p);
      return true;
    },
    move: (p) => aim(p),
  });
  function aim(p) {
    const a = Math.atan2(-(p.y - L.cy), p.x - L.cx) / DEG;   // −180…180, upward positive
    det.set(Math.round(Math.abs(a)));
  }

  // ---------- Particles ----------
  function sampleTheta() {
    const s = SAMPLERS[state.model];
    const th = state.model === 'rutherford' ? s.sample(Math.random()) : s.sample(Math.random(), Math.random());
    return Math.min(th, Math.PI) * (Math.random() < 0.5 ? 1 : -1);   // signed: upper / lower half
  }

  function register(signed) {
    const d = data[state.model];
    const deg = Math.abs(signed) / DEG;
    d.total++;
    d.bins[Math.min(NBINS - 1, Math.floor(deg / BIN))]++;
    if (deg < 10) d.small++;
    else if (deg <= 90) d.mid++;
    else d.back++;
    if (signed >= 0 && Math.abs(deg - det.value) <= DET_HALF) d.det++;
    const fi = clamp(Math.floor((signed / DEG + 180) * 2), 0, FLASH_BINS - 1);
    flash[fi] += 1;
    histDirty = true;
  }

  function step(dt) {
    const d = data[state.model];
    d.detTime += dt;
    const r = 10 ** rate.value;
    state.carry += r * dt;
    let n = Math.floor(state.carry);
    state.carry -= n;
    const pVisible = Math.min(1, VISIBLE_PER_S / r);
    for (; n > 0; n--) {
      const th = sampleTheta();
      const show = dots.length < MAX_DOTS && (Math.random() < pVisible || Math.abs(th) > 60 * DEG);
      if (show) dots.push({ th, age: Math.random() * dt });
      else register(th);
    }
    const decay = Math.exp(-dt / FLASH_TAU);
    for (let i = 0; i < FLASH_BINS; i++) flash[i] *= decay;

    if (!L) return;
    const t1 = (L.cx - L.src.x - 20) / SPEED;   // time to reach the foil
    const t2 = t1 + L.R / SPEED;                  // … and the screen
    const keep = [];
    for (const p of dots) {
      p.age += dt;
      if (p.age >= t2) register(p.th);
      else keep.push(p);
    }
    dots = keep;
  }

  // ---------- Drawing ----------
  function drawScene() {
    const { ctx } = view;
    if (!view.width) return;
    if (!L) L = layout();
    const { W, H, R, cx, cy, src, collim, small } = L;
    clear(ctx, W, H, COLORS.canvasBg);

    // Vacuum chamber / screen ring with angle ticks
    ctx.save();
    ctx.lineWidth = 7;
    ctx.strokeStyle = C.screen;
    ctx.beginPath();
    ctx.arc(cx, cy, R, Math.PI + 2.5 * DEG, Math.PI - 2.5 * DEG + TAU);   // slit for the beam
    ctx.stroke();
    ctx.restore();
    for (let a = 0; a <= 180; a += 10) {
      for (const s of [1, -1]) {
        if (a === 180 || (s === -1 && (a === 0))) continue;
        const ang = s * a * DEG;
        const big = a % 30 === 0;
        const r1 = R + 5, r2 = R + (big ? 12 : 8);
        line(ctx, cx + r1 * Math.cos(ang), cy - r1 * Math.sin(ang), cx + r2 * Math.cos(ang), cy - r2 * Math.sin(ang),
          { color: COLORS.axis, width: 1 });
        if (big && s === 1 && a > 0 && a < 180 && Math.abs(a - det.value) > 7) {
          const rl = R + 22;
          text(ctx, `${a}°`, cx + rl * Math.cos(ang), cy - rl * Math.sin(ang),
            { color: COLORS.text3, size: 10, family: 'mono', align: 'center' });
        }
      }
    }

    // Microscope field of view on the screen
    const phi = det.value * DEG;
    ctx.save();
    ctx.strokeStyle = alpha(C.scope, 0.85);
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.arc(cx, cy, R, -phi - DET_HALF * DEG, -phi + DET_HALF * DEG);
    ctx.stroke();
    ctx.restore();

    // Flashes
    ctx.save();
    for (let i = 0; i < FLASH_BINS; i++) {
      const I = flash[i];
      if (I < 0.03) continue;
      const ang = ((i + 0.5) / 2 - 180) * DEG;
      const x = cx + R * Math.cos(ang), y = cy - R * Math.sin(ang);
      const rr = 1.8 + Math.min(3.5, 0.8 * Math.log2(1 + I));
      const a = Math.min(1, 0.15 + I);
      circle(ctx, x, y, rr * 2.2, { fill: alpha(C.flash, 0.22 * a) });
      circle(ctx, x, y, rr, { fill: alpha(C.flash, a) });
    }
    ctx.restore();

    // Beam: source block, collimator, beam line
    ctx.save();
    ctx.fillStyle = C.lead;
    ctx.strokeStyle = C.leadEdge;
    ctx.lineWidth = 1;
    roundRect(ctx, src.x - 26, src.y - 24, 46, 48, 4);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = COLORS.canvasBg;
    ctx.fillRect(src.x - 4, src.y - 3, 25, 6);
    ctx.restore();
    circle(ctx, src.x - 6, src.y, 4.5, { fill: C.alpha });
    // collimating diaphragm
    ctx.fillStyle = C.lead;
    ctx.fillRect(collim - 3, cy - 22, 6, 19);
    ctx.fillRect(collim - 3, cy + 3, 6, 19);
    line(ctx, src.x + 20, cy, cx, cy, { color: alpha(C.beam, 0.25), width: 3 });

    // Foil
    const fh = clamp(R * 0.28, 22, 48);
    ctx.fillStyle = C.gold;
    ctx.fillRect(cx - 1.5, cy - fh / 2, 3, fh);

    // Flying α-particles
    const t1 = (cx - src.x - 20) / SPEED;
    ctx.fillStyle = C.alpha;
    for (const p of dots) {
      let x, y;
      if (p.age < t1) { x = src.x + 20 + p.age * SPEED; y = cy; }
      else {
        const s = (p.age - t1) * SPEED;
        x = cx + s * Math.cos(p.th); y = cy - s * Math.sin(p.th);
      }
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, TAU);
      ctx.fill();
    }

    // Microscope on its arm
    const ux = Math.cos(phi), uy = -Math.sin(phi);
    line(ctx, cx, cy, cx + (R - 8) * ux, cy + (R - 8) * uy, { color: alpha(C.scope, 0.35), width: 1.5, dash: [4, 4] });
    ctx.save();
    ctx.translate(cx + R * ux, cy + R * uy);
    ctx.rotate(Math.atan2(uy, ux));
    ctx.fillStyle = alpha(C.scope, 0.9);
    ctx.strokeStyle = COLORS.canvasBg;
    ctx.lineWidth = 1.5;
    roundRect(ctx, 6, -6, 26, 12, 3); ctx.fill(); ctx.stroke();
    roundRect(ctx, 30, -8, 9, 16, 2); ctx.fill(); ctx.stroke();
    ctx.restore();

    // φ arc
    const ra = Math.min(46, R * 0.32);
    ctx.save();
    ctx.strokeStyle = alpha(C.scope, 0.8);
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(cx, cy, ra, -phi, 0);
    ctx.stroke();
    ctx.restore();
    line(ctx, cx, cy, cx + R - 8, cy, { color: alpha(COLORS.text3, 0.45), width: 1, dash: [2, 4] });
    const mid = -phi / 2;
    const lr = ra + 16;
    if (det.value >= 8) {
      text(ctx, 'φ', cx + lr * Math.cos(mid), cy + lr * Math.sin(mid), { color: C.scope, size: 13, style: 'italic', align: 'center' });
    }

    // Labels
    const lbl = { color: COLORS.text2, size: small ? 10 : 11, align: 'center' };
    text(ctx, 'α-աղբյուր', src.x - 3, cy + 36, lbl);
    text(ctx, 'նրբաթիթեղ', cx, cy + fh / 2 + 12, { ...lbl, color: C.gold });
    text(ctx, state.model === 'thomson' ? 'Թոմսոնի մոդել' : 'Միջուկային մոդել',
      W - 12, 16, { color: COLORS.text3, size: small ? 10 : 11, align: 'right' });
    text(ctx, 'էկրան', cx - R * 0.72, cy + R * 0.72 + 14, { ...lbl, color: C.flash });
  }

  function drawHist() {
    const { ctx, width: W, height: H } = chart;
    if (!W) return;
    const d = data[state.model];
    const m = { l: 44, r: 14, t: 16, b: 34 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    clear(ctx, W, H, COLORS.canvasBg);

    let maxC = 1;
    for (const c of d.bins) maxC = Math.max(maxC, c);
    const top = Math.max(2, Math.ceil(Math.log10(maxC * 1.5)));      // decades shown
    const X = (deg) => m.l + (deg / 180) * pw;
    const Y = (c) => m.t + ph - (Math.log10(c) / top) * ph;          // c ≥ 1

    // Grid
    for (let k = 0; k <= top; k++) {
      const y = Y(10 ** k);
      line(ctx, m.l, y, m.l + pw, y, { color: COLORS.grid, width: 1 });
      const lab = k === 0 ? '1' : k === 1 ? '10' : `10${'⁰¹²³⁴⁵⁶⁷⁸⁹'[k]}`;
      text(ctx, lab, m.l - 6, y, { color: COLORS.text3, size: 10, family: 'mono', align: 'right' });
    }
    const xStep = W < 420 ? 60 : 30;
    for (let a = 0; a <= 180; a += xStep) {
      line(ctx, X(a), m.t, X(a), m.t + ph, { color: COLORS.grid, width: 1 });
      text(ctx, `${a}°`, X(a), m.t + ph + 7, { color: COLORS.text3, size: 10, family: 'mono', align: 'center', baseline: 'top' });
    }
    line(ctx, m.l, m.t, m.l, m.t + ph, { color: COLORS.axis, width: 1.2 });
    line(ctx, m.l, m.t + ph, m.l + pw, m.t + ph, { color: COLORS.axis, width: 1.2 });
    text(ctx, 'θ', m.l + pw, H - 9, { color: COLORS.text2, size: 12, style: 'italic', align: 'right' });

    // Bars
    ctx.fillStyle = alpha(C.bar, 0.75);
    const bw = pw / NBINS;
    for (let i = 0; i < NBINS; i++) {
      const c = d.bins[i];
      if (c < 1) continue;
      const y = Y(c);
      ctx.fillRect(m.l + i * bw + 0.5, y, Math.max(1, bw - 1), m.t + ph - y);
    }

    // Theory: expected counts per bin
    if (d.total > 0) {
      const s = SAMPLERS[state.model];
      ctx.save();
      ctx.beginPath();
      ctx.rect(m.l, m.t, pw, ph);
      ctx.clip();
      ctx.strokeStyle = C.theory;
      ctx.lineWidth = 2;
      ctx.beginPath();
      let started = false;
      if (state.model === 'rutherford') {
        // pure Rutherford: N·C/sin⁴(θ/2)·Δθ (the screened model levels off below a few degrees)
        for (let a = 1; a <= 180; a += 0.5) {
          const c = d.total * s.rutherford(a * DEG) * BIN * DEG;
          if (c < 0.3) { started = false; continue; }
          const y = Y(c);
          if (!started) { ctx.moveTo(X(a), y); started = true; } else ctx.lineTo(X(a), y);
        }
      } else {
        for (let a = 0; a <= 180; a += 0.25) {
          const c = d.total * (s.fraction(a * DEG, (a + 0.01) * DEG) / 0.01) * BIN;
          if (c < 0.3) break;
          const y = Y(c);
          if (!started) { ctx.moveTo(X(a), y); started = true; } else ctx.lineTo(X(a), y);
        }
      }
      ctx.stroke();
      ctx.restore();
    } else {
      text(ctx, 'Տվյալներ դեռ չկան', m.l + pw / 2, m.t + ph / 2, { color: COLORS.text3, size: 12, align: 'center' });
    }

    // Microscope angle
    line(ctx, X(det.value), m.t, X(det.value), m.t + ph, { color: C.scope, width: 1.5, dash: [4, 3] });
  }

  function updateStats() {
    const d = data[state.model];
    setText('sTotal', fmtCount(d.total));
    setText('sSmall', fmtFrac(d.small, d.total));
    setText('sMid', fmtFrac(d.mid, d.total));
    setText('sBack', fmtFrac(d.back, d.total));
    setText('sDet', `${fmtCount(d.det)} (φ = ${det.value.toFixed(0)}°)`);
    setText('sDetRate', d.detTime > 0.5 ? `${fmtRate(d.det / d.detTime)} /վ` : '—');

    const s = SAMPLERS[state.model];
    const r = 10 ** rate.value;
    const lo = Math.max(0, det.value - DET_HALF) * DEG, hi = Math.min(180, det.value + DET_HALF) * DEG;
    const expect = (r * s.fraction(lo, hi)) / 2;   // one side of the beam only
    const back = s.fraction(90 * DEG, Math.PI);
    if (state.model === 'rutherford') {
      setHTML('setupInfo', `<b>Միջուկային մոդել</b><br>Մասնիկների մեծ մասը թիթեղով անցնում է գրեթե առանց շեղվելու, բայց մոտ ${fmtCount(Math.round(1 / back / 100) * 100)} մասնիկից մեկը շեղվում է 90°-ից ավելի։ Տեսականորեն մանրադիտակին (φ = ${det.value.toFixed(0)}°) պետք է հասնի ≈ ${fmtRate(expect)} բռնկում վայրկյանում։`);
    } else {
      setHTML('setupInfo', `<b>Թոմսոնի մոդել</b><br>Ատոմի դրական լիցքը «քսված» է ատոմով մեկ, նրա դաշտը թույլ է, և հազարավոր ատոմներով անցնելիս մասնիկները շեղվում են ընդամենը մոտ 1°-ով։ 10°-ից մեծ անկյուններով ցրված մասնիկներ գործնականում չկան։ Տեսականորեն մանրադիտակին պետք է հասնի ≈ ${expect >= 0.05 ? fmtRate(expect) : '0'} բռնկում վայրկյանում։`);
    }
    byId('theoryCaption').textContent = state.model === 'rutherford'
      ? 'տեսական կոր՝ 1/sin⁴(θ/2)' : 'տեսական կոր՝ Գաուսի բաշխում (σ ≈ 0.7°)';
  }

  rate.input.addEventListener('input', updateStats);
  onThemeChange(() => { histDirty = true; });
  fontsReady().then(() => { histDirty = true; });

  return {
    setModel,
    get model() { return state.model; },
    frame(dt) {
      if (!state.paused) step(dt);
      drawScene();
      if (histDirty) { histDirty = false; drawHist(); }
      statsTimer -= dt;
      if (statsTimer <= 0 && !state.paused) { statsTimer = 0.15; updateStats(); }
    },
    draw() { L = null; histDirty = true; updateStats(); },
    // for tests
    _data: data,
    _samplers: SAMPLERS,
  };
}
