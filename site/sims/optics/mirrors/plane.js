// Tab 2 — plane mirror: the image is symmetric to the object; the eye sees it
// only if the reflection point lies on the mirror.
//
// World coordinates: the mirror is the vertical segment on x = 0, centred on y = 0,
// light and observer are on the left (x < 0), the image is behind the mirror (x > 0).

import { fluidCanvas, onDrag } from '../../../assets/js/core/canvas.js';
import { bindRange, bindCheckbox, onClick } from '../../../assets/js/core/controls.js';
import { byId, setText, setHTML } from '../../../assets/js/core/dom.js';
import { clear, text } from '../../../assets/js/core/draw.js';
import { DEG, clamp } from '../../../assets/js/core/math.js';
import { COLORS, themed, alpha, onThemeChange, fontsReady } from '../../../assets/js/core/theme.js';
import { createWorld } from './world.js';
import { planeReflection } from './physics.js';

const C = themed((light) => ({
  object: COLORS.coral,
  objectRim: light ? '#8f2f12' : '#ffaa88',
  image: COLORS.teal,
  ray1: COLORS.amber,
  ray2: COLORS.purple,
  ray3: COLORS.blue,
  alpha: COLORS.amber,
  beta: COLORS.pink,
  mirror: COLORS.blue,
  eye: COLORS.text,
}));

const span = (w) => (w < 600 ? 18 : 24);   // world units across the canvas
const X_NEAR = -1;
const START = { obj: { x: -5, y: -3 }, eye: { x: -3.2, y: 4 } };

