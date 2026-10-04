// Tab 2 — α-particles in the field of one nucleus (femtometre scale), or of a
// Thomson atom (a uniformly charged sphere, picometre scale).
//
// Trajectories are integrated numerically (physics.js → trace); the stats
// compare the integrated scattering angle with tan(θ/2) = d₀/(2b).
// Moving dots show where all particles of the bundle are at the same moment.

import { fluidCanvas } from '../../../assets/js/core/canvas.js';
import { bindRange, bindSelect, bindCheckbox, bindSegmented, bindPlayPause } from '../../../assets/js/core/controls.js';
import { byId, setText, setHTML } from '../../../assets/js/core/dom.js';
import { clear, line, circle, text } from '../../../assets/js/core/draw.js';
import { COLORS, themed, alpha, onThemeChange, fontsReady } from '../../../assets/js/core/theme.js';
import { DEG, TAU, clamp } from '../../../assets/js/core/math.js';
import {
  TARGETS, ATOM_R, R_ALPHA, headOnDistance, scatteringAngle, closestApproach, nuclearRadius, trace,
} from './physics.js';

// Half-size of the scene (fm) = the largest impact parameter on the slider.
const SCENE = { au: 240, ag: 150, al: 40 };
const THOMSON_SCENE = 1.1 * ATOM_R;      // 110 pm
const BUNDLE_N = 19;                     // trajectories on each side of the axis
const CROSS_TIME = 2.6;                  // s for a particle to cross the scene

const C = themed((light) => ({
  path: COLORS.red,
  pathFaint: alpha(COLORS.red, light ? 0.38 : 0.42),
  nucleus: light ? '#d0453a' : '#ff7a6b',
  sphere: light ? 'rgba(208,69,58,0.10)' : 'rgba(255,122,107,0.10)',
  sphereEdge: light ? 'rgba(208,69,58,0.45)' : 'rgba(255,122,107,0.45)',
  electron: COLORS.blue,
  angle: COLORS.amber,
  rmin: COLORS.blue,
  d0: COLORS.text3,
}));

/** Deterministic pseudo-random numbers for the electron positions. */
function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fmtDeg = (rad) => {
  const d = rad / DEG;
  return d < 0.1 ? `${d.toFixed(4)}°` : d < 1 ? `${d.toFixed(3)}°` : `${d.toFixed(2)}°`;
};
const fmtFm = (fm) => (fm >= 1000 ? `${(fm / 1000).toFixed(1)} պմ` : `${fm.toFixed(fm < 100 ? 2 : 1)} ֆմ`);

