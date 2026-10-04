// Tab 2 — AC generator: a rectangular frame of N turns rotating about a
// vertical axis in the uniform field between two magnet poles.
//
// World: metres; x to the right (along B, from the N pole to the S pole),
// y up (the rotation axis), z towards the viewer. The frame normal is
// n = (cos α, 0, sin α) with α = ωt, so Φ = B·S·cos α and
// ε = N·B·S·ω·sin α (the EMF in the positive sense with respect to n).
// The scene is drawn in a fixed oblique orthographic view.

import { fluidCanvas } from '../../../assets/js/core/canvas.js';
import { bindRange, bindPlayPause, onClick } from '../../../assets/js/core/controls.js';
import { byId, setText } from '../../../assets/js/core/dom.js';
import { line, arrow, text, clear } from '../../../assets/js/core/draw.js';
import { COLORS, themed, alpha } from '../../../assets/js/core/theme.js';
import { clamp, DEG, TAU } from '../../../assets/js/core/math.js';
import { frameFlux, frameEmf, frameEmfMax, frameOmega } from './physics.js';
import { fmt, fmtSig, niceCeil, createLaneChart, trimSamples, drawMeter, terminal } from './shared.js';

const YAW = 12 * DEG, PITCH = 16 * DEG;
const CY = Math.cos(YAW), SY = Math.sin(YAW), CP = Math.cos(PITCH), SP = Math.sin(PITCH);

// Geometry, m
const POLE = { x: 0.11, w: 0.07, h: 0.11, d: 0.075 };
const RING = { r: 0.016, t: 0.009, y1: -0.135, y2: -0.162 };
const SHAFT_R = 0.004;
const SLOWDOWNS = [1, 2, 5, 10, 20, 50, 100];
const WINDOW_PERIODS = 2.5;

const C = themed((light) => ({
  north: light ? '#cf3a3a' : '#e05252',
  south: light ? '#2a66b8' : '#3f86dc',
  poleText: '#ffffff',
  fieldLine: light ? 'rgba(44,51,80,0.40)' : 'rgba(205,211,238,0.38)',
  frame: light ? '#a8561c' : '#e39a5c',
  frameFill: light ? 'rgba(10,132,104,0.13)' : 'rgba(46,203,161,0.13)',
  shaft: light ? '#7d86a3' : '#8e97b8',
  ring: light ? '#b98a22' : '#d4a43c',
  ringTop: light ? '#dcb453' : '#f0c868',
  brush: light ? '#454c62' : '#6c7390',
  wire: light ? '#59617f' : '#8e97b8',
  normal: COLORS.purple,
  emf: COLORS.amber,
  needle: COLORS.red,
  face: COLORS.surface1,
  rim: COLORS.axis,
}));

/** Shade a '#rrggbb' color: f < 1 darker, f > 1 lighter. */
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => clamp(Math.round(f < 1 ? v * f : v + (255 - v) * (f - 1)), 0, 255);
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

