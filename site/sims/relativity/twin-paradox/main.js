// Twin paradox — a round trip to a star at speed βc.
//
// The whole picture is an analytic function of (β, D, t), where t is Earth
// time (physics.js); here we only advance / scrub t and draw the scene, the
// Earth-frame spacetime diagram and the signal counters.
// Units: years and light-years (c = 1).

import { fluidCanvas } from '../../../assets/js/core/canvas.js';
import { startLoop } from '../../../assets/js/core/loop.js';
import {
  bindRange, bindCheckbox, bindSelect, bindSegmented, bindPlayPause, onClick,
} from '../../../assets/js/core/controls.js';
import { byId, setText, setHTML } from '../../../assets/js/core/dom.js';
import { clear, line, circle, text, roundRect } from '../../../assets/js/core/draw.js';
import { COLORS, themed, alpha, onThemeChange, fontsReady, font } from '../../../assets/js/core/theme.js';
import { clamp, lerp, TAU } from '../../../assets/js/core/math.js';
import { trip, rocketX, properTime, counts, earthSwitch, earthNowForTraveller } from './physics.js';

const P = themed((light) => ({
  A: COLORS.blue,                       // Earth twin, Earth's signals
  B: COLORS.coral,                      // traveller, rocket's signals
  simul: COLORS.purple,
  star: COLORS.amber,
  land: COLORS.green,
  hull: light ? '#e6eaf4' : '#cfd6ec',
  hullRim: light ? '#59638a' : '#8e97b6',
  card: light ? '#f2f4f9' : '#131828',
  cardRim: light ? 'rgba(30,42,90,0.14)' : 'rgba(120,140,200,0.18)',
  skin: '#f0c8a2',
  face: '#5b3a26',
}));

const DURATION = 14;      // seconds for the whole trip at ×1
const STAR_NAMES = { 4.37: 'Կենտավրոսի Ալֆա', 8.6: 'Սիրիուս', 25: 'Վեգա' };

// ---------- State ----------
let beta = 0.8;
let D = 4.37;
let starName = STAR_NAMES[4.37];
let startAge = 20;
let tr = trip(beta, D);
let t = 0;
let paused = true;
let speed = 1;
let showEarthSig = true;
let showRocketSig = true;
let showSimul = false;
let dirty = true;

const markDirty = () => { dirty = true; };

const view = fluidCanvas(byId('cv'), {
  height: (w) => clamp(Math.round(w * 0.34), 270, 330),
  onResize: markDirty,
});
const chart = fluidCanvas(byId('chart'), {
  height: (w) => clamp(Math.round(w * 0.95), 340, 500),
  onResize: markDirty,
});

// ---------- Formatting ----------
const yrs = (v, d = 2) => `${v.toFixed(d)} տարի`;
const ly = (v, d = 2) => `${v.toFixed(d)} լ.տ.`;
/** Trailing zeros trimmed: 4.370 → 4.37, 3.000 → 3. */
const trim = (v, d = 3) => String(parseFloat(v.toFixed(d)));

