// Relativistic velocity addition: a mother ship moving at v relative to a
// station launches a probe at u′ relative to itself. Everything is shown in
// the station frame; lengths are in light-seconds, time in seconds, speeds in c.

import { fluidCanvas } from '../../../assets/js/core/canvas.js';
import { startLoop } from '../../../assets/js/core/loop.js';
import { bindRange, bindCheckbox, bindSegmented, bindPlayPause, onClick } from '../../../assets/js/core/controls.js';
import { clear, line, circle, text } from '../../../assets/js/core/draw.js';
import { COLORS, alpha, font, onThemeChange, fontsReady } from '../../../assets/js/core/theme.js';
import { byId } from '../../../assets/js/core/dom.js';
import { clamp } from '../../../assets/js/core/math.js';
import { C_KM_S, addRel, addClassical, gamma, classicalError, stageSpeed } from './physics.js';

// ---------- State ----------
const SPAN = 10;            // light-seconds from the station to the far edge of the scene
const HOLD = 2.5;           // seconds to show the final picture before the run repeats
const STAGE_STEP = 0.5;
const MAX_STAGES = 8;

const P = { v: 0.5, w: 0.5, ghost: true };
let D = null;               // derived quantities
let t = 0;                  // station time, s
let hold = 0;
let paused = false;
let speed = 2;              // station seconds per real second
let stages = 1;

function recompute() {
  const u = addRel(P.v, P.w);
  const cl = addClassical(P.v, P.w);
  const shown = P.ghost ? [P.v, u, cl] : [P.v, u];
  const pos = shown.some((s) => s > 1e-9);
  const neg = shown.some((s) => s < -1e-9);
  const range = !neg ? [-1.5, SPAN] : !pos ? [-SPAN, 1.5] : [-SPAN, SPAN];
  D = {
    u, cl, range,
    isLight: Math.abs(P.w) === 1,
    err: classicalError(P.v, P.w),
    // stop when the fastest object drawn reaches the edge of the scene
    tEnd: SPAN / Math.max(1, P.ghost ? Math.abs(cl) : 0),
  };
}

// ---------- Formatting ----------
const num = (x, d) => {
  let s = x.toFixed(d);
  if (parseFloat(s) === 0) s = (0).toFixed(d);
  return s.replace('-', '−');
};
const inC = (x, d = 2) => (Math.abs(x) === 1 ? (x < 0 ? '−c' : 'c') : `${num(x, d)}c`);
const gam = (g) => (g === Infinity ? '∞' : Number.isNaN(g) ? '—' : g >= 100 ? g.toFixed(1) : g.toFixed(3));
const km = (x) => `${Math.round(x * C_KM_S).toLocaleString('en-US').replace(/,/g, ' ').replace('-', '−')} կմ/վ`;

const cache = {};
function put(id, html) {
  if (cache[id] === html) return;
  cache[id] = html;
  byId(id).innerHTML = html;
}

// ---------- Scene ----------
const view = fluidCanvas(byId('cv'), { height: (w) => clamp(Math.round(w * 0.46), 300, 400) });

function drawShip(ctx, x, y, dir, color, moving) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  if (moving) {
    ctx.fillStyle = alpha(COLORS.amber, 0.85);
    ctx.beginPath();
    ctx.moveTo(-15, -3.5); ctx.lineTo(-24, 0); ctx.lineTo(-15, 3.5);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-15, -6); ctx.lineTo(-20, -11); ctx.lineTo(-8, -6);
  ctx.moveTo(-15, 6); ctx.lineTo(-20, 11); ctx.lineTo(-8, 6);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-15, -6);
  ctx.lineTo(6, -6);
  ctx.quadraticCurveTo(15, -5, 19, 0);
  ctx.quadraticCurveTo(15, 5, 6, 6);
  ctx.lineTo(-15, 6);
  ctx.closePath();
  ctx.fillStyle = COLORS.canvasBg;
  ctx.fill();
  ctx.fillStyle = alpha(color, 0.3);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  circle(ctx, 6, 0, 2.2, { fill: color });
  ctx.restore();
}

