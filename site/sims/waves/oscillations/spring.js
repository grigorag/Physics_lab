// Tab 2 — load on a vertical spring.
// State: displacement x from the equilibrium position (m, positive upwards)
// and velocity v. Gravity only shifts the equilibrium, so the net force is
// F = −k·x (plus the drag −b·v) and the potential energy counted from the
// equilibrium position is k·x²/2.

import { fluidCanvas, onDrag } from '../../../assets/js/core/canvas.js';
import { bindRange, bindCheckbox, bindPlayPause, onClick } from '../../../assets/js/core/controls.js';
import { byId, setText } from '../../../assets/js/core/dom.js';
import { clear, line, arrow, text, roundRect } from '../../../assets/js/core/draw.js';
import { COLORS, themed, alpha, onThemeChange } from '../../../assets/js/core/theme.js';
import { clamp, TAU } from '../../../assets/js/core/math.js';
import {
  createOscillator, springAccel, springPeriod, springEnergy,
} from './physics.js';
import {
  fmt, createTimeChart, createEnergyChart, drawSupport, vectorLabel,
} from './shared.js';

const X_MAX = 0.3;          // largest displacement, m
const WINDOW_PERIODS = 4;
const COILS = 11;

const C = themed((light) => ({
  support: light ? '#7d88a8' : '#5a6794',
  spring: light ? '#5d6890' : '#8a96c0',
  load: COLORS.amber,
  loadRim: light ? '#6e4200' : '#ffd58a',
  loadText: light ? '#ffffff' : '#201400',
  velocity: COLORS.teal,
  force: COLORS.red,
  marker: COLORS.blue,
}));

