// Tab 4 — dispersion of white light in a prism (Cauchy's formula).

import { fixedCanvas } from '../../../assets/js/core/canvas.js';
import { bindRange, bindCheckbox, bindSelect } from '../../../assets/js/core/controls.js';
import { byId, setHTML } from '../../../assets/js/core/dom.js';
import { clear, line, text } from '../../../assets/js/core/draw.js';
import { DARK as COLORS, fontsReady } from '../../../assets/js/core/theme.js';
import { clamp, DEG, vec } from '../../../assets/js/core/math.js';
import { wavelengthToRGB } from '../../../assets/js/core/color.js';

const W = 880, H = 470;

// Sim-specific colors
const C = {
  prismFill: 'rgba(120,170,255,0.10)',
  prismStroke: 'rgba(160,200,255,0.85)',
  screen: '#7d8db3',
  normal: 'rgba(160,180,220,0.5)',
  white: 'rgba(255,255,255,0.95)',
};

// Cauchy coefficients: n = A + B/λ² (λ in nm, B in nm²)
const MATS = {
  crown:   { A: 1.5046, B: 4200,  name: 'Crown ապակի (~1.52)' },
  flint:   { A: 1.7533, B: 10900, name: 'Խիտ ֆլինտ ապակի (~1.8)' },
  water:   { A: 1.3241, B: 3100,  name: 'Ջուր' },
  diamond: { A: 2.3867, B: 10500, name: 'Ալմաստ' },
};

/** Refractive index with the dispersion (n − n_D) exaggerated ex times. */
function nOf(mat, wl, ex) {
  const nd = mat.A + mat.B / (589 * 589);
  const n = mat.A + mat.B / (wl * wl);
  return nd + ex * (n - nd);
}

const { add, sub, scale: scl, dot, cross, norm: nrm } = vec;

/* Refract unit dir d at a surface with unit normal n opposing d; eta = n1/n2. */
function refract(d, n, eta) {
  const c = -dot(d, n);
  const s2 = eta * eta * (1 - c * c);
  if (s2 > 1) return null; // total internal reflection
  return nrm(add(scl(d, eta), scl(n, eta * c - Math.sqrt(1 - s2))));
}
function reflect(d, n) {
  return sub(d, scl(n, 2 * dot(d, n)));
}
/* Ray (o,d) vs segment a-b: returns {t, p, u} or null. */
function raySeg(o, d, a, b) {
  const e = sub(b, a), w = sub(a, o);
  const den = cross(d, e);
  if (Math.abs(den) < 1e-9) return null;
  const t = cross(w, e) / den, u = cross(w, d) / den;
  if (t < 1e-6 || u < -1e-6 || u > 1 + 1e-6) return null;
  return { t, p: add(o, scl(d, t)), u };
}

