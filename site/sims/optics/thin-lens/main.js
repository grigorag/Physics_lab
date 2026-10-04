// Thin lens — ray construction of the image.
//
// World coordinates: origin at the lens centre, x to the right, y up,
// ~36 world units across the canvas. The object stands at x = d (< 0).
// Sign convention for the calculation: d, f > 0 for a real object/image.

import { fluidCanvas, onDrag } from '../../../assets/js/core/canvas.js';
import { bindRange } from '../../../assets/js/core/controls.js';
import { setText, setHTML } from '../../../assets/js/core/dom.js';
import { arrow as arrowPx, circle, text, clear } from '../../../assets/js/core/draw.js';
import { COLORS, fontsReady } from '../../../assets/js/core/theme.js';

const C = {
  object: COLORS.coral,
  image: COLORS.teal,
  ray1: COLORS.amber,
  ray2: COLORS.purple,
  ray3: 'rgba(46,203,161,0.75)',
  focus: COLORS.purple,
  lens: 'rgba(55,138,221,0.9)',
};

// ---------- Canvas & world transform ----------
const view = fluidCanvas(document.getElementById('cv'), {
  height: (w) => Math.max(320, Math.round(w * 0.56)),
  onResize: () => draw(),
});
const { ctx } = view;

let SCALE = 1, OX = 0, OY = 0;
const wx = (x) => OX + x * SCALE;
const wy = (y) => OY - y * SCALE;

// ---------- Controls ----------
let lastF = 4;
const fCtl = bindRange('fSlider', {
  format: (v) => v.toFixed(1),
  onInput: (v) => {
    // F = 0 is not a lens: skip over it in the direction the slider moved.
    if (v === 0) { fCtl.set(lastF > 0 ? -0.5 : 0.5, { silent: true }); }
    lastF = fCtl.value;
    draw();
  },
});
const dCtl = bindRange('dSlider', { format: (v) => v.toFixed(1), onInput: draw });
const hCtl = bindRange('hSlider', { format: (v) => v.toFixed(1), onInput: draw });

// ---------- Optics ----------
function solve() {
  const f = fCtl.value;
  const d1 = dCtl.value;       // negative: object left of the lens
  const h = hCtl.value;
  const absD1 = Math.abs(d1);
  const invD2 = 1 / f - 1 / absD1;
  const atInfinity = Math.abs(invD2) < 1e-4;
  const d2 = atInfinity ? Infinity : 1 / invD2;   // > 0 real image (right), < 0 virtual (left)
  return { f, d1, h, absD1, invD2, d2, atInfinity };
}

function updateReadouts({ f, absD1, invD2 }) {
  setText('d1Val', absD1.toFixed(2));
  setText('fInvVal', (1 / f).toFixed(4));

  if (Math.abs(invD2) < 1e-6) {
    setText('d2Val', '∞');
    setText('magVal', '∞');
    setText('checkVal', (1 / absD1).toFixed(4));
    setHTML('infoBox', '<b>Պատկերն անվերջ հեռու է</b><br>Առարկան կիզակետում է։');
    return;
  }

  const d2 = 1 / invD2;
  const mag = -d2 / absD1;     // negative → inverted
  setText('d2Val', Math.abs(d2).toFixed(2) + (d2 > 0 ? '' : ' (կեղծ)'));
  setText('magVal', mag.toFixed(3));
  setText('checkVal', (1 / absD1 + 1 / Math.abs(d2)).toFixed(4));

  let info;
  if (d2 > 0) {
    if (absD1 > 2 * f + 1e-6) info = '<b>Իրական, շրջված, փոքրացված</b><br>Պատկերը F-ի և 2F-ի միջև է։';
    else if (Math.abs(absD1 - 2 * f) <= 1e-6) info = '<b>Իրական, շրջված, հավասար</b><br>Պատկերը 2F-ում է։';
    else info = '<b>Իրական, շրջված, խոշորացված</b><br>Առարկան F-ի և 2F-ի միջև է։';
  } else if (f > 0) {
    info = '<b>Կեղծ, ուղիղ, խոշորացված</b><br>Առարկան կիզակետից ներս է (d &lt; F)։';
  } else {
    info = '<b>Կեղծ, ուղիղ, փոքրացված</b><br>Ցրող ոսպնյակը միշտ տալիս է կեղծ պատկեր։';
  }
  setHTML('infoBox', info);
}

