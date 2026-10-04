// Electric field and potential of point charges.
//
// World: a 80 cm × 56 cm plane, origin in the centre, y up, SI units
// (metres, charges in nC — see field.js). The static layers (potential map,
// grid, equipotentials, field lines, vector grid) are recomputed only when
// the charges change and are cached in an offscreen canvas; charges, probe
// and the test charge are drawn on top every frame that needs it.

import { fluidCanvas, onDrag } from '../../../assets/js/core/canvas.js';
import { startLoop } from '../../../assets/js/core/loop.js';
import { bindRange, bindCheckbox, bindSegmented, onClick } from '../../../assets/js/core/controls.js';
import { byId, setText } from '../../../assets/js/core/dom.js';
import { clear, line, arrow, circle, text } from '../../../assets/js/core/draw.js';
import { COLORS, themed, alpha, onThemeChange, fontsReady, font } from '../../../assets/js/core/theme.js';
import { clamp } from '../../../assets/js/core/math.js';
import {
  K, NC, fieldAt, potentialAt, traceFieldLines, potentialGrid, potentialLevels, contours, stepParticle,
} from './field.js';

const C = themed((light) => ({
  pos: COLORS.red,
  posRim: light ? '#8f1f1f' : '#ffb3b3',
  neg: COLORS.blue,
  negRim: light ? '#0f4a86' : '#b5dcff',
  fieldLine: light ? 'rgba(44,51,80,0.72)' : 'rgba(205,211,238,0.7)',
  eqPos: alpha(COLORS.red, 0.85),
  eqNeg: alpha(COLORS.blue, 0.85),
  eqZero: COLORS.text3,
  vector: COLORS.teal,
  probe: COLORS.amber,
  testPos: COLORS.green,
  testNeg: COLORS.purple,
  select: COLORS.text,
  gridStrong: light ? 'rgba(30,42,90,0.13)' : 'rgba(120,140,200,0.14)',
  mapAlpha: light ? 0.5 : 0.6,
}));

// ---------- World ----------
const WORLD_W = 0.8;                 // m
const ASPECT = 0.7;
const WORLD_H = WORLD_W * ASPECT;    // m
const BOUNDS = { xmin: -WORLD_W / 2, xmax: WORLD_W / 2, ymin: -WORLD_H / 2, ymax: WORLD_H / 2 };
const MAX_CHARGES = 12;

// Test charge: |q0| = 1 nC, m = 10 mg.
const TEST_Q = 1e-9;                 // C
const TEST_M = 1e-5;                 // kg
const TEST_H = 1 / 4000;             // s, fixed integration step
const TEST_T_MAX = 30;               // s
const MAX_TRAILS = 6;

// ---------- State ----------
let charges = [];
let selected = -1;
const probe = { x: 0, y: 0 };
let test = null;                     // { x, y, vx, vy, t, phi0, sign, state }
let trails = [];                     // [{ sign, pts: [x, y, …] }]
let stepDebt = 0;

let geomDirty = true;                // recompute lines / contours
let staticDirty = true;              // repaint the cached layer
let needsDraw = true;
let lowDetail = false;               // while dragging a charge

const cache = { lines: [], arrows: [], eq: null, map: null, cell: 5, levels: [] };

// ---------- Canvas ----------
const view = fluidCanvas(byId('cv'), {
  height: (w) => Math.round(w * ASPECT),
  onResize: () => { geomDirty = true; },
});
const { ctx } = view;
const layer = document.createElement('canvas');   // cached static layers
const lctx = layer.getContext('2d');
const mapCanvas = document.createElement('canvas');
const mctx = mapCanvas.getContext('2d');

let S = 1;                           // px per metre
const px = (x) => view.width / 2 + x * S;
const py = (y) => view.height / 2 - y * S;
const wx = (X) => (X - view.width / 2) / S;
const wy = (Y) => (view.height / 2 - Y) / S;
const chargeR = () => (view.width >= 600 ? 11 : 9);   // px