export function createDispersion() {
  const view = fixedCanvas(byId('dsp-canvas'), W, H);
  const { ctx } = view;

  // The scene is static: redraw only when something changed.
  let dirty = true;
  const touch = () => { dirty = true; };
  const deg = (v) => v.toFixed(0) + '°';
  const mat = bindSelect('dsp-mat', { onChange: touch });
  const sApex = bindRange('dsp-apex', { format: deg, onInput: touch });
  const sInc = bindRange('dsp-inc', { format: deg, onInput: touch });
  const sEx = bindRange('dsp-ex', { format: (v) => '×' + v.toFixed(1), onInput: touch });
  const cSingle = bindCheckbox('dsp-single', { onChange: touch });
  const sWl = bindRange('dsp-wl', { format: (v) => v.toFixed(0) + ' nm', onInput: touch });
  fontsReady().then(touch);

  function render() {
    clear(ctx, W, H, COLORS.canvasBg);

    const m = MATS[mat.value];
    const A = sApex.value * DEG;
    const thI = sInc.value * DEG;
    const ex = sEx.value;
    const single = cSingle.checked;

    // prism geometry
    const baseY = 385, topY = 120, cx = 400;
    const hw = Math.tan(A / 2) * (baseY - topY);
    const T = { x: cx, y: topY }, BL = { x: cx - hw, y: baseY }, BR = { x: cx + hw, y: baseY };

    // prism
    ctx.beginPath();
    ctx.moveTo(T.x, T.y); ctx.lineTo(BL.x, BL.y); ctx.lineTo(BR.x, BR.y); ctx.closePath();
    ctx.fillStyle = C.prismFill;
    ctx.strokeStyle = C.prismStroke;
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();

    // screen
    const scrTop = { x: W - 42, y: 40 }, scrBot = { x: W - 42, y: H - 40 };
    line(ctx, scrTop.x, scrTop.y, scrBot.x, scrBot.y, { color: C.screen, width: 5 });
    const lbl = { color: COLORS.text2, size: 12, baseline: 'alphabetic' };
    text(ctx, 'էկրան', W - 70, 28, lbl);

    // entry geometry: hit the midpoint of the left face
    const M = scl(add(T, BL), 0.5);
    const fL = nrm(sub(BL, T));                          // along the left face
    const nOutL = { x: -fL.y, y: fL.x };                 // outward normal (left/up)
    const inward = scl(nOutL, -1);
    // incident direction: inward normal rotated by −θi (beam arrives from the lower left)
    const ca = Math.cos(thI), sa = -Math.sin(thI);
    const dirIn = nrm({ x: inward.x * ca - inward.y * sa, y: inward.x * sa + inward.y * ca });

    // incident white ray from the left edge to M
    const Lback = (M.x - 25) / Math.max(dirIn.x, 0.05);
    const start = sub(M, scl(dirIn, Lback));
    line(ctx, start.x, start.y, M.x, M.y, { color: C.white, width: 2.5 });
    // normal at entry (dashed)
    line(ctx, M.x - nOutL.x * 55, M.y - nOutL.y * 55, M.x + nOutL.x * 55, M.y + nOutL.y * 55,
      { color: C.normal, width: 1, dash: [5, 5] });

    const faces = [
      { a: T, b: BR, nOut: nrm({ x: BR.y - T.y, y: -(BR.x - T.x) }) }, // right face
      { a: BL, b: BR, nOut: { x: 0, y: 1 } },                          // base
    ];

    const wls = single ? [sWl.value] : Array.from({ length: 65 }, (_, i) => 380 + i * 5);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    let dev589 = null, tirCount = 0;

    for (const wl of wls) {
      const n = nOf(m, wl, ex);
      const d1 = refract(dirIn, nOutL, 1 / n);
      if (!d1) continue;
      // find the exit face
      let hit = null, face = null;
      for (const f of faces) {
        const h = raySeg(M, d1, f.a, f.b);
        if (h && (!hit || h.t < hit.t)) { hit = h; face = f; }
      }
      if (!hit) continue;
      const [r, g, b] = wavelengthToRGB(wl);
      const alpha = single ? 0.95 : 0.30;
      ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
      ctx.lineWidth = single ? 2.5 : 1.6;
      ctx.beginPath(); ctx.moveTo(M.x, M.y); ctx.lineTo(hit.p.x, hit.p.y); ctx.stroke();

      const d2 = refract(d1, scl(face.nOut, -1), n);
      if (!d2) {
        tirCount++;
        const dr = reflect(d1, face.nOut);
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(hit.p.x, hit.p.y);
        ctx.lineTo(hit.p.x + dr.x * 60, hit.p.y + dr.y * 60); ctx.stroke();
        ctx.setLineDash([]);
        continue;
      }
      // extend to the screen (or the canvas edge)
      const hScr = raySeg(hit.p, d2, scrTop, scrBot);
      const end = hScr ? hScr.p : add(hit.p, scl(d2, 900));
      ctx.beginPath(); ctx.moveTo(hit.p.x, hit.p.y); ctx.lineTo(end.x, end.y); ctx.stroke();
      if (hScr) {
        ctx.fillStyle = `rgba(${r},${g},${b},${single ? 1 : 0.6})`;
        ctx.fillRect(scrTop.x - 2, hScr.p.y - 2.5, 9, 5);
      }
      if (Math.abs(wl - 590) < 3 || single) {
        dev589 = Math.acos(clamp(dot(dirIn, d2), -1, 1)) / DEG;
      }
    }
    ctx.restore();

    // labels
    text(ctx, `A = ${(A / DEG).toFixed(0)}°`, T.x - 18, T.y - 10, lbl);
    text(ctx, `θᵢ = ${(thI / DEG).toFixed(0)}°`, M.x - 110, M.y - 14, lbl);
    // on the side of the start point away from the beam, so it doesn't cross the label
    text(ctx, 'սպիտակ լույս', start.x + 4, dirIn.y < 0 ? start.y + 16 : start.y - 8, lbl);

    // readout
    const nF = nOf(m, 486, 1), nD = nOf(m, 589, 1), nC = nOf(m, 656, 1);
    let txt = `${m.name}<br>` +
      `n(486 nm) = <b>${nF.toFixed(4)}</b><br>` +
      `n(589 nm) = <b>${nD.toFixed(4)}</b><br>` +
      `n(656 nm) = <b>${nC.toFixed(4)}</b>`;
    txt += dev589 !== null
      ? `<br>Շեղում δ ≈ <b>${dev589.toFixed(1)}°</b>`
      : '<br>Փունջը՝ <b>լրիվ ներքին անդրադարձում</b>';
    if (tirCount && dev589 !== null) txt += '<br>(որոշ λ-ների համար՝ լրիվ ներքին անդրադարձում)';
    setHTML('dsp-readout', txt);
  }

  function draw() {
    if (!dirty) return;
    dirty = false;
    render();
  }

  return { draw };
}
