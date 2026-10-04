// Experiment 1 — reflection and refraction at a flat boundary of two media.
//
// The point of incidence O is the canvas centre, the boundary is horizontal.
// Directions are unit vectors pointing away from O; angles are measured from
// the normal (the vertical through O). The light source can sit in either
// medium: "medium 1" is always the one the light comes from.

import { fluidCanvas, onDrag } from '../../../assets/js/core/canvas.js';
import { bindRange, bindSelect, bindCheckbox, onClick } from '../../../assets/js/core/controls.js';
import { byId, setText, setHTML } from '../../../assets/js/core/dom.js';
import { clear, line, text, roundRect } from '../../../assets/js/core/draw.js';
import { COLORS, onThemeChange, fontsReady } from '../../../assets/js/core/theme.js';
import { DEG, TAU, clamp } from '../../../assets/js/core/math.js';
import { MEDIA, C_LIGHT, refract } from './optics.js';
import { C, mediumTint, drawRay, pill, angleArc } from './rays.js';

const MAX_ANGLE = 89;
const deg = (rad) => `${(rad / DEG).toFixed(1)}°`;
const pct = (f) => `${(f * 100).toFixed(1)} %`;
const speed = (n) => `${(C_LIGHT / n / 1e8).toFixed(2)}·10⁸ մ/վ`;

