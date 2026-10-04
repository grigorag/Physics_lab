// DC circuits — five configurable schematics solved by one general MNA solver.
//
// circuits.js holds the schematics and turns them into a netlist, solver.js
// solves it, report.js turns the solution into stats / checks / cards.
// This module draws the schematic (standard school symbols), animates the
// charge carriers (speed ∝ current) and draws the I(U) and P(R) charts.

import { fluidCanvas, pointerPos } from '../../../assets/js/core/canvas.js';
import { bindRange, bindCheckbox, bindSegmented, bindTabs, onClick } from '../../../assets/js/core/controls.js';
import { byId, setHTML } from '../../../assets/js/core/dom.js';
import { startLoop } from '../../../assets/js/core/loop.js';
import { clear, line, circle, text, roundRect } from '../../../assets/js/core/draw.js';
import { COLORS, themed, alpha, font, onThemeChange, fontsReady } from '../../../assets/js/core/theme.js';
import { clamp, lerp, TAU } from '../../../assets/js/core/math.js';
import { PRESETS, initialState, evaluate } from './circuits.js';
import { report, num, ohm } from './report.js';

const U_MAX = 74;              // largest grid unit, px
const SPEED = 0.55;            // carrier speed: grid units per second per ampere
const SPEED_MAX = 7;           // … capped (grid units per second)
const LAMP_FULL = 30;          // lamp power (W) that gives full brightness

const C = themed((light) => ({
  wire: light ? '#4b5373' : '#9ba4c4',
  sym: COLORS.text,
  fill: COLORS.canvasBg,
  amm: COLORS.teal,
  volt: COLORS.purple,
  lamp: light ? '#f0a500' : '#ffcf4d',
  carrier: COLORS.amber,
  electron: COLORS.blue,
  current: COLORS.coral,
  lo: COLORS.blue,
  hi: COLORS.red,
  sw: COLORS.purple,
  series: [COLORS.teal, COLORS.coral, COLORS.amber, COLORS.blue],
}));

// ---------- State ----------
const states = Object.fromEntries(Object.keys(PRESETS).map((id) => [id, initialState(id)]));
let current = 'ohm';
const S = () => states[current];
let sol = null;
let rep = null;
let showElectrons = false;
let showPotential = false;
let hoverSwitch = null;
let chartDirty = true;
const phase = new Map();                    // edge id → carrier offset (px along a→b)

// Chart data: I(U) points for Ohm's law, P(R) points for the real source.
let ohmSeries = [];                         // [{ R, type, pts: [[U, I]] }]
let srcPts = [];                            // [[R, P]]
let srcKey = '';

// ---------- Canvas & layout ----------
const cv = byId('cv');
let L = null;
function layout(W) {
  const p = PRESETS[current];
  const u = Math.min((W - 12) / p.cols, U_MAX);
  return { u, ox: (W - p.cols * u) / 2, oy: 4, H: Math.round(p.rows * u + 44), fs: clamp(u * 0.3, 10.5, 13) };
}
const view = fluidCanvas(cv, { height: (w) => layout(w).H });
const chart = fluidCanvas(byId('chart'), {
  height: (w) => Math.round(clamp(w * 0.5, 220, 320)),
  onResize: () => { chartDirty = true; },
});
const P = (k) => {
  const [x, y] = PRESETS[current].nodes[k];
  return [L.ox + x * L.u, L.oy + y * L.u];
};

