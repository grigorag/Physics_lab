// Spacetime (Minkowski) diagram.
//
// Events and world lines are stored in S coordinates (x in light-seconds,
// t in seconds, c = 1). The picture is drawn in a "display frame" obtained
// from S by a boost of rapidity φd = e(u)·artanh β, where u goes 0 → 1 when
// the view switches from S to S′. A frame of rapidity φ (S: 0, S′: artanh β)
// then has the basis vectors (cosh r, sinh r), (sinh r, cosh r) with
// r = φ − φd, which gives axes, grid and correctly calibrated ticks at once.

import { fluidCanvas, onDrag } from '../../../assets/js/core/canvas.js';
import { startLoop } from '../../../assets/js/core/loop.js';
import { bindRange, bindCheckbox, bindSegmented, onClick } from '../../../assets/js/core/controls.js';
import { byId, $$, setText, setHTML } from '../../../assets/js/core/dom.js';
import { clear, line, arrow, circle, text } from '../../../assets/js/core/draw.js';
import { COLORS, themed, alpha, onThemeChange, fontsReady, font } from '../../../assets/js/core/theme.js';
import { clamp } from '../../../assets/js/core/math.js';
import { gamma, rapidity, boost, boostPhi, pair, EPS } from './physics.js';

const P = themed(() => ({
  s: COLORS.text2,
  sGrid: alpha(COLORS.text3, 0.22),
  sp: COLORS.red,
  spGrid: alpha(COLORS.red, 0.3),
  light: COLORS.amber,
  cone: alpha(COLORS.amber, 0.08),
  hyp: COLORS.purple,
  ev: COLORS.teal,
  rod: COLORS.blue,
}));

const MAX_EVENTS = 8;
const LETTERS = 'ABCDEFGH';
const SNAP = 0.25;
const ROD_L0 = 2;          // rest length of the rod (it is at rest in S), light-seconds

// ---------- State ----------
const state = {
  beta: 0.6,
  target: 0,               // 0: S view, 1: S′ view
  u: 0,                    // animated view parameter
  R: 5,                    // half-height of the diagram, light-seconds
  events: [],              // { id, x, t } in S
  lines: [],               // world lines x = x0 (objects at rest in S)
  sel: null,
  sel2: null,
  preset: null,
};
let drawDirty = true;
let infoDirty = true;
const redraw = () => { drawDirty = true; };
const refresh = () => { drawDirty = true; infoDirty = true; };

const view = fluidCanvas(byId('cv'), {
  height: (w) => clamp(Math.min(w, 620), 320, 620),
  onResize: redraw,
});
const { ctx } = view;

// ---------- Formatting ----------
const num = (v, d = 2) => (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d).replace('-', '−');
const paren = (v, d = 2) => (v < -0.5 * 10 ** -d ? `(${num(v, d)})` : num(v, d));
const LS = 'լ.վ';
const SEC = 'վ';

// ---------- Display transform ----------
const ease = (u) => u * u * (3 - 2 * u);
const phiS1 = () => rapidity(state.beta);
const phiD = () => ease(state.u) * phiS1();

let geo = { cx: 0, cy: 0, s: 1 };
function layout() {
  const { width: W, height: H } = view;
  geo = { cx: W / 2, cy: H / 2, s: H / (2 * state.R) };
}
const toPx = (X, T) => ({ x: geo.cx + X * geo.s, y: geo.cy - T * geo.s });
const evPx = (e) => { const d = boostPhi(e.x, e.t, phiD()); return toPx(d.x, d.t); };

// ---------- Events ----------
const find = (id) => state.events.find((e) => e.id === id) || null;
const freeLetter = () => [...LETTERS].find((l) => !find(l));

function addEvent(x, t) {
  const id = freeLetter();
  if (!id) return null;
  const ev = { id, x, t };
  state.events.push(ev);
  state.events.sort((a, b) => a.id.localeCompare(b.id));
  if (state.sel && state.sel !== id) state.sel2 = state.sel;
  state.sel = id;
  return ev;
}

/** Snap a display-frame point to the grid of the frame that is (nearly) orthogonal now. */
function fromDisplay(X, T, snap) {
  let s = boostPhi(X, T, -phiD());
  if (!snap) return s;
  const q = (v) => Math.round(v / SNAP) * SNAP;
  if (state.u < 0.5) return { x: q(s.x), t: q(s.t) };
  const p = boost(s.x, s.t, state.beta);
  s = boost(q(p.x), q(p.t), -state.beta);
  return s;
}

