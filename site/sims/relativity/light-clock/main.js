// Light clock and time dilation.
//
// Two identical light clocks: one on the platform, one in a train car moving
// at v = βc. The scene is drawn in the chosen inertial frame. Frame time t is
// counted in units of the proper period Δt₀; the clock at rest in the frame
// shows τ = t, the moving one τ = t/γ. Everything on screen is a function of
// t (analytic), so the animation is frame-rate independent.
//
// Screen scale: the mirror separation h is Hpx pixels, so light covers 2·Hpx
// per unit of t — for BOTH pulses. The moving clock travels β·2·Hpx per unit
// of t and its pulse climbs at 2·Hpx/γ, i.e. the on-screen speed is again c.

import { fluidCanvas } from '../../../assets/js/core/canvas.js';
import { startLoop } from '../../../assets/js/core/loop.js';
import {
  bindRange, bindCheckbox, bindSegmented, bindPlayPause, onClick,
} from '../../../assets/js/core/controls.js';
import { byId } from '../../../assets/js/core/dom.js';
import { clear, line, arrow, circle, text, roundRect } from '../../../assets/js/core/draw.js';
import {
  COLORS, themed, alpha, font, onThemeChange, fontsReady,
} from '../../../assets/js/core/theme.js';
import { clamp } from '../../../assets/js/core/math.js';
import { C_KMS, T0_NS, gamma, pulse, pathVertices } from './physics.js';

const C = themed((light) => ({
  pulse: light ? '#e08600' : '#ffc94d',
  glow: light ? 'rgba(224,134,0,' : 'rgba(255,201,77,',
  trail: light ? 'rgba(214,126,0,0.85)' : 'rgba(255,196,70,0.8)',
  mirror: light ? '#4a5270' : '#b9c1de',
  frame: light ? 'rgba(30,42,90,0.35)' : 'rgba(170,180,215,0.4)',
  car: COLORS.red,
  carFill: alpha(COLORS.red, light ? 0.07 : 0.1),
  ground: light ? 'rgba(30,42,90,0.06)' : 'rgba(120,140,200,0.08)',
  seam: light ? 'rgba(30,42,90,0.3)' : 'rgba(170,180,215,0.3)',
  base: COLORS.blue,
  leg: COLORS.green,
  plate: alpha(COLORS.canvasBg, 0.86),
}));

const RATE = 0.8;            // Δt₀ of frame time per second at ×1

// ---------- State ----------
let beta = 0.6;
let frame = 'platform';      // 'platform' | 'train'
let t = 0;                   // frame time, in units of Δt₀
let paused = false;
let speed = 1;
let showTrail = true;
let showTri = true;
let chartDirty = true;

function restart() { t = 0; }

// ---------- Canvases ----------
const view = fluidCanvas(byId('cv'), {
  height: (w) => Math.round(clamp(w * 0.5, 400, 500)),
});
const { ctx } = view;

const chart = fluidCanvas(byId('chart'), {
  height: (w) => Math.round(clamp(w * 0.3, 190, 250)),
  onResize: () => { chartDirty = true; },
});

// ---------- Scene geometry ----------
const mod = (a, n) => ((a % n) + n) % n;

function geometry() {
  const { width: W, height: H } = view;
  const laneH = H / 2;
  const Hpx = laneH - 96;                    // mirror separation in px
  const g = gamma(beta);
  const u = beta * 2 * Hpx;                  // px travelled by the moving clock per unit of t
  const trainMoves = frame === 'platform';
  const s = trainMoves ? 1 : -1;             // direction of the moving clock on screen
  const carHW = clamp(W * 0.11, 46, 92);     // proper half-length of the car
  const pad = carHW + 40;
  const L = W + 2 * pad;                     // wrap-around length
  const x0 = pad + W * (s > 0 ? 0.12 : 0.88);
  const X = (time) => x0 + s * u * time;     // unwrapped position of the moving clock
  const k = Math.floor(X(t) / L);
  const toScreen = (x) => x - k * L - pad;
  // frame time at which the moving clock entered the current pass
  let tIn = 0;
  if (u > 1e-9) tIn = Math.max(0, s > 0 ? (k * L - x0) / u : (x0 - (k + 1) * L) / u);
  return { W, H, laneH, Hpx, g, u, s, trainMoves, carHW, X, toScreen, tIn };
}