// ---------- Controls ----------
const emf = bindRange('emf', { format: (v) => `${v.toFixed(1)} Վ`, onInput: (v) => set('E', v) });
const rInt = bindRange('rInt', { format: (v) => `${v.toFixed(1)} Օմ`, onInput: (v) => set('r', v) });
const RL = bindRange('RL', { format: (v) => `${v.toFixed(1)} Օմ`, onInput: (v) => set('RL', v) });
const Rs = [1, 2, 3].map((i) => bindRange(`R${i}`, { format: (v) => `${v} Օմ`, onInput: (v) => set(`R${i}`, v) }));
const typeCtl = bindSegmented('type', { onChange: (v) => set('type', v) });
const third = bindCheckbox('third', { onChange: (v) => set('three', v) });
const SW = ['K', 'K1', 'K2', 'K3', 'KS'];
const swCtl = Object.fromEntries(SW.map((k) => [k, bindCheckbox(`sw${k}`, {
  onChange: (v) => { S().sw[k] = v; update(); },
})]));
bindCheckbox('electrons', { onChange: (v) => { showElectrons = v; syncLegend(); } });
bindCheckbox('potential', { onChange: (v) => { showPotential = v; syncLegend(); } });
onClick('clearBtn', () => {
  if (current === 'ohm') ohmSeries = [];
  else srcPts = [];
  record();
  chartDirty = true;
});

function set(key, v) {
  S()[key] = v;
  update(key);
}

const field = (id) => byId(id).closest('.field');
const LABELS = {
  ohm: { R1: 'Դիմադրություն R' },
  series: { R1: 'Դիմադրություն R₁', third: 'Երրորդ սպառիչը (R₃)' },
  parallel: { R1: 'Դիմադրություն R₁', third: 'Երրորդ ճյուղը (R₃)' },
  mixed: { R1: 'Դիմադրություն R₁' },
};

/** Shows the controls of the current preset and loads its values. */
function syncPanel() {
  const st = S();
  const id = current;
  const has = (...ids) => ids.includes(id);
  emf.set(st.E, { silent: true });
  field('rInt').hidden = !has('source');
  field('RL').hidden = !has('source');
  field('R1').hidden = has('source');
  field('R2').hidden = !has('series', 'parallel', 'mixed');
  field('R3').hidden = !has('series', 'parallel', 'mixed');
  byId('third').closest('.check').hidden = !has('series', 'parallel');
  if (has('source')) { rInt.set(st.r, { silent: true }); RL.set(st.RL, { silent: true }); }
  [1, 2, 3].forEach((i) => { if (st[`R${i}`] !== undefined) Rs[i - 1].set(st[`R${i}`], { silent: true }); });
  if (LABELS[id]) {
    byId('R1Label').textContent = LABELS[id].R1;
    if (LABELS[id].third) byId('thirdLabel').textContent = LABELS[id].third;
  }
  third.set(!!st.three, { silent: true });
  Rs[2].input.disabled = has('series', 'parallel') && !st.three;
  typeCtl.set(st.type, { silent: true });
  byId('loadTitle').textContent = has('source') ? 'Բեռ' : 'Սպառիչներ';
  SW.forEach((k) => {
    const on = k in st.sw && !(k === 'K3' && !st.three);
    swCtl[k].input.closest('.check').hidden = !on;
    if (k in st.sw) swCtl[k].set(st.sw[k], { silent: true });
  });
  const charted = has('ohm', 'source');
  byId('chartBox').hidden = !charted;
  byId('chartCap').textContent = id === 'ohm'
    ? 'Վոլտաչափի և ամպերաչափի ցուցմունքները կետերով նշվում են գրաֆիկում ամեն անգամ, երբ փոխում եք ε-ն։ Նույն R-ի կետերն ընկած են սկզբնակետով անցնող ուղղի վրա, որի թեքությունը 1/R է։ R-ը փոխելիս սկսվում է նոր շարք։'
    : 'Բեռում անջատվող հզորությունը P(R) = ε²R / (R + r)²։ Կետերը նշվում են R-ը փոխելիս։ Հզորությունն առավելագույնն է, երբ բեռի դիմադրությունը հավասար է ներքին դիմադրությանը՝ R = r։';
  byId('clearBtn').hidden = !charted;
}

function syncLegend() {
  byId('carrierDot').style.setProperty('--c', showElectrons ? 'var(--blue)' : 'var(--amber)');
  byId('carrierText').textContent = showElectrons
    ? 'էլեկտրոններ (շարժվում են հոսանքին հակառակ)'
    : 'լիցքակիրներ (պայմանական ուղղությամբ)';
  byId('potLegend').hidden = !showPotential;
}