// ---------- Scene ----------
function mix(c1, c2, f) {
  const a = parseInt(c1.slice(1), 16);
  const b = parseInt(c2.slice(1), 16);
  const ch = (sh) => Math.round(lerp((a >> sh) & 255, (b >> sh) & 255, f));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/** A simple portrait whose hair greys and whose face wrinkles with age. */
function face(ctx, cx, cy, r, age, ring) {
  const grey = clamp((age - 30) / 40, 0, 1);
  const old = clamp((age - 40) / 35, 0, 1);
  const hair = mix('#4a2f1b', '#e6e6ea', grey);
  circle(ctx, cx, cy, r + 4, { fill: alpha(ring, 0.12), stroke: ring, width: 2 });
  circle(ctx, cx, cy + r * 0.06, r * 0.78, { fill: P.skin });
  // hair cap
  ctx.beginPath();
  ctx.arc(cx, cy + r * 0.06, r * 0.82, Math.PI * 1.04, Math.PI * 1.96);
  ctx.quadraticCurveTo(cx + r * 0.25, cy - r * 0.52, cx, cy - r * 0.34);
  ctx.quadraticCurveTo(cx - r * 0.4, cy - r * 0.2, cx - r * 0.8, cy - r * 0.02);
  ctx.closePath();
  ctx.fillStyle = hair;
  ctx.fill();
  // eyes and smile
  circle(ctx, cx - r * 0.28, cy + r * 0.1, r * 0.07, { fill: P.face });
  circle(ctx, cx + r * 0.28, cy + r * 0.1, r * 0.07, { fill: P.face });
  ctx.save();
  ctx.strokeStyle = P.face;
  ctx.lineCap = 'round';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(cx, cy + r * 0.3, r * 0.3, 0.2 * Math.PI, 0.8 * Math.PI);
  ctx.stroke();
  if (old > 0) {
    // wrinkles: crow's feet and cheek folds
    ctx.globalAlpha = old * 0.8;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const s of [-1, 1]) {
      ctx.moveTo(cx + s * r * 0.42, cy + r * 0.04); ctx.lineTo(cx + s * r * 0.58, cy - r * 0.02);
      ctx.moveTo(cx + s * r * 0.43, cy + r * 0.14); ctx.lineTo(cx + s * r * 0.6, cy + r * 0.16);
      ctx.moveTo(cx + s * r * 0.4, cy + r * 0.34); ctx.quadraticCurveTo(cx + s * r * 0.5, cy + r * 0.5, cx + s * r * 0.4, cy + r * 0.64);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function rocket(ctx, x, y, dir, moving) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  if (moving) {
    ctx.beginPath();
    ctx.moveTo(-13, -3.5); ctx.lineTo(-24, 0); ctx.lineTo(-13, 3.5);
    ctx.closePath();
    ctx.fillStyle = P.star;
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(15, 0);
  ctx.quadraticCurveTo(7, -7, -6, -6);
  ctx.lineTo(-13, -11); ctx.lineTo(-12, -5); ctx.lineTo(-12, 5); ctx.lineTo(-13, 11); ctx.lineTo(-6, 6);
  ctx.quadraticCurveTo(7, 7, 15, 0);
  ctx.closePath();
  ctx.fillStyle = P.hull;
  ctx.fill();
  ctx.strokeStyle = P.hullRim;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.stroke();
  circle(ctx, 3, 0, 2.6, { fill: P.B });
  ctx.restore();
}

function twinCard(ctx, x, y, w, h, col, title, age, clock) {
  roundRect(ctx, x, y, w, h, 10);
  ctx.fillStyle = P.card;
  ctx.fill();
  ctx.strokeStyle = P.cardRim;
  ctx.lineWidth = 1;
  ctx.stroke();
  const compact = w < 240;                     // phone width: smaller portrait and text
  const r = compact ? 14 : clamp(h * 0.3, 18, 26);
  const cx = x + (compact ? 8 : 12) + r + 4;
  face(ctx, cx, y + h / 2, r, age, col);
  const tx = cx + r + (compact ? 10 : 16);
  ctx.save();
  roundRect(ctx, x, y, w, h, 10);
  ctx.clip();
  const big = compact ? 16 : 18;
  const small = compact ? 10 : 11;
  text(ctx, title, tx, y + h / 2 - 24, { color: col, size: small, weight: 700 });
  const ageTxt = age.toFixed(1);
  ctx.font = font(big, { family: 'mono', weight: 700 });
  const aw = ctx.measureText(ageTxt).width;
  text(ctx, ageTxt, tx, y + h / 2, { color: COLORS.text, size: big, weight: 700, family: 'mono' });
  text(ctx, 'տարեկան', tx + aw + 5, y + h / 2 + 2, { color: COLORS.text2, size: small });
  text(ctx, clock, tx, y + h / 2 + 24, { color: COLORS.text2, size: small, family: 'mono' });
  ctx.restore();
}

function drawScene() {
  const { ctx, width: W, height: H } = view;
  clear(ctx, W, H, COLORS.canvasBg);

  const cardH = 84;
  const yCard = H - cardH - 12;
  const yL = Math.round((yCard - 24) * 0.5) + 14;      // the flight lane
  const xE = 36;
  const xS = W - 36;
  const x0 = xE + 22;                                  // x = 0 (Earth's surface)
  const x1 = xS - 20;                                  // x = D
  const px = (x) => x0 + (x / tr.D) * (x1 - x0);

  // background stars (fixed pseudo-random pattern)
  for (let i = 0; i < 46; i++) {
    const sx = ((i * 137.5) % 97) / 97 * W;
    const sy = ((i * 61.3) % 53) / 53 * (yCard - 10);
    circle(ctx, sx, sy, i % 5 === 0 ? 1.2 : 0.8, { fill: alpha(COLORS.text3, 0.45) });
  }

  // lane and distance
  line(ctx, x0, yL, x1, yL, { color: COLORS.axis, width: 1, dash: [3, 5] });
  text(ctx, `D = ${ly(tr.D)}`, (x0 + x1) / 2, yL + 34, { color: COLORS.text3, size: 11, family: 'mono', align: 'center' });

  // Earth
  circle(ctx, xE, yL, 16, { fill: alpha(P.A, 0.3), stroke: P.A, width: 1.8 });
  ctx.save();
  ctx.beginPath(); ctx.arc(xE, yL, 15, 0, TAU); ctx.clip();
  circle(ctx, xE - 6, yL - 5, 7, { fill: alpha(P.land, 0.75) });
  circle(ctx, xE + 8, yL + 7, 6, { fill: alpha(P.land, 0.75) });
  ctx.restore();
  text(ctx, 'Երկիր', xE - 18, yL + 34, { color: COLORS.text2, size: 11 });

  // destination star
  const g = ctx.createRadialGradient(xS, yL, 0, xS, yL, 26);
  g.addColorStop(0, alpha(P.star, 0.5));
  g.addColorStop(1, alpha(P.star, 0));
  ctx.fillStyle = g;
  ctx.fillRect(xS - 26, yL - 26, 52, 52);
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const rr = i % 2 ? 4.5 : 13;
    const a = (i * TAU) / 8 - Math.PI / 2;
    ctx.lineTo(xS + rr * Math.cos(a), yL + rr * Math.sin(a));
  }
  ctx.closePath();
  ctx.fillStyle = P.star;
  ctx.fill();
  text(ctx, starName, W - 10, yL + 34, { color: COLORS.text2, size: 11, align: 'right' });

  // light pulses in flight (Earth frame): Earth's above the lane, the rocket's below
  const pulse = (x, y, dir, col) => {
    ctx.beginPath();
    ctx.arc(x - dir * 6, y, 7, -0.9, 0.9);
    if (dir < 0) { ctx.beginPath(); ctx.arc(x + 6, y, 7, Math.PI - 0.9, Math.PI + 0.9); }
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();
  };
  if (showEarthSig) {
    for (const s of tr.fromEarth) {
      if (t >= s.te && t < s.tr) pulse(px(t - s.te), yL - 9, 1, P.A);
    }
  }
  if (showRocketSig) {
    for (const s of tr.fromRocket) {
      if (t >= s.te && t < s.tr) pulse(px(s.xe - (t - s.te)), yL + 9, -1, P.B);
    }
  }

  // rocket
  const xr = px(rocketX(tr, t));
  const outbound = t < tr.half;
  const moving = t > 0 && t < tr.T;
  rocket(ctx, xr, yL, outbound ? 1 : -1, moving);
  const lab = `v = ${beta.toFixed(2)}c`;
  text(ctx, moving ? (outbound ? `${lab} →` : `← ${lab}`) : lab, clamp(xr, 52, W - 52), yL - 30,
    { color: COLORS.text2, size: 11, family: 'mono', align: 'center' });

  // reception flashes
  const flash = 0.035 * tr.T;
  const ring = (x, col, k) => circle(ctx, x, yL, 14 + 16 * k, { stroke: alpha(col, 1 - k), width: 2.5 });
  if (showEarthSig) {
    for (const s of tr.fromEarth) {
      const k = (t - s.tr) / flash;
      if (k >= 0 && k < 1 && t < tr.T) ring(xr, P.A, k);
    }
  }
  if (showRocketSig) {
    for (const s of tr.fromRocket) {
      const k = (t - s.tr) / flash;
      if (k >= 0 && k < 1 && t < tr.T) ring(xE, P.B, k);
    }
  }

  text(ctx, 'Երկրի հաշվարկման համակարգ', 12, 16, { color: COLORS.text3, size: 11 });

  // the twins
  const gap = 10;
  const cw = (W - gap * 3) / 2;
  twinCard(ctx, gap, yCard, cw, cardH, P.A, 'A · Երկրում', startAge + t, `t = ${yrs(t)}`);
  twinCard(ctx, gap * 2 + cw, yCard, cw, cardH, P.B, 'B · հրթիռում', startAge + properTime(tr, t), `τ = ${yrs(properTime(tr, t))}`);
}

// ---------- Spacetime diagram ----------
function niceStep(span, n) {
  const raw = span / n;
  const p = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5, 10]) if (m * p >= raw) return m * p;
  return 10 * p;
}
const tickLabel = (v, step) => (step < 1 ? v.toFixed(1) : v.toFixed(0));

