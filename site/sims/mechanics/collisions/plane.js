// Tab 2 — collision of two smooth discs on a plane (top view).
// Disc 1 is launched along +x at impact parameter b towards disc 2 at rest.
// The analytic solution is in physics.js (solvePlane / planePositions); here
// we draw the arena, the vectors, the momentum triangle and the numbers.

import { fluidCanvas, onDrag } from '../../../assets/js/core/canvas.js';
import {
  bindRange, bindCheckbox, bindSegmented, bindPlayPause, onClick,
} from '../../../assets/js/core/controls.js';
import { byId, $$, setText, setHTML } from '../../../assets/js/core/dom.js';
import { clear, line, arrow, circle, text } from '../../../assets/js/core/draw.js';
import { COLORS, themed, alpha } from '../../../assets/js/core/theme.js';
import { clamp } from '../../../assets/js/core/math.js';
import { ARENA, solvePlane, planePositions } from './physics.js';
import { fmt, fmtZero, symbol } from './shared.js';

const C = themed(() => ({
  c1: COLORS.blue,
  c2: COLORS.coral,
  total: COLORS.purple,
  guide: COLORS.text3,
}));

const EXAMPLES = {
  equal: { m1: 2, m2: 2, v: 4, b: 0.5, e: 1 },
  heavy: { m1: 1, m2: 6, v: 4, b: 0.5, e: 1 },
  light: { m1: 6, m2: 1, v: 4, b: 0.4, e: 1 },
  head: { m1: 2, m2: 2, v: 4, b: 0, e: 1 },
};

const DEGREES = 180 / Math.PI;
const B_MAX = 1.6;
const STEP = 0.1;                       // spacing of trail dots, s