export function createNucleus({ onModel }) {
  const state = { model: 'rutherford', paused: false, s: 0 };
  let paths = null;      // computed trajectories
  let main = null;       // the trajectory for the slider's b
  let L = null;          // layout

  const thomson = () => state.model === 'thomson';

  // ---------- Controls ----------
  const model = bindSegmented('model2', { onChange: (v) => { setModel(v); onModel?.(v); } });
  const target = bindSelect('target', { onChange: () => { rescale(); } });
  const energy = bindRange('energy', { format: (v) => `${v.toFixed(1)} ՄէՎ`, onInput: recompute });
  const impact = bindRange('impact', { format: (v) => (thomson() ? `${v.toFixed(1)} պմ` : `${v.toFixed(2)} ֆմ`), onInput: recompute });
  const bundle = bindCheckbox('bundle', { onChange: recompute });
  bindPlayPause('nucPlayBtn', { onChange: (p) => { state.paused = p; } });

  const sceneHalf = () => (thomson() ? THOMSON_SCENE : SCENE[target.value]);
  /** b in fm from the slider (the slider shows pm in Thomson mode). */
  const bFm = () => (thomson() ? impact.value * 1000 : impact.value);

  function setModel(v) {
    if (v === state.model) return;
    const frac = bFm() / sceneHalf();
    state.model = v;
    model.set(v, { silent: true });
    configureSlider(frac);
  }

  function rescale() {
    configureSlider(bFm() / sceneHalf());
  }

  /** Slider range for the current scene, keeping b at the same fraction of it. */
  function configureSlider(frac) {
    const half = sceneHalf();
    const inp = impact.input;
    if (thomson()) {
      inp.max = String(half / 1000); inp.step = '0.5';
      impact.set(Math.round((frac * half) / 1000 / 0.5) * 0.5, { silent: true });
    } else {
      inp.max = String(half); inp.step = '0.05';
      impact.set(Math.round((frac * half) / 0.05) * 0.05, { silent: true });
    }
    recompute();
  }

  // ---------- Canvas ----------
  const view = fluidCanvas(byId('nucCv'), {
    height: (w) => clamp(Math.round(w * 0.62), 320, 540),
    onResize: () => { L = null; recompute(); },
  });

  function layout() {
    const { width: W, height: H } = view;
    const half = sceneHalf();
    // The nucleus sits below the middle: the slider's particles (b ≥ 0) fly above it.
    const cx = W / 2, cy = Math.round(H * (thomson() ? 0.5 : 0.64));
    const scale = Math.min((cy - 16) / half, (W / 2 - 16) / half);    // px per fm
    return { W, H, cx, cy, scale, box: { x: cx / scale, y: cy / scale } };
  }

  // ---------- Physics ----------
  function recompute() {
    if (!view.width) { paths = null; return; }
    L = layout();
    const tgt = TARGETS[target.value];
    const d0 = headOnDistance(tgt.Z, energy.value);
    const th = thomson();
    const b = bFm();
    const run = (bb) => {
      const t = trace({ b: Math.abs(bb), d0, thomson: th, box: L.box });
      return { ...t, sign: bb < 0 ? -1 : 1, b: bb };
    };
    main = run(b);
    paths = [];
    if (bundle.checked) {
      const half = sceneHalf();
      for (let i = -BUNDLE_N; i <= BUNDLE_N; i++) {
        if (i === 0) continue;
        paths.push(run((i / BUNDLE_N) * half * 0.97));
      }
      paths.push(run(0));
    }
    // time window for the animation: from entering the scene until everything has left
    const all = [main, ...paths].filter((p) => p.ts.length);
    state.s0 = Math.min(...all.map((p) => p.ts[0]));
    state.s1 = Math.max(...all.map((p) => p.ts[p.ts.length - 1]));
    if (!(state.s > state.s0 && state.s < state.s1)) state.s = state.s0;
    updateStats(d0, tgt);
  }

  function updateStats(d0, tgt) {
    const th = thomson();
    const b = bFm();
    setText('nE', `${energy.value.toFixed(1)} ՄէՎ`);
    setText('nB', fmtFm(b));
    setText('nThetaF', th ? '—' : fmtDeg(scatteringAngle(b, d0)));
    setText('nThetaS', fmtDeg(Math.abs(main.theta)));
    setText('nD0', th ? '—' : fmtFm(d0));
    setText('nRmin', th ? fmtFm(main.rmin) : fmtFm(closestApproach(b, d0)));
    const Rn = nuclearRadius(tgt.A);
    setText('nR', th ? '—' : `${Rn.toFixed(1)} ֆմ`);

    let info;
    if (th) {
      info = `<b>Թոմսոնի ատոմ</b><br>Դրական լիցքը (+${tgt.Z}e) հավասարաչափ բաշխված է ատոմի ամբողջ ծավալով (շառավիղը ≈ 100 պմ = 100 000 ֆմ), ուստի պատկերի մասշտաբը մոտ 1000 անգամ մեծ է։ Այսպիսի գնդի դաշտը շատ թույլ է. ցրման անկյունը ≈ ${fmtDeg(Math.abs(main.theta))}, և հետագծերը գործնականում ուղիղ են։ Թեթև էլեկտրոնները α-մասնիկին նույնպես չեն կարող նկատելիորեն շեղել։`;
    } else if (closestApproach(b, d0) < Rn + R_ALPHA) {
      info = `<b>α-մասնիկը դիպչում է միջուկին</b><br>r<sub>min</sub> = ${fmtFm(closestApproach(b, d0))} &lt; R + R<sub>α</sub> ≈ ${(Rn + R_ALPHA).toFixed(1)} ֆմ։ Այստեղ գործում են նաև միջուկային ուժերը, և Ռեզերֆորդի բանաձևն այլևս կիրառելի չէ (նկարում՝ միայն կուլոնյան վանումը)։`;
    } else if (b === 0) {
      info = '<b>Ճակատային բախում (b = 0)</b><br>α-մասնիկը կանգ է առնում d₀ հեռավորության վրա, որտեղ նրա կինետիկ էներգիան ամբողջությամբ վերածվում է պոտենցիալ էներգիայի, և ետ է շպրտվում (θ = 180°)։';
    } else {
      info = `<b>Կուլոնյան ցրում</b><br>Հետագիծը հիպերբոլ է։ b = ${(b / d0).toFixed(2)}·d₀, ուստի tg(θ/2) = d₀/(2b) = ${(d0 / (2 * b)).toFixed(3)}։ Որքան փոքր է b-ն, այնքան մեծ է շեղումը. 90°-ից մեծ անկյան համար պետք է b &lt; d₀/2 = ${fmtFm(d0 / 2)}։`;
    }
    setHTML('nucInfo', info);
  }

  // ---------- Drawing ----------
  const X = (x) => L.cx + x * L.scale;
  const Y = (y) => L.cy - y * L.scale;

  function polyline(ctx, p, color, width) {
    if (p.xs.length < 2) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let i = 0; i < p.xs.length; i++) {
      const x = X(p.xs[i]), y = Y(p.sign * p.ys[i]);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
  }

  /** Position on a trajectory at time s, or null if outside the scene. */
  function at(p, s) {
    const { ts } = p;
    if (!ts.length || s < ts[0] || s > ts[ts.length - 1]) return null;
    let lo = 0, hi = ts.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ts[m] <= s) lo = m; else hi = m; }
    const w = ts[hi] > ts[lo] ? (s - ts[lo]) / (ts[hi] - ts[lo]) : 0;
    return { x: p.xs[lo] + w * (p.xs[hi] - p.xs[lo]), y: p.sign * (p.ys[lo] + w * (p.ys[hi] - p.ys[lo])) };
  }

  function scaleBar(ctx) {
    const half = sceneHalf();
    const th = thomson();
    const nice = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
    const want = half * 0.4;
    const len = nice.reduce((best, v) => (v <= want ? v : best), nice[0]);
    const px = len * L.scale;
    const x0 = 14, y0 = L.H - 16;
    line(ctx, x0, y0, x0 + px, y0, { color: COLORS.text2, width: 1.5 });
    line(ctx, x0, y0 - 4, x0, y0 + 4, { color: COLORS.text2, width: 1.5 });
    line(ctx, x0 + px, y0 - 4, x0 + px, y0 + 4, { color: COLORS.text2, width: 1.5 });
    text(ctx, th ? `${len / 1000} պմ` : `${len} ֆմ`, x0 + px / 2, y0 - 10, { color: COLORS.text2, size: 11, family: 'mono', align: 'center' });
  }

  function draw() {
    const { ctx } = view;
    if (!view.width) return;
    if (!L || !paths) recompute();
    if (!paths) return;
    const { W, H, cx, cy, scale } = L;
    const tgt = TARGETS[target.value];
    const d0 = headOnDistance(tgt.Z, energy.value);
    const th = thomson();
    clear(ctx, W, H, COLORS.canvasBg);

    // Axis of the incoming beam
    line(ctx, 0, cy, W, cy, { color: COLORS.grid, width: 1 });

    if (th) {
      // Thomson atom: diffuse positive sphere with electrons in it
      const rr = ATOM_R * scale;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
      g.addColorStop(0, alpha(C.nucleus, 0.22));
      g.addColorStop(1, alpha(C.nucleus, 0.08));
      circle(ctx, cx, cy, rr, { fill: g, stroke: C.sphereEdge, width: 1.2 });
      const rnd = mulberry(tgt.Z * 7919);
      for (let i = 0; i < tgt.Z; i++) {
        const r = rr * Math.sqrt(rnd()) * 0.94, a = rnd() * TAU;
        circle(ctx, cx + r * Math.cos(a), cy + r * Math.sin(a), 2, { fill: C.electron });
      }
      text(ctx, `+${tgt.Z}e`, cx + rr * 0.72, cy - rr * 0.78, { color: C.nucleus, size: 12, family: 'mono', align: 'center' });
    } else {
      // d₀ circle
      ctx.save();
      ctx.setLineDash([3, 4]);
      circle(ctx, cx, cy, d0 * scale, { stroke: alpha(C.d0, 0.7), width: 1 });
      ctx.restore();
      text(ctx, 'd₀', cx - d0 * scale * 0.71 - 4, cy + d0 * scale * 0.71 + 8, { color: C.d0, size: 11, family: 'mono', align: 'right' });
    }

    // Trajectories
    ctx.save();
    ctx.lineJoin = 'round';
    for (const p of paths) polyline(ctx, p, C.pathFaint, 1.2);
    polyline(ctx, main, C.path, 2.2);
    ctx.restore();

    // Nucleus (to scale, but at least a few pixels)
    if (!th) {
      const rn = Math.max(3.5, nuclearRadius(tgt.A) * scale);
      circle(ctx, cx, cy, rn, { fill: C.nucleus });
      text(ctx, `+${tgt.Z}e`, cx + rn + 5, cy + 12, { color: C.nucleus, size: 11, family: 'mono' });
    }

    const b = bFm();
    // Impact parameter marker on the left
    if (b * scale > 6) {
      const xb = 22;
      line(ctx, xb, cy, xb, Y(b), { color: COLORS.text2, width: 1 });
      line(ctx, xb - 4, cy, xb + 4, cy, { color: COLORS.text2, width: 1 });
      line(ctx, xb - 4, Y(b), xb + 4, Y(b), { color: COLORS.text2, width: 1 });
      text(ctx, 'b', xb + 7, (cy + Y(b)) / 2, { color: COLORS.text2, size: 12, style: 'italic' });
    }

    // Closest approach and scattering angle (nuclear model)
    if (!th && main.xs.length) {
      let k = 0, best = Infinity;
      for (let i = 0; i < main.xs.length; i++) {
        const r = Math.hypot(main.xs[i], main.ys[i]);
        if (r < best) { best = r; k = i; }
      }
      const px = X(main.xs[k]), py = Y(main.ys[k]);
      line(ctx, cx, cy, px, py, { color: C.rmin, width: 1.5, dash: [4, 3] });
      circle(ctx, px, py, 3.5, { fill: C.rmin });
      const len = Math.hypot(px - cx, py - cy);
      if (len > 18) {
        const ux = (px - cx) / len, uy = (py - cy) / len;
        text(ctx, 'r', cx + ux * len * 0.5 - uy * 11, cy + uy * len * 0.5 + ux * 11 - 1,
          { color: C.rmin, size: 12, style: 'italic', align: 'center' });
      }

      // asymptotes: incoming line y = b and the outgoing direction θ
      const theta = main.theta;
      if (Math.abs(Math.sin(theta)) > 0.01) {
        const n = main.xs.length - 1;
        const xe = main.xs[n], ye = main.ys[n];
        const xi = xe - (ye - b) * Math.cos(theta) / Math.sin(theta);   // where the asymptotes cross
        const ix = X(xi), iy = Y(b);
        const reach = Math.max(W, H);
        line(ctx, ix, iy, ix + reach, iy, { color: alpha(C.angle, 0.6), width: 1, dash: [5, 4] });
        line(ctx, ix, iy, ix + reach * Math.cos(theta), iy - reach * Math.sin(theta), { color: alpha(C.angle, 0.6), width: 1, dash: [5, 4] });
        const ra = 30;
        ctx.save();
        ctx.strokeStyle = C.angle;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ix, iy, ra, -theta, 0);
        ctx.stroke();
        ctx.restore();
        const below = Math.abs(theta) < 35 * DEG;
        const lx = clamp(ix + ra + 8, 8, W - 90), ly = clamp(iy + (below ? 13 : -12), 14, H - 14);
        text(ctx, `θ = ${(Math.abs(theta) / DEG).toFixed(1)}°`, lx, ly, { color: C.angle, size: 12, family: 'mono', weight: 600 });
      }
    }

    // Moving particles
    const all = bundle.checked ? [...paths, main] : [main];
    for (const p of all) {
      const q = at(p, state.s);
      if (q) circle(ctx, X(q.x), Y(q.y), p === main ? 4.5 : 3, { fill: C.path, stroke: COLORS.canvasBg, width: 1 });
    }

    scaleBar(ctx);
    text(ctx, th ? 'Թոմսոնի մոդել · պիկոմետրեր' : `${tgt.name} · ֆեմտոմետրեր`, W - 12, H - 14,
      { color: COLORS.text3, size: 11, align: 'right' });
  }

  onThemeChange(draw);
  fontsReady().then(draw);
  recompute();

  return {
    setModel,
    frame(dt) {
      if (!state.paused && paths) {
        const speed = (2 * L.box.x) / CROSS_TIME;
        state.s += dt * speed;
        if (state.s > state.s1 + 0.3 * speed) state.s = state.s0;
      }
      draw();
    },
    draw() { L = null; recompute(); draw(); },
    _main: () => main,
  };
}