function drawChart() {
  const { ctx, width: W, height: H } = chart;
  clear(ctx, W, H, COLORS.canvasBg);
  const m = { l: 40, r: 14, t: 24, b: 36 };
  const pw = W - m.l - m.r;
  const ph = H - m.t - m.b;
  const xmin = -0.07 * tr.D;
  const xmax = 1.09 * tr.D;
  const tmax = tr.T * 1.03;
  const X = (x) => m.l + ((x - xmin) / (xmax - xmin)) * pw;
  const Y = (tt) => m.t + ph - (tt / tmax) * ph;

  // grid and ticks
  const xStep = niceStep(tr.D, Math.max(2, pw / 70));
  for (let x = 0; x <= tr.D + 1e-9; x += xStep) {
    line(ctx, X(x), m.t, X(x), m.t + ph, { color: COLORS.grid, width: 1 });
    text(ctx, tickLabel(x, xStep), X(x), m.t + ph + 11, { color: COLORS.text3, size: 10, family: 'mono', align: 'center' });
  }
  const tStep = niceStep(tr.T, Math.max(3, ph / 34));
  for (let tt = 0; tt <= tmax; tt += tStep) {
    line(ctx, m.l, Y(tt), m.l + pw, Y(tt), { color: COLORS.grid, width: 1 });
    text(ctx, tickLabel(tt, tStep), m.l - 6, Y(tt), { color: COLORS.text3, size: 10, family: 'mono', align: 'right' });
  }
  ctx.strokeStyle = COLORS.axis;
  ctx.lineWidth = 1;
  ctx.strokeRect(m.l + 0.5, m.t + 0.5, pw, ph);
  text(ctx, 't, տարի', 4, 11, { color: COLORS.text2, size: 11 });
  text(ctx, 'x, լ.տ.', m.l + pw, m.t + ph + 26, { color: COLORS.text2, size: 11, align: 'right' });
  text(ctx, 'A', X(0), 11, { color: P.A, size: 12, weight: 700, align: 'center' });
  text(ctx, 'աստղ', X(tr.D), 11, { color: COLORS.text3, size: 11, align: 'center' });

  ctx.save();
  ctx.beginPath();
  ctx.rect(m.l, m.t, pw, ph);
  ctx.clip();

  // world line of the star
  line(ctx, X(tr.D), Y(0), X(tr.D), Y(tmax), { color: COLORS.axis, width: 1, dash: [4, 4] });

  // light signals: the whole path faintly, the part travelled so far brightly
  const many = tr.fromEarth.length > 24;
  const signal = (s, col) => {
    line(ctx, X(s.xe), Y(s.te), X(s.xr), Y(s.tr), { color: alpha(col, 0.22), width: 1 });
    if (t <= s.te) return;
    const f = Math.min(1, (t - s.te) / (s.tr - s.te || 1));
    line(ctx, X(s.xe), Y(s.te), X(lerp(s.xe, s.xr, f)), Y(lerp(s.te, s.tr, f)), { color: alpha(col, 0.9), width: many ? 1 : 1.4 });
  };
  if (showEarthSig) tr.fromEarth.forEach((s) => signal(s, P.A));
  if (showRocketSig) tr.fromRocket.forEach((s) => signal(s, P.B));

  // world lines: whole trip faintly, the elapsed part solid
  const xr = rocketX(tr, t);
  line(ctx, X(0), Y(0), X(0), Y(tr.T), { color: alpha(P.A, 0.35), width: 2.4 });
  line(ctx, X(0), Y(0), X(0), Y(t), { color: P.A, width: 2.4 });
  ctx.lineWidth = 2.4;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = alpha(P.B, 0.35);
  ctx.beginPath();
  ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(tr.D), Y(tr.half)); ctx.lineTo(X(0), Y(tr.T));
  ctx.stroke();
  ctx.strokeStyle = P.B;
  ctx.beginPath();
  ctx.moveTo(X(0), Y(0));
  if (t > tr.half) ctx.lineTo(X(tr.D), Y(tr.half));
  ctx.lineTo(X(xr), Y(t));
  ctx.stroke();

  // traveller's lines of simultaneity
  if (showSimul) {
    const g2 = tr.gamma * tr.gamma;
    const tA = tr.half / g2;               // Earth time "now" just before turnaround
    const tB = tr.T - tA;                  // … and just after
    const xt = X(tr.D);
    const yt = Y(tr.half);
    ctx.beginPath();
    ctx.moveTo(X(0), Y(tA)); ctx.lineTo(xt, yt); ctx.lineTo(X(0), Y(tB));
    ctx.closePath();
    ctx.fillStyle = alpha(P.simul, 0.07);
    ctx.fill();
    line(ctx, X(0), Y(tA), xt, yt, { color: P.simul, width: 1.3, dash: [6, 4] });
    line(ctx, X(0), Y(tB), xt, yt, { color: P.simul, width: 1.3, dash: [6, 4] });
    line(ctx, X(0) - 4, Y(tA), X(0) - 4, Y(tB), { color: P.simul, width: 3 });
    // the traveller's current "now"
    if (t > 0 && t < tr.T) {
      const tn = earthNowForTraveller(tr, t);
      line(ctx, X(0), Y(tn), X(xr), Y(t), { color: P.simul, width: 1.6 });
      circle(ctx, X(0), Y(tn), 3.5, { fill: P.simul, stroke: COLORS.canvasBg, width: 1 });
    }
    // label of the jump
    const label = `թռիչք՝ ${trim(tr.jump, 2)} տարի`;
    ctx.font = font(11, { weight: 600 });
    const lw = ctx.measureText(label).width + 12;
    const lx = X(0) + 8;
    const lyy = Y(tr.half);
    roundRect(ctx, lx, lyy - 10, lw, 20, 6);
    ctx.fillStyle = alpha(COLORS.canvasBg, 0.88);
    ctx.fill();
    ctx.strokeStyle = alpha(P.simul, 0.6);
    ctx.lineWidth = 1;
    ctx.stroke();
    text(ctx, label, lx + 6, lyy + 0.5, { color: P.simul, size: 11, weight: 600 });
  }

  // emission and reception marks
  const dotR = many ? 2 : 3;
  if (showEarthSig) {
    for (const s of tr.fromEarth) {
      if (t + 1e-9 >= s.te) circle(ctx, X(0), Y(s.te), dotR, { fill: P.A, stroke: COLORS.canvasBg, width: 1 });
      if (t + 1e-9 >= s.tr) circle(ctx, X(s.xr), Y(s.tr), dotR + 0.5, { fill: COLORS.canvasBg, stroke: P.A, width: 1.5 });
    }
  }
  if (showRocketSig) {
    for (const s of tr.fromRocket) {
      if (t + 1e-9 >= s.te) circle(ctx, X(s.xe), Y(s.te), dotR, { fill: P.B, stroke: COLORS.canvasBg, width: 1 });
      if (t + 1e-9 >= s.tr) circle(ctx, X(0), Y(s.tr), dotR + 0.5, { fill: COLORS.canvasBg, stroke: P.B, width: 1.5 });
    }
  }

  // the present moment (Earth frame)
  line(ctx, m.l, Y(t), m.l + pw, Y(t), { color: COLORS.text3, width: 1, dash: [5, 4] });
  circle(ctx, X(0), Y(t), 4.5, { fill: P.A, stroke: COLORS.canvasBg, width: 1.5 });
  circle(ctx, X(xr), Y(t), 4.5, { fill: P.B, stroke: COLORS.canvasBg, width: 1.5 });
  if (t > 0 && t < tr.T) {
    const side = X(xr) > m.l + pw - 24 ? -1 : 1;
    text(ctx, 'B', X(xr) + side * 12, Y(t) - 10, { color: P.B, size: 12, weight: 700, align: 'center' });
  }
  ctx.restore();
}