// ---------- Solve & report ----------
function update(trigger) {
  sol = evaluate(current, S());
  rep = report(current, S(), sol);
  syncPanel();

  setHTML('stats', rep.stats.map(([k, v]) => `<div class="stat"><dt>${k}</dt><dd>${v}</dd></div>`).join(''));
  setHTML('checks', rep.checks);
  setHTML('warn', rep.warn);
  byId('warn').hidden = !rep.warn;
  setHTML('formula', rep.formula);
  setHTML('cards', rep.cards.map((c) => `<div class="readout"><div class="readout__title"><i class="swatch" style="--c: ${c.color}"></i>${c.title}</div>`
    + c.lines.map(([k, v]) => `${k} = <b>${v}</b>`).join('<br>') + '</div>').join(''));

  record(trigger);
  chartDirty = true;
}

/** Adds a "measurement" to the chart of the current preset. */
function record(trigger) {
  const st = S();
  if (current === 'ohm') {
    if (!st.sw.K) return;
    const U = sol.res.V.U, I = sol.res.A.I;
    let s = ohmSeries[ohmSeries.length - 1];
    if (!s || s.R !== st.R1) {
      if (s && s.pts.length <= 1 && trigger === 'R1') ohmSeries.pop();   // just sliding through R values
      s = { R: st.R1, pts: [] };
      ohmSeries.push(s);
      if (ohmSeries.length > 4) ohmSeries.shift();
    }
    s.pts = s.pts.filter(([u]) => Math.abs(u - U) > 0.01);
    s.pts.push([U, I]);
  } else if (current === 'source') {
    const key = `${st.E}|${st.r}`;
    if (key !== srcKey) { srcKey = key; srcPts = []; }
    if (!st.sw.K || st.sw.KS) return;
    const R = st.RL, Pl = sol.res.R1.P;
    srcPts = srcPts.filter(([r]) => Math.abs(r - R) > 0.05);
    srcPts.push([R, Pl]);
  }
}

// ---------- Tabs ----------
const tabs = bindTabs('tabs', {
  hash: true,
  onChange: (id) => {
    current = id;
    phase.clear();
    // Height depends on the preset: change it, the canvas observer re-sizes the view.
    cv.style.height = `${layout(view.width).H}px`;
    update();
  },
});
current = tabs.value;

// ---------- Switches on the schematic ----------
function switchAt(p) {
  if (!sol) return null;
  for (const e of sol.edges) {
    if (e.kind !== 'sw') continue;
    const g = geom(e);
    if (Math.hypot(p.x - g.cx, p.y - g.cy) < Math.max(0.62 * L.u, 22)) return e.id;
  }
  return null;
}
cv.addEventListener('pointerdown', (ev) => {
  const k = switchAt(pointerPos(view, ev));
  if (!k) return;
  S().sw[k] = !S().sw[k];
  update();
});
cv.addEventListener('pointermove', (ev) => {
  hoverSwitch = switchAt(pointerPos(view, ev));
  cv.style.cursor = hoverSwitch ? 'pointer' : '';
});
cv.addEventListener('pointerleave', () => { hoverSwitch = null; });

// ---------- Geometry ----------
function symSize(e) {
  const u = L.u;
  switch (e.kind) {
    case 'R': case 'rheo': return [0.6 * u * (e.size ?? 1), 0.2 * u];
    case 'lamp': return [0.34 * u, 0.34 * u];
    case 'A': case 'V': return [0.33 * u, 0.33 * u];
    case 'src': return [0.11 * u, 0.42 * u];
    case 'sw': return [0.45 * u, 0.12 * u];
    default: return [0, 0];
  }
}

function geom(e) {
  const [ax, ay] = P(e.a);
  const [bx, by] = P(e.b);
  const len = Math.hypot(bx - ax, by - ay);
  const dx = (bx - ax) / len, dy = (by - ay) / len;
  const t = e.t ?? 0.5;
  const [hl, ht] = symSize(e);
  const horiz = Math.abs(dx) > 0.5;
  return {
    ax, ay, bx, by, len, dx, dy, t, hl, ht,
    cx: ax + dx * len * t, cy: ay + dy * len * t,
    bw: horiz ? hl : ht, bh: horiz ? ht : hl,      // half-extent of the symbol on screen
  };
}

