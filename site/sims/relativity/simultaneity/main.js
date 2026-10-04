// Relativity of simultaneity — Einstein's train and two lightning bolts.
//
// The scene is a function of (β, frame, t) only: physics.js builds the event
// table in the platform frame and Lorentz-transforms it for the train frame;
// here we just advance / scrub the time coordinate of the displayed frame and
// draw. Lengths are metres, times microseconds (c = 300 m/µs).

import { fluidCanvas } from '../../../assets/js/core/canvas.js';
import { startLoop } from '../../../assets/js/core/loop.js';
import {
  bindRange, bindCheckbox, bindSegmented, bindPlayPause, onClick,
} from '../../../assets/js/core/controls.js';
import { byId, setText, setHTML } from '../../../assets/js/core/dom.js';
import { clear, line, arrow, circle, text, roundRect } from '../../../assets/js/core/draw.js';
import { COLORS, themed, alpha, onThemeChange, fontsReady } from '../../../assets/js/core/theme.js';
import { clamp, TAU } from '../../../assets/js/core/math.js';
import { C as LIGHT, scenario, fronts } from './physics.js';

const P = themed((light) => ({
  A: COLORS.coral,                       // rear strike and its light
  B: COLORS.blue,                        // front strike and its light
  train: COLORS.teal,                    // observer in the train
  plat: COLORS.purple,                   // observer on the platform
  bolt: light ? '#d99a00' : '#ffd866',
  body: light ? '#e6eaf4' : '#1b2236',
  bodyRim: light ? '#7c86a8' : '#7f8ab0',
  window: light ? '#fcfdff' : '#0b0e17',
  slab: light ? '#dfe3ee' : '#1a2032',
  slabRim: light ? '#8e97b6' : '#59638a',
  rail: light ? '#8e97b6' : '#59638a',
}));

const RATE = 0.5;        // µs of frame time per second of animation at ×1
const FLASH = 0.3;       // µs a bolt / reception flash stays visible

const EVENTS = {
  strikeA: { label: 'Կայծակ A (հետևում)', color: 'A' },
  strikeB: { label: 'Կայծակ B (առջևում)', color: 'B' },
  trainB: { label: 'B-ի լույսը հասավ գնացքի դիտորդին', color: 'B', who: 'train' },
  trainA: { label: 'A-ի լույսը հասավ գնացքի դիտորդին', color: 'A', who: 'train' },
  platA: { label: 'A-ի լույսը հասավ կառամատույցի դիտորդին', color: 'A', who: 'plat' },
  platB: { label: 'B-ի լույսը հասավ կառամատույցի դիտորդին', color: 'B', who: 'plat' },
};

// ---------- State ----------
let beta = 0.6;
let frame = 'platform';
let sc = scenario(beta, frame);
let t = sc.t0;
let paused = true;
let speed = 1;
let showCircles = true;
let dirty = true;

const markDirty = () => { dirty = true; };

const view = fluidCanvas(byId('cv'), {
  height: (w) => clamp(Math.round(w * 0.42), 290, 390),
  onResize: markDirty,
});
const chart = fluidCanvas(byId('chart'), {
  height: (w) => clamp(Math.round(w * 0.74), 240, 330),
  onResize: markDirty,
});

// ---------- Formatting ----------
const num = (v, d = 2) => {
  const s = (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d);
  return s.replace('-', '−');
};
const tSym = () => (frame === 'train' ? 't′' : 't');
const xSym = () => (frame === 'train' ? 'x′' : 'x');
const fmtT = (v) => `${num(v)} մկվ`;

