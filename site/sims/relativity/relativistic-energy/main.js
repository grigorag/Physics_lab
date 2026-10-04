// Relativistic energy and momentum: a particle is given kinetic energy
// Eₖ = eU and its speed is compared with light and with the classical
// prediction v = √(2Eₖ/m). State variable: k = Eₖ / mc².

import { fluidCanvas } from '../../../assets/js/core/canvas.js';
import { startLoop } from '../../../assets/js/core/loop.js';
import { bindRange, bindCheckbox, bindSelect, bindSegmented, bindPlayPause, onClick } from '../../../assets/js/core/controls.js';
import { clear, line, circle, text, roundRect } from '../../../assets/js/core/draw.js';
import { COLORS, alpha, font, onThemeChange, fontsReady } from '../../../assets/js/core/theme.js';
import { byId } from '../../../assets/js/core/dom.js';
import { clamp } from '../../../assets/js/core/math.js';
import {
  C, C_KM_S, PARTICLES, K_MIN, K_MAX, compute, kFromBeta, betaFromK, betaClassical,
  restEnergyJ, PETROL_Q, PLANT_W,
} from './physics.js';
import { sci, sup, p3, group, fmtMeV, fmtBeta, fmtGamma, fmtBig, fmtDuration, fmtMass } from './format.js';

// ---------- State ----------
const T_LIGHT = 2.2;        // real seconds the light pulse needs to cross the tube
const HOLD = 1.1;           // pause at the finish before the next run
const GHOST_MAX = 3;        // the classical ghost is drawn at most this many times faster than light

const S = { pid: 'electron', k: 1, ghost: true, chart: 'speed' };
let D = compute(S.k, PARTICLES[S.pid].mc2);
let tau = 0;                // light path in tube lengths, 0…1
let hold = 0;
let paused = false;

const cache = {};
function put(id, html) {
  if (cache[id] === html) return;
  cache[id] = html;
  byId(id).innerHTML = html;
}

const fmtCl = (b) => (b >= 100 ? b.toFixed(0) : b >= 10 ? b.toFixed(1) : b >= 1 ? b.toFixed(2) : b.toFixed(4));
const fmtPct = (f) => {
  const p = f * 100;
  return p >= 1000 ? `${group(p.toFixed(0))} %` : p >= 10 ? `${p.toFixed(1)} %` : p >= 0.1 ? `${p.toFixed(2)} %` : `${p.toFixed(3)} %`;
};

// ---------- Scene ----------
const view = fluidCanvas(byId('cv'), { height: (w) => clamp(Math.round(w * 0.4), 250, 330) });