const SIDE = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] };

function mix(hexA, hexB, t) {
  const a = parseInt(hexA.slice(1), 16), b = parseInt(hexB.slice(1), 16);
  const ch = (s) => Math.round(lerp((a >> s) & 255, (b >> s) & 255, t));
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}
function wireColor(node) {
  if (!showPotential) return C.wire;
  const E = S().E;
  return mix(C.lo, C.hi, E > 0 ? clamp(sol.phi[node] / E, 0, 1) : 0);
}

// ---------- Drawing the schematic ----------
function drawScene() {
  const { ctx } = view;
  L = layout(view.width);
  clear(ctx, view.width, view.height, COLORS.canvasBg);
  if (!sol) return;
  const u = L.u;
  const lw = clamp(u * 0.045, 1.6, 3);
  const edges = sol.edges;
  const G = new Map(edges.map((e) => [e.id, geom(e)]));

  if (PRESETS[current].box) drawSourceBox();

  // Wires (and the wire stubs of every symbol)
  ctx.lineCap = 'round';
  for (const e of edges) {
    const g = G.get(e.id);
    const s1 = g.len * g.t - g.hl, s2 = g.len * (1 - g.t) - g.hl;
    const dash = e.kind === 'lead' || e.kind === 'V' ? [4, 4] : null;
    const w = e.kind === 'lead' || e.kind === 'V' ? lw * 0.7 : lw;
    if (s1 > 0) line(ctx, g.ax, g.ay, g.ax + g.dx * s1, g.ay + g.dy * s1, { color: wireColor(e.a), width: w, dash, cap: 'round' });
    if (s2 > 0) line(ctx, g.bx - g.dx * s2, g.by - g.dy * s2, g.bx, g.by, { color: wireColor(e.b), width: w, dash, cap: 'round' });
  }

  // Junction dots where three or more conductors meet
  const deg = {};
  for (const e of edges) { deg[e.a] = (deg[e.a] || 0) + 1; deg[e.b] = (deg[e.b] || 0) + 1; }
  for (const [k, d] of Object.entries(deg)) {
    if (d >= 3) { const [x, y] = P(k); circle(ctx, x, y, Math.max(3, u * 0.07), { fill: wireColor(k) }); }
  }

  drawCarriers(G);
  drawArrows(G);
  for (const e of edges) drawSymbol(e, G.get(e.id));
  for (const e of edges) drawLabel(e, G.get(e.id));
}

function drawSourceBox() {
  const { ctx } = view;
  const [x0, x1, y] = PRESETS[current].box;
  const u = L.u;
  ctx.save();
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = alpha(COLORS.text3, 0.8);
  ctx.lineWidth = 1.2;
  roundRect(ctx, L.ox + x0 * u, L.oy + (y - 0.55) * u, (x1 - x0) * u, 1.1 * u, 6);
  ctx.stroke();
  ctx.restore();
}

/** Carriers on every conductor; they move at a speed ∝ current. */
function drawCarriers(G) {
  const { ctx } = view;
  const u = L.u;
  const color = showPotential ? COLORS.text : showElectrons ? C.electron : C.carrier;
  const r = clamp(u * 0.062, 2, 3.8);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (const e of sol.edges) {
    if (e.kind === 'V' || e.kind === 'lead') continue;
    const g = G.get(e.id);
    const n = Math.max(1, Math.round(g.len / (0.42 * u)));
    const sp = g.len / n;
    const off = ((phase.get(e.id) || 0) % sp + sp) % sp;
    const mid = g.len * g.t, keep = g.hl + (e.kind === 'src' ? 3 : 4);
    for (let j = 0; j < n; j++) {
      const s = off + j * sp;
      if (g.hl > 0 && Math.abs(s - mid) < keep) continue;
      const x = g.ax + g.dx * s, y = g.ay + g.dy * s;
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, TAU);
    }
  }
  ctx.fill();
}