// ---------- DOM: counters, stats, phase ----------
const cache = {};
function put(id, html) {
  if (cache[id] === html) return;
  cache[id] = html;
  setHTML(id, html);
}
const row = (label, value, sub = false) =>
  `<div class="counter${sub ? ' counter--sub' : ''}"><span>${label}</span><b>${value}</b></div>`;
const every = (period) => `${trim(period, 2)} տարին մեկ`;

function updateDom() {
  const c = counts(tr, t);
  const done = t >= tr.T;
  const started = t > 0;
  const pOut = tr.kOut * tr.step;
  const pIn = tr.kIn * tr.step;
  const aFast = t >= earthSwitch(tr);
  const bFast = t >= tr.half;

  put('cardA',
    row('Ուղարկել է ազդանշան', c.aSent) +
    row('Ստացել է B-ից', c.aRecv) +
    row('դրանցից՝ հեռանալիս / մոտենալիս ուղարկված', `${c.aRecvOut} + ${c.aRecvIn}`, true) +
    row('Այժմ ստանում է (իր ժամացույցով)', done || !started ? '—' : every(aFast ? pIn : pOut), true));
  put('cardB',
    row('Ուղարկել է ազդանշան', c.bSent) +
    row('Ստացել է A-ից', c.bRecv) +
    row('դրանցից՝ հեռանալիս / մոտենալիս ստացված', `${c.bRecvOut} + ${c.bRecvIn}`, true) +
    row('Այժմ ստանում է (իր ժամացույցով)', done || !started ? '—' : every(bFast ? pIn : pOut), true) +
    (showSimul ? row('B-ի «հիմա»-ն Երկրում', `t = ${yrs(done ? tr.T : earthNowForTraveller(tr, t))}`, true) : ''));

  setText('sAB', `${c.aSent} / ${c.bRecv}`);
  setText('sBA', `${c.bSent} / ${c.aRecv}`);

  const phase = byId('phase');
  let msg;
  if (!started) {
    msg = 'Սեղմեք «Մեկնարկ» կամ շարժեք ժամանակի սահիկը։';
  } else if (done) {
    msg = `<b>Հանդիպում։</b> A-ն ուղարկել է ${c.aSent} ազդանշան, և B-ն ստացել է բոլոր ${c.bRecv}-ը. B-ն ուղարկել է ${c.bSent}, և A-ն ստացել է բոլոր ${c.aRecv}-ը։ ` +
      `Երկուսն էլ համաձայն են. Երկրում անցել է ${yrs(tr.T, 3)}, հրթիռում՝ ${yrs(tr.tau, 3)}։`;
  } else if (!bFast) {
    msg = `<b>Հրթիռը հեռանում է Երկրից։</b> Երկու երկվորյակն էլ մյուսի ազդանշանները ստանում են հազվադեպ՝ ${every(pOut)}։`;
  } else if (!aFast) {
    msg = `<b>Հրթիռը շրջվել է և վերադառնում է։</b> B-ն արդեն հաճախ է ստանում ազդանշանները՝ ${every(pIn)}, իսկ A-ին դեռ հասնում են հեռացող հրթիռից ուղարկվածները։`;
  } else {
    msg = `<b>Հրթիռը մոտենում է Երկրին։</b> Շրջադարձի պահին ուղարկված լույսը հասել է Երկիր, և այժմ A-ն էլ է հաճախ ստանում ազդանշանները՝ ${every(pIn)}։`;
  }
  put('phase', msg);
  phase.classList.toggle('hint--ok', done);
}