function drawScene() {
  const { ctx, width: W, height: H } = view;
  clear(ctx, W, H);
  const narrow = W < 520;
  const padX = narrow ? 10 : 20;
  const gunW = narrow ? 30 : 44;
  const x0 = padX + gunW + 8;
  const x1 = W - padX - 8;
  const top = 40;
  const bot = H - 34;
  const px = (f) => x0 + f * (x1 - x0);

  // heads-up line
  const head = `${PARTICLES[S.pid].name} · Eₖ = ${fmtMeV(D.Ek)}`;
  text(ctx, head, padX, 18, { color: COLORS.text, size: 12, weight: 600 });
  ctx.font = font(12, { weight: 600 });
  const headW = ctx.measureText(head).width;
  const right = `γ = ${fmtGamma(D.gamma)}`;
  ctx.font = font(12, { family: 'mono' });
  if (padX + headW + 20 + ctx.measureText(right).width < W - padX) {
    text(ctx, right, W - padX, 18, { color: COLORS.text2, size: 12, family: 'mono', align: 'right' });
  }

  // tube
  roundRect(ctx, x0 - 8, top, x1 - x0 + 16, bot - top, 10);
  ctx.fillStyle = alpha(COLORS.text3, 0.07);
  ctx.fill();
  ctx.strokeStyle = COLORS.axis;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // accelerating gap (source of the particles)
  const gy = (top + bot) / 2;
  roundRect(ctx, padX, gy - 26, gunW, 52, 6);
  ctx.fillStyle = COLORS.surface2;
  ctx.fill();
  ctx.strokeStyle = COLORS.axis;
  ctx.stroke();
  text(ctx, 'U', padX + gunW / 2, gy, { color: COLORS.text2, size: 13, family: 'mono', weight: 600, align: 'center' });

  // scale: fraction of the tube length
  for (let i = 0; i <= 4; i++) {
    const f = i / 4;
    const X = px(f);
    if (i > 0 && i < 4) line(ctx, X, top, X, bot, { color: COLORS.grid });
    line(ctx, X, bot, X, bot + 5, { color: COLORS.axis });
    text(ctx, String(f), X, bot + 16, { color: COLORS.text3, size: 10, family: 'mono', align: 'center' });
  }

  const lanes = S.ghost ? ['light', 'particle', 'ghost'] : ['light', 'particle'];
  const laneH = (bot - top) / lanes.length;
  const speedG = Math.min(D.betaCl, GHOST_MAX);

  lanes.forEach((lane, i) => {
    const yTop = top + i * laneH;
    const y = yTop + laneH * 0.68;
    const yLab = yTop + laneH * 0.28;
    if (i > 0) line(ctx, x0 - 8, yTop, x1 + 8, yTop, { color: COLORS.grid });

    if (lane === 'light') {
      const col = COLORS.amber;
      const X = px(tau);
      line(ctx, x0, y, X, y, { color: alpha(col, 0.55), width: 2 });
      line(ctx, X, top, X, bot, { color: alpha(col, 0.35), width: 1 });
      circle(ctx, X, y, 9, { fill: alpha(col, 0.22) });
      circle(ctx, X, y, 4, { fill: col });
      text(ctx, 'լույսի իմպուլս · c', x0, yLab, { color: col, size: 11 });
    } else if (lane === 'particle') {
      const col = COLORS.red;
      const f = Math.min(1, D.beta * tau);
      const X = px(f);
      line(ctx, x0, y, X, y, { color: alpha(col, 0.6), width: 2 });
      line(ctx, X, y, X, bot, { color: alpha(col, 0.6), dash: [3, 3] });
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(X, bot); ctx.lineTo(X - 4, bot + 6); ctx.lineTo(X + 4, bot + 6);
      ctx.closePath();
      ctx.fill();
      circle(ctx, X, y, 10, { fill: alpha(col, 0.2) });
      circle(ctx, X, y, 5, { fill: col });
      text(ctx, `${PARTICLES[S.pid].name} · v = ${fmtBeta(D.beta, D.omb)}c`, x0, yLab, { color: col, size: 11 });
    } else {
      const over = D.betaCl > 1;
      const col = COLORS.text3;
      const X = px(Math.min(1, speedG * tau));
      line(ctx, x0, y, X, y, { color: alpha(col, 0.6), width: 2, dash: [5, 4] });
      ctx.save();
      ctx.setLineDash([3, 2.5]);
      circle(ctx, X, y, 5, { fill: alpha(col, 0.2), stroke: col, width: 1.5 });
      ctx.restore();
      const lab = `դասական կանխատեսում · ${fmtCl(D.betaCl)}c`;
      text(ctx, lab, x0, yLab, { color: COLORS.text2, size: 11 });
      if (over) {
        ctx.font = font(11);
        const lw = ctx.measureText(lab).width;
        text(ctx, '> c !', x0 + lw + 8, yLab, { color: COLORS.coral, size: 11, weight: 700 });
      }
    }
  });
}

// ---------- Stats ----------
function updateStats() {
  const p = PARTICLES[S.pid];
  put('sRest', `${p.mc2} ՄէՎ`);
  put('sU', fmtMeV(D.Ek, 'Վ'));
  put('sEk', fmtMeV(D.Ek));
  put('sE', fmtMeV(D.E));
  put('sP', fmtMeV(D.pc, 'էՎ', '/c'));
  put('sG', fmtGamma(D.gamma));
  put('sB', fmtBeta(D.beta, D.omb));
  put('sOmb', D.omb >= 0.01 ? D.omb.toFixed(4) : sci(D.omb));
  const vKm = C_KM_S - C_KM_S * D.omb;
  put('sV', `${group(vKm.toFixed(D.omb < 1e-4 ? 3 : 0))} կմ/վ`);
  put('sCl', `${fmtCl(D.betaCl)}c${D.betaCl > 1 ? ' > c !' : ''}`);
  put('sErr', fmtPct(D.err));

  let note;
  const b = `${fmtBeta(D.beta, D.omb)}c`;
  if (D.gamma >= 100) {
    const dv = C * D.omb;
    const dvTxt = dv >= 1000 ? `${p3(dv / 1000)} կմ/վ` : `${p3(dv)} մ/վ`;
    note = `Գերռելյատիվիստական մասնիկ. լրիվ էներգիան հանգստի էներգիայից մեծ է <b>${fmtGamma(D.gamma)}</b> անգամ, իսկ արագությունը լույսի արագությունից փոքր է ընդամենը <b>${dvTxt}</b>-ով։ Էներգիան աճում է, արագությունը՝ գրեթե ոչ։`;
  } else if (D.betaCl > 1) {
    note = `Դասական բանաձևով մասնիկը պիտի շարժվեր <b>${fmtCl(D.betaCl)}c</b> արագությամբ՝ լույսից արագ, ինչն անհնար է։ Իրականում <b>v = ${b}</b>, γ = ${fmtGamma(D.gamma)}։`;
  } else if (D.err < 0.01) {
    note = `Eₖ ≪ mc². մասնիկը դանդաղ է, և դասական mv²/2 բանաձևը լավ է աշխատում՝ արագության սխալն ընդամենը <b>${fmtPct(D.err)}</b> է։`;
  } else {
    note = `Դասական բանաձևը տալիս է <b>${fmtCl(D.betaCl)}c</b>, իրականում <b>v = ${b}</b>. տարբերությունն արդեն <b>${fmtPct(D.err)}</b> է և աճում է էներգիայի հետ։`;
  }
  put('note', note);
}