function drawProbe(ctx, x, y, dir, color, ghost) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  ctx.beginPath();
  ctx.moveTo(-8, -4.5); ctx.lineTo(3, -4.5); ctx.lineTo(10, 0); ctx.lineTo(3, 4.5); ctx.lineTo(-8, 4.5);
  ctx.closePath();
  ctx.fillStyle = COLORS.canvasBg;
  ctx.fill();
  if (ghost) {
    ctx.setLineDash([3, 2.5]);
    ctx.fillStyle = alpha(color, 0.15);
  } else {
    ctx.fillStyle = color;
  }
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function drawPhoton(ctx, x, y, color) {
  circle(ctx, x, y, 9, { fill: alpha(color, 0.2) });
  circle(ctx, x, y, 4, { fill: color });
}

function drawStation(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = COLORS.surface2;
  ctx.strokeStyle = COLORS.text2;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.rect(-9, -12, 18, 12);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -12); ctx.lineTo(0, -19);
  ctx.moveTo(-15, -6); ctx.lineTo(-9, -6);
  ctx.moveTo(9, -6); ctx.lineTo(15, -6);
  ctx.stroke();
  circle(ctx, 0, -21, 2.2, { fill: COLORS.text2 });
  ctx.restore();
}

function drawScene() {
  const { ctx, width: W, height: H } = view;
  clear(ctx, W, H);

  const [xa, xb] = D.range;
  const padX = W < 520 ? 20 : 34;
  const perLs = (W - 2 * padX) / (xb - xa);
  const px = (x) => padX + (x - xa) * perLs;
  const top = 30;
  const axisY = H - 28;
  const x0 = px(0);
  const ct = t;                                   // light path, light-seconds

  // region already reached by the light emitted at launch
  const bl = clamp(px(-ct), 0, W);
  const br = clamp(px(ct), 0, W);
  ctx.fillStyle = alpha(COLORS.amber, 0.07);
  ctx.fillRect(bl, top, br - bl, axisY - top);

  // distance scale
  const labelStep = [1, 2, 5].find((s) => s * perLs >= 32) ?? 5;
  for (let x = Math.ceil(xa); x <= xb; x++) {
    const X = px(x);
    line(ctx, X, top, X, axisY, { color: COLORS.grid });
    const major = x % labelStep === 0;
    line(ctx, X, axisY, X, axisY + (major ? 6 : 3), { color: COLORS.axis });
    if (major) {
      text(ctx, num(x, 0), X, axisY + 16, { color: COLORS.text3, size: 10, family: 'mono', align: 'center' });
    }
  }
  line(ctx, 0, axisY, W, axisY, { color: COLORS.axis });
  line(ctx, x0, top, x0, axisY, { color: COLORS.axis, dash: [4, 4] });

  // heads-up line
  text(ctx, `t = ${num(t, 2)} վ`, 12, 16, { color: COLORS.text, size: 12, family: 'mono', weight: 600 });
  ctx.font = font(10.5);
  const long = 'հեռավորությունը կայանից՝ լուսային վայրկյաններով (լ. վ)';
  const unit = ctx.measureText(long).width < W - 130 ? long : 'սանդղակը՝ լուսային վայրկյան (լ. վ)';
  text(ctx, unit, W - 12, 16, { color: COLORS.text3, size: 10.5, align: 'right' });

  // station
  drawStation(ctx, x0, axisY);
  const stRight = x0 < W - 80;
  text(ctx, 'կայան', x0 + (stRight ? 20 : -20), axisY - 9, {
    color: COLORS.text2, size: 11, align: stRight ? 'left' : 'right',
  });

  // lanes
  const lanes = ['light'];
  if (P.ghost) lanes.push('ghost');
  lanes.push('probe', 'ship');
  const laneH = (axisY - 30 - top) / lanes.length;

  const tag = (str, x, y, color) => {
    ctx.font = font(11);
    const half = ctx.measureText(str).width / 2;
    text(ctx, str, clamp(x, 6 + half, W - 6 - half), y, { color, size: 11, align: 'center' });
  };

  lanes.forEach((lane, i) => {
    const yTop = top + i * laneH;
    const y = yTop + laneH * 0.68;
    const yLab = yTop + laneH * 0.26;
    if (i > 0) line(ctx, 0, yTop, W, yTop, { color: COLORS.grid });

    if (lane === 'light') {
      const col = COLORS.amber;
      ctx.font = font(11);
      const label = 'լույս · c';
      const lw = ctx.measureText(label).width;
      for (const dir of [-1, 1]) {
        const X = px(dir * ct);
        if (X < -10 || X > W + 10) continue;
        line(ctx, X, top, X, axisY, { color: alpha(col, 0.55), width: 1.5 });
        line(ctx, x0, y, X, y, { color: alpha(col, 0.55), width: 2 });
        drawPhoton(ctx, X, y, col);
        // label on the trailing side, once there is room for it
        if (ct * perLs > lw + 8) {
          text(ctx, label, X - dir * 2, yLab, { color: col, size: 11, align: dir > 0 ? 'right' : 'left' });
        }
      }
    } else if (lane === 'ghost') {
      const col = COLORS.text3;
      const X = px(D.cl * t);
      line(ctx, x0, y, X, y, { color: alpha(col, 0.6), width: 2, dash: [5, 4] });
      if (D.isLight) {
        circle(ctx, X, y, 5, { stroke: col, width: 1.5 });
      } else {
        drawProbe(ctx, X, y, Math.sign(D.cl) || Math.sign(P.w) || 1, col, true);
      }
      const over = Math.abs(D.cl) > 1;
      tag(`դասական կանխատեսում · v + u′ = ${inC(D.cl)}${over ? ' — c-ից մեծ' : ''}`, X, yLab,
        over ? COLORS.coral : COLORS.text2);
    } else if (lane === 'probe') {
      const col = COLORS.red;
      const X = px(D.u * t);
      line(ctx, x0, y, X, y, { color: alpha(col, 0.6), width: 2 });
      if (D.isLight) {
        drawPhoton(ctx, X, y, col);
        tag(`լույսի իմպուլս · u = ${inC(D.u)}`, X, yLab, col);
      } else {
        drawProbe(ctx, X, y, Math.sign(D.u) || Math.sign(P.w) || 1, col, false);
        tag(`զոնդ · u = ${inC(D.u, 3)}`, X, yLab, col);
      }
    } else {
      const col = COLORS.blue;
      const X = px(P.v * t);
      line(ctx, x0, y, X, y, { color: alpha(col, 0.6), width: 2 });
      drawShip(ctx, X, y, Math.sign(P.v) || 1, col, P.v !== 0);
      tag(`մայր նավ · v = ${inC(P.v)}`, X, yLab, col);
    }
  });

  updateReadouts();
}