// ---------- Formatting ----------
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
function fmt(v) {
  const a = Math.abs(v);
  if (!Number.isFinite(v)) return '—';
  if (a < 5e-4) return '0';
  if (a >= 1e5) {
    const e = Math.floor(Math.log10(a));
    return `${(v / 10 ** e).toFixed(2)}·10${String(e).split('').map((ch) => SUP[ch]).join('')}`.replace('-', '−');
  }
  const s = a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : a >= 0.995 ? v.toFixed(2) : v.toFixed(3);
  return (parseFloat(s) === 0 ? s.replace('-', '') : s).replace('-', '−');
}
const fmtQ = (q) => `${q > 0 ? '+' : '−'}${Math.abs(q)} նԿլ`;

// ---------- Controls ----------
const layers = {
  lines: bindCheckbox('showLines', { onChange: markGeom }),
  equip: bindCheckbox('showEquip', { onChange: markGeom }),
  vectors: bindCheckbox('showVectors', { onChange: markGeom }),
  map: bindCheckbox('showMap', { onChange: markGeom }),
};

let lastQ = 1;
const qCtl = bindRange('qSlider', {
  format: fmtQ,
  onInput: (v) => {
    // q = 0 is no charge: skip over it in the direction the slider moved.
    if (v === 0) qCtl.set(lastQ > 0 ? -1 : 1, { silent: true });
    lastQ = qCtl.value;
    if (charges[selected]) {
      charges[selected].q = qCtl.value;
      markGeom();
    }
  },
});

const signCtl = bindSegmented('testSign');

function markGeom() {
  geomDirty = true;
}

function syncUI() {
  const c = charges[selected];
  qCtl.input.disabled = !c;
  if (c) {
    qCtl.set(c.q, { silent: true });
    lastQ = c.q;
  } else {
    qCtl.show('—');
  }
  byId('addPos').disabled = byId('addNeg').disabled = charges.length >= MAX_CHARGES;
  byId('removeBtn').disabled = byId('clearBtn').disabled = charges.length === 0;
  setText('countHint', `Լիցքերի թիվը՝ ${charges.length} (առավելագույնը՝ ${MAX_CHARGES})։ Լիցքն ընտրելու համար սեղմեք դրա վրա։`);
}

function setCharges(list, sel, probePos) {
  charges = list;
  selected = sel;
  if (probePos) { probe.x = probePos[0]; probe.y = probePos[1]; }
  test = null;
  trails = [];
  syncUI();
  markGeom();
}

const PRESETS = {
  single: () => setCharges([{ x: 0, y: 0, q: 1 }], 0, [0.1, 0]),
  dipole: () => setCharges([{ x: -0.1, y: 0, q: 1 }, { x: 0.1, y: 0, q: -1 }], 0, [0, 0]),
  like: () => setCharges([{ x: -0.1, y: 0, q: 1 }, { x: 0.1, y: 0, q: 1 }], 0, [0, 0.1]),
  plates: () => {
    const list = [];
    for (const [y, q] of [[0.08, 1], [-0.08, -1]]) {
      for (let i = 0; i < 6; i++) list.push({ x: -0.15 + i * 0.06, y, q });
    }
    setCharges(list, -1, [0, 0]);
  },
};
onClick('presetSingle', PRESETS.single);
onClick('presetDipole', PRESETS.dipole);
onClick('presetLike', PRESETS.like);
onClick('presetPlates', PRESETS.plates);

// Free spots for new charges, tried in this order.
const SPOTS = [
  [0, 0], [0.1, 0], [-0.1, 0], [0, 0.1], [0, -0.1], [0.2, 0.1], [-0.2, 0.1], [0.2, -0.1], [-0.2, -0.1],
  [0.1, 0.18], [-0.1, 0.18], [0.1, -0.18], [-0.1, -0.18], [0.3, 0], [-0.3, 0], [0.3, 0.18], [-0.3, -0.18],
];
function addCharge(q) {
  if (charges.length >= MAX_CHARGES) return;
  const free = SPOTS.find(([x, y]) => charges.every((c) => Math.hypot(c.x - x, c.y - y) > 0.045)) ?? [0.3, -0.2];
  charges.push({ x: free[0], y: free[1], q });
  selected = charges.length - 1;
  syncUI();
  markGeom();
}
onClick('addPos', () => addCharge(1));
onClick('addNeg', () => addCharge(-1));
onClick('removeBtn', () => {
  if (!charges.length) return;
  charges.splice(charges[selected] ? selected : charges.length - 1, 1);
  selected = charges.length - 1;
  syncUI();
  markGeom();
});
onClick('clearBtn', () => setCharges([], -1));