// ---------- Drawing helpers (world units) ----------
function line(x1, y1, x2, y2, color, width = 1, dash = null) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(wx(x1), wy(y1));
  ctx.lineTo(wx(x2), wy(y2));
  ctx.stroke();
  ctx.restore();
}
const arrow = (x1, y1, x2, y2, color, width = 1.5) =>
  arrowPx(ctx, wx(x1), wy(y1), wx(x2), wy(y2), { color, width, head: 8, spread: 0.38 });
const dot = (x, y, r, fill, stroke) => circle(ctx, wx(x), wy(y), r, { fill, stroke });
const label = (str, x, y, color, align = 'left', baseline = 'middle', size = 12) =>
  text(ctx, str, wx(x), wy(y), { color, align, baseline, size, family: 'mono' });

/** Point where a ray from (x0,y0) along (dx,dy) leaves the visible world (+margin). */
function rayEnd(x0, y0, dx, dy, margin = 2) {
  const xMax = OX / SCALE + margin, xMin = -xMax;
  const yMax = OY / SCALE + margin, yMin = -yMax;
  let t = Infinity;
  if (dx > 0) t = Math.min(t, (xMax - x0) / dx);
  if (dx < 0) t = Math.min(t, (xMin - x0) / dx);
  if (dy > 0) t = Math.min(t, (yMax - y0) / dy);
  if (dy < 0) t = Math.min(t, (yMin - y0) / dy);
  return [x0 + dx * t, y0 + dy * t];
}

function drawLens(f, top, bottom) {
  line(0, bottom, 0, top, C.lens, 2.5);
  // Converging lens: arrowheads point outward; diverging: inward.
  const head = 9;
  for (const [yEnd, out] of [[top, -1], [bottom, 1]]) {
    const x = wx(0), y = wy(yEnd);
    if (f > 0) arrowPx(ctx, x, y - out * head * 2, x, y, { color: C.lens, width: 2, head });
    else arrowPx(ctx, x, y, x, y - out * head, { color: C.lens, width: 2, head });
  }
}