const PRESETS = {
  simul: (b) => ({ events: [['A', -1, 1], ['B', 2, 1]], lines: [], sel: 'A', sel2: 'B' }),
  place: (b) => ({ events: [['A', 0, 0], ['B', 0, 2]], lines: [], sel: 'A', sel2: 'B' }),
  light: (b) => ({ events: [['A', 0, 0], ['B', 2, 2]], lines: [], sel: 'A', sel2: 'B' }),
  // Rod at rest in S between x = 0 and x = L0. A, B: its ends at t = 0 (simultaneous in S);
  // C: the right end at t′ = 0, i.e. on the x′ axis (simultaneous with A in S′).
  rod: (b) => ({
    events: [['A', 0, 0], ['B', ROD_L0, 0], ['C', ROD_L0, b * ROD_L0]],
    lines: [0, ROD_L0], sel: 'A', sel2: 'C',
  }),
};

function applyPreset(name, keepSelection = false) {
  const p = PRESETS[name](state.beta);
  state.events = p.events.map(([id, x, t]) => ({ id, x, t }));
  state.lines = p.lines;
  if (!keepSelection) { state.sel = p.sel; state.sel2 = p.sel2; }
  state.preset = name;
  syncUI();
  refresh();
}

function customised() {
  if (state.preset) { state.preset = null; syncUI(); }
}

// ---------- Controls ----------
const betaCtl = bindRange('beta', {
  format: (v) => num(v),
  onInput: (v) => {
    state.beta = v;
    if (state.preset === 'rod') applyPreset('rod', true);
    refresh();
  },
});
bindRange('zoom', { format: (v) => `±${v} ${LS}`, onInput: (v) => { state.R = v; redraw(); } });
bindSegmented('view', { onChange: (v) => { state.target = v === 'Sp' ? 1 : 0; redraw(); } });
const show = {
  cone: bindCheckbox('showCone', { onChange: redraw }),
  grid: bindCheckbox('showGrid', { onChange: redraw }),
  hyp: bindCheckbox('showHyp', { onChange: redraw }),
  proj: bindCheckbox('showProj', { onChange: redraw }),
};
const snapCtl = bindCheckbox('snap');

const sel1El = byId('sel1');
const sel2El = byId('sel2');
sel1El.addEventListener('change', () => select(sel1El.value));
sel2El.addEventListener('change', () => { state.sel2 = sel2El.value || null; syncUI(); refresh(); });

function select(id) {
  if (id === state.sel) return;
  if (id === state.sel2) state.sel2 = state.sel;     // swap roles
  state.sel = id;
  syncUI();
  refresh();
}