onClick('releaseBtn', () => {
  const sign = Number(signCtl.value);
  test = {
    x: probe.x, y: probe.y, vx: 0, vy: 0, t: 0, sign,
    phi0: potentialAt(charges, probe.x, probe.y),
    state: 'run',
  };
  stepDebt = 0;
  trails.push({ sign, pts: [probe.x, probe.y] });
  if (trails.length > MAX_TRAILS) trails.shift();
  needsDraw = true;
});
onClick('clearTrails', () => {
  trails = [];
  test = null;
  needsDraw = true;
});

// ---------- Dragging ----------
let drag = null;   // { kind: 'charge' | 'probe', dx, dy }
const snap = (v) => Math.round(v * 1000) / 1000;   // 1 mm

function pick(p) {
  const r = chargeR();
  const dist = (o) => Math.hypot(px(o.x) - p.x, py(o.y) - p.y);
  let best = -1, bestD = Infinity;
  charges.forEach((c, i) => { const d = dist(c); if (d < bestD) { bestD = d; best = i; } });
  if (bestD <= r) return { kind: 'charge', index: best };
  if (dist(probe) <= 16) return { kind: 'probe' };
  if (bestD <= r + 10) return { kind: 'charge', index: best };
  return null;
}

onDrag(view, {
  start: (p) => {
    const hit = pick(p);
    if (hit?.kind === 'charge') {
      selected = hit.index;
      const c = charges[selected];
      drag = { kind: 'charge', dx: c.x - wx(p.x), dy: c.y - wy(p.y) };
      syncUI();
    } else if (hit) {
      drag = { kind: 'probe', dx: probe.x - wx(p.x), dy: probe.y - wy(p.y) };
    } else {
      // Empty space: the probe jumps under the pointer.
      drag = { kind: 'probe', dx: 0, dy: 0 };
      probe.x = snap(wx(p.x));
      probe.y = snap(wy(p.y));
    }
    needsDraw = true;
  },
  move: (p) => {
    if (!drag) return;
    const m = 0.01;
    const x = snap(clamp(wx(p.x) + drag.dx, BOUNDS.xmin + m, BOUNDS.xmax - m));
    const y = snap(clamp(wy(p.y) + drag.dy, BOUNDS.ymin + m, BOUNDS.ymax - m));
    if (drag.kind === 'charge') {
      const c = charges[selected];
      if (c.x === x && c.y === y) return;
      c.x = x; c.y = y;
      lowDetail = true;
      geomDirty = true;
    } else {
      probe.x = x; probe.y = y;
      needsDraw = true;
    }
  },
  end: () => {
    if (drag?.kind === 'charge' && lowDetail) {
      lowDetail = false;
      geomDirty = true;
    }
    drag = null;
  },
});

// ---------- Field strength → drawing scale ----------
/** 0…1 on a logarithmic scale around the field of the largest charge at 10 cm. */
function strength(E) {
  const qmax = charges.reduce((m, c) => Math.max(m, Math.abs(c.q)), 0);
  if (!qmax || !(E > 0)) return 0;
  const ref = (K * qmax * NC) / 0.01;
  return clamp((Math.log10(E / ref) + 1.3) / 2.3, 0, 1);
}

// ---------- Recompute cached geometry ----------
function inView(x, y, inset = 0.012) {
  return x > BOUNDS.xmin + inset && x < BOUNDS.xmax - inset && y > BOUNDS.ymin + inset && y < BOUNDS.ymax - inset;
}

