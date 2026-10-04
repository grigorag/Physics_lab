// Experiment 2 — two gases mixing after a partition is removed.
// Units: canvas pixels, time step in 60-fps frames.

import { fixedCanvas } from '../../../assets/js/core/canvas.js';
import { bindRange, onClick } from '../../../assets/js/core/controls.js';
import { byId } from '../../../assets/js/core/dom.js';
import { clear, circle } from '../../../assets/js/core/draw.js';
import { COLORS, themed, onThemeChange } from '../../../assets/js/core/theme.js';
import { rand } from '../../../assets/js/core/math.js';
import { thermalVelocity, bounceBox, collideAll, rescale } from './physics.js';

const W = 820, H = 260;
const R = 4;
const WALL_X = W / 2;
const BINS = 24;

const C = themed((light) => ({
  left: light ? '#3d8fb5' : '#6FB3D2',   // gas A (starts on the left)
  right: light ? '#d9623a' : '#E2835A',  // gas B (starts on the right)
  wall: light ? '#8a9bb8' : '#3A5A80',
}));

export function createDiffusion() {
  const view = fixedCanvas(byId('diffSim'), W, H);
  const chart = fixedCanvas(byId('diffChart'), 820, 60);
  const { ctx } = view;
  const wallBtn = byId('diffWallBtn');

  // ---------- State ----------
  let particles = [];
  let wallPresent = true;

  // ---------- Controls ----------
  let currentTemp;
  const temp = bindRange('diffTempSlider', {
    format: (v) => v.toFixed(1),
    onInput: (v) => {
      rescale(particles, v / currentTemp);
      currentTemp = v;
    },
  });
  currentTemp = temp.value;
  const count = bindRange('diffCountSlider', { onChange: () => { init(); render(); } });
  onClick('diffWallBtn', () => {
    wallPresent = false;
    wallBtn.disabled = true;
  });
  onClick('diffResetBtn', () => { init(); render(); });

  // ---------- Physics ----------
  function makeParticle(species) {
    const x = species === 'left' ? rand(R, WALL_X - R) : rand(WALL_X + R, W - R);
    return { x, y: rand(R, H - R), ...thermalVelocity(currentTemp), r: R, m: 1, species };
  }

  function init() {
    const n = count.value;
    particles = [];
    for (let i = 0; i < n; i++) particles.push(makeParticle('left'));
    for (let i = 0; i < n; i++) particles.push(makeParticle('right'));
    wallPresent = true;
    wallBtn.disabled = false;
  }

  function bounce(p) {
    bounceBox(p, W, H);
    if (wallPresent) {
      if (p.species === 'left' && p.x + p.r > WALL_X) { p.x = WALL_X - p.r; p.vx *= -1; }
      if (p.species === 'right' && p.x - p.r < WALL_X) { p.x = WALL_X + p.r; p.vx *= -1; }
    }
  }

  function step(dt) {
    for (const p of particles) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      bounce(p);
    }
    collideAll(particles);
  }

  // ---------- Drawing ----------
  function draw() {
    clear(ctx, W, H, COLORS.canvasBg);
    if (wallPresent) {
      ctx.fillStyle = C.wall;
      ctx.fillRect(WALL_X - 2, 0, 4, H);
    }
    for (const p of particles) circle(ctx, p.x, p.y, p.r, { fill: C[p.species] });
  }

  function drawChart() {
    const { ctx: g, width: w, height: h } = chart;
    clear(g, w, h, COLORS.canvasBg);

    const binsA = new Array(BINS).fill(0);
    const binsB = new Array(BINS).fill(0);
    const binW = W / BINS;
    for (const p of particles) {
      const bin = Math.min(BINS - 1, Math.max(0, Math.floor(p.x / binW)));
      if (p.species === 'left') binsA[bin]++; else binsB[bin]++;
    }

    let maxCount = 1;
    for (let i = 0; i < BINS; i++) maxCount = Math.max(maxCount, binsA[i] + binsB[i]);

    const colW = w / BINS;
    for (let i = 0; i < BINS; i++) {
      const hA = (binsA[i] / maxCount) * (h - 8);
      const hB = (binsB[i] / maxCount) * (h - 8);
      g.fillStyle = C.left;
      g.fillRect(i * colW + 1, h - hA, colW - 2, hA);
      g.fillStyle = C.right;
      g.fillRect(i * colW + 1, h - hA - hB, colW - 2, hB);
    }
  }

  function render() {
    draw();
    drawChart();
  }

  init();
  render();
  onThemeChange(render);

  return {
    /** Advance by `frames` 60-fps frames (2 substeps) and redraw. */
    frame(frames) {
      const substeps = 2;
      for (let s = 0; s < substeps; s++) step(frames / substeps);
      render();
    },
  };
}
