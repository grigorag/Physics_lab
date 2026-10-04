// Tab 2 — parallel-plate capacitor: C = ε0·εr·S/d, connected (U fixed)
// or disconnected (q fixed).

import { fluidCanvas, pointerPos } from '../../../assets/js/core/canvas.js';
import { bindRange, bindSegmented, bindSelect, onClick } from '../../../assets/js/core/controls.js';
import { byId, setText, setHTML } from '../../../assets/js/core/dom.js';
import { clear, line, text, circle } from '../../../assets/js/core/draw.js';
import { COLORS, themed, alpha, onThemeChange, font } from '../../../assets/js/core/theme.js';
import { clamp, DEG } from '../../../assets/js/core/math.js';
import { plateState, EPS0 } from './physics.js';
import { UNITS, autoFormat, sig } from './format.js';

const C = themed(() => ({
  wire: COLORS.text2,
  part: COLORS.text,
  lever: COLORS.amber,
  plus: COLORS.red,
  minus: COLORS.blue,
  field: COLORS.purple,
  slab: {
    1: null,
    3.5: COLORS.amber,
    7: COLORS.teal,
    81: COLORS.blue,
  },
}));

const MATERIALS = { 1: 'օդ', 3.5: 'թուղթ', 7: 'ապակի', 81: 'ջուր' };

// Drawing scales (stylised: the real ratio of side to gap is far larger).
const S_MIN = 10, S_MAX = 400;       // cm²
const D_MIN = 0.5, D_MAX = 5;        // mm
const E_REF = 10e3;                  // V/m → one field line per 26 px
const Q_REF = EPS0 * 0.01 / 0.001 * 10;   // C: default state (S=100 cm², d=1 mm, 10 V)

const fmtRatio = (r) => {
  if (!Number.isFinite(r)) return '—';
  if (Math.abs(r - 1) < 5e-4) return '×1';
  return `×${r >= 100 ? r.toFixed(0) : r >= 10 ? r.toFixed(1) : r.toFixed(2)}`;
};