// ---------- Main draw ----------
function draw() {
  const { width: W, height: H } = view;
  if (!W) return;
  SCALE = W / 36;
  OX = W / 2;
  OY = H / 2;

  const s = solve();
  const { f, d1, h, absD1, d2, atInfinity } = s;
  const hasImage = !atInfinity && Math.abs(d2) < 900;
  const Tx = d1, Ty = h;                                   // object tip
  const Ix = d2, Iy = hasImage ? -(d2 / absD1) * h : 0;     // image tip
  const virtual = hasImage && d2 < 0;

  clear(ctx, W, H, COLORS.canvasBg);

  // Grid
  const worldW = OX / SCALE, worldH = OY / SCALE;
  ctx.save();
  ctx.strokeStyle = 'rgba(120,140,200,0.06)';
  ctx.lineWidth = 0.5;
  for (let x = -Math.ceil(worldW); x <= Math.ceil(worldW); x++) {
    ctx.beginPath(); ctx.moveTo(wx(x), 0); ctx.lineTo(wx(x), H); ctx.stroke();
  }
  for (let y = -Math.ceil(worldH); y <= Math.ceil(worldH); y++) {
    ctx.beginPath(); ctx.moveTo(0, wy(y)); ctx.lineTo(W, wy(y)); ctx.stroke();
  }
  ctx.restore();

  // Optical axis and lens
  line(-worldW, 0, worldW, 0, COLORS.axis, 1);
  const lensTop = worldH * 0.88, lensBottom = -lensTop;
  drawLens(f, lensTop, lensBottom);

  // Focal points
  for (const x of [f, -f]) {
    dot(x, 0, 5, C.focus, '#b0aaff');
    label('F', x + 0.15, 0.35, C.focus, 'left', 'middle', 11);
    dot(2 * x, 0, 3, 'rgba(124,111,247,0.4)');
    label('2F', 2 * x + 0.1, 0.35, 'rgba(124,111,247,0.5)', 'left', 'middle', 10);
  }

  // Object
  arrow(Tx, 0, Tx, Ty, C.object, 2.5);
  dot(Tx, 0, 5, C.object, '#ffaa88');
  label('S', Tx - 0.3, Ty + 0.45, C.object, 'right', 'bottom', 12);

  // Ray 1: parallel to the axis, then through the back focus
  // (diverging lens: away from the front focus, as if coming from it).
  line(Tx, Ty, 0, Ty, C.ray1, 1.5);
  {
    const dx = f > 0 ? f : -f;
    const dy = f > 0 ? -Ty : Ty;
    const len = Math.hypot(dx, dy);
    const [ex, ey] = rayEnd(0, Ty, dx / len, dy / len);
    line(0, Ty, ex, ey, C.ray1, 1.5);
    if (f < 0) line(0, Ty, f, 0, C.ray1, 1, [4, 4]);
    else if (virtual) line(0, Ty, Ix, Iy, C.ray1, 1, [4, 4]);
  }

  // Ray 2: straight through the optical centre
  {
    const len = Math.hypot(Tx, Ty);
    const [ex, ey] = rayEnd(0, 0, -Tx / len, -Ty / len);
    line(Tx, Ty, ex, ey, C.ray2, 1.5);
    if (virtual && f > 0) line(Tx, Ty, Ix, Iy, C.ray2, 1, [4, 4]);
  }

  // Ray 3 (converging lens): through the front focus, then parallel
  if (f > 0) {
    const slope = (0 - Ty) / (-f - Tx);
    const yAtLens = Ty + slope * (0 - Tx);
    line(Tx, Ty, 0, yAtLens, C.ray3, 1.5);
    const [ex, ey] = rayEnd(0, yAtLens, 1, 0);
    line(0, yAtLens, ex, ey, C.ray3, 1.5);
    if (virtual) line(0, yAtLens, Ix, Iy, C.ray3, 1, [4, 4]);
  }

  // Image
  if (hasImage) {
    const above = Iy < 0 ? -0.5 : 0.5;
    if (!virtual) {
      arrow(Ix, 0, Ix, Iy, C.image, 2.5);
      dot(Ix, 0, 5, C.image, 'rgba(46,203,161,0.5)');
      label("S'", Ix + 0.15, Iy + above, C.image, 'left', 'middle', 12);
    } else {
      line(Ix, 0, Ix, Iy, 'rgba(46,203,161,0.55)', 2, [4, 5]);
      dot(Ix, 0, 5, 'rgba(46,203,161,0.7)');
      label("S'", Ix + 0.15, Iy + above, 'rgba(46,203,161,0.8)', 'left', 'middle', 12);
    }
  }

  // Distance annotations
  const annoY = -worldH * 0.78;
  if (absD1 > 0.5) {
    line(Tx, annoY, 0, annoY, 'rgba(240,113,74,0.45)', 1, [3, 4]);
    label(`|d|=${absD1.toFixed(1)}`, Tx / 2, annoY + 0.2, 'rgba(240,113,74,0.75)', 'center', 'bottom', 10);
  }
  if (hasImage && Math.abs(d2) < 30) {
    line(0, annoY, Ix, annoY, 'rgba(46,203,161,0.4)', 1, [3, 4]);
    label(`|f|=${Math.abs(d2).toFixed(1)}`, Ix / 2, annoY - 0.6, 'rgba(46,203,161,0.75)', 'center', 'bottom', 10);
  }

  // Lens caption
  text(ctx, `F = ${f.toFixed(1)}`, wx(0), wy(lensTop) - 24, { color: 'rgba(55,138,221,0.7)', size: 11, family: 'mono', align: 'center' });
  text(ctx, f > 0 ? 'հավաքող ոսպնյակ' : 'ցրող ոսպնյակ', wx(0), wy(lensTop) - 10, { color: 'rgba(55,138,221,0.7)', size: 11, align: 'center' });

  updateReadouts(s);
}

// ---------- Drag the object along the axis ----------
function dragTo(p) {
  const x = (p.x - OX) / SCALE;
  if (x >= -0.5) return false;
  dCtl.set(Math.max(-18, Math.min(-1.1, x)).toFixed(2));
}
onDrag(view, { start: dragTo, move: dragTo });

fontsReady().then(draw);
draw();
