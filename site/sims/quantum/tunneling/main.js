// Quantum tunnelling — an electron wave packet hits a rectangular barrier.
//
// The time-dependent Schrödinger equation is solved in physics.js (Crank–
// Nicolson, units eV / nm / fs). Simulation time advances in fixed steps of
// solver.dt; the number of steps per frame follows the real frame time, so the
// animation speed does not depend on the frame rate.

import { fluidCanvas } from '../../../assets/js/core/canvas.js';
import { startLoop } from '../../../assets/js/core/loop.js';
import {
  bindRange, bindCheckbox, bindSegmented, bindPlayPause, onClick,
} from '../../../assets/js/core/controls.js';
import { byId } from '../../../assets/js/core/dom.js';
import { clear, line, circle, text } from '../../../assets/js/core/draw.js';
import { COLORS, themed, alpha, font, onThemeChange, fontsReady } from '../../../assets/js/core/theme.js';
import { clamp } from '../../../assets/js/core/math.js';
import {
  HBAR, H2M, waveNumber, speed as electronSpeed, kappa, sigmaK,
  transmission, packetTransmission, createSolver, classicalPosition,
} from './physics.js';

const VIEW = [-8, 8];        // visible part of the x axis, nm (the grid itself is wider)
const X0 = -4.5;             // initial centre of the packet, nm
const TRAVEL = 11;           // the run ends when a free packet would have covered this, nm
const RUN_SECONDS = 7;       // duration of a run at ×1
const MAX_STEPS = 250;       // per frame, so a slow device drops time instead of freezing

const C = themed((light) => ({
  dens: COLORS.blue,
  densFill: alpha(COLORS.blue, light ? 0.22 : 0.28),
  re: COLORS.teal,
  barrier: COLORS.amber,
  barrierFill: alpha(COLORS.amber, light ? 0.2 : 0.22),
  energy: COLORS.coral,
  mag: COLORS.pink,
  ball: COLORS.coral,
  ballRim: light ? '#7a2a10' : '#ffc0a8',
  ground: light ? 'rgba(30,42,90,0.05)' : 'rgba(120,140,200,0.06)',
  curve: COLORS.blue,
  band: alpha(COLORS.coral, 0.13),
  sim: COLORS.pink,
}));

// ---------- State ----------
const P = { E: 5, U0: 10, a: 0.1, sigma: 0.6 };
let solver = null;
let th = null;               // theory for the current parameters
let probs = null;            // { left, inside, right, norm }
let acc = 0;                 // simulation time not yet stepped, fs
let paused = false;
let finished = false;
let animSpeed = 1;
let showRe = false;
let chartScale = 'lin';
let chartDirty = true;

function launch() {
  solver = createSolver({ ...P, x0: X0 });
  probs = solver.probabilities();
  const v = electronSpeed(P.E);
  const tPlane = transmission(P.E, P.U0, P.a);
  const tPacket = packetTransmission(P.E, P.U0, P.a, P.sigma);
  th = {
    v,
    tEnd: TRAVEL / v,
    tPlane,
    tPacket,
    dE: HBAR * v * sigmaK(P.sigma),              // energy spread (std), eV
    peak: 1 / (Math.sqrt(2 * Math.PI) * P.sigma), // initial max of |ψ|², nm⁻¹
    mag: tPacket > 0.08 ? 1 : tPacket > 8e-3 ? 10 : tPacket > 8e-4 ? 100 : 1000,
  };
  acc = 0;
  finished = false;
  paused = false;
  playCtl.set(false);
  byId('legMag').hidden = th.mag === 1;
  updateStats();
  chartDirty = true;
}

// ---------- Formatting ----------
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const sup = (n) => [...String(n)].map((ch) => SUP[ch]).join('');

/** Probability with 3 significant digits: 0.334, 0.0401, 4.21·10⁻⁴. */
function fmtP(v) {
  if (!(v > 1e-30)) return '0';
  if (v >= 0.01) return v.toPrecision(3);
  const [m, e] = v.toExponential(2).split('e');
  return `${m}·10${sup(+e)}`;
}

const cache = {};
function put(id, html) {
  if (cache[id] === html) return;
  cache[id] = html;
  byId(id).innerHTML = html;
}

