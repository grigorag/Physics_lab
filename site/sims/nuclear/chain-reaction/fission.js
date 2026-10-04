// Tab 1 — fission of a single ²³⁵U nucleus.
// A scripted animation: slow neutron → capture → excited ²³⁶U* oscillates and
// stretches (liquid-drop model) → two fragments + fast neutrons + energy.
// The nucleus is drawn with 70 "nucleons" (a scaled-down picture); the energy
// numbers come from the real atomic masses (physics.js).

import { fluidCanvas } from '../../../assets/js/core/canvas.js';
import { bindSegmented, bindCheckbox, onClick } from '../../../assets/js/core/controls.js';
import { byId, $$, setText, setHTML } from '../../../assets/js/core/dom.js';
import { clear, text, arrow } from '../../../assets/js/core/draw.js';
import { COLORS, alpha, onThemeChange } from '../../../assets/js/core/theme.js';
import { clamp, lerp, TAU } from '../../../assets/js/core/math.js';
import { CHANNELS, channelEnergy, M_N, M_U235, MEV_TO_J } from './physics.js';
import { C, fmt, sci } from './shared.js';

const N_PARENT = 70;                     // dots in the ²³⁵U picture (+1 captured neutron)
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

// Phase durations, s (before slow motion)
const T_APPROACH = 1.5, T_CAPTURE = 0.35, T_WOBBLE = 1.6, T_STRETCH = 0.9, T_FLY = 3.2;
const t1 = T_APPROACH, t2 = t1 + T_CAPTURE, t3 = t2 + T_WOBBLE, t4 = t3 + T_STRETCH, tEnd = t4 + T_FLY;

const SUPS = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const sup = (n) => String(n).split('').map((c) => SUPS[c]).join('');