/** Arrowhead positions [x, y, angle(px space)] along the visible part of a field line. */
function arrowSpots(pts) {
  const clearR = (chargeR() + 9) / S;
  const idx = [], cum = [];
  let total = 0;
  for (let i = 2; i < pts.length - 2; i += 2) {
    const x = pts[i], y = pts[i + 1];
    if (!inView(x, y) || charges.some((c) => Math.hypot(c.x - x, c.y - y) < clearR)) continue;
    total += Math.hypot(x - pts[i - 2], y - pts[i - 1]);
    idx.push(i);
    cum.push(total);
  }
  if (total < 0.03) return [];
  const spots = [];
  for (const f of total > 0.45 ? [0.25, 0.75] : [0.5]) {
    const k = cum.findIndex((v) => v >= f * total);
    const i = idx[k];
    spots.push([pts[i], pts[i + 1], Math.atan2(-(pts[i + 3] - pts[i - 1]), pts[i + 2] - pts[i - 2])]);
  }
  return spots;
}

function hexRGB(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

function recompute() {
  const { width: W, height: H } = view;
  S = W / WORLD_W;
  const n = charges.length;

  cache.lines = [];
  cache.arrows = [];
  if (layers.lines.checked && n) {
    cache.lines = traceFieldLines(charges, {
      bounds: BOUNDS,
      ds: lowDetail ? 0.006 : 0.0025,
      base: clamp(Math.round(48 / n), 6, 16),
    });
    for (const l of cache.lines) cache.arrows.push(...arrowSpots(l));
  }

  cache.levels = potentialLevels(charges);
  cache.eq = null;
  cache.map = null;
  if ((layers.equip.checked || layers.map.checked) && n) {
    const cell = lowDetail ? 10 : W >= 600 ? 5 : 4;
    const nx = Math.ceil(W / cell), ny = Math.ceil(H / cell);
    const grid = potentialGrid(charges, BOUNDS, nx, ny);
    if (layers.equip.checked) cache.eq = contours(grid, BOUNDS, nx, ny, cache.levels);
    if (layers.map.checked) {
      // One image pixel per grid node; red for φ > 0, blue for φ < 0,
      // opacity grows with log|φ|.
      const cols = nx + 1, rows = ny + 1;
      mapCanvas.width = cols;
      mapCanvas.height = rows;
      const img = mctx.createImageData(cols, rows);
      const pos = hexRGB(COLORS.red), neg = hexRGB(COLORS.blue);
      const lo = Math.abs(cache.levels[cache.levels.length - 1] || 1) / 300;   // ≈ ref / 10
      const span = Math.log(300);
      for (let i = 0; i < grid.length; i++) {
        const v = grid[i];
        const t = clamp(Math.log(Math.abs(v) / lo) / span, 0, 1);
        const rgb = v > 0 ? pos : neg;
        img.data[4 * i] = rgb[0];
        img.data[4 * i + 1] = rgb[1];
        img.data[4 * i + 2] = rgb[2];
        img.data[4 * i + 3] = Math.round(255 * C.mapAlpha * t);
      }
      mctx.putImageData(img, 0, 0);
      cache.map = { nx, ny };
    }
  }

  const shown = cache.levels.filter((v) => v > 0).slice(0, 5);
  const neg = cache.levels.filter((v) => v < 0).reverse().slice(0, 5).map((v) => -v);
  const list = (shown.length ? shown : neg).map(String).join(', ');
  setText('levelsHint', list
    ? `Էկվիպոտենցիալ գծերի մակարդակները՝ ±${list} Վ և ավելի բարձր։ Վեկտորների երկարությունն ու պայծառությունը լարվածության մոդուլը ցույց են տալիս լոգարիթմական մասշտաբով։`
    : 'Ավելացրեք լիցք՝ դաշտը տեսնելու համար։');
}

// ---------- Static layer ----------
function strokeSegments(c, seg, color, width, dash) {
  if (!seg.length) return;
  c.save();
  c.strokeStyle = color;
  c.lineWidth = width;
  if (dash) c.setLineDash(dash);
  c.beginPath();
  for (let i = 0; i < seg.length; i += 4) {
    c.moveTo(px(seg[i]), py(seg[i + 1]));
    c.lineTo(px(seg[i + 2]), py(seg[i + 3]));
  }
  c.stroke();
  c.restore();
}

function renderStatic() {
  const { width: W, height: H, dpr } = view;
  if (layer.width !== view.canvas.width || layer.height !== view.canvas.height) {
    layer.width = view.canvas.width;
    layer.height = view.canvas.height;
  }
  const c = lctx;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  clear(c, W, H, COLORS.canvasBg);

  // Potential map
  if (cache.map) {
    const cw = W / cache.map.nx, ch = H / cache.map.ny;
    c.imageSmoothingEnabled = true;
    c.drawImage(mapCanvas, -cw / 2, -ch / 2, W + cw, H + ch);
  }

  // Grid: 5 cm cells, every 10 cm stronger, axes through the origin
  for (let i = -8; i <= 8; i++) {
    const strong = i % 2 === 0;
    const opt = { color: i === 0 ? COLORS.axis : strong ? C.gridStrong : COLORS.grid, width: i === 0 ? 1 : strong ? 1 : 0.5 };
    line(c, px(i * 0.05), 0, px(i * 0.05), H, opt);
    if (Math.abs(i * 0.05) <= WORLD_H / 2) line(c, 0, py(i * 0.05), W, py(i * 0.05), opt);
  }
  text(c, 'x', W - 8, py(0) - 9, { color: COLORS.text3, size: 11, family: 'mono', style: 'italic', align: 'right' });
  text(c, 'y', px(0) + 7, 9, { color: COLORS.text3, size: 11, family: 'mono', style: 'italic' });

  // Equipotential lines
  if (cache.eq) {
    strokeSegments(c, cache.eq.zero, C.eqZero, 1, [5, 4]);
    strokeSegments(c, cache.eq.pos, C.eqPos, 1.1);
    strokeSegments(c, cache.eq.neg, C.eqNeg, 1.1);
  }

  // Field lines
  if (cache.lines.length) {
    c.save();
    c.strokeStyle = C.fieldLine;
    c.fillStyle = C.fieldLine;
    c.lineWidth = 1.3;
    c.lineJoin = 'round';
    for (const l of cache.lines) {
      c.beginPath();
      c.moveTo(px(l[0]), py(l[1]));
      for (let i = 2; i < l.length; i += 2) c.lineTo(px(l[i]), py(l[i + 1]));
      c.stroke();
    }
    const h = W >= 600 ? 9 : 7;
    for (const [x, y, a] of cache.arrows) {
      const X = px(x) + Math.cos(a) * h * 0.5, Y = py(y) + Math.sin(a) * h * 0.5;
      c.beginPath();
      c.moveTo(X, Y);
      c.lineTo(X - h * Math.cos(a - 0.42), Y - h * Math.sin(a - 0.42));
      c.lineTo(X - h * Math.cos(a + 0.42), Y - h * Math.sin(a + 0.42));
      c.closePath();
      c.fill();
    }
    c.restore();
  }

  // Field vector grid
  if (layers.vectors.checked && charges.length) {
    const sp = W >= 600 ? 40 : 30;
    const cols = Math.floor(W / sp), rows = Math.floor(H / sp);
    const ox = (W - cols * sp) / 2 + sp / 2, oy = (H - rows * sp) / 2 + sp / 2;
    const e = { ex: 0, ey: 0 };
    const keep = chargeR() + 6;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const X = ox + i * sp, Y = oy + j * sp;
        if (charges.some((q) => Math.hypot(px(q.x) - X, py(q.y) - Y) < keep)) continue;
        fieldAt(charges, wx(X), wy(Y), e);
        const E = Math.hypot(e.ex, e.ey);
        if (!(E > 0)) continue;
        const t = strength(E);
        const len = sp * 0.78 * (0.4 + 0.6 * t);
        const ux = e.ex / E, uy = -e.ey / E;
        arrow(c, X - ux * len / 2, Y - uy * len / 2, X + ux * len / 2, Y + uy * len / 2, {
          color: alpha(C.vector, 0.3 + 0.7 * t), width: 1.3, head: 6, spread: 0.45,
        });
      }
    }
  }

  // Scale bar: 10 cm
  const bx = 14, by = H - 16, bw = 0.1 * S;
  line(c, bx, by, bx + bw, by, { color: COLORS.text2, width: 1.5 });
  line(c, bx, by - 4, bx, by + 4, { color: COLORS.text2, width: 1.5 });
  line(c, bx + bw, by - 4, bx + bw, by + 4, { color: COLORS.text2, width: 1.5 });
  c.fillStyle = alpha(COLORS.canvasBg, 0.8);
  c.fillRect(bx - 6, by - 18, bw + 12, 26);
  line(c, bx, by, bx + bw, by, { color: COLORS.text2, width: 1.5 });
  text(c, '10 սմ', bx + bw / 2, by - 9, { color: COLORS.text2, size: 11, align: 'center' });
}