export function createPlane() {
  const P = { m1: 2, m2: 2, v: 4, b: 0.4, e: 1 };
  let R = solvePlane(P);                // analytic solution for the current parameters
  let phase = 'idle';                   // 'idle' | 'run' | 'done'
  let t = 0;
  let speed = 1;
  let showTrail = true;
  let showVec = true;

  const view = fluidCanvas(byId('pCv'), {
    height: (w) => clamp(Math.round(w * 0.58), 230, 460),
    onResize: () => draw(),
  });
  const triView = fluidCanvas(byId('pTri'), {
    height: (w) => clamp(Math.round(w * 0.4), 210, 270),
    onResize: () => drawTriangle(),
  });

  // ---------- Controls ----------
  const fmtM = (v) => `${v.toFixed(1)} կգ`;
  const changed = () => {
    P.m1 = m1.value; P.m2 = m2.value; P.v = vR.value; P.b = bR.value; P.e = eR.value;
    R = solvePlane(P);
    phase = 'idle';
    t = 0;
    pause.set(false);
    updateNumbers();
  };
  const m1 = bindRange('pM1', { format: fmtM, onInput: () => changed() });
  const m2 = bindRange('pM2', { format: fmtM, onInput: () => changed() });
  const vR = bindRange('pV', { format: (v) => `${v.toFixed(1)} մ/վ`, onInput: () => changed() });
  const bR = bindRange('pB', {
    format: (v) => `${v.toFixed(2)} մ`,
    onInput: () => changed(),
  });
  const preset = bindSegmented('pPreset', { onChange: (val) => eR.set(parseFloat(val)) });
  const eR = bindRange('pEr', {
    format: (v) => v.toFixed(2),
    onInput: (v) => {
      preset.set(v === 1 || v === 0.5 || v === 0 ? String(v) : '', { silent: true });
      changed();
    },
  });
  bindCheckbox('pTrail', { onChange: (c) => { showTrail = c; } });
  bindCheckbox('pVec', { onChange: (c) => { showVec = c; } });
  bindSegmented('pSpeed', { onChange: (val) => { speed = parseFloat(val); } });
  const pause = bindPlayPause('pPause', { paused: false });
  onClick('pLaunch', () => {
    changed();
    phase = 'run';
    pause.set(false);
  });
  onClick('pReset', () => changed());
  $$('[data-ex]', byId('panel-plane')).forEach((btn) => btn.addEventListener('click', () => {
    const ex = EXAMPLES[btn.dataset.ex];
    m1.set(ex.m1, { silent: true });
    m2.set(ex.m2, { silent: true });
    vR.set(ex.v, { silent: true });
    bR.set(ex.b, { silent: true });
    eR.set(ex.e, { silent: true });
    preset.set(String(ex.e), { silent: true });
    changed();
  }));

  // Dragging disc 1 up/down sets the impact parameter.
  const geo = () => {
    const s = view.width / (ARENA.x1 - ARENA.x0);
    return { s, X: (x) => (x - ARENA.x0) * s, Y: (y) => view.height / 2 - y * s };
  };
  onDrag(view, {
    start: (p) => {
      if (phase !== 'idle') return false;
      const { s, X, Y } = geo();
      const reach = Math.max(R.r1 * s + 14, 30);
      return Math.hypot(p.x - X(ARENA.start), p.y - Y(P.b)) <= reach ? true : false;
    },
    move: (p) => {
      const { s, Y } = geo();
      const b = clamp((Y(0) - p.y) / s, 0, B_MAX);
      bR.set(Math.round(b * 100) / 100);
    },
  });

  // ---------- Frame ----------
  function frame(dt) {
    if (phase === 'run' && !pause.paused) {
      t += dt * speed;
      if (t >= R.tEnd) { t = R.tEnd; phase = 'done'; }
    }
    draw();
    drawTriangle();
  }

  // ---------- Arena ----------
  function draw() {
    const { ctx, width: W, height: H } = view;
    if (!W) return;
    clear(ctx, W, H, COLORS.canvasBg);
    const { s, X, Y } = geo();

    // 1 m grid
    ctx.save();
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = Math.ceil(ARENA.x0); x <= ARENA.x1; x++) { ctx.moveTo(X(x), 0); ctx.lineTo(X(x), H); }
    for (let k = -Math.floor(H / 2 / s); k <= Math.floor(H / 2 / s); k++) { ctx.moveTo(0, Y(k)); ctx.lineTo(W, Y(k)); }
    ctx.stroke();
    ctx.restore();
    // scale bar
    line(ctx, 12, H - 14, 12 + s, H - 14, { color: COLORS.text2, width: 2 });
    text(ctx, '1 մ', 12 + s + 6, H - 14, { color: COLORS.text2, size: 11, family: 'mono' });

    const pos = planePositions(R, t);
    const bPx = R.b * s;

    // Guide lines: the line of motion of disc 1 and the parallel line through disc 2.
    const gx1 = R.hit ? X(R.c1.x) : W;
    line(ctx, X(ARENA.start), Y(R.b), gx1, Y(R.b), { color: C.guide, width: 1, dash: [5, 5] });
    if (R.b > 0.02) {
      line(ctx, X(ARENA.start), Y(0), X(R.hit ? 0 : ARENA.x1), Y(0), { color: C.guide, width: 1, dash: [2, 5] });
      // dimension b
      const dx = X(ARENA.start + 1.4);
      line(ctx, dx, Y(0), dx, Y(R.b), { color: COLORS.amber, width: 2 });
      line(ctx, dx - 4, Y(0), dx + 4, Y(0), { color: COLORS.amber, width: 2 });
      line(ctx, dx - 4, Y(R.b), dx + 4, Y(R.b), { color: COLORS.amber, width: 2 });
      ctx.fillStyle = alpha(COLORS.canvasBg, 0.85);
      ctx.fillRect(dx + 5, Y(0) + (bPx > 16 ? -bPx / 2 : -10) - 8, 78, 16);
      text(ctx, `b = ${R.b.toFixed(2)} մ`, dx + 8, Y(0) + (bPx > 16 ? -bPx / 2 : -10), {
        color: COLORS.amber, size: 11, family: 'mono', weight: 600,
      });
    }

    // Trails: dots at equal time intervals (spacing shows the speed)
    if (showTrail && t > 0) {
      const dots = (fn, from) => {
        for (let k = Math.ceil(from / STEP - 1e-9); k * STEP <= t + 1e-9; k++) {
          const q = fn(k * STEP);
          circle(ctx, X(q.x), Y(q.y), 2.2, { fill: q.color });
        }
      };
      dots((tt) => ({ ...planePositions(R, tt).p1, color: alpha(C.c1, 0.75) }), 0);
      if (R.hit) dots((tt) => ({ ...planePositions(R, tt).p2, color: alpha(C.c2, 0.75) }), R.tc);
    }

    // Geometry at the instant of contact (stays on screen after the collision)
    if (R.hit && t >= R.tc && showVec) drawContact(ctx, X, Y, s);

    // Discs
    const discs = [
      { p: pos.p1, r: R.r1, color: C.c1, v: pos.v1, n: '1', prime: pos.after },
      { p: pos.p2, r: R.r2, color: C.c2, v: pos.v2, n: '2', prime: pos.after },
    ];
    for (const d of discs) {
      circle(ctx, X(d.p.x), Y(d.p.y), d.r * s, { fill: alpha(d.color, 0.28), stroke: d.color, width: 2.2 });
      circle(ctx, X(d.p.x), Y(d.p.y), 2.2, { fill: d.color });
      if (d.r * s > 13) {
        text(ctx, d.n, X(d.p.x), Y(d.p.y) + (d.r * s > 18 ? 0 : 0) - d.r * s * 0.5, {
          color: COLORS.text, size: 11, weight: 700, align: 'center',
        });
      }
    }
    // Live velocity vectors
    if (showVec) {
      const kv = s * 0.3;
      for (const d of discs) {
        const sp = Math.hypot(d.v.x, d.v.y);
        if (sp < 1e-6) continue;
        const x0 = X(d.p.x), y0 = Y(d.p.y);
        const x1 = x0 + d.v.x * kv, y1 = y0 - d.v.y * kv;
        arrow(ctx, x0, y0, x1, y1, { color: d.color, width: 2.5, head: 9 });
        const ux = (x1 - x0) / Math.hypot(x1 - x0, y1 - y0), uy = (y1 - y0) / Math.hypot(x1 - x0, y1 - y0);
        const lab = d.n === '1' ? 'v₁' : 'v₂';
        text(ctx, d.prime ? `${lab}′` : lab, x1 + ux * 12 + (uy === 0 ? 0 : -uy * 4), y1 + uy * 12 - 6, {
          color: d.color, size: 12, weight: 700, align: 'center',
        });
      }
    }

    if (!R.hit) {
      text(ctx, 'b ≥ r₁ + r₂ — սկավառակները չեն բախվում', W / 2, 18, {
        color: COLORS.text2, size: 12, weight: 600, align: 'center',
      });
    }
  }

  function drawContact(ctx, X, Y, s) {
    const c1 = R.c1;
    const ghost = (cx, cy, r, color) => {
      ctx.save();
      ctx.setLineDash([4, 4]);
      circle(ctx, X(cx), Y(cy), r * s, { stroke: alpha(color, 0.55), width: 1.5 });
      ctx.restore();
    };
    ghost(c1.x, c1.y, R.r1, C.c1);
    ghost(0, 0, R.r2, C.c2);
    // line of centres
    line(ctx, X(c1.x), Y(c1.y), X(0), Y(0), { color: C.guide, width: 1, dash: [2, 3] });
    // reference direction (initial velocity) at both contact centres
    const refLen = 1.3 * s;
    for (const c of [c1, { x: 0, y: 0 }]) {
      line(ctx, X(c.x), Y(c.y), X(c.x) + refLen, Y(c.y), { color: C.guide, width: 1, dash: [3, 4] });
    }
    const outs = [
      { c: c1, v: R.v1, color: C.c1, th: R.th1, n: '1' },
      { c: { x: 0, y: 0 }, v: R.v2, color: C.c2, th: R.th2, n: '2' },
    ];
    const kv = s * 0.3;
    for (const o of outs) {
      if (o.th === null) continue;
      const x0 = X(o.c.x), y0 = Y(o.c.y);
      arrow(ctx, x0, y0, x0 + o.v.x * kv, y0 - o.v.y * kv, { color: alpha(o.color, 0.5), width: 2, head: 8 });
      // angle arc from the reference direction
      const rad = Math.min(34, Math.max(20, 0.6 * s));
      ctx.save();
      ctx.strokeStyle = o.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x0, y0, rad, 0, -o.th, o.th > 0);
      ctx.stroke();
      ctx.restore();
      const mid = -o.th / 2;
      text(ctx, `θ${o.n === '1' ? '₁' : '₂'}`, x0 + Math.cos(mid) * (rad + 12) + 2, y0 + Math.sin(mid) * (rad + 12), {
        color: o.color, size: 11, weight: 700, align: 'center',
      });
    }
  }

  // ---------- Momentum triangle ----------
  function drawTriangle() {
    const { ctx, width: W, height: H } = triView;
    if (!W) return;
    clear(ctx, W, H, COLORS.canvasBg);
    text(ctx, 'p₁ = p₁′ + p₂′', 12, 14, { color: COLORS.text2, size: 11, weight: 600, family: 'mono' });

    const A = { x: R.p0.x, y: 0 };
    const B = { x: R.p1.x, y: R.p1.y };
    const pts = [{ x: 0, y: 0 }, A, B];
    const minX = Math.min(...pts.map((q) => q.x)), maxX = Math.max(...pts.map((q) => q.x));
    const minY = Math.min(...pts.map((q) => q.y)), maxY = Math.max(...pts.map((q) => q.y));
    const padX = 46, padTop = 40, padBot = 34;
    const availW = W - 2 * padX, availH = H - padTop - padBot;
    const rx = Math.max(maxX - minX, 1e-9), ry = Math.max(maxY - minY, 1e-9);
    const k = Math.min(availW / rx, ry > 1e-6 ? availH / ry : Infinity, availW / 1e-9);
    const sc = Number.isFinite(k) ? k : 1;
    const offX = padX + (availW - rx * sc) / 2 - minX * sc;
    const offY = padTop + (availH - ry * sc) / 2 + maxY * sc;     // y grows up in momentum space
    const Q = (q) => ({ x: offX + q.x * sc, y: offY - q.y * sc });
    const O2 = Q(pts[0]), A2 = Q(A), B2 = Q(B);

    const flat = ry < 1e-6 * rx || Math.abs(maxY - minY) * sc < 4;
    const base = flat ? 10 : 0;               // lift the sum path off the base when all three are collinear

    // p1 (total) — the base
    arrow(ctx, O2.x, O2.y + base, A2.x, A2.y + base, { color: C.total, width: 3, head: 11 });
    symbol(ctx, 'p', '1', (O2.x + A2.x) / 2, O2.y + base + 17, { color: C.total, size: 14 });
    text(ctx, fmt(Math.hypot(R.p0.x, R.p0.y), 2), (O2.x + A2.x) / 2 + 22, O2.y + base + 17, {
      color: COLORS.text3, size: 10, family: 'mono', align: 'left',
    });

    if (!R.hit) {
      text(ctx, 'բախում չկա՝ p₂′ = 0', W / 2, padTop - 6, { color: COLORS.text2, size: 12, align: 'center' });
      return;
    }

    const lift = (q) => ({ x: q.x, y: q.y - (flat ? 10 : 0) });
    // p1′ from O to B, p2′ from B to A
    const Bl = lift(B2), Ol = lift(O2), Al = lift(A2);
    const p1m = Math.hypot(R.p1.x, R.p1.y), p2m = Math.hypot(R.p2.x, R.p2.y);
    if (p1m * sc > 1) arrow(ctx, Ol.x, Ol.y, Bl.x, Bl.y, { color: C.c1, width: 3, head: 11 });
    if (p2m * sc > 1) arrow(ctx, Bl.x, Bl.y, Al.x, Al.y, { color: C.c2, width: 3, head: 11 });

    // Right-angle mark at B when the outgoing velocities are perpendicular
    if (R.phi !== null && Math.abs(R.phi - Math.PI / 2) < 0.005 && p1m * sc > 18 && p2m * sc > 18) {
      const u = unit(Bl, Ol), w = unit(Bl, Al);
      const a = 11;
      ctx.save();
      ctx.strokeStyle = COLORS.text2;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(Bl.x + u.x * a, Bl.y + u.y * a);
      ctx.lineTo(Bl.x + (u.x + w.x) * a, Bl.y + (u.y + w.y) * a);
      ctx.lineTo(Bl.x + w.x * a, Bl.y + w.y * a);
      ctx.stroke();
      ctx.restore();
    }

    // Interior angles θ₁ (at O) and θ₂ (at A)
    if (!flat) {
      arcBetween(ctx, Ol, Al, Bl, 26, C.c1);
      arcBetween(ctx, Al, Ol, Bl, 26, C.c2);
    }

    // Labels pushed outward from the centroid
    const G = { x: (Ol.x + Al.x + Bl.x) / 3, y: (Ol.y + Al.y + Bl.y) / 3 };
    const label = (from, to, sub, val, color) => {
      const m = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
      const el = Math.hypot(to.x - from.x, to.y - from.y) || 1;
      let d = { x: -(to.y - from.y) / el, y: (to.x - from.x) / el };     // edge normal
      if (d.x * (m.x - G.x) + d.y * (m.y - G.y) < 0) d = { x: -d.x, y: -d.y };
      if (flat) d = { x: 0, y: -1 };
      const lx = m.x + d.x * 24, ly = m.y + d.y * 20;
      symbol(ctx, 'p', sub, lx, ly, { color, size: 14, prime: true });
      text(ctx, fmt(val, 2), lx, ly + (d.y < 0 ? -14 : 16), { color: COLORS.text3, size: 10, family: 'mono', align: 'center' });
    };
    if (p1m * sc > 14) label(Ol, Bl, '1', p1m, C.c1);
    if (p2m * sc > 14) label(Bl, Al, '2', p2m, C.c2);
  }

  const unit = (a, b) => {
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  };

  /** Arc at vertex V between the directions V→P and V→Q (canvas coordinates). */
  function arcBetween(ctx, V, P_, Q_, r, color) {
    const a0 = Math.atan2(P_.y - V.y, P_.x - V.x);
    const a1 = Math.atan2(Q_.y - V.y, Q_.x - V.x);
    let diff = a1 - a0;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff <= -Math.PI) diff += 2 * Math.PI;
    if (Math.abs(diff) < 0.03) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(V.x, V.y, r, a0, a1, diff < 0);
    ctx.stroke();
    ctx.restore();
  }

  // ---------- Numbers ----------
  const deg = (th) => (th === null ? '—' : `${(Math.abs(th) * DEGREES).toFixed(1)}°`);

  function card(m, v0, vAfter, pAfter, ke0, ke1, first) {
    const sp = Math.hypot(vAfter.x, vAfter.y);
    const pm = Math.hypot(pAfter.x, pAfter.y);
    const sub = first ? '1' : '2';
    return [
      `v<sub>${sub}</sub> = <b>${fmt(v0, 2)}</b> մ/վ<br>`,
      `v<sub>${sub}</sub>′ = <b>${fmt(sp, 2)}</b> մ/վ<br>`,
      `(v<sub>${sub}x</sub>′; v<sub>${sub}y</sub>′) = (<b>${fmt(vAfter.x, 2)}</b>; <b>${fmt(vAfter.y, 2)}</b>)<br>`,
      `p<sub>${sub}</sub>′ = <b>${fmt(pm, 2)}</b> կգ·մ/վ<br>`,
      `E<sub>${sub}</sub> → E<sub>${sub}</sub>′ = <b>${fmt(ke0, 2)}</b> → <b>${fmt(ke1, 2)}</b> Ջ`,
    ].join('');
  }

  function updateNumbers() {
    const px0 = R.p0.x, py0 = 0;
    const px1 = R.p1.x + R.p2.x, py1 = R.p1.y + R.p2.y;
    setText('pPx', `${fmt(px0, 2)} → ${fmt(px1, 2)}`);
    setText('pPy', `${fmt(py0, 2)} → ${fmtZero(py1, 2)}`);
    const eAfter = R.ke1 + R.ke2;
    setText('pE', `${fmt(R.ke0, 2)} → ${fmt(eAfter, 2)}`);
    setText('pQ', `${fmt(R.Q < 5e-10 ? 0 : R.Q, 2)} Ջ`);
    setText('pTh1', R.hit ? deg(R.th1) : '—');
    setText('pTh2', R.hit ? deg(R.th2) : '—');
    setText('pPhi', R.hit ? deg(R.phi) : '—');

    setHTML('pCard1', card(P.m1, P.v, R.v1, R.p1, R.ke0, R.ke1, true));
    setHTML('pCard2', card(P.m2, 0, R.v2, R.p2, 0, R.ke2, false));

    const dpx = px1 - px0, dpy = py1 - py0;
    const cons = `<b>Իմպուլսը պահպանվում է</b>՝ Δp<sub>x</sub> = ${fmtZero(dpx, 3)}, Δp<sub>y</sub> = ${fmtZero(dpy, 3)} կգ·մ/վ։ `;
    const equal = Math.abs(P.m1 - P.m2) < 1e-9;
    let msg;
    if (!R.hit) {
      msg = 'Սկավառակները չեն բախվում (b ≥ r<sub>1</sub> + r<sub>2</sub>)։ Իմպուլսը և էներգիան չեն փոխվում։';
    } else {
      const eMsg = R.Q < 5e-10
        ? '<b>Կինետիկ էներգիան պահպանվում է</b> (e = 1)։ '
        : `<b>Կինետիկ էներգիան չի պահպանվում</b>՝ Q = ${fmt(R.Q, 2)} Ջ։ `;
      let special = '';
      if (equal && P.e === 1) {
        special = R.phi === null
          ? '<br><b>Կենտրոնական բախում հավասար զանգվածներով</b>. առաջին սկավառակը կանգ է առնում, երկրորդը շարժվում է նույն արագությամբ։'
          : `<br><b>m<sub>1</sub> = m<sub>2</sub>, e = 1, թիրախը դադարի մեջ</b>՝ ելքային արագությունները փոխուղղահայաց են. φ = ${deg(R.phi)}։`;
      } else {
        special = '<br>Հավասար զանգվածների և e = 1 դեպքում ելքային արագությունները փոխուղղահայաց են (φ = 90°)։';
      }
      msg = cons + eMsg + special;
    }
    setHTML('pVerdict', msg);
  }

  changed();
  return { frame };
}
