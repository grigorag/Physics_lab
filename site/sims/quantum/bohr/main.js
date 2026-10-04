// Bohr model of the hydrogen atom: three coordinated views —
// the atom (orbits, electron, photons), the energy-level diagram (to scale)
// and the accumulated emission spectrum. Physics lives in physics.js.

import { fluidCanvas, pointerPos } from '../../../assets/js/core/canvas.js';
import { bindRange, bindSegmented, bindCheckbox, onClick } from '../../../assets/js/core/controls.js';
import { byId, setText, setHTML } from '../../../assets/js/core/dom.js';
import { startLoop } from '../../../assets/js/core/loop.js';
import { clear, line, arrow, circle, text, roundRect } from '../../../assets/js/core/draw.js';
import { COLORS, alpha, onThemeChange, currentTheme, font, fontsReady } from '../../../assets/js/core/theme.js';
import { wavelengthToRGB, rgba } from '../../../assets/js/core/color.js';
import { clamp, lerp, TAU } from '../../../assets/js/core/math.js';
import {
  N_MAX, RYDBERG_EV, REGION, VISIBLE_MIN, VISIBLE_MAX,
  energy, radius, speed, relOmega, transition, rydbergFraction, randomLower, randomExcited,
} from './physics.js';

// ---------- Animation constants (seconds / pixels at speed ×1) ----------
const OMEGA_1 = TAU * 1.2;     // angular speed on n = 1; other levels ∝ 1/n³
const T_JUMP = 0.4;            // electron moving between orbits
const T_SETTLE = 0.3;          // pause after a jump
const PHOTON_SPEED = 300;      // px/s
const PHOTON_LEN = 54;         // length of the drawn wave packet
const AUTO_PAUSE = 0.55;       // pause between spontaneous steps
const WAVE_FREQ = 0.7;         // standing-wave oscillation, Hz
const ORBIT_POWER = 1.3;       // drawn radius ∝ n^1.3 (true radius ∝ n²)

const SERIES = [null, 'Լայմանի', 'Բալմերի', 'Պաշենի', 'Բրեքեթի', 'Պֆունդի'];
const SERIES_SHORT = [null, 'Լայման', 'Բալմեր', 'Պաշեն', 'Բրեքեթ', 'Պֆունդ'];
const BALMER_NAMES = { 3: 'α', 4: 'β', 5: 'γ', 6: 'δ' };
const MINUS = '−';

// ---------- State ----------
const state = {
  n: 1,            // level the electron is on
  nVis: 1,         // drawn (animated) level
  theta: -0.6,     // electron angle
  waveT: 0,
  tr: null,        // running transition { from, to, kind, phase, t, ... }
  photons: [],     // emitted photons flying away
  auto: false,
  autoWait: 0,
  last: null,      // last transition { from, to }
  hover: 0,        // level under the pointer in the diagram
};
const lines = new Map();    // emitted spectral lines: 'hi-lo' → { hi, lo, count }
const arrows = new Map();   // transitions made: 'hi-lo' → { hi, lo, down, up }
let dirty = true;           // diagram + spectrum need a redraw

// ---------- Formatting ----------
const signed = (v, d) => (v < 0 ? MINUS : '') + Math.abs(v).toFixed(d);
function sci(v, digits = 2) {
  const e = Math.floor(Math.log10(v));
  return `${(v / 10 ** e).toFixed(digits)}·10<sup>${e}</sup>`;
}
const fmtLambda = (l) => (l < 1000 ? l.toFixed(1) : l.toFixed(0));

function colorName(l) {
  if (l < 425) return 'մանուշակագույն';
  if (l < 470) return 'կապույտ';
  if (l < 500) return 'երկնագույն';
  if (l < 570) return 'կանաչ';
  if (l < 590) return 'դեղին';
  if (l < 625) return 'նարնջագույն';
  return 'կարմիր';
}
const regionShort = (tr) => (tr.region === REGION.UV ? 'ՈՒՄ' : tr.region === REGION.IR ? 'ԻԿ' : '');