function stepCarriers(dt) {
  if (!sol) return;
  const u = L.u;
  const dir = showElectrons ? -1 : 1;
  for (const e of sol.edges) {
    const I = sol.res[e.id].I;
    const v = clamp(SPEED * I, -SPEED_MAX, SPEED_MAX) * u * dir;
    phase.set(e.id, (phase.get(e.id) || 0) + v * dt);
  }
}

/** Conventional-current arrows on the wire stretches that carry current. */
function drawArrows(G) {
  const { ctx } = view;
  const u = L.u;
  const h = clamp(u * 0.17, 6, 11);
  ctx.fillStyle = C.current;
  for (const e of sol.edges) {
    if (e.kind === 'V' || e.kind === 'lead') continue;
    const I = sol.res[e.id].I;
    if (Math.abs(I) < 1e-6) continue;
    const g = G.get(e.id);
    let s, room;
    if (g.hl === 0) { s = g.len / 2; room = g.len; } else {
      const s1 = g.len * g.t - g.hl, s2 = g.len * (1 - g.t) - g.hl;
      if (s1 >= s2) { s = s1 / 2; room = s1; } else { s = g.len - s2 / 2; room = s2; }
    }
    if (room < 0.42 * u) continue;
    const sg = Math.sign(I);
    const x = g.ax + g.dx * s, y = g.ay + g.dy * s;
    const fx = g.dx * sg, fy = g.dy * sg;
    ctx.beginPath();
    ctx.moveTo(x + fx * h * 0.6, y + fy * h * 0.6);
    ctx.lineTo(x - fx * h * 0.4 - fy * h * 0.45, y - fy * h * 0.4 + fx * h * 0.45);
    ctx.lineTo(x - fx * h * 0.4 + fy * h * 0.45, y - fy * h * 0.4 - fx * h * 0.45);
    ctx.closePath();
    ctx.fill();
  }
}

