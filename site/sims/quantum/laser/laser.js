// Tab «Լազեր»: three-level laser with a resonator. View and controls;
// the model itself lives in physics.js.

import { fluidCanvas } from '../../../assets/js/core/canvas.js';
import { bindRange, bindCheckbox, bindPlayPause, onClick } from '../../../assets/js/core/controls.js';
import { clear, line, arrow, circle, text, roundRect } from '../../../assets/js/core/draw.js';
import { COLORS, alpha, font } from '../../../assets/js/core/theme.js';
import { clamp, TAU } from '../../../assets/js/core/math.js';
import { byId, setText, setHTML } from '../../../assets/js/core/dom.js';
import { createLaser, LASER } from './physics.js';

const WINDOW = 30;          // seconds shown on the time chart
const SAMPLE = 0.1;         // chart sampling period, s
const X_LEFT = -0.1;        // scene spans X_LEFT … X_RIGHT in cavity lengths
const X_RIGHT = 1.42;

function niceMax(v) {
  const p = 10 ** Math.floor(Math.log10(v));
  const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

export function createLaserTab() {
  const sim = createLaser();
  let paused = false;
  let samples = [];
  let nextSample = 0;
  let calloutKey = '';

  const scene = fluidCanvas(byId('lScene'), {
    height: (w) => clamp(Math.round((w / (X_RIGHT - X_LEFT)) * 0.68), 200, 420),
  });
  const levels = fluidCanvas(byId('lLevels'), { height: () => 230 });
  const chart = fluidCanvas(byId('lChart'), { height: () => 230 });

  bindRange('lPump', {
    format: (v) => `${v.toFixed(2)} վ⁻¹`,
    onInput: (v) => { sim.params.W = v; refresh(); },
  });
  bindRange('lTau', {
    format: (v) => `${v.toFixed(1)} վ`,
    onInput: (v) => { sim.params.tau2 = v; refresh(); },
  });
  bindRange('lR', {
    format: (v) => `${v.toFixed(0)} %`,
    onInput: (v) => { sim.params.R = v / 100; refresh(); },
  });
  bindCheckbox('lMirrors', { onChange: (on) => { sim.params.mirrors = on; refresh(); } });
  sim.params.W = parseFloat(byId('lPump').value);
  sim.params.tau2 = parseFloat(byId('lTau').value);
  sim.params.R = parseFloat(byId('lR').value) / 100;
  sim.params.mirrors = byId('lMirrors').checked;

  bindPlayPause('lPlay', {
    paused,
    label: (p) => (p ? '▶ Գործարկել' : '⏸ Դադար'),
    onChange: (p) => { paused = p; },
  });
  onClick('lReset', () => {
    sim.reset();
    samples = [];
    nextSample = 0;
    refresh();
  });

  function refresh() {
    updateStats();
    if (paused) drawAll();
  }

  /* ---------------- stats ---------------- */

  function updateStats() {
    const [, n1, n2, n3] = sim.n;
    const { W, tau2, R, mirrors } = sim.params;
    const inverted = n2 > n1;
    setText('lN1', String(n1));
    setText('lN2', String(n2));
    setText('lN3', String(n3));
    setText('lDN', `${n2 - n1 > 0 ? '+' : n2 - n1 < 0 ? '−' : ''}${Math.abs(n2 - n1)}`);
    setText('lWT', (W * tau2).toFixed(2));
    setText('lPhot', String(sim.cavity));
    setText('lPower', sim.rate.out.toFixed(1));

    let key, html;
    if (sim.lasing()) {
      key = R >= 0.999 ? 'lasing-closed' : 'lasing';
      html = R >= 0.999
        ? '<b>Լազերային գեներացիա</b> կա, բայց ելքի հայելին անդրադարձնում է ամբողջ լույսը (R = 100 %), և փունջը դուրս չի գալիս ռեզոնատորից։'
        : '<b>Լազերային գեներացիա.</b> ֆոտոնների հեղեղը հայելիների միջև ինքն իրեն պահպանում է, իսկ ելքի հայելուց դուրս է գալիս ուղղորդված փունջ։';
    } else if (!inverted) {
      key = 'none';
      html = '<b>Գեներացիա չկա.</b> N₂ ≤ N₁, բնակեցվածության շրջում չկա. ֆոտոններն ավելի հաճախ կլանվում են, քան նոր ֆոտոններ առաջացնում։ Երևում է միայն թույլ ինքնակամ լուսարձակումը բոլոր ուղղություններով։';
    } else if (!mirrors) {
      key = 'no-mirrors';
      html = '<b>Գեներացիա չկա.</b> շրջում կա (N₂ > N₁), բայց առանց ռեզոնատորի ֆոտոններն ակտիվ միջավայրով անցնում են միայն մեկ անգամ և հեղեղ չեն հասցնում առաջացնել. միջավայրը պարզապես լուսարձակում է բոլոր կողմերով։';
    } else {
      key = 'threshold';
      html = '<b>Գեներացիա չկա</b> (առայժմ). շրջում կա, բայց ուժեղացումը դեռ չի գերազանցում ռեզոնատորի կորուստները, կամ հեղեղը դեռ նոր է ծնվում։ Ավելացրեք մղումը կամ սպասեք։';
    }
    if (key !== calloutKey) {
      calloutKey = key;
      setHTML('lCallout', html);
    }
  }

  /* ---------------- cavity scene ---------------- */

  function drawScene() {
    const { ctx, width: W, height: H } = scene;
    if (!W) return;
    clear(ctx, W, H, COLORS.canvasBg);

    const S = W / (X_RIGHT - X_LEFT);            // px per cavity length
    const cy = H * 0.56;
    const X = (x) => (x - X_LEFT) * S;
    const Y = (y) => cy + y * S;
    const { W: pump, R, mirrors } = sim.params;
    const small = W < 520;
    const fs = small ? 10 : 12;
    const beam = COLORS.red;

    // Pump lamp
    const lampOn = clamp(pump / 2, 0, 1);
    const lx = X(LASER.MED_X0), lw = X(LASER.MED_X1) - lx;
    const ly = Y(-0.285), lh = Math.max(7, 0.045 * S);
    ctx.fillStyle = alpha(COLORS.amber, 0.12 + 0.88 * lampOn);
    roundRect(ctx, lx, ly, lw, lh, lh / 2);
    ctx.fill();
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1;
    ctx.stroke();
    if (lampOn > 0) {
      ctx.save();
      ctx.strokeStyle = alpha(COLORS.amber, 0.15 + 0.55 * lampOn);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 5]);
      ctx.lineDashOffset = -((sim.t * 40) % 8);
      ctx.beginPath();
      const rays = small ? 8 : 12;
      for (let i = 0; i < rays; i++) {
        const x = lx + ((i + 0.5) / rays) * lw;
        ctx.moveTo(x, ly + lh + 3);
        ctx.lineTo(x, Y(-0.18) - 2);
      }
      ctx.stroke();
      ctx.restore();
    }
    text(ctx, 'մղման լամպ', lx + lw / 2, ly - 9, { color: COLORS.text3, size: fs, align: 'center' });

    // Active medium
    ctx.fillStyle = alpha(COLORS.blue, 0.06);
    roundRect(ctx, X(0.07), Y(-0.17), X(0.93) - X(0.07), 0.34 * S, 8);
    ctx.fill();
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Output beam
    const power = clamp(sim.rate.out / 25, 0, 1);
    if (power > 0.01) {
      const g = ctx.createLinearGradient(0, Y(-0.16), 0, Y(0.16));
      g.addColorStop(0, alpha(beam, 0));
      g.addColorStop(0.5, alpha(beam, 0.3 * power));
      g.addColorStop(1, alpha(beam, 0));
      ctx.fillStyle = g;
      ctx.fillRect(X(1.014), Y(-0.16), W - X(1.014), 0.32 * S);
    }

    // Mirrors
    const mh = LASER.MIRROR_HALF * S;
    const mw = Math.max(4, 0.016 * S);
    if (mirrors) {
      ctx.fillStyle = COLORS.text2;
      ctx.fillRect(X(0) - mw, cy - mh, mw, 2 * mh);
      ctx.fillStyle = alpha(COLORS.text2, 0.55);
      ctx.fillRect(X(1), cy - mh, mw * 0.7, 2 * mh);
    } else {
      ctx.save();
      ctx.strokeStyle = COLORS.axis;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(X(0) - mw, cy - mh, mw, 2 * mh);
      ctx.strokeRect(X(1), cy - mh, mw * 0.7, 2 * mh);
      ctx.restore();
    }

    // Atoms
    const ra = clamp(S * 0.011, 3, 6.5);
    for (const a of sim.atoms) {
      const x = X(a.x), y = Y(a.y);
      if (a.s === 1) circle(ctx, x, y, ra, { fill: COLORS.surface2, stroke: COLORS.text3, width: 1.3 });
      else circle(ctx, x, y, ra, { fill: a.s === 2 ? COLORS.amber : COLORS.purple });
    }

    // Photons: short strokes along the velocity
    ctx.save();
    ctx.strokeStyle = beam;
    ctx.lineCap = 'round';
    ctx.lineWidth = small ? 1.6 : 2;
    const len = clamp(S * 0.014, 4, 8) / LASER.C;
    ctx.beginPath();
    const list = sim.photons;
    const stride = list.length > 900 ? 2 : 1;      // thin out the drawing only
    for (let i = 0; i < list.length; i += stride) {
      const p = list[i];
      const x = X(p.x), y = Y(p.y);
      ctx.moveTo(x, y);
      ctx.lineTo(x - p.vx * len, y - p.vy * len);
    }
    ctx.stroke();
    ctx.restore();

    // Labels
    const yl = Math.min(H - 10, Y(0.2) + 16);
    if (mirrors) {
      text(ctx, small ? 'հայելի 100 %' : 'անթափանց հայելի (100 %)', 4, yl, { color: COLORS.text3, size: fs });
      text(ctx, `ելքի հայելի R = ${(R * 100).toFixed(0)} %`, X(1), yl, { color: COLORS.text3, size: fs, align: 'center' });
    } else {
      text(ctx, 'առանց հայելիների', X(1), yl, { color: COLORS.text3, size: fs, align: 'center' });
    }
    text(ctx, 'ակտիվ միջավայր', X(0.5), yl, { color: COLORS.text3, size: fs, align: 'center' });
    if (power > 0.2 && mirrors) {
      text(ctx, small ? 'փունջ' : 'լազերային փունջ', (X(1.02) + W) / 2, Y(-0.2), { color: beam, size: fs, align: 'center', weight: 600 });
    }
  }

  /* ---------------- energy levels + populations ---------------- */

  function wavyDown(ctx, x, y0, y1, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const end = y1 - 9;
    for (let y = y0; y <= end; y += 1) {
      const a = 4 * Math.min(1, (end - y) / 6, (y - y0) / 6) * Math.sin(((y - y0) / 11) * TAU - sim.t * 9);
      if (y === y0) ctx.moveTo(x + a, y); else ctx.lineTo(x + a, y);
    }
    ctx.stroke();
    ctx.restore();
    arrow(ctx, x, y1 - 10, x, y1, { color, width: 2, head: 8 });
  }

  function drawLevels() {
    const { ctx, width: W, height: H } = levels;
    if (!W) return;
    clear(ctx, W, H, COLORS.canvasBg);
    const [, n1, n2, n3] = sim.n;
    const inverted = n2 > n1;

    const xL = 34, xR = W - 12;
    const y1 = H - 30, y3 = 52, y2 = y3 + (y1 - y3) * 0.36;
    const ys = [0, y1, y2, y3];
    const names = ['', 'E₁', 'E₂', 'E₃'];
    const colors = ['', COLORS.text3, COLORS.amber, COLORS.purple];
    const xBar = xL + (xR - xL) * 0.5;
    const barMax = xR - xBar;

    // Inversion badge
    text(ctx, inverted ? 'N₂ > N₁ — բնակեցվածության շրջում' : 'N₂ ≤ N₁ — շրջում չկա', W / 2, 18, {
      color: inverted ? COLORS.green : COLORS.text3, size: 12, weight: 600, align: 'center',
    });

    for (let s = 1; s <= 3; s++) {
      const n = sim.n[s];
      line(ctx, xL, ys[s], xR, ys[s], { color: COLORS.text2, width: 1.5 });
      text(ctx, names[s], xL - 7, ys[s], { color: COLORS.text2, size: 13, align: 'right' });
      const w = (n / sim.count) * barMax;
      if (w > 0.5) {
        ctx.fillStyle = s === 1 ? alpha(COLORS.text3, 0.75) : colors[s];
        roundRect(ctx, xBar, ys[s] - 12, w, 11, 3);
        ctx.fill();
      }
      text(ctx, `N${'₀₁₂₃'[s]} = ${n}`, xR, ys[s] + 11, {
        color: s === 2 && inverted ? COLORS.green : COLORS.text2, size: 11, family: 'mono', align: 'right',
      });
    }
    text(ctx, 'մետակայուն', xBar, y2 + 11, { color: COLORS.text3, size: 10 });

    // Transition arrows, brighter when the transition is busy
    const act = (r, ref) => 0.25 + 0.75 * clamp(r / ref, 0, 1);
    const xa = xL + (xBar - xL) * 0.18;
    const xb = xL + (xBar - xL) * 0.5;
    const xc = xL + (xBar - xL) * 0.82;
    arrow(ctx, xa, y1 - 3, xa, y3 + 3, { color: alpha(COLORS.purple, act(sim.rate.pump, 25)), width: 2.5, head: 8 });
    ctx.save();
    ctx.setLineDash([3, 4]);
    line(ctx, xb, y3 + 3, xb, y2 - 9, { color: alpha(COLORS.text2, act(sim.rate.relax, 25)), width: 2 });
    ctx.restore();
    arrow(ctx, xb, y2 - 10, xb, y2 - 3, { color: alpha(COLORS.text2, act(sim.rate.relax, 25)), width: 2, head: 7 });
    wavyDown(ctx, xc, y2 + 3, y1 - 3, alpha(COLORS.red, act(sim.rate.stim + sim.rate.spont, 25)));

    text(ctx, 'մղում', xa + 6, (y1 + y2) / 2 + 14, { color: COLORS.purple, size: 10 });
    text(ctx, 'hν', xc + 12, (y1 + y2) / 2 - 8, { color: COLORS.red, size: 12, style: 'italic', family: 'display' });
  }

  /* ---------------- time chart ---------------- */

  function drawChart() {
    const { ctx, width: W, height: H } = chart;
    if (!W) return;
    clear(ctx, W, H, COLORS.canvasBg);
    const padL = 40, padR = 40, padB = 24;
    const series = [
      { label: 'ֆոտոններ ռեզոնատորում n', color: COLORS.blue, i: 1, floor: 20 },
      { label: 'ելքի հզորություն P', color: COLORS.red, i: 2, floor: 5 },
    ];

    ctx.font = font(11);
    let lx = padL, ly = 14;
    for (const s of series) {
      const w = 20 + ctx.measureText(s.label).width;
      if (lx + w > W - 8 && lx > padL) { lx = padL; ly += 16; }
      line(ctx, lx, ly, lx + 14, ly, { color: s.color, width: 2.5, cap: 'round' });
      text(ctx, s.label, lx + 20, ly, { color: COLORS.text2, size: 11 });
      lx += w + 16;
    }

    const top = ly + 18, bottom = H - padB;
    const plotW = W - padL - padR;
    const t0 = Math.max(0, sim.t - WINDOW);
    const X = (t) => padL + ((t - t0) / WINDOW) * plotW;

    for (const s of series) {
      let m = s.floor;
      for (const smp of samples) if (smp[s.i] > m) m = smp[s.i];
      s.max = niceMax(m * 1.05);
    }

    for (let k = 0; k <= 2; k++) {
      const y = bottom - (k / 2) * (bottom - top);
      line(ctx, padL, y, W - padR, y, k === 0 ? { color: COLORS.axis, width: 1 } : { color: COLORS.axis, width: 1, dash: [3, 5] });
      text(ctx, String((series[0].max * k) / 2), padL - 6, y, { color: series[0].color, size: 10, family: 'mono', align: 'right' });
      text(ctx, String((series[1].max * k) / 2), W - padR + 6, y, { color: series[1].color, size: 10, family: 'mono' });
    }
    const stepT = W < 420 ? 10 : 5;
    for (let k = Math.ceil(t0 / stepT - 1e-9); k * stepT <= t0 + WINDOW + 1e-9; k++) {
      const x = X(k * stepT);
      line(ctx, x, top, x, bottom, { color: COLORS.grid, width: 1 });
      if (x < W - padR - 36) text(ctx, String(k * stepT), x, bottom + 12, { color: COLORS.text3, size: 10, family: 'mono', align: 'center' });
    }
    text(ctx, 't, վ', W - padR, bottom + 12, { color: COLORS.text3, size: 11, align: 'right' });
    line(ctx, padL, top, padL, bottom, { color: COLORS.axis, width: 1 });
    line(ctx, W - padR, top, W - padR, bottom, { color: COLORS.axis, width: 1 });

    if (samples.length < 2) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(padL, top - 2, plotW, bottom - top + 4);
    ctx.clip();
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    for (const s of series) {
      ctx.strokeStyle = s.color;
      ctx.beginPath();
      samples.forEach((smp, j) => {
        const x = X(smp[0]);
        const y = bottom - (smp[s.i] / s.max) * (bottom - top);
        if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      });
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawAll() {
    drawScene();
    drawLevels();
    drawChart();
  }

  function frame(dt) {
    if (!paused) {
      sim.step(dt);
      while (sim.t >= nextSample) {
        samples.push([sim.t, sim.cavity, sim.rate.out]);
        nextSample += SAMPLE;
      }
      const cut = sim.t - WINDOW - 1;
      while (samples.length && samples[0][0] < cut) samples.shift();
      updateStats();
    }
    drawAll();
  }

  updateStats();
  return { frame, sim };
}
