// Tab 1 — weighing a body on a spring dynamometer in a liquid.
// The body hangs from the dynamometer above an overflow can that is full to
// the spout. The student lowers it (drag, or the depth slider): the liquid
// the body pushes out runs into the beaker, and the reading drops by exactly
// the weight of that liquid.

import { fluidCanvas, onDrag } from '../../../assets/js/core/canvas.js';
import { bindRange, bindSelect, bindCheckbox, onClick } from '../../../assets/js/core/controls.js';
import { byId, setText, setHTML } from '../../../assets/js/core/dom.js';
import { clear, line, text, roundRect } from '../../../assets/js/core/draw.js';
import { COLORS, alpha, onThemeChange } from '../../../assets/js/core/theme.js';
import { clamp } from '../../../assets/js/core/math.js';
import {
  G, WEIGH_MATERIALS, WEIGH_LIQUIDS, blockDims, weighing, submergedFraction, dynamometerRange,
} from './physics.js';
import {
  C, fmt, fmtN, liquidColor, bodyFill, drawBlock, pill, symbolPill, haloArrow,
} from './shared.js';

// Geometry of the set-up, in centimetres (drawn at `sc` pixels per cm).
const CAN_W = 12;            // inner width of the overflow can
const CAN_H = 13.5;          // inner height
const LEVEL = 12;            // liquid level above the can floor (= spout)
const BEAKER_W = 10;         // inner width of the beaker
const BEAKER_H = 7;
const BEAKER_AREA = 100;     // cm² (so 1 cm of height = 100 cm³)
const Z_MIN = -0.5;          // lowest-up position of the body bottom, cm above the surface
const H_MAX = blockDims(500e-6).h * 100;   // tallest block, cm

// Dynamometer, in pixels.
const HOUSE_W = 52, HOUSE_H = 96, SPAN = 62, THREAD = 14;

