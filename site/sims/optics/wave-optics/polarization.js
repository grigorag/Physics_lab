// Tab 3 — polarization: a light source and up to three polarizers (Malus's law).

import { fixedCanvas } from '../../../assets/js/core/canvas.js';
import { bindRange, bindCheckbox, bindSelect, onClick } from '../../../assets/js/core/controls.js';
import { byId, setHTML } from '../../../assets/js/core/dom.js';
import { clear, circle, text } from '../../../assets/js/core/draw.js';
import { DARK as COLORS, font } from '../../../assets/js/core/theme.js';
import { DEG, TAU } from '../../../assets/js/core/math.js';

const W = 880, H = 440;
const CY = H / 2 + 10;

// Sim-specific colors
const C = {
  diskFill: 'rgba(110,150,255,0.10)',
  diskStroke: 'rgba(140,170,255,0.8)',
  hatch: 'rgba(140,170,255,0.35)',
  axis: '#8fd0ff',
  eLine: 'rgba(255,220,130,0.9)',
  eTip: '#ffe9a8',
  source: '#ffd86b',
  sourceStroke: '#aa8030',
};

/* Project an E-vector (perpendicular to the beam) into screen coords.
   angle: 0 = vertical transmission axis. */
function proj(angRad, mag) {
  const Ey = Math.cos(angRad) * mag, Ez = Math.sin(angRad) * mag;
  return { dx: 0.55 * Ez, dy: -Ey + 0.30 * Ez };
}