function drawSymbol(e, g) {
  const { ctx } = view;
  const u = L.u;
  const lw = clamp(u * 0.04, 1.5, 2.6);
  const ang = Math.atan2(g.dy, g.dx);
  const res = sol.res[e.id];
  ctx.save();
  ctx.translate(g.cx, g.cy);
  ctx.rotate(ang);
  ctx.lineWidth = lw;
  ctx.strokeStyle = C.sym;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  switch (e.kind) {
    case 'R': case 'rheo': {
      ctx.fillStyle = C.fill;
      ctx.beginPath();
      ctx.rect(-g.hl, -g.ht, 2 * g.hl, 2 * g.ht);
      ctx.fill();
      ctx.stroke();
      if (e.kind === 'rheo') {
        const x0 = -g.hl * 0.75, y0 = g.ht * 2.1, x1 = g.hl * 0.75, y1 = -g.ht * 2.1;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        const a = Math.atan2(y1 - y0, x1 - x0), hh = Math.max(6, u * 0.13);
        ctx.fillStyle = C.sym;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 - hh * Math.cos(a - 0.4), y1 - hh * Math.sin(a - 0.4));
        ctx.lineTo(x1 - hh * Math.cos(a + 0.4), y1 - hh * Math.sin(a + 0.4));
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'lamp': {
      const b = clamp(Math.abs(res.P) / LAMP_FULL, 0, 1);
      const r = g.hl;
      if (b > 0.004) {
        const R = r * (1.3 + 2.4 * Math.sqrt(b));
        const grad = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, R);
        grad.addColorStop(0, alpha(C.lamp, 0.85 * Math.sqrt(b)));
        grad.addColorStop(1, alpha(C.lamp, 0));
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
      }
      circle(ctx, 0, 0, r, { fill: b > 0.004 ? mix(C.fill, C.lamp, 0.25 + 0.7 * b) : C.fill, stroke: C.sym, width: lw });
      const k = r * Math.SQRT1_2;
      ctx.beginPath();
      ctx.moveTo(-k, -k); ctx.lineTo(k, k);
      ctx.moveTo(-k, k); ctx.lineTo(k, -k);
      ctx.stroke();
      break;
    }
    case 'A': case 'V':
      circle(ctx, 0, 0, g.hl, { fill: C.fill, stroke: e.kind === 'A' ? C.amm : C.volt, width: lw * 1.1 });
      break;
    case 'src': {
      const gap = g.hl;
      ctx.lineCap = 'butt';
      line(ctx, -gap, -0.22 * u, -gap, 0.22 * u, { color: C.sym, width: lw * 2.4 });     // − : short, thick
      line(ctx, gap, -0.42 * u, gap, 0.42 * u, { color: C.sym, width: lw });            // + : long, thin
      break;
    }
    case 'sw': {
      const closed = S().sw[e.id];
      const [sx, sy] = SIDE[e.side];
      const rise = -(sx * -g.dy + sy * g.dx) >= 0 ? 1 : -1;     // lever opens away from the label
      const hot = hoverSwitch === e.id;
      circle(ctx, 0, 0, Math.max(0.6 * u, 20), { fill: alpha(C.sw, hot ? 0.16 : 0.07) });
      const th = closed ? 0 : 0.5;
      const Lv = 2 * g.hl;
      line(ctx, -g.hl, 0, -g.hl + Lv * Math.cos(th), rise * Lv * Math.sin(th), { color: closed ? C.sym : C.sw, width: lw * 1.2, cap: 'round' });
      circle(ctx, -g.hl, 0, Math.max(2.5, u * 0.06), { fill: C.sym });
      circle(ctx, g.hl, 0, Math.max(2.5, u * 0.06), { fill: C.fill, stroke: C.sym, width: lw * 0.8 });
      break;
    }
    default: break;
  }
  ctx.restore();

  // Upright texts on the symbols
  if (e.kind === 'A' || e.kind === 'V') {
    text(view.ctx, e.kind, g.cx, g.cy + 0.5, {
      color: e.kind === 'A' ? C.amm : C.volt, size: clamp(u * 0.32, 11, 17), weight: 700, align: 'center',
    });
  }
  if (e.kind === 'src') {
    const [sx, sy] = SIDE[e.side];
    const off = 0.42 * u + 8;
    const fs = clamp(u * 0.26, 11, 15);
    const px = g.cx - sx * off, py = g.cy - sy * off;
    const along = g.hl + 0.16 * u;
    text(view.ctx, '+', px + g.dx * along, py + g.dy * along, { color: COLORS.text2, size: fs, weight: 700, align: 'center' });
    text(view.ctx, '−', px - g.dx * along, py - g.dy * along, { color: COLORS.text2, size: fs, weight: 700, align: 'center' });
  }
}