/** Photon colour. `dark` = drawn on a dark background. */
function photonColor(tr, dark = currentTheme() === 'dark', a = 1) {
  if (tr.region === REGION.UV) return alpha(dark ? '#b3a6e0' : '#7667ad', a);
  if (tr.region === REGION.IR) return alpha(dark ? '#c24a3c' : '#8f231c', a);
  const rgb = wavelengthToRGB(tr.lambda);
  return rgba(dark ? rgb : rgb.map((c) => Math.round(c * 0.8)), a);
}

// ---------- Canvases ----------
const square = (w) => Math.round(clamp(w, 300, 460));
const atom = fluidCanvas(byId('atom'), { height: square });
const levels = fluidCanvas(byId('levels'), { height: square, onResize: () => { dirty = true; } });
const spectrum = fluidCanvas(byId('spectrum'), { height: () => 128, onResize: () => { dirty = true; } });

// ---------- Controls ----------
const fromCtl = bindSegmented('from', { onChange: (v) => placeElectron(+v) });
const toCtl = bindSegmented('to', { onChange: syncGoBtn });
const waveCtl = bindCheckbox('wave');
const speedCtl = bindRange('speed', { format: (v) => `×${v.toFixed(2)}` });
const goBtn = byId('goBtn');
const autoBtn = byId('autoBtn');

onClick('goBtn', () => { setAuto(false); startTransition(+toCtl.value); });
onClick('autoBtn', () => setAuto(!state.auto));
onClick('lymanBtn', () => showSeries(1));
onClick('balmerBtn', () => showSeries(2));
onClick('paschenBtn', () => showSeries(3));
onClick('clearBtn', clearRecords);
onClick('resetBtn', () => {
  setAuto(false);
  clearRecords();
  placeElectron(1);
  toCtl.set(3, { silent: true });
  syncGoBtn();
});

function setAuto(on) {
  state.auto = on;
  state.autoWait = 0.2;
  autoBtn.textContent = on ? '⏸ Դադարեցնել ինքնակամ անցումները' : '▶ Ինքնակամ անցումներ';
  autoBtn.setAttribute('aria-pressed', String(on));
}

function syncGoBtn() {
  const to = +toCtl.value;
  goBtn.disabled = to === state.n;
  goBtn.textContent = to === state.n
    ? 'Ընտրեք այլ մակարդակ'
    : `Անցում ${state.n} → ${to} · ${to < state.n ? 'արձակում' : 'կլանում'}`;
}

// ---------- Transitions ----------
/** Put the electron on level n without any photon (preparing the atom). */
function placeElectron(n) {
  setAuto(false);
  state.tr = null;
  state.photons.length = 0;
  state.n = n;
  state.nVis = n;
  levelChanged();
}

function levelChanged() {
  fromCtl.set(state.n, { silent: true });
  syncGoBtn();
  syncStats();
  dirty = true;
}

function finishTransition() {
  const tr = state.tr;
  if (!tr) return;
  if (tr.phase === 'in') commit(tr);
  state.nVis = state.n;
  state.tr = null;
}

function startTransition(to) {
  finishTransition();
  const from = state.n;
  if (to === from || to < 1 || to > N_MAX) return;
  const g = atomGeometry();
  if (to < from) {
    // Emission: the electron drops at once, the photon leaves from where it was.
    const tr = { from, to, kind: 'emit', phase: 'jump', t: 0 };
    state.tr = tr;
    state.photons.push({ data: transition(from, to), angle: state.theta, r0: g.orbit(from), s: 0 });
    commit(tr);
  } else {
    // Absorption: the photon flies in and meets the electron on its orbit.
    const dist = g.Rmax + PHOTON_LEN - g.orbit(from);
    const flight = dist / PHOTON_SPEED;
    state.tr = {
      from, to, kind: 'absorb', phase: 'in', t: 0, flight, dist,
      data: transition(from, to),
      angle: state.theta + OMEGA_1 * relOmega(from) * flight,
    };
  }
}