const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/** n points filling a disc of radius 1 (sunflower pattern), centre first. */
function sunflower(n) {
  return Array.from({ length: n }, (_, i) => {
    const r = Math.sqrt((i + 0.5) / n);
    return { x: r * Math.cos(i * GOLDEN), y: r * Math.sin(i * GOLDEN) };
  });
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function nuclideHTML(A, Z, sym) {
  return `<span class="nuc"><span class="iso"><span>${A}</span><span>${Z}</span></span><b>${sym}</b></span>`;
}

export function createFission() {
  const view = fluidCanvas(byId('fScene'), {
    height: (w) => clamp(Math.round(w * 0.46), 280, 430),
    onResize: () => render(),
  });
  const { ctx } = view;

  let channel = CHANNELS.BaKr;
  let t = -1;                  // animation time; −1 = waiting for the neutron
  let slow = false;
  let model = null;            // dot assignment for the current channel

  /* ---------- Model: which dot goes where ---------- */
  function buildModel() {
    const ch = channel;
    const k = ch.neutrons;
    const total = N_PARENT + 1;
    const bound = total - k;
    const nH = Math.round(bound * ch.heavy.A / (ch.heavy.A + ch.light.A));
    const nL = bound - nH;

    const L70 = sunflower(N_PARENT).map((p) => ({ x: p.x * Math.sqrt(N_PARENT / total), y: p.y * Math.sqrt(N_PARENT / total) }));
    const L71 = sunflower(total);
    // the captured neutron takes the outer slot that faces the incoming neutron (left)
    let slot = 0;
    L71.forEach((p, i) => { if (p.x < L71[slot].x) slot = i; });
    const dots = [];
    let j = 0;
    for (let i = 0; i < total; i++) {
      if (i === slot) continue;
      dots.push({ p70: L70[j++], p71: L71[i], incoming: false });
    }
    dots.push({ p70: null, p71: L71[slot], incoming: true });

    // free neutrons: the dots closest to the middle plane (the neck), never the captured one
    const byNeck = dots.filter((d) => !d.incoming).sort((a, b) => Math.abs(a.p71.x) - Math.abs(b.p71.x));
    const free = byNeck.slice(0, k);
    free.forEach((d) => { d.group = 'free'; });
    const rest = dots.filter((d) => !d.group).sort((a, b) => a.p71.x - b.p71.x);
    rest.forEach((d, i) => { d.group = i < nH ? 'heavy' : 'light'; });

    // fragment layouts (unit radius, scaled at draw time)
    const groups = {};
    for (const [name, n, nuc] of [['heavy', nH, ch.heavy], ['light', nL, ch.light]]) {
      const members = dots.filter((d) => d.group === name);
      const cx = members.reduce((s, d) => s + d.p71.x, 0) / n;
      const cy = members.reduce((s, d) => s + d.p71.y, 0) / n;
      members.sort((a, b) => Math.hypot(a.p71.x - cx, a.p71.y - cy) - Math.hypot(b.p71.x - cx, b.p71.y - cy));
      const lay = sunflower(n);
      const rel = Math.sqrt(n / total);       // fragment radius / parent radius
      members.forEach((d, i) => { d.f = { x: lay[i].x * rel, y: lay[i].y * rel }; });
      // protons: Z/A of the fragment, never the captured neutron
      const nP = Math.round(n * nuc.Z / nuc.A);
      shuffle(members.filter((d) => !d.incoming)).slice(0, nP).forEach((d) => { d.proton = true; });
      groups[name] = { n, c0: { x: cx, y: cy }, rel, nuc };
    }
    // free-neutron flight directions (screen angles, mostly across the fission axis)
    const dirs = k === 3 ? [-1.15, 1.95, -2.2] : [-1.3, 1.85];
    free.forEach((d, i) => { d.dir = dirs[i]; });
    // the parent ²³⁵U has 92 protons out of 235: colour the same share among the remaining dots
    const parentP = Math.round(N_PARENT * 92 / 235);
    const have = dots.filter((d) => d.proton).length;
    if (have < parentP) {
      shuffle(dots.filter((d) => !d.proton && !d.incoming && d.group !== 'free')).slice(0, parentP - have)
        .forEach((d) => { d.proton = true; });
    }
    model = { dots, groups, nH, nL, k };
  }

  /* ---------- Geometry for the current size ---------- */
  function geometry() {
    const W = view.width, H = view.height;
    const R = Math.min(W * 0.11, H * 0.16);           // parent radius, px
    const rn = R / Math.sqrt(N_PARENT + 1) * 1.12;    // dot radius
    return { W, H, cx: W / 2, cy: H * 0.5, R, rn };
  }

  /* ---------- Positions at time t ---------- */
  function layout(g) {
    const { cx, cy, R, rn, W } = g;
    const { dots, groups } = model;
    const AH = channel.heavy.A, AL = channel.light.A;
    const out = [];
    const contactX = cx - R * Math.sqrt(N_PARENT / (N_PARENT + 1)) - rn * 1.2;
    const startX = Math.min(contactX - 40, Math.max(rn * 3, cx - W * 0.42));

    // separation of the fragment centres
    const hd = groups.heavy, ld = groups.light;
    const d0 = (ld.c0.x - hd.c0.x) * R;
    const dTouch = (hd.rel + ld.rel) * R + rn * 0.6;
    const dMax = Math.min(W * 0.62, W - 2 * (ld.rel * R + rn) - 24);
    let d = d0;
    let s4 = 0;
    if (t >= t3 && t < t4) { s4 = ease((t - t3) / T_STRETCH); d = lerp(d0, dTouch, s4); }
    if (t >= t4) { s4 = 1; d = dTouch + (dMax - dTouch) * (1 - Math.exp(-(t - t4) / 0.45)); }
    const cH = { x: cx - d * AL / (AH + AL), y: cy };
    const cL = { x: cx + d * AH / (AH + AL), y: cy };

    // wobble (phase 3): ellipsoidal oscillation with a growing amplitude
    let a = 0;
    if (t >= t2 && t < t3) {
      const u = (t - t2) / T_WOBBLE;
      a = 0.17 * u * Math.sin(TAU * 3 * u);
    }

    for (const dot of dots) {
      let x, y;
      if (t < t1) {
        if (dot.incoming) {
          const u = t < 0 ? 0 : t / T_APPROACH;
          x = lerp(startX, contactX, u); y = cy;
        } else { x = cx + dot.p70.x * R; y = cy + dot.p70.y * R; }
      } else if (t < t2) {
        const s = ease((t - t1) / T_CAPTURE);
        if (dot.incoming) {
          x = lerp(contactX, cx + dot.p71.x * R, s); y = lerp(cy, cy + dot.p71.y * R, s);
        } else {
          x = cx + lerp(dot.p70.x, dot.p71.x, s) * R; y = cy + lerp(dot.p70.y, dot.p71.y, s) * R;
        }
      } else if (t < t3) {
        x = cx + dot.p71.x * R * (1 + a); y = cy + dot.p71.y * R / (1 + a);
      } else if (dot.group === 'free') {
        const nx = cx + dot.p71.x * R, ny = cy + dot.p71.y * R;
        if (t < t4) { x = nx; y = ny; } else {
          const v = Math.max(W, 500) * 0.55;
          x = nx + Math.cos(dot.dir) * v * (t - t4); y = ny + Math.sin(dot.dir) * v * (t - t4);
        }
      } else {
        const c = dot.group === 'heavy' ? cH : cL;
        const tx = c.x + dot.f.x * R, ty = c.y + dot.f.y * R;
        x = lerp(cx + dot.p71.x * R, tx, s4); y = lerp(cy + dot.p71.y * R, ty, s4);
      }
      out.push({ dot, x, y });
    }
    return { pts: out, cH, cL };
  }

  /* ---------- Drawing ---------- */
  function drawDot(x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = alpha(COLORS.canvasBg, 0.7);
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath();
    ctx.arc(x - r * 0.32, y - r * 0.32, r * 0.38, 0, TAU);
    ctx.fill();
  }

  function render() {
    const W = view.width, H = view.height;
    if (!W || !model) return;
    const g = geometry();
    const { rn, R, cx, cy } = g;
    clear(ctx, W, H, COLORS.canvasBg);
    const { pts, cH, cL } = layout(g);
    const split = t >= t4;
    const captured = t >= t1;

    // liquid-drop body: union of halos around the bound nucleons
    ctx.beginPath();
    for (const p of pts) {
      if (p.dot.incoming && !captured) continue;
      if (p.dot.group === 'free' && split) continue;
      ctx.moveTo(p.x + rn * 1.9, p.y);
      ctx.arc(p.x, p.y, rn * 1.9, 0, TAU);
    }
    ctx.fillStyle = alpha(COLORS.text, 0.07);
    ctx.fill('nonzero');

    // energy flash at the moment of scission
    if (split && t - t4 < 0.9) {
      const u = (t - t4) / 0.9;
      const r = R * (0.6 + 2.6 * u);
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, alpha(C.flash, 0.65 * (1 - u)));
      grad.addColorStop(1, alpha(C.flash, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.fill();
    }

    // free neutrons: motion trails
    for (const p of pts) {
      const fast = p.dot.group === 'free' && split;
      const slowN = p.dot.incoming && t >= 0 && !captured;
      if (!fast && !slowN) continue;
      const len = fast ? 34 : 18;
      const ang = fast ? p.dot.dir : 0;
      const grad = ctx.createLinearGradient(p.x - Math.cos(ang) * len, p.y - Math.sin(ang) * len, p.x, p.y);
      grad.addColorStop(0, alpha(C.neutron, 0));
      grad.addColorStop(1, alpha(C.neutron, 0.6));
      ctx.strokeStyle = grad;
      ctx.lineWidth = rn * 1.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x - Math.cos(ang) * len, p.y - Math.sin(ang) * len);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }

    // nucleons, back to front
    const sorted = pts.slice().sort((a, b) => a.y - b.y);
    for (const p of sorted) drawDot(p.x, p.y, rn, p.dot.proton ? C.proton : C.nucleon);

    // ---- labels ----
    const lab = { color: COLORS.text, size: 14, weight: 600, align: 'center' };
    const sub = { color: COLORS.text3, size: 11, align: 'center' };
    if (!split) {
      const yLab = cy + R * 1.25 + 14;
      if (!captured) {
        text(ctx, `${sup(235)}U`, cx, yLab, lab);
        const n = pts.find((p) => p.dot.incoming);
        text(ctx, 'n', n.x, n.y - rn - 13, { ...lab, color: C.neutron });
        text(ctx, 'դանդաղ նեյտրոն', n.x, n.y + rn + 13, sub);
      } else {
        text(ctx, `${sup(236)}U*`, cx, yLab, lab);
        text(ctx, 'գրգռված միջուկ', cx, yLab + 17, sub);
      }
    } else {
      const ch = channel;
      const rH = model.groups.heavy.rel * R, rL = model.groups.light.rel * R;
      text(ctx, `${sup(ch.heavy.A)}${ch.heavy.sym}`, cH.x, cH.y + rH + rn + 16, lab);
      text(ctx, `${sup(ch.light.A)}${ch.light.sym}`, cL.x, cL.y + rL + rn + 16, lab);
      // velocity arrows: equal momenta → v inversely proportional to the mass
      const fade = clamp((t - t4) / 0.4, 0, 1);
      if (fade > 0) {
        const vLen = Math.min(70, W * 0.09);
        const AH = ch.heavy.A, AL = ch.light.A;
        const yA = cH.y - Math.max(rH, rL) - rn - 14;
        ctx.globalAlpha = fade;
        arrow(ctx, cH.x, yA, cH.x - vLen * AL / AH, yA, { color: COLORS.text2, width: 2, head: 7 });
        arrow(ctx, cL.x, yA, cL.x + vLen, yA, { color: COLORS.text2, width: 2, head: 7 });
        text(ctx, 'v₁', cH.x + 10, yA, { color: COLORS.text2, size: 12, style: 'italic' });
        text(ctx, 'v₂', cL.x - 10, yA, { color: COLORS.text2, size: 12, style: 'italic', align: 'right' });
        text(ctx, '≈ 200 ՄէՎ', cx, Math.max(16, cy - R * 1.6), { color: C.flash, size: 15, weight: 700, align: 'center' });
        ctx.globalAlpha = 1;
      }
      for (const p of pts) {
        if (p.dot.group !== 'free') continue;
        if (p.x < -10 || p.x > W + 10 || p.y < -10 || p.y > H + 10) continue;
        text(ctx, 'n', p.x + rn + 6, p.y - rn - 4, { color: C.neutron, size: 13, weight: 600 });
      }
    }
  }

  /* ---------- UI ---------- */
  const phaseItems = $$('#fPhases li');
  let shownPhase = -1;
  function updatePhases() {
    const ph = t < 0 ? 0 : t < t1 ? 1 : t < t2 ? 2 : t < t4 ? 3 : 4;
    if (ph === shownPhase) return;
    shownPhase = ph;
    phaseItems.forEach((li, i) => {
      li.classList.toggle('is-active', i + 1 === ph);
      li.classList.toggle('is-done', i + 1 < ph);
    });
  }

  function updateNumbers() {
    const ch = channel;
    const { dm, Q } = channelEnergy(ch);
    const m1 = M_U235 + M_N;
    const m2 = ch.heavy.m + ch.light.m + ch.neutrons * M_N;
    setText('fM1', `${fmt(m1, 4)} ա.զ.մ.`);
    setText('fM2', `${fmt(m2, 4)} ա.զ.մ.`);
    setText('fDm', `${fmt(dm, 4)} ա.զ.մ.`);
    setText('fQ', `${fmt(Q, 0)} ՄէՎ`);
    setText('fQJ', `${sci(Q * MEV_TO_J, 2)} Ջ`);
    setText('fVLabel', `v(${ch.light.sym})/v(${ch.heavy.sym})`);
    setText('fV', `${ch.heavy.A}/${ch.light.A} ≈ ${fmt(ch.heavy.A / ch.light.A, 2)}`);
    const nuc = (A, Z, s) => nuclideHTML(A, Z, s);
    const op = (s) => `<span class="op">${s}</span>`;
    setHTML('fEquation',
      `${nuc(235, 92, 'U')}${op('+')}${nuc(1, 0, 'n')}${op('→')}${nuc(236, 92, 'U*')}${op('→')}`
      + `<span class="eq-tail">${nuc(ch.heavy.A, ch.heavy.Z, ch.heavy.sym)}${op('+')}${nuc(ch.light.A, ch.light.Z, ch.light.sym)}`
      + `${op('+')}<span class="nuc">${ch.neutrons}&thinsp;</span>${nuc(1, 0, 'n')}${op('+')}<span class="nuc">${fmt(Q, 0)} ՄէՎ</span></span>`);
  }

  function reset() {
    t = -1;
    buildModel();
    updateNumbers();
    updatePhases();
    render();
  }

  bindSegmented('fChannel', {
    onChange: (v) => { channel = CHANNELS[v]; reset(); },
  });
  bindCheckbox('fSlow', { onChange: (v) => { slow = v; } });
  onClick('fFire', () => { buildModel(); t = 0; updatePhases(); });
  onClick('fReset', reset);
  onThemeChange(render);

  reset();

  return {
    show: render,
    frame(dt) {
      if (t < 0 || t >= tEnd) return;
      t = Math.min(tEnd, t + dt * (slow ? 0.3 : 1));
      updatePhases();
      render();
    },
    /** For testing: jump to an animation time. */
    _seek(time) { t = time; updatePhases(); render(); },
  };
}