function updateReadouts() {
  const lightPath = t;
  const behind = (beta) => {
    const d = Math.abs(beta) * t - lightPath;
    if (Math.abs(beta) === 1) return 'շարժվում է լույսի հետ կողք կողքի';
    if (d > 0) return `<b>լույսից առաջ է</b> ${num(d, 2)} լ. վ-ով`;
    return `լույսից ետ է <b>${num(-d, 2)}</b> լ. վ-ով`;
  };
  put('posOut',
    `t = <b>${num(t, 2)}</b> վ<br>` +
    `նավը՝ v·t = <b>${num(P.v * t, 2)}</b> լ. վ<br>` +
    `լույսը՝ c·t = <b>${num(lightPath, 2)}</b> լ. վ`);
  put('relOut',
    `u = <b>${inC(D.u, 4)}</b><br>` +
    `զոնդը՝ u·t = <b>${num(D.u * t, 2)}</b> լ. վ<br>${behind(D.u)}`);
  put('clOut',
    `v + u′ = <b>${inC(D.cl, 4)}</b><br>` +
    `(v + u′)·t = <b>${num(D.cl * t, 2)}</b> լ. վ<br>${behind(D.cl)}`);
}

// ---------- Stats ----------
function updateStats() {
  const { u, cl, err } = D;
  put('sV', inC(P.v));
  put('sW', inC(P.w));
  put('sCl', inC(cl));
  put('sU', inC(u, 4));
  put('sUkm', km(u));
  put('sErr', `${err < 0.1 ? err.toFixed(3) : err.toFixed(1)} %`);
  put('sGv', gam(gamma(P.v)));
  put('sGw', gam(gamma(P.w)));
  put('sGu', gam(gamma(u)));

  let note;
  if (D.isLight) {
    note = `Նավն արձակում է <b>լույս</b>։ Լույսի արագությունը կախված չէ աղբյուրի արագությունից. նավի ցանկացած v արագության դեպքում <b>u = ${inC(u)}</b>, թեև դասական օրենքը կտար ${inC(cl)}։`;
  } else if (Math.abs(cl) > 1) {
    note = `Դասական գումարը՝ <b>${inC(cl)}</b>, մոդուլով մեծ է լույսի արագությունից, ինչն անհնար է։ Իրականում <b>u = ${inC(u, 4)}</b>. զոնդը չի կարող հասնել լույսին։`;
  } else if (u === 0) {
    note = 'Զոնդն արձակվել է նավի շարժմանը հակառակ՝ նույն մեծության արագությամբ, ուստի կայանի նկատմամբ այն <b>անշարժ է</b>. երկու օրենքներն էլ տալիս են u = 0։';
  } else if (err < 1) {
    note = `Այս արագությունների դեպքում երկու օրենքները գրեթե նույն արդյունքն են տալիս. դասական օրենքի սխալն ընդամենը <b>${err < 0.1 ? err.toFixed(3) : err.toFixed(1)} %</b> է։`;
  } else {
    note = `Դասական օրենքը տալիս է <b>${inC(cl)}</b>, ռելյատիվիստականը՝ <b>${inC(u, 4)}</b>. դասական օրենքի սխալը <b>${err.toFixed(1)} %</b> է։`;
  }
  put('note', note);
}