// ---------- Dynamic layer ----------
const probeField = { ex: 0, ey: 0 };

function drawTrails() {
  for (const tr of trails) {
    const color = tr.sign > 0 ? C.testPos : C.testNeg;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(px(tr.pts[0]), py(tr.pts[1]));
    for (let i = 2; i < tr.pts.length; i += 2) ctx.lineTo(px(tr.pts[i]), py(tr.pts[i + 1]));
    ctx.stroke();
    ctx.restore();
    // Start mark
    circle(ctx, px(tr.pts[0]), py(tr.pts[1]), 3, { fill: COLORS.canvasBg, stroke: color, width: 1.5 });
  }
}

function drawCharges() {
  const r = chargeR();
  const labels = view.width >= 600 && charges.length <= 8;
  charges.forEach((c, i) => {
    const X = px(c.x), Y = py(c.y);
    const posi = c.q > 0;
    if (i === selected) {
      ctx.save();
      ctx.setLineDash([4, 3]);
      circle(ctx, X, Y, r + 5, { stroke: C.select, width: 1.3 });
      ctx.restore();
    }
    circle(ctx, X, Y, r, { fill: posi ? C.pos : C.neg, stroke: posi ? C.posRim : C.negRim, width: 1.5 });
    text(ctx, posi ? '+' : '−', X, Y + 0.5, { color: '#fff', size: r * 1.35, weight: 700, family: 'mono', align: 'center' });
    if (labels || i === selected) {
      const below = Y + r + 22 < view.height;
      const ly = below ? Y + r + (i === selected ? 15 : 11) : Y - r - (i === selected ? 15 : 11);
      const str = fmtQ(c.q);
      ctx.save();
      ctx.font = font(11, { weight: 600 });
      const w = ctx.measureText(str).width + 10;
      ctx.restore();
      ctx.fillStyle = alpha(COLORS.canvasBg, 0.78);
      ctx.fillRect(X - w / 2, ly - 8, w, 16);
      text(ctx, str, X, ly, { color: posi ? C.pos : C.neg, size: 11, weight: 600, align: 'center' });
    }
  });
}