export function createPlane() {
  const view = fluidCanvas(byId('plCv'), {
    height: (w) => Math.max(320, Math.round(w * 0.6)),
    onResize: () => draw(),
  });
  const { ctx } = view;
  const W = createWorld(view);

  // ---------- State & controls ----------
  const obj = { ...START.obj };      // foot of the object arrow
  const eye = { ...START.eye };

  const lenCtl = bindRange('mLen', { format: (v) => v.toFixed(1), onInput: draw });
  const hCtl = bindRange('pH', { format: (v) => v.toFixed(1), onInput: () => { clampAll(); draw(); } });
  const showAngles = bindCheckbox('showAngles', { onChange: draw });
  const showExt = bindCheckbox('showExt', { onChange: draw });
  onClick('resetBtn', () => {
    Object.assign(obj, START.obj);
    Object.assign(eye, START.eye);
    draw();
  });

  const halfView = () => (view.height / 2) / (view.width / span(view.width));
  const xMin = () => -span(view.width) / 2 + 1;
  function clampAll() {
    const yMax = halfView() - 1.2;
    obj.x = clamp(obj.x, xMin(), X_NEAR);
    eye.x = clamp(eye.x, xMin(), X_NEAR);
    obj.y = clamp(obj.y, -yMax, yMax - hCtl.value);
    eye.y = clamp(eye.y, -yMax, yMax);
  }

  // ---------- Drawing pieces ----------
  function drawEye(x, y) {
    const px = W.x(x), py = W.y(y);
    const col = C.eye;
    ctx.save();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = col;
    ctx.fillStyle = alpha(COLORS.canvasBg, 1);
    ctx.beginPath();                              // almond shape, looking right
    ctx.moveTo(px - 15, py);
    ctx.quadraticCurveTo(px, py - 15, px + 15, py);
    ctx.quadraticCurveTo(px, py + 15, px - 15, py);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px + 3, py, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.restore();
    text(ctx, 'Աչք', px, py - 24, { color: alpha(col, 0.85), size: 11, align: 'center' });
  }

  function drawMirror(half, zone) {
    // working zone: the part of the mirror that is actually used by the rays to the eye
    if (zone) W.line(0, zone[0], 0, zone[1], alpha(C.image, 0.55), 9);
    W.line(0, -half, 0, half, C.mirror, 3.5);
    // hatching on the back
    ctx.save();
    ctx.strokeStyle = alpha(C.mirror, 0.7);
    ctx.lineWidth = 1.2;
    const n = Math.round((2 * half * W.scale) / 9);
    for (let i = 0; i <= n; i++) {
      const y = -half + (2 * half * i) / n;
      ctx.beginPath();
      ctx.moveTo(W.x(0) + 2, W.y(y));
      ctx.lineTo(W.x(0) + 11, W.y(y) + 9);
      ctx.stroke();
    }
    ctx.restore();
    for (const y of [-half, half]) W.dot(0, y, 3, C.mirror);
  }

  /** Angle arc at (0, yr) between the normal (pointing left) and the direction to (qx, qy). */
  function angleArc(yr, qx, qy, color, radius, label) {
    const cx = W.x(0), cy = W.y(yr);
    const a = Math.atan2(W.y(qy) - cy, W.x(qx) - cx);
    let diff = a - Math.PI;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, Math.PI, Math.PI + diff, diff < 0);
    ctx.stroke();
    ctx.restore();
    const mid = Math.PI + diff / 2;
    const lr = radius + 21 + (Math.abs(diff) < 0.35 ? 8 : 0);
    const nudge = Math.abs(diff) < 0.6 ? Math.sign(Math.sin(mid) || 1) * 7 : 0;
    text(ctx, label, cx + Math.cos(mid) * lr, cy + Math.sin(mid) * lr + nudge,
      { color, size: 11, family: 'mono', weight: 600, align: 'center' });
  }

  // ---------- Main draw ----------
  function draw() {
    const { width: cw, height: ch } = view;
    if (!cw) return;
    W.scale = cw / span(cw);
    W.ox = cw / 2;
    W.oy = ch / 2;
    clampAll();

    const h = hCtl.value;
    const half = lenCtl.value / 2;
    const b = W.bounds();
    const onMirror = (y) => y >= -half - 1e-9 && y <= half + 1e-9;

    const tip = { x: obj.x, y: obj.y + h };
    const foot = { x: obj.x, y: obj.y };
    const r1 = planeReflection(tip.x, tip.y, eye.x, eye.y);
    const r2 = planeReflection(foot.x, foot.y, eye.x, eye.y);
    const see1 = onMirror(r1.yr), see2 = onMirror(r2.yr);
    const zone = (see1 || see2) ? [Math.max(-half, Math.min(r1.yr, r2.yr)), Math.min(half, Math.max(r1.yr, r2.yr))] : null;

    clear(ctx, cw, ch, COLORS.canvasBg);
    W.grid(COLORS.grid);
    drawMirror(half, zone);

    // Image (virtual, dashed) and the line object–image
    const ix = -obj.x;
    W.line(ix, obj.y, ix, obj.y + h, alpha(C.image, 0.8), 2.5, [4, 5]);
    W.dot(ix, obj.y, 4, alpha(C.image, 0.8));
    W.label("S'", ix + 0.3, obj.y + h + 0.3, alpha(C.image, 0.95), 'left', 'bottom', 12);
    W.line(obj.x, obj.y, ix, obj.y, alpha(COLORS.text3, 0.7), 1, [2, 4]);
    W.label(`a=${(-obj.x).toFixed(1)}`, obj.x / 2, obj.y - 0.2, alpha(C.object, 0.9), 'center', 'top', 10);
    W.label(`a=${(-obj.x).toFixed(1)}`, ix / 2, obj.y - 0.2, alpha(C.image, 0.95), 'center', 'top', 10);

    // Normal and angle arcs for ray 1 (from the tip)
    if (see1 && showAngles.checked) {
      W.line(-7, r1.yr, 4, r1.yr, alpha(COLORS.text2, 0.7), 1, [5, 4]);
    }

    // Rays
    const drawRay = (P, r, col, see) => {
      const Pi = r.image;                                  // image point (behind the mirror)
      if (see) {
        W.line(P.x, P.y, 0, r.yr, col, 1.7);
        W.line(0, r.yr, eye.x, eye.y, col, 1.7);
        const ux = eye.x - 0, uy = eye.y - r.yr;
        const len = Math.hypot(ux, uy);
        W.chevron(eye.x * 0.55, r.yr + uy * 0.55, ux / len, uy / len, col);
        if (showExt.checked) W.line(0, r.yr, Pi[0], Pi[1], col, 1.2, [4, 4]);
      } else {
        // The line of sight towards the image misses the mirror
        W.line(eye.x, eye.y, 0, r.yr, alpha(col, 0.35), 1, [2, 5]);
        W.line(0, r.yr, Pi[0], Pi[1], alpha(col, 0.2), 1, [2, 5]);
        const s = 0.35;
        W.line(-s, r.yr - s, s, r.yr + s, COLORS.red, 2);
        W.line(-s, r.yr + s, s, r.yr - s, COLORS.red, 2);
      }
    };
    drawRay(tip, r1, C.ray1, see1);
    drawRay(foot, r2, C.ray2, see2);

    // Ray 3: one more ray from the tip, to another point of the mirror
    {
      let yc = r1.yr + 2.6;
      if (!onMirror(yc)) yc = r1.yr - 2.6;
      if (onMirror(yc)) {
        const a = -tip.x;
        const dy = yc - tip.y;
        const col = C.ray3;
        W.line(tip.x, tip.y, 0, yc, alpha(col, 0.85), 1.4);
        { const l = Math.hypot(a, dy); W.line(0, yc, -a * 9 / l, yc + dy * 9 / l, alpha(col, 0.85), 1.4); }
        if (showExt.checked) W.line(0, yc, a, tip.y, alpha(col, 0.85), 1.1, [4, 4]);
      }
    }

    // Angle arcs (ray 1)
    if (see1 && showAngles.checked) {
      angleArc(r1.yr, tip.x, tip.y, C.alpha, 34, `α=${(r1.alpha / DEG).toFixed(0)}°`);
      angleArc(r1.yr, eye.x, eye.y, C.beta, 34, `β=${(r1.beta / DEG).toFixed(0)}°`);
      W.dot(0, r1.yr, 3.5, C.ray1);
    }

    // Object
    W.arrow(obj.x, obj.y, obj.x, obj.y + h, C.object, 2.5);
    W.dot(obj.x, obj.y, 4.5, C.object, C.objectRim);
    W.label('S', obj.x - 0.35, obj.y + h + 0.3, C.object, 'right', 'bottom', 12);

    drawEye(eye.x, eye.y);

    text(ctx, 'հարթ հայելի', W.x(0), 12, { color: C.mirror, size: 11, align: 'center' });
    void b;

    updateReadouts({ r1, r2, see1, see2 });
  }

  function updateReadouts({ r1, r2, see1, see2 }) {
    const a = -obj.x;
    setText('pDist', a.toFixed(2));
    setText('pImg', a.toFixed(2));
    setText('pSize', `${hCtl.value.toFixed(2)} = ${hCtl.value.toFixed(2)}`);
    if (see1) {
      setText('pAlpha', `${(r1.alpha / DEG).toFixed(1)}°`);
      setText('pBeta', `${(r1.beta / DEG).toFixed(1)}°`);
    } else {
      setText('pAlpha', '—');
      setText('pBeta', '—');
    }
    const state = see1 && see2 ? 'full' : see1 || see2 ? 'part' : 'none';
    setText('pSees', { full: 'Այո, ամբողջը', part: 'Միայն մասամբ', none: 'Ոչ' }[state]);
    const el = byId('pHint');
    el.className = `hint ${state === 'full' ? 'hint--ok' : 'hint--warn'}`;
    setHTML('pHint', {
      full: '<b>Աչքը տեսնում է ամբողջ պատկերը։</b> Երկու ճառագայթների անդրադարձման կետերը գտնվում են հայելու վրա։',
      part: '<b>Աչքը տեսնում է պատկերի միայն մի մասը։</b> Հայելին կարճ է. մի ճառագայթի անդրադարձման կետը (կարմիր խաչ) հայելուց դուրս է։',
      none: '<b>Աչքը պատկերը չի տեսնում։</b> Աչքից պատկերին տանող ուղիղը հայելու հարթությունը հատում է հայելուց դուրս (կարմիր խաչեր)։ Երկարացրեք հայելին կամ տեղաշարժեք աչքը։',
    }[state]);
    setHTML('infoBox2', see1
      ? `<b>Անդրադարձման օրենք՝ β = α</b><br>Վերին ճառագայթի համար α = β = ${(r1.alpha / DEG).toFixed(1)}°։ Պատկերը հայելու հետևում է՝ առարկայից նույն հեռավորությամբ, ինչ առարկան՝ հայելուց (${a.toFixed(1)})։`
      : `<b>Պատկերը հայելու հետևում է</b><br>Այն կեղծ է, ուղիղ և նույն մեծության։ Վերին ճառագայթը հայելուն չի հասնում, ուստի անկյունները չեն նշվում։`);
  }

  // ---------- Dragging: the object or the eye ----------
  let grabbed = null;
  function pick(p) {
    const q = W.fromPx(p);
    const targets = [
      ['obj', obj.x, obj.y + hCtl.value / 2],
      ['eye', eye.x, eye.y],
    ];
    let best = null, bestD = (30 / W.scale) ** 2;
    for (const [name, x, y] of targets) {
      const dist = (q.x - x) ** 2 + (q.y - y) ** 2;
      if (dist < bestD) { best = name; bestD = dist; }
    }
    return best;
  }
  function moveTo(p) {
    if (!grabbed) return;
    const q = W.fromPx(p);
    const t = grabbed === 'obj' ? obj : eye;
    t.x = q.x;
    t.y = grabbed === 'obj' ? q.y - hCtl.value / 2 : q.y;
    draw();
  }
  onDrag(view, {
    start: (p) => {
      grabbed = pick(p);
      if (!grabbed) return false;
      moveTo(p);
    },
    move: moveTo,
    end: () => { grabbed = null; },
  });

  onThemeChange(draw);
  fontsReady().then(draw);
  draw();
  return { draw };
}