// ---------- Chart: u(u′) for the current v ----------
const chartH = (w) => clamp(Math.round(w * 0.62), 230, 320);
const chart = fluidCanvas(byId('chart'), { height: chartH, onResize: drawChart });

function drawChart() {
  const { ctx, width: W, height: H } = chart;
  clear(ctx, W, H);
  const L = 36, R = 16, T = 12, B = 36;
  const X = (x) => L + ((x + 1) / 2) * (W - L - R);
  const Y = (y) => T + ((2 - y) / 4) * (H - T - B);

  // forbidden region |u| > c
  ctx.fillStyle = alpha(COLORS.red, 0.11);
  ctx.fillRect(X(-1), Y(2), X(1) - X(-1), Y(1) - Y(2));
  ctx.fillRect(X(-1), Y(-1), X(1) - X(-1), Y(-2) - Y(-1));

  for (const x of [-1, -0.5, 0, 0.5, 1]) {
    line(ctx, X(x), Y(2), X(x), Y(-2), { color: x === 0 ? COLORS.axis : COLORS.grid });
    text(ctx, num(x, x % 1 ? 1 : 0), X(x), Y(-2) + 12, { color: COLORS.text3, size: 10, family: 'mono', align: 'center' });
  }
  for (const y of [-2, -1, 0, 1, 2]) {
    line(ctx, X(-1), Y(y), X(1), Y(y), { color: y === 0 ? COLORS.axis : COLORS.grid });
    text(ctx, num(y, 0), L - 7, Y(y), { color: COLORS.text3, size: 10, family: 'mono', align: 'right' });
  }
  text(ctx, 'u′/c', X(1), H - 8, { color: COLORS.text2, size: 11, family: 'mono', align: 'right' });
  text(ctx, 'u/c', X(-1) + 6, Y(2) + 10, { color: COLORS.text2, size: 11, family: 'mono' });

  // the light limit
  for (const s of [1, -1]) {
    line(ctx, X(-1), Y(s), X(1), Y(s), { color: COLORS.amber, width: 1.5, dash: [6, 4] });
  }
  const forb = W < 330 ? '|u| > c' : '|u| > c՝ անհնար է';
  text(ctx, forb, X(-0.4), Y(1.5), { color: COLORS.red, size: 11, align: 'center' });
  text(ctx, forb, X(0.4), Y(-1.5), { color: COLORS.red, size: 11, align: 'center' });
  text(ctx, 'u = c', X(-1) + 6, Y(1) + 10, { color: COLORS.amber, size: 10.5, family: 'mono' });
  text(ctx, 'u = −c', X(1) - 6, Y(-1) - 9, { color: COLORS.amber, size: 10.5, family: 'mono', align: 'right' });

  ctx.save();
  ctx.beginPath();
  ctx.rect(X(-1), Y(2), X(1) - X(-1), Y(-2) - Y(2));
  ctx.clip();
  // classical straight line
  line(ctx, X(-1), Y(P.v - 1), X(1), Y(P.v + 1), { color: COLORS.text3, width: 1.5, dash: [5, 4] });
  // relativistic curve
  ctx.beginPath();
  for (let i = 0; i <= 100; i++) {
    const x = -1 + i / 50;
    const y = addRel(P.v, x);
    if (i === 0) ctx.moveTo(X(x), Y(y)); else ctx.lineTo(X(x), Y(y));
  }
  ctx.strokeStyle = COLORS.red;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();

  // current point
  const cx = X(P.w);
  line(ctx, cx, Y(-2), cx, Y(2), { color: alpha(COLORS.text3, 0.7), dash: [2, 3] });
  circle(ctx, cx, Y(D.cl), 4, { fill: COLORS.canvasBg, stroke: COLORS.text3, width: 1.5 });
  circle(ctx, cx, Y(D.u), 5, { fill: COLORS.red, stroke: COLORS.canvasBg, width: 1.5 });

  // value label, kept clear of the curve (which rises to the right)
  const label = `u = ${inC(D.u, 3)}`;
  ctx.font = font(11, { family: 'mono', weight: 600 });
  const lw = ctx.measureText(label).width;
  const right = cx + 9 + lw < X(1) - 2;
  const lx = right ? cx + 9 : cx - 9;
  const ly = right ? Y(D.u) + 13 : Y(D.u) - 13;
  ctx.fillStyle = alpha(COLORS.canvasBg, 0.85);
  ctx.fillRect(right ? lx - 3 : lx - lw - 3, ly - 8, lw + 6, 16);
  text(ctx, label, lx, ly, { color: COLORS.red, size: 11, family: 'mono', weight: 600, align: right ? 'left' : 'right' });
}

