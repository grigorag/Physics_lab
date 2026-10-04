// Tab 2 — diffraction of a plane wave on N slits (Huygens wavelets).

import { fixedCanvas } from '../../../assets/js/core/canvas.js';
import { bindRange, bindCheckbox } from '../../../assets/js/core/controls.js';
import { byId } from '../../../assets/js/core/dom.js';
import { text } from '../../../assets/js/core/draw.js';
import { DARK as COLORS } from '../../../assets/js/core/theme.js';
import { clamp } from '../../../assets/js/core/math.js';
import { wavelengthToRGB } from '../../../assets/js/core/color.js';
import { WaveField } from './wavefield.js';

const W = 880, H = 520;
const BARRIER_X = 190;
const BARRIER_COLOR = '#7d8db3';

function slitCenters(N, d) {
  const cs = [];
  for (let i = 0; i < N; i++) cs.push(H / 2 + (i - (N - 1) / 2) * d);
  return cs;
}

export function createDiffraction() {
  const view = fixedCanvas(byId('dif-canvas'), W, H);
  const { ctx } = view;
  const field = new WaveField(view, 0.25);

  const sN = bindRange('dif-n', { format: (v) => v.toFixed(0) });
  const sA = bindRange('dif-a', { format: (v) => v.toFixed(0) + ' px' });
  const sD = bindRange('dif-d', { format: (v) => v.toFixed(0) + ' px' });
  const sWL = bindRange('dif-wl', { format: (v) => v.toFixed(0) + ' nm' });
  const sSpeed = bindRange('dif-speed', { format: (v) => '×' + v.toFixed(1) });
  const cIntensity = bindCheckbox('dif-intensity');
  const cPause = bindCheckbox('dif-pause');

  let tAcc = 0;

  function draw(dt) {
    if (!cPause.checked) tAcc += dt * 4.2 * sSpeed.value;
    const N = sN.value, a = sA.value, wl = sWL.value;
    const d = Math.max(sD.value, a + 6);
    const lam = wl * 0.055;                 // visual scale: nm -> px
    const color = wavelengthToRGB(wl);
    const centers = slitCenters(N, d);

    // Huygens wavelet sources sampled across each slit
    const sources = [];
    const perSlit = clamp(Math.round(a / (lam / 3)), 3, 9);
    for (const cy of centers) {
      for (let j = 0; j < perSlit; j++) {
        const y = cy - a / 2 + (j + 0.5) * (a / perSlit);
        sources.push({ x: BARRIER_X + 3, y, ph: 0 });
      }
    }

    field.render(sources, lam, tAcc, { intensity: cIntensity.checked, color, leftPlane: BARRIER_X });

    // barrier with slit gaps
    ctx.fillStyle = BARRIER_COLOR;
    const gaps = centers.map((cy) => [cy - a / 2, cy + a / 2]).sort((p, q) => p[0] - q[0]);
    let yPrev = 0;
    for (const [g0, g1] of gaps) {
      ctx.fillRect(BARRIER_X - 5, yPrev, 10, g0 - yPrev);
      yPrev = g1;
    }
    ctx.fillRect(BARRIER_X - 5, yPrev, 10, H - yPrev);

    // intensity on the screen (right edge), via steady-state phasor sum
    const k = (2 * Math.PI) / lam, scrX = W - 14;
    const prof = [];
    let maxI = 1e-9;
    for (let y = 0; y <= H; y += 3) {
      let re = 0, im = 0;
      for (const s of sources) {
        const dx = scrX - s.x, dy = y - s.y;
        const r = Math.sqrt(dx * dx + dy * dy);
        const att = Math.sqrt(lam / Math.max(r, lam));
        re += Math.cos(k * r) * att;
        im += Math.sin(k * r) * att;
      }
      const I = re * re + im * im;
      prof.push(I);
      if (I > maxI) maxI = I;
    }
    // screen strip
    for (let i = 0; i < prof.length; i++) {
      const In = prof[i] / maxI;
      ctx.fillStyle = `rgb(${(color[0] * In) | 0},${(color[1] * In) | 0},${(color[2] * In) | 0})`;
      ctx.fillRect(W - 12, i * 3, 12, 3);
    }
    // intensity curve
    ctx.beginPath();
    for (let i = 0; i < prof.length; i++) {
      const x = W - 20 - (prof[i] / maxI) * 120;
      const y = i * 3;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    text(ctx, 'ինտենսիվությունը էկրանին →', W - 18, 16, {
      color: COLORS.text, size: 12, align: 'right', baseline: 'alphabetic',
    });
  }

  return { draw };
}
