// Doppler effect: wavefronts of a moving source, a draggable observer that
// counts arriving fronts, shock cone for v_s > c, and a scrolling chart of
// the observed frequency.

import { fluidCanvas, onDrag } from '../../../assets/js/core/canvas.js';
import {
  bindRange, bindCheckbox, bindPlayPause, onClick,
} from '../../../assets/js/core/controls.js';
import { startLoop } from '../../../assets/js/core/loop.js';
import { clear, line, arrow, circle, text } from '../../../assets/js/core/draw.js';
import { COLORS, font } from '../../../assets/js/core/theme.js';
import { byId, $$, setText, setHTML } from '../../../assets/js/core/dom.js';
import { clamp, TAU } from '../../../assets/js/core/math.js';
import { createWorld, machAngleDeg, C_SOUND as C } from './physics.js';
import { createAudio } from './audio.js';

const WORLD_W = 1800;          // width of the scene, m
const WINDOW = 24;             // time window of the chart, s
const FLASH = 0.5;             // duration of the arrival flash, s
const BASE_PITCH = 440;        // Hz of the audible tone when f = f0

const world = createWorld({ width: WORLD_W });
const audio = createAudio();
const state = { paused: false, cone: true, lambda: true };

/* ---------- number formatting ---------- */
const fmt = (v, d = 2) => {
  const s = v.toFixed(d);
  return (parseFloat(s) === 0 ? s.replace('-', '') : s).replace('-', '−');
};
const signed = (v, d = 0) => (v > 0.0005 ? '+' : '') + fmt(v, d);
const fmtF = (f) => (Number.isFinite(f) ? `${fmt(f, 2)} Հց` : '∞');

/* ---------- scene canvas ---------- */
const view = fluidCanvas(byId('cv'), {
  height: (w) => clamp(Math.round(w * 0.54), 280, 560),
  onResize: () => layout(),
});
let scale = view.width / WORLD_W;

function layout() {
  scale = view.width / WORLD_W;
  world.setHeight(view.height / scale);
}

/** Text with a halo in the canvas colour, so it stays legible over the fronts. */
function tag(ctx, str, x, y, { color = COLORS.text2, size = 11, align = 'center', weight = 600, style = '' } = {}) {
  ctx.save();
  ctx.font = font(size, { weight, style });
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = COLORS.canvasBg;
  ctx.strokeText(str, x, y);
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
  ctx.restore();
}

function bracket(ctx, x1, x2, y, label, color) {
  if (x2 - x1 < 5) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x1, y); ctx.lineTo(x2, y);
  ctx.moveTo(x1, y - 5); ctx.lineTo(x1, y + 5);
  ctx.moveTo(x2, y - 5); ctx.lineTo(x2, y + 5);
  ctx.stroke();
  ctx.setLineDash([2, 3]);
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.moveTo(x1, y - 5); ctx.lineTo(x1, world.ys * scale);
  ctx.moveTo(x2, y - 5); ctx.lineTo(x2, world.ys * scale);
  ctx.stroke();
  ctx.restore();
  tag(ctx, label, (x1 + x2) / 2, y + 13, { color, size: 12, style: 'italic' });
}

