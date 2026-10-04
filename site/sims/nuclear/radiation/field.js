// Tab 1 — the mixed beam from a radioactive source split by a magnetic or electric field.
//
// World units: centimetres. Origin at the mouth of the lead container's channel,
// x to the right, y up; the photographic plate is at y = L. Particles move along
// their paths with the real ratio of speeds (slow motion: c ↔ L in 0.35 s).
// The curvature comes from physics.js (real values); only in the magnetic field
// the α curvature is multiplied by ALPHA_EXAG so that its deflection is visible.

import { fluidCanvas } from '../../../assets/js/core/canvas.js';
import { bindRange, bindSegmented, bindCheckbox, bindPlayPause, onClick } from '../../../assets/js/core/controls.js';
import { byId, setHTML, setText } from '../../../assets/js/core/dom.js';
import { clear, line, arrow, circle, text, roundRect } from '../../../assets/js/core/draw.js';
import { COLORS, themed, alpha } from '../../../assets/js/core/theme.js';
import { clamp, rand } from '../../../assets/js/core/math.js';
import {
  PARTICLES, TYPES, C_LIGHT, E_CHARGE, U_KG,
  kinematics, radius, forceSign, advance, deflection,
} from './physics.js';
import { fmtSig, sci, fmtLen } from './format.js';

const L = 10;                  // cm, channel mouth → plate
const HALF = 8;                // cm, half-width of the field region (electrodes in E mode)
const BOX_W = 2;               // cm, lead container
const BOX_H = 1.6;
const SRC_DEPTH = 1.1;         // cm, source below the mouth
const VC = L / 0.35;           // displayed speed of light, cm per second
const ALPHA_EXAG = 20;         // α curvature exaggeration in the magnetic field
const TRAIL_T = 0.3;           // s of trail behind each particle
const MAX_HITS = 700;          // dots kept per spot on the plate
const DS = 0.05;               // cm, integration step
const SPREAD = 0.012;          // rad, half-angle of the beam from the channel
const SYMBOL = { alpha: 'α', beta: 'β', gamma: 'γ' };

const C = themed((light) => ({
  alpha: COLORS.coral,
  beta: COLORS.blue,
  gamma: COLORS.green,
  lead: light ? '#9aa0b0' : '#454c60',
  leadEdge: light ? '#6a7083' : '#68708a',
  plate: light ? '#ebe6d6' : '#262b3b',
  plateEdge: light ? '#b9b19a' : '#4a5168',
  region: alpha(COLORS.purple, light ? 0.04 : 0.06),
  regionEdge: alpha(COLORS.purple, light ? 0.25 : 0.3),
  symbol: light ? '#5a4be0' : '#a69ffa',
  plus: COLORS.red,
  minus: COLORS.blue,
  source: COLORS.amber,
}));