function updateStats() {
  const { E, U0, a } = P;
  put('sE', `${E.toFixed(1)} էՎ`);
  put('sDE', `± ${th.dE.toFixed(2)} էՎ`);
  put('sU', `${U0.toFixed(1)} էՎ`);
  put('sA', `${a.toFixed(2)} նմ`);
  if (E < U0) {
    const k = kappa(E, U0);
    put('sK', `${k.toFixed(2)} նմ⁻¹`);
    put('sD', `${(1 / k).toFixed(3)} նմ`);
  } else {
    put('sK', '— (E ≥ U₀)');
    put('sD', '— (E ≥ U₀)');
  }
  put('sTth', fmtP(th.tPlane));
  put('sTp', fmtP(th.tPacket));
}

function updateLive() {
  const { left, inside, right } = probs;
  put('sT', fmtP(right));
  put('sR', fmtP(left));
  put('sSum', (left + right).toFixed(4));
  put('outR', `R = <b>${fmtP(left)}</b><br>բանաձևով՝ 1 − T = ${fmtP(1 - th.tPlane)}`);
  put('outT', `T = <b>${fmtP(right)}</b><br>բանաձևով՝ T = ${fmtP(th.tPlane)}`);
  const status = finished ? 'բախումն ավարտվել է' : paused ? 'դադար' : 'փաթեթը շարժվում է';
  put('outState', `t = <b>${solver.t.toFixed(2)}</b> ֆվ<br>արգելքի ներսում՝ ${fmtP(inside)}<br>${status}`);

  let msg;
  if (P.E < P.U0) {
    msg = `<b>E &lt; U₀.</b> Դասական մասնիկը չի կարող անցնել արգելքը և անդրադառնում է։ Քվանտային մասնիկը թունելային անցումով հայտնվում է արգելքից աջ՝ T ≈ ${fmtP(th.tPacket)} հավանականությամբ։`;
  } else if (P.E > P.U0) {
    msg = `<b>E &gt; U₀.</b> Դասական մասնիկն անպայման անցնում է արգելքի վրայով։ Քվանտային մասնիկը R ≈ ${fmtP(1 - th.tPacket)} հավանականությամբ անդրադառնում է։`;
  } else {
    msg = `<b>E = U₀.</b> Դասական մասնիկը կանգ կառներ արգելքի եզրին։ Քվանտային մասնիկն անցնում է T ≈ ${fmtP(th.tPacket)} հավանականությամբ։`;
  }
  put('verdict', msg);
}

// ---------- Main canvas ----------
const view = fluidCanvas(byId('cv'), {
  height: (w) => Math.round(clamp(w * 0.56, 340, 520)),
});
const { ctx } = view;

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