function drawScene() {
  const { ctx, width: W, height: H } = view;
  const s = scale;
  const ys = world.ys * s;
  const xs = world.xs * s;
  const xo = world.xo * s;
  const yo = world.yo * s;
  const M = world.vs / C;

  clear(ctx, W, H, COLORS.canvasBg);
  line(ctx, 0, ys, W, ys, { color: COLORS.axis, width: 1, dash: [3, 7] });

  /* Mach cone: the envelope of the fronts */
  if (M > 1 && state.cone) {
    const a = Math.asin(1 / M);
    const L = W * 2.5 + 400;
    const ux = -Math.cos(a) * L;
    const uy = Math.sin(a) * L;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(xs, ys);
    ctx.lineTo(xs + ux, ys - uy);
    ctx.lineTo(xs + ux, ys + uy);
    ctx.closePath();
    ctx.fillStyle = COLORS.amber;
    ctx.globalAlpha = 0.1;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = COLORS.amber;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(xs + ux, ys - uy); ctx.lineTo(xs, ys); ctx.lineTo(xs + ux, ys + uy);
    ctx.stroke();
    // angle between the cone and the line of motion
    const r = clamp(Math.min(W, H) * 0.12, 34, 60);
    ctx.beginPath();
    ctx.arc(xs, ys, r, -Math.PI, a - Math.PI);
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();
    const mid = a / 2 - Math.PI;
    tag(ctx, `α = ${fmt(machAngleDeg(M), 1)}°`, xs + (r + 8) * Math.cos(mid), ys + (r + 8) * Math.sin(mid) - 4, {
      color: COLORS.amber, size: 12, align: 'right', weight: 700,
    });
  }

  /* wavefronts */
  ctx.save();
  ctx.strokeStyle = COLORS.blue;
  ctx.lineWidth = 1.6;
  const fade = 0.9 * W;
  for (const f of world.fronts) {
    const R = C * (world.tc - f.t0) * s;
    if (R < 0.8) continue;
    const a = 1 - R / fade;
    if (a <= 0.02) continue;
    ctx.globalAlpha = Math.min(1, a * 1.1);
    ctx.beginPath();
    ctx.arc(f.x * s, f.y * s, R, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();

  /* wavelength brackets: the two newest fronts, on the axis */
  const fr = world.fronts;
  if (state.lambda && fr.length >= 2) {
    const nf = fr[fr.length - 1];
    const pf = fr[fr.length - 2];
    const Rn = C * (world.tc - nf.t0) * s;
    const Rp = C * (world.tc - pf.t0) * s;
    const yb = ys + 30;
    if (M < 1) bracket(ctx, nf.x * s + Rn, pf.x * s + Rp, yb, 'λ₁', COLORS.purple);
    bracket(ctx, pf.x * s - Rp, nf.x * s - Rn, yb, 'λ₂', COLORS.pink);
  }

  /* source */
  if (M > 0) {
    const len = 16 + 26 * Math.min(M, 2);
    arrow(ctx, xs + 14, ys, xs + 14 + len, ys, { color: COLORS.coral, width: 2.2, head: 9 });
    tag(ctx, 'v', xs + 14 + len / 2 - 3, ys - 13, { color: COLORS.coral, size: 12, style: 'italic' });
    tag(ctx, 's', xs + 14 + len / 2 + 4, ys - 9, { color: COLORS.coral, size: 9 });
  }
  circle(ctx, xs, ys, 9, { fill: COLORS.coral, stroke: COLORS.canvasBg, width: 2 });
  circle(ctx, xs, ys, 3.2, { fill: COLORS.canvasBg });
  tag(ctx, 'աղբյուր', xs, ys - 24, { color: COLORS.coral, size: 11 });
  if (Math.abs(M - 1) < 0.03) {
    tag(ctx, 'ձայնային արգելք', xs, ys - 44, { color: COLORS.amber, size: 12, weight: 700 });
  }

  /* observer with the arrival flash */
  const since = world.clock - world.lastArrival;
  if (since >= 0 && since < FLASH) {
    const k = since / FLASH;
    ctx.save();
    ctx.globalAlpha = 1 - k;
    circle(ctx, xo, yo, 11 + 26 * k, { stroke: COLORS.teal, width: 3 });
    ctx.globalAlpha = (1 - k) * 0.35;
    circle(ctx, xo, yo, 18, { fill: COLORS.teal });
    ctx.restore();
  }
  const vo = world.vo;
  if (Math.abs(vo) > 1) {
    const dir = Math.sign(vo);
    const len = 14 + 24 * Math.abs(vo / C);
    arrow(ctx, xo + dir * 14, yo, xo + dir * (14 + len), yo, { color: COLORS.teal, width: 2.2, head: 9 });
    tag(ctx, 'v', xo + dir * (14 + len / 2) - 3, yo - 13, { color: COLORS.teal, size: 12, style: 'italic' });
    tag(ctx, 'o', xo + dir * (14 + len / 2) + 4, yo - 9, { color: COLORS.teal, size: 9 });
  }
  circle(ctx, xo, yo, 9, { fill: COLORS.teal, stroke: COLORS.canvasBg, width: 2 });
  circle(ctx, xo, yo, 3.2, { fill: COLORS.canvasBg });
  tag(ctx, 'դիտորդ', xo, yo + 24, { color: COLORS.teal, size: 11 });
}

/* ---------- observer dragging ---------- */
onDrag(view, {
  start: (p) => Math.hypot(p.x - world.xo * scale, p.y - world.yo * scale) < 30,
  move: (p) => {
    const x = clamp(p.x / scale, 0.02 * WORLD_W, 0.98 * WORLD_W);
    const y = clamp(p.y / scale, 0.05 * world.height, 0.95 * world.height);
    let dy = y - world.lineY;
    if (Math.abs(dy * scale) < 12) dy = 0;     // snap onto the line of motion
    world.placeObserver(x, dy);
    update();
  },
});

/* ---------- chart ---------- */
const hist = { meas: [], th: [], breaks: [] };
let lastSample = -1;

world.onMeasure = ({ t, f }) => hist.meas.push({ t, f: Math.abs(f) });
world.onBreak = () => {
  hist.meas.push({ t: world.clock, brk: true });
  hist.th.push({ t: world.clock, brk: true });
  hist.breaks.push(world.clock);
};

const chartView = fluidCanvas(byId('chart'), {
  height: (w) => clamp(Math.round(w * 0.32), 190, 250),
  onResize: () => drawChart(),
});

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

function drawChart() {
  const { ctx, width: W, height: H } = chartView;
  if (!W) return;
  clear(ctx, W, H, COLORS.canvasBg);

  const padL = 44, padR = 12, padT = 30, padB = 26;
  const plotW = W - padL - padR;
  const top = padT, bottom = H - padB;
  const t1 = Math.max(world.clock, WINDOW);
  const t0 = t1 - WINDOW;
  const f0 = world.f0;

  // vertical range from the visible data
  let top_f = 1.5 * f0;
  for (const p of hist.meas) if (!p.brk && p.t >= t0 && Number.isFinite(p.f)) top_f = Math.max(top_f, p.f * 1.12);
  for (const p of hist.th) {
    if (p.brk || p.t < t0) continue;
    if (p.a !== null) top_f = Math.max(top_f, p.a * 1.12);
    if (p.b !== null) top_f = Math.max(top_f, p.b * 1.12);
  }
  top_f = Math.min(top_f, 8 * f0);
  const step = niceStep(top_f / 4);
  const fmax = Math.ceil(top_f / step - 1e-9) * step;

  const X = (t) => padL + ((t - t0) / WINDOW) * plotW;
  const Y = (f) => bottom - (f / fmax) * (bottom - top);

  // grid + axes
  const digits = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  for (let v = 0; v <= fmax + 1e-9; v += step) {
    const y = Y(v);
    line(ctx, padL, y, W - padR, y, v === 0 ? { color: COLORS.axis, width: 1 } : { color: COLORS.grid, width: 1 });
    text(ctx, v.toFixed(digits), padL - 6, y, { color: COLORS.text3, size: 10, family: 'mono', align: 'right' });
  }
  const tstep = niceStep(WINDOW / (W < 520 ? 4 : 8));
  for (let k = Math.ceil(t0 / tstep - 1e-9); k * tstep <= t1 + 1e-9; k++) {
    const x = X(k * tstep);
    line(ctx, x, top, x, bottom, { color: COLORS.grid, width: 1 });
    if (x < W - padR - 40) {
      text(ctx, String(k * tstep), x, bottom + 12, { color: COLORS.text3, size: 10, family: 'mono', align: 'center' });
    }
  }
  text(ctx, 't, վ', W - padR, bottom + 12, { color: COLORS.text3, size: 11, align: 'right' });
  text(ctx, 'f, Հց', padL - 6, top - 16, { color: COLORS.text3, size: 11, align: 'right' });
  line(ctx, padL, top, padL, bottom, { color: COLORS.axis, width: 1 });

  ctx.save();
  ctx.beginPath();
  ctx.rect(padL, top - 3, plotW + 1, bottom - top + 6);
  ctx.clip();

  // f0
  line(ctx, padL, Y(f0), W - padR, Y(f0), { color: COLORS.text3, width: 1.2, dash: [2, 4] });

  // interruptions of the series (restart, observer moved)
  for (const tb of hist.breaks) {
    if (tb > t0 + 0.05 && tb <= t1) line(ctx, X(tb), top, X(tb), bottom, { color: COLORS.axis, width: 1, dash: [1, 4] });
  }

  // formula
  ctx.lineWidth = 1.8;
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = COLORS.amber;
  for (const key of ['a', 'b']) {
    ctx.beginPath();
    let pen = false;
    for (const p of hist.th) {
      if (p.t < t0 - 0.5) continue;
      if (p.brk || p[key] === null) { pen = false; continue; }
      const x = X(p.t), y = Math.max(Y(p[key]), top - 4);
      if (pen) ctx.lineTo(x, y); else { ctx.moveTo(x, y); pen = true; }
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // measured
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = COLORS.teal;
  ctx.beginPath();
  let pen = false;
  for (const p of hist.meas) {
    if (p.t < t0 - 3) continue;
    if (p.brk || !Number.isFinite(p.f)) { pen = false; continue; }
    const x = X(p.t), y = Math.max(Y(p.f), top - 4);
    if (pen) ctx.lineTo(x, y); else { ctx.moveTo(x, y); pen = true; }
  }
  ctx.stroke();
  ctx.fillStyle = COLORS.teal;
  for (const p of hist.meas) {
    if (p.brk || p.t < t0 || !Number.isFinite(p.f)) continue;
    ctx.beginPath();
    ctx.arc(X(p.t), Math.max(Y(p.f), top - 4), 3, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  // legend
  let lx = padL;
  const items = [
    ['f չափված', COLORS.teal, null],
    ['f բանաձևով', COLORS.amber, [6, 4]],
    ['f₀', COLORS.text3, [2, 4]],
  ];
  for (const [label, color, dash] of items) {
    line(ctx, lx, 12, lx + 18, 12, { color, width: 2, dash });
    if (!dash) circle(ctx, lx + 9, 12, 3, { fill: color });
    text(ctx, label, lx + 24, 12, { color: COLORS.text2, size: 11 });
    ctx.font = font(11);
    lx += 24 + ctx.measureText(label).width + 16;
  }
}

function recordHistory() {
  if (world.clock - lastSample < 0.05) return;
  lastSample = world.clock;
  const live = world.live();
  hist.th.push({
    t: world.clock,
    a: live[0] ? Math.abs(live[0].ratio) * world.f0 : null,
    b: live[1] ? Math.abs(live[1].ratio) * world.f0 : null,
  });
  const cut = world.clock - WINDOW - 6;
  while (hist.th.length && hist.th[0].t < cut) hist.th.shift();
  while (hist.meas.length && hist.meas[0].t < cut) hist.meas.shift();
  while (hist.breaks.length && hist.breaks[0] < cut) hist.breaks.shift();
}

/* ---------- readouts ---------- */
const term = (u, plus) => {         // "340 + 85" / "340 − 85" for c ± u
  const v = plus ? u : -u;
  return `${C} ${v >= 0 ? '+' : '−'} ${Math.abs(Math.round(v))}`;
};

function update() {
  const vs = world.vs, vo = world.vo, f0 = world.f0;
  const M = vs / C;
  const live = world.live();
  const main = live[0];

  setText('stVs', `${Math.round(vs)} մ/վ (M = ${fmt(M, 2)})`);
  setText('stVo', `${signed(vo)} մ/վ (${signed(vo / C, 2)} c)`);
  setText('stF0', `${fmt(f0, 1)} Հց`);
  setText('stLam1', M < 1 - 1e-9 ? `${Math.round((C - vs) / f0)} մ` : M < 1 + 1e-9 ? '0 մ' : '—');
  setText('stLam2', `${Math.round((C + vs) / f0)} մ`);
  setText('stFth', main ? fmtF(f0 * main.ratio) : '—');
  setText('stFm', world.measured === null ? 'չափվում է…' : fmtF(world.measured));
  const ang = machAngleDeg(M);
  setText('stAngle', ang === null ? '—' : `${fmt(ang, 1)}°`);

  let note;
  if (main) {
    note = `u<sub>s</sub> = ${signed(main.us)} մ/վ, u<sub>o</sub> = ${signed(main.uo)} մ/վ՝ `
      + `f = ${fmt(f0, 1)}·(${term(main.uo, true)})/(${term(main.us, false)}) = ${fmt(f0 * main.ratio, 2)} Հց`;
    if (main.ratio < 0) note += `։ Բացասական նշանը նշանակում է, որ ճակատները հասնում են հակառակ հերթականությամբ. լսվող հաճախությունը |f| է։`;
    else if (live.length > 1) note += `։ Կոնի ներսում ձայնը դիտորդին հասնում է երկու շարքով (գրաֆիկի երկու կորերը)։`;
  } else {
    note = 'Ձայնը դիտորդին դեռ չի հասել. նա հարվածային ալիքից (կոնից) դուրս է։';
  }
  setHTML('calcLine', note);
}

/* ---------- controls ---------- */
const mach = bindRange('mach', {
  format: (v) => `${fmt(v, 2)} · ${Math.round(v * C)} մ/վ`,
  onInput: (v) => { world.vs = v * C; world.reset(); update(); },
});
const vo = bindRange('vo', {
  format: (v) => `${signed(v, 2)} c · ${signed(v * C)} մ/վ`,
  onInput: (v) => { world.vo = v * C; world.reset(); update(); },
});
bindRange('f0', {
  format: (v) => `${fmt(v, 1)} Հց`,
  onInput: (v) => { world.f0 = v; world.reset(); update(); },
});
$$('[data-mach]').forEach((b) => b.addEventListener('click', () => mach.set(parseFloat(b.dataset.mach))));

bindCheckbox('coneChk', { onChange: (v) => { state.cone = v; } });
bindCheckbox('lamChk', { onChange: (v) => { state.lambda = v; } });
const play = bindPlayPause('playBtn', { onChange: (p) => { state.paused = p; } });

function fullReset() {
  world.obsDy = 0;
  world.xoUser = 0.62 * WORLD_W;
  hist.meas.length = hist.th.length = hist.breaks.length = 0;
  world.reset();
  update();
}
onClick('resetBtn', fullReset);

/* sound */
const audioBtn = byId('audioBtn');
const audioLabel = byId('audioLabel');
function renderAudio() {
  audioLabel.textContent = audio.on ? '🔇 Անջատել ձայնը' : '🔊 Լսել';
  audioBtn.setAttribute('aria-pressed', String(audio.on));
}
if (!audio.supported) {
  audioBtn.disabled = true;
  setText('audioHint', 'Այս դիտարկիչը ձայնի վերարտադրությունը չի աջակցում։');
}
audioBtn.addEventListener('click', () => {
  if (audio.on) audio.stop(); else audio.start();
  renderAudio();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && audio.on) { audio.stop(); renderAudio(); }
});

/* ---------- main loop ---------- */
layout();
world.reset();
update();

let uiTimer = 0;
startLoop((dt) => {
  if (!state.paused) {
    world.step(dt);
    recordHistory();
  }
  uiTimer += dt;
  if (uiTimer > 0.1 || state.paused) { uiTimer = 0; update(); }
  drawScene();
  drawChart();
  if (audio.on) {
    const main = state.paused ? null : world.live()[0];
    audio.set(main ? clamp(BASE_PITCH * Math.abs(main.ratio), 60, 3000) : null);
  }
});