/** The quantum jump itself: level, records, readouts. */
function commit(tr) {
  state.n = tr.to;
  state.last = { from: tr.from, to: tr.to };
  const hi = Math.max(tr.from, tr.to);
  const lo = Math.min(tr.from, tr.to);
  const key = `${hi}-${lo}`;
  const a = arrows.get(key) ?? { hi, lo, down: false, up: false };
  if (tr.kind === 'emit') {
    a.down = true;
    const l = lines.get(key) ?? { hi, lo, count: 0 };
    l.count++;
    lines.set(key, l);
  } else {
    a.up = true;
  }
  arrows.set(key, a);
  levelChanged();
}

function showSeries(lo) {
  for (let hi = lo + 1; hi <= N_MAX; hi++) {
    const key = `${hi}-${lo}`;
    if (!lines.has(key)) lines.set(key, { hi, lo, count: 1 });
    const a = arrows.get(key) ?? { hi, lo, down: false, up: false };
    a.down = true;
    arrows.set(key, a);
  }
  dirty = true;
}

function clearRecords() {
  lines.clear();
  arrows.clear();
  state.last = null;
  syncStats();
  dirty = true;
}

// ---------- Readouts ----------
function syncStats() {
  const n = state.n;
  setText('sN', `${n}${n === 1 ? ' (հիմնական)' : ' (գրգռված)'}`);
  setText('sR', `${Number(radius(n).toPrecision(3))} նմ`);
  setText('sE', `${signed(energy(n), 2)} էՎ`);
  setHTML('sV', `${sci(speed(n))} մ/վ`);
  setText('sIon', `${(-energy(n)).toFixed(2)} էՎ`);

  const last = state.last;
  if (!last) {
    ['tWhat', 'tDE', 'tNu', 'tLam', 'tReg', 'tSer'].forEach((id) => setText(id, '—'));
    setText('calc', 'Կատարեք անցում՝ ֆոտոնի բնութագրերը տեսնելու համար։');
    return;
  }
  const tr = transition(last.from, last.to);
  const emit = last.to < last.from;
  setText('tWhat', `${last.from} → ${last.to} · ${emit ? 'արձակում' : 'կլանում'}`);
  setText('tDE', `${tr.dE.toFixed(tr.dE < 1 ? 3 : 2)} էՎ`);
  setHTML('tNu', `${sci(tr.nu)} Հց`);
  setText('tLam', `${fmtLambda(tr.lambda)} նմ`);
  setText('tReg', tr.region === REGION.UV ? 'ուլտրամանուշակագույն'
    : tr.region === REGION.IR ? 'ինֆրակարմիր'
      : `տեսանելի (${colorName(tr.lambda)})`);
  const balmer = tr.lo === 2 ? ` (H${BALMER_NAMES[tr.hi]})` : '';
  setText('tSer', `${SERIES[tr.lo]}${balmer}`);
  const [num, den] = rydbergFraction(tr.lo, tr.hi);
  setHTML('calc',
    `<b>1/λ = R·(1/${tr.lo}² ${MINUS} 1/${tr.hi}²) = ${num === 1 ? '' : num}R/${den}</b><br>`
    + `λ = ${fmtLambda(tr.lambda)} նմ, ΔE = ${signed(energy(tr.hi), 2)} ${MINUS} (${signed(energy(tr.lo), 2)}) = `
    + `${tr.dE.toFixed(2)} էՎ։ Ֆոտոնը ${emit ? 'արձակվում' : 'կլանվում'} է։`);
}

