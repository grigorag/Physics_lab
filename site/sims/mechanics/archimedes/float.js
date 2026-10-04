// Tab 2 — dropping bodies into a liquid: sink, float or hang.

import { fluidCanvas, onDrag } from '../../../assets/js/core/canvas.js';
import { bindRange, bindSelect, bindSegmented, bindCheckbox, onClick } from '../../../assets/js/core/controls.js';
import { byId, setText, setHTML } from '../../../assets/js/core/dom.js';
import { clear, line, text, roundRect } from '../../../assets/js/core/draw.js';
import { COLORS, onThemeChange } from '../../../assets/js/core/theme.js';
import { clamp } from '../../../assets/js/core/math.js';
import {
  G, FLOAT_MATERIALS, LIQUIDS, TANK, createBody, floatQuantities,
} from './physics.js';
import {
  C, fmt, fmtN, liquidColor, bodyFill, drawBlock, pill, symbolPill, haloArrow,
} from './shared.js';

const WORLD_H = 28;                     // cm shown above the tank floor
const DROP_GAP = 0.035;                 // m: bottom of the body above the surface when dropped

export function createFloat() {
  const scaleFor = (w) => clamp(w / 32, 10, 18);
  const view = fluidCanvas(byId('fScene'), {
    height: (w) => Math.round(WORLD_H * scaleFor(w) + 34),
    onResize: () => draw(),
  });
  const { ctx } = view;

  // ---------- State ----------
  const body = createBody();
  const S = {
    mat: FLOAT_MATERIALS[0], liq: LIQUIDS[0], V: 200, rhoCustom: 1000,
    x: 0.5,                              // horizontal position, fraction of the tank width
    held: false, speed: 1,
  };
  let grabDx = 0, grabDy = 0;
  let ripple = 0, prevVsub = 0, phase = 0;

  const density = () => (S.mat.id === 'custom' ? S.rhoCustom : S.mat.rho);

  // ---------- Controls ----------
  const matSel = bindSelect('fMat', { onChange: (v) => { S.mat = FLOAT_MATERIALS.find((m) => m.id === v); densBox.hidden = v !== 'custom'; restart(); } });
  const liqSel = bindSelect('fLiq', { onChange: (v) => { S.liq = LIQUIDS.find((l) => l.id === v); restart(); } });
  matSel.input.innerHTML = FLOAT_MATERIALS.map((m) => `<option value="${m.id}">${m.id === 'custom' ? m.name : `${m.name} · ${m.rho} կգ/մ³`}</option>`).join('');
  liqSel.input.innerHTML = LIQUIDS.map((l) => `<option value="${l.id}">${l.name} · ${l.rho} կգ/մ³</option>`).join('');
  matSel.input.value = S.mat.id;
  liqSel.input.value = S.liq.id;
  const densBox = byId('fDensBox');

  bindRange('fRho', {
    format: (v) => `${v.toFixed(0)} կգ/մ³`,
    onInput: (v) => { S.rhoCustom = v; applyParams(); },
    onChange: () => restart(),
  });
  bindRange('fVol', {
    format: (v) => `${v.toFixed(0)} սմ³`,
    onInput: (v) => { S.V = v; applyParams(); },
    onChange: () => restart(),
  });
  const showVec = bindCheckbox('fVec');
  bindSegmented('fSpeed', { onChange: (v) => { S.speed = parseFloat(v); } });
  onClick('fDrop', restart);

  function applyParams() {
    body.setParams({ rho: density(), V: S.V * 1e-6, rhoL: S.liq.rho, visc: S.liq.visc });
    updateStats();
  }

  /** Put the body back above the liquid and let it go. */
  function restart() {
    applyParams();
    body.place(TANK.L0 + DROP_GAP);
    S.x = 0.5;
    ripple = 0;
    prevVsub = 0;
  }

  // ---------- Readouts (equilibrium values) ----------
  function updateStats() {
    const rho = density();
    const q = floatQuantities(rho, S.V * 1e-6, S.liq.rho);
    setText('fRhoB', `${fmt(rho, 0)} կգ/մ³`);
    setText('fRhoL', `${S.liq.rho} կգ/մ³`);
    setText('fMass', q.m < 1 ? `${fmt(q.m * 1000, 0)} գ` : `${fmt(q.m, 2)} կգ`);
    setText('fWeight', fmtN(q.P));
    setText('fFmax', fmtN(q.Fmax));
    setText('fFrac', q.kind === 'sinks' ? '100 %' : `${fmt(q.frac * 100, 1)} %`);

    const box = byId('fOutcome');
    box.dataset.kind = q.kind;
    const cmp = `ρ = ${fmt(rho, 0)} կգ/մ³`;
    if (q.kind === 'floats') {
      setHTML('fOutcome', `<b>Լողում է</b>. ${cmp} &lt; ρ<sub>հ</sub> = ${S.liq.rho} կգ/մ³։ Ընկղմված է մարմնի ծավալի `
        + `<b>${fmt(q.frac * 100, 1)} %</b>-ը, որովհետև հավասարակշռության դեպքում F<sub>Ա</sub> = mg։`);
    } else if (q.kind === 'suspended') {
      setHTML('fOutcome', `<b>Կախված է հեղուկի մեջ</b>. ${cmp} = ρ<sub>հ</sub>։ F<sub>Ա</sub> = mg ամբողջովին ընկղմված մարմնի համար՝ ցանկացած խորության վրա։`);
    } else {
      setHTML('fOutcome', `<b>Սուզվում է</b>. ${cmp} &gt; ρ<sub>հ</sub> = ${S.liq.rho} կգ/մ³։ `
        + `Նույնիսկ ամբողջովին ընկղմվելիս F<sub>Ա</sub> = ${fmt(q.Fmax, 2)} Ն &lt; mg = ${fmt(q.P, 2)} Ն, ուստի մարմինը հասնում է հատակին։`);
    }
  }

  // ---------- Geometry ----------
  function geometry() {
    const { width: W, height: H } = view;
    const sc = scaleFor(W);
    const s = body.state;
    const tw = TANK.width * 100 * sc;
    const tx0 = (W - tw) / 2;
    const yF = H - 22;
    const Y = (m) => yF - m * 100 * sc;                       // height in metres → pixel y
    const bw = s.a * 100 * sc, bh = s.h * 100 * sc;
    const half = bw / 2;
    const cx = tx0 + 6 + half + S.x * (tw - 12 - bw);
    const bottom = Y(s.y);
    return { W, H, sc, tx0, tw, yF, Y, bw, bh, cx, bottom, top: bottom - bh, levelY: Y(s.level), l0Y: Y(TANK.L0), s };
  }

  // ---------- Drawing ----------
  function drawTank(g) {
    const { tx0, tw, yF, Y, sc, levelY, W } = g;
    const rimY = Y(TANK.height);

    // table
    line(ctx, 8, yF + 1, W - 8, yF + 1, { color: C.table, width: 3, cap: 'round' });

    // liquid with a small ripple on the surface
    const amp = Math.min(2.2, ripple);
    ctx.fillStyle = liquidColor(S.liq.id);
    ctx.beginPath();
    ctx.moveTo(tx0, yF);
    ctx.lineTo(tx0, levelY);
    const n = 40;
    for (let i = 0; i <= n; i++) {
      const x = tx0 + (i / n) * tw;
      ctx.lineTo(x, levelY + amp * Math.sin(i * 0.9 - phase * 9) * Math.sin(Math.PI * i / n));
    }
    ctx.lineTo(tx0 + tw, yF);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = liquidColor(S.liq.id, 0.95);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const x = tx0 + (i / n) * tw;
      const y = levelY + amp * Math.sin(i * 0.9 - phase * 9) * Math.sin(Math.PI * i / n);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // initial level and the rise
    const rise = body.state.level - TANK.L0;
    if (rise > 2e-4) {
      line(ctx, tx0, g.l0Y, tx0 + tw, g.l0Y, { color: COLORS.text3, width: 1, dash: [4, 4] });
      pill(ctx, `Δh = ${fmt(rise * 100, 1)} սմ`, tx0 + tw - 6, Math.max(g.l0Y, levelY) + 14, { color: COLORS.text, size: 11, align: 'right', family: 'mono' });
    }

    // ruler inside the left wall: every 2 cm, numbers every 4 cm
    for (let c = 0; c <= TANK.height * 100; c += 2) {
      const y = Y(c / 100);
      line(ctx, tx0, y, tx0 + (c % 4 === 0 ? 8 : 5), y, { color: C.glass, width: 1 });
      if (c % 4 === 0 && c > 0) text(ctx, String(c), tx0 + 11, y, { color: COLORS.text3, size: 9, family: 'mono' });
    }
    text(ctx, 'սմ', tx0 + 11, yF - 6, { color: COLORS.text3, size: 9 });

    text(ctx, `${S.liq.name}, ρ = ${S.liq.rho} կգ/մ³`, tx0 + tw - 8, yF - 10, { color: COLORS.text2, size: 11, align: 'right' });

    g.rimY = rimY;
  }

  function drawTankFront(g) {
    const { tx0, tw, yF, rimY } = g;
    ctx.save();
    ctx.strokeStyle = C.glass;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(tx0 - 1, rimY);
    ctx.lineTo(tx0 - 1, yF + 1);
    ctx.lineTo(tx0 + tw + 1, yF + 1);
    ctx.lineTo(tx0 + tw + 1, rimY);
    ctx.stroke();
    ctx.restore();
  }

  function drawBody(g) {
    const { cx, bw, bh, top, bottom, levelY } = g;
    const s = g.s;
    const x0 = cx - bw / 2;
    drawBlock(ctx, x0, top, bw, bh, bodyFill(S.mat.id, density()), S.mat.id);
    if (bottom > levelY) {
      const y1 = Math.max(top, levelY);
      ctx.fillStyle = liquidColor(S.liq.id, S.liq.id === 'mercury' ? 0.5 : 0.3);
      ctx.fillRect(x0 + 1, y1, bw - 2, bottom - y1 - 1);
      // waterline on the body, with the submerged share
      if (top < levelY - 1) {
        line(ctx, x0 - 7, levelY, x0 + bw + 7, levelY, { color: COLORS.text, width: 1.5, dash: [4, 3] });
        pill(ctx, `${fmt(clamp(s.d / s.h, 0, 1) * 100, 0)} %`, x0 + bw + 10, levelY, { color: COLORS.text, size: 11, family: 'mono' });
      }
    }
  }

  function drawVectors(g) {
    const { cx, bw, bh, top, bottom, levelY, s } = g;
    const mg = s.m * G;
    if (mg <= 0) return;
    const len = (F) => clamp((60 * F) / mg, 0, 110);
    const midY = top + bh / 2;

    const xw = cx - bw * 0.3;
    const lw = len(mg);
    haloArrow(ctx, xw, midY, xw, midY + lw, C.weight);
    symbolPill(ctx, 'mg', '', xw - 5, midY + lw, { color: C.weight, align: 'right', value: `= ${fmtN(mg)}` });

    if (s.Fb > 1e-4) {
      const sub = bottom - Math.max(top, levelY);
      const y0 = bottom - sub / 2;
      const xb = cx + bw * 0.3;
      const lb = len(s.Fb);
      haloArrow(ctx, xb, y0, xb, y0 - lb, C.buoy);
      symbolPill(ctx, 'F', 'Ա', xb + 5, y0 - lb, { color: C.buoy, value: `= ${fmtN(s.Fb)}` });
    }

    if (s.N > 1e-4) {
      const ln = len(s.N);
      haloArrow(ctx, cx, bottom, cx, bottom - ln, C.normal);
      symbolPill(ctx, 'N', '', cx + 5, bottom - ln, { color: C.normal, value: `= ${fmtN(s.N)}` });
    }
  }

  function draw() {
    const g = geometry();
    if (!g.W) return;
    clear(ctx, g.W, g.H, COLORS.canvasBg);
    drawTank(g);
    drawBody(g);
    drawTankFront(g);
    if (showVec.checked) drawVectors(g);
    setText('fRise', `${fmt((g.s.level - TANK.L0) * 100, 2)} սմ`);
  }

  // ---------- Dragging ----------
  onDrag(view, {
    start(p) {
      const g = geometry();
      const pad = 8;
      if (p.x < g.cx - g.bw / 2 - pad || p.x > g.cx + g.bw / 2 + pad || p.y < g.top - pad || p.y > g.bottom + pad) return false;
      S.held = true;
      grabDx = p.x - g.cx;
      grabDy = p.y - g.bottom;
      return true;
    },
    move(p) {
      const g = geometry();
      const free = g.tw - 12 - g.bw;
      S.x = clamp((p.x - grabDx - g.tx0 - 6 - g.bw / 2) / free, 0, 1);
      body.place(clamp((g.yF - (p.y - grabDy)) / (g.sc * 100), 0, (WORLD_H - 0.5) / 100 - body.state.h));
    },
    end() { S.held = false; },
  });

  applyParams();
  restart();
  onThemeChange(draw);

  return {
    frame(dt) {
      phase += dt;
      if (!S.held) body.advance(dt * S.speed);
      const v = body.state.Vsub;
      ripple = Math.max(ripple * Math.exp(-2.5 * dt), 0);
      ripple = Math.min(3, ripple + Math.abs(v - prevVsub) * 3e5);
      prevVsub = v;
      draw();
    },
    resize: draw,
  };
}
