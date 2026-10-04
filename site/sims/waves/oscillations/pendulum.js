// Tab 1 — mathematical pendulum.
// State: angle φ (rad, positive to the right) and angular velocity ω.
// The full nonlinear equation is integrated, so the measured period grows
// with the amplitude while T₀ = 2π√(l/g) stays the small-angle value.

import { fluidCanvas, onDrag } from '../../../assets/js/core/canvas.js';
import {
  bindRange, bindCheckbox, bindSegmented, bindPlayPause, onClick,
} from '../../../assets/js/core/controls.js';
import { byId, setText } from '../../../assets/js/core/dom.js';
import { clear, line, arrow, circle, text } from '../../../assets/js/core/draw.js';
import { COLORS, themed, alpha, onThemeChange } from '../../../assets/js/core/theme.js';
import { clamp, DEG } from '../../../assets/js/core/math.js';
import {
  createOscillator, pendulumAccel, pendulumPeriod, pendulumEnergy,
} from './physics.js';
import {
  fmt, createTimeChart, createEnergyChart, drawSupport, vectorLabel,
} from './shared.js';

const MAX_ANGLE = 80 * DEG;
const L_MAX = 3;            // longest thread, m (fills the canvas)
const WINDOW_PERIODS = 4;   // the graph shows this many small-angle periods

const C = themed((light) => ({
  support: light ? '#7d88a8' : '#5a6794',
  thread: light ? '#4a5270' : '#aab2cd',
  bob: COLORS.amber,
  bobRim: light ? '#6e4200' : '#ffd58a',
  velocity: COLORS.teal,
  gravity: COLORS.red,
  tension: COLORS.purple,
  angle: COLORS.blue,
}));