function drawScene() {
  const { width: W, height: H } = view;
  if (!W) return;
  const small = W < 520;
  const mL = small ? 34 : 44, mR = 12;
  const plotTop = 26;
  const stripH = 52, axisH = 24;
  const plotBottom = H - stripH - axisH;
  const plotH = plotBottom - plotTop;
  const below = showRe ? plotH * 0.2 : 0;           // room for negative Re ψ
  const y0 = plotBottom - below;                    // U = 0 and |ψ|² = 0
  const above = y0 - plotTop;
  const pw = W - mL - mR;
  const pxPerNm = pw / (VIEW[1] - VIEW[0]);
  const px = (x) => mL + (x - VIEW[0]) * pxPerNm;

  const eMax = Math.max(1.2 * P.U0, 1.4 * P.E);     // keeps the E line below the legend
  const yE = (e) => y0 - (e / eMax) * above;

  clear(ctx, W, H, COLORS.canvasBg);

  // --- grid and axes ---
  const lbl = { color: COLORS.text3, size: 10, family: 'mono' };
  const eStep = niceStep(eMax / (small ? 4 : 5));
  for (let e = 0; e <= eMax * 0.97; e += eStep) {
    const y = Math.round(yE(e)) + 0.5;
    if (e > 0) line(ctx, mL, y, W - mR, y, { color: COLORS.grid });
    line(ctx, mL - 4, y, mL, y, { color: COLORS.axis });
    text(ctx, String(+e.toFixed(2)), mL - 7, y, { ...lbl, align: 'right' });
  }
  text(ctx, 'էՎ', mL - 7, 11, { color: COLORS.text3, size: 11, align: 'right' });
  for (let x = Math.ceil(VIEW[0] / 2) * 2; x <= VIEW[1]; x += 2) {
    const X = Math.round(px(x)) + 0.5;
    line(ctx, X, plotTop, X, plotBottom, { color: COLORS.grid });
    line(ctx, X, plotBottom, X, plotBottom + 4, { color: COLORS.axis });
    if (x < VIEW[1]) text(ctx, String(x), X, plotBottom + 13, { ...lbl, align: 'center' });
  }
  text(ctx, 'x, նմ', W - mR, plotBottom + 13, { color: COLORS.text3, size: 11, align: 'right' });
  line(ctx, mL + 0.5, plotTop, mL + 0.5, plotBottom, { color: COLORS.axis });
  line(ctx, mL, Math.round(y0) + 0.5, W - mR, Math.round(y0) + 0.5, { color: COLORS.axis });
  if (below) line(ctx, mL, plotBottom + 0.5, W - mR, plotBottom + 0.5, { color: COLORS.grid });

  // --- barrier U(x) ---
  const xb0 = px(0), xb1 = px(P.a), yb = yE(P.U0);
  ctx.fillStyle = C.barrierFill;
  ctx.fillRect(xb0, yb, xb1 - xb0, y0 - yb);
  ctx.save();
  ctx.strokeStyle = C.barrier;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(mL, y0); ctx.lineTo(xb0, y0); ctx.lineTo(xb0, yb);
  ctx.lineTo(xb1, yb); ctx.lineTo(xb1, y0); ctx.lineTo(W - mR, y0);
  ctx.stroke();
  ctx.restore();

  // --- wave function (clipped to the plot) ---
  const { re, im, dx, xMin, n, jR } = solver;
  const jA = Math.max(0, Math.floor((VIEW[0] - xMin) / dx));
  const jB = Math.min(n - 1, Math.ceil((VIEW[1] - xMin) / dx));
  const stride = Math.max(1, Math.floor(0.6 / (pxPerNm * dx)));
  const xOf = (j) => px(xMin + (j + 0.5) * dx);
  const dScale = (0.25 * above) / th.peak;          // px per nm⁻¹
  const dens = (j) => re[j] * re[j] + im[j] * im[j];

  ctx.save();
  ctx.beginPath();
  ctx.rect(mL, plotTop - 4, pw, plotBottom - plotTop + 4);
  ctx.clip();
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(xOf(jA), y0);
  for (let j = jA; j <= jB; j += stride) ctx.lineTo(xOf(j), y0 - dens(j) * dScale);
  ctx.lineTo(xOf(jB), y0);
  ctx.closePath();
  ctx.fillStyle = C.densFill;
  ctx.fill();
  ctx.beginPath();
  for (let j = jA; j <= jB; j += stride) {
    const X = xOf(j), Y = y0 - dens(j) * dScale;
    if (j === jA) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
  }
  ctx.strokeStyle = C.dens;
  ctx.lineWidth = 2;
  ctx.stroke();

  if (th.mag > 1) {
    ctx.beginPath();
    for (let j = jR; j <= jB; j += stride) {
      const X = xOf(j), Y = y0 - dens(j) * dScale * th.mag;
      if (j === jR) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
    }
    ctx.strokeStyle = C.mag;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (showRe) {
    const rScale = (0.1 * plotH) / Math.sqrt(th.peak);
    ctx.beginPath();
    for (let j = jA; j <= jB; j += stride) {
      const X = xOf(j), Y = y0 - re[j] * rScale;
      if (j === jA) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
    }
    ctx.strokeStyle = C.re;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  ctx.restore();

  // --- energy level E ---
  const ye = Math.round(yE(P.E)) + 0.5;
  line(ctx, mL, ye, W - mR, ye, { color: C.energy, width: 1.5, dash: [7, 5] });
  const tag = { size: 12, family: 'mono', weight: 600 };
  text(ctx, `E = ${P.E.toFixed(1)} էՎ`, mL + 8, ye - 10, { ...tag, color: C.energy });
  if (P.E < P.U0 && ye - yb > 4) {
    ctx.font = font(12, { family: 'mono', weight: 600 });
    const half = ctx.measureText(`U₀ = ${P.U0.toFixed(1)} էՎ`).width / 2;
    text(ctx, `U₀ = ${P.U0.toFixed(1)} էՎ`, clamp((xb0 + xb1) / 2, mL + half, W - mR - half), yb - 10,
      { ...tag, color: C.barrier, align: 'center' });
  } else {
    text(ctx, `U₀ = ${P.U0.toFixed(1)} էՎ`, xb1 + 7, Math.min(yb + 12, y0 - 10), { ...tag, color: C.barrier });
  }
  if (th.mag > 1) {
    text(ctx, `×${th.mag}`, W - mR - 6, y0 - 0.25 * above - 12, { ...tag, color: C.mag, align: 'right' });
  }

  // --- classical particle strip ---
  const sTop = H - stripH + 4;
  const ground = H - 10;
  const hMax = ground - sTop - 14;
  ctx.fillStyle = C.ground;
  ctx.fillRect(0, sTop - 2, W, H - sTop + 2);
  line(ctx, 0, sTop - 2.5, W, sTop - 2.5, { color: COLORS.grid });
  const hill = Math.max(6, (hMax * P.U0) / eMax);
  ctx.fillStyle = C.barrierFill;
  ctx.fillRect(xb0, ground - hill, xb1 - xb0, hill);
  ctx.save();
  ctx.strokeStyle = C.barrier;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(mL, ground); ctx.lineTo(xb0, ground); ctx.lineTo(xb0, ground - hill);
  ctx.lineTo(xb1, ground - hill); ctx.lineTo(xb1, ground); ctx.lineTo(W - mR, ground);
  ctx.stroke();
  ctx.restore();
  text(ctx, 'դասական մասնիկ', mL + 8, sTop + 7, { color: COLORS.text3, size: 11 });

  const r = 6;
  const ball = classicalPosition(solver.t, { ...P, x0: X0 });
  let bx = px(ball.x), by = ground - r - 1;
  if (P.E <= P.U0) bx = Math.min(bx, xb0 - r - 1);
  else if (bx > xb0 - r && bx < xb1 + r) by -= hill;
  if (bx > mL - r && bx < W + r) {
    circle(ctx, bx, by, r, { fill: C.ball, stroke: C.ballRim, width: 1.5 });
  }
}

// ---------- T(E) chart ----------
const chart = fluidCanvas(byId('chart'), {
  height: (w) => Math.round(clamp(w * 0.36, 210, 300)),
  onResize: () => { chartDirty = true; },
});

const LOG_MIN = -8;

function drawChart() {
  const { ctx: g, width: W, height: H } = chart;
  if (!W) return;
  const small = W < 520;
  const mL = small ? 40 : 48, mR = 14, mT = 22, mB = 30;
  const pw = W - mL - mR, ph = H - mT - mB;
  const eMax = Math.max(12, 2 * P.U0);
  const log = chartScale === 'log';
  const X = (e) => mL + (e / eMax) * pw;
  const Y = (t) => (log
    ? mT + (clamp(Math.log10(Math.max(t, 1e-300)), LOG_MIN, 0) / LOG_MIN) * ph
    : mT + (1 - t) * ph);

  clear(g, W, H, COLORS.canvasBg);
  const lbl = { color: COLORS.text3, size: 10, family: 'mono' };

  // grid
  if (log) {
    for (let d = 0; d >= LOG_MIN; d -= 2) {
      const y = Math.round(mT + (d / LOG_MIN) * ph) + 0.5;
      line(g, mL, y, W - mR, y, { color: COLORS.grid });
      text(g, d === 0 ? '1' : `10${sup(d)}`, mL - 7, y, { ...lbl, align: 'right' });
    }
  } else {
    for (let i = 0; i <= 4; i++) {
      const y = Math.round(Y(i / 4)) + 0.5;
      line(g, mL, y, W - mR, y, { color: COLORS.grid });
      text(g, (i / 4).toFixed(2), mL - 7, y, { ...lbl, align: 'right' });
    }
  }
  const eStep = niceStep(eMax / (small ? 5 : 8));
  for (let e = 0; e <= eMax + 1e-9; e += eStep) {
    const x = Math.round(X(e)) + 0.5;
    line(g, x, mT, x, mT + ph, { color: COLORS.grid });
    if (X(e) < W - mR - 34) text(g, String(+e.toFixed(2)), x, mT + ph + 12, { ...lbl, align: 'center' });
  }
  line(g, mL + 0.5, mT, mL + 0.5, mT + ph, { color: COLORS.axis });
  line(g, mL, mT + ph + 0.5, W - mR, mT + ph + 0.5, { color: COLORS.axis });
  text(g, 'T', mL - 7, 10, { color: COLORS.text3, size: 11, align: 'right' });
  text(g, 'E, էՎ', W - mR, mT + ph + 12, { color: COLORS.text3, size: 11, align: 'right' });

  // packet energy band E ± ΔE
  const e0 = Math.max(0, P.E - th.dE), e1 = Math.min(eMax, P.E + th.dE);
  g.fillStyle = C.band;
  g.fillRect(X(e0), mT, X(e1) - X(e0), ph);

  // U₀ marker
  const xu = Math.round(X(P.U0)) + 0.5;
  line(g, xu, mT, xu, mT + ph, { color: C.barrier, width: 1.5, dash: [5, 4] });
  text(g, 'U₀', xu, mT - 9, { color: C.barrier, size: 11, family: 'mono', weight: 600, align: 'center' });

  // T(E)
  g.save();
  g.beginPath();
  g.rect(mL, mT - 2, pw, ph + 4);
  g.clip();
  g.beginPath();
  const steps = Math.round(pw * 2);
  for (let i = 0; i <= steps; i++) {
    const e = Math.max(1e-6, (i / steps) * eMax);
    const x = X(e), y = Y(transmission(e, P.U0, P.a));
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.strokeStyle = C.curve;
  g.lineWidth = 2;
  g.lineJoin = 'round';
  g.stroke();
  g.restore();

  // current energy
  const xe = Math.round(X(P.E)) + 0.5;
  const yt = Y(th.tPlane);
  line(g, xe, mT, xe, mT + ph, { color: C.energy, width: 1.5 });
  const xuLabelClash = Math.abs(xe - xu) < 22;
  if (!xuLabelClash) text(g, 'E', xe, mT - 9, { color: C.energy, size: 11, family: 'mono', weight: 600, align: 'center' });
  circle(g, xe, yt, 4.5, { fill: C.energy, stroke: COLORS.canvasBg, width: 1.5 });

  // measured point
  let ys = null;
  if (finished) {
    ys = Y(probs.right);
    circle(g, xe, ys, 7, { stroke: C.sim, width: 2 });
  }

  // value label next to the point, kept inside the plot
  const right = xe < mL + pw * 0.62;
  const lx = right ? xe + 12 : xe - 12;
  const align = right ? 'left' : 'right';
  const lines = finished ? 2 : 1;
  const ly = clamp(right ? yt + 16 : yt - 14 - (lines - 1) * 15, mT + 9, mT + ph - 9 - (lines - 1) * 15);
  text(g, `T = ${fmtP(th.tPlane)}`, lx, ly, { color: C.energy, size: 11, family: 'mono', weight: 600, align });
  if (finished) {
    text(g, `մոդելում՝ ${fmtP(probs.right)}`, lx, ly + 15, { color: C.sim, size: 11, family: 'mono', weight: 600, align });
  }
}

// ---------- Controls ----------
const relaunch = (key) => (v) => { P[key] = v; launch(); };
bindRange('energy', { format: (v) => `${v.toFixed(1)} էՎ`, onInput: relaunch('E') });
bindRange('height', { format: (v) => `${v.toFixed(1)} էՎ`, onInput: relaunch('U0') });
bindRange('width', { format: (v) => `${v.toFixed(2)} նմ`, onInput: relaunch('a') });
bindRange('sigma', { format: (v) => `${v.toFixed(2)} նմ`, onInput: relaunch('sigma') });
bindCheckbox('showRe', {
  onChange: (on) => { showRe = on; byId('legRe').hidden = !on; },
});
bindSegmented('speed', { onChange: (v) => { animSpeed = parseFloat(v); } });
bindSegmented('scale', { onChange: (v) => { chartScale = v; chartDirty = true; } });

const playCtl = bindPlayPause('playBtn', {
  label: (p) => (!p ? '⏸ Դադար' : finished ? '▶ Գործարկել' : '▶ Շարունակել'),
  onChange: (p) => {
    if (!p && finished) launch();
    else paused = p;
  },
});
onClick('restartBtn', launch);

onThemeChange(() => { chartDirty = true; });
fontsReady().then(() => { chartDirty = true; });

// ---------- Start ----------
launch();

startLoop((dt) => {
  if (!paused && !finished) {
    acc += (dt * animSpeed * th.tEnd) / RUN_SECONDS;
    let steps = Math.floor(acc / solver.dt);
    if (steps > MAX_STEPS) { steps = MAX_STEPS; acc = 0; } else acc -= steps * solver.dt;
    if (steps > 0) {
      solver.step(steps);
      probs = solver.probabilities();
    }
    if (solver.t >= th.tEnd) {
      finished = true;
      playCtl.set(true);
      chartDirty = true;
    }
  }
  drawScene();
  updateLive();
  if (chartDirty) {
    chartDirty = false;
    drawChart();
  }
});