function drawProbe() {
  const X = px(probe.x), Y = py(probe.y);
  fieldAt(charges, probe.x, probe.y, probeField);
  const E = Math.hypot(probeField.ex, probeField.ey);
  if (E > 0) {
    const len = 26 + 54 * strength(E);
    const ux = probeField.ex / E, uy = -probeField.ey / E;
    arrow(ctx, X, Y, X + ux * len, Y + uy * len, { color: C.probe, width: 2.5, head: 10 });
    // Label beside the arrow tip, pushed away from the arrow direction.
    text(ctx, 'E', X + ux * (len + 10) - uy * 4, Y + uy * (len + 10) + ux * 4, {
      color: C.probe, size: 13, weight: 700, family: 'mono', style: 'italic', align: 'center',
    });
  }
  line(ctx, X - 11, Y, X + 11, Y, { color: C.probe, width: 1.2 });
  line(ctx, X, Y - 11, X, Y + 11, { color: C.probe, width: 1.2 });
  circle(ctx, X, Y, 6.5, { fill: alpha(COLORS.canvasBg, 0.85), stroke: C.probe, width: 2 });
  circle(ctx, X, Y, 1.8, { fill: C.probe });

  // Readouts
  const phi = potentialAt(charges, probe.x, probe.y);
  setText('probeE', `${fmt(E)} Վ/մ`);
  if (E > 0) {
    let a = (Math.atan2(probeField.ey, probeField.ex) * 180) / Math.PI;
    a = Math.round(a * 10) / 10;
    if (a < 0) a += 360;
    if (a >= 360) a -= 360;
    setText('probeDir', `${a.toFixed(1)}° x առանցքից`);
  } else {
    setText('probeDir', '—');
  }
  setText('probePhi', `${fmt(phi)} Վ`);
  setText('probePos', `x = ${(probe.x * 100).toFixed(1)} սմ, y = ${(probe.y * 100).toFixed(1)} սմ`.replace(/-/g, '−'));
  const c = charges[selected];
  setText('probeR', c ? `r = ${(Math.hypot(probe.x - c.x, probe.y - c.y) * 100).toFixed(1)} սմ` : '—');
}