// ---------- Simulation step ----------
function step(dt) {
  state.theta += OMEGA_1 * relOmega(state.n) * dt;
  state.waveT += dt;

  const tr = state.tr;
  if (tr) {
    tr.t += dt;
    if (tr.phase === 'in' && tr.t >= tr.flight) {
      state.theta = tr.angle;          // exact meeting point (ω is constant in flight)
      tr.phase = 'jump';
      tr.t = 0;
      commit(tr);
    }
    if (tr.phase === 'jump') {
      const k = clamp(tr.t / T_JUMP, 0, 1);
      state.nVis = lerp(tr.from, tr.to, k * k * (3 - 2 * k));
      if (tr.t >= T_JUMP + T_SETTLE) { state.nVis = tr.to; state.tr = null; }
    }
  }

  const reach = Math.hypot(atom.width, atom.height) / 2 + PHOTON_LEN;
  for (const ph of state.photons) ph.s += PHOTON_SPEED * dt;
  state.photons = state.photons.filter((ph) => ph.r0 + ph.s < reach);

  if (state.auto && !state.tr) {
    state.autoWait -= dt;
    if (state.autoWait <= 0) {
      state.autoWait = AUTO_PAUSE;
      const to = state.n === 1 ? randomExcited() : randomLower(state.n);
      toCtl.set(to, { silent: true });
      startTransition(to);
    }
  }
}

// ---------- Atom view ----------
function atomGeometry() {
  const { width: W, height: H } = atom;
  const Rmax = Math.min(W, H) / 2 - 18;
  return { W, H, cx: W / 2, cy: H / 2, Rmax, orbit: (n) => Rmax * (n / N_MAX) ** ORBIT_POWER };
}

