// Experiment 2 — a ray through a plane-parallel plate in air.
//
// The ray enters the upper face at A, leaves the lower face at B and comes
// out parallel to its original direction, shifted sideways by
// x = d·sin(α − γ)/cos γ. Lengths are in millimetres, `scale` px per mm.

import { fluidCanvas, onDrag } from '../../../assets/js/core/canvas.js';
import { bindRange } from '../../../assets/js/core/controls.js';
import { byId, setText, setHTML } from '../../../assets/js/core/dom.js';
import { clear, line, text } from '../../../assets/js/core/draw.js';
import { COLORS, onThemeChange, fontsReady } from '../../../assets/js/core/theme.js';
import { DEG, TAU, clamp } from '../../../assets/js/core/math.js';
import { plateShift } from './optics.js';
import { C, mediumTint, drawRay, pill, angleArc } from './rays.js';

const MAX_ANGLE = 85;
const MAX_D = 60;       // mm, upper limit of the thickness slider
const deg = (rad) => `${(rad / DEG).toFixed(1)}°`;

export function createPlate() {
  const view = fluidCanvas(byId('plateCv'), {
    height: (w) => clamp(Math.round(w * 0.62), 380, 560),
    onResize: () => draw(),
  });
  const { ctx } = view;

  const angle = bindRange('plateAngle', { format: (v) => `${v.toFixed(1)}°`, onInput: draw });
  const thick = bindRange('plateD', { format: (v) => `${v} մմ`, onInput: draw });
  const index = bindRange('plateN', { format: (v) => v.toFixed(2), onInput: draw });

  // Geometry of the last draw (for dragging).
  let A = { x: 0, y: 0 };

  function draw() {
    const { width: W, height: H } = view;
    if (!W) return;
    const a = angle.value * DEG;
    const d = thick.value;
    const n = index.value;
    const { gamma, shift, path } = plateShift(d, n, a);

    const scale = (H * 0.46) / MAX_D;
    const t = d * scale;
    const yTop = H * 0.5 - t / 2, yBot = yTop + t;
    A = { x: W * 0.4, y: yTop };
    const B = { x: A.x + t * Math.tan(gamma), y: yBot };
    const u = { x: Math.sin(a), y: Math.cos(a) };   // direction of the incident / emerging ray
    const pad = 14;

    /** Distance from p along the direction v to the canvas edge (minus padding). */
    const reach = (p, v) => Math.min(
      v.x > 1e-9 ? (W - pad - p.x) / v.x : v.x < -1e-9 ? (pad - p.x) / v.x : Infinity,
      v.y > 1e-9 ? (H - pad - p.y) / v.y : v.y < -1e-9 ? (pad - p.y) / v.y : Infinity,
    );

    clear(ctx, W, H, COLORS.canvasBg);

    // Plate
    ctx.fillStyle = mediumTint(n);
    ctx.fillRect(0, yTop, W, t);
    line(ctx, 0, yTop, W, yTop, { color: COLORS.axis, width: 1.5 });
    line(ctx, 0, yBot, W, yBot, { color: COLORS.axis, width: 1.5 });
    text(ctx, 'Օդ', 12, 18, { color: COLORS.text2, size: 12, weight: 600 });
    text(ctx, 'Օդ', 12, H - 18, { color: COLORS.text2, size: 12, weight: 600 });
    if (t >= 30) {
      text(ctx, 'Թիթեղ', 12, yTop + t / 2 - 8, { color: COLORS.text2, size: 12, weight: 600 });
      text(ctx, `n = ${n.toFixed(2)}`, 12, yTop + t / 2 + 8, { color: COLORS.text3, size: 11, family: 'mono' });
    } else {
      text(ctx, `Թիթեղ · n = ${n.toFixed(2)}`, 12, yTop - 12, { color: COLORS.text2, size: 11 });
    }

    // Thickness marker at the right edge
    {
      const x = W - 22;
      line(ctx, x, yTop, x, yBot, { color: COLORS.text3, width: 1 });
      line(ctx, x - 4, yTop + 0.5, x + 4, yTop + 0.5, { color: COLORS.text3, width: 1 });
      line(ctx, x - 4, yBot - 0.5, x + 4, yBot - 0.5, { color: COLORS.text3, width: 1 });
      text(ctx, 'd', x - 8, yTop + t / 2, { color: COLORS.text2, size: 12, family: 'mono', style: 'italic', align: 'right' });
    }

    // Normals at A and B
    const nl = clamp(H * 0.2, 60, 110);
    line(ctx, A.x, A.y - nl, A.x, yBot, { color: COLORS.text3, width: 1, dash: [6, 5] });
    line(ctx, B.x, yTop, B.x, B.y + nl, { color: COLORS.text3, width: 1, dash: [6, 5] });

    // Angles
    const ra = clamp(H * 0.1, 34, 52);
    const up = { x: 0, y: -1 }, down = { x: 0, y: 1 };
    const right = { x: 1, y: 0 }, left = { x: -1, y: 0 };
    angleArc(ctx, A.x, A.y, up, { x: -u.x, y: -u.y }, ra, C.incident, `α = ${deg(a)}`, { towards: left, clampX: [0, W] });
    angleArc(ctx, B.x, B.y, down, u, ra, C.incident, `α = ${deg(a)}`, { towards: right, opposite: true, clampX: [0, W] });
    const rg = Math.min(ra, t * 0.7);
    if (t >= 44) {
      angleArc(ctx, A.x, A.y, down, { x: Math.sin(gamma), y: Math.cos(gamma) }, rg, C.refracted, `γ = ${deg(gamma)}`, { towards: right, opposite: true });
    }

    // The path the ray would follow without the plate
    const F = { x: A.x + u.x * path * scale * Math.cos(a - gamma), y: A.y + u.y * path * scale * Math.cos(a - gamma) };
    const lineEnd = reach(A, u);
    line(ctx, A.x, A.y, A.x + u.x * lineEnd, A.y + u.y * lineEnd, { color: COLORS.text3, width: 1.2, dash: [3, 5] });

    // Rays: incident, inside the plate, emerging
    const lin = Math.min(reach(A, { x: -u.x, y: -u.y }), H);
    const S = { x: A.x - u.x * lin, y: A.y - u.y * lin };
    drawRay(ctx, S.x, S.y, A.x, A.y);
    drawRay(ctx, A.x, A.y, B.x, B.y, { arrowAt: t > 60 ? 0.5 : null });
    const lout = reach(B, u);
    if (lout > 0) drawRay(ctx, B.x, B.y, B.x + u.x * lout, B.y + u.y * lout, { arrowAt: 0.5 });

    // Lateral shift: the perpendicular from the emerging ray to the original line,
    // drawn a little below B so it does not sit on the plate's face.
    const shiftPx = shift * scale;
    if (shiftPx > 0.5) {
      const k = Math.min(clamp(H * 0.16, 50, 90), Math.max(0, lout - 12), Math.max(0, lineEnd - Math.hypot(F.x - A.x, F.y - A.y) - 12));
      const P = { x: B.x + u.x * k, y: B.y + u.y * k };       // on the emerging ray
      const Q = { x: F.x + u.x * k, y: F.y + u.y * k };       // on the original line
      line(ctx, P.x, P.y, Q.x, Q.y, { color: C.reflected, width: 2 });
      for (const p of [P, Q]) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.5, 0, TAU);
        ctx.fillStyle = C.reflected;
        ctx.fill();
      }
      // Label beyond Q, on the far side from the emerging ray.
      const px = clamp(Q.x + u.y * 12 + 34, 50, W - 50);
      const py = clamp(Q.y - u.x * 12 - 2, 16, H - 14);
      pill(ctx, `x = ${shift.toFixed(1)} մմ`, px, py, { color: C.reflected, size: 12 });
    }

    // Points of incidence
    for (const p of [A, B]) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, TAU);
      ctx.fillStyle = COLORS.text;
      ctx.fill();
    }

    // Readouts
    setText('plAlpha', deg(a));
    setText('plGamma', deg(gamma));
    setText('plPath', `${path.toFixed(1)} մմ`);
    setText('plShift', `${shift.toFixed(1)} մմ`);
    let info;
    if (a < 1e-9) {
      info = '<b>Ուղղահայաց անկում</b><br>Ճառագայթն անցնում է թիթեղի միջով առանց բեկվելու և առանց տեղաշարժի (x = 0)։';
    } else if (n - 1 < 1e-9) {
      info = '<b>n = 1</b><br>Թիթեղի բեկման ցուցիչը նույնն է, ինչ օդինը. ճառագայթը չի բեկվում, տեղաշարժ չկա։';
    } else {
      info = `<b>Դուրս եկող ճառագայթը զուգահեռ է ընկնողին</b><br>Թիթեղը չի փոխում ճառագայթի ուղղությունը, միայն տեղաշարժում է այն x = ${shift.toFixed(1)} մմ-ով։`;
    }
    setHTML('plateInfo', info);
  }

  // ---------- Drag above the plate to turn the incident ray ----------
  function dragTo(p) {
    const dy = A.y - p.y;
    if (dy < 4) return false;
    const a = Math.atan2(Math.max(0, A.x - p.x), dy) / DEG;
    angle.set(clamp(a, 0, MAX_ANGLE).toFixed(1));
  }
  onDrag(view, { start: dragTo, move: dragTo });

  onThemeChange(draw);
  fontsReady().then(draw);
  draw();

  return { draw };
}