function updateStats() {
  setText('sGamma', tr.gamma.toFixed(3));
  setText('sT', yrs(tr.T, 3));
  setText('sTau', yrs(tr.tau, 3));
  setText('sDiff', yrs(tr.T - tr.tau, 3));
  setText('sAges', `${(startAge + tr.T).toFixed(1)} / ${(startAge + tr.tau).toFixed(1)}`);
  setText('sDc', ly(tr.Dc, 3));
  setText('sKout', yrs(tr.kOut * tr.step, 3));
  setText('sKin', yrs(tr.kIn * tr.step, 3));
  setText('stepTxt', tr.step === 1 ? 'տարին մեկ անգամ' : `${tr.step} տարին մեկ անգամ`);
}

// ---------- Controls ----------
const play = bindPlayPause('playBtn', {
  paused: true,
  label: (p) => (!p ? '⏸ Դադար' : t >= tr.T ? '↺ Նորից' : t > 0 ? '▶ Շարունակել' : '▶ Մեկնարկ'),
  onChange: (p) => {
    if (!p && t >= tr.T) t = 0;
    paused = p;
    play.render();
    markDirty();
  },
});

function pause() {
  paused = true;
  play.set(true);
}

const time = bindRange('time', {
  format: (v) => yrs((v / 1000) * tr.T),
  onInput: (v) => {
    t = (v / 1000) * tr.T;
    pause();
    markDirty();
  },
});