export function createFrameLab() {
  const view = fluidCanvas(byId('fScene'), {
    height: (w) => (w < 600 ? clamp(Math.round(w * 0.98), 320, 430) : clamp(Math.round(w * 0.58), 380, 520)),
  });
  const { ctx } = view;

  const P = { B: 0.5, S: 0.01, N: 100, f: 1 };
  const st = { t: 0, angle: 0, phi: 0, emf: 0 };
  const samples = [];

  const slowdown = () => SLOWDOWNS.find((k) => P.f / k <= 1.0001) ?? SLOWDOWNS[SLOWDOWNS.length - 1];

  // ---------- Controls ----------
  bindRange('fB', { format: (v) => `${v.toFixed(2)} Տլ`, onInput: (v) => { P.B = v; } });
  bindRange('fS', { format: (v) => `${v} սմ²`, onInput: (v) => { P.S = v * 1e-4; } });
  bindRange('fN', { format: (v) => `${v}`, onInput: (v) => { P.N = v; } });
  bindRange('fFreq', {
    format: (v) => `${v.toFixed(1)} Հց`,
    onInput: (v) => { P.f = v; samples.length = 0; updateHint(); },
  });
  const play = bindPlayPause('fPlay');
  onClick('fReset', () => { st.t = 0; st.angle = 0; samples.length = 0; compute(); });

  function updateHint() {
    const k = slowdown();
    setText('fSlowHint', k > 1
      ? `Պտույտը ցուցադրվում է ${k} անգամ դանդաղեցված, իսկ գրաֆիկների ժամանակի առանցքը և բոլոր թվերը համապատասխանում են իրական ν = ${P.f.toFixed(1)} Հց հաճախությանը։`
      : 'Պտույտը ցուցադրվում է իրական արագությամբ։');
  }

  // ---------- Physics ----------
  function compute() {
    st.phi = frameFlux(P.B, P.S, st.angle);
    st.emf = frameEmf(P.N, P.B, P.S, P.f, st.angle);
  }

  function step(dt) {
    const h = dt / slowdown();                 // real (physical) time step
    st.t += h;
    st.angle = (st.angle + frameOmega(P.f) * h) % TAU;
    compute();
    samples.push([st.t, st.phi * 1e3, st.emf]);
    trimSamples(samples, st.t, WINDOW_PERIODS / P.f);
  }

  // ---------- Chart ----------
  const chart = createLaneChart(byId('fChart'), () => {
    const win = WINDOW_PERIODS / P.f;
    return {
      samples,
      t: st.t,
      window: win,
      timeUnit: win < 1 ? { factor: 1000, label: 't, մվ' } : { factor: 1, label: 't, վ' },
      lanes: [
        { color: 'blue', label: 'Φ, մՎբ', scale: niceCeil(P.B * P.S * 1e3), get: (s) => s[1] },
        { color: 'coral', label: 'ε, Վ', scale: niceCeil(frameEmfMax(P.N, P.B, P.S, P.f)), get: (s) => s[2] },
      ],
    };
  });

  // ---------- Scene ----------
  let ox = 0, oy = 0, sc = 1;
  const proj = (x, y, z) => ({
    x: ox + (x * CY - z * SY) * sc,
    y: oy - (-x * SY * SP + y * CP - z * CY * SP) * sc,
  });

  function poly(pts, fill, stroke) {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }

  /** Box pole piece; visible faces are +x, +y and +z for this camera. */
  function drawPole(x0, x1, color, label, labelOnSide) {
    const { h, d } = POLE;
    const v = (x, y, z) => proj(x, y, z);
    const edge = alpha(COLORS.text, 0.25);
    poly([v(x0, -h, d), v(x1, -h, d), v(x1, h, d), v(x0, h, d)], color, edge);           // front
    poly([v(x0, h, d), v(x1, h, d), v(x1, h, -d), v(x0, h, -d)], shade(color, 1.35), edge); // top
    poly([v(x1, -h, d), v(x1, -h, -d), v(x1, h, -d), v(x1, h, d)], shade(color, 0.72), edge); // +x side
    const c = labelOnSide ? v(x1, 0, 0) : v((x0 + x1) / 2, 0, d);
    text(ctx, label, c.x, c.y, { color: C.poleText, size: sc > 1500 ? 22 : 17, weight: 700, align: 'center' });
  }

  function drawFieldLines() {
    const ys = [-0.075, -0.025, 0.025, 0.075];
    const zs = [-0.045, 0, 0.045];
    ctx.save();
    for (const z of zs) {
      for (const y of ys) {
        const a = proj(-POLE.x, y, z), b = proj(POLE.x, y, z);
        line(ctx, a.x, a.y, b.x, b.y, { color: C.fieldLine, width: 1.1, dash: [5, 4] });
        const m1 = proj(-POLE.x + 0.022, y, z), m2 = proj(-POLE.x + 0.032, y, z);
        arrow(ctx, m1.x, m1.y, m2.x, m2.y, { color: C.fieldLine, width: 1.1, head: 6 });
      }
    }
    const lb = proj(POLE.x - 0.012, 0.075 + 0.016, 0.045);
    text(ctx, 'B', lb.x, lb.y, { color: COLORS.text2, size: 15, style: 'italic', weight: 600, family: 'display', align: 'center' });
    ctx.restore();
  }

  function drawRing(y, label) {
    const c = proj(0, y, 0);
    const rx = RING.r * sc, ry = RING.r * sc * SP;
    const tpx = RING.t * sc * CP;
    const top = c.y - tpx / 2, bot = c.y + tpx / 2;
    ctx.save();
    ctx.fillStyle = C.ring;
    ctx.beginPath();
    ctx.ellipse(c.x, bot, rx, ry, 0, 0, Math.PI);
    ctx.lineTo(c.x - rx, top);
    ctx.ellipse(c.x, top, rx, ry, 0, Math.PI, 0, true);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = C.ringTop;
    ctx.beginPath();
    ctx.ellipse(c.x, top, rx, ry, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    return { x: c.x, y: c.y, rx };
  }

  function drawScene() {
    const W = view.width, H = view.height;
    if (!W) return;
    clear(ctx, W, H, COLORS.canvasBg);

    const R = clamp(Math.round(W * 0.07), 40, 62);
    const meterH = 1.32 * R;
    // The scene spans about ±0.2 m horizontally and 0.31 m vertically
    // (pole tops to the slip rings); the voltmeter sits below.
    sc = Math.min(W / 0.46, (H - 16 - 26 - meterH - 14) / 0.31);
    const half = 0.2 * sc;
    ox = W >= 600 ? clamp(Math.max(W / 2, 270 + half), half + 10, W - half - 10) : W / 2;
    oy = 16 + 0.14 * sc;

    // Far pole (N, left), field, frame, near pole (S, right).
    drawPole(-POLE.x - POLE.w, -POLE.x, C.north, 'N', true);
    drawFieldLines();

    const a = st.angle;
    const n = { x: Math.cos(a), z: Math.sin(a) };
    const u = { x: -Math.sin(a), z: Math.cos(a) };
    const ws = Math.sqrt(P.S / 1.2);              // frame width; height = 1.2·width
    const w = ws / 2, h = (1.2 * ws) / 2;
    const corner = (su, sy) => proj(su * w * u.x, sy * h, su * w * u.z);
    const A = corner(1, 1), B = corner(1, -1), Cc = corner(-1, -1), D = corner(-1, 1);

    // Shaft (top stub and the part down to the rings)
    const st1 = proj(0, h + 0.03, 0), st2 = proj(0, h, 0);
    const sb1 = proj(0, -h, 0), sb2 = proj(0, RING.y2 - 0.02, 0);
    const shaftW = Math.max(2, SHAFT_R * 2 * sc);
    line(ctx, st1.x, st1.y, st2.x, st2.y, { color: C.shaft, width: shaftW, cap: 'round' });
    line(ctx, sb1.x, sb1.y, sb2.x, sb2.y, { color: C.shaft, width: shaftW, cap: 'round' });

    // Frame
    poly([A, B, Cc, D], C.frameFill, null);
    ctx.save();
    ctx.strokeStyle = C.frame;
    ctx.lineWidth = 3.2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.lineTo(Cc.x, Cc.y); ctx.lineTo(D.x, D.y); ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // EMF direction: positive sense w.r.t. n is down the +u side, along the
    // bottom to the −u side, up and back along the top. ε ∝ sin α.
    const sn = Math.sin(a);
    if (Math.abs(sn) > 0.05) {
      const k = Math.sign(sn) * clamp(Math.abs(sn), 0.35, 1);
      const seg = (p, q) => {
        const L = 0.03 * k;
        const dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z;
        const len = Math.hypot(dx, dy, dz) || 1;
        const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2, mz = (p.z + q.z) / 2;
        const s = proj(mx - dx / len * L / 2, my - dy / len * L / 2, mz - dz / len * L / 2);
        const e = proj(mx + dx / len * L / 2, my + dy / len * L / 2, mz + dz / len * L / 2);
        arrow(ctx, s.x, s.y, e.x, e.y, { color: C.emf, width: 2.6, head: 10 });
      };
      const W3 = (su, sy) => ({ x: su * w * u.x, y: sy * h, z: su * w * u.z });
      seg(W3(1, 1), W3(1, -1));
      seg(W3(1, -1), W3(-1, -1));
      seg(W3(-1, -1), W3(-1, 1));
      seg(W3(-1, 1), W3(1, 1));
    }

    // Normal vector n
    const o = proj(0, 0, 0), nt = proj(0.085 * n.x, 0, 0.085 * n.z);
    arrow(ctx, o.x, o.y, nt.x, nt.y, { color: C.normal, width: 2.4, head: 9 });
    const nl = proj(0.1 * n.x, 0.012, 0.1 * n.z);
    text(ctx, 'n', nl.x, nl.y, { color: C.normal, size: 15, style: 'italic', weight: 600, family: 'display', align: 'center' });

    drawPole(POLE.x, POLE.x + POLE.w, C.south, 'S', false);

    // Slip rings and brushes
    const r1 = drawRing(RING.y1);
    const r2 = drawRing(RING.y2);
    const bw = 10, bh = 7;
    ctx.fillStyle = C.brush;
    ctx.fillRect(r1.x - r1.rx - bw, r1.y - bh / 2, bw, bh);
    ctx.fillRect(r2.x + r2.rx, r2.y - bh / 2, bw, bh);

    // Voltmeter
    const poleBottom = proj(POLE.x, -POLE.h, POLE.d).y;
    const my = Math.max(poleBottom, r2.y) + 26 + meterH / 2;
    const mx = Math.min(W - 1.2 * R - 8, proj(POLE.x + POLE.w / 2, 0, POLE.d).x);
    const full = niceCeil(frameEmfMax(P.N, P.B, P.S, P.f));
    const term = drawMeter(ctx, mx, my, R, {
      value: st.emf, full, unit: 'Վ', letter: 'V', needle: C.needle, face: C.face, rim: C.rim,
    });

    // Wires: left brush → left terminal (lower run), right brush → right terminal
    const yLow = term.top - 10, yHigh = term.top - 20;
    ctx.save();
    ctx.strokeStyle = C.wire;
    ctx.lineWidth = 1.8;
    ctx.lineJoin = 'round';
    const xl = r1.x - r1.rx - bw;
    ctx.beginPath();
    ctx.moveTo(xl, r1.y);
    ctx.lineTo(xl - 12, r1.y);
    ctx.lineTo(xl - 12, yLow);
    ctx.lineTo(term.left.x, yLow);
    ctx.lineTo(term.left.x, term.left.y);
    const xr = r2.x + r2.rx + bw;
    ctx.moveTo(xr, r2.y);
    ctx.lineTo(Math.min(xr + 12, term.right.x), r2.y);
    ctx.lineTo(Math.min(xr + 12, term.right.x), Math.min(yHigh, r2.y));
    ctx.lineTo(term.right.x, Math.min(yHigh, r2.y));
    ctx.lineTo(term.right.x, term.right.y);
    ctx.stroke();
    ctx.restore();
    terminal(ctx, term.left.x, term.left.y, C.wire);
    terminal(ctx, term.right.x, term.right.y, C.wire);

    // Slow-motion note
    const k = slowdown();
    if (k > 1) {
      text(ctx, `դանդաղեցված ${k} անգամ`, W - 12, H - 14, { color: COLORS.text3, size: 12, align: 'right' });
    }
  }

  // ---------- Readouts ----------
  function updateStats() {
    const emax = frameEmfMax(P.N, P.B, P.S, P.f);
    const T = 1 / P.f;
    setText('fEmax', `${fmtSig(emax, 4)} Վ`);
    setText('fEeff', `${fmtSig(emax / Math.SQRT2, 4)} Վ`);
    setText('fT', T < 1 ? `${fmtSig(T * 1e3, 3)} մվ` : `${fmtSig(T, 3)} վ`);
    setText('fNu', `${P.f.toFixed(1)} Հց`);
    setText('fOmega', `${fmtSig(frameOmega(P.f), 4)} ռադ/վ`);
    setText('fAngle', `${((st.angle / DEG + 360) % 360).toFixed(0)}°`);
    setText('fPhi', `${fmt(st.phi * 1e3, 2)} մՎբ`);
    setText('fEmf', `${fmt(st.emf, emax >= 100 ? 1 : emax >= 1 ? 2 : 4)} Վ`);
  }

  updateHint();
  compute();

  return {
    frame(dt) {
      if (dt > 0 && !play.paused) step(dt);
      drawScene();
      chart.draw();
      updateStats();
    },
    state: st,
    params: P,
  };
}
