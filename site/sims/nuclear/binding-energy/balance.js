// Tab 1 — mass defect on a balance: the nucleus (left pan) against the same
// Z protons and N neutrons taken apart (right pan). The separated nucleons are
// heavier by Δm, so the beam tips to the right (the tilt is exaggerated).

import { fluidCanvas } from '../../../assets/js/core/canvas.js';
import { byId, setText, setHTML } from '../../../assets/js/core/dom.js';
import { clear, line, text, roundRect } from '../../../assets/js/core/draw.js';
import { COLORS, onThemeChange, fontsReady } from '../../../assets/js/core/theme.js';
import { clamp, DEG } from '../../../assets/js/core/math.js';
import { nuclide, NUCLIDES, MEV_J } from './physics.js';
import { C, ball, label, sci } from './shared.js';

const MAX_TILT = 9 * DEG;
const MAX_REL = Math.max(...NUCLIDES.map((n) => n.dm / n.parts));   // ≈0.95 % (⁶²Ni)

/** Deterministic shuffle so protons and neutrons are mixed the same way each time. */
function mixed(Z, N, seed) {
  const a = [...Array(Z).fill(1), ...Array(N).fill(0)];
  let s = seed >>> 0;
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createBalance(state) {
  const view = fluidCanvas(byId('balanceCv'), {
    height: (w) => Math.round(clamp(w * 0.62, 340, 470)),
    onResize: () => { dirty = true; },
  });
  const { ctx } = view;
  let tilt = 0;
  let dirty = true;

  function geometry() {
    const W = view.width, H = view.height;
    const cx = W / 2;
    const Lb = Math.min(W * 0.33, 250);
    const panHalf = Math.min(W * 0.15, 115);
    const y0 = 80;
    const hang = Math.round(H * 0.45);
    return { W, H, cx, Lb, panHalf, y0, hang, heapH: hang - 46 };
  }

  /** Ball radius so that A separated balls (spacing 2.7r) fit on the pan. */
  function ballRadius(A, g) {
    const width = 2 * g.panHalf * 0.9;
    for (let r = 16; r > 1.2; r -= 0.1) {
      const d = 2.7 * r;
      const cols = Math.max(1, Math.floor(width / d));
      const rows = Math.ceil(A / cols);
      if (rows * d <= g.heapH && (A > 1 || r <= 14)) return r;
    }
    return 1.2;
  }

  function drawNucleus(n, x, yBase, r) {
    const kinds = mixed(n.Z, n.N, n.A * 131 + n.Z);
    const c = r * 0.98;                          // sunflower packing step
    const R = c * Math.sqrt(n.A) + r;
    const cy = yBase - R;
    // Outer balls first, so the centre looks raised.
    for (let i = n.A - 1; i >= 0; i--) {
      const rad = c * Math.sqrt(i + (n.A > 1 ? 0.5 : 0));
      const ang = i * 2.39996;
      ball(ctx, x + rad * Math.cos(ang), cy + rad * Math.sin(ang), r, kinds[i] ? C.proton : C.neutron);
    }
  }

  function drawSeparated(n, x, yBase, r, g) {
    const d = 2.7 * r;
    const cols = Math.max(1, Math.min(n.A, Math.floor((2 * g.panHalf * 0.9) / d)));
    for (let i = 0; i < n.A; i++) {
      const row = Math.floor(i / cols);
      const inRow = Math.min(cols, n.A - row * cols);
      const col = i % cols;
      const bx = x + (col - (inRow - 1) / 2) * d;
      const by = yBase - r - 1 - row * d;
      ball(ctx, bx, by, r, i < n.Z ? C.proton : C.neutron);
    }
  }

  function pan(x, y, half) {
    ctx.save();
    ctx.fillStyle = C.metal;
    ctx.beginPath();
    ctx.moveTo(x - half, y);
    ctx.quadraticCurveTo(x, y + 18, x + half, y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function draw() {
    const n = nuclide(state.key);
    const g = geometry();
    const { W, H, cx, Lb, panHalf, y0, hang } = g;
    clear(ctx, W, H, COLORS.canvasBg);

    // Stand.
    const baseY = H - 14;
    roundRect(ctx, cx - 46, baseY - 8, 92, 8, 3);
    ctx.fillStyle = C.metal;
    ctx.fill();
    line(ctx, cx, y0, cx, baseY - 8, { color: C.metal, width: 6, cap: 'round' });

    // Beam.
    const ex = Math.cos(tilt) * Lb, ey = Math.sin(tilt) * Lb;
    const L = { x: cx - ex, y: y0 - ey };
    const R = { x: cx + ex, y: y0 + ey };
    line(ctx, L.x, L.y, R.x, R.y, { color: C.metalDark, width: 5, cap: 'round' });
    // Pointer on the pivot.
    const pl = 34;
    line(ctx, cx, y0, cx + Math.sin(tilt) * pl, y0 - Math.cos(tilt) * pl, { color: COLORS.amber, width: 2.5, cap: 'round' });
    ctx.beginPath();
    ctx.arc(cx, y0, 6, 0, Math.PI * 2);
    ctx.fillStyle = C.metalDark;
    ctx.fill();

    // Pans, strings, contents.
    const r = ballRadius(n.A, g);
    for (const [end, which] of [[L, 'left'], [R, 'right']]) {
      const py = end.y + hang;
      line(ctx, end.x, end.y, end.x - panHalf, py, { color: C.metal, width: 1 });
      line(ctx, end.x, end.y, end.x + panHalf, py, { color: C.metal, width: 1 });
      if (which === 'left') drawNucleus(n, end.x, py + 2, r);
      else drawSeparated(n, end.x, py + 2, r, g);
      pan(end.x, py, panHalf);
    }

    // Labels under the pans.
    const small = W < 520;
    const fs = small ? 10.5 : 12;
    const ly = Math.max(L.y, R.y) + hang + 30;
    text(ctx, `միջուկ ${label(n)}`, L.x, ly, { size: fs + 1, weight: 600, align: 'center' });
    text(ctx, `${n.mass.toFixed(6)} ա.զ.մ.`, L.x, ly + 18, { color: COLORS.text2, size: fs, family: 'mono', align: 'center' });
    text(ctx, `${n.Z} p + ${n.N} n`, R.x, ly, { size: fs + 1, weight: 600, align: 'center' });
    text(ctx, `${n.parts.toFixed(6)} ա.զ.մ.`, R.x, ly + 18, { color: COLORS.text2, size: fs, family: 'mono', align: 'center' });

    // Δm on top.
    const msg = n.dm > 5e-7
      ? `Δm = ${n.dm.toFixed(6)} ա.զ.մ.  →  E = ${n.E.toFixed(2)} ՄէՎ`
      : 'Δm = 0. ¹H-ը մեկ նուկլոն է, կապ չկա';
    text(ctx, msg, cx, 18, { color: COLORS.amber, size: small ? 11.5 : 13.5, weight: 600, family: 'mono', align: 'center' });
  }

  function updateStats() {
    const n = nuclide(state.key);
    setHTML('b-name', `<sup>${n.A}</sup>${n.sym} · ${n.name}`);
    setText('b-Z', String(n.Z));
    setText('b-N', String(n.N));
    setText('b-A', String(n.A));
    setText('b-M', `${n.mass.toFixed(6)} ա.զ.մ.`);
    setText('b-parts', `${n.parts.toFixed(6)} ա.զ.մ.`);
    setText('b-dm', `${n.dm.toFixed(6)} ա.զ.մ.`);
    setText('b-E', `${n.E.toFixed(2)} ՄէՎ`);
    setText('b-EJ', `${sci(n.E * MEV_J)} Ջ`);
    setText('b-eps', `${n.eps.toFixed(3)} ՄէՎ/նուկլոն`);
    setText('b-rel', `${((n.dm / n.parts) * 100).toFixed(3)} %`);
  }

  onThemeChange(() => { dirty = true; });
  fontsReady().then(() => { dirty = true; });

  return {
    update() { updateStats(); dirty = true; },
    tick(dt) {
      const n = nuclide(state.key);
      const target = MAX_TILT * (n.dm / n.parts) / MAX_REL;
      const k = 1 - Math.exp(-dt * 5);
      if (Math.abs(target - tilt) > 1e-5) { tilt += (target - tilt) * k; dirty = true; }
      if (dirty) { dirty = false; draw(); }
    },
    redraw() { dirty = true; },
  };
}