// ---------- Drawing ----------
function plateText(str, x, y, { color, align = 'center', size = 11 }) {
  ctx.save();
  ctx.font = font(size, { family: 'mono', weight: 600 });
  const w = ctx.measureText(str).width + 10;
  const left = align === 'center' ? x - w / 2 : align === 'right' ? x - w + 5 : x - 5;
  ctx.fillStyle = C.plate;
  roundRect(ctx, left, y - 9, w, 18, 5);
  ctx.fill();
  ctx.restore();
  text(ctx, str, x, y, { color, size, family: 'mono', weight: 600, align });
}

/** Tile seams / sleepers: ground-fixed marks that show which body moves. */
function groundMarks(G, y1, y2, spacing0, color) {
  const sp = G.trainMoves ? spacing0 : spacing0 / G.g;
  const off = G.trainMoves ? 0 : mod(-G.u * t, sp);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = sp < 14 ? 0.45 : 1;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = off - sp; x < G.W + sp; x += sp) {
    ctx.moveTo(x, y1);
    ctx.lineTo(x, y2);
  }
  ctx.stroke();
  ctx.restore();
}

function drawCar(G, cx, yT, yB, squeeze) {
  const hw = Math.max(G.carHW * squeeze, 3);
  ctx.save();
  ctx.fillStyle = C.carFill;
  ctx.strokeStyle = alpha(C.car, 0.75);
  ctx.lineWidth = 1.5;
  roundRect(ctx, cx - hw, yT - 12, 2 * hw, yB - yT + 24, Math.min(9, hw));
  ctx.fill();
  ctx.stroke();
  // wheels (contracted along the motion together with the car)
  ctx.fillStyle = COLORS.canvasBg;
  for (const d of [-0.62, 0.62]) {
    ctx.beginPath();
    ctx.ellipse(cx + d * hw, yB + 19, Math.max(7 * squeeze, 1.2), 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawClock(cx, yT, yB, squeeze, state, withStand) {
  const hw = Math.max(22 * squeeze, 2.5);
  // side posts
  line(ctx, cx - hw, yT, cx - hw, yB, { color: C.frame, width: 1 });
  line(ctx, cx + hw, yT, cx + hw, yB, { color: C.frame, width: 1 });
  if (withStand) {
    ctx.fillStyle = C.frame;
    ctx.fillRect(cx - Math.max(hw * 0.5, 1.5), yB + 3, Math.max(hw, 3), 8);
  }
  // tick flash on the lower mirror
  const flash = state.ticks > 0 ? Math.max(0, 1 - state.phase / 0.14) : 0;
  if (flash > 0) {
    const r = 26;
    const grad = ctx.createRadialGradient(cx, yB, 0, cx, yB, r);
    grad.addColorStop(0, `${C.glow}${0.75 * flash})`);
    grad.addColorStop(1, `${C.glow}0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(cx - r, yB - r, 2 * r, 2 * r);
  }
  line(ctx, cx - hw, yT - 2, cx + hw, yT - 2, { color: C.mirror, width: 4, cap: 'round' });
  line(ctx, cx - hw, yB + 2, cx + hw, yB + 2, { color: flash > 0.3 ? C.pulse : C.mirror, width: 4, cap: 'round' });
}

function drawPulse(x, y) {
  const r = 13;
  const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, `${C.glow}0.55)`);
  grad.addColorStop(1, `${C.glow}0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  circle(ctx, x, y, 4.5, { fill: C.pulse });
}

function drawTrail(points) {
  if (points.length < 2) return;
  ctx.save();
  ctx.strokeStyle = C.trail;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  ctx.restore();
}

/** Right triangle for the current half-tick of the moving clock. */
function drawTriangle(G, tau, yT, yB) {
  if (beta < 0.05) return;
  const tb = Math.floor(tau + 1e-9) * G.g;           // frame time of the last lower-mirror bounce
  const ax = G.toScreen(G.X(tb));
  const dx = G.s * beta * G.g * G.Hpx;               // v·Δt/2 on screen
  const bx = ax + dx;
  line(ctx, ax, yB, bx, yB, { color: C.base, width: 2 });
  line(ctx, bx, yB, bx, yT, { color: C.leg, width: 2, dash: [5, 4] });
  line(ctx, ax, yB, bx, yT, { color: C.trail, width: 1.5, dash: [2, 4] });
  // right-angle mark
  const q = Math.min(9, Math.abs(dx) * 0.4);
  ctx.save();
  ctx.strokeStyle = COLORS.text3;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(bx - G.s * q, yB);
  ctx.lineTo(bx - G.s * q, yB - q);
  ctx.lineTo(bx, yB - q);
  ctx.stroke();
  ctx.restore();

  const hyp = Math.hypot(dx, G.Hpx);
  const mx = (ax + bx) / 2, my = (yB + yT) / 2;
  // labels: hypotenuse on its outer side, h ahead of the leg, base underneath
  plateText('c·Δt/2', mx - G.s * (G.Hpx / hyp) * 12, my - (Math.abs(dx) / hyp) * 12 - 4, {
    color: C.pulse, align: G.s > 0 ? 'right' : 'left',
  });
  plateText('h = c·Δt₀/2', bx + G.s * 9, yT + G.Hpx * 0.3, {
    color: C.leg, align: G.s > 0 ? 'left' : 'right',
  });
  plateText('v·Δt/2', mx, yB + 21, { color: C.base });
}

function laneHeader(y, name, moving, state, tau) {
  const flash = state.ticks > 0 && state.phase < 0.14;
  text(ctx, name, 14, y + 15, { color: COLORS.text, size: 12, weight: 600 });
  ctx.save();
  ctx.font = font(12, { weight: 600 });
  const w = ctx.measureText(name).width;
  ctx.restore();
  text(ctx, moving ? '· շարժվում է' : '· անշարժ է', 14 + w + 6, y + 15, { color: COLORS.text3, size: 11 });
  const mono = { size: 12, family: 'mono', weight: 600 };
  text(ctx, `N = ${state.ticks}`, 14, y + 33, { ...mono, color: flash ? C.pulse : COLORS.text2 });
  text(ctx, `t = ${(tau * T0_NS).toFixed(1)} նվ`, 86, y + 33, { ...mono, color: COLORS.text2 });
}

function draw() {
  const G = geometry();
  const { W, H, laneH, Hpx, g, s, trainMoves } = G;
  if (!W) return;
  clear(ctx, W, H, COLORS.canvasBg);

  const lanes = {
    train: { y0: 0, yT: 50, yB: 50 + Hpx, moving: trainMoves },
    platform: { y0: laneH, yT: laneH + 50, yB: laneH + 50 + Hpx, moving: !trainMoves },
  };

  // --- ground: rails with sleepers (train lane), platform slab with tile seams
  const railY = lanes.train.yB + 27;
  groundMarks(G, railY + 1, railY + 8, 36, C.seam);
  line(ctx, 0, railY, W, railY, { color: COLORS.axis, width: 1.5 });
  line(ctx, 0, laneH + 0.5, W, laneH + 0.5, { color: COLORS.grid, width: 1 });
  const slabY = lanes.platform.yB + 12;
  ctx.fillStyle = C.ground;
  ctx.fillRect(0, slabY, W, H - slabY);
  groundMarks(G, slabY, slabY + 9, 48, C.seam);
  line(ctx, 0, slabY, W, slabY, { color: COLORS.axis, width: 1.5 });

  const movingX = G.toScreen(G.X(t));
  const out = {};

  for (const id of ['train', 'platform']) {
    const ln = lanes[id];
    const tau = ln.moving ? t / g : t;
    const st = pulse(tau);
    const cx = ln.moving ? movingX : W / 2;
    const squeeze = ln.moving ? 1 / g : 1;
    const py = ln.yB - st.y * Hpx;
    out[id] = tau;

    if (id === 'train') drawCar(G, cx, ln.yT, ln.yB, squeeze);
    drawClock(cx, ln.yT, ln.yB, squeeze, st, id === 'platform');

    // path of the pulse: the whole current pass for the moving clock,
    // the current half-tick for the clock at rest
    if (showTrail && t > 0) {
      const xOf = (tv) => (ln.moving ? G.toScreen(G.X(tv * g)) : cx);
      const tau0 = ln.moving && G.u > 1e-9 ? G.tIn / g : Math.floor(tau * 2 + 1e-9) / 2;
      drawTrail(pathVertices(tau0, tau).map((tv) => [xOf(tv), ln.yB - pulse(tv).y * Hpx]));
    }
    if (showTri && ln.moving) drawTriangle(G, tau, ln.yT, ln.yB);

    // velocity arrow ahead of the moving body
    if (ln.moving && beta > 0) {
      const edge = cx + s * ((id === 'train' ? G.carHW : 22) * squeeze + 8);
      const ay = ln.yB - Hpx * 0.2;
      arrow(ctx, edge, ay, edge + s * 34, ay, { color: C.car, width: 2, head: 8 });
      text(ctx, 'v', edge + s * 17, ay - 11, {
        color: C.car, size: 12, family: 'mono', weight: 700, style: 'italic', align: 'center',
      });
    }

    drawPulse(cx, py);
    laneHeader(ln.y0, id === 'train' ? 'Գնացքի ժամացույց' : 'Կառամատույցի ժամացույց', ln.moving, st, tau);
  }

  updateStats(out, g);
}

// ---------- γ(β) chart ----------
function drawChart() {
  const { ctx: c, width: W, height: H } = chart;
  if (!W) return;
  const padL = 38, padR = 16, padT = 14, padB = 32;
  const GMAX = 8;
  const px = (b) => padL + b * (W - padL - padR);
  const py = (g) => H - padB - ((g - 1) / (GMAX - 1)) * (H - padT - padB);
  clear(c, W, H, COLORS.canvasBg);

  const lbl = { color: COLORS.text3, size: 10, family: 'mono' };
  for (let g = 1; g <= GMAX; g++) {
    line(c, padL, py(g) + 0.5, W - padR, py(g) + 0.5, { color: COLORS.grid });
    text(c, String(g), padL - 7, py(g), { ...lbl, align: 'right' });
  }
  for (let i = 0; i <= 5; i++) {
    const b = i / 5;
    line(c, px(b) + 0.5, padT, px(b) + 0.5, H - padB, { color: COLORS.grid });
    text(c, b.toFixed(1), px(b), H - padB + 12, { ...lbl, align: 'center' });
  }
  line(c, padL + 0.5, padT, padL + 0.5, H - padB, { color: COLORS.axis });
  line(c, padL, H - padB + 0.5, W - padR, H - padB + 0.5, { color: COLORS.axis });
  line(c, px(1), padT, px(1), H - padB, { color: COLORS.text3, dash: [4, 4] });   // v = c
  text(c, 'γ', padL + 8, padT + 6, { color: COLORS.text2, size: 12, family: 'mono', weight: 600 });
  text(c, 'β = v/c', (padL + W - padR) / 2, H - 8, { color: COLORS.text2, size: 11, family: 'mono', align: 'center' });

  // curve
  const bMax = Math.sqrt(1 - 1 / (GMAX * GMAX));
  c.save();
  c.strokeStyle = COLORS.red;
  c.lineWidth = 2;
  c.lineJoin = 'round';
  c.beginPath();
  const n = 240;
  for (let i = 0; i <= n; i++) {
    // denser sampling near β → 1, where the curve is steep
    const b = bMax * (1 - (1 - i / n) ** 2);
    if (i) c.lineTo(px(b), py(gamma(b))); else c.moveTo(px(b), py(gamma(b)));
  }
  c.stroke();
  c.restore();

  // current point
  const g = gamma(beta);
  const x = px(beta), y = py(g);
  line(c, x, y, x, H - padB, { color: COLORS.text3, dash: [3, 3] });
  line(c, padL, y, x, y, { color: COLORS.text3, dash: [3, 3] });
  circle(c, x, y, 5, { fill: COLORS.red, stroke: COLORS.canvasBg, width: 2 });
  const right = beta < 0.55;
  text(c, `γ = ${g.toFixed(3)}`, x + (right ? 10 : -10), clamp(y - 13, padT + 8, H - padB - 12), {
    color: COLORS.text, size: 12, family: 'mono', weight: 600, align: right ? 'left' : 'right',
  });
}

// ---------- Stats ----------
const cache = {};
function put(id, html) {
  if (cache[id] === html) return;
  cache[id] = html;
  byId(id).innerHTML = html;
}
const group = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+$)/g, ' ');
const ns = (tau) => `${(tau * T0_NS).toFixed(1)} նվ`;

function example(g) {
  const lag = ((1 - 1 / g) * 100);
  if (beta === 0) {
    return 'Գնացքը կանգնած է. երկու ժամացույցներն ընթանում են միատեսակ (γ = 1)։ Մեծացրեք արագությունը։';
  }
  if (beta <= 0.1) {
    return `Այսպիսի արագության դեպքում դանդաղումը գրեթե աննկատ է. շարժվող ժամացույցը հետ է մնում ընդամենը ${lag.toFixed(lag < 0.1 ? 3 : 2)}%-ով։ `
      + '<b>GPS արբանյակները</b> շարժվում են շատ ավելի դանդաղ՝ ≈ 3.9 կմ/վ (β ≈ 0.000013), բայց նրանց ճշգրիտ ժամացույցները շարժման պատճառով օրական հետ են մնում մոտ 7 մկվ-ով, և դա պարտադիր հաշվի է առնվում։';
  }
  if (beta <= 0.5) {
    return `Շարժվող ժամացույցը հետ է մնում ${lag.toFixed(1)}%-ով։ `
      + '<b>Էլեկտրոնաճառագայթային խողովակով հին հեռուստացույցներում</b> էլեկտրոններն արագանում էին մինչև β ≈ 0.3. նրանց համար γ ≈ 1.05։';
  }
  if (beta < 0.85) {
    return `Մինչ անշարժ ժամացույցը տկտկում է 100 անգամ, շարժվողը հասցնում է տկտկալ միայն <b>${(100 / g).toFixed(0)}</b> անգամ։ `
      + 'β ≈ 0.87 արագության դեպքում γ = 2. շարժվող ժամացույցն ընթանում է ուղիղ երկու անգամ դանդաղ։';
  }
  if (beta < 0.95) {
    return `Եթե <b>տիեզերանավը</b> թռչեր այսպիսի արագությամբ, ապա նրա ժամացույցով անցած 1 տարվա ընթացքում Երկրի վրա կանցներ <b>${g.toFixed(2)}</b> տարի։`;
  }
  return '<b>Տիեզերական ճառագայթների մյուոնները</b> շարժվում են β ≈ 0.994 արագությամբ (γ ≈ 9)։ Նրանց կյանքի միջին տևողությունը՝ 2.2 մկվ, Երկրի հետ կապված համակարգում երկարում է մինչև ≈ 20 մկվ, ուստի նրանք հասցնում են հասնել Երկրի մակերևույթին։ '
    + `Ընտրված արագության դեպքում γ = ${g.toFixed(2)}։`;
}

function updateStats(tau, g) {
  put('sV', `${group(beta * C_KMS)} կմ/վ`);
  put('sGamma', g.toFixed(3));
  put('sT0', `${T0_NS.toFixed(2)} նվ`);
  put('sT', `${(g * T0_NS).toFixed(2)} նվ`);
  put('sPlat', ns(tau.platform));
  put('sTrain', ns(tau.train));
  const rest = frame === 'platform' ? tau.platform : tau.train;
  const moving = frame === 'platform' ? tau.train : tau.platform;
  put('sRatioLabel', frame === 'platform'
    ? 'Հարաբերություն՝ կառամատույց / գնացք'
    : 'Հարաբերություն՝ գնացք / կառամատույց');
  put('sRatio', moving > 0 ? (rest / moving).toFixed(3) : '—');
  put('example', example(g));
}

// ---------- Controls ----------
bindRange('beta', {
  format: (v) => v.toFixed(2),
  onInput: (v) => { beta = v; restart(); chartDirty = true; },
});
bindSegmented('frame', { onChange: (v) => { frame = v; restart(); } });
bindSegmented('speed', { onChange: (v) => { speed = parseFloat(v); } });
bindCheckbox('trail', { onChange: (on) => { showTrail = on; } });
bindCheckbox('triangle', { onChange: (on) => { showTri = on; } });
bindPlayPause('playBtn', { onChange: (p) => { paused = p; } });
onClick('resetBtn', restart);

onThemeChange(() => { chartDirty = true; });
fontsReady().then(() => { chartDirty = true; });

// ---------- Loop ----------
startLoop((dt) => {
  if (!paused) t += dt * speed * RATE;
  draw();
  if (chartDirty) { chartDirty = false; drawChart(); }
});
