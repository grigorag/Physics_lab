// Tab 1 — two carts on a frictionless track (1D collision).
// The physics (exact contact times, no overlap) lives in physics.js; this file
// holds the controls, the scene, the live bar chart and the numeric read-outs.

import { fluidCanvas } from '../../../assets/js/core/canvas.js';
import {
  bindRange, bindCheckbox, bindSegmented, bindPlayPause, onClick,
} from '../../../assets/js/core/controls.js';
import { byId, $$, setText, setHTML } from '../../../assets/js/core/dom.js';
import { clear, line, arrow, circle, text, roundRect } from '../../../assets/js/core/draw.js';
import { COLORS, themed, alpha, font } from '../../../assets/js/core/theme.js';
import { clamp } from '../../../assets/js/core/math.js';
import {
  TRACK, createCarts, advance, predictCollision, isFinished, centreOfMass, kinetic,
} from './physics.js';
import { fmt, fmtZero, symbol } from './shared.js';

const C = themed((light) => ({
  c1: COLORS.blue,
  c2: COLORS.coral,
  total: COLORS.purple,
  heat: COLORS.red,
  track: light ? 'rgba(30,42,90,0.45)' : 'rgba(170,180,215,0.5)',
  wall: light ? '#5d6788' : '#8a94b8',
  cm: COLORS.green,
  wheel: light ? '#3a4262' : '#c5cbe3',
}));

const EXAMPLES = {
  equal: { m1: 2, m2: 2, v1: 3, v2: 0, e: 1 },
  heavy: { m1: 6, m2: 1, v1: 3, v2: 0, e: 1 },
  light: { m1: 1, m2: 6, v1: 3, v2: 0, e: 1 },
  head: { m1: 3, m2: 2, v1: 2, v2: -3, e: 1 },
};