// ---------- Scene ----------
function person(ctx, x, yFeet, h, color) {
  const r = h * 0.19;
  const yHead = yFeet - h + r;
  const yHip = yFeet - h * 0.36;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, yHead + r); ctx.lineTo(x, yHip);
  ctx.moveTo(x - h * 0.15, yFeet); ctx.lineTo(x, yHip); ctx.lineTo(x + h * 0.15, yFeet);
  ctx.moveTo(x - h * 0.17, yHead + r + h * 0.16); ctx.lineTo(x + h * 0.17, yHead + r + h * 0.16);
  ctx.stroke();
  ctx.restore();
  circle(ctx, x, yHead, r, { fill: color });
  return { x, y: yHead, r };
}

function burst(ctx, x, y, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * TAU) / 8 + 0.4;
    ctx.moveTo(x + 4.5 * Math.cos(a), y + 4.5 * Math.sin(a));
    ctx.lineTo(x + 7.5 * Math.cos(a), y + 7.5 * Math.sin(a));
  }
  ctx.stroke();
  ctx.restore();
  circle(ctx, x, y, 3.2, { fill: color });
}

function bolt(ctx, x, yRoof, yPlat, a) {
  const pts = [[x + 16, 0], [x + 4, yRoof * 0.3], [x + 13, yRoof * 0.42], [x - 3, yRoof * 0.72], [x + 6, yRoof * 0.8],
    [x, yRoof], [x - 5, yRoof + (yPlat - yRoof) * 0.45], [x + 4, yRoof + (yPlat - yRoof) * 0.55], [x, yPlat]];
  ctx.save();
  const g = ctx.createRadialGradient(x, yRoof, 0, x, yRoof, 46);
  g.addColorStop(0, alpha(P.bolt, 0.55 * a));
  g.addColorStop(1, alpha(P.bolt, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - 46, yRoof - 46, 92, 92);
  ctx.strokeStyle = alpha(P.bolt, a);
  ctx.lineWidth = 2.6;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.stroke();
  ctx.restore();
}

function drawScene() {
  const { ctx, width: W, height: H } = view;
  const s = W / (sc.xmax - sc.xmin);
  const px = (x) => (x - sc.xmin) * s;

  const yP = H - 72;                         // platform surface
  const yRail = yP - 46;
  const hT = clamp(H * 0.15, 42, 54);        // train body height
  const yBot = yRail - 5;
  const yTop = yBot - hT;
  const yF0 = yTop - 8;                      // light-front bars span the train and the gap
  const yC = (yF0 + yP) / 2;

  const xT = sc.vTrain * t;                  // train observer
  const xPl = sc.vPlat * t;                  // platform observer
  const ev = sc.ev;

  clear(ctx, W, H, COLORS.canvasBg);

  // --- platform: slab with joints every 100 m of its own length
  ctx.fillStyle = P.slab;
  ctx.fillRect(0, yP, W, 18);
  line(ctx, 0, yP, W, yP, { color: P.slabRim, width: 1.5 });
  {
    const k0 = Math.ceil((sc.xmin - xPl) / sc.slabLen - 0.5);
    for (let k = k0; ; k++) {
      const x = px(xPl + (k + 0.5) * sc.slabLen);
      if (x > W) break;
      line(ctx, x, yP, x, yP + 18, { color: alpha(P.slabRim, 0.7), width: 1 });
    }
  }
  line(ctx, 0, yRail, W, yRail, { color: P.rail, width: 1.5 });

  // --- train: six carriages of 100 m proper length each
  const xl = px(xT - sc.trainHalf);
  const wT = sc.trainLen * s;
  const cw = sc.carLen * s;
  roundRect(ctx, xl, yTop, wT, hT, Math.min(6, wT / 8));
  ctx.fillStyle = P.body;
  ctx.fill();
  ctx.strokeStyle = P.bodyRim;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  const nCars = Math.round(sc.trainLen / sc.carLen);
  for (let k = 0; k < nCars; k++) {
    const x = xl + k * cw;
    if (k) line(ctx, x, yTop, x, yBot, { color: P.bodyRim, width: 1 });
    if (cw > 12) {
      roundRect(ctx, x + cw * 0.16, yTop + 8, cw * 0.68, hT * 0.4, 2);
      ctx.fillStyle = P.window;
      ctx.fill();
    }
    if (cw > 16) {
      circle(ctx, x + cw * 0.24, yBot + 1.5, 3.5, { fill: P.bodyRim });
      circle(ctx, x + cw * 0.76, yBot + 1.5, 3.5, { fill: P.bodyRim });
    }
  }

  // --- light fronts
  for (const [id, col] of [['strikeA', P.A], ['strikeB', P.B]]) {
    const f = fronts(ev[id], t);
    if (!f) continue;
    if (showCircles && f.r > 0) {
      ctx.beginPath();
      ctx.arc(px(ev[id].x), yC, f.r * s, 0, TAU);
      ctx.fillStyle = alpha(col, 0.05);
      ctx.fill();
      ctx.strokeStyle = alpha(col, 0.6);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    for (const [x, dir] of [[f.left, -1], [f.right, 1]]) {
      const X = px(x);
      if (X < -10 || X > W + 10) continue;
      line(ctx, X, yF0, X, yP, { color: alpha(col, 0.22), width: 8, cap: 'round' });
      line(ctx, X, yF0, X, yP, { color: col, width: 2.5, cap: 'round' });
      ctx.beginPath();
      ctx.moveTo(X + dir * 8, yRail + 14);
      ctx.lineTo(X + dir * 1, yRail + 9);
      ctx.lineTo(X + dir * 1, yRail + 19);
      ctx.closePath();
      ctx.fillStyle = col;
      ctx.fill();
    }
  }

  // --- scorch marks left by the strikes (on the train and on the platform)
  for (const [id, sign, col, name] of [['strikeA', -1, P.A, 'A'], ['strikeB', 1, P.B, 'B']]) {
    if (t < ev[id].t) continue;
    burst(ctx, px(xT + sign * sc.trainHalf), yTop, col);
    const xm = px(xPl + sign * sc.platHalf);
    burst(ctx, xm, yP, col);
    text(ctx, name, xm, yP + 31, { color: col, size: 13, weight: 700, align: 'center' });
  }

  // --- observers
  const heads = {
    train: person(ctx, px(xT), yBot - 3, hT - 9, P.train),
    plat: person(ctx, px(xPl), yP, 36, P.plat),
  };
  for (const id of ['trainA', 'trainB', 'platA', 'platB']) {
    const e = ev[id];
    if (t < e.t) continue;
    const meta = EVENTS[id];
    const h = heads[meta.who];
    const col = P[meta.color];
    const side = meta.color === 'A' ? -1 : 1;      // the side the light came from
    circle(ctx, h.x + side * (h.r + 7), h.y, 3.2, { fill: col, stroke: COLORS.canvasBg, width: 1 });
    const k = (t - e.t) / FLASH;
    if (k < 1) circle(ctx, h.x, h.y, h.r + 3 + 20 * k, { stroke: alpha(col, 1 - k), width: 2.5 });
  }

  // --- lightning
  for (const id of ['strikeA', 'strikeB']) {
    const k = (t - ev[id].t) / FLASH;
    if (k >= 0 && k < 1) bolt(ctx, px(ev[id].x), yTop, yP, 1 - k);
  }

  // --- velocity of the moving body
  if (beta > 0) {
    const label = `v = ${beta.toFixed(2)}c`;
    if (frame === 'platform') {
      const cx = clamp(px(xT), 44, W - 44);
      arrow(ctx, cx - 24, yTop - 13, cx + 24, yTop - 13, { color: COLORS.text2, width: 2 });
      text(ctx, label, cx, yTop - 27, { color: COLORS.text2, size: 11, family: 'mono', align: 'center' });
    } else {
      const cx = clamp(px(xPl), 44, W - 44);
      arrow(ctx, cx + 24, yP + 46, cx - 24, yP + 46, { color: COLORS.text2, width: 2 });
      text(ctx, label, cx, yP + 60, { color: COLORS.text2, size: 11, family: 'mono', align: 'center' });
    }
  }

  // --- frame name, clock and scale bar
  text(ctx, frame === 'train' ? 'Գնացքի համակարգ' : 'Կառամատույցի համակարգ', W - 12, 16,
    { color: COLORS.text3, size: 11, align: 'right' });
  text(ctx, `${tSym()} = ${fmtT(t)}`, W - 12, 34, { color: COLORS.text, size: 13, family: 'mono', align: 'right' });
  const bar = 100 * s;
  line(ctx, W - 12 - bar, 54, W - 12, 54, { color: COLORS.text3, width: 1.5 });
  line(ctx, W - 12 - bar, 50, W - 12 - bar, 58, { color: COLORS.text3, width: 1.5 });
  line(ctx, W - 12, 50, W - 12, 58, { color: COLORS.text3, width: 1.5 });
  text(ctx, '100 մ', W - 20 - bar, 54, { color: COLORS.text3, size: 10, family: 'mono', align: 'right' });
}

// ---------- Spacetime diagram ----------
function niceStep(span, target) {
  for (const st of [50, 100, 200, 500, 1000]) if (span / st <= target) return st;
  return 2000;
}

function drawChart() {
  const { ctx, width: W, height: H } = chart;
  clear(ctx, W, H, COLORS.canvasBg);
  const m = { l: 40, r: 12, t: 24, b: 36 };
  const xs = sc.xmax - sc.xmin;
  const cts = (sc.t1 - sc.t0) * LIGHT;
  const k = Math.min((W - m.l - m.r) / xs, (H - m.t - m.b) / cts);   // same scale for x and ct
  const pw = xs * k, ph = cts * k;
  const ox = m.l + (W - m.l - m.r - pw) / 2;
  const oy = m.t + (H - m.t - m.b - ph) / 2;
  const X = (x) => ox + (x - sc.xmin) * k;
  const Y = (tt) => oy + ph - (tt - sc.t0) * LIGHT * k;

  // grid and ticks
  const xStep = niceStep(xs, pw / 48);
  for (let x = Math.ceil(sc.xmin / xStep) * xStep; x <= sc.xmax; x += xStep) {
    line(ctx, X(x), oy, X(x), oy + ph, { color: x === 0 ? COLORS.axis : COLORS.grid, width: 1 });
    text(ctx, num(x, 0), X(x), oy + ph + 11, { color: COLORS.text3, size: 10, family: 'mono', align: 'center' });
  }
  const tStep = ph / (sc.t1 - sc.t0) * 0.5 >= 22 ? 0.5 : 1;
  for (let tt = Math.ceil(sc.t0 / tStep) * tStep; tt <= sc.t1 + 1e-9; tt += tStep) {
    line(ctx, ox, Y(tt), ox + pw, Y(tt), { color: Math.abs(tt) < 1e-9 ? COLORS.axis : COLORS.grid, width: 1 });
    text(ctx, num(tt, 1), ox - 6, Y(tt), { color: COLORS.text3, size: 10, family: 'mono', align: 'right' });
  }
  ctx.strokeStyle = COLORS.axis;
  ctx.lineWidth = 1;
  ctx.strokeRect(ox + 0.5, oy + 0.5, pw, ph);
  text(ctx, `${tSym()}, մկվ`, ox - 30, 11, { color: COLORS.text2, size: 11 });
  text(ctx, `${xSym()}, մ`, ox + pw, oy + ph + 26, { color: COLORS.text2, size: 11, align: 'right' });

  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, oy, pw, ph);
  ctx.clip();

  const world = (v, off, opts) =>
    line(ctx, X(v * sc.t0 + off), Y(sc.t0), X(v * sc.t1 + off), Y(sc.t1), opts);

  // the train: a band between the world lines of its two ends
  ctx.beginPath();
  ctx.moveTo(X(sc.vTrain * sc.t0 - sc.trainHalf), Y(sc.t0));
  ctx.lineTo(X(sc.vTrain * sc.t0 + sc.trainHalf), Y(sc.t0));
  ctx.lineTo(X(sc.vTrain * sc.t1 + sc.trainHalf), Y(sc.t1));
  ctx.lineTo(X(sc.vTrain * sc.t1 - sc.trainHalf), Y(sc.t1));
  ctx.closePath();
  ctx.fillStyle = alpha(P.train, 0.1);
  ctx.fill();
  world(sc.vTrain, -sc.trainHalf, { color: alpha(P.train, 0.55), width: 1 });
  world(sc.vTrain, sc.trainHalf, { color: alpha(P.train, 0.55), width: 1 });
  // the platform marks A and B
  world(sc.vPlat, -sc.platHalf, { color: alpha(P.plat, 0.6), width: 1, dash: [4, 4] });
  world(sc.vPlat, sc.platHalf, { color: alpha(P.plat, 0.6), width: 1, dash: [4, 4] });

  // light rays
  for (const [id, col] of [['strikeA', P.A], ['strikeB', P.B]]) {
    const e = sc.ev[id];
    const d = LIGHT * (sc.t1 - e.t);
    line(ctx, X(e.x), Y(e.t), X(e.x - d), Y(sc.t1), { color: col, width: 1.5 });
    line(ctx, X(e.x), Y(e.t), X(e.x + d), Y(sc.t1), { color: col, width: 1.5 });
  }

  // observers
  world(sc.vTrain, 0, { color: P.train, width: 2.2 });
  world(sc.vPlat, 0, { color: P.plat, width: 2.2 });

  // the present moment
  line(ctx, ox, Y(t), ox + pw, Y(t), { color: COLORS.text2, width: 1, dash: [5, 4] });

  // events
  for (const id of ['trainA', 'trainB', 'platA']) {
    const e = sc.ev[id];
    circle(ctx, X(e.x), Y(e.t), 4, { fill: COLORS.canvasBg, stroke: COLORS.text, width: 1.6 });
  }
  for (const [id, col, name] of [['strikeA', P.A, 'A'], ['strikeB', P.B, 'B']]) {
    const e = sc.ev[id];
    circle(ctx, X(e.x), Y(e.t), 4.5, { fill: col, stroke: COLORS.canvasBg, width: 1 });
    text(ctx, name, X(e.x) + (name === 'A' ? -11 : 11), Y(e.t) + 11, { color: col, size: 12, weight: 700, align: 'center' });
  }
  ctx.restore();
}

// ---------- Panel: event log, stats, note ----------
const cache = {};
function put(id, html) {
  if (cache[id] === html) return;
  cache[id] = html;
  setHTML(id, html);
}

function updateLog() {
  const done = sc.events.filter((e) => t >= e.t - 1e-9);
  const html = done.length
    ? done.map((e) => {
      const meta = EVENTS[e.id];
      return `<li><i class="swatch" style="--c: var(--${meta.color === 'A' ? 'coral' : 'blue'})"></i>` +
        `<span>${meta.label}</span><b>${tSym()} = ${fmtT(e.t)}</b></li>`;
    }).join('')
    : '<li class="evlog__empty">Դեռ ոչինչ տեղի չի ունեցել։ Սեղմեք «Գործարկել» կամ շարժեք ժամանակի սահիկը։</li>';
  put('log', html);
}

function updateStats() {
  const ev = sc.ev;
  const inTrain = frame === 'train';
  const T = (e) => `${tSym()} = ${fmtT(e.t)}`;
  setText('statTitle', inTrain ? 'Չափումներ՝ գնացքի համակարգում' : 'Չափումներ՝ կառամատույցի համակարգում');
  setText('frameName', inTrain ? '(գնացքի համակարգ)' : '(կառամատույցի համակարգ)');
  setText('sBeta', beta.toFixed(2));
  setText('sGamma', sc.gamma.toFixed(3));
  setText('sLen', `${num(sc.trainLen, 0)} մ`);
  setText('sSep', `${num(sc.markSep, 0)} մ`);
  setText('sGap', fmtT(sc.strikeGap));
  setText('sTB', T(ev.trainB));
  setText('sTA', T(ev.trainA));
  setText('sPA', T(ev.platA));
  setText('sPB', T(ev.platB));

  const lag = fmtT(ev.trainA.t - ev.trainB.t);
  let note;
  if (beta === 0) {
    note = 'Գնացքն անշարժ է. երկու հաշվարկման համակարգերը համընկնում են, և կայծակները <b>միաժամանակ</b> են երկու դիտորդների համար էլ։';
  } else if (inTrain) {
    note = `Գնացքի համակարգում B կայծակը հարվածում է A-ից <b>${fmtT(sc.strikeGap)} շուտ</b> (Δt′ = v·L₀/c²)։ ` +
      `Գնացքի դիտորդը B-ի լույսը տեսնում է A-ի լույսից ${lag} շուտ, իսկ կառամատույցի դիտորդը երկու լույսն էլ, ինչպես և նախկինում, տեսնում է նույն պահին։`;
  } else {
    note = 'Կառամատույցի համակարգում կայծակները հարվածում են <b>միաժամանակ</b> (t = 0), և նրանց լույսը կառամատույցի դիտորդին է հասնում նույն պահին։ ' +
      `Գնացքի դիտորդը շարժվում է B-ի լույսին ընդառաջ և այն տեսնում է A-ի լույսից ${lag} շուտ։`;
  }
  put('note', note);
}

// ---------- Controls ----------
const SLIDER_MAX = 1000;
const sliderOf = (tt) => Math.round(((tt - sc.t0) / (sc.t1 - sc.t0)) * SLIDER_MAX);
const timeOf = (v) => sc.t0 + (v / SLIDER_MAX) * (sc.t1 - sc.t0);

const timeCtl = bindRange('time', {
  format: () => `${tSym()} = ${fmtT(t)}`,
  onInput: (v) => {
    t = timeOf(v);
    setPaused(true);
    timeCtl.render();
    markDirty();
  },
});

const playCtl = bindPlayPause('playBtn', {
  paused: true,
  label: (p) => (p ? '▶ Գործարկել' : '⏸ Դադար'),
  onChange: (p) => {
    paused = p;
    if (!p && t >= sc.t1 - 1e-9) setTime(sc.t0);
  },
});

function setPaused(p) {
  paused = p;
  playCtl.set(p);
}

function setTime(tt) {
  t = clamp(tt, sc.t0, sc.t1);
  timeCtl.set(sliderOf(t), { silent: true });
  markDirty();
}

function rebuild() {
  sc = scenario(beta, frame);
  updateStats();
  setTime(sc.t0);
}

bindRange('beta', {
  format: (v) => `${v.toFixed(2)}c`,
  onInput: (v) => { beta = v; rebuild(); },
});
bindSegmented('frame', { onChange: (v) => { frame = v; rebuild(); } });
bindSegmented('speed', { onChange: (v) => { speed = parseFloat(v); } });
bindCheckbox('circles', { onChange: (on) => { showCircles = on; markDirty(); } });
onClick('resetBtn', () => { setPaused(true); setTime(sc.t0); });

// ---------- Start ----------
onThemeChange(markDirty);
fontsReady().then(markDirty);
rebuild();

startLoop((dt) => {
  if (!paused) {
    setTime(t + dt * RATE * speed);
    if (t >= sc.t1) setPaused(true);
  }
  if (!dirty) return;
  dirty = false;
  drawScene();
  drawChart();
  updateLog();
});