// ---------- Chart: rocket stages ----------
const stageView = fluidCanvas(byId('stages'), { height: chartH, onResize: drawStages });

function drawStages() {
  const { ctx, width: W, height: H } = stageView;
  clear(ctx, W, H);
  const xl = 30, xr = W - 88, T = 30, B = 10;
  const rowH = (H - T - B) / MAX_STAGES;
  const barH = Math.min(16, rowH - 8);
  const X = (b) => xl + b * (xr - xl);

  for (const b of [0, 0.5, 1]) {
    line(ctx, X(b), T - 6, X(b), H - B, b === 1
      ? { color: COLORS.amber, width: 1.5, dash: [6, 4] }
      : { color: COLORS.axis });
    text(ctx, b === 1 ? 'c' : b === 0 ? '0' : '0.5c', X(b), T - 16, {
      color: b === 1 ? COLORS.amber : COLORS.text3, size: 10.5, family: 'mono', align: 'center',
    });
  }

  for (let n = 1; n <= MAX_STAGES; n++) {
    const yc = T + (n - 0.5) * rowH;
    const on = n <= stages;
    text(ctx, String(n), xl - 10, yc, { color: on ? COLORS.text2 : COLORS.text3, size: 11, family: 'mono', align: 'right' });
    ctx.fillStyle = alpha(COLORS.text3, 0.12);
    ctx.fillRect(xl, yc - barH / 2, xr - xl, barH);
    if (!on) continue;
    const prev = stageSpeed(n - 1, STAGE_STEP);
    const beta = stageSpeed(n, STAGE_STEP);
    ctx.fillStyle = alpha(COLORS.red, n === stages ? 0.5 : 0.3);
    ctx.fillRect(xl, yc - barH / 2, X(prev) - xl, barH);
    ctx.fillStyle = alpha(COLORS.red, n === stages ? 1 : 0.6);            // the gain of this stage
    ctx.fillRect(X(prev), yc - barH / 2, Math.max(1.5, X(beta) - X(prev)), barH);
    text(ctx, `${beta.toFixed(5)}c`, xr + 12, yc, {
      color: n === stages ? COLORS.text : COLORS.text2, size: 11, family: 'mono', weight: n === stages ? 600 : 500,
    });
  }

  const beta = stageSpeed(stages, STAGE_STEP);
  const left = ((1 - beta) * 100).toPrecision(2);
  put('stageNote',
    `Աստիճանների թիվը՝ <b>${stages}</b>։ Դասական օրենքով արագությունը կլիներ ${stages} · 0.5c = <b>${num(stages * STAGE_STEP, 1)}c</b>, ` +
    `իրականում այն <b>${beta.toFixed(5)}c</b> է՝ c-ից փոքր ${left} %-ով։ ` +
    'Յուրաքանչյուր տողի վառ հատվածը ցույց է տալիս, թե որքան արագություն է ավելացրել այդ աստիճանը։');
  byId('stageAdd').disabled = stages >= MAX_STAGES;
}