export function createWeigh() {
  const view = fluidCanvas(byId('wScene'), {
    height: (w) => Math.round(228 + 21.7 * scaleFor(w)),
    onResize: () => draw(),
  });
  const { ctx } = view;

  function scaleFor(w) { return clamp((w - 70) / 23.5, 10, 18); }

  // ---------- State ----------
  const S = { mat: WEIGH_MATERIALS[0], liq: WEIGH_LIQUIDS[0], V: 200, z: 3, dragging: false };
  let grabOffset = 0;
  let prevVsub = 0;
  let flow = 0;                 // seconds left of the visible stream
  let phase = 0;

  // ---------- Controls ----------
  const matSel = bindSelect('wMat', { onChange: (v) => { S.mat = WEIGH_MATERIALS.find((m) => m.id === v); update(); } });
  const liqSel = bindSelect('wLiq', { onChange: (v) => { S.liq = WEIGH_LIQUIDS.find((l) => l.id === v); update(); } });
  fill(matSel.input, WEIGH_MATERIALS);
  fill(liqSel.input, WEIGH_LIQUIDS);
  matSel.input.value = S.mat.id;
  liqSel.input.value = S.liq.id;

  function fill(select, items) {
    select.innerHTML = items.map((m) => `<option value="${m.id}">${m.name} · ${m.rho} կգ/մ³</option>`).join('');
  }

  bindRange('wVol', {
    format: (v) => `${v.toFixed(0)} սմ³`,
    onInput: (v) => { S.V = v; update(); },
  });
  const depth = bindRange('wDepth', {
    format: depthText,
    onInput: (v) => { S.z = v; update(); },
  });
  const showVec = bindCheckbox('wVec');
  onClick('wUp', () => setZ(Z_MIN));
  onClick('wHalf', () => setZ(dims().h * 100 / 2));
  onClick('wFull', () => setZ(dims().h * 100 + 1));

  function depthText(z) {
    return z <= 0 ? `${(-z).toFixed(1)} սմ մակերևույթից վերև` : `${z.toFixed(1)} սմ`;
  }

  function setZ(z) {
    S.z = clamp(z, Z_MIN, LEVEL);
    depth.set(S.z.toFixed(2), { silent: true });
    depth.render();
    update();
  }

  // ---------- Model ----------
  const dims = () => blockDims(S.V * 1e-6);              // metres
  function model() {
    const { h } = dims();
    const frac = submergedFraction(S.z, h * 100);
    return { frac, ...weighing(S.mat.rho, S.V * 1e-6, S.liq.rho, frac), h };
  }

  function update() {
    const m = model();
    if (m.Vsub > prevVsub + 1e-9) flow = 0.55;
    prevVsub = m.Vsub;
    updateStats(m);
  }

  function updateStats(m) {
    setText('wP', fmtN(m.P));
    setText('wPp', fmtN(m.Pp));
    setText('wFa', fmtN(m.P - m.Pp));
    setText('wVs', `${fmt(m.Vsub * 1e6, 0)} սմ³ (${fmt(m.frac * 100, 0)} %)`);
    setText('wPd', fmtN(m.Pd));
    let note;
    if (m.frac <= 0) {
      note = 'Մարմինը դեռ օդում է. ուժաչափը ցույց է տալիս նրա կշիռը՝ <b>P</b>։ Իջեցրեք մարմինը հեղուկի մեջ։';
    } else if (m.frac < 1) {
      note = `Ընկղմված է մարմնի ծավալի ${fmt(m.frac * 100, 0)} %-ը. նրա դուրս մղած հեղուկը հոսել է բաժակի մեջ։ `
        + `<b>F<sub>Ա</sub> = P − P′ = ${fmt(m.P, 2)} − ${fmt(m.Pp, 2)} = ${fmt(m.Fa, 2)} Ն</b>՝ հավասար է արտամղված հեղուկի կշռին։`;
    } else {
      note = `Մարմինն ամբողջովին ընկղմված է. արտամղված ծավալը հավասար է մարմնի ծավալին, ուստի <b>F<sub>Ա</sub> = ${fmt(m.Fa, 2)} Ն</b> և ցուցմունքը `
        + 'այլևս չի փոխվում՝ որքան էլ խորը իջեցնեք։';
    }
    setHTML('wNote', note);
  }

  // ---------- Geometry ----------
  function geometry() {
    const { width: W, height: H } = view;
    const sc = scaleFor(W);
    const { a, h } = dims();
    const bw = a * 100 * sc, bh = h * 100 * sc;

    // horizontal layout: stand | can | spout | beaker, centred
    const standW = 34;
    const canW = CAN_W * sc;
    const spoutW = 2.4 * sc;
    const beakerStart = canW + spoutW - 1.5 * sc;            // relative to can inner-left
    const contentW = standW + canW + spoutW + (BEAKER_W - 1.5) * sc + 6;
    const ox = Math.max(8, (W - contentW) / 2);
    const canL = ox + standW;
    const canR = canL + canW;
    const bkL = canL + beakerStart;

    const tableY = H - 30;
    const floorY = tableY - 0.4 * sc;
    const waterY = floorY - LEVEL * sc;
    const rimY = floorY - CAN_H * sc;
    const cx = canL + canW / 2;

    const bottom = waterY + S.z * sc;
    const top = bottom - bh;
    const m = model();
    const range = dynamometerRange(m.P);
    const frac = m.Pp / range;
    // the dynamometer follows the body; once it would reach the can, the thread is let out
    let hBottom = top - THREAD - 6 - frac * SPAN;
    const thread = hBottom > rimY - 4 ? THREAD + (hBottom - (rimY - 4)) : THREAD;
    hBottom = Math.min(hBottom, rimY - 4);
    const hTop = hBottom - HOUSE_H;
    return {
      W, H, sc, a, h, bw, bh, canL, canR, bkL, tableY, floorY, waterY, rimY, cx,
      bottom, top, m, range, frac, hBottom, hTop, thread, standX: ox + 14,
    };
  }

  // ---------- Drawing ----------
  function drawStandAndDynamometer(g) {
    const { cx, hTop, hBottom, top, standX, tableY, m, range, frac } = g;
    // stand
    ctx.fillStyle = C.metal;
    roundRect(ctx, standX - 17, tableY - 4, 34, 6, 2);
    ctx.fill();
    line(ctx, standX, tableY - 4, standX, 6, { color: C.metal, width: 4, cap: 'round' });
    line(ctx, standX, hTop - 3, cx, hTop - 3, { color: C.metal, width: 4, cap: 'round' });
    // clamp
    ctx.fillStyle = C.metal;
    roundRect(ctx, standX - 6, hTop - 9, 12, 12, 2);
    ctx.fill();
    line(ctx, cx, hTop - 3, cx, hTop, { color: C.metal, width: 3 });

    // housing
    const x0 = cx - HOUSE_W / 2;
    ctx.fillStyle = COLORS.surface2;
    ctx.strokeStyle = C.rim;
    ctx.lineWidth = 1.5;
    roundRect(ctx, x0, hTop, HOUSE_W, HOUSE_H, 5);
    ctx.fill();
    ctx.stroke();

    // scale: 0 … range, ten divisions
    const y0 = hTop + 12;
    for (let i = 0; i <= 10; i++) {
      const y = y0 + (i / 10) * SPAN;
      line(ctx, x0 + 6, y, x0 + (i % 5 === 0 ? 19 : 14), y, { color: COLORS.text2, width: 1 });
    }
    const lab = { color: COLORS.text2, size: 10, family: 'mono', align: 'left' };
    text(ctx, '0', x0 + 33, y0, lab);
    text(ctx, fmt(range / 2, range < 10 ? 1 : 0), x0 + 33, y0 + SPAN / 2, lab);
    text(ctx, String(range), x0 + 33, y0 + SPAN, lab);
    text(ctx, 'Ն', x0 + HOUSE_W - 9, hTop + HOUSE_H - 10, { color: COLORS.text3, size: 10, align: 'center' });

    // rod and pointer
    const py = y0 + frac * SPAN;
    ctx.fillStyle = COLORS.text2;
    ctx.fillRect(cx - 1.5, py, 3, hBottom + 6 + frac * SPAN - py);
    line(ctx, x0 + 3, py, x0 + HOUSE_W - 3, py, { color: COLORS.red, width: 2 });

    // thread, hook
    const hookY = hBottom + 6 + frac * SPAN;
    line(ctx, cx, hookY, cx, top, { color: COLORS.text2, width: 1.2 });
    ctx.beginPath();
    ctx.arc(cx, hookY, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.text2;
    ctx.fill();

    // digital reading
    pill(ctx, fmtN(m.Pp), x0 - 6, py, { color: COLORS.red, size: 12, align: 'right', family: 'mono', weight: 700 });
  }

  function drawCan(g) {
    const { canL, canR, floorY, waterY, rimY, sc, tableY } = g;
    // liquid
    ctx.fillStyle = liquidColor(S.liq.id);
    ctx.fillRect(canL, waterY, canR - canL, floorY - waterY);
    line(ctx, canL, waterY, canR, waterY, { color: liquidColor(S.liq.id, 0.9), width: 1.5 });

    // table
    line(ctx, 8, tableY, g.W - 8, tableY, { color: C.table, width: 3, cap: 'round' });

    text(ctx, `${S.liq.name}, ρ = ${S.liq.rho} կգ/մ³`, (canL + canR) / 2, tableY + 16, { color: COLORS.text2, size: 11, align: 'center' });
  }

  function drawCanFront(g) {
    const { canL, canR, floorY, waterY, rimY, sc } = g;
    ctx.save();
    ctx.strokeStyle = C.glass;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(canL - 1, rimY);
    ctx.lineTo(canL - 1, floorY + 1);
    ctx.lineTo(canR + 1, floorY + 1);
    ctx.lineTo(canR + 1, rimY);
    ctx.stroke();
    // spout: a tube from the wall at the liquid level
    const sx = canR + 1, sy = waterY;
    const ex = sx + 2.4 * sc, ey = sy + 0.9 * sc;
    ctx.beginPath();
    ctx.moveTo(sx, sy - 5);
    ctx.lineTo(ex, ey - 5);
    ctx.moveTo(sx, sy + 3);
    ctx.lineTo(ex - 1, ey + 3);
    ctx.stroke();
    ctx.restore();
    // liquid in the spout
    ctx.fillStyle = liquidColor(S.liq.id);
    ctx.beginPath();
    ctx.moveTo(sx, sy - 1);
    ctx.lineTo(ex, ey - 1);
    ctx.lineTo(ex - 1, ey + 3);
    ctx.lineTo(sx, sy + 3);
    ctx.closePath();
    ctx.fill();
    g.spoutEnd = { x: ex, y: ey + 3 };
  }

  function drawBeaker(g) {
    const { bkL, floorY, tableY, sc, m } = g;
    const w = BEAKER_W * sc;
    const baseY = tableY - 0.3 * sc;
    const hPx = BEAKER_H * sc;
    const fillCm = (m.Vsub * 1e6) / BEAKER_AREA;
    const fillPx = fillCm * sc;

    ctx.fillStyle = liquidColor(S.liq.id, Math.min(0.9, 0.2 + 0.1 + (S.liq.id === 'mercury' ? 0.35 : 0)));
    ctx.fillRect(bkL, baseY - fillPx, w, fillPx);
    if (fillPx > 0.5) line(ctx, bkL, baseY - fillPx, bkL + w, baseY - fillPx, { color: liquidColor(S.liq.id, 0.9), width: 1.5 });

    // volume marks every 100 cm³
    for (let v = 100; v <= 500; v += 100) {
      const y = baseY - (v / BEAKER_AREA) * sc;
      line(ctx, bkL, y, bkL + 7, y, { color: C.glass, width: 1 });
      if (v % 200 === 0) text(ctx, `${v} սմ³`, bkL + 10, y, { color: COLORS.text3, size: 9, family: 'mono' });
    }

    ctx.save();
    ctx.strokeStyle = C.glass;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(bkL - 1, baseY - hPx);
    ctx.lineTo(bkL - 1, baseY + 1);
    ctx.lineTo(bkL + w + 1, baseY + 1);
    ctx.lineTo(bkL + w + 1, baseY - hPx);
    ctx.stroke();
    ctx.restore();

    // stream from the spout while the body is being lowered
    if (flow > 0 && g.spoutEnd) {
      const sx = g.spoutEnd.x - 2, sy = g.spoutEnd.y;
      const ey = fillPx > 0 ? baseY - fillPx : baseY;
      ctx.save();
      ctx.strokeStyle = liquidColor(S.liq.id, 0.85);
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 4]);
      ctx.lineDashOffset = -phase * 60;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx, ey);
      ctx.stroke();
      ctx.restore();
    }

    // weight of the displaced liquid, on a label above the beaker
    const lx = bkL + w - 4, ly = baseY - hPx - 14;
    pill(ctx, `V = ${fmt(m.Vsub * 1e6, 0)} սմ³`, lx, ly - 15, { color: COLORS.text, size: 11, align: 'right', family: 'mono' });
    pill(ctx, `P = ${fmtN(m.Pd)}`, lx, ly + 4, { color: C.buoy, size: 11, align: 'right', family: 'mono', weight: 700 });
    text(ctx, 'արտամղված հեղուկ', lx, ly + 22, { color: COLORS.text3, size: 10, align: 'right' });
  }

  function drawBody(g) {
    const { cx, bw, bh, top, bottom, waterY, m, canL, canR } = g;
    const x0 = cx - bw / 2;
    drawBlock(ctx, x0, top, bw, bh, bodyFill(S.mat.id, S.mat.rho), S.mat.id);
    // tint of the part under the surface
    if (bottom > waterY) {
      const y1 = Math.max(top, waterY);
      ctx.fillStyle = liquidColor(S.liq.id, S.liq.id === 'mercury' ? 0.5 : 0.3);
      ctx.fillRect(x0 + 1, y1, bw - 2, bottom - y1 - 1);
      line(ctx, x0 - 6, waterY, x0 + bw + 6, waterY, { color: liquidColor(S.liq.id, 1), width: 1.5 });
    }
    text(ctx, S.mat.name, cx, top + 12, { color: COLORS.text, size: 11, align: 'center', weight: 600 });
    if (bh > 52) text(ctx, `${S.V} սմ³`, cx, top + 26, { color: COLORS.text, size: 10, align: 'center', family: 'mono' });
  }

  function drawVectors(g) {
    const { cx, bw, bh, top, bottom, waterY, m } = g;
    const unit = 62 / m.P;                                   // px per newton: mg → 62 px
    const midY = top + bh / 2;

    // weight mg: down from the centre of the body
    const xw = cx - bw * 0.27;
    haloArrow(ctx, xw, midY, xw, midY + m.P * unit, C.weight);
    symbolPill(ctx, 'mg', '', xw - 5, midY + m.P * unit + 3, { color: C.weight, align: 'right' });

    // spring (thread) force: up from the top of the body
    if (m.Pp > 0.01) {
      haloArrow(ctx, cx, top, cx, top - m.Pp * unit, C.spring);
      symbolPill(ctx, 'F', 'առ', cx + 6, top - Math.min(m.Pp * unit, 150) / 2, { color: C.spring });
    }

    // buoyant force: up from the middle of the submerged part
    if (m.Fa > 0.01) {
      const sub = bottom - Math.max(top, waterY);
      const y0 = bottom - sub / 2;
      const xb = cx + bw * 0.27;
      haloArrow(ctx, xb, y0, xb, y0 - m.Fa * unit, C.buoy);
      symbolPill(ctx, 'F', 'Ա', xb + 6, y0 - m.Fa * unit - 2, { color: C.buoy });
    }
  }

  function drawValuesBox(g) {
    const { m, W } = g;
    const rows = [
      [C.weight, 'mg', '', m.P],
      [C.spring, 'F', 'առ', m.Pp],
      [C.buoy, 'F', 'Ա', m.Fa],
    ];
    const bw = 126, rh = 20, x = W - bw - 10, y = 10;
    ctx.fillStyle = C.pillBg;
    roundRect(ctx, x, y, bw, rows.length * rh + 8, 6);
    ctx.fill();
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1;
    ctx.stroke();
    rows.forEach(([color, main, sub, val], i) => {
      const yy = y + 4 + rh * (i + 0.5);
      haloArrow(ctx, x + 12, yy + 5, x + 12, yy - 6, color, 2);
      symbolPill(ctx, main, sub, x + 20, yy, { color });
      text(ctx, `= ${fmtN(val)}`, x + bw - 8, yy, { color: COLORS.text, size: 12, family: 'mono', align: 'right', weight: 600 });
    });
  }

  function draw() {
    const g = geometry();
    if (!g.W) return;
    clear(ctx, g.W, g.H, COLORS.canvasBg);
    drawCan(g);
    drawCanFront(g);
    drawBeaker(g);
    drawBody(g);
    drawStandAndDynamometer(g);
    if (showVec.checked) {
      drawVectors(g);
      drawValuesBox(g);
    }
  }

  // ---------- Dragging ----------
  onDrag(view, {
    start(p) {
      const g = geometry();
      const half = Math.max(g.bw / 2, 24) + 12;
      if (Math.abs(p.x - g.cx) > half || p.y < g.hTop - 4 || p.y > g.bottom + 12) return false;
      S.dragging = true;
      grabOffset = p.y - g.bottom;
      return true;
    },
    move(p) {
      const g = geometry();
      setZ((p.y - grabOffset - g.waterY) / g.sc);
    },
    end() { S.dragging = false; },
  });

  update();
  depth.render();
  onThemeChange(draw);

  return {
    frame(dt) {
      phase += dt;
      if (flow > 0) flow -= dt;
      draw();
    },
    resize: draw,
  };
}
