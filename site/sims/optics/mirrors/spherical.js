// Tab 1 — spherical mirror: construction of the image with principal rays.
//
// World coordinates: origin at the pole, x to the right, y up. Light comes
// from the left. ~38 world units across the canvas, the pole at 55 % of the width.

import { fluidCanvas, onDrag } from '../../../assets/js/core/canvas.js';
import { bindRange } from '../../../assets/js/core/controls.js';
import { byId, setText, setHTML } from '../../../assets/js/core/dom.js';
import { clear, text } from '../../../assets/js/core/draw.js';
import { COLORS, themed, alpha, onThemeChange, fontsReady } from '../../../assets/js/core/theme.js';
import { createWorld } from './world.js';
import { mirrorImage, imageKind, principalRays } from './physics.js';

const C = themed((light) => ({
  object: COLORS.coral,
  objectRim: light ? '#8f2f12' : '#ffaa88',
  image: COLORS.teal,
  ray1: COLORS.amber,
  ray2: COLORS.purple,
  ray3: COLORS.blue,
  ray4: COLORS.pink,
  focus: COLORS.purple,
  mirror: COLORS.blue,
}));

const spanOf = (w) => (w < 600 ? 30 : 38);        // world units across the canvas
const poleAt = (w) => (w < 600 ? 0.6 : 21 / 38);   // pole position as a fraction of the width
const D_MIN = 0.5, D_MAX = 18;

