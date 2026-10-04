// Tab 2 — penetrating power: three parallel beams (α, β, γ) through air and a stack
// of absorbers (paper, aluminium, lead) to Geiger counters.
//
// The air gap is drawn to scale (cm ruler); the absorber slabs are not (their real
// thicknesses differ by 10⁴). Each dot is one sampled particle: its stopping depth is
// drawn from the attenuation profile in physics.js, so the fraction of dots that
// reach a counter equals the transmitted intensity.

import { fluidCanvas } from '../../../assets/js/core/canvas.js';
import { bindRange, bindCheckbox } from '../../../assets/js/core/controls.js';
import { byId, setHTML } from '../../../assets/js/core/dom.js';
import { clear, line, circle, text, roundRect } from '../../../assets/js/core/draw.js';
import { COLORS, themed, alpha, onThemeChange, fontsReady, font } from '../../../assets/js/core/theme.js';
import { clamp, rand } from '../../../assets/js/core/math.js';
import {
  TYPES, PAPER_CM, ALPHA_RANGE_AIR, HVL_LEAD,
  buildLayers, passage, gammaLead,
} from './physics.js';
import { fmtPct, fmtSig } from './format.js';

const N0 = 1000;              // counts per second without absorbers (per beam)
const DOT_RATE = 9;           // drawn dots per second per beam (a small sample)
const SYMBOL = { alpha: 'α', beta: 'β', gamma: 'γ' };

const C = themed((light) => ({
  alpha: COLORS.coral,
  beta: COLORS.blue,
  gamma: COLORS.green,
  lead: light ? '#8b91a2' : '#4a5164',
  leadEdge: light ? '#5f6578' : '#6b7390',
  paper: light ? '#e9dfbf' : '#d8ccA6',
  paperEdge: light ? '#b6a777' : '#efe3bf',
  al: light ? '#c9d0db' : '#8e98aa',
  alEdge: light ? '#8f99aa' : '#b9c2d2',
  pb: light ? '#5d6274' : '#3b4152',
  pbEdge: light ? '#3f4455' : '#717a95',
  tube: light ? '#eef1f7' : '#1d2334',
  tubeEdge: COLORS.axis,
}));

