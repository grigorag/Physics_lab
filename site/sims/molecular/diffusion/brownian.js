// Experiment 1 — Brownian motion.
// A heavy disc in the middle of a box is pushed around by many small
// molecules. Units: canvas pixels, time step in 60-fps frames.

import { fixedCanvas } from '../../../assets/js/core/canvas.js';
import { bindRange, bindCheckbox, bindPlayPause, onClick } from '../../../assets/js/core/controls.js';
import { byId, setText } from '../../../assets/js/core/dom.js';
import { clear, circle } from '../../../assets/js/core/draw.js';
import { COLORS, themed, onThemeChange } from '../../../assets/js/core/theme.js';
import { rand } from '../../../assets/js/core/math.js';
import { thermalVelocity, bounceBox, collide, collideAll, rescale } from './physics.js';

const W = 620, H = 320;
const SMALL_RADIUS = 3;
const BIG_RADIUS = 15;
const TRAIL_MAX = 1500;
const MSD_MAX = 400;

const C = themed((light) => ({
  molecule: light ? '#3d8fb5' : '#6FB3D2',
  big: light ? '#e0a020' : '#E7B95C',
  bigEdge: 'rgba(0, 0, 0, 0.3)',
  trail: light ? 'rgba(190, 125, 0, 0.5)' : 'rgba(231, 185, 92, 0.35)',
  msd: light ? '#c98a08' : '#E7B95C',
}));

export function createBrownian() {
  const view = fixedCanvas(byId('sim'), W, H);
  const chart = fixedCanvas(byId('msd'), 272, 130);
  const { ctx } = view;

  // ---------- State ----------
  let molecules = [];
  let big;
  let trail = [];
  let msdHistory = [];
  let time = 0;
  let pathLength = 0;
  let startPos;

  // ---------- Controls ----------
  let currentTemp;
  const temp = bindRange('tempSlider', {
    format: (v) => v.toFixed(1),
    onInput: (v) => {
      rescale(molecules, v / currentTemp);
      currentTemp = v;
    },
  });
  currentTemp = temp.value;
  const count = bindRange('countSlider', { onChange: () => { init(); render(); } });
  const mass = bindRange('massSlider', { onInput: (v) => { big.m = v; } });
  const showTrail = bindCheckbox('trailToggle', { onChange: () => { if (play.paused) draw(); } });
  const play = bindPlayPause('pauseBtn');
  onClick('resetBtn', () => { init(); render(); });

  // ---------- Physics ----------
  function makeMolecule() {
    return {
      x: rand(SMALL_RADIUS, W - SMALL_RADIUS),
      y: rand(SMALL_RADIUS, H - SMALL_RADIUS),
      ...thermalVelocity(currentTemp),
      r: SMALL_RADIUS,
      m: 1,
    };
  }

  function init() {
    const n = count.value;
    molecules = [];
    for (let i = 0; i < n; i++) {
      let m, tries = 0;
      do {
        m = makeMolecule();
        tries++;
      } while (Math.hypot(m.x - W / 2, m.y - H / 2) < BIG_RADIUS + 20 && tries < 50);
      molecules.push(m);
    }
    big = { x: W / 2, y: H / 2, vx: 0, vy: 0, r: BIG_RADIUS, m: mass.value };
    startPos = { x: big.x, y: big.y };
    trail = [{ x: big.x, y: big.y }];
    msdHistory = [];
    time = 0;
    pathLength = 0;
  }

  function step(dt) {
    for (const mo of molecules) {
      mo.x += mo.vx * dt; mo.y += mo.vy * dt;
      bounceBox(mo, W, H);
    }
    big.x += big.vx * dt; big.y += big.vy * dt;
    bounceBox(big, W, H);

    collideAll(molecules);
    for (const mo of molecules) collide(mo, big);

    const last = trail[trail.length - 1];
    pathLength += Math.hypot(big.x - last.x, big.y - last.y);
    trail.push({ x: big.x, y: big.y });
    if (trail.length > TRAIL_MAX) trail.shift();

    time += dt / 60;
    const dx = big.x - startPos.x, dy = big.y - startPos.y;
    msdHistory.push({ t: time, msd: dx * dx + dy * dy });
    if (msdHistory.length > MSD_MAX) msdHistory.shift();
  }

  // ---------- Drawing ----------
  function draw() {
    clear(ctx, W, H, COLORS.canvasBg);

    if (showTrail.checked && trail.length > 1) {
      ctx.beginPath();
      ctx.moveTo(trail[0].x, trail[0].y);
      for (let i = 1; i < trail.length; i++) ctx.lineTo(trail[i].x, trail[i].y);
      ctx.strokeStyle = C.trail;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }

    for (const mo of molecules) circle(ctx, mo.x, mo.y, mo.r, { fill: C.molecule });
    circle(ctx, big.x, big.y, big.r, { fill: C.big, stroke: C.bigEdge, width: 1 });
  }

  function drawMSD() {
    const { ctx: g, width: w, height: h } = chart;
    clear(g, w, h, COLORS.canvasBg);
    if (msdHistory.length < 2) return;

    let maxMSD = 1;
    for (const p of msdHistory) if (p.msd > maxMSD) maxMSD = p.msd;
    const minT = msdHistory[0].t;
    const maxT = msdHistory[msdHistory.length - 1].t;
    const spanT = (maxT - minT) || 1;

    g.beginPath();
    msdHistory.forEach((p, i) => {
      const x = ((p.t - minT) / spanT) * w;
      const y = h - (p.msd / maxMSD) * (h - 6) - 3;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    });
    g.strokeStyle = C.msd;
    g.lineWidth = 2;
    g.stroke();
  }

  function updateReadout() {
    setText('speedVal', Math.hypot(big.vx, big.vy).toFixed(2));
    setText('pathVal', String(Math.round(pathLength)));
    setText('timeVal', `${time.toFixed(1)} վ`);
  }

  function render() {
    draw();
    drawMSD();
    updateReadout();
  }

  init();
  render();
  onThemeChange(render);

  return {
    /** Advance by `frames` 60-fps frames (2 substeps) and redraw; frozen while paused. */
    frame(frames) {
      if (play.paused) return;
      const substeps = 2;
      for (let s = 0; s < substeps; s++) step(frames / substeps);
      render();
    },
  };
}
