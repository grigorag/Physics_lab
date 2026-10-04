// Tab 2 — the curve of specific binding energy E/A versus A.
// Static canvas: redrawn on input, resize and theme change. Tap a point to select it.

import { fluidCanvas, pointerPos } from '../../../assets/js/core/canvas.js';
import { bindCheckbox } from '../../../assets/js/core/controls.js';
import { byId, setText, setHTML } from '../../../assets/js/core/dom.js';
import { clear } from '../../../assets/js/core/draw.js';
import { COLORS, onThemeChange, fontsReady } from '../../../assets/js/core/theme.js';
import { clamp } from '../../../assets/js/core/math.js';
import { nuclide, NUCLIDES } from './physics.js';
import { chartLayout, drawChart } from './chart.js';

const PEAK = Math.max(...NUCLIDES.map((n) => n.eps));

export function createCurve(state, select) {
  const view = fluidCanvas(byId('curveCv'), {
    height: (w) => Math.round(clamp(w * 0.62, 320, 470)),
    onResize: () => draw(),
  });
  const { ctx } = view;
  let pts = [];

  const showCurve = bindCheckbox('showCurve', { onChange: () => draw() });
  const allLabels = bindCheckbox('allLabels', { onChange: () => draw() });

  function draw() {
    if (!view.width) return;
    clear(ctx, view.width, view.height, COLORS.canvasBg);
    const L = chartLayout(view.width, view.height);
    pts = drawChart(ctx, L, { selected: state.key, showCurve: showCurve.checked, allLabels: allLabels.checked });
  }

  function updateStats() {
    const n = nuclide(state.key);
    setHTML('c-name', `<sup>${n.A}</sup>${n.sym} · ${n.name}`);
    setText('c-A', String(n.A));
    setText('c-E', `${n.E.toFixed(2)} ՄէՎ`);
    setText('c-eps', `${n.eps.toFixed(3)} ՄէՎ/նուկլոն`);
    setText('c-gap', `${(PEAK - n.eps).toFixed(2)} ՄէՎ/նուկլոն`);
    let msg;
    if (n.A === 1) msg = '<b>Մեկ նուկլոն</b>․ կապի էներգիա չկա։ Ջրածնի միջուկները (պրոտոնները) աստղերում սինթեզվում են հելիումի։';
    else if (n.A < 50) msg = '<b>Թեթև միջուկ</b>․ կորի ձախ թևում է։ Թեթև միջուկների <b>սինթեզի</b> ժամանակ առաջանում է ավելի ամուր կապված միջուկ, և էներգիա է անջատվում։';
    else if (n.A <= 70) msg = '<b>Կորի գագաթին մոտ</b>․ սա ամենաամուր կապված միջուկներից է։ Ո՛չ բաժանումը, ո՛չ սինթեզը էներգիա չեն տա։';
    else if (n.A < 180) msg = '<b>Միջին զանգվածի միջուկ</b>․ նման միջուկներ առաջանում են ծանր միջուկների բաժանման արդյունքում (բաժանման բեկորներ)։';
    else msg = '<b>Ծանր միջուկ</b>․ կորի աջ թևում է։ Երկու միջին միջուկի <b>բաժանվելիս</b> նուկլոններն ավելի ամուր են կապվում, և էներգիա է անջատվում։';
    setHTML('c-note', msg);
  }

  view.canvas.addEventListener('pointerdown', (e) => {
    const p = pointerPos(view, e);
    let best = null, bestD = 22;
    for (const q of pts) {
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bestD) { bestD = d; best = q; }
    }
    if (best) select(best.key);
  });

  onThemeChange(draw);
  fontsReady().then(draw);

  return { update() { updateStats(); draw(); }, redraw: draw };
}
