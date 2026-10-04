// Tab 1 — Faraday's experiment: a bar magnet moved along the axis of a coil
// connected to a centre-zero galvanometer.
//
// World: metres, x along the coil axis (to the right), y up; the coil axis is
// y = 0 and the coil centre is at x = XC. Positive flux points along +x.
// Positive current I > 0 circulates so that its own field points along +x
// (right end of the coil = N pole); seen from the left it runs clockwise.

import { fluidCanvas, onDrag } from '../../../assets/js/core/canvas.js';
import { bindRange, bindCheckbox, onClick } from '../../../assets/js/core/controls.js';
import { byId, setText, setHTML } from '../../../assets/js/core/dom.js';
import { line, arrow, text, roundRect, clear } from '../../../assets/js/core/draw.js';
import { COLORS, themed } from '../../../assets/js/core/theme.js';
import { clamp, TAU } from '../../../assets/js/core/math.js';
import {
  COIL, MAGNET, fluxPerTurn, fluxGradient, createRateMeter, magnetFieldLines,
} from './physics.js';
import { fmt, niceCeil, createLaneChart, trimSamples, drawMeter, terminal } from './shared.js';

const XC = 0.04;              // coil centre, m
const HOME = -0.07;           // initial magnet centre, m
const G_FULL = 5e-3;          // galvanometer full scale, A
const WINDOW = 6;             // chart time window, s
const RATE_SPAN = 0.08;       // averaging time of the measured dΦ/dt, s
const I_SHOW = 2e-5;          // smallest current drawn with arrows / poles, A

// Field lines: start angles at the N pole (upper half; mirrored below).
const LINES = magnetFieldLines([0.28, 0.55, 0.9, 1.3, 1.8, 2.4]);

const C = themed((light) => ({
  north: light ? '#cf3a3a' : '#e05252',
  south: light ? '#2a66b8' : '#3f86dc',
  poleText: '#ffffff',
  fieldLine: light ? 'rgba(44,51,80,0.42)' : 'rgba(205,211,238,0.40)',
  coilFront: light ? '#a8561c' : '#e39a5c',
  coilBack: light ? 'rgba(168,86,28,0.42)' : 'rgba(227,154,92,0.38)',
  tube: light ? 'rgba(80,90,130,0.09)' : 'rgba(160,170,215,0.08)',
  tubeRim: light ? 'rgba(80,90,130,0.30)' : 'rgba(160,170,215,0.26)',
  wire: light ? '#59617f' : '#8e97b8',
  current: COLORS.amber,
  velocity: COLORS.teal,
  needle: COLORS.red,
  face: COLORS.surface1,
  rim: COLORS.axis,
}));