/** Element name/value or meter reading next to the symbol. */
function drawLabel(e, g) {
  if (!e.side || e.kind === 'wire' || e.kind === 'lead') return;
  const { ctx } = view;
  const st = S();
  const fs = L.fs;
  const lh = fs + 3;
  let lines;
  const meter = e.kind === 'A' || e.kind === 'V';
  if (meter) {
    const r = sol.res[e.id];
    lines = [e.kind === 'A' ? `${num(Math.abs(r.I))} Ա` : `${num(Math.abs(r.U))} Վ`];
  } else if (e.kind === 'src') {
    lines = ['ε', `${num(st.E)} Վ`];
  } else if (e.kind === 'sw') {
    lines = [e.name];
  } else {
    lines = [e.name, `${ohm(e.R)} Օմ`];
  }

  ctx.save();
  ctx.font = font(fs, { family: 'mono', weight: 600 });
  const w = Math.max(...lines.map((s) => ctx.measureText(s).width));
  ctx.restore();
  const h = lines.length * lh;
  const gap = (meter ? 6 : 5) + ((e.gap ?? 0) + (e.kind === 'rheo' ? 0.24 : 0)) * L.u;
  const bh = e.kind === 'sw' ? Math.max(0.12 * L.u, 6) : g.bh;
  let x, y;
  switch (e.side) {
    case 'top': x = g.cx - w / 2; y = g.cy - bh - gap - h; break;
    case 'bottom': x = g.cx - w / 2; y = g.cy + bh + gap; break;
    case 'left': x = g.cx - g.bw - gap - w; y = g.cy - h / 2; break;
    default: x = g.cx + g.bw + gap; y = g.cy - h / 2; break;
  }
  if (e.kind === 'sw' && (e.side === 'left' || e.side === 'right')) x += (e.side === 'right' ? 1 : -1) * 0.12 * L.u;

  if (meter) {
    const col = e.kind === 'A' ? C.amm : C.volt;
    roundRect(ctx, x - 5, y - 1, w + 10, h + 2, 5);
    ctx.fillStyle = alpha(COLORS.canvasBg, 0.92);
    ctx.fill();
    ctx.strokeStyle = alpha(col, 0.7);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    text(ctx, lines[0], x + w / 2, y + h / 2 + 0.5, { color: col, size: fs, family: 'mono', weight: 600, align: 'center' });
    return;
  }
  const align = e.side === 'left' ? 'right' : e.side === 'right' ? 'left' : 'center';
  const tx = align === 'right' ? x + w : align === 'left' ? x : x + w / 2;
  lines.forEach((s, i) => {
    const first = i === 0;
    text(ctx, s, tx, y + lh * (i + 0.5), {
      color: first ? COLORS.text : COLORS.text2,
      size: first ? fs + 1 : fs - 0.5,
      family: first ? 'display' : 'mono',
      style: first && e.kind !== 'sw' ? 'italic' : '',
      weight: first ? 600 : 500,
      align,
    });
  });
}

// ---------- Charts ----------
function niceCeil(v) {
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v - 1e-9) return m * p;
  return 10 * p;
}
function niceStep(max, n = 5) {
  const raw = max / n;
  const p = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= raw - 1e-9) return m * p;
  return 10 * p;
}
const tick = (v) => (Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : String(+v.toFixed(2)));

function axes(ctx, W, H, m, xMax, yMax, xLabel, yLabel) {
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const xs = niceStep(xMax), ys = niceStep(yMax, 4);
  for (let v = 0; v <= xMax + 1e-9; v += xs) {
    const x = m.l + (v / xMax) * pw;
    line(ctx, x, m.t, x, m.t + ph, { color: COLORS.grid, width: 1 });
    text(ctx, tick(v), x, m.t + ph + 7, { color: COLORS.text3, size: 10, family: 'mono', align: 'center', baseline: 'top' });
  }
  for (let v = ys; v <= yMax + 1e-9; v += ys) {
    const y = m.t + ph - (v / yMax) * ph;
    line(ctx, m.l, y, m.l + pw, y, { color: COLORS.grid, width: 1 });
    text(ctx, tick(v), m.l - 6, y, { color: COLORS.text3, size: 10, family: 'mono', align: 'right' });
  }
  line(ctx, m.l, m.t - 6, m.l, m.t + ph, { color: COLORS.axis, width: 1.2 });
  line(ctx, m.l, m.t + ph, m.l + pw + 6, m.t + ph, { color: COLORS.axis, width: 1.2 });
  text(ctx, yLabel, 8, 12, { color: COLORS.text2, size: 11, family: 'mono' });
  text(ctx, xLabel, m.l + pw, H - 9, { color: COLORS.text2, size: 11, family: 'mono', align: 'right' });
  return { pw, ph, X: (v) => m.l + (v / xMax) * pw, Y: (v) => m.t + ph - (v / yMax) * ph };
}