export function createPlatesTab() {
  const view = fluidCanvas(byId('plScene'), {
    height: (w) => clamp(Math.round(w * 0.5), 310, 380),
    onResize: () => render(),
  });
  const { ctx } = view;

  // ---------- State ----------
  const st = { S: 100, d: 1, epsr: 1, connected: true, U: 10, q0: 0 };
  let base = null;
  const calc = () => plateState({
    S: st.S * 1e-4, d: st.d * 1e-3, epsr: st.epsr, connected: st.connected, U: st.U, q0: st.q0,
  });
  st.q0 = calc().q;

  // ---------- Controls ----------
  bindRange('plArea', { format: (v) => `${v} սմ²`, onInput: (v) => { st.S = v; update(); } });
  bindRange('plGap', { format: (v) => `${v.toFixed(1)} մմ`, onInput: (v) => { st.d = v; update(); } });
  bindRange('plVolt', { format: (v) => `${v} Վ`, onInput: (v) => { st.U = v; update(); } });
  bindSelect('plDi', { onChange: (v) => { st.epsr = parseFloat(v); update(); } });
  const voltInput = byId('plVolt');
  const conn = bindSegmented('plConn', { onChange: (v) => setConnected(v === 'on') });
  onClick('plBase', () => { base = calc(); update(); });

  function setConnected(on) {
    if (on === st.connected) return;
    if (!on) st.q0 = calc().q;       // the charge at the moment of disconnecting
    st.connected = on;
    update();
  }

  // ---------- Geometry ----------
  function layout(W, H) {
    const L = {};
    L.s = clamp(W / 640, 0.62, 1.1);
    L.xB = Math.max(34, W * 0.09);
    const left = L.xB + 56, right = W - 96;
    const regionW = right - left;
    const wMax = Math.min(regionW, 440);
    const tS = (Math.sqrt(st.S) - Math.sqrt(S_MIN)) / (Math.sqrt(S_MAX) - Math.sqrt(S_MIN));
    L.w = wMax * (0.42 + 0.58 * tS);
    L.cx = left + regionW / 2;
    L.yc = H * 0.50;
    const tD = (st.d - D_MIN) / (D_MAX - D_MIN);
    L.gap = 20 + tD * (H * 0.27 - 20);
    L.thk = 12;
    L.xw = L.cx - L.w / 2 + 14;        // where the wires meet the plates
    L.yRT = H * 0.10;
    L.yRB = H * 0.93;
    L.yT = L.yc - L.gap / 2;           // inner surface of the upper plate
    L.yB = L.yc + L.gap / 2;
    L.xs = L.xB + (L.xw - L.xB) * 0.5; // switch
    L.xBat = L.xB;
    L.yBat = (L.yRT + L.yRB) / 2;
    return L;
  }

  let switchHit = null;
  const canvas = view.canvas;
  canvas.addEventListener('pointerdown', (e) => {
    const p = pointerPos(view, e);
    if (!switchHit || Math.hypot(p.x - switchHit.x, p.y - switchHit.y) > switchHit.r) return;
    conn.set(st.connected ? 'off' : 'on');
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pointerPos(view, e);
    const hit = switchHit && Math.hypot(p.x - switchHit.x, p.y - switchHit.y) <= switchHit.r;
    canvas.style.cursor = hit ? 'pointer' : '';
  });

  // ---------- Drawing ----------
  function halo(str, x, y, color, align = 'left', weight = 500) {
    ctx.save();
    ctx.font = font(11, { weight });
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 5;
    ctx.strokeStyle = COLORS.canvasBg;
    ctx.strokeText(str, x, y);
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  function render() {
    const { width: W, height: H } = view;
    if (!W) return;
    const L = layout(W, H);
    const r = calc();
    clear(ctx, W, H, COLORS.canvasBg);
    const x0 = L.cx - L.w / 2, x1 = L.cx + L.w / 2;
    const wire = (pts, color = C.wire) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      ctx.restore();
    };

    // wires
    const swL = L.xs - 20 * L.s, swR = L.xs + 20 * L.s;
    wire([[L.xBat, L.yBat - 6], [L.xBat, L.yRT], [swL, L.yRT]]);
    wire([[swR, L.yRT], [L.xw, L.yRT], [L.xw, L.yT - L.thk]]);
    wire([[L.xBat, L.yBat + 6], [L.xBat, L.yRB], [L.xw, L.yRB], [L.xw, L.yB + L.thk]]);

    // battery
    {
      const x = L.xBat, y = L.yBat;
      ctx.fillStyle = COLORS.canvasBg;
      ctx.fillRect(x - 16, y - 9, 32, 19);
      line(ctx, x - 14, y - 4, x + 14, y - 4, { color: C.part, width: 2 });
      line(ctx, x - 8, y + 4, x + 8, y + 4, { color: C.part, width: 4.5 });
      text(ctx, '+', x + 22, y - 8, { color: C.plus, size: 13, weight: 700, align: 'center' });
      text(ctx, '−', x + 22, y + 9, { color: C.minus, size: 13, weight: 700, align: 'center' });
      halo(`U = ${st.U} Վ`, x + 10, y + 26, st.connected ? COLORS.text : COLORS.text3, 'left');
    }

    // switch: closed (lever on the right contact) or open (lifted)
    {
      const ang = st.connected ? 0 : 32 * DEG;
      const len = swR - swL;
      circle(ctx, swR, L.yRT, 3.4, { fill: COLORS.canvasBg, stroke: C.part, width: 1.8 });
      line(ctx, swL, L.yRT, swL + len * Math.cos(ang), L.yRT - len * Math.sin(ang), {
        color: C.lever, width: 3.2, cap: 'round',
      });
      circle(ctx, swL, L.yRT, 4, { fill: C.lever });
      switchHit = { x: L.xs, y: L.yRT, r: Math.max(26, len * 0.8) };
    }

    // dielectric slab
    const tint = C.slab[st.epsr];
    if (tint) {
      ctx.fillStyle = alpha(tint, 0.26);
      ctx.fillRect(x0, L.yT, L.w, L.gap);
      ctx.strokeStyle = alpha(tint, 0.6);
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 + 0.5, L.yT, L.w - 1, L.gap);
    }

    // field lines: density ∝ E
    {
      const spacing = Math.max(5, 26 * (E_REF / r.E));
      const usable = L.w - 14;
      const n = Math.max(1, Math.floor(usable / spacing) + 1);
      const a = clamp(usable / spacing, 0.25, 1);
      const total = (n - 1) * spacing;
      for (let k = 0; k < n; k++) {
        const x = n === 1 ? L.cx : L.cx - total / 2 + k * spacing;
        const y0 = L.yT + 2, y1 = L.yB - 2;
        line(ctx, x, y0, x, y1, { color: alpha(C.field, a), width: 1.5 });
        const ym = (y0 + y1) / 2;
        ctx.fillStyle = alpha(C.field, a);
        ctx.beginPath();
        ctx.moveTo(x, ym + 4);
        ctx.lineTo(x - 3.2, ym - 2.5);
        ctx.lineTo(x + 3.2, ym - 2.5);
        ctx.closePath();
        ctx.fill();
      }
    }

    // plates with ± charges (count ∝ q)
    {
      const nMax = Math.max(2, Math.floor((L.w - 12) / 11));
      const want = clamp((6 * r.q) / Q_REF, 0.15, nMax);
      const full = Math.floor(want);
      const draw = (yTop, sign) => {
        ctx.fillStyle = alpha(sign > 0 ? C.plus : C.minus, 0.16);
        ctx.fillRect(x0, yTop, L.w, L.thk);
        line(ctx, x0, sign > 0 ? yTop : yTop + L.thk, x1, sign > 0 ? yTop : yTop + L.thk, { color: C.part, width: 1.5 });
        line(ctx, x0, sign > 0 ? yTop + L.thk : yTop, x1, sign > 0 ? yTop + L.thk : yTop, { color: C.part, width: 3 });
        const ym = yTop + L.thk / 2;
        for (let k = 0; k <= Math.min(full, nMax - 1); k++) {
          const f = k < full ? 1 : want - full;
          if (f < 0.03) continue;
          const x = nMax === 1 ? L.cx : x0 + 8 + ((L.w - 16) * k) / (nMax - 1);
          const col = alpha(sign > 0 ? C.plus : C.minus, f);
          line(ctx, x - 3, ym, x + 3, ym, { color: col, width: 1.8 });
          if (sign > 0) line(ctx, x, ym - 3, x, ym + 3, { color: col, width: 1.8 });
        }
      };
      draw(L.yT - L.thk, +1);
      draw(L.yB, -1);
    }

    // dimension d
    {
      const x = x1 + 16;
      const y0 = L.yT, y1 = L.yB;
      line(ctx, x1 + 4, y0, x + 6, y0, { color: COLORS.text3, width: 1 });
      line(ctx, x1 + 4, y1, x + 6, y1, { color: COLORS.text3, width: 1 });
      line(ctx, x, y0, x, y1, { color: COLORS.text2, width: 1.2 });
      for (const [yy, dir] of [[y0, 1], [y1, -1]]) {
        ctx.fillStyle = COLORS.text2;
        ctx.beginPath();
        ctx.moveTo(x, yy);
        ctx.lineTo(x - 3, yy + 6 * dir);
        ctx.lineTo(x + 3, yy + 6 * dir);
        ctx.closePath();
        ctx.fill();
      }
      text(ctx, `d = ${st.d.toFixed(1)} մմ`, x + 8, (y0 + y1) / 2, { color: COLORS.text, size: 11 });
    }

    // labels under the plates
    const yl = L.yB + L.thk + 16;
    text(ctx, `S = ${st.S} սմ²`, L.cx, yl, { color: COLORS.text, size: 11, align: 'center' });
    text(ctx, `${MATERIALS[st.epsr]}, ε = ${st.epsr}`, L.cx, yl + 15, {
      color: C.slab[st.epsr] ?? COLORS.text2, size: 11, align: 'center', weight: 600,
    });
    halo(st.connected ? 'U = const' : 'q = const', L.xs, L.yRT + 24, COLORS.amber, 'center', 700);
  }
  onThemeChange(() => render());

  // ---------- Stats ----------
  function update() {
    const r = calc();
    base = base ?? r;
    voltInput.disabled = !st.connected;
    const row = (id, v, units, ref) => {
      setHTML(id, `${autoFormat(v, units)}<span class="ratio">${fmtRatio(v / ref)}</span>`);
    };
    row('plC', r.C, UNITS.cap, base.C);
    row('plQ', r.q, UNITS.charge, base.q);
    setHTML('plU', `${sig(r.U, 3)} Վ<span class="ratio">${fmtRatio(r.U / base.U)}</span>`);
    row('plE', r.E, UNITS.field, base.E);
    row('plW', r.W, UNITS.energy, base.W);
    setText('plNote', st.connected
      ? 'Կոնդենսատորը միացված է աղբյուրին, ուստի լարումը մնում է հաստատուն (U = const)․ երբ C-ն փոխվում է, լիցքը վերաբաշխվում է՝ q = CU։'
      : 'Կոնդենսատորն անջատված է աղբյուրից, ուստի թիթեղների լիցքը չի փոխվում (q = const)․ երբ C-ն փոխվում է, փոխվում է լարումը՝ U = q/C։');
    render();
  }

  update();
  return { frame() {}, render, activate() { update(); } };
}