// ---------- Charts ----------
const chart = fluidCanvas(byId('chart'), {
  height: (w) => clamp(Math.round(w * 0.5), 250, 340),
  onResize: drawChart,
});

function valueTag(ctx, label, x, y, color, xMin, xMax, below = true) {
  ctx.font = font(11, { family: 'mono', weight: 600 });
  const lw = ctx.measureText(label).width;
  const right = x + 9 + lw < xMax - 2;
  const lx = right ? x + 9 : Math.max(xMin + lw + 4, x - 9);
  const ly = y + (below ? 14 : -14);
  ctx.fillStyle = alpha(COLORS.canvasBg, 0.85);
  ctx.fillRect(right ? lx - 3 : lx - lw - 3, ly - 8, lw + 6, 16);
  text(ctx, label, lx, ly, { color, size: 11, family: 'mono', weight: 600, align: right ? 'left' : 'right' });
}

function plotCurve(ctx, pts, color, { width = 2.5, dash = null } = {}) {
  ctx.save();
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  if (dash) ctx.setLineDash(dash);
  ctx.stroke();
  ctx.restore();
}

// (1) v/c versus Eₖ/mc² (logarithmic energy axis)
function drawSpeedChart(ctx, W, H) {
  const L = 38, R = 16, T = 14, B = 38;
  const LG0 = Math.log10(K_MIN), LG1 = Math.log10(K_MAX), YMAX = 1.5;
  const X = (lg) => L + ((lg - LG0) / (LG1 - LG0)) * (W - L - R);
  const Y = (b) => T + ((YMAX - b) / YMAX) * (H - T - B);

  ctx.fillStyle = alpha(COLORS.red, 0.1);
  ctx.fillRect(X(LG0), Y(YMAX), X(LG1) - X(LG0), Y(1) - Y(YMAX));

  for (let lg = LG0; lg <= LG1; lg++) {
    line(ctx, X(lg), Y(YMAX), X(lg), Y(0), { color: COLORS.grid });
    text(ctx, lg === 0 ? '1' : `10${sup(lg)}`, X(lg), Y(0) + 12, { color: COLORS.text3, size: 10, family: 'mono', align: 'center' });
  }
  for (const y of [0, 0.5, 1, 1.5]) {
    line(ctx, X(LG0), Y(y), X(LG1), Y(y), { color: y === 0 ? COLORS.axis : COLORS.grid });
    text(ctx, String(y), L - 7, Y(y), { color: COLORS.text3, size: 10, family: 'mono', align: 'right' });
  }
  line(ctx, X(LG0), Y(0), X(LG0), Y(YMAX), { color: COLORS.axis });
  text(ctx, 'Eₖ / mc²', X(LG1), H - 9, { color: COLORS.text2, size: 11, family: 'mono', align: 'right' });
  text(ctx, 'v/c', X(LG0) + 6, Y(YMAX) + 10, { color: COLORS.text2, size: 11, family: 'mono' });

  line(ctx, X(LG0), Y(1), X(LG1), Y(1), { color: COLORS.amber, width: 1.5, dash: [6, 4] });
  text(ctx, 'v = c', X(LG1) - 6, Y(1) + 11, { color: COLORS.amber, size: 10.5, family: 'mono', align: 'right' });
  text(ctx, W < 420 ? 'v > c՝ անհնար է' : 'v > c՝ անհնար է ոչ մի մարմնի համար', X(LG0) + 44, Y(1.25),
    { color: COLORS.red, size: 11 });

  const rel = [], cl = [];
  for (let i = 0; i <= 140; i++) {
    const lg = LG0 + ((LG1 - LG0) * i) / 140;
    const k = 10 ** lg;
    rel.push([X(lg), Y(betaFromK(k))]);
    cl.push([X(lg), Y(betaClassical(k))]);
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(X(LG0), Y(YMAX), X(LG1) - X(LG0), Y(0) - Y(YMAX));
  ctx.clip();
  plotCurve(ctx, cl, COLORS.text3, { width: 1.8, dash: [5, 4] });
  plotCurve(ctx, rel, COLORS.red);
  ctx.restore();

  const cx = X(Math.log10(D.k));
  line(ctx, cx, Y(0), cx, Y(YMAX), { color: alpha(COLORS.text3, 0.7), dash: [2, 3] });
  if (D.betaCl <= YMAX) {
    circle(ctx, cx, Y(D.betaCl), 4, { fill: COLORS.canvasBg, stroke: COLORS.text3, width: 1.5 });
  } else {
    text(ctx, '↑', cx, Y(YMAX) + 9, { color: COLORS.text3, size: 12, align: 'center' });
  }
  circle(ctx, cx, Y(D.beta), 5, { fill: COLORS.red, stroke: COLORS.canvasBg, width: 1.5 });
  valueTag(ctx, `v = ${fmtBeta(D.beta, D.omb)}c`, cx, Y(D.beta), COLORS.red, X(LG0), X(LG1));
}

// (2) E, Eₖ and pc versus β, in units of mc²
function drawEnergyChart(ctx, W, H) {
  const L = 34, R = 16, T = 14, B = 38;
  const ymax = clamp(Math.ceil(D.gamma * 1.3), 3, 12);
  const X = (b) => L + b * (W - L - R);
  const Y = (y) => T + ((ymax - y) / ymax) * (H - T - B);
  const step = ymax <= 4 ? 1 : ymax <= 8 ? 2 : 3;

  for (let i = 0; i <= 5; i++) {
    const b = i / 5;
    line(ctx, X(b), Y(ymax), X(b), Y(0), { color: i === 0 ? COLORS.axis : COLORS.grid });
    text(ctx, i === 5 ? '1' : String(b), X(b), Y(0) + 12, { color: COLORS.text3, size: 10, family: 'mono', align: 'center' });
  }
  for (let y = 0; y <= ymax; y += step) {
    line(ctx, X(0), Y(y), X(1), Y(y), { color: y === 0 ? COLORS.axis : COLORS.grid });
    text(ctx, String(y), L - 7, Y(y), { color: COLORS.text3, size: 10, family: 'mono', align: 'right' });
  }
  line(ctx, X(1), Y(0), X(1), Y(ymax), { color: COLORS.amber, width: 1.5, dash: [6, 4] });
  text(ctx, 'β = v/c', X(1), H - 9, { color: COLORS.text2, size: 11, family: 'mono', align: 'right' });
  text(ctx, 'mc² միավորներով', X(0) + 6, Y(ymax) + 10, { color: COLORS.text2, size: 11 });

  const E = [], Ek = [], p = [], EkC = [], pC = [];
  const N = 400;
  for (let i = 0; i <= N; i++) {
    // denser sampling towards β = 1, where the curves turn up steeply
    const b = 1 - (1 - i / N) ** 2;
    const g = b < 1 ? 1 / Math.sqrt(1 - b * b) : Infinity;
    EkC.push([X(b), Y(0.5 * b * b)]);
    pC.push([X(b), Y(b)]);
    if (g <= ymax * 3) {
      E.push([X(b), Y(g)]);
      Ek.push([X(b), Y(g - 1)]);
      p.push([X(b), Y(g * b)]);
    }
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(X(0), Y(ymax), X(1) - X(0), Y(0) - Y(ymax));
  ctx.clip();
  plotCurve(ctx, EkC, COLORS.red, { width: 1.6, dash: [5, 4] });
  plotCurve(ctx, pC, COLORS.teal, { width: 1.6, dash: [5, 4] });
  plotCurve(ctx, E, COLORS.purple);
  plotCurve(ctx, p, COLORS.teal);
  plotCurve(ctx, Ek, COLORS.red);
  ctx.restore();

  const cx = X(D.beta);
  line(ctx, cx, Y(0), cx, Y(ymax), { color: alpha(COLORS.text3, 0.7), dash: [2, 3] });
  const pts = [
    [D.gamma, COLORS.purple], [D.gamma * D.beta, COLORS.teal], [D.k, COLORS.red],
  ];
  circle(ctx, cx, Y(0.5 * D.beta ** 2), 3.5, { fill: COLORS.canvasBg, stroke: COLORS.red, width: 1.5 });
  circle(ctx, cx, Y(D.beta), 3.5, { fill: COLORS.canvasBg, stroke: COLORS.teal, width: 1.5 });
  let off = false;
  for (const [v, col] of pts) {
    if (v > ymax) { off = true; continue; }
    circle(ctx, cx, Y(v), 5, { fill: col, stroke: COLORS.canvasBg, width: 1.5 });
  }
  // value block in the empty upper-left part
  const lines = [
    [`E = ${fmtGamma(D.gamma)}·mc²`, COLORS.purple],
    [`pc = ${fmtGamma(D.gamma * D.beta)}·mc²`, COLORS.teal],
    [`Eₖ = ${fmtGamma(D.k)}·mc²`, COLORS.red],
  ];
  lines.forEach(([s, col], i) => {
    text(ctx, s, X(0) + 8, Y(ymax) + 30 + i * 16, { color: col, size: 11, family: 'mono', weight: 600 });
  });
  if (off) {
    text(ctx, '↑ սանդղակից դուրս', X(1) - 8, Y(ymax) + 10, { color: COLORS.text3, size: 10.5, align: 'right' });
  }
}

// (3) the energy–momentum right triangle, drawn to true shape
function drawTriangle(ctx, W, H) {
  const L = 22, R = 22, T = 22, B = 34;
  const gb = D.gamma * D.beta;                    // pc / mc²
  const s = Math.min((W - L - R) / gb, H - T - B);  // px per mc²
  const ox = L, oy = H - B;                       // right angle
  const ax = ox, ay = oy - s;                     // top of the mc² leg
  const bx = ox + gb * s, by = oy;                // end of the pc leg

  ctx.beginPath();
  ctx.moveTo(ox, oy); ctx.lineTo(ax, ay); ctx.lineTo(bx, by);
  ctx.closePath();
  ctx.fillStyle = alpha(COLORS.purple, 0.08);
  ctx.fill();

  // right-angle mark
  const q = Math.min(10, s * 0.4, gb * s * 0.4);
  if (q > 3) {
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1;
    ctx.strokeRect(ox, oy - q, q, q);
  }

  line(ctx, ox, oy, bx, by, { color: COLORS.teal, width: 3, cap: 'round' });
  line(ctx, ox, oy, ax, ay, { color: COLORS.blue, width: 3, cap: 'round' });
  // hypotenuse: the first mc² of it from the top, the rest is Eₖ
  const ux = (bx - ax) / (D.gamma * s), uy = (by - ay) / (D.gamma * s);
  const dx = ax + ux * s, dy = ay + uy * s;
  line(ctx, ax, ay, dx, dy, { color: COLORS.purple, width: 3, cap: 'round' });
  line(ctx, dx, dy, bx, by, { color: COLORS.red, width: 3, cap: 'round' });
  // arc carrying the length mc² from the leg onto the hypotenuse
  if (s > 12) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(ax, ay, s, Math.atan2(dy - ay, dx - ax), Math.PI / 2);
    ctx.strokeStyle = alpha(COLORS.blue, 0.6);
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
    circle(ctx, dx, dy, 3, { fill: COLORS.canvasBg, stroke: COLORS.purple, width: 1.5 });
  }

  // side names
  text(ctx, 'pc', clamp((ox + bx) / 2, ox + 12, W - R), oy + 14, { color: COLORS.teal, size: 12, family: 'mono', weight: 600, align: 'center' });
  if (s > 30) text(ctx, 'mc²', ox + 6, (oy + ay) / 2 - Math.min(s * 0.25, 30), { color: COLORS.blue, size: 12, family: 'mono', weight: 600 });

  // values, right-aligned in the upper right corner (above the hypotenuse)
  const rows = [
    [`E = ${fmtMeV(D.E)}`, COLORS.purple],
    [`pc = ${fmtMeV(D.pc)}`, COLORS.teal],
    [`mc² = ${fmtMeV(D.mc2)}`, COLORS.blue],
    [`Eₖ = ${fmtMeV(D.Ek)}`, COLORS.red],
  ];
  rows.forEach(([str, col], i) => {
    text(ctx, str, W - R + 8, T - 6 + i * 17, { color: col, size: 11.5, family: 'mono', weight: 600, align: 'right' });
  });
  const hintTxt = D.gamma > 30 ? 'mc² էջը շատ կարճ է. E ≈ pc' : D.k < 0.02 ? 'pc էջը շատ կարճ է. E ≈ mc²' : '';
  if (hintTxt) text(ctx, hintTxt, W - R + 8, T - 6 + 4 * 17 + 2, { color: COLORS.text3, size: 11, align: 'right' });
}

function drawChart() {
  const { ctx, width: W, height: H } = chart;
  clear(ctx, W, H);
  if (S.chart === 'speed') drawSpeedChart(ctx, W, H);
  else if (S.chart === 'energy') drawEnergyChart(ctx, W, H);
  else drawTriangle(ctx, W, H);
}

// ---------- Mass–energy box ----------
const MASSES = [];                      // grams: 1 մգ … 1 կգ in 1–2–5 steps
for (let e = -3; e <= 2; e++) for (const m of [1, 2, 5]) MASSES.push(m * 10 ** e);
MASSES.push(1000);

function updateMass(i) {
  const g = MASSES[i];
  const E = restEnergyJ(g / 1000);
  const fuelKg = E / PETROL_Q;
  const fuel = fuelKg < 1000 ? `${p3(fuelKg)} կգ` : `${fmtBig(fuelKg / 1000)} տ`;
  put('mE', `m = <b>${fmtMass(g)}</b><br>E₀ = <b>${sci(E)} Ջ</b><br>≈ ${fmtBig(E / 3.6e6)} կՎտ·ժ`);
  put('mFuel', `նույնքան ջերմություն անջատվում է <b>${fuel}</b> բենզին այրելիս (q = 46 ՄՋ/կգ)`);
  put('mPlant', `այդքան էներգիա արտադրելու համար պետք է աշխատի <b>${fmtDuration(E / PLANT_W)}</b>`);
}

const massCtl = bindRange('mass', { format: (i) => fmtMass(MASSES[i]), onInput: updateMass });
updateMass(massCtl.value);

// ---------- Controls ----------
function refresh() {
  D = compute(S.k, PARTICLES[S.pid].mc2);
  updateStats();
  drawChart();
}

const ekCtl = bindRange('ek', {
  format: () => fmtMeV(D.Ek),
  onInput: (lg) => { S.k = 10 ** lg; refresh(); syncSliders('ek'); },
});
const betaCtl = bindRange('beta', {
  format: () => `${fmtBeta(D.beta, D.omb)}c`,
  onInput: (b) => { S.k = clamp(kFromBeta(b), K_MIN, K_MAX); refresh(); syncSliders('beta'); },
});

/** Move the slider(s) that the user is not dragging to the current state. */
function syncSliders(source) {
  if (source !== 'ek') ekCtl.set(Math.log10(S.k), { silent: true }); else ekCtl.render();
  if (source !== 'beta') betaCtl.set(D.beta, { silent: true }); else betaCtl.render();
}

function setK(k) {
  S.k = clamp(k, K_MIN, K_MAX);
  refresh();
  syncSliders();
}

const particleCtl = bindSelect('particle', {
  onChange: (id) => { S.pid = id; refresh(); syncSliders(); },
});
onClick('preMc2', () => setK(1));
onClick('preU', () => setK(1 / PARTICLES[S.pid].mc2));            // Eₖ = 1 ՄէՎ
onClick('preLhc', () => {
  S.pid = 'proton';
  particleCtl.input.value = 'proton';
  setK(6.5e6 / PARTICLES.proton.mc2);
});
bindCheckbox('ghost', { onChange: (on) => { S.ghost = on; } });
bindPlayPause('playBtn', { paused, onChange: (p) => { paused = p; } });

bindSegmented('chartSel', {
  onChange: (v) => {
    S.chart = v;
    for (const id of ['speed', 'energy', 'triangle']) byId(`cap-${id}`).hidden = id !== v;
    drawChart();
  },
});

// ---------- Start ----------
refresh();
syncSliders();
onThemeChange(drawChart);
fontsReady().then(drawChart);

startLoop((dt) => {
  if (!paused) {
    if (tau < 1) {
      tau = Math.min(1, tau + dt / T_LIGHT);
    } else {
      hold += dt;
      if (hold >= HOLD) { tau = 0; hold = 0; }
    }
  }
  drawScene();
});