function drawChart() {
  const { ctx, width: W, height: H } = chart;
  if (!W) return;
  clear(ctx, W, H, COLORS.canvasBg);
  const m = { l: 44, r: 16, t: 26, b: 38 };
  const st = S();

  if (current === 'ohm') {
    const U_MAXV = 24;
    let iTop = st.sw.K ? st.E / st.R1 : 0;
    for (const s of ohmSeries) for (const [, I] of s.pts) iTop = Math.max(iTop, I);
    const yMax = niceCeil(Math.max(0.5, iTop * 1.15));
    const ax = axes(ctx, W, H, m, U_MAXV, yMax, 'U, Վ', 'I, Ա');
    ctx.save();
    ctx.beginPath();
    ctx.rect(m.l, m.t - 4, ax.pw + 4, ax.ph + 4);
    ctx.clip();
    ohmSeries.forEach((s, i) => {
      const col = C.series[i % C.series.length];
      line(ctx, ax.X(0), ax.Y(0), ax.X(U_MAXV), ax.Y(U_MAXV / s.R), { color: alpha(col, 0.55), width: 1.3, dash: [5, 4] });
      for (const [U, I] of s.pts) circle(ctx, ax.X(U), ax.Y(I), 4, { fill: col, stroke: COLORS.canvasBg, width: 1.2 });
    });
    ctx.restore();
    // Legend: one row per series
    ohmSeries.forEach((s, i) => {
      const col = C.series[i % C.series.length];
      const y = m.t + 6 + i * 16;
      circle(ctx, m.l + 14, y, 4, { fill: col });
      text(ctx, `R = ${ohm(s.R)} Օմ, 1/R = ${num(1 / s.R)} Սմ`, m.l + 24, y, { color: COLORS.text2, size: 11, family: 'mono' });
    });
    if (st.sw.K) {
      const U = sol.res.V.U, I = sol.res.A.I;
      circle(ctx, ax.X(U), ax.Y(I), 7.5, { stroke: COLORS.text, width: 1.5 });
    }
    return;
  }

  // Real source: P(R) in the load
  const R_MAX = 20;
  const Pmax = (st.E * st.E) / (4 * st.r);
  const yMax = niceCeil(Math.max(1, Pmax * 1.12));
  const ax = axes(ctx, W, H, m, R_MAX, yMax, 'R, Օմ', 'P, Վտ');
  const Pof = (R) => (st.E * st.E * R) / ((R + st.r) ** 2);
  ctx.save();
  ctx.beginPath();
  ctx.rect(m.l, m.t - 4, ax.pw + 4, ax.ph + 4);
  ctx.clip();
  line(ctx, ax.X(st.r), ax.Y(0), ax.X(st.r), ax.Y(Pmax), { color: alpha(COLORS.coral, 0.7), width: 1, dash: [4, 4] });
  line(ctx, ax.X(0), ax.Y(Pmax), ax.X(st.r), ax.Y(Pmax), { color: alpha(COLORS.coral, 0.7), width: 1, dash: [4, 4] });
  ctx.strokeStyle = C.series[0];
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= 400; i++) {
    const R = (R_MAX * i) / 400;
    const x = ax.X(R), y = ax.Y(Pof(R));
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.stroke();
  for (const [R, Pl] of srcPts) circle(ctx, ax.X(R), ax.Y(Pl), 3.5, { fill: C.series[2], stroke: COLORS.canvasBg, width: 1 });
  ctx.restore();
  const lx = ax.X(st.r) + 6;
  text(ctx, `R = r,  Pmax = ${num(Pmax)} Վտ`, Math.min(lx, W - m.r - 150), m.t + 4, { color: COLORS.coral, size: 11, family: 'mono' });
  if (st.sw.K) {
    const Rext = st.sw.KS ? 0 : st.RL;
    const Pl = sol.res.R1.P;
    circle(ctx, ax.X(Rext), ax.Y(Pl), 6, { fill: C.series[2], stroke: COLORS.text, width: 1.5 });
  }
}

// ---------- Main loop ----------
startLoop((dt) => {
  L = layout(view.width);
  stepCarriers(dt);
  drawScene();
  if (chartDirty && !byId('chartBox').hidden) { chartDirty = false; drawChart(); }
});

onThemeChange(() => { chartDirty = true; });
fontsReady().then(() => { chartDirty = true; });
L = layout(view.width);
cv.style.height = `${L.H}px`;
syncLegend();
update();