const STATE_TEXT = {
  run: 'շարժվում է',
  hit: 'հասավ լիցքին',
  out: 'դուրս եկավ տեսադաշտից',
  timeout: 'դիտումն ավարտվեց',
};

function drawTest() {
  if (!test) {
    for (const id of ['testState', 'testT', 'testV', 'testEk', 'testW']) setText(id, '—');
    return;
  }
  const color = test.sign > 0 ? C.testPos : C.testNeg;
  if (test.state !== 'out') {
    const X = px(test.x), Y = py(test.y);
    circle(ctx, X, Y, 6, { fill: color, stroke: COLORS.canvasBg, width: 1.5 });
    text(ctx, test.sign > 0 ? '+' : '−', X, Y + 0.5, { color: COLORS.canvasBg, size: 10, weight: 700, family: 'mono', align: 'center' });
  }
  const v = Math.hypot(test.vx, test.vy);
  const q0 = test.sign * TEST_Q;
  setText('testState', STATE_TEXT[test.state]);
  setText('testT', `${test.t.toFixed(2)} վ`);
  setText('testV', `${fmt(v)} մ/վ`);
  setText('testEk', `${fmt((TEST_M * v * v) / 2 / 1e-9)} նՋ`);
  setText('testW', `${fmt((q0 * (test.phi0 - potentialAt(charges, test.x, test.y))) / 1e-9)} նՋ`);
}

function stepTest(dt) {
  if (!test || test.state !== 'run') return;
  const qm = (test.sign * TEST_Q) / TEST_M;
  const hitR = chargeR() / S;
  const tr = trails[trails.length - 1];
  const minMove = 1.5 / S;
  stepDebt += dt;
  while (stepDebt >= TEST_H && test.state === 'run') {
    stepDebt -= TEST_H;
    stepParticle(test, charges, qm, TEST_H);
    test.t += TEST_H;
    if (charges.some((c) => Math.hypot(c.x - test.x, c.y - test.y) < hitR)) test.state = 'hit';
    else if (!inView(test.x, test.y, 0)) test.state = 'out';
    else if (test.t >= TEST_T_MAX) test.state = 'timeout';
    const n = tr.pts.length;
    if (test.state !== 'run' || Math.hypot(test.x - tr.pts[n - 2], test.y - tr.pts[n - 1]) >= minMove) {
      if (n < 40000) tr.pts.push(test.x, test.y);
    }
  }
  needsDraw = true;
}

function draw() {
  const { width: W, height: H } = view;
  ctx.drawImage(layer, 0, 0, W, H);
  drawTrails();
  drawCharges();
  drawTest();
  drawProbe();
}

// ---------- Loop ----------
startLoop((dt) => {
  if (!view.width) return;
  if (geomDirty) {
    recompute();
    geomDirty = false;
    staticDirty = true;
  }
  if (staticDirty) {
    renderStatic();
    staticDirty = false;
    needsDraw = true;
  }
  stepTest(dt);
  if (needsDraw) {
    needsDraw = false;
    draw();
  }
});

// The map colours are baked into the cache, so a theme change recomputes it.
onThemeChange(() => { geomDirty = true; });
fontsReady().then(() => { staticDirty = true; });

PRESETS.dipole();
