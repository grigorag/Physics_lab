// Tab 1 — interference of two coherent point sources.

import { fixedCanvas } from '../../../assets/js/core/canvas.js';
import { bindRange, bindCheckbox } from '../../../assets/js/core/controls.js';
import { byId } from '../../../assets/js/core/dom.js';
import { circle, text } from '../../../assets/js/core/draw.js';
import { DARK as COLORS } from '../../../assets/js/core/theme.js';
import { DEG } from '../../../assets/js/core/math.js';
import { WaveField } from './wavefield.js';

const W = 880, H = 520;
const FIELD_COLOR = [125, 195, 255];
const SOURCE_COLOR = '#ffd86b';
const SRC_X = 170;

export function createInterference() {
  const view = fixedCanvas(byId('itf-canvas'), W, H);
  const { ctx } = view;
  const field = new WaveField(view, 0.25);

  const sLam = bindRange('itf-lambda', { format: (v) => v.toFixed(0) + ' px' });
  const sSep = bindRange('itf-sep', { format: (v) => v.toFixed(0) + ' px' });
  const sPhase = bindRange('itf-phase', { format: (v) => v.toFixed(0) + '°' });
  const sSpeed = bindRange('itf-speed', { format: (v) => '×' + v.toFixed(1) });
  const cIntensity = bindCheckbox('itf-intensity');
  const cPause = bindCheckbox('itf-pause');

  let tAcc = 0;

  function draw(dt) {
    if (!cPause.checked) tAcc += dt * 4.2 * sSpeed.value;
    const lam = sLam.value, d = sSep.value, dphi = sPhase.value * DEG;
    const sources = [
      { x: SRC_X, y: H / 2 - d / 2, ph: 0 },
      { x: SRC_X, y: H / 2 + d / 2, ph: dphi },
    ];
    field.render(sources, lam, tAcc, { intensity: cIntensity.checked, color: FIELD_COLOR });

    for (const s of sources) {
      const pul = 4 + 1.5 * Math.sin(tAcc + s.ph);
      circle(ctx, s.x, s.y, pul, { fill: SOURCE_COLOR, stroke: 'rgba(0,0,0,0.53)', width: 1 });
    }
    const label = { color: COLORS.text, size: 13, baseline: 'alphabetic' };
    text(ctx, 'S₁', SRC_X - 26, H / 2 - d / 2 + 4, label);
    text(ctx, 'S₂', SRC_X - 26, H / 2 + d / 2 + 4, label);
  }

  return { draw };
}