export function createSpherical() {
  const view = fluidCanvas(byId('cv'), {
    height: (w) => Math.max(320, Math.round(w * 0.56)),
    onResize: () => draw(),
  });
  const { ctx } = view;
  const W = createWorld(view);

  // ---------- Controls ----------
  let lastF = 4;
  const fCtl = bindRange('fSlider', {
    format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`,
    onInput: (v) => {
      // F = 0 is not a mirror: skip over it in the direction the slider moved.
      if (v === 0) fCtl.set(lastF > 0 ? -0.5 : 0.5, { silent: true });
      lastF = fCtl.value;
      draw();
    },
  });
  const dCtl = bindRange('dSlider', { format: (v) => v.toFixed(1), onInput: draw });
  const hCtl = bindRange('hSlider', { format: (v) => v.toFixed(1), onInput: draw });

  // ---------- Readouts ----------
  const fmt = (v, n = 2) => (Math.abs(v) < 5e-3 ? 0 : v).toFixed(n).replace('-', '−');

  function updateReadouts({ d, h, F, img, kind }) {
    setText('d1Val', fmt(d));
    setText('fInvVal', fmt(1 / F, 4));
    if (img.inf) {
      setText('d2Val', '∞');
      setText('magVal', '∞');
      setText('hImgVal', '∞');
      setText('checkVal', fmt(1 / d, 4));
    } else {
      setText('d2Val', `${fmt(img.f)}${img.real ? ' (իրական)' : ' (կեղծ)'}`);
      setText('magVal', `${img.gamma > 0 ? '+' : '−'}${fmt(Math.abs(img.gamma), 3)}`);
      setText('hImgVal', fmt(img.gamma * h));
      setText('checkVal', fmt(1 / d + 1 / img.f, 4));
    }

    let info;
    switch (kind) {
      case 'atF':
        info = '<b>Պատկեր չկա (անվերջ հեռու է)</b><br>Առարկան կիզակետում է. անդրադարձած ճառագայթները զուգահեռ են (լապտերի, լուսարձակի սկզբունքը)։ Ճառագայթ 2-ը որոշված չէ։';
        break;
      case 'beyond':
        info = '<b>Իրական, շրջված, փոքրացված</b><br>Առարկան C-ից (2F) հեռու է. պատկերը F-ի և C-ի միջև է։';
        break;
      case 'atC':
        info = '<b>Իրական, շրջված, հավասար մեծության</b><br>Առարկան C-ում է. պատկերը նույնպես C-ում է (d = f = 2F, Γ = −1)։ Ճառագայթ 3-ը որոշված չէ։';
        break;
      case 'between':
        info = '<b>Իրական, շրջված, խոշորացված</b><br>Առարկան F-ի և C-ի միջև է. պատկերը C-ից հեռու է։';
        break;
      case 'inside':
        info = '<b>Կեղծ, ուղիղ, խոշորացված</b><br>Առարկան կիզակետից ներս է (d &lt; F). պատկերը հայելու հետևում է։ Այսպես է աշխատում սափրվելու կամ դիմահարդարման հայելին։';
        break;
      default:
        info = '<b>Կեղծ, ուղիղ, փոքրացված</b><br>Ուռուցիկ հայելին միշտ տալիս է հայելու հետևում գտնվող, F-ից ներս ընկած պատկեր։ Այսպես է աշխատում մեքենայի կողային հայելին՝ մեծ տեսադաշտ՝ փոքրացված պատկերով։';
    }
    setHTML('infoBox', info);
  }

  // ---------- Mirror ----------
  function drawMirror(F, yTop) {
    const R = 2 * Math.abs(F);
    const concave = F > 0;
    const cx = concave ? -R : R;                          // centre of curvature C
    const theta = Math.min(Math.asin(Math.min(1, (yTop * 0.97) / R)), 1.1);

    // Principal plane (where the rays are drawn to reflect)
    W.line(0, -yTop, 0, yTop, alpha(C.mirror, 0.3), 1, [3, 5]);

    // Hatching on the back side (away from the reflecting surface)
    const n = 2 + Math.round((2 * theta * R * W.scale) / 9);
    ctx.save();
    ctx.strokeStyle = alpha(C.mirror, 0.7);
    ctx.lineWidth = 1.2;
    for (let i = 0; i <= n; i++) {
      const phi = -theta + (2 * theta * i) / n;
      // surface point and the back-side direction u
      const x = concave ? cx + R * Math.cos(phi) : cx - R * Math.cos(phi);
      const y = R * Math.sin(phi);
      const ux = Math.cos(phi);
      const uy = concave ? Math.sin(phi) : -Math.sin(phi);
      const tx = -uy, ty = ux;
      const len = 0.9;
      ctx.beginPath();
      ctx.moveTo(W.x(x), W.y(y));
      ctx.lineTo(W.x(x + len * (ux + 0.7 * tx)), W.y(y + len * (uy + 0.7 * ty)));
      ctx.stroke();
    }
    ctx.restore();

    // The reflecting arc
    ctx.save();
    ctx.strokeStyle = C.mirror;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const a0 = concave ? -theta : Math.PI - theta;        // the arc is symmetric about the axis
    ctx.arc(W.x(cx), W.y(0), R * W.scale, a0, a0 + 2 * theta);
    ctx.stroke();
    ctx.restore();
  }

  // ---------- Main draw ----------
  function draw() {
    const { width: cw, height: ch } = view;
    if (!cw) return;
    W.scale = cw / spanOf(cw);
    W.ox = cw * poleAt(cw);
    W.oy = ch / 2;

    const d = dCtl.value, h = hCtl.value, F = fCtl.value;
    const img = mirrorImage(d, F);
    const kind = imageKind(d, F);
    const { r1, r2, r3, r4 } = principalRays(d, h, F);
    const hasImage = !img.inf && Math.abs(img.f) < 900;
    const virtual = hasImage && !img.real;
    const concave = F > 0;
    const Tx = -d, Ty = h;
    const Ix = hasImage ? -img.f : 0;
    const Iy = hasImage ? img.gamma * h : 0;
    const yTop = (W.oy - 36) / W.scale;       // keeps the caption inside the canvas
    const b = W.bounds();

    clear(ctx, cw, ch, COLORS.canvasBg);
    W.grid(COLORS.grid);

    // Axis and mirror
    W.line(b.xMin, 0, b.xMax, 0, COLORS.axis, 1);
    drawMirror(F, yTop);

    // Focus F and centre of curvature C (hollow for a convex mirror: behind it)
    const marks = [[-F, 'F', 5, C.focus], [-2 * F, 'C', 4, alpha(C.focus, 0.85)]];
    for (const [x, name, r, col] of marks) {
      if (x < b.xMin + 0.3 || x > b.xMax - 0.3) continue;
      if (concave) W.dot(x, 0, r, col);
      else {
        ctx.save();
        ctx.setLineDash([2, 2]);
        W.dot(x, 0, r, COLORS.canvasBg, col);
        ctx.restore();
      }
      // C and F labels would overlap for a very short focal length
      if (name === 'F' || Math.abs(F) * W.scale > 14) W.label(name, x, -0.95, col, 'center', 'middle', 11);
    }

    // Object
    W.arrow(Tx, 0, Tx, Ty, C.object, 2.5);
    W.dot(Tx, 0, 4.5, C.object, C.objectRim);
    W.label('S', Tx - 0.3, Ty + 0.4, C.object, 'right', 'bottom', 12);

    // ----- Rays -----
    const focus = [-F, 0];

    // 1: parallel to the axis → through F (convex: as if from F)
    W.line(Tx, Ty, 0, r1.y, C.ray1, 1.5);
    W.ray(0, r1.y, r1.dir[0], r1.dir[1], C.ray1);
    if (!concave) W.dashed(0, r1.y, focus[0], focus[1], C.ray1);
    else if (virtual) W.dashed(0, r1.y, Ix, Iy, C.ray1);

    // 2: through F → parallel to the axis (hidden when the object is at F)
    if (r2) {
      W.line(Tx, Ty, 0, r2.y, C.ray2, 1.5);
      W.ray(0, r2.y, -1, 0, C.ray2);
      if (!concave) W.dashed(0, r2.y, focus[0], focus[1], C.ray2);
      else if (kind === 'inside') W.dashed(Tx, Ty, focus[0], focus[1], C.ray2);
      if (virtual) W.dashed(0, r2.y, Ix, Iy, C.ray2);
    }

    // 3: through C → back on itself (hidden when the object is at C)
    if (r3) {
      const col = C.ray3;
      W.line(Tx, Ty, 0, r3.y, col, 1.5);
      W.ray(0, r3.y, r3.dir[0], r3.dir[1], col);
      // the reflected ray runs along the incident one: mark both directions
      const len = Math.hypot(r3.dir[0], r3.dir[1]);
      const ux = r3.dir[0] / len, uy = r3.dir[1] / len;       // from the mirror back towards T
      W.chevron(Tx * 0.6, Ty + (r3.y - Ty) * 0.4, -ux, -uy, col);
      W.chevron(Tx * 0.38, Ty + (r3.y - Ty) * 0.62, ux, uy, col);
      if (!concave) W.dashed(0, r3.y, -2 * F, 0, col);
      else if (virtual) W.dashed(0, r3.y, Ix, Iy, col);
    }

    // 4: to the pole → symmetric about the axis
    W.line(Tx, Ty, 0, 0, C.ray4, 1.5);
    W.ray(0, 0, r4.dir[0], r4.dir[1], C.ray4);
    if (virtual) W.dashed(0, 0, Ix, Iy, C.ray4);

    // Image: real = solid, virtual = dashed
    if (hasImage) {
      const off = Iy < 0 ? -0.5 : 0.5;
      if (!virtual) {
        W.arrow(Ix, 0, Ix, Iy, C.image, 2.5);
        W.dot(Ix, 0, 4.5, C.image, alpha(C.image, 0.5));
        W.label("S'", Ix + 0.25, Iy + off, C.image, 'left', 'middle', 12);
      } else {
        W.line(Ix, 0, Ix, Iy, alpha(C.image, 0.75), 2, [4, 5]);
        W.dot(Ix, 0, 4.5, alpha(C.image, 0.75));
        W.label("S'", Ix + 0.25, Iy + off, alpha(C.image, 0.95), 'left', 'middle', 12);
      }
    }

    // Distance annotations
    const annoY = -(W.oy - 44) / W.scale;
    W.line(Tx, annoY, 0, annoY, alpha(C.object, 0.45), 1, [3, 4]);
    W.label(`d=${d.toFixed(1)}`, Tx / 2, annoY + 0.2, alpha(C.object, 0.9), 'center', 'bottom', 10);
    if (hasImage && Math.abs(img.f) < 30) {
      W.line(0, annoY, Ix, annoY, alpha(C.image, 0.5), 1, [3, 4]);
      W.label(`f=${fmt(img.f, 1)}`, Ix / 2, annoY - 0.3, alpha(C.image, 0.95), 'center', 'top', 10);
    }

    // Mirror caption
    text(ctx, `F = ${F > 0 ? '+' : ''}${F.toFixed(1)}`, W.x(0), 12, { color: C.mirror, size: 11, family: 'mono', align: 'center' });
    text(ctx, concave ? 'գոգավոր հայելի' : 'ուռուցիկ հայելի', W.x(0), 26, { color: C.mirror, size: 11, align: 'center' });

    updateReadouts({ d, h, F, img, kind });
  }

  // ---------- Drag the object along the axis ----------
  function moveTo(p) {
    const x = W.fromPx(p).x;
    let d = Math.max(D_MIN, Math.min(D_MAX, -x));
    // snap to the special positions F and 2F
    const F = fCtl.value;
    const tol = 7 / W.scale;
    if (F > 0) for (const s of [F, 2 * F]) if (Math.abs(d - s) < tol && s <= D_MAX) d = s;
    dCtl.set(d.toFixed(2));
  }
  onDrag(view, {
    start: (p) => (W.fromPx(p).x > -0.2 ? false : moveTo(p)),   // not from behind the mirror
    move: moveTo,
  });

  onThemeChange(draw);
  fontsReady().then(draw);
  draw();
  return { draw };
}