/** New trip parameters: keep the same fraction of the journey. */
function rebuild() {
  const f = tr.T > 0 ? t / tr.T : 0;
  tr = trip(beta, D);
  t = f >= 1 ? tr.T : f * tr.T;
  updateStats();
  markDirty();
}

bindRange('beta', {
  format: (v) => `${v.toFixed(2)}c`,
  onInput: (v) => { beta = v; rebuild(); },
});
const dist = bindRange('dist', {
  format: (v) => `${v.toFixed(1)} լ.տ.`,
  onInput: (v) => { D = v; rebuild(); },
});
bindSelect('dest', {
  onChange: (v) => {
    const custom = v === 'custom';
    byId('distField').hidden = !custom;
    D = custom ? dist.value : parseFloat(v);
    starName = custom ? 'աստղ' : STAR_NAMES[v];
    rebuild();
  },
});
bindRange('age', {
  format: (v) => `${v.toFixed(0)} տարեկան`,
  onInput: (v) => { startAge = v; updateStats(); markDirty(); },
});
bindSegmented('speed', { onChange: (v) => { speed = parseFloat(v); } });
bindCheckbox('sigEarth', { onChange: (v) => { showEarthSig = v; markDirty(); } });
bindCheckbox('sigRocket', { onChange: (v) => { showRocketSig = v; markDirty(); } });
bindCheckbox('simul', { onChange: (v) => { showSimul = v; markDirty(); } });
onClick('resetBtn', () => {
  t = 0;
  pause();
  markDirty();
});

// ---------- Loop ----------
function render() {
  drawScene();
  drawChart();
  updateDom();
  time.set(Math.round((t / tr.T) * 1000), { silent: true });
  time.show(yrs(t));
  play.render();
}

updateStats();
onThemeChange(markDirty);
fontsReady().then(markDirty);

startLoop((dt) => {
  if (!paused) {
    t += (dt * speed * tr.T) / DURATION;
    if (t >= tr.T) {
      t = tr.T;
      pause();
    }
    dirty = true;
  }
  if (dirty) {
    dirty = false;
    render();
  }
});