function drawPhoton(ctx, hx, hy, dx, dy, tr, fade = 1) {
  const period = 7 + 9 * clamp(Math.log(tr.lambda / 90) / Math.log(8000 / 90), 0, 1);
  const head = 8;
  const color = photonColor(tr, undefined, fade);
  const px = -dy;
  const py = dx;
  const trace = () => {
    ctx.beginPath();
    for (let u = head - 2; u <= PHOTON_LEN; u += 1.5) {
      const env = Math.sin((Math.PI * (u - head + 2)) / (PHOTON_LEN - head + 2));
      const off = 6 * env * Math.sin((TAU * u) / period);
      const x = hx - dx * u + px * off;
      const y = hy - dy * u + py * off;
      if (u === head - 2) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  };
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (currentTheme() === 'light') {        // keep pale colours visible on white
    trace();
    ctx.strokeStyle = alpha(COLORS.text, 0.3 * fade);
    ctx.lineWidth = 3.6;
    ctx.stroke();
  }
  trace();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.2;
  ctx.stroke();
  ctx.restore();
  arrow(ctx, hx - dx * head, hy - dy * head, hx, hy, { color, width: 2.2, head });
  const tag = regionShort(tr);
  if (tag) {
    const m = PHOTON_LEN / 2;
    text(ctx, tag, hx - dx * m + px * 17, hy - dy * m + py * 17,
      { color, size: 10, weight: 700, align: 'center' });
  }
}

function drawAtom() {
  const { ctx } = atom;
  const g = atomGeometry();
  const { W, H, cx, cy } = g;
  clear(ctx, W, H);

  // Orbits and their labels (along one ray, up and to the right).
  const la = -0.9;
  for (let n = 1; n <= N_MAX; n++) {
    const on = n === state.n;
    circle(ctx, cx, cy, g.orbit(n), {
      stroke: on ? alpha(COLORS.pink, 0.9) : COLORS.axis,
      width: on ? 1.8 : 1,
    });
  }
  ctx.font = font(10, { family: 'mono' });
  for (let n = 1; n <= N_MAX; n++) {
    const r = g.orbit(n);
    const x = cx + r * Math.cos(la);
    const y = cy + r * Math.sin(la);
    const label = n === 1 ? 'n=1' : String(n);
    const w = ctx.measureText(label).width + 6;
    ctx.fillStyle = COLORS.canvasBg;
    ctx.fillRect(x - w / 2, y - 7, w, 14);
    text(ctx, label, x, y, {
      color: n === state.n ? COLORS.pink : COLORS.text3, size: 10, family: 'mono', align: 'center',
      weight: n === state.n ? 700 : 500,
    });
  }

  // Nucleus.
  circle(ctx, cx, cy, 6.5, { fill: COLORS.coral });
  text(ctx, '+', cx, cy + 0.5, { color: COLORS.canvasBg, size: 11, weight: 700, align: 'center' });

  // Standing de Broglie wave on the current orbit: n wavelengths per turn.
  const steady = !state.tr || state.tr.phase === 'in' || state.tr.t >= T_JUMP;
  if (waveCtl.checked && steady) {
    const n = state.n;
    const R = g.orbit(n);
    const A = Math.min(9, n === 1 ? R * 0.38 : (R - g.orbit(n - 1)) * 0.3);
    const osc = Math.cos(TAU * WAVE_FREQ * state.waveT);
    const ring = (amp, color, width) => {
      ctx.beginPath();
      for (let i = 0; i <= 360; i++) {
        const a = (i / 360) * TAU;
        const r = R + amp * Math.sin(n * a);
        const x = cx + r * Math.cos(a);
        const y = cy + r * Math.sin(a);
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    };
    ring(A, alpha(COLORS.teal, 0.28), 1);
    ring(-A, alpha(COLORS.teal, 0.28), 1);
    ring(A * osc, COLORS.teal, 2);
  }

  // Electron.
  const re = g.orbit(state.nVis);
  const ex = cx + re * Math.cos(state.theta);
  const ey = cy + re * Math.sin(state.theta);
  circle(ctx, ex, ey, 9, { fill: alpha(COLORS.blue, 0.22) });
  circle(ctx, ex, ey, 5, { fill: COLORS.blue });

  // Photons: emitted ones fly away, the absorbed one flies in.
  for (const ph of state.photons) {
    const dx = Math.cos(ph.angle);
    const dy = Math.sin(ph.angle);
    const r = ph.r0 + Math.max(ph.s, 14);
    drawPhoton(ctx, cx + dx * r, cy + dy * r, dx, dy, ph.data);
  }
  const tr = state.tr;
  if (tr && tr.phase === 'in') {
    const dx = Math.cos(tr.angle);
    const dy = Math.sin(tr.angle);
    const r = g.orbit(tr.from) + tr.dist * (1 - tr.t / tr.flight) + 6;
    drawPhoton(ctx, cx + dx * r, cy + dy * r, -dx, -dy, tr.data);
  }

  // Corner captions.
  text(ctx, `n = ${state.n}`, 12, 16, { color: COLORS.pink, size: 13, weight: 700, family: 'mono' });
  text(ctx, state.n === 1 ? 'հիմնական վիճակ' : 'գրգռված վիճակ', 12, 33, { color: COLORS.text3, size: 11 });
  const shown = tr?.phase === 'in' ? { from: tr.from, to: tr.to } : state.last;
  if (shown) {
    const d = transition(shown.from, shown.to);
    const emit = shown.to < shown.from;
    text(ctx, `${shown.from} → ${shown.to} · ${emit ? 'արձակում' : 'կլանում'}`, 12, H - 31,
      { color: COLORS.text2, size: 11 });
    text(ctx, `λ = ${fmtLambda(d.lambda)} նմ`, 12, H - 15,
      { color: photonColor(d), size: 11, weight: 700, family: 'mono' });
  }
}

// ---------- Energy-level diagram ----------
const LABEL_GAP = 19;
const slotOf = (hi, lo) => {
  let s = 0;
  for (let k = 1; k < lo; k++) s += N_MAX - k;
  return s + (hi - lo - 1);
};
const SLOTS = slotOf(N_MAX, N_MAX - 1) + 1;   // 15 possible transitions

function levelsGeometry() {
  const { width: W, height: H } = levels;
  const top = 36;
  const bottom = 34;
  const xl = 46;
  const xr = W - 118;
  const yOf = (E) => top + (-E / RYDBERG_EV) * (H - top - bottom);
  // Label rows: ∞ first (slightly above its line), then n = 6 … 1, kept apart.
  const labelY = [];
  let prev = yOf(0) - 12;
  labelY[0] = prev;                       // index 0 → the ionisation limit
  for (let n = N_MAX; n >= 1; n--) {
    prev = Math.max(yOf(energy(n)), prev + LABEL_GAP);
    labelY[n] = prev;
  }
  return { W, H, top, bottom, xl, xr, yOf, labelY };
}

function levelAt(p) {
  const g = levelsGeometry();
  let best = 0;
  let bestD = 12;
  for (let n = 1; n <= N_MAX; n++) {
    const y = p.x > g.xr + 4 ? g.labelY[n] : g.yOf(energy(n));
    const d = Math.abs(p.y - y);
    if (d < bestD) { bestD = d; best = n; }
  }
  return best;
}

function drawLevels() {
  const { ctx } = levels;
  const g = levelsGeometry();
  const { W, H, xl, xr, yOf, labelY } = g;
  clear(ctx, W, H);

  // Energy axis.
  const ax = 34;
  line(ctx, ax, yOf(0) - 14, ax, yOf(-RYDBERG_EV) + 6, { color: COLORS.axis });
  text(ctx, 'E, էՎ', 8, 14, { color: COLORS.text3, size: 11 });
  for (let e = 0; e >= -12; e -= 2) {
    const y = yOf(e);
    line(ctx, ax - 4, y, ax, y, { color: COLORS.axis });
    if (e % 4 === 0) text(ctx, e ? MINUS + -e : '0', ax - 7, y, { color: COLORS.text3, size: 10, family: 'mono', align: 'right' });
  }

  // Continuum above E = 0.
  const y0 = yOf(0);
  const grad = ctx.createLinearGradient(0, y0 - 16, 0, y0);
  grad.addColorStop(0, alpha(COLORS.text3, 0));
  grad.addColorStop(1, alpha(COLORS.text3, 0.22));
  ctx.fillStyle = grad;
  ctx.fillRect(xl, y0 - 16, xr - xl, 16);
  line(ctx, xl, y0, xr, y0, { color: COLORS.text3, dash: [5, 4] });

  // Series names under the level where each series ends.
  const slotW = (xr - xl) / SLOTS;
  const xSlot = (s) => xl + (s + 0.5) * slotW;
  for (let lo = 1; lo <= 3; lo++) {
    const xc = (xSlot(slotOf(lo + 1, lo)) + xSlot(slotOf(N_MAX, lo))) / 2;
    text(ctx, SERIES_SHORT[lo], xc, yOf(energy(lo)) + 12, { color: COLORS.text3, size: 10, align: 'center' });
  }

  // Levels, connectors and labels.
  for (let n = 1; n <= N_MAX; n++) {
    const y = yOf(energy(n));
    const on = n === state.n;
    const hot = n === state.hover && !on;
    const color = on ? COLORS.pink : hot ? COLORS.text : COLORS.text2;
    line(ctx, xl, y, xr, y, { color, width: on ? 2.6 : hot ? 1.8 : 1.2 });
    ctx.beginPath();
    ctx.moveTo(xr, y);
    ctx.lineTo(xr + 12, labelY[n]);
    ctx.lineTo(xr + 16, labelY[n]);
    ctx.strokeStyle = on ? COLORS.pink : COLORS.axis;
    ctx.lineWidth = 1;
    ctx.stroke();
    if (on || hot) {
      roundRect(ctx, xr + 18, labelY[n] - 9, W - xr - 22, 18, 5);
      ctx.fillStyle = alpha(on ? COLORS.pink : COLORS.text3, 0.16);
      ctx.fill();
    }
    text(ctx, `n=${n}`, xr + 22, labelY[n], { color, size: 11, family: 'mono', weight: on ? 700 : 500 });
    text(ctx, signed(energy(n), 2), W - 8, labelY[n], { color, size: 11, family: 'mono', align: 'right', weight: on ? 700 : 500 });
  }
  ctx.beginPath();
  ctx.moveTo(xr, y0);
  ctx.lineTo(xr + 12, labelY[0]);
  ctx.lineTo(xr + 16, labelY[0]);
  ctx.strokeStyle = COLORS.axis;
  ctx.stroke();
  text(ctx, 'n=∞', xr + 22, labelY[0], { color: COLORS.text3, size: 11, family: 'mono' });
  text(ctx, '0', W - 8, labelY[0], { color: COLORS.text3, size: 11, family: 'mono', align: 'right' });

  // Transitions made so far.
  const last = state.last;
  for (const a of arrows.values()) {
    const d = transition(a.hi, a.lo);
    const isLast = last && Math.max(last.from, last.to) === a.hi && Math.min(last.from, last.to) === a.lo;
    const color = photonColor(d, undefined, isLast ? 1 : 0.7);
    const x = xSlot(slotOf(a.hi, a.lo));
    const yh = yOf(energy(a.hi));
    const yl = yOf(energy(a.lo));
    const opts = { color, width: isLast ? 2.4 : 1.5, head: isLast ? 8 : 6 };
    if (a.down) arrow(ctx, x, yh, x, yl, opts);
    if (a.up) arrow(ctx, x, yl, x, yh, opts);
  }

  // The electron on its level.
  const ye = yOf(energy(state.n));
  circle(ctx, xl, ye, 4.5, { fill: COLORS.blue, stroke: COLORS.canvasBg, width: 1.5 });
}

levels.canvas.addEventListener('click', (e) => {
  const n = levelAt(pointerPos(levels, e));
  if (!n || n === state.n) return;
  setAuto(false);
  toCtl.set(n, { silent: true });
  startTransition(n);
});
levels.canvas.addEventListener('pointermove', (e) => {
  const n = e.pointerType === 'mouse' ? levelAt(pointerPos(levels, e)) : 0;
  if (n !== state.hover) { state.hover = n; dirty = true; }
});
levels.canvas.addEventListener('pointerleave', () => { state.hover = 0; dirty = true; });

// ---------- Spectrum strip ----------
// Piecewise-logarithmic wavelength axis: [from, to, share of the width].
const SEGMENTS = [
  [90, 130, 0.20],
  [130, 380, 0.06],
  [VISIBLE_MIN, VISIBLE_MAX, 0.36],
  [VISIBLE_MAX, 2000, 0.22],
  [2000, 8000, 0.16],
];
const TICKS = [100, 120, 400, 500, 600, 700, 1000, 2000, 4000, 8000];
const STRIP_BG = '#05070d';

function drawSpectrum() {
  const { ctx, width: W, height: H } = spectrum;
  clear(ctx, W, H);
  const x0 = 12;
  const span = W - 24;
  const xOf = (l) => {
    let x = x0;
    for (const [a, b, share] of SEGMENTS) {
      if (l <= b) return x + span * share * clamp(Math.log(l / a) / Math.log(b / a), 0, 1);
      x += span * share;
    }
    return x0 + span;
  };
  const top = 28;
  const sh = 46;
  const bot = top + sh;

  // Dark strip with a faint continuous spectrum in the visible range.
  ctx.fillStyle = STRIP_BG;
  ctx.fillRect(x0, top, span, sh);
  const xa = xOf(VISIBLE_MIN);
  const xb = xOf(VISIBLE_MAX);
  for (let x = Math.floor(xa); x < xb; x++) {
    const l = VISIBLE_MIN * (VISIBLE_MAX / VISIBLE_MIN) ** clamp((x + 0.5 - xa) / (xb - xa), 0, 1);
    const rgb = wavelengthToRGB(l);
    ctx.fillStyle = rgba(rgb, 0.16);
    ctx.fillRect(x, top, 1, sh);
    ctx.fillStyle = rgba(rgb, 1);
    ctx.fillRect(x, bot, 1, 5);
  }
  ctx.fillStyle = alpha('#b3a6e0', 0.5);
  ctx.fillRect(x0, bot, xa - x0, 5);
  ctx.fillStyle = alpha('#c24a3c', 0.6);
  ctx.fillRect(xb, bot, x0 + span - xb, 5);
  ctx.strokeStyle = COLORS.axis;
  ctx.lineWidth = 1;
  ctx.strokeRect(x0 + 0.5, top + 0.5, span - 1, sh + 4);

  // Emitted lines.
  const last = state.last && state.last.to < state.last.from ? state.last : null;
  for (const l of lines.values()) {
    const d = transition(l.hi, l.lo);
    const x = xOf(d.lambda);
    ctx.fillStyle = photonColor(d, true, clamp(0.6 + 0.2 * l.count, 0, 1));
    ctx.fillRect(x - 1, top + 1, 2, sh - 1);
  }
  if (last) {
    const d = transition(last.from, last.to);
    const x = xOf(d.lambda);
    ctx.fillStyle = photonColor(d, true);
    ctx.fillRect(x - 1.5, top + 1, 3, sh - 1);
    const right = x < x0 + span - 74;
    const label = `${fmtLambda(d.lambda)} նմ`;
    ctx.font = font(10, { family: 'mono' });
    const lw = ctx.measureText(label).width + 6;
    ctx.fillStyle = alpha(STRIP_BG, 0.85);
    ctx.fillRect(right ? x + 3 : x - 3 - lw, top + 3, lw, 14);
    text(ctx, label, x + (right ? 6 : -6), top + 10,
      { color: '#e8eaf6', size: 10, family: 'mono', align: right ? 'left' : 'right' });
  }

  // Series names above their lines (skipped when they would collide).
  let used = -Infinity;
  ctx.font = font(11);
  for (let lo = 1; lo <= 5; lo++) {
    const xs = [];
    for (let hi = lo + 1; hi <= N_MAX; hi++) xs.push(xOf(transition(hi, lo).lambda));
    const xmin = Math.min(...xs);
    const xmax = Math.max(...xs);
    const w = ctx.measureText(SERIES_SHORT[lo]).width;
    const xc = clamp((xmin + xmax) / 2, x0 + w / 2, x0 + span - w / 2);
    if (xc - w / 2 < used + 8) continue;
    used = xc + w / 2;
    text(ctx, SERIES_SHORT[lo], xc, 11, { color: COLORS.text2, size: 11, align: 'center' });
    line(ctx, xmin - 2, 22, xmax + 2, 22, { color: COLORS.text3 });
    for (const x of xs) line(ctx, x, 22, x, 26, { color: COLORS.text3 });
  }

  // Wavelength ticks.
  const ty = bot + 5;
  let usedTick = -Infinity;
  ctx.font = font(10, { family: 'mono' });
  for (const l of TICKS) {
    const x = xOf(l);
    line(ctx, x, ty, x, ty + 4, { color: COLORS.axis });
    const w = ctx.measureText(String(l)).width;
    const xc = clamp(x, x0 + w / 2, x0 + span - w / 2);
    if (xc - w / 2 < usedTick + 6) continue;
    usedTick = xc + w / 2;
    text(ctx, String(l), xc, ty + 12, { color: COLORS.text3, size: 10, family: 'mono', align: 'center' });
  }

  // Regions.
  const ry = H - 12;
  const wide = W > 520;
  const regions = [
    [x0, xa, wide ? 'ուլտրամանուշակագույն (ՈՒՄ)' : 'ՈՒՄ'],
    [xa, xb, 'տեսանելի'],
    [xb, x0 + span, wide ? 'ինֆրակարմիր (ԻԿ) · λ, նմ' : 'ԻԿ · λ, նմ'],
  ];
  for (const [a, b, name] of regions) {
    text(ctx, name, (a + b) / 2, ry, { color: COLORS.text3, size: 11, align: 'center' });
    line(ctx, a + 0.5, ry - 12, a + 0.5, ry + 6, { color: COLORS.grid });
  }
}

// ---------- Loop ----------
function drawStatic() {
  drawLevels();
  drawSpectrum();
  dirty = false;
}

setAuto(false);
syncGoBtn();
syncStats();
onThemeChange(() => { dirty = true; });
fontsReady().then(() => { dirty = true; });

startLoop((dt) => {
  step(dt * speedCtl.value);
  drawAtom();
  if (dirty) drawStatic();
});