export function createLine() {
  const P = { m1: 2, m2: 1, v1: 3, v2: 0, e: 1, walls: false };
  let S = null;            // simulation state
  let pred = null;         // predicted first cart–cart collision
  let last = null;         // last cart–cart collision that really happened
  let flashes = [];        // collision sparks: { x, age }
  let speed = 1;
  let showCm = true;
  let peaks = { p: 1, E: 1 };
  let p0 = 0, E0 = 0;

  const view = fluidCanvas(byId('lCv'), {
    height: (w) => clamp(Math.round(w * 0.3), 210, 270),
    onResize: () => drawScene(),
  });
  const chartView = fluidCanvas(byId('lChart'), {
    height: (w) => clamp(Math.round(w * 0.42), 230, 280),
    onResize: () => drawChart(),
  });

  // ---------- Controls ----------
  const fmtM = (v) => `${v.toFixed(1)} կգ`;
  const fmtV = (v) => `${fmt(v, 1)} մ/վ`;
  const changed = () => { readParams(); reset(); };
  const m1 = bindRange('lM1', { format: fmtM, onInput: changed });
  const m2 = bindRange('lM2', { format: fmtM, onInput: changed });
  const v1 = bindRange('lV1', { format: fmtV, onInput: changed });
  const v2 = bindRange('lV2', { format: fmtV, onInput: changed });
  const preset = bindSegmented('lPreset', {
    onChange: (val) => { eRange.set(parseFloat(val)); },
  });
  const eRange = bindRange('lE', {
    format: (v) => v.toFixed(2),
    onInput: (v) => {
      preset.set(v === 1 || v === 0.5 || v === 0 ? String(v) : '', { silent: true });
      changed();
    },
  });
  bindCheckbox('lCm', { onChange: (c) => { showCm = c; } });
  bindCheckbox('lWalls', { onChange: changed });
  bindSegmented('lSpeed', { onChange: (val) => { speed = parseFloat(val); } });
  const play = bindPlayPause('lPlay', {
    paused: true,
    label: (p) => (p ? (S && S.t > 0 ? '▶ Շարունակել' : '▶ Սկսել') : '⏸ Դադար'),
  });
  onClick('lReset', () => reset());
  $$('[data-ex]', byId('panel-line')).forEach((b) => b.addEventListener('click', () => {
    const ex = EXAMPLES[b.dataset.ex];
    m1.set(ex.m1, { silent: true });
    m2.set(ex.m2, { silent: true });
    v1.set(ex.v1, { silent: true });
    v2.set(ex.v2, { silent: true });
    eRange.set(ex.e, { silent: true });
    preset.set(String(ex.e), { silent: true });
    changed();
  }));

  function readParams() {
    P.m1 = m1.value; P.m2 = m2.value; P.v1 = v1.value; P.v2 = v2.value;
    P.e = eRange.value;
    P.walls = byId('lWalls').checked;
  }

  function reset() {
    S = createCarts(P);
    pred = predictCollision(S);
    last = null;
    flashes = [];
    p0 = P.m1 * P.v1 + P.m2 * P.v2;
    E0 = kinetic(P.m1, P.v1) + kinetic(P.m2, P.v2);
    peaks = { p: Math.max(Math.abs(P.m1 * P.v1), Math.abs(P.m2 * P.v2), Math.abs(p0), 0.5), E: Math.max(E0, 0.1) };
    if (pred) {
      const { m1: a, m2: b } = P;
      peaks.p = Math.max(peaks.p, Math.abs(a * pred.after.v1), Math.abs(b * pred.after.v2));
    }
    play.set(true);
    updateReadouts();
  }

  // ---------- Frame ----------
  function frame(dt) {
    if (!play.paused) {
      const events = advance(S, dt * speed);
      for (const ev of events) {
        if (ev.type === 'carts') last = ev;
        flashes.push({ x: ev.x, age: 0, wall: ev.type !== 'carts' });
      }
      if (isFinished(S)) play.set(true);
    }
    flashes.forEach((f) => { f.age += dt; });
    flashes = flashes.filter((f) => f.age < 0.5);
    track();
    updateReadouts();
    drawScene();
    drawChart();
  }

  function track() {
    peaks.p = Math.max(peaks.p, Math.abs(S.m1 * S.v1), Math.abs(S.m2 * S.v2), Math.abs(S.m1 * S.v1 + S.m2 * S.v2));
  }

  // ---------- Scene ----------
  function drawScene() {
    const { ctx, width: W, height: H } = view;
    if (!W || !S) return;
    clear(ctx, W, H, COLORS.canvasBg);

    const PAD = 18;
    const s = (W - 2 * PAD) / TRACK.L;
    const X = (x) => PAD + x * s;
    const yT = H - 38;                       // track surface

    // Velocity labels in a fixed top row.
    text(ctx, `v₁ = ${fmt(S.v1, 2)} մ/վ`, 12, 15, { color: C.c1, size: 12, family: 'mono', weight: 600 });
    text(ctx, `v₂ = ${fmt(S.v2, 2)} մ/վ`, W - 12, 15, { color: C.c2, size: 12, family: 'mono', weight: 600, align: 'right' });

    // Scale under the track.
    for (let k = 0; k <= TRACK.L; k++) {
      const major = k % 2 === 0;
      line(ctx, X(k), yT, X(k), yT + (major ? 8 : 4), { color: COLORS.axis, width: 1 });
      if (major) text(ctx, String(k), X(k), yT + 19, { color: COLORS.text3, size: 10, family: 'mono', align: 'center' });
    }
    text(ctx, 'x, մ', W - 8, yT + 33, { color: COLORS.text3, size: 10, align: 'right' });
    line(ctx, 0, yT, W, yT, { color: C.track, width: 2 });

    // Walls
    if (S.walls) {
      for (const [x, dir] of [[0, -1], [TRACK.L, 1]]) {
        ctx.save();
        ctx.fillStyle = C.wall;
        ctx.fillRect(X(x) + (dir < 0 ? -5 : 0), yT - 90, 5, 90);
        ctx.strokeStyle = C.wall;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let y = yT - 88; y < yT; y += 9) {
          ctx.moveTo(X(x) + (dir < 0 ? -5 : 5), y);
          ctx.lineTo(X(x) + (dir < 0 ? -12 : 12), y + 7);
        }
        ctx.stroke();
        ctx.restore();
      }
    }

    // Centre-of-mass line (behind the carts)
    const xcm = centreOfMass(S);
    if (showCm) {
      line(ctx, X(xcm), 34, X(xcm), yT, { color: C.cm, width: 1.5, dash: [4, 4] });
    }

    // Carts
    const carts = [
      { x: S.x1, w: S.w1, m: S.m1, v: S.v1, color: C.c1 },
      { x: S.x2, w: S.w2, m: S.m2, v: S.v2, color: C.c2 },
    ];
    const kA = clamp(s * 0.7, 10, 44);          // px per m/s for the velocity arrows
    for (const c of carts) {
      const wpx = c.w * s;
      const hpx = clamp(wpx * 0.62, 28, 110);
      const wr = clamp(hpx * 0.14, 3.5, 8);
      const left = X(c.x) - wpx / 2;
      const top = yT - 2 * wr - hpx + 1;
      ctx.fillStyle = alpha(c.color, 0.22);
      roundRect(ctx, left, top, wpx, hpx, 5);
      ctx.fill();
      ctx.strokeStyle = c.color;
      ctx.lineWidth = 2;
      ctx.stroke();
      for (const fx of [0.22, 0.78]) {
        circle(ctx, left + wpx * fx, yT - wr, wr, { fill: C.wheel, stroke: COLORS.canvasBg, width: 1.5 });
      }
      text(ctx, wpx > 52 ? `${c.m.toFixed(1)} կգ` : c.m.toFixed(1), left + wpx / 2, top + hpx / 2, {
        color: COLORS.text, size: wpx > 52 ? 12 : 10, family: 'mono', weight: 600, align: 'center',
      });
      // velocity arrow
      const ay = top - 13;
      if (Math.abs(c.v) > 1e-9) {
        arrow(ctx, X(c.x), ay, X(c.x) + c.v * kA, ay, { color: c.color, width: 2.5, head: 9 });
      } else {
        circle(ctx, X(c.x), ay, 2.5, { fill: c.color });
      }
    }

    // Collision sparks
    for (const f of flashes) {
      const k = f.age / 0.5;
      circle(ctx, X(f.x), yT - 22, 8 + 26 * k, { stroke: alpha(f.wall ? COLORS.text2 : COLORS.amber, 1 - k), width: 2.5 });
    }

    // Centre-of-mass marker on top of the line
    if (showCm) {
      const cx = X(xcm);
      ctx.save();
      ctx.strokeStyle = C.cm;
      ctx.fillStyle = COLORS.canvasBg;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, 36, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 4, 32); ctx.lineTo(cx + 4, 40);
      ctx.moveTo(cx + 4, 32); ctx.lineTo(cx - 4, 40);
      ctx.stroke();
      ctx.restore();
      const lblLeft = cx > W - 50;
      text(ctx, 'ԶԿ', cx + (lblLeft ? -11 : 11), 36, { color: C.cm, size: 11, weight: 700, align: lblLeft ? 'right' : 'left' });
    }
  }

  // ---------- Bar chart ----------
  function drawChart() {
    const { ctx, width: W, height: H } = chartView;
    if (!W || !S) return;
    clear(ctx, W, H, COLORS.canvasBg);

    const p1 = S.m1 * S.v1, p2 = S.m2 * S.v2, pT = p1 + p2;
    const e1 = kinetic(S.m1, S.v1), e2 = kinetic(S.m2, S.v2);
    const eT = e1 + e2;

    const top = 46, bottom = H - 30;
    const gap = 14;
    const left = 12, right = W - 12;
    const slotW = (right - left - gap) / 7;
    const barW = Math.min(34, slotW * 0.64);
    const slotX = (i) => left + i * slotW + (i >= 3 ? gap : 0) + slotW / 2;

    // group titles
    const narrow = W < 460;
    text(ctx, narrow ? 'p, կգ·մ/վ' : 'Իմպուլս p, կգ·մ/վ', left, 14, { color: COLORS.text2, size: 11, weight: 600 });
    text(ctx, narrow ? 'E, Ջ' : 'Էներգիա E, Ջ', left + 3 * slotW + gap, 14, { color: COLORS.text2, size: 11, weight: 600 });
    line(ctx, left + 3 * slotW + gap / 2, 8, left + 3 * slotW + gap / 2, H - 8, { color: COLORS.grid, width: 1 });

    // ----- momentum (signed)
    const pMax = Math.max(peaks.p, Math.abs(p0)) * 1.1;
    const zero = (top + bottom) / 2;
    const half = (bottom - top) / 2 - 6;
    const gx0 = left, gx1 = left + 3 * slotW;
    line(ctx, gx0, zero, gx1, zero, { color: COLORS.axis, width: 1 });
    // initial total momentum level
    if (Math.abs(p0) > 1e-9) {
      const yRef = zero - (p0 / pMax) * half;
      line(ctx, gx0, yRef, gx1, yRef, { color: C.total, width: 1, dash: [3, 4] });
      text(ctx, 'p₀', gx0 + 2, yRef + (p0 > 0 ? -7 : 8), { color: C.total, size: 9, family: 'mono' });
    }
    const pBars = [
      { v: p1, color: C.c1, sym: ['p', '1'] },
      { v: p2, color: C.c2, sym: ['p', '2'] },
      { v: pT, color: C.total, sym: ['p', ''] },
    ];
    pBars.forEach((b, i) => {
      const x = slotX(i);
      const h = (b.v / pMax) * half;
      if (Math.abs(h) > 0.5) {
        ctx.fillStyle = b.color;
        roundRect(ctx, x - barW / 2, h > 0 ? zero - h : zero, barW, Math.abs(h), 3);
        ctx.fill();
      }
      const ly = h >= 0 ? zero - h - 9 : zero - h + 9;
      text(ctx, fmt(b.v, 2), x, clamp(ly, 24, H - 38), { color: COLORS.text, size: 10, family: 'mono', align: 'center' });
      symbol(ctx, b.sym[0], b.sym[1], x, H - 13, { color: b.color, size: 13 });
    });

    // ----- energy (non-negative)
    const eMax = Math.max(E0, eT, 1e-9) * 1.1;
    const base = bottom;
    const hE = bottom - top - 4;
    const ex0 = left + 3 * slotW + gap, ex1 = right;
    line(ctx, ex0, base, ex1, base, { color: COLORS.axis, width: 1 });
    if (E0 > 1e-9) {
      const yRef = base - (E0 / eMax) * hE;
      line(ctx, ex0, yRef, ex1, yRef, { color: COLORS.text3, width: 1, dash: [3, 4] });
      text(ctx, 'E₀', ex1 - 2, yRef - 7, { color: COLORS.text3, size: 9, family: 'mono', align: 'right' });
    }
    const eBars = [
      { v: e1, color: C.c1, sym: ['E', '1'] },
      { v: e2, color: C.c2, sym: ['E', '2'] },
      { v: eT, color: C.total, sym: ['E', 'կ'] },
      { v: S.Q, color: C.heat, sym: ['Q', ''] },
    ];
    eBars.forEach((b, i) => {
      const x = slotX(3 + i);
      const h = (b.v / eMax) * hE;
      if (h > 0.5) {
        ctx.fillStyle = b.color;
        roundRect(ctx, x - barW / 2, base - h, barW, h, 3);
        ctx.fill();
      }
      text(ctx, fmt(b.v, 2), x, clamp(base - h - 9, 24, H - 38), { color: COLORS.text, size: 10, family: 'mono', align: 'center' });
      symbol(ctx, b.sym[0], b.sym[1], x, H - 13, { color: b.color, size: 13 });
    });
  }

  // ---------- Numbers ----------
  const row = (sym, sub, val, unit) =>
    `${sym}<sub>${sub}</sub> = <b>${val}</b> ${unit}<br>`;

  function cardHtml(v1_, v2_) {
    const p1 = P.m1 * v1_, p2 = P.m2 * v2_;
    const e1 = kinetic(P.m1, v1_), e2 = kinetic(P.m2, v2_);
    return [
      row('v', '1', fmt(v1_, 2), 'մ/վ'),
      row('v', '2', fmt(v2_, 2), 'մ/վ'),
      row('p', '1', fmt(p1, 2), 'կգ·մ/վ'),
      row('p', '2', fmt(p2, 2), 'կգ·մ/վ'),
      `p = <b>${fmt(p1 + p2, 2)}</b> կգ·մ/վ<br>`,
      row('E', '1', fmt(e1, 2), 'Ջ'),
      row('E', '2', fmt(e2, 2), 'Ջ'),
      `E<sub>կ</sub> = <b>${fmt(e1 + e2, 2)}</b> Ջ`,
    ].join('');
  }

  function updateReadouts() {
    setText('lT', `${S.t.toFixed(2)} վ`);
    const ev = last ?? pred;
    const none = '<span>Բախում տեղի չի ունենա։</span>';
    if (!ev) {
      setHTML('lBefore', cardHtml(P.v1, P.v2));
      setHTML('lAfter', none);
      setText('lAfterTitle', 'Բախումից հետո');
      for (const id of ['lPb', 'lPa', 'lEb', 'lEa', 'lQ']) setText(id, '—');
      setHTML('lVerdict', 'Այս պայմաններում սայլակները չեն բախվի։ Բախում լինելու համար ձախ սայլակը պետք է շարժվի աջից ավելի արագ (v<sub>1</sub> &gt; v<sub>2</sub>), կամ միացրեք պատերը։');
      return;
    }
    const { before, after } = ev;
    const predicted = !last;
    setHTML('lBefore', cardHtml(before.v1, before.v2));
    setHTML('lAfter', cardHtml(after.v1, after.v2));
    setText('lAfterTitle', predicted ? 'Բախումից հետո (կանխատեսում)' : 'Բախումից հետո');

    const pb = P.m1 * before.v1 + P.m2 * before.v2;
    const pa = P.m1 * after.v1 + P.m2 * after.v2;
    const eb = kinetic(P.m1, before.v1) + kinetic(P.m2, before.v2);
    const ea = kinetic(P.m1, after.v1) + kinetic(P.m2, after.v2);
    const Q = Math.max(0, eb - ea);
    setText('lPb', `${fmt(pb, 2)} կգ·մ/վ`);
    setText('lPa', `${fmt(pa, 2)} կգ·մ/վ`);
    setText('lEb', `${fmt(eb, 2)} Ջ`);
    setText('lEa', `${fmt(ea, 2)} Ջ`);
    setText('lQ', `${fmt(Q < 5e-10 ? 0 : Q, 2)} Ջ`);

    const dp = pa - pb;
    const lead = predicted ? 'Կանխատեսում. ' : '';
    const pLine = `<b>Իմպուլսը պահպանվում է</b>՝ Δp = ${fmtZero(dp, 3)} կգ·մ/վ։ `;
    const eLine = Q < 5e-10
      ? '<b>Կինետիկ էներգիան պահպանվում է</b> (e = 1)։'
      : `<b>Կինետիկ էներգիան չի պահպանվում</b>՝ ${fmt(Q, 2)} Ջ-ը վերածվել է ջերմության (E<sub>կ</sub>-ն նվազել է ${fmt(100 * Q / eb, 1)} %-ով)։`;
    setHTML('lVerdict', lead + pLine + eLine);
  }

  reset();
  return { frame };
}