function syncUI() {
  if (!find(state.sel)) state.sel = state.events[0]?.id ?? null;
  if (!find(state.sel2) || state.sel2 === state.sel) state.sel2 = null;
  const opt = (v, label, on) => `<option value="${v}"${on ? ' selected' : ''}>${label}</option>`;
  sel1El.innerHTML = state.events.length
    ? state.events.map((e) => opt(e.id, e.id, e.id === state.sel)).join('')
    : opt('', '—', true);
  sel2El.innerHTML = opt('', '—', !state.sel2)
    + state.events.filter((e) => e.id !== state.sel).map((e) => opt(e.id, e.id, e.id === state.sel2)).join('');
  sel1El.disabled = !state.events.length;
  sel2El.disabled = state.events.length < 2;
  byId('addBtn').disabled = state.events.length >= MAX_EVENTS;
  byId('delBtn').disabled = !state.sel;
  byId('clearBtn').disabled = !state.events.length && !state.lines.length;
  $$('#presets button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === state.preset)));
}

onClick('addBtn', () => {
  // First free spot from a fixed list of display-frame positions.
  const k = state.R / 5;
  const spots = [[1, 1], [-1, 2], [2, -1], [-2, -1], [1, 3], [3, 1], [-3, 1], [-1, -3], [3, 3], [0, -2]];
  const taken = (X, T) => state.events.some((e) => {
    const d = boostPhi(e.x, e.t, phiD());
    return Math.hypot(d.x - X, d.t - T) < 0.4 * k;
  });
  const q = (v) => Math.round(v * k / SNAP) * SNAP;
  const [X, T] = (spots.find(([a, b]) => !taken(q(a), q(b))) ?? [0.5, 0.5]).map(q);
  const s = fromDisplay(X, T, snapCtl.checked);
  if (addEvent(s.x, s.t)) { customised(); syncUI(); refresh(); }
});

function deleteSelected() {
  if (!state.sel) return;
  state.events = state.events.filter((e) => e.id !== state.sel);
  state.sel = state.sel2;
  state.sel2 = null;
  customised();
  syncUI();
  refresh();
}
onClick('delBtn', deleteSelected);
onClick('clearBtn', () => {
  state.events = [];
  state.lines = [];
  state.sel = state.sel2 = null;
  state.preset = null;
  syncUI();
  refresh();
});
$$('#presets button').forEach((b) => b.addEventListener('click', () => applyPreset(b.dataset.preset)));
window.addEventListener('keydown', (e) => {
  if ((e.key === 'Delete' || e.key === 'Backspace') && !/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) {
    deleteSelected();
  }
});

// ---------- Pointer ----------
let dragging = null;
let lastTap = { time: 0, x: 0, y: 0 };

function hit(p, radius) {
  let best = null;
  let bestD = radius;
  for (const e of state.events) {
    const q = evPx(e);
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

function pxToEvent(p) {
  const { width: W, height: H } = view;
  const x = clamp(p.x, 8, W - 8);
  const y = clamp(p.y, 8, H - 8);
  return fromDisplay((x - geo.cx) / geo.s, (geo.cy - y) / geo.s, snapCtl.checked);
}

onDrag(view, {
  start(p, e) {
    const ev = hit(p, e.pointerType === 'touch' ? 26 : 15);
    if (ev) {
      lastTap.time = 0;
      if (e.shiftKey) {
        if (ev.id !== state.sel) { state.sel2 = ev.id; syncUI(); refresh(); }
        return false;
      }
      select(ev.id);
      dragging = ev;
      return true;
    }
    const now = performance.now();
    if (now - lastTap.time < 420 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 26) {
      lastTap.time = 0;
      const s = pxToEvent(p);
      const added = addEvent(s.x, s.t);
      if (added) { customised(); syncUI(); refresh(); dragging = added; return true; }
      return false;
    }
    lastTap = { time: now, x: p.x, y: p.y };
    return false;
  },
  move(p) {
    if (!dragging) return;
    const s = pxToEvent(p);
    if (s.x === dragging.x && s.t === dragging.t) return;
    dragging.x = s.x;
    dragging.t = s.t;
    customised();
    refresh();
  },
  end() { dragging = null; },
});

// ---------- Drawing ----------
function halo(str, x, y, opts) {
  ctx.save();
  ctx.font = font(opts.size ?? 12, { weight: opts.weight ?? 500, family: opts.family ?? 'sans', style: opts.style ?? '' });
  ctx.textAlign = opts.align ?? 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = COLORS.canvasBg;
  ctx.strokeText(str, x, y);
  ctx.restore();
  text(ctx, str, x, y, { align: 'center', ...opts });
}

/** Distance from the centre to the padded view box along the unit direction (dx, dy). */
function reach(dx, dy, pad) {
  const { width: W, height: H } = view;
  const tx = dx > 1e-9 ? (W - pad - geo.cx) / dx : dx < -1e-9 ? (pad - geo.cx) / dx : Infinity;
  const ty = dy > 1e-9 ? (H - pad - geo.cy) / dy : dy < -1e-9 ? (pad - geo.cy) / dy : Infinity;
  return Math.min(tx, ty);
}

/** Basis of a frame whose rapidity relative to the display frame is r (display units). */
const basis = (r) => ({ ex: { X: Math.cosh(r), T: Math.sinh(r) }, et: { X: Math.sinh(r), T: Math.cosh(r) } });

function drawGrid(r, color) {
  const { ex, et } = basis(r);
  const span = (view.width / geo.s / 2 + state.R) * Math.exp(Math.abs(r));
  const N = Math.min(Math.ceil(span), 220);
  const L = 4 * span + 10;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let n = -N; n <= N; n++) {
    if (n === 0) continue;
    for (const [a, b] of [[ex, et], [et, ex]]) {
      const p1 = toPx(n * a.X - L * b.X, n * a.T - L * b.T);
      const p2 = toPx(n * a.X + L * b.X, n * a.T + L * b.T);
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
    }
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Axes of a frame with unit ticks. `inner` puts the labels between the axes
 * (used for the skewed frame so that the two sets of numbers do not collide).
 */
function drawAxes(r, color, names, inner, labels) {
  const { ex, et } = basis(r);
  const axes = [
    { v: ex, name: names[0], kind: 'x' },
    { v: et, name: names[1], kind: 't' },
  ];
  const step = geo.s * Math.hypot(ex.X, ex.T) < 24 ? 2 : 1;
  for (const { v, name, kind } of axes) {
    const len = Math.hypot(v.X, v.T);
    const dx = v.X / len;
    const dy = -v.T / len;
    const a = reach(dx, dy, 10);
    const b = reach(-dx, -dy, 4);
    arrow(ctx, geo.cx - dx * b, geo.cy - dy * b, geo.cx + dx * a, geo.cy + dy * a, { color, width: 1.6, head: 9 });

    // Label side: x axis → below, t axis → left (outer); mirrored for `inner`.
    let nx = -dy;
    let ny = dx;
    if (kind === 'x' ? ny < 0 : nx > 0) { nx = -nx; ny = -ny; }
    if (inner) { nx = -nx; ny = -ny; }

    const unit = geo.s * len;                       // px per unit along this axis
    const nMax = Math.floor((a - 30) / unit);
    const nMin = -Math.floor((b - 12) / unit);
    for (let n = nMin; n <= nMax; n++) {
      if (n === 0) continue;
      const px = geo.cx + dx * unit * n;
      const py = geo.cy + dy * unit * n;
      line(ctx, px - nx * 3.5, py - ny * 3.5, px + nx * 3.5, py + ny * 3.5, { color, width: 1.4 });
      if (labels && n % step === 0) {
        halo(String(n).replace('-', '−'), px + nx * 12, py + ny * 12, { color, size: 10, family: 'mono' });
      }
    }
    halo(name, geo.cx + dx * (a - 12) + nx * 14, geo.cy + dy * (a - 12) + ny * 14,
      { color, size: 13, weight: 700, style: 'italic', family: 'display' });
  }
}

function drawCone() {
  const { cx, cy } = geo;
  const M = view.width + view.height;
  if (show.cone.checked) {
    ctx.fillStyle = P.cone;
    ctx.beginPath();
    ctx.moveTo(cx, cy); ctx.lineTo(cx - M, cy - M); ctx.lineTo(cx + M, cy - M); ctx.closePath();
    ctx.moveTo(cx, cy); ctx.lineTo(cx - M, cy + M); ctx.lineTo(cx + M, cy + M); ctx.closePath();
    ctx.fill();
    line(ctx, cx - M, cy + M, cx + M, cy - M, { color: P.light, width: 1.6 });
    line(ctx, cx - M, cy - M, cx + M, cy + M, { color: P.light, width: 1.6 });
  }
}

function drawConeLabels(skew) {
  if (!show.cone.checked) return;
  const { width: W, height: H } = view;
  const sg = skew < 0 ? -1 : 1;
  const o = { color: COLORS.text3, size: 11, weight: 600 };
  const hy = H * 0.5 - 30;
  halo('ապագա', geo.cx - sg * hy * 0.33, geo.cy - hy + 6, o);
  halo('անցյալ', geo.cx + sg * hy * 0.33, geo.cy + hy - 6, o);
  const hx = Math.min(W * 0.5 - 38, hy * 1.5);
  halo('այլուր', geo.cx + hx, geo.cy + sg * hx * 0.3, o);
  halo('այլուր', geo.cx - hx, geo.cy - sg * hx * 0.3, o);
}

function drawHyperbolas() {
  const qMax = Math.acosh(Math.max(2, (view.width / geo.s / 2 + state.R)));
  const n = 60;
  ctx.save();
  ctx.strokeStyle = alpha(P.hyp, 0.85);
  ctx.lineWidth = 1.3;
  ctx.setLineDash([5, 4]);
  for (const f of [
    (q) => [Math.cosh(q), Math.sinh(q)], (q) => [-Math.cosh(q), Math.sinh(q)],
    (q) => [Math.sinh(q), Math.cosh(q)], (q) => [Math.sinh(q), -Math.cosh(q)],
  ]) {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const [X, T] = f(-qMax + (2 * qMax * i) / n);
      const p = toPx(X, T);
      if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawWorldLines() {
  if (!state.lines.length) return;
  const far = 400;
  const ends = state.lines.map((x0) => {
    const a = boostPhi(x0, -far, phiD());
    const b = boostPhi(x0, far, phiD());
    return [toPx(a.x, a.t), toPx(b.x, b.t)];
  });
  if (ends.length === 2) {
    ctx.fillStyle = alpha(P.rod, 0.1);
    ctx.beginPath();
    ctx.moveTo(ends[0][0].x, ends[0][0].y);
    ctx.lineTo(ends[0][1].x, ends[0][1].y);
    ctx.lineTo(ends[1][1].x, ends[1][1].y);
    ctx.lineTo(ends[1][0].x, ends[1][0].y);
    ctx.closePath();
    ctx.fill();
  }
  for (const [a, b] of ends) line(ctx, a.x, a.y, b.x, b.y, { color: P.rod, width: 2 });
  // caption on the band, in the lower part of the diagram
  const d = boostPhi((state.lines[0] + state.lines[state.lines.length - 1]) / 2, 0, phiD());
  const bd = Math.tanh(-phiD());                    // the rod's velocity in the display frame
  const T = -state.R * 0.62;
  const p = toPx(d.x / 1 + bd * (T - d.t), T);
  halo('ձող', p.x, p.y, { color: P.rod, size: 11, weight: 600 });
}

function drawProjections(e, r, color) {
  const { ex, et } = basis(r);
  const d = boostPhi(e.x, e.t, phiD());
  // frame coordinates (a, b): d = a·ex + b·et
  const a = d.x * Math.cosh(r) - d.t * Math.sinh(r);
  const b = d.t * Math.cosh(r) - d.x * Math.sinh(r);
  const p = toPx(d.x, d.t);
  const fx = toPx(a * ex.X, a * ex.T);
  const ft = toPx(b * et.X, b * et.T);
  const o = { color: alpha(color, 0.9), width: 1.2, dash: [4, 4] };
  line(ctx, p.x, p.y, fx.x, fx.y, o);
  line(ctx, p.x, p.y, ft.x, ft.y, o);
  circle(ctx, fx.x, fx.y, 3, { fill: color });
  circle(ctx, ft.x, ft.y, 3, { fill: color });
}

function draw() {
  layout();
  const { width: W, height: H } = view;
  clear(ctx, W, H);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();

  const rS = -phiD();                 // S relative to the display frame
  const rP = phiS1() - phiD();        // S′ relative to the display frame
  const same = Math.abs(rP - rS) < 0.012;         // β ≈ 0: the frames coincide
  const sIsStraight = Math.abs(rS) <= Math.abs(rP);
  const skew = sIsStraight ? rP : rS;

  drawCone();
  drawGrid(rS, P.sGrid);
  if (show.grid.checked && !same) drawGrid(rP, P.spGrid);
  drawConeLabels(same ? 1 : skew);
  drawWorldLines();
  if (show.hyp.checked) drawHyperbolas();

  // skewed frame first, the straight one on top
  const axS = () => drawAxes(rS, P.s, ['x', 'ct'], !sIsStraight && !same, true);
  const axP = () => drawAxes(rP, P.sp, ['x′', 'ct′'], sIsStraight || same, !same);
  if (sIsStraight) { axP(); axS(); } else { axS(); axP(); }

  const e1 = find(state.sel);
  const e2 = find(state.sel2);
  if (e1 && e2) {
    const a = evPx(e1);
    const b = evPx(e2);
    line(ctx, a.x, a.y, b.x, b.y, { color: alpha(P.ev, 0.75), width: 2 });
  }
  if (e1 && show.proj.checked) {
    drawProjections(e1, rS, P.s);
    if (!same) drawProjections(e1, rP, P.sp);
  }

  for (const e of state.events) {
    const p = evPx(e);
    const isSel = e.id === state.sel;
    const isSel2 = e.id === state.sel2;
    if (isSel) circle(ctx, p.x, p.y, 10.5, { stroke: COLORS.text, width: 1.6 });
    if (isSel2) {
      ctx.save();
      ctx.setLineDash([3, 3]);
      circle(ctx, p.x, p.y, 10.5, { stroke: COLORS.text2, width: 1.4 });
      ctx.restore();
    }
    circle(ctx, p.x, p.y, 6, { fill: P.ev, stroke: COLORS.canvasBg, width: 1.5 });
    const lx = clamp(p.x + 14, 10, W - 10);
    const ly = clamp(p.y - 14, 10, H - 10);
    halo(e.id, lx, ly, { color: COLORS.text, size: 13, weight: 700 });
  }
  ctx.restore();
}

// ---------- Readouts ----------
function updateInfo() {
  const b = state.beta;
  const g = gamma(b);
  setText('sGamma', num(g, 3));
  setText('sAngle', `${num(Math.atan(Math.abs(b)) * 180 / Math.PI, 1)}°`);

  const e1 = find(state.sel);
  const e2 = find(state.sel2);
  // the pair is always reported in alphabetical order (A → B), whichever was picked first
  const [p1, p2] = e1 && e2 && e2.id < e1.id ? [e2, e1] : [e1, e2];

  if (!e1) {
    setText('evTitle', 'Իրադարձություն');
    setHTML('evInfo', '<span class="muted">Իրադարձություն չկա։ Ավելացրեք՝ դիագրամի վրա կրկնակի սեղմելով կամ «+ Իրադարձություն» կոճակով։</span>');
  } else {
    const p = boost(e1.x, e1.t, b);
    setText('evTitle', `Իրադարձություն ${e1.id}`);
    setHTML('evInfo',
      `S.&nbsp; x = <b>${num(e1.x)} ${LS}</b>, t = <b>${num(e1.t)} ${SEC}</b><br>`
      + `<span class="fp">S′.</span> x′ = <b>${num(p.x)} ${LS}</b>, t′ = <b>${num(p.t)} ${SEC}</b><br>`
      + `x′ = γ(x − βct) = ${num(g, 3)}·(${num(e1.x)} − ${paren(b)}·${paren(e1.t)}) = ${num(p.x)}<br>`
      + `ct′ = γ(ct − βx) = ${num(g, 3)}·(${num(e1.t)} − ${paren(b)}·${paren(e1.x)}) = ${num(p.t)}`);
  }

  if (!e1 || !e2) {
    setText('pairTitle', 'Իրադարձությունների զույգ');
    setHTML('pairInfo', '<span class="muted">Ինտերվալը տեսնելու համար ընտրեք երկրորդ իրադարձությունը՝ Shift ստեղնը սեղմած կամ «Երկրորդը (զույգ)» ցուցակից։</span>');
  } else {
    const q = pair(p1, p2, b);
    const A = p1.id;
    const B = p2.id;
    const order = (dt) => (Math.abs(dt) < EPS ? 'միաժամանակ են'
      : dt > 0 ? `${A}-ն ${B}-ից շուտ է` : `${B}-ն ${A}-ից շուտ է`);
    let verdict;
    if (q.kind === 'time') {
      verdict = `<b>Ժամանականման ինտերվալ</b> (s² &gt; 0). հերթականությունը նույնն է բոլոր համակարգերում, այն շրջել հնարավոր չէ։ `
        + `Իրադարձությունները կարող են կապված լինել որպես պատճառ և հետևանք։ `
        + `${inFrame(q.betaRest)} դրանք տեղի են ունենում նույն կետում՝ ${num(Math.sqrt(q.s2))} ${SEC} ընդմիջումով (սեփական ժամանակ)։`;
    } else if (q.kind === 'space') {
      verdict = `<b>Տարածանման ինտերվալ</b> (s² &lt; 0). հերթականությունը կախված է հաշվարկման համակարգից։ `
        + `${inFrame(q.betaSim)} իրադարձությունները միաժամանակ են, իսկ β-ի այդ արժեքի տարբեր կողմերում դրանց հերթականությունը հակառակ է։ `
        + `Պատճառահետևանքային կապ դրանց միջև լինել չի կարող։`;
    } else {
      verdict = `<b>Լուսանման ինտերվալ</b> (s² = 0). իրադարձությունները կարող է կապել միայն լուսային ազդանշանը։ `
        + `Հերթականությունը նույնն է բոլոր համակարգերում, և զույգը միացնող հատվածը երկու տեսքում էլ 45° թեքություն ունի։`;
    }
    setText('pairTitle', `Զույգ ${A} → ${B}`);
    setHTML('pairInfo',
      `S.&nbsp; Δx = <b>${num(q.dx)} ${LS}</b>, Δt = <b>${num(q.dt)} ${SEC}</b><br>`
      + `<span class="fp">S′.</span> Δx′ = <b>${num(q.dxp)} ${LS}</b>, Δt′ = <b>${num(q.dtp)} ${SEC}</b><br>`
      + `s² = (cΔt)² − Δx² = ${paren(q.dt)}² − ${paren(q.dx)}² = <b>${num(q.s2)} ${LS}²</b><br>`
      + `<span class="fp">s′²</span> = (cΔt′)² − Δx′² = ${paren(q.dtp)}² − ${paren(q.dxp)}² = <b>${num(q.s2p)} ${LS}²</b>`
      + `<div class="verdict">S-ում՝ ${order(q.dt)}, S′-ում՝ ${order(q.dtp)}։<br>${verdict}</div>`);
  }

  setHTML('note', noteText(b, g));
}

const inFrame = (v) => (Math.abs(v) < 0.005 ? 'S համակարգում'
  : `S-ի նկատմամբ β = ${num(v)} արագությամբ շարժվող համակարգում`);

function noteText(b, g) {
  switch (state.preset) {
    case 'simul':
      return `<b>Միաժամանակության հարաբերականություն։</b> A-ն և B-ն S-ում միաժամանակ են (Δt = 0), բայց տեղի են ունենում տարբեր կետերում (Δx = 3 ${LS})։ `
        + `S′-ում Δt′ = −γβΔx/c = <b>${num(-g * b * 3)} ${SEC}</b>${Math.abs(b) < 0.005 ? '' : '. դրանք այլևս միաժամանակ չեն'}։ `
        + `S′-ում միաժամանակ են այն իրադարձությունները, որոնք գտնվում են x′ առանցքին զուգահեռ ուղղի վրա։`;
    case 'place':
      return `<b>Ժամանակի դանդաղում։</b> A-ն և B-ն S-ում տեղի են ունենում նույն կետում (օրինակ՝ նույն ժամացույցի երկու զարկերը). Δt = τ₀ = 2 ${SEC} սեփական ժամանակն է։ `
        + `S′-ում, որի նկատմամբ ժամացույցը շարժվում է, Δt′ = γτ₀ = <b>${num(2 * g)} ${SEC}</b>, և իրադարձությունները տեղի են ունենում տարբեր կետերում (Δx′ = ${num(-g * b * 2)} ${LS})։`;
    case 'light':
      return `<b>Լուսային ազդանշան։</b> A կետից արձակված լույսը հասնում է B. Δx = cΔt, ուստի s² = 0։ `
        + `S′-ում Δx′ = ${num(g * (2 - b * 2))} ${LS}, Δt′ = ${num(g * (2 - b * 2))} ${SEC}. նորից Δx′ = cΔt′։ Լույսի արագությունը նույնն է երկու համակարգերում, և AB հատվածը երկու տեսքում էլ մնում է 45° թեքությամբ։`;
    case 'rod':
      return `<b>Երկարության կրճատում։</b> Ձողն անշարժ է S-ում. նրա ծայրերի աշխարհագծերն են x = 0 և x = ${ROD_L0} ${LS}, սեփական երկարությունը՝ L₀ = Δx(A, B) = ${ROD_L0} ${LS}։ `
        + `S′-ի նկատմամբ ձողը շարժվում է, և նրա երկարությունը ծայրերի հեռավորությունն է S′-ի <em>միևնույն</em> պահին, այսինքն՝ x′ առանցքի AC հատվածը. `
        + `L = Δx′(A, C) = L₀/γ = <b>${num(ROD_L0 / g)} ${LS}</b>։ S-ում A-ն և C-ն միաժամանակ չեն։`;
    default:
      return 'Ավելացրեք իրադարձություններ, տեղափոխեք դրանք և փոխեք β-ն. S համակարգում իրադարձության կոորդինատները չեն փոխվում, իսկ S′-ի առանցքներն ու ցանցը թեքվում են։ Ընտրեք զույգ և համեմատեք Δx, Δt և s² մեծությունները երկու համակարգերում։';
  }
}

// ---------- Loop ----------
startLoop((dt) => {
  if (state.u !== state.target) {
    const dir = Math.sign(state.target - state.u);
    state.u = clamp(state.u + dir * dt / 1.1, 0, 1);
    if ((state.target - state.u) * dir <= 0) state.u = state.target;
    drawDirty = true;
  }
  if (infoDirty) { infoDirty = false; updateInfo(); }
  if (drawDirty) { drawDirty = false; draw(); }
});

onThemeChange(redraw);
fontsReady().then(redraw);
betaCtl.render();
applyPreset('simul');