export function createSpring() {
  const view = fluidCanvas(byId('sScene'), {
    height: (w) => clamp(Math.round(w * 0.5), 320, 400),
    onResize: () => render(),
  });
  const { ctx } = view;

  // ---------- State ----------
  const P = { m: 1, k: 100, b: 0 };
  const osc = createOscillator((q, u) => springAccel(q, u, P));
  let x0 = 0.1;            // release displacement (signed)
  let dragging = false;
  let grabOffset = 0;

  const amp = { x: 1, v: 1, a: 1, energy: 1 };

  /** Release from rest at x₀; clears the graph and the period measurement. */
  function restart() {
    const A = Math.max(Math.abs(x0), 1e-4);
    amp.x = A;
    amp.v = A * Math.sqrt(P.k / P.m);
    amp.a = A * P.k / P.m;
    amp.energy = 0.5 * P.k * A * A;
    osc.setWindow(WINDOW_PERIODS * springPeriod(P.m, P.k));
    osc.reset(x0, 0);
    render();
  }

  // ---------- Controls ----------
  bindRange('sMass', {
    format: (v) => `${v.toFixed(1)} կգ`,
    onInput: (v) => { P.m = v; restart(); },
  });
  bindRange('sK', {
    format: (v) => `${v.toFixed(0)} Ն/մ`,
    onInput: (v) => { P.k = v; restart(); },
  });
  const ampCtl = bindRange('sAmp', {
    format: (v) => `${v.toFixed(2)} մ`,
    onInput: (v) => { x0 = v; restart(); },
  });
  bindRange('sDamp', {
    format: (v) => `${v.toFixed(2)} կգ/վ`,
    onInput: (v) => { P.b = v; },
  });

  const showX = bindCheckbox('sShowX');
  const showV = bindCheckbox('sShowV');
  const showA = bindCheckbox('sShowA');
  const showVectors = bindCheckbox('sVec');

  const play = bindPlayPause('sPlay');
  onClick('sReset', restart);

  // ---------- Charts ----------
  const chart = createTimeChart(byId('sChart'), () => ({
    samples: osc.samples,
    t: osc.state.t,
    window: osc.window,
    series: [
      { color: 'blue', visible: showX.checked, scale: amp.x, get: (s) => s[1],
        label: `x · max ${amp.x.toFixed(2)} մ` },
      { color: 'teal', visible: showV.checked, scale: amp.v, get: (s) => s[2],
        label: `v · max ${amp.v.toFixed(2)} մ/վ` },
      { color: 'coral', visible: showA.checked, scale: amp.a, get: (s) => s[3],
        label: `a · max ${amp.a.toFixed(1)} մ/վ²` },
    ],
  }));

  const energy = createEnergyChart(byId('sEnergy'), () => {
    const { kin, pot } = springEnergy(osc.state.q, osc.state.u, P);
    return {
      max: amp.energy,
      rows: [
        { sub: 'կ', color: 'amber', value: kin },
        { sub: 'պ', color: 'purple', value: pot },
        { sub: '', color: 'green', value: kin + pot },
      ],
    };
  });

  // ---------- Scene ----------
  function geometry() {
    const { width: W, height: H } = view;
    const top = 28;
    const size = 30 + 22 * Math.cbrt(P.m / 5);              // load side, px
    const scale = (H - top - 36 - 52 - 16) / (2 * X_MAX);   // px per metre
    const eqY = top + 36 + 26 + X_MAX * scale;
    return {
      W, H, top, size, scale, eqY,
      cx: W / 2,
      y: eqY - osc.state.q * scale,                         // load centre
      rulerX: W / 2 + 92,
    };
  }

  function drawCoil(cx, y1, y2) {
    const lead = 7, half = 13;
    const len = Math.max(y2 - y1 - 2 * lead, 4);
    const n = COILS * 14;
    ctx.save();
    ctx.strokeStyle = C.spring;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, y1);
    ctx.lineTo(cx, y1 + lead);
    for (let i = 1; i <= n; i++) {
      const f = i / n;
      ctx.lineTo(cx + half * Math.sin(f * COILS * TAU), y1 + lead + f * len);
    }
    ctx.lineTo(cx, y2);
    ctx.stroke();
    ctx.restore();
  }

  function drawRuler(g) {
    const { rulerX: x, eqY, scale } = g;
    const yTop = eqY - X_MAX * scale - 22, yBottom = eqY + X_MAX * scale + 8;
    arrow(ctx, x, yBottom, x, yTop, { color: COLORS.axis, width: 1.2, head: 7 });
    text(ctx, 'x, մ', x + 8, yTop + 4, { color: COLORS.text3, size: 11 });
    for (let i = -3; i <= 3; i++) {
      const y = eqY - (i / 10) * scale;
      line(ctx, x - 4, y, x + 4, y, { color: COLORS.axis, width: 1 });
      text(ctx, i === 0 ? '0' : fmt(i / 10, 1), x + 9, y, { color: COLORS.text3, size: 10, family: 'mono' });
    }
    // pointer at the current position of the load
    ctx.fillStyle = C.marker;
    ctx.beginPath();
    ctx.moveTo(x - 5, g.y);
    ctx.lineTo(x - 14, g.y - 5);
    ctx.lineTo(x - 14, g.y + 5);
    ctx.closePath();
    ctx.fill();
  }

  function drawScene() {
    const g = geometry();
    const { W, H, top, size, scale, eqY, cx, y, rulerX } = g;
    if (!W) return;
    const { q: x, u: v } = osc.state;

    clear(ctx, W, H, COLORS.canvasBg);
    drawSupport(ctx, cx, top, 56, C.support);

    // Equilibrium line and amplitude limits
    const left = Math.max(12, cx - 190);
    line(ctx, left, eqY, rulerX, eqY, { color: COLORS.axis, width: 1, dash: [5, 5] });
    const lbl = { color: COLORS.text3, size: 11, align: 'right' };
    text(ctx, 'հավասարակշռության', cx - 52, eqY - 9, lbl);
    text(ctx, 'դիրք', cx - 52, eqY + 10, lbl);
    for (const s of [1, -1]) {
      const ya = eqY - s * amp.x * scale;
      line(ctx, cx + 30, ya, rulerX - 6, ya, { color: alpha(C.marker, 0.6), width: 1, dash: [2, 4] });
    }

    drawRuler(g);
    drawCoil(cx, top, y - size / 2);

    // Load
    ctx.fillStyle = C.load;
    ctx.strokeStyle = C.loadRim;
    ctx.lineWidth = 1.5;
    roundRect(ctx, cx - size / 2, y - size / 2, size, size, 6);
    ctx.fill();
    ctx.stroke();
    text(ctx, 'm', cx, y, { color: C.loadText, size: 13, style: 'italic', weight: 600, family: 'display', align: 'center' });

    // Velocity (left of the load) and net force F = −k·x (right), each
    // normalised to its maximum; upwards on screen = positive x.
    if (showVectors.checked) {
      const vLen = (v / amp.v) * 50;
      if (Math.abs(vLen) > 3) {
        const ax = cx - size / 2 - 14;
        arrow(ctx, ax, y, ax, y - vLen, { color: C.velocity, width: 2 });
        vectorLabel(ctx, 'v', ax - 11, y - vLen, C.velocity);
      }
      const fLen = (-x / amp.x) * 50;
      if (Math.abs(fLen) > 3) {
        const ax = cx + size / 2 + 14;
        arrow(ctx, ax, y, ax, y - fLen, { color: C.force, width: 2 });
        vectorLabel(ctx, 'F', ax + 11, y - fLen, C.force);
      }
    }
  }

  // ---------- Readouts ----------
  function updateStats() {
    const T0 = springPeriod(P.m, P.k);
    const T = osc.period;
    setText('sT0', `${T0.toFixed(3)} վ`);
    setText('sFreq', `${(1 / T0).toFixed(3)} Հց`);
    setText('sTm', T ? `${T.toFixed(3)} վ` : '—');
    setText('sX', `${fmt(osc.state.q, 3)} մ`);
    setText('sV', `${fmt(osc.state.u, 2)} մ/վ`);
    setText('sA', `${fmt(osc.accel, 2)} մ/վ²`);
    setText('sTime', `${osc.state.t.toFixed(1)} վ`);
  }

  function render() {
    drawScene();
    chart.draw();
    energy.draw();
    updateStats();
  }

  // ---------- Drag the load to set the release displacement ----------
  onDrag(view, {
    start(p) {
      const g = geometry();
      if (Math.abs(p.x - g.cx) > g.size / 2 + 26 || Math.abs(p.y - g.y) > g.size / 2 + 22) return false;
      dragging = true;
      grabOffset = p.y - g.y;
      return true;
    },
    move(p) {
      const g = geometry();
      x0 = clamp((g.eqY - (p.y - grabOffset)) / g.scale, -X_MAX, X_MAX);
      ampCtl.set(Math.abs(x0), { silent: true });
      ampCtl.show(`${fmt(x0, 2)} մ`);
      restart();
    },
    end() { dragging = false; },
  });

  restart();
  onThemeChange(render);

  return {
    /** Advance by dt seconds (unless paused or held by the pointer) and redraw. */
    frame(dt) {
      if (!play.paused && !dragging) osc.advance(dt);
      render();
    },
  };
}