export function createPendulum() {
  const view = fluidCanvas(byId('pScene'), {
    height: (w) => clamp(Math.round(w * 0.5), 290, 420),
    onResize: () => render(),
  });
  const { ctx } = view;

  // ---------- State ----------
  const P = { l: 1, m: 1, g: 9.8, gamma: 0 };
  const osc = createOscillator((q, u) => pendulumAccel(q, u, P));
  let phi0 = 10 * DEG;     // release angle (signed)
  let dragging = false;

  // Amplitudes used to normalise the curves and the vectors.
  const amp = { phi: 1, v: 1, a: 1, energy: 1 };

  function updateAmplitudes() {
    const A = Math.max(Math.abs(phi0), 1e-4);
    amp.phi = A;
    amp.v = Math.sqrt(2 * P.g * P.l * (1 - Math.cos(A)));
    amp.a = P.g * Math.sin(A);
    amp.energy = P.m * P.g * P.l * (1 - Math.cos(A));
  }

  /** Release from rest at φ₀; clears the graph and the period measurement. */
  function restart() {
    updateAmplitudes();
    osc.setWindow(WINDOW_PERIODS * pendulumPeriod(P.l, P.g));
    osc.reset(phi0, 0);
    render();
  }

  // ---------- Controls ----------
  bindRange('pLen', {
    format: (v) => `${v.toFixed(2)} մ`,
    onInput: (v) => { P.l = v; restart(); },
  });
  const angleCtl = bindRange('pAngle', {
    format: (v) => `${v.toFixed(0)}°`,
    onInput: (v) => { phi0 = v * DEG; restart(); },
  });
  bindRange('pMass', {
    format: (v) => `${v.toFixed(1)} կգ`,
    onInput: (v) => { P.m = v; updateAmplitudes(); },   // the motion itself does not change
  });
  bindSegmented('pGravity', {
    onChange: (v) => { P.g = parseFloat(v); showGravity(); restart(); },
  });
  bindRange('pDamp', {
    format: (v) => `${v.toFixed(2)} վ⁻¹`,
    onInput: (v) => { P.gamma = v; },
  });
  const showGravity = () => setText('pGravityVal', `${P.g.toFixed(2)} մ/վ²`);

  const showPhi = bindCheckbox('pShowX');
  const showV = bindCheckbox('pShowV');
  const showA = bindCheckbox('pShowA');
  const showVelocity = bindCheckbox('pVecV');
  const showForces = bindCheckbox('pVecF');

  const play = bindPlayPause('pPlay');
  onClick('pReset', restart);

  // ---------- Charts ----------
  const chart = createTimeChart(byId('pChart'), () => ({
    samples: osc.samples,
    t: osc.state.t,
    window: osc.window,
    series: [
      { color: 'blue', visible: showPhi.checked, scale: amp.phi, get: (s) => s[1],
        label: `φ · max ${(amp.phi / DEG).toFixed(1)}°` },
      { color: 'teal', visible: showV.checked, scale: amp.v, get: (s) => s[2] * P.l,
        label: `v · max ${amp.v.toFixed(2)} մ/վ` },
      { color: 'coral', visible: showA.checked, scale: amp.a, get: (s) => s[3] * P.l,
        label: `a · max ${amp.a.toFixed(2)} մ/վ²` },
    ],
  }));

  const energy = createEnergyChart(byId('pEnergy'), () => {
    const { kin, pot } = pendulumEnergy(osc.state.q, osc.state.u, P);
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
    const px = W / 2, py = 28;
    const fit = Math.min(H - py - 60, (W / 2 - 26) / Math.sin(MAX_ANGLE));
    // √ scaling keeps short pendulums legible; the scale bar shows the real size.
    const L = fit * (P.l / L_MAX) ** 0.4;
    const phi = osc.state.q;
    return {
      W, H, px, py, L,
      scale: L / P.l,                         // px per metre
      bx: px + L * Math.sin(phi),
      by: py + L * Math.cos(phi),
      r: 7 + 3.5 * Math.cbrt(P.m),
    };
  }

  function drawScaleBar(g) {
    const len = [1, 0.5, 0.2, 0.1, 0.05].find((v) => v * g.scale <= 90) ?? 0.05;
    const x = 16, y = g.H - 18, w = len * g.scale;
    const opts = { color: COLORS.text3, width: 1.5 };
    line(ctx, x, y, x + w, y, opts);
    line(ctx, x, y - 4, x, y + 4, opts);
    line(ctx, x + w, y - 4, x + w, y + 4, opts);
    text(ctx, `${len} մ`, x + w / 2, y - 10, { color: COLORS.text3, size: 11, align: 'center' });
  }

  function drawScene() {
    const g = geometry();
    const { W, H, px, py, L, bx, by, r } = g;
    if (!W) return;
    const { q: phi, u: omega } = osc.state;

    clear(ctx, W, H, COLORS.canvasBg);
    drawSupport(ctx, px, py, 56, C.support);

    // Vertical (equilibrium) and the path of the bob between ±amplitude
    line(ctx, px, py, px, py + L + 14, { color: COLORS.axis, width: 1, dash: [4, 5] });
    ctx.save();
    ctx.strokeStyle = COLORS.axis;
    ctx.setLineDash([2, 5]);
    ctx.beginPath();
    ctx.arc(px, py, L, Math.PI / 2 - amp.phi, Math.PI / 2 + amp.phi);
    ctx.stroke();
    ctx.restore();

    // Angle arc and its value
    const ra = clamp(L * 0.4, 14, 46);
    if (Math.abs(phi) > 0.004) {
      ctx.save();
      ctx.strokeStyle = C.angle;
      ctx.fillStyle = alpha(C.angle, 0.14);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.arc(px, py, ra, Math.PI / 2, Math.PI / 2 - phi, phi > 0);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(px, py, ra, Math.PI / 2, Math.PI / 2 - phi, phi > 0);
      ctx.stroke();
      ctx.restore();
    }
    {
      // label sits just outside the thread, on the side the bob is on
      const side = phi >= 0 ? 1 : -1;
      const dir = clamp(Math.abs(phi) + 0.3, 0.3, 86 * DEG) * side;
      text(ctx, `φ = ${fmt(phi / DEG, 1)}°`, px + (ra + 8) * Math.sin(dir), py + (ra + 8) * Math.cos(dir) + 4, {
        color: C.angle, size: 12, family: 'mono', align: side > 0 ? 'left' : 'right',
      });
    }

    // Thread, pivot, bob
    line(ctx, px, py, bx, by, { color: C.thread, width: 1.5 });
    circle(ctx, px, py, 3.5, { fill: C.thread });
    circle(ctx, bx, by, r, { fill: C.bob, stroke: C.bobRim, width: 1.5 });

    // Forces: gravity (down) and thread tension (towards the pivot)
    if (showForces.checked) {
      const unit = 40;                                        // px for m·g
      const tension = Math.cos(phi) + (P.l * omega * omega) / P.g;   // T / (m·g)
      arrow(ctx, bx, by, bx, by + unit, { color: C.gravity, width: 2 });
      vectorLabel(ctx, 'mg', bx + 16, by + unit - 2, C.gravity);
      const tx = bx - Math.sin(phi) * unit * tension, ty = by - Math.cos(phi) * unit * tension;
      arrow(ctx, bx, by, tx, ty, { color: C.tension, width: 2 });
      vectorLabel(ctx, 'T', tx + (phi >= 0 ? 12 : -12), ty + 2, C.tension);
    }

    // Velocity (tangent to the path), normalised to its maximum
    if (showVelocity.checked && amp.v > 1e-6) {
      const len = ((P.l * omega) / amp.v) * 56;
      if (Math.abs(len) > 3) {
        const vx = bx + Math.cos(phi) * len, vy = by - Math.sin(phi) * len;
        arrow(ctx, bx, by, vx, vy, { color: C.velocity, width: 2 });
        vectorLabel(ctx, 'v', vx + Math.sign(len) * 9 * Math.cos(phi), vy - 11, C.velocity);
      }
    }

    drawScaleBar(g);
  }

  // ---------- Readouts ----------
  function updateStats() {
    const T0 = pendulumPeriod(P.l, P.g);
    const T = osc.period;
    setText('pT0', `${T0.toFixed(3)} վ`);
    setText('pFreq', `${(1 / T0).toFixed(3)} Հց`);
    setText('pTm', T ? `${T.toFixed(3)} վ` : '—');
    setText('pRatio', T ? (T / T0).toFixed(3) : '—');
    setText('pPhi', `${fmt(osc.state.q / DEG, 1)}°`);
    setText('pV', `${fmt(P.l * osc.state.u, 2)} մ/վ`);
    setText('pTime', `${osc.state.t.toFixed(1)} վ`);
  }

  function render() {
    drawScene();
    chart.draw();
    energy.draw();
    updateStats();
  }

  // ---------- Drag the bob to set the release angle ----------
  onDrag(view, {
    start(p) {
      const g = geometry();
      if (Math.hypot(p.x - g.bx, p.y - g.by) > g.r + 28) return false;
      dragging = true;
      return true;
    },
    move(p) {
      const g = geometry();
      phi0 = clamp(Math.atan2(p.x - g.px, p.y - g.py), -MAX_ANGLE, MAX_ANGLE);
      angleCtl.set(Math.abs(phi0) / DEG, { silent: true });
      angleCtl.show(`${fmt(phi0 / DEG, 1)}°`);
      restart();
    },
    end() { dragging = false; },
  });

  showGravity();
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