export function createField() {
  const view = fluidCanvas(byId('fieldCv'), {
    height: (w) => clamp(Math.round(w * 0.66), 300, 600),
  });
  const { ctx } = view;

  // ---------- State ----------
  let kind = 'B';
  let paused = false;
  let particles = [];
  let simTime = 0;
  let refPaths = {};
  const hits = { alpha: [], beta: [], gamma: [] };
  const acc = { alpha: 0, beta: 0, gamma: 0 };

  // ---------- Controls ----------
  const bCtl = bindRange('fieldB', { format: (v) => `${v} մՏլ`, onInput: changed });
  const eCtl = bindRange('fieldE', { format: (v) => `${v.toFixed(1)} ՄՎ/մ`, onInput: changed });
  const bDir = bindSegmented('bDir', { onChange: changed });
  const eDir = bindSegmented('eDir', { onChange: changed });
  const rate = bindRange('rate', { format: (v) => `${v} /վ` });
  const on = {
    alpha: bindCheckbox('onAlpha'),
    beta: bindCheckbox('onBeta'),
    gamma: bindCheckbox('onGamma'),
  };
  bindSegmented('fieldKind', {
    onChange: (v) => {
      kind = v;
      byId('bBox').hidden = byId('bDirBox').hidden = v !== 'B';
      byId('eBox').hidden = byId('eDirBox').hidden = v !== 'E';
      for (const t of TYPES) hits[t].length = 0;
      particles = [];
      changed();
    },
  });
  bindPlayPause('playBtn', { onChange: (p) => { paused = p; } });
  onClick('clearBtn', () => {
    for (const t of TYPES) hits[t].length = 0;
    particles = [];
  });

  /** Field as physics.js expects it: value in T or V/m, sign of Bz or Ex. */
  function field() {
    return kind === 'B'
      ? { kind, value: bCtl.value / 1000, sign: +bDir.value }
      : { kind, value: eCtl.value * 1e6, sign: +eDir.value };
  }
  const exag = (type, f) => (type === 'alpha' && f.kind === 'B' ? ALPHA_EXAG : 1);

  function changed() {
    const f = field();
    refPaths = {};
    for (const t of TYPES) refPaths[t] = referencePath(t, f);
    updateReadouts(f);
    updateHints(f);
  }

  // ---------- Motion ----------
  /** Moves one particle by path length `len`; returns 'plate' / 'dead' / null. */
  function move(p, len, f) {
    let rest = len;
    while (rest > 0) {
      const ds = Math.min(DS, rest);
      rest -= ds;
      const px = p.x, py = p.y;
      if (p.y < 0) {                                  // still inside the lead channel: no field
        p.x += Math.sin(p.theta) * ds;
        p.y += Math.cos(p.theta) * ds;
      } else {
        advance(p, p.type, f, ds, exag(p.type, f));
      }
      if (p.y >= L) {
        p.x = px + ((L - py) * (p.x - px)) / (p.y - py || 1);
        p.y = L;
        return 'plate';
      }
      if ((p.y < 0 && Math.cos(p.theta) < 0) || Math.abs(p.x) > HALF) return 'dead';
    }
    return null;
  }

  function referencePath(type, f) {
    const p = { type, x: 0, y: 0, theta: 0, T: PARTICLES[type].T };
    const pts = [{ x: 0, y: 0 }];
    for (let i = 0; i < 2000; i++) {
      const r = move(p, 0.1, f);
      pts.push({ x: p.x, y: p.y });
      if (r) break;
    }
    return pts;
  }

  function emit(type) {
    particles.push({
      type,
      x: rand(-0.05, 0.05),
      y: -SRC_DEPTH,
      theta: rand(-SPREAD, SPREAD),
      T: PARTICLES[type].T,
      trail: [],
    });
  }

  function step(dt) {
    const f = field();
    simTime += dt;
    for (const t of TYPES) {
      if (!on[t].checked) { acc[t] = 0; continue; }
      acc[t] += rate.value * dt;
      while (acc[t] >= 1) { acc[t] -= 1; emit(t); }
    }
    const alive = [];
    for (const p of particles) {
      const pr = PARTICLES[p.type];
      const len = kinematics(p.T, pr.mc2).beta * VC * dt;
      const res = move(p, len, f);
      p.trail.push({ x: p.x, y: p.y, t: simTime });
      while (p.trail.length > 2 && simTime - p.trail[0].t > TRAIL_T) p.trail.shift();
      if (res === 'plate') {
        const h = hits[p.type];
        h.push({ x: p.x, j: Math.random() });
        if (h.length > MAX_HITS) h.shift();
      } else if (!res) {
        alive.push(p);
      }
    }
    particles = alive;
  }

  // ---------- Readouts ----------
  const FORCE = { '-1': '← դեպի ձախ', 1: '→ դեպի աջ' };
  const RO = { alpha: 'roAlpha', beta: 'roBeta', gamma: 'roGamma' };

  function updateReadouts(f) {
    for (const t of TYPES) {
      const p = PARTICLES[t];
      const k = kinematics(p.T, p.mc2);
      const s = forceSign(t, f);
      const lines = [];
      const q = p.z === 0 ? '0' : `${p.z > 0 ? '+' : '−'}${Math.abs(p.z) === 1 ? '' : Math.abs(p.z)}e`;
      lines.push(`Լիցք՝ <b>${q}</b>${p.z ? ` = ${sci(p.z * E_CHARGE, 2)} Կլ` : ''}`);
      lines.push(p.massU
        ? `Զանգված՝ <b>${fmtSig(p.massU, 3)} ա.զ.մ.</b> = ${sci(p.massU * U_KG, 3)} կգ`
        : 'Զանգված՝ <b>0</b> (ֆոտոն)');
      lines.push(`Էներգիա՝ <b>${p.T} ՄէՎ</b>, v = <b>${k.beta === 1 ? 'c' : `${k.beta.toFixed(3)}c`}</b>`);
      lines.push(`v = ${sci(k.beta * C_LIGHT, 3)} մ/վ`);
      lines.push(`Ուժ՝ <b>${s ? FORCE[s] : p.z ? '0 (դաշտ չկա)' : '0 (չեզոք է)'}</b>`);
      if (f.kind === 'B') {
        lines.push(`r = p/(|q|B)՝ <b>${fmtLen(radius(t, f.value), 3)}</b>`);
      } else {
        lines.push(`Հետագիծը՝ <b>${s ? 'պարաբոլին մոտ կոր' : 'ուղիղ'}</b>`);
      }
      const d = deflection(t, f, L / 100);
      let dTxt;
      if (Number.isNaN(d)) dTxt = '<b>չի հասնում թիթեղին</b> (r &lt; 10 սմ)';
      else if (d === 0) dTxt = '<b>0</b>';
      else {
        dTxt = `<b>${fmtLen(Math.abs(d), 2)} ${d < 0 ? 'ձախ' : 'աջ'}</b>`;
        if (exag(t, f) > 1) dTxt += ` (նկարում՝ ×${ALPHA_EXAG})`;
      }
      lines.push(`Շեղումը թիթեղին՝ ${dTxt}`);
      setHTML(RO[t], lines.join('<br>'));
    }
  }

  function updateHints(f) {
    if (f.kind === 'B') {
      setText('scaleHint', `Նկարը մասշտաբային չէ. α-ի շեղումը մեծացված է ${ALPHA_EXAG} անգամ`);
      setHTML('ruleHint', '<b>Ձախ ձեռքի կանոն.</b> եթե B-ի գծերը մտնում են ափի մեջ, իսկ չորս մատները ցույց են տալիս դրական լիցքի արագության ուղղությունը, ապա 90°-ով բացված բութ մատը ցույց է տալիս ուժի ուղղությունը (F = q·v×B)։ Բացասական լիցքի վրա ուժը հակառակ է։ ⊗՝ B-ն ուղղված է նկարի հարթությունից ներս (մեզնից հեռու), ⊙՝ դեպի մեզ։');
    } else {
      setText('scaleHint', 'Շեղումները պատկերված են իրական մասշտաբով');
      setHTML('ruleHint', 'Դրական լիցքի վրա ուժն ուղղված է E-ի ուղղությամբ՝ «+» թիթեղից դեպի «−» թիթեղը, բացասական լիցքի վրա՝ հակառակ (F = q·E)։ Թիթեղների միջև վակուում է։');
    }
  }

  // ---------- Drawing ----------
  function geometry(W, H) {
    const top = 36;
    const k = Math.min((H - top - 14) / (L + BOX_H), (W - 24) / (2 * HALF));
    const used = (L + BOX_H) * k;
    const y0 = top + L * k + Math.max(0, (H - top - 14 - used) / 2);
    const x0 = W / 2;
    return { k, x0, y0, X: (x) => x0 + x * k, Y: (y) => y0 - y * k };
  }

  function drawField(g, f) {
    const { X, Y, k } = g;
    const xl = X(-HALF), xr = X(HALF), yt = Y(L), yb = Y(0);
    ctx.fillStyle = C.region;
    ctx.fillRect(xl, yt, xr - xl, yb - yt);
    line(ctx, xl, yb, xr, yb, { color: C.regionEdge, width: 1, dash: [4, 4] });

    const max = f.kind === 'B' ? 0.05 : 1e7;
    const frac = f.value / max;
    const stepPx = clamp(k * 1.6, 28, 52);
    const nx = Math.max(1, Math.floor((xr - xl) / stepPx));
    const ny = Math.max(1, Math.floor((yb - yt - 14) / stepPx));
    const dx = (xr - xl) / nx;
    const dy = (yb - yt - 14) / ny;

    if (f.kind === 'B') {
      if (frac <= 0) return;
      const col = alpha(C.symbol, 0.2 + 0.5 * frac);
      const r = clamp(stepPx * 0.16, 4, 7);
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < ny; j++) {
          const cx = xl + dx * (i + 0.5);
          const cy = yt + 14 + dy * (j + 0.5);
          circle(ctx, cx, cy, r, { stroke: col, width: 1.2 });
          if (f.sign < 0) {
            const a = r * 0.62;
            line(ctx, cx - a, cy - a, cx + a, cy + a, { color: col, width: 1.2 });
            line(ctx, cx - a, cy + a, cx + a, cy - a, { color: col, width: 1.2 });
          } else {
            circle(ctx, cx, cy, 1.8, { fill: col });
          }
        }
      }
    } else {
      // Electrodes at x = ±HALF and short E arrows (from + to −).
      const plusLeft = f.sign > 0;
      const ew = 6;
      for (const side of [-1, 1]) {
        const isPlus = (side < 0) === plusLeft;
        const ex = side < 0 ? xl - ew : xr;
        ctx.fillStyle = isPlus ? C.plus : C.minus;
        ctx.fillRect(ex, yt + 4, ew, yb - yt - 4);
        text(ctx, isPlus ? '+' : '−', ex + ew / 2, yb + 12, {
          color: isPlus ? C.plus : C.minus, size: 15, weight: 700, family: 'mono', align: 'center',
        });
      }
      if (frac <= 0) return;
      const col = alpha(C.symbol, 0.18 + 0.45 * frac);
      const half = Math.min(dx * 0.32, 14);
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < ny; j++) {
          const cx = xl + dx * (i + 0.5);
          const cy = yt + 14 + dy * (j + 0.5);
          arrow(ctx, cx - f.sign * half, cy, cx + f.sign * half, cy, { color: col, width: 1.2, head: 6 });
        }
      }
    }
  }

  function drawPlate(g) {
    const { X, Y } = g;
    const xl = X(-HALF), xr = X(HALF), y = Y(L);
    ctx.fillStyle = C.plate;
    ctx.strokeStyle = C.plateEdge;
    ctx.lineWidth = 1;
    roundRect(ctx, xl, y - 11, xr - xl, 11, 2);
    ctx.fill();
    ctx.stroke();
    text(ctx, 'լուսանկարչական թիթեղ', (xl + xr) / 2, y - 21, { color: COLORS.text3, size: 11, align: 'center' });

    for (const t of TYPES) {
      const col = alpha(C[t], 0.45);
      ctx.fillStyle = col;
      for (const h of hits[t]) {
        ctx.beginPath();
        ctx.arc(X(h.x), y - 2.5 - h.j * 6, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawSource(g) {
    const { X, Y, k } = g;
    const x = X(-BOX_W / 2), y = Y(0), w = BOX_W * k, h = BOX_H * k;
    ctx.fillStyle = C.lead;
    ctx.strokeStyle = C.leadEdge;
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, w, h, 3);
    ctx.fill();
    ctx.stroke();
    const cw = Math.max(4, 0.22 * k);
    ctx.fillStyle = COLORS.canvasBg;
    ctx.fillRect(X(0) - cw / 2, y - 1, cw, SRC_DEPTH * k + 1);
    circle(ctx, X(0), Y(-SRC_DEPTH), Math.max(3, cw * 0.6), { fill: C.source });
    const lx = x + w + 8;
    text(ctx, 'ռադիոակտիվ նյութ', lx, y + h * 0.35, { color: COLORS.text2, size: 11 });
    text(ctx, 'կապարե անոթում', lx, y + h * 0.35 + 14, { color: COLORS.text3, size: 11 });
  }

  function drawParticles(g) {
    const { X, Y } = g;
    for (const p of particles) {
      const col = C[p.type];
      const tr = p.trail;
      for (let i = 1; i < tr.length; i++) {
        const a = i / tr.length;
        line(ctx, X(tr[i - 1].x), Y(tr[i - 1].y), X(tr[i].x), Y(tr[i].y), { color: alpha(col, 0.55 * a), width: 1.6, cap: 'round' });
      }
      if (p.y >= -0.05) circle(ctx, X(p.x), Y(p.y), p.type === 'alpha' ? 3.2 : 2.4, { fill: col });
    }
  }

  function drawReference(g, f) {
    const { X, Y } = g;
    const LABEL = { alpha: { h: 0.55, d: -1 }, beta: { h: 0.38, d: 1 }, gamma: { h: 0.72, d: 1 } };
    for (const t of TYPES) {
      const pts = refPaths[t];
      if (!pts || !on[t].checked) continue;
      ctx.save();
      ctx.strokeStyle = alpha(C[t], 0.28);
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))));
      ctx.stroke();
      ctx.restore();

      // Label next to the path, on the side it bends to.
      const target = LABEL[t].h * L;
      let pt = pts.find((p) => p.y >= target);
      if (!pt) pt = pts.reduce((a, b) => (b.y > a.y ? b : a), pts[0]);
      const s = forceSign(t, f) || LABEL[t].d;
      text(ctx, SYMBOL[t], X(pt.x) + s * 14, Y(pt.y), {
        color: C[t], size: 16, weight: 700, align: 'center',
      });
    }
  }

  function drawInfo(f, W, H) {
    const txt = f.kind === 'B'
      ? `B = ${bCtl.value} մՏլ ${f.value > 0 ? (f.sign < 0 ? '⊗' : '⊙') : ''}`
      : `E = ${eCtl.value.toFixed(1)} ՄՎ/մ`;
    text(ctx, txt, 12, H - 26, { color: COLORS.text2, size: 12, family: 'mono' });
    text(ctx, `աղբյուր → թիթեղ՝ ${L} սմ`, 12, H - 10, { color: COLORS.text3, size: 11 });
  }

  function draw() {
    const { width: W, height: H } = view;
    if (!W) return;
    const f = field();
    const g = geometry(W, H);
    clear(ctx, W, H, COLORS.canvasBg);
    drawField(g, f);
    drawPlate(g);
    drawReference(g, f);
    drawParticles(g);
    drawSource(g);
    drawInfo(f, W, H);
  }

  changed();

  return {
    frame(dt) {
      if (!paused) step(dt);
      draw();
    },
  };
}