export function createMagnetLab() {
  const view = fluidCanvas(byId('mScene'), {
    height: (w) => (w < 600 ? clamp(Math.round(w * 0.86), 300, 400) : clamp(Math.round(w * 0.56), 360, 500)),
  });
  const { ctx } = view;

  // ---------- State ----------
  const P = { N: 200, m: 5, R: 10, f: 1, A: 0.05 };
  const st = {
    x: HOME, dir: 1, auto: false, x0: HOME, phase: 0,
    t: 0, v: 0, phi: 0, rate: 0, emf: 0, I: 0,
  };
  const phiMeter = createRateMeter(RATE_SPAN);
  const xMeter = createRateMeter(RATE_SPAN);
  const samples = [];
  let grab = null;              // drag offset (m) while dragging

  const flux = () => fluxPerTurn(st.x, XC, P.m, st.dir);
  /** Restart the measured rates from the current state (no spurious spike). */
  function resetMeters() {
    st.phi = flux();
    phiMeter.reset(st.t, st.phi);
    xMeter.reset(st.t, st.x);
  }

  // ---------- Geometry ----------
  function geo() {
    const W = view.width, H = view.height;
    const XW = W < 600 ? 0.27 : 0.36;              // half of the visible width, m
    const s = W / (2 * XW);                        // px per metre
    return {
      W, H, s, XW,
      ay: Math.round(H * (W < 600 ? 0.33 : 0.35)),
      X: (x) => W / 2 + x * s,
      lo: -XW + MAGNET.length / 2 + 0.01,
      hi: XW - MAGNET.length / 2 - 0.01,
    };
  }

  function clampAuto() {
    const { lo, hi } = geo();
    st.x0 = clamp(st.x0, lo + P.A, hi - P.A);
  }

  // ---------- Controls ----------
  const autoCtl = bindCheckbox('mAuto', {
    onChange: (on) => {
      st.auto = on;
      if (on) {
        st.x0 = st.x;
        clampAuto();
        st.phase = Math.asin(clamp((st.x - st.x0) / P.A, -1, 1));
      }
      resetMeters();
    },
  });
  bindRange('mFreq', { format: (v) => `${v.toFixed(1)} Հց`, onInput: (v) => { P.f = v; } });
  bindRange('mAmp', {
    format: (v) => `${v.toFixed(1)} սմ`,
    onInput: (v) => { P.A = v / 100; if (st.auto) clampAuto(); },
  });
  bindRange('mTurns', { format: (v) => `${v}`, onInput: (v) => { P.N = v; } });
  bindRange('mMoment', {
    format: (v) => `${v.toFixed(1)} Ա·մ²`,
    onInput: (v) => { P.m = v; resetMeters(); },
  });
  bindRange('mRes', { format: (v) => `${v} Օմ`, onInput: (v) => { P.R = v; } });
  onClick('mFlip', () => { st.dir = -st.dir; resetMeters(); });
  onClick('mReset', () => {
    autoCtl.set(false, { silent: true });
    st.auto = false;
    st.x = HOME;
    samples.length = 0;
    resetMeters();
  });

  onDrag(view, {
    start: (p) => {
      const g = geo();
      const xm = g.X(st.x);
      const halfW = (MAGNET.length / 2) * g.s + 14;
      const halfH = Math.max(MAGNET.half * g.s + 14, 24);
      if (Math.abs(p.x - xm) > halfW || Math.abs(p.y - g.ay) > halfH) return false;
      if (st.auto) { autoCtl.set(false, { silent: true }); st.auto = false; resetMeters(); }
      grab = (p.x - xm) / g.s;
      return true;
    },
    move: (p) => {
      const g = geo();
      st.x = clamp((p.x - g.W / 2) / g.s - grab, g.lo, g.hi);
    },
    end: () => { grab = null; },
  });

  // ---------- Chart ----------
  const scale = { phi: 1, emf: 1 };
  const chart = createLaneChart(byId('mChart'), () => ({
    samples,
    t: st.t,
    window: WINDOW,
    lanes: [
      { color: 'blue', label: 'Φ, մկՎբ (մեկ գալարով)', scale: scale.phi, get: (s) => s[1] },
      { color: 'coral', label: 'ε, մՎ', scale: scale.emf, get: (s) => s[2] },
    ],
  }));

  function updateScales() {
    let mp = 0, me = 0;
    for (const s of samples) {
      mp = Math.max(mp, Math.abs(s[1]));
      me = Math.max(me, Math.abs(s[2]));
    }
    scale.phi = Math.max(niceCeil(mp), 1);
    scale.emf = Math.max(niceCeil(me), 1);
  }

  // ---------- Physics step ----------
  function step(dt) {
    const g = geo();
    if (!st.auto && grab === null) st.x = clamp(st.x, g.lo, g.hi);
    st.t += dt;
    if (st.auto) {
      st.phase = (st.phase + TAU * P.f * dt) % TAU;
      st.x = st.x0 + P.A * Math.sin(st.phase);
      st.v = P.A * TAU * P.f * Math.cos(st.phase);
    }
    st.phi = flux();
    phiMeter.push(st.t, st.phi);
    xMeter.push(st.t, st.x);
    if (st.auto) {
      // Exact derivative along the prescribed motion: dΦ/dt = (∂Φ/∂x)·v.
      st.rate = fluxGradient(st.x, XC, P.m, st.dir) * st.v;
    } else {
      st.rate = phiMeter.rate;
      st.v = xMeter.rate;
    }
    st.emf = -P.N * st.rate;
    st.I = st.emf / P.R;
    samples.push([st.t, st.phi * 1e6, st.emf * 1e3]);
    trimSamples(samples, st.t, WINDOW);
  }

  // ---------- Scene ----------
  function drawFieldLines(g) {
    const xm = g.X(st.x);
    ctx.save();
    ctx.strokeStyle = C.fieldLine;
    ctx.lineWidth = 1.2;
    for (const pts of LINES) {
      for (const sy of [1, -1]) {
        ctx.beginPath();
        for (let i = 0; i < pts.length; i += 2) {
          const X = xm + st.dir * pts[i] * g.s;
          const Y = g.ay - sy * pts[i + 1] * g.s;
          if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
        }
        ctx.stroke();
        // Arrow (direction N → S outside the magnet) at the farthest point
        // from the axis, or a quarter of the way along an open line.
        const n = pts.length / 2;
        const closed = Math.hypot(pts[pts.length - 2] + MAGNET.poleSep / 2, pts[pts.length - 1]) < 0.01;
        let k = Math.floor(n * 0.25);
        if (closed) {
          let best = 0;
          for (let i = 0; i < n; i++) if (pts[2 * i + 1] > best) { best = pts[2 * i + 1]; k = i; }
        }
        k = clamp(k, 1, n - 2);
        const ax = xm + st.dir * pts[2 * k] * g.s, ay = g.ay - sy * pts[2 * k + 1] * g.s;
        const bx = xm + st.dir * pts[2 * k + 2] * g.s, by = g.ay - sy * pts[2 * k + 3] * g.s;
        const len = Math.hypot(bx - ax, by - ay) || 1;
        const ux = (bx - ax) / len, uy = (by - ay) / len;
        arrow(ctx, ax - ux * 6, ay - uy * 6, ax + ux * 6, ay + uy * 6, { color: C.fieldLine, width: 1.4, head: 9, spread: 0.45 });
      }
    }
    ctx.restore();
  }

  function drawMagnet(g) {
    const x1 = g.X(st.x - MAGNET.length / 2), x2 = g.X(st.x + MAGNET.length / 2);
    const h = Math.max(MAGNET.half * g.s, 7);
    const xm = (x1 + x2) / 2;
    const leftN = st.dir < 0;
    ctx.save();
    roundRect(ctx, x1, g.ay - h, x2 - x1, 2 * h, 3);
    ctx.clip();
    ctx.fillStyle = leftN ? C.north : C.south;
    ctx.fillRect(x1, g.ay - h, xm - x1, 2 * h);
    ctx.fillStyle = leftN ? C.south : C.north;
    ctx.fillRect(xm, g.ay - h, x2 - xm, 2 * h);
    ctx.restore();
    const size = clamp(Math.round(h * 1.1), 10, 15);
    text(ctx, leftN ? 'N' : 'S', (x1 + xm) / 2, g.ay + 1, { color: C.poleText, size, weight: 700, align: 'center' });
    text(ctx, leftN ? 'S' : 'N', (xm + x2) / 2, g.ay + 1, { color: C.poleText, size, weight: 700, align: 'center' });

    // Velocity arrow
    if (Math.abs(st.v) > 0.004) {
      const L = clamp(st.v * 0.18 * g.s, -90, 90);
      const y = g.ay - h - 14;
      const s0 = Math.sign(L) * 6;
      arrow(ctx, xm - L / 2 - s0 / 2, y, xm + L / 2 + s0 / 2, y, { color: C.velocity, width: 2, head: 8 });
      text(ctx, 'v', xm, y - 11, { color: C.velocity, size: 13, style: 'italic', weight: 600, family: 'display', align: 'center' });
    }
  }

  function drawScene() {
    const g = geo();
    const { W, H, s, ay } = g;
    if (!W) return;
    clear(ctx, W, H, COLORS.canvasBg);

    drawFieldLines(g);

    // Coil geometry
    const x1 = g.X(XC - COIL.length / 2), x2 = g.X(XC + COIL.length / 2);
    const r = COIL.radius * s, rx = r * 0.32;
    const nVis = Math.round(4 + (P.N / 500) * 12);
    const turnX = (i) => x1 + rx + ((i + 0.5) / nVis) * (x2 - x1 - 2 * rx);

    // Galvanometer
    const R = clamp(Math.round(H * 0.16), 44, 78);
    const gy = Math.max(ay + r + 30 + 0.66 * R, H - 0.66 * R - 18);
    const term = drawMeter(ctx, g.X(XC), gy, R, {
      value: st.I * 1e3, full: G_FULL * 1e3, unit: 'մԱ', letter: 'G',
      needle: C.needle, face: C.face, rim: C.rim,
    });

    // Leads: coil ends → galvanometer terminals
    const lead = (fromX, to) => {
      const midY = (ay + r + to.y) / 2;
      ctx.save();
      ctx.strokeStyle = C.wire;
      ctx.lineWidth = 1.8;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(fromX, ay + r);
      ctx.lineTo(fromX, midY);
      ctx.lineTo(to.x, midY);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.restore();
      terminal(ctx, to.x, to.y, C.wire);
    };
    lead(turnX(0), term.left);
    lead(turnX(nVis - 1), term.right);

    // Coil body (back halves of the turns), magnet, front halves.
    ctx.save();
    ctx.fillStyle = C.tube;
    ctx.fillRect(x1, ay - r, x2 - x1, 2 * r);
    ctx.strokeStyle = C.tubeRim;
    ctx.lineWidth = 1;
    ctx.strokeRect(x1, ay - r, x2 - x1, 2 * r);
    ctx.strokeStyle = C.coilBack;
    ctx.lineWidth = 2;
    for (let i = 0; i < nVis; i++) {
      ctx.beginPath();
      ctx.ellipse(turnX(i), ay, rx, r, 0, Math.PI / 2, Math.PI * 1.5);
      ctx.stroke();
    }
    ctx.restore();

    drawMagnet(g);

    ctx.save();
    ctx.strokeStyle = C.coilFront;
    ctx.lineWidth = 2.4;
    for (let i = 0; i < nVis; i++) {
      ctx.beginPath();
      ctx.ellipse(turnX(i), ay, rx, r, 0, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
    }
    ctx.restore();

    // Induced current: arrows on the front of the turns, poles of the coil.
    if (Math.abs(st.I) > I_SHOW) {
      const down = st.I > 0;               // I > 0 runs downward on the near side
      const L = Math.min(9, r * 0.45);
      for (let i = nVis % 2 ? 0 : 1; i < nVis; i += 2) {
        const x = turnX(i) + rx;
        arrow(ctx, x, ay - (down ? L : -L), x, ay + (down ? L : -L), { color: C.current, width: 2, head: 7 });
      }
      const rightN = st.I > 0;
      const py = ay - r - 13;
      text(ctx, rightN ? 'S' : 'N', x1, py, { color: rightN ? C.south : C.north, size: 14, weight: 700, align: 'center' });
      text(ctx, rightN ? 'N' : 'S', x2, py, { color: rightN ? C.north : C.south, size: 14, weight: 700, align: 'center' });
    }
  }

  // ---------- Readouts ----------
  function lenzText() {
    if (st.emf === 0 || Math.abs(st.I) < 1e-9) {
      return 'Կոճով անցնող մագնիսական հոսքը չի փոխվում (ΔΦ/Δt = 0), ուստի ինդուկցիոն հոսանք <b>չկա</b>, և գալվանաչափի սլաքը զրոյի վրա է։';
    }
    const growing = st.phi * st.rate > 0;
    let s = growing
      ? 'Կոճով անցնող մագնիսական հոսքն <b>աճում է</b>։ Ինդուկցիոն հոսանքի մագնիսական դաշտն ուղղված է մագնիսի դաշտին հակառակ. այն <b>հակազդում է հոսքի աճին</b>։'
      : 'Կոճով անցնող մագնիսական հոսքը <b>նվազում է</b>։ Ինդուկցիոն հոսանքի մագնիսական դաշտն ուղղված է մագնիսի դաշտի ուղղությամբ. այն <b>հակազդում է հոսքի նվազմանը</b>։';
    // Which end of the coil faces the magnet, and how they interact.
    if (Math.abs(st.x - XC) > COIL.length / 2 + MAGNET.length / 2 - 0.01) {
      const magnetLeft = st.x < XC;
      const coilPole = magnetLeft ? (st.I > 0 ? 'S' : 'N') : (st.I > 0 ? 'N' : 'S');
      const magnetPole = magnetLeft ? (st.dir > 0 ? 'N' : 'S') : (st.dir > 0 ? 'S' : 'N');
      const end = magnetLeft ? 'ձախ' : 'աջ';
      s += ` Կոճի ${end} ծայրը դառնում է <b>${coilPole}</b> բևեռ և ${coilPole === magnetPole ? '<b>վանում է</b>' : '<b>ձգում է</b>'} մագնիսի ${magnetPole} բևեռը։`;
    }
    return s;
  }

  let lastLenz = '';
  function updateStats() {
    setText('mPhi', `${fmt(st.phi * 1e6, 2)} մկՎբ`);
    setText('mRate', `${fmt(st.rate * 1e3, 3)} մՎբ/վ`);
    setText('mEmf', `${fmt(st.emf * 1e3, 2)} մՎ`);
    setText('mI', `${fmt(st.I * 1e3, 3)} մԱ`);
    setText('mDir', Math.abs(st.I) < 1e-9 ? 'հոսանք չկա'
      : st.I > 0 ? '↻ ժամասլաքով' : '↺ ժամասլաքին հակառակ');
    const l = lenzText();
    if (l !== lastLenz) { setHTML('mLenz', l); lastLenz = l; }
  }

  resetMeters();

  return {
    frame(dt) {
      if (dt > 0) step(dt);
      updateScales();
      drawScene();
      chart.draw();
      updateStats();
    },
    /** For testing from the console. */
    state: st,
    params: P,
  };
}