export function createInterface() {
  const view = fluidCanvas(byId('cv'), {
    height: (w) => clamp(Math.round(w * 0.62), 380, 560),
    onResize: () => draw(),
  });
  const { ctx } = view;

  // ---------- State ----------
  const state = {
    below: false,   // the source is in the lower medium
    side: -1,       // −1: source left of the normal, +1: right
  };

  // ---------- Controls ----------
  const angle = bindRange('angle', { format: (v) => `${v.toFixed(1)}°`, onInput: draw });

  /** A medium = preset select + a custom-n slider that appears for «Այլ». */
  function bindMedium(selId, nId) {
    const nCtl = bindRange(nId, { format: (v) => v.toFixed(2), onInput: draw });
    const field = nCtl.input.closest('.field');
    const sel = bindSelect(selId, {
      onChange: (v) => {
        // The custom slider starts from the preset that was showing.
        if (v !== 'custom') nCtl.set(MEDIA[v].n, { silent: true });
        field.hidden = v !== 'custom';
        draw();
      },
    });
    if (sel.value !== 'custom') nCtl.set(MEDIA[sel.value].n, { silent: true });
    field.hidden = sel.value !== 'custom';
    return {
      get n() { return sel.value === 'custom' ? nCtl.value : MEDIA[sel.value].n; },
      get name() { return sel.value === 'custom' ? null : MEDIA[sel.value].name; },
    };
  }
  const top = bindMedium('topMedium', 'topN');
  const bottom = bindMedium('bottomMedium', 'bottomN');

  const showAngles = bindCheckbox('showAngles', { onChange: draw });
  const showProtractor = bindCheckbox('showProtractor', { onChange: draw });
  const showFresnel = bindCheckbox('showFresnel', { onChange: draw });
  onClick('swapBtn', () => { state.below = !state.below; draw(); });

  // ---------- Physics ----------
  function solve() {
    const m1 = state.below ? bottom : top;
    const m2 = state.below ? top : bottom;
    const a = angle.value * DEG;
    return { a, n1: m1.n, n2: m2.n, name1: m1.name, name2: m2.name, ...refract(m1.n, m2.n, a) };
  }

  function updateReadouts(s) {
    const withName = (n, name) => (name ? `${n.toFixed(2)} (${name.toLowerCase()})` : n.toFixed(2));
    setText('n1Val', withName(s.n1, s.name1));
    setText('n2Val', withName(s.n2, s.name2));
    setText('alphaVal', deg(s.a));
    setText('betaVal', deg(s.a));
    setText('gammaVal', s.tir ? 'լրիվ ներքին անդրադարձում' : deg(s.gamma));
    setText('critVal', s.critical === null ? '—' : deg(s.critical));
    setText('v1Val', speed(s.n1));
    setText('v2Val', speed(s.n2));
    setText('rVal', pct(s.R));
    setText('tVal', pct(s.T));

    let info;
    if (s.tir) {
      info = `<b>Լրիվ ներքին անդրադարձում</b><br>Անկման անկյունը մեծ է սահմանային անկյունից (α &gt; α₀ = ${deg(s.critical)})։ Բեկված ճառագայթ չկա. ամբողջ լույսն անդրադառնում է։`;
    } else if (Math.abs(s.n1 - s.n2) < 1e-9) {
      info = '<b>Բեկման ցուցիչները հավասար են (n₁ = n₂)</b><br>Լույսի համար սահման չկա. ճառագայթը չի բեկվում և չի անդրադառնում։';
    } else if (s.a < 1e-9) {
      info = '<b>Ուղղահայաց անկում (α = 0)</b><br>Ճառագայթն անցնում է երկրորդ միջավայր՝ առանց ուղղությունը փոխելու (γ = 0), իսկ լույսի մի փոքր մասն անդրադառնում է հետ։';
    } else if (s.n1 < s.n2) {
      info = '<b>Նոսր միջավայրից՝ խիտ (n₁ &lt; n₂)</b><br>Լույսն անցնում է օպտիկապես ավելի խիտ միջավայր. բեկված ճառագայթը մոտենում է ուղղահայացին (γ &lt; α)։';
    } else {
      info = `<b>Խիտ միջավայրից՝ նոսր (n₁ &gt; n₂)</b><br>Լույսն անցնում է օպտիկապես ավելի նոսր միջավայր. բեկված ճառագայթը հեռանում է ուղղահայացից (γ &gt; α)։ Լրիվ ներքին անդրադարձումը կսկսվի, երբ α &gt; α₀ = ${deg(s.critical)}։`;
    }
    setHTML('infoBox', info);
  }

  // ---------- Drawing ----------
  function drawProtractor(ox, oy, r) {
    const fine = r >= 190;
    const size = fine ? 10 : 9;
    ctx.save();
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(ox, oy, r, 0, TAU);
    ctx.stroke();
    for (let d = 0; d < 360; d += fine ? 5 : 10) {
      const major = d % 10 === 0;
      const len = d % 30 === 0 ? 11 : major ? 8 : 4;
      const sx = Math.sin(d * DEG), cy = -Math.cos(d * DEG);
      ctx.beginPath();
      ctx.moveTo(ox + sx * r, oy + cy * r);
      ctx.lineTo(ox + sx * (r - len), oy + cy * (r - len));
      ctx.stroke();
      // The scale reads the angle from the normal: 0 at the top and bottom, 90 at the boundary.
      const fromNormal = d <= 90 ? d : d <= 180 ? 180 - d : d <= 270 ? d - 180 : 360 - d;
      if (fromNormal === 90 || fromNormal === 0) continue;
      if (fine ? major : d % 30 === 0) {
        text(ctx, String(fromNormal), ox + sx * (r - 21), oy + cy * (r - 21), {
          color: COLORS.text3, size, family: 'mono', align: 'center',
        });
      }
    }
    ctx.restore();
    for (const sx of [-1, 1]) {
      text(ctx, '90', ox + sx * (r - 22), oy - 10, { color: COLORS.text3, size, family: 'mono', align: 'center' });
    }
  }

  /** Laser pointer at (x, y) aimed along the unit vector (ux, uy). */
  function drawLaser(x, y, ux, uy) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(uy, ux));
    ctx.fillStyle = C.laser;
    ctx.strokeStyle = C.laserRim;
    ctx.lineWidth = 1;
    roundRect(ctx, -30, -8, 27, 16, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = C.ray;
    roundRect(ctx, -4, -4.5, 5, 9, 2);
    ctx.fill();
    ctx.restore();
  }

  function draw() {
    const { width: W, height: H } = view;
    if (!W) return;
    const s = solve();
    const ox = W / 2, oy = H / 2;
    const R = Math.min(W / 2 - 10, H / 2 - 10);     // outer radius: the laser body ends here
    const Rp = R - 32;                              // protractor radius = length of the incident ray
    const vy = state.below ? 1 : -1;                // vertical side of the incident medium
    const sd = state.side;

    clear(ctx, W, H, COLORS.canvasBg);

    // Media
    ctx.fillStyle = mediumTint(top.n);
    ctx.fillRect(0, 0, W, oy);
    ctx.fillStyle = mediumTint(bottom.n);
    ctx.fillRect(0, oy, W, H - oy);
    line(ctx, 0, oy, W, oy, { color: COLORS.axis, width: 1.5 });

    const mediumLabel = (m, y, idx) => {
      text(ctx, m.name ?? 'Այլ միջավայր', 12, y - 8, { color: COLORS.text2, size: 12, weight: 600 });
      text(ctx, `n${idx} = ${m.n.toFixed(2)}`, 12, y + 8, { color: COLORS.text3, size: 11, family: 'mono' });
    };
    mediumLabel(top, 24, state.below ? '₂' : '₁');
    mediumLabel(bottom, H - 24, state.below ? '₁' : '₂');

    if (showProtractor.checked) drawProtractor(ox, oy, Rp);

    // Normal
    if (showAngles.checked || showProtractor.checked) {
      line(ctx, ox, oy - Rp - 4, ox, oy + Rp + 4, { color: COLORS.text3, width: 1, dash: [6, 5] });
    }

    // Directions (unit vectors from O)
    const sa = Math.sin(s.a), ca = Math.cos(s.a);
    const uInc = { x: sd * sa, y: vy * ca };
    const uRef = { x: -sd * sa, y: vy * ca };
    const uTr = s.tir ? null : { x: -sd * Math.sin(s.gamma), y: -vy * Math.cos(s.gamma) };
    const rayLen = Rp + 22;
    const fresnel = showFresnel.checked;
    const hasReflection = s.R > 1e-9;

    // Angle arcs (under the rays)
    if (showAngles.checked) {
      const ra = clamp(Rp * 0.3, 34, 70);
      const nInc = { x: 0, y: vy }, nTr = { x: 0, y: -vy };
      angleArc(ctx, ox, oy, nInc, uInc, ra, C.incident, `α = ${deg(s.a)}`, { towards: { x: sd, y: 0 }, maxRadius: Rp * 0.62 });
      if (hasReflection) {
        angleArc(ctx, ox, oy, nInc, uRef, ra, C.reflected, `β = ${deg(s.a)}`, { towards: { x: -sd, y: 0 }, maxRadius: Rp * 0.62 });
      }
      if (uTr) angleArc(ctx, ox, oy, nTr, uTr, ra, C.refracted, `γ = ${deg(s.gamma)}`, { towards: { x: -sd, y: 0 }, maxRadius: Rp * 0.62 });
    }

    // Rays
    const src = { x: ox + uInc.x * Rp, y: oy + uInc.y * Rp };
    drawRay(ctx, src.x, src.y, ox, oy);
    if (hasReflection) {
      drawRay(ctx, ox, oy, ox + uRef.x * rayLen, oy + uRef.y * rayLen, { intensity: fresnel ? s.R : 1 });
    }
    if (uTr) {
      drawRay(ctx, ox, oy, ox + uTr.x * rayLen, oy + uTr.y * rayLen, { intensity: fresnel ? s.T : 1 });
    } else {
      text(ctx, 'բեկված ճառագայթ չկա', ox, oy - vy * Rp * 0.5, { color: COLORS.text3, size: 12, align: 'center' });
    }
    drawLaser(src.x, src.y, -uInc.x, -uInc.y);

    // Energy fractions near the far ends of the rays, on their outer side
    // (away from the normal), kept clear of the boundary line.
    if (fresnel) {
      const tag = (u, str) => {
        const r = Rp * 0.86;
        const out = Math.sign(u.x) || -sd;
        const vs = u.y < 0 ? -1 : 1;
        // Offset perpendicular to the ray, pointing away from the normal.
        const px = ox + u.x * r + out * Math.abs(u.y) * 46;
        let py = oy + u.y * r - vs * Math.abs(u.x) * 16;
        if ((py - oy) * vs < 14) py = oy + vs * 14;
        pill(ctx, str, clamp(px, 44, W - 44), py, { color: COLORS.text2, size: 11, weight: 500 });
      };
      if (hasReflection) tag(uRef, `R = ${pct(s.R)}`);
      if (uTr && s.T > 5e-4) tag(uTr, `T = ${pct(s.T)}`);
    }

    // Point of incidence
    ctx.beginPath();
    ctx.arc(ox, oy, 3, 0, TAU);
    ctx.fillStyle = COLORS.text;
    ctx.fill();

    updateReadouts(s);
  }

  // ---------- Drag the source around the point of incidence ----------
  function dragTo(p) {
    const dx = p.x - view.width / 2;
    const dy = p.y - view.height / 2;
    if (Math.hypot(dx, dy) < 12) return;
    state.below = dy > 0;
    if (Math.abs(dx) > 2) state.side = dx < 0 ? -1 : 1;
    const a = Math.atan2(Math.abs(dx), Math.abs(dy)) / DEG;
    angle.set(clamp(a, 0, MAX_ANGLE).toFixed(1));
  }
  onDrag(view, { start: dragTo, move: dragTo });

  onThemeChange(draw);
  fontsReady().then(draw);
  draw();

  return { draw };
}