onClick('stageAdd', () => { if (stages < MAX_STAGES) { stages++; drawStages(); } });
onClick('stageReset', () => { stages = 1; drawStages(); });

// ---------- Controls ----------
function paramsChanged() {
  recompute();
  t = 0;
  hold = 0;
  play.render();
  updateStats();
  drawChart();
}

const play = bindPlayPause('playBtn', {
  paused,
  label: (p) => (p ? (t === 0 ? '▶ Սկսել' : '▶ Շարունակել') : '⏸ Դադար'),
  onChange: (p) => { paused = p; },
});
onClick('resetBtn', () => {
  t = 0;
  hold = 0;
  paused = true;
  play.set(true);
});
bindSegmented('speed', { onChange: (v) => { speed = parseFloat(v); } });

bindRange('v', { format: (v) => inC(v), onInput: (v) => { P.v = v; paramsChanged(); } });
const wCtl = bindRange('w', {
  format: (v) => (Math.abs(v) === 1 ? `${inC(v)} (լույս)` : inC(v)),
  onInput: (v) => { P.w = v; paramsChanged(); },
});
onClick('lightBtn', () => wCtl.set(1));
bindCheckbox('ghost', { onChange: (on) => { P.ghost = on; paramsChanged(); } });

// ---------- Start ----------
recompute();
updateStats();
drawChart();
drawStages();
onThemeChange(() => { drawChart(); drawStages(); });
fontsReady().then(() => { drawChart(); drawStages(); });

startLoop((dt) => {
  if (!paused) {
    if (t < D.tEnd) {
      t = Math.min(D.tEnd, t + dt * speed);
    } else {
      hold += dt;
      if (hold >= HOLD) { t = 0; hold = 0; }
    }
  }
  drawScene();
});