export function createPenetration() {
  const view = fluidCanvas(byId('penCv'), {
    height: (w) => clamp(Math.round(w * 0.46), 270, 400),
  });
  const chart = fluidCanvas(byId('gammaChart'), {
    height: (w) => clamp(Math.round(w * 0.34), 190, 260),
    onResize: () => { chartDirty = true; },
  });
  const { ctx } = view;

  let chartDirty = true;
  let setup = null;     // { layers, end }
  let pass = {};        // type → passage()
  const dots = { alpha: [], beta: [], gamma: [] };
  const acc = { alpha: 0, beta: 0, gamma: 0 };
  const flash = { alpha: 0, beta: 0, gamma: 0 };

  // ---------- Controls ----------
  const air = bindRange('airGap', { format: (v) => `${v.toFixed(1)} սմ`, onInput: changed });
  const alT = bindRange('alThick', { format: (v) => `${v.toFixed(1)} մմ`, onInput: changed });
  const pbT = bindRange('pbThick', { format: (v) => `${v.toFixed(1)} սմ`, onInput: changed });
  const usePaper = bindCheckbox('usePaper', { onChange: changed });
  const useAl = bindCheckbox('useAl', { onChange: changed });
  const usePb = bindCheckbox('usePb', { onChange: changed });

  function thicknesses() {
    return {
      air: air.value,
      paper: usePaper.checked ? PAPER_CM : 0,
      al: useAl.checked ? alT.value / 10 : 0,
      pb: usePb.checked ? pbT.value : 0,
    };
  }

  function changed() {
    alT.input.disabled = !useAl.checked;
    pbT.input.disabled = !usePb.checked;
    setup = buildLayers(thicknesses());
    for (const t of TYPES) pass[t] = passage(t, setup);
    // Dots in flight meet the new absorbers: give each a new stopping depth.
    const g = geometry(view.width, view.height);
    for (const t of TYPES) for (const d of dots[t]) assignStop(d, t, g);
    updateReadouts();
    chartDirty = true;
  }

  // ---------- Geometry ----------
  function geometry(W, H) {
    const xs = Math.round(clamp(W * 0.07, 40, 70));
    const kAir = (W * (W < 600 ? 0.40 : 0.46)) / 10;                  // px per cm of air
    const segs = [];
    let px = xs;
    for (const l of setup.layers) {
      const t = l.x1 - l.x0;
      const w = l.id === 'air' ? t * kAir
        : l.id === 'paper' ? 3
          : l.id === 'al' ? 4 + (t / 0.5) * 0.06 * W
            : 5 + (t / 10) * 0.18 * W;
      segs.push({ ...l, p0: px, p1: px + w });
      px += w;
    }
    const xc = px + 6;
    const cw = clamp(W * 0.05, 30, 46);
    const top = 34;
    const bottom = H - 50;
    const rowH = (bottom - top) / 3;
    const beamY = TYPES.map((_, i) => top + rowH * (i + 0.5));
    const toPx = (x) => {
      if (!Number.isFinite(x)) return xc;
      for (const s of segs) if (x <= s.x1) return s.p0 + ((x - s.x0) / (s.x1 - s.x0)) * (s.p1 - s.p0);
      return xc;
    };
    return { W, H, xs, kAir, segs, xc, cw, top, bottom, rowH, beamY, toPx };
  }

  function assignStop(d, t, g) {
    const x = pass[t].sampleStop();
    d.pass = !Number.isFinite(x);
    d.stopPx = g.toPx(x);
    if (d.px >= d.stopPx && !d.pass) d.dying = d.dying || 0.001;
  }

  // ---------- Readouts ----------
  const RO = { alpha: 'penAlpha', beta: 'penBeta', gamma: 'penGamma' };
  const COLOR_VAR = { alpha: 'var(--coral)', beta: 'var(--blue)', gamma: 'var(--green)' };
  const WHERE = {
    air: 'կանգնում է օդում (վազքը ≈ 3.6 սմ)',
    paper: 'կանգնում է թղթի թերթում',
    al: 'կլանվում է ալյումինում',
    pb: 'կլանվում է կապարում',
  };

  function note(t) {
    const p = pass[t];
    const th = thicknesses();
    if (p.stopLayer) {
      if (t === 'beta' && p.stopLayer === 'al') return 'կլանվում է ալյումինում (վազքը ≈ 1.5 մմ)';
      return WHERE[p.stopLayer];
    }
    if (t === 'alpha') return 'անցնում է՝ օդի շերտը վազքից փոքր է';
    if (t === 'beta') return p.transmitted > 0.5 ? 'մեծ մասն անցնում է' : 'մեծ մասը կլանվում է';
    if (th.pb > 0) return `թուլանում է. կապարում՝ ${fmtSig(th.pb / HVL_LEAD, 3)} x<sub>½</sub>`;
    return 'անցնում է գրեթե առանց թուլանալու';
  }

  function updateReadouts() {
    for (const t of TYPES) {
      const T = pass[t].transmitted;
      const rate = T > 0 && T * N0 < 1 ? fmtSig(T * N0, 2) : Math.round(T * N0);
      setHTML(RO[t], `Անցնում է՝ <b>${fmtPct(T)}</b>`
        + `<div class="bar" style="--c: ${COLOR_VAR[t]}"><i style="--p: ${(T * 100).toFixed(2)}%"></i></div>`
        + `Հաշվիչ՝ <b>${rate} իմպ/վ</b> (առանց կլանիչի՝ ${N0})<br>${note(t)}`);
    }
  }

  // ---------- Animation ----------
  function step(dt, g) {
    const speed = g.W * 0.24;
    for (const [i, t] of TYPES.entries()) {
      flash[t] *= Math.exp(-dt * 7);
      acc[t] += DOT_RATE * dt;
      while (acc[t] >= 1) {
        acc[t] -= 1;
        const d = { px: g.xs - rand(0, 6), y: g.beamY[i] + rand(-2.5, 2.5), dying: 0 };
        assignStop(d, t, g);
        dots[t].push(d);
      }
      for (const d of dots[t]) {
        if (d.dying) { d.dying += dt; continue; }
        d.px += speed * dt;
        if (d.px >= d.stopPx) {
          d.px = d.stopPx;
          if (d.pass) { d.done = true; flash[t] = 1; } else d.dying = 0.001;
        }
      }
      dots[t] = dots[t].filter((d) => !d.done && d.dying < 0.5);
    }
  }

  // ---------- Drawing ----------
  function drawSlabs(g) {
    const y0 = g.top - 4, y1 = g.bottom + 2;
    for (const s of g.segs) {
      if (s.id === 'air') continue;
      ctx.fillStyle = C[s.id];
      ctx.strokeStyle = C[`${s.id}Edge`];
      ctx.lineWidth = 1;
      ctx.fillRect(s.p0, y0, s.p1 - s.p0, y1 - y0);
      ctx.strokeRect(s.p0 + 0.5, y0 + 0.5, s.p1 - s.p0 - 1, y1 - y0 - 1);
    }
  }

  function drawBeams(g) {
    for (const [i, t] of TYPES.entries()) {
      const y = g.beamY[i];
      const p = pass[t];
      for (const s of g.segs) {
        for (let px = s.p0; px < s.p1; px += 2) {
          const x = s.x0 + ((px + 1 - s.p0) / (s.p1 - s.p0)) * (s.x1 - s.x0);
          const I = p.intensity(x);
          if (I <= 0) break;
          ctx.fillStyle = alpha(C[t], 0.06 + 0.3 * I);
          ctx.fillRect(px, y - 4, 2, 8);
        }
      }
      if (p.transmitted > 0) {
        ctx.fillStyle = alpha(C[t], 0.06 + 0.3 * p.transmitted);
        ctx.fillRect(g.segs.at(-1).p1, y - 4, g.xc - g.segs.at(-1).p1, 8);
      }
    }
  }

  function drawDots() {
    for (const t of TYPES) {
      for (const d of dots[t]) {
        if (d.dying) {
          const a = 1 - d.dying / 0.5;
          circle(ctx, d.px, d.y, 2 + d.dying * 14, { stroke: alpha(C[t], 0.8 * a), width: 1.2 });
        } else {
          circle(ctx, d.px, d.y, t === 'alpha' ? 3 : 2.3, { fill: C[t] });
        }
      }
    }
  }

  function drawSource(g) {
    ctx.fillStyle = C.lead;
    ctx.strokeStyle = C.leadEdge;
    ctx.lineWidth = 1;
    roundRect(ctx, 8, g.top - 4, g.xs - 8, g.bottom - g.top + 6, 4);
    ctx.fill();
    ctx.stroke();
    for (const [i, t] of TYPES.entries()) {
      const y = g.beamY[i];
      ctx.fillStyle = COLORS.canvasBg;
      ctx.fillRect(g.xs - 14, y - 3, 15, 6);
      circle(ctx, g.xs - 14, y, 3.2, { fill: C[t] });
      text(ctx, SYMBOL[t], (8 + g.xs - 16) / 2, y, { color: '#fff', size: 15, weight: 700, align: 'center' });
    }
  }

  function drawCounters(g) {
    for (const [i, t] of TYPES.entries()) {
      const y = g.beamY[i];
      const h = clamp(g.rowH * 0.42, 16, 26);
      ctx.fillStyle = C.tube;
      ctx.strokeStyle = C.tubeEdge;
      ctx.lineWidth = 1.2;
      roundRect(ctx, g.xc, y - h / 2, g.cw, h, h / 2);
      ctx.fill();
      ctx.stroke();
      if (flash[t] > 0.02) {
        ctx.fillStyle = alpha(C[t], 0.75 * flash[t]);
        roundRect(ctx, g.xc, y - h / 2, g.cw, h, h / 2);
        ctx.fill();
      }
      line(ctx, g.xc + 3, y - h / 2 + 3, g.xc + 3, y + h / 2 - 3, { color: COLORS.text2, width: 2 });   // window
      line(ctx, g.xc + 8, y, g.xc + g.cw - 6, y, { color: COLORS.text3, width: 1 });                    // anode wire
      const room = g.W - (g.xc + g.cw) - 8;
      if (room > 46) {
        text(ctx, fmtPct(pass[t].transmitted), g.xc + g.cw + 8, y, { color: C[t], size: 12, weight: 600, family: 'mono' });
      }
    }
  }

  /** Labels in one row above the scene, pushed right so they never overlap. */
  function drawTopLabels(g) {
    const items = [];
    const ar = g.xs + ALPHA_RANGE_AIR * g.kAir;
    if (setup.layers[0].x1 >= ALPHA_RANGE_AIR) items.push({ x: ar, txt: 'α-ի վազքը', col: C.alpha });
    for (const s of g.segs) {
      if (s.id === 'paper') items.push({ x: (s.p0 + s.p1) / 2, txt: 'թուղթ', col: COLORS.text2 });
      if (s.id === 'al') items.push({ x: (s.p0 + s.p1) / 2, txt: `Al ${fmtSig((s.x1 - s.x0) * 10, 2)} մմ`, col: COLORS.text2 });
      if (s.id === 'pb') items.push({ x: (s.p0 + s.p1) / 2, txt: `Pb ${(s.x1 - s.x0).toFixed(1)} սմ`, col: COLORS.text2 });
    }
    items.push({ x: g.xc + g.cw / 2, txt: 'հաշվիչներ', col: COLORS.text3 });
    ctx.font = font(11);
    let right = -Infinity;
    for (const it of items) {
      it.w = ctx.measureText(it.txt).width;
      it.x0 = Math.max(it.x - it.w / 2, right + 8, 4);
      right = it.x0 + it.w;
    }
    // then pull back from the right edge, keeping the gaps
    let limit = g.W - 4;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      it.x0 = Math.min(it.x0, limit - it.w);
      limit = it.x0 - 8;
    }
    for (const it of items) text(ctx, it.txt, it.x0, 14, { color: it.col, size: 11 });
    // α range marker on the air ruler and across the α beam
    if (setup.layers[0].x1 >= ALPHA_RANGE_AIR) {
      line(ctx, ar, 22, ar, g.beamY[0] + 10, { color: alpha(C.alpha, 0.7), width: 1, dash: [3, 3] });
    }
  }

  function drawRuler(g) {
    const y = g.H - 30;
    const a = setup.layers[0].x1;
    const x1 = g.xs + a * g.kAir;
    line(ctx, g.xs, y, x1, y, { color: COLORS.axis, width: 1 });
    const every = g.kAir >= 26 ? 1 : 2;
    for (let c = 0; c <= a + 1e-9; c += 1) {
      const x = g.xs + c * g.kAir;
      const major = c % every === 0;
      line(ctx, x, y, x, y + (major ? 6 : 3), { color: COLORS.axis, width: 1 });
      if (major) text(ctx, String(c), x, y + 14, { color: COLORS.text3, size: 10, family: 'mono', align: 'center' });
    }
    line(ctx, x1, y - 4, x1, y + 4, { color: COLORS.axis, width: 1 });
    text(ctx, 'օդ, սմ', g.xs, y - 9, { color: COLORS.text3, size: 10 });
  }

  function draw(dt) {
    const { width: W, height: H } = view;
    if (!W) return;
    const g = geometry(W, H);
    step(dt, g);
    clear(ctx, W, H, COLORS.canvasBg);
    drawSlabs(g);
    drawBeams(g);
    drawDots();
    drawSource(g);
    drawCounters(g);
    drawTopLabels(g);
    drawRuler(g);
    if (chartDirty) { chartDirty = false; drawChart(); }
  }

  // ---------- Chart: γ intensity behind lead ----------
  function drawChart() {
    const { ctx: c, width: W, height: H } = chart;
    if (!W) return;
    clear(c, W, H, COLORS.canvasBg);
    const pl = 48, pr = 14, pt = 16, pb = 34;
    const X = (x) => pl + (x / 10) * (W - pl - pr);
    const Y = (f) => pt + (1 - f) * (H - pt - pb);

    // grid + axes
    for (let f = 0; f <= 1.0001; f += 0.25) {
      line(c, pl, Y(f), W - pr, Y(f), { color: COLORS.grid, width: 1 });
      text(c, `${Math.round(f * 100)}`, pl - 6, Y(f), { color: COLORS.text3, size: 10, family: 'mono', align: 'right' });
    }
    const xEvery = W < 480 ? 2 : 1;
    for (let x = 0; x <= 10; x += xEvery) {
      line(c, X(x), pt, X(x), H - pb, { color: COLORS.grid, width: 1 });
      text(c, String(x), X(x), H - pb + 12, { color: COLORS.text3, size: 10, family: 'mono', align: 'center' });
    }
    line(c, pl, H - pb, W - pr, H - pb, { color: COLORS.axis, width: 1 });
    line(c, pl, pt, pl, H - pb, { color: COLORS.axis, width: 1 });
    text(c, 'կապարի հաստությունը x, սմ', W - pr, H - 6, { color: COLORS.text3, size: 11, align: 'right' });
    c.save();
    c.translate(12, (pt + H - pb) / 2);
    c.rotate(-Math.PI / 2);
    text(c, 'I / I₀, %', 0, 0, { color: COLORS.text3, size: 11, align: 'center' });
    c.restore();

    // half-value layers
    for (let n = 1; n <= 4; n++) {
      const x = n * HVL_LEAD, f = 0.5 ** n;
      line(c, X(0), Y(f), X(x), Y(f), { color: alpha(COLORS.text3, 0.6), width: 1, dash: [3, 4] });
      line(c, X(x), Y(f), X(x), Y(0), { color: alpha(COLORS.text3, 0.6), width: 1, dash: [3, 4] });
      circle(c, X(x), Y(f), 2.5, { fill: COLORS.text3 });
      if (n <= 3 && W >= 360) {
        text(c, `${n === 1 ? '' : n}x½`, X(x) + 4, Y(f) - 9, { color: COLORS.text2, size: 10, family: 'mono' });
      }
    }

    // curve
    c.save();
    c.strokeStyle = C.gamma;
    c.lineWidth = 2;
    c.beginPath();
    for (let i = 0; i <= 200; i++) {
      const x = (i / 200) * 10;
      i ? c.lineTo(X(x), Y(gammaLead(x))) : c.moveTo(X(x), Y(gammaLead(x)));
    }
    c.stroke();
    c.restore();

    // current lead thickness
    const xNow = usePb.checked ? pbT.value : 0;
    const fNow = gammaLead(xNow);
    circle(c, X(xNow), Y(fNow), 5, { fill: C.gamma, stroke: COLORS.canvasBg, width: 2 });
    text(c, `x = ${xNow.toFixed(1)} սմ → I/I₀ = ${fmtPct(fNow)}`, W - pr - 4, pt + 4, {
      color: COLORS.text, size: 11, family: 'mono', align: 'right',
    });
  }

  onThemeChange(() => { chartDirty = true; });
  fontsReady().then(() => { chartDirty = true; });

  setup = buildLayers(thicknesses());
  changed();

  return {
    frame(dt) { draw(dt); },
  };
}