export function createPolarization() {
  const view = fixedCanvas(byId('pol-canvas'), W, H);
  const { ctx } = view;

  const deg = (v) => v.toFixed(0) + '°';
  const src = bindSelect('pol-src');
  const e1 = bindCheckbox('pol-e1'), e2 = bindCheckbox('pol-e2'), e3 = bindCheckbox('pol-e3');
  const a1 = bindRange('pol-a1', { format: deg });
  const a2 = bindRange('pol-a2', { format: deg });
  const a3 = bindRange('pol-a3', { format: deg });

  onClick('pol-preset-crossed', () => {
    e1.set(true); e2.set(true); e3.set(false);
    a1.set(0); a2.set(90);
  });
  onClick('pol-preset-three', () => {
    e1.set(true); e2.set(true); e3.set(true);
    a1.set(0); a2.set(45); a3.set(90);
  });

  let tAcc = 0;
  let lastReadout = '';

  function drawPolarizer(x, angRad, label, pct) {
    ctx.save();
    ctx.translate(x, CY);
    // disk
    ctx.beginPath();
    ctx.ellipse(0, 0, 26, 92, 0, 0, TAU);
    ctx.fillStyle = C.diskFill;
    ctx.strokeStyle = C.diskStroke;
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();
    // hash lines parallel to the axis
    ctx.strokeStyle = C.hatch;
    ctx.lineWidth = 1;
    for (let kOff = -60; kOff <= 60; kOff += 20) {
      if (kOff === 0) continue;
      const off = proj(angRad + Math.PI / 2, kOff);
      const len = 80 * Math.sqrt(Math.max(0, 1 - (kOff / 92) * (kOff / 92)));
      const e = proj(angRad, len);
      ctx.beginPath();
      ctx.moveTo(off.dx - e.dx, off.dy - e.dy);
      ctx.lineTo(off.dx + e.dx, off.dy + e.dy);
      ctx.stroke();
    }
    // main transmission axis
    const e = proj(angRad, 84);
    ctx.beginPath();
    ctx.moveTo(-e.dx, -e.dy);
    ctx.lineTo(e.dx, e.dy);
    ctx.strokeStyle = C.axis;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();

    const opts = { size: 13, align: 'center', baseline: 'alphabetic' };
    text(ctx, label, x, CY + 118, { ...opts, color: COLORS.text });
    text(ctx, pct, x, CY + 136, { ...opts, color: COLORS.amber });
  }

  function drawEArrows(x0, x1, I, polRad, unpol) {
    const A0 = 46 * Math.sqrt(Math.max(I, 0));
    for (let x = x0 + 26; x < x1 - 26; x += 36) {
      let a, mag;
      if (unpol) {
        a = x * 0.9 + tAcc * 1.6;                       // direction wanders
        mag = A0 * Math.sin(tAcc * 5 + x * 2.3);
      } else {
        a = polRad;
        mag = A0 * Math.cos(tAcc * 5 - x * 0.045);
      }
      if (Math.abs(mag) < 1) continue;
      const e = proj(a, mag);
      ctx.beginPath();
      ctx.moveTo(x, CY);
      ctx.lineTo(x + e.dx, CY + e.dy);
      ctx.strokeStyle = C.eLine;
      ctx.lineWidth = 2;
      ctx.stroke();
      circle(ctx, x + e.dx, CY + e.dy, 2.4, { fill: C.eTip });
    }
  }

  function draw(dt) {
    tAcc += dt;
    clear(ctx, W, H, COLORS.canvasBg);

    const srcPolarized = src.value === 'pol';
    const filters = [];
    if (e1.checked) filters.push({ x: 300, ang: a1.value });
    if (e2.checked) filters.push({ x: 510, ang: a2.value });
    if (e3.checked) filters.push({ x: 720, ang: a3.value });

    // propagate the state through the filters
    let I = 1, pol = srcPolarized ? 0 : null;
    const segs = [];
    const stageInfo = [];
    let xPrev = 70;
    for (const f of filters) {
      segs.push({ x0: xPrev, x1: f.x, I, pol });
      if (pol === null) { I *= 0.5; pol = f.ang; }
      else { I *= Math.cos((f.ang - pol) * DEG) ** 2; pol = f.ang; }
      stageInfo.push({ ang: f.ang, I });
      xPrev = f.x;
    }
    segs.push({ x0: xPrev, x1: W - 30, I, pol });

    // beam glow + core
    for (const s of segs) {
      if (s.I < 1e-4) continue;
      ctx.strokeStyle = `rgba(255,225,150,${0.10 + 0.30 * s.I})`;
      ctx.lineWidth = 4 + 12 * Math.sqrt(s.I);
      ctx.beginPath(); ctx.moveTo(s.x0, CY); ctx.lineTo(s.x1, CY); ctx.stroke();
      ctx.strokeStyle = `rgba(255,240,200,${0.35 + 0.6 * s.I})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(s.x0, CY); ctx.lineTo(s.x1, CY); ctx.stroke();
    }
    // E-field arrows
    for (const s of segs) {
      if (s.I < 1e-3) continue;
      drawEArrows(s.x0, s.x1, s.I, (s.pol || 0) * DEG, s.pol === null);
    }

    // source
    circle(ctx, 58, CY, 14, { fill: C.source, stroke: C.sourceStroke, width: 1 });
    const lbl = { color: COLORS.text, size: 13, align: 'center', baseline: 'alphabetic' };
    text(ctx, srcPolarized ? 'լազեր (0°)' : 'լամպ', 58, CY + 118, lbl);
    text(ctx, 'I₀ = 100%', 58, CY + 136, lbl);

    // polarizers
    filters.forEach((f, i) => {
      drawPolarizer(f.x, f.ang * DEG, `P${i + 1}  ${f.ang.toFixed(0)}°`,
        (stageInfo[i].I * 100).toFixed(1) + '%');
    });

    // detector
    const If = segs[segs.length - 1].I;
    ctx.fillStyle = COLORS.surface2;
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1;
    ctx.fillRect(W - 26, CY - 95, 18, 190);
    ctx.strokeRect(W - 26, CY - 95, 18, 190);
    const bh = 186 * If;
    ctx.fillStyle = COLORS.amber;
    ctx.fillRect(W - 24, CY + 93 - bh, 14, bh);
    // centred over the bar, but kept inside the canvas (e.g. "100.0%")
    const pctTxt = (If * 100).toFixed(1) + '%';
    ctx.font = font(14, { weight: 700 });
    const pctX = Math.min(W - 17, W - 4 - ctx.measureText(pctTxt).width / 2);
    text(ctx, pctTxt, pctX, CY - 104, {
      color: C.eTip, size: 14, weight: 700, align: 'center', baseline: 'alphabetic',
    });

    // sidebar readout
    let txt = srcPolarized
      ? 'Աղբյուրը: բևեռացված 0° — I₀'
      : 'Աղբյուրը: չբևեռացված — I₀';
    stageInfo.forEach((st, i) => {
      txt += `<br>P${i + 1}-ից (${st.ang.toFixed(0)}°) հետո՝ <b>${(st.I * 100).toFixed(1)}%</b>`;
    });
    txt += `<br>Ընդունիչ՝ <b>${(If * 100).toFixed(1)}% I₀-ից</b>`;
    if (txt !== lastReadout) { setHTML('pol-readout', txt); lastReadout = txt; }
  }

  return { draw };
}
