// Heat engine — Carnot, rectangular and Otto cycles of 1 mol of a monatomic
// ideal gas. The state on each stage is exact (physics.js); the molecules,
// the flywheel and the sliding reservoirs only illustrate it.
// Units: p in kPa, V in litres, T in K, energies in J (1 kPa·l = 1 J).

import { fluidCanvas, pointerPos } from '../../../assets/js/core/canvas.js';
import { bindRange, bindSegmented, bindPlayPause, onClick } from '../../../assets/js/core/controls.js';
import { byId, $, setText, setHTML } from '../../../assets/js/core/dom.js';
import { startLoop } from '../../../assets/js/core/loop.js';
import { clear, line, arrow, circle, text, roundRect } from '../../../assets/js/core/draw.js';
import { COLORS, themed, alpha, font } from '../../../assets/js/core/theme.js';
import { clamp, lerp, TAU } from '../../../assets/js/core/math.js';
import { R, CV, GAMMA, carnot, rectangle, otto, createGas, DISC_R } from './physics.js';

const DUR_RUN = 2.6;      // s per stage at speed 1
const DUR_MOVE = 0.6;     // s to slide the reservoirs
const V_RMS_300 = 1.5;    // molecule rms speed at 300 K, cylinder widths per second

const C = themed((light) => ({
  hot: COLORS.red,
  cold: COLORS.blue,
  adiabat: COLORS.purple,
  mid: COLORS.purple,
  area: COLORS.amber,
  work: COLORS.green,
  point: COLORS.coral,
  wall: light ? '#7d88a6' : '#5b6688',
  metal: light ? '#9aa4bf' : '#78839f',
  piston: light ? '#b9c1d6' : '#8791b3',
  pistonEdge: light ? '#5f6a8a' : '#c3cbe6',
  rod: light ? '#4d5775' : '#b4bcd8',
  wheel: light ? '#6a7493' : '#9aa4c4',
  pillBg: light ? 'rgba(252,253,255,0.88)' : 'rgba(11,14,23,0.85)',
}));

// ---------- Texts ----------
const CYCLES = {
  carnot: {
    box: '<b>Կառնոյի ցիկլ</b> · 2 իզոթերմ + 2 ադիաբատ<br>Իդեալական ջերմային մեքենայի ցիկլը։ Տրված T₁ և T₂ ջերմաստիճանների միջև այն ունի հնարավոր ամենամեծ ՕԳԳ-ն։',
    stages: [
      ['1→2 իզոթերմ ընդարձակում', 'Գազը հպված է տաքացուցիչին և ընդարձակվում է հաստատուն T₁ ջերմաստիճանում։ ΔU = 0, ուստի ստացած ամբողջ Q₁ ջերմաքանակը ծախսվում է աշխատանքի վրա։'],
      ['2→3 ադիաբատ ընդարձակում', 'Գազը ջերմամեկուսացված է (Q = 0) և շարունակում է ընդարձակվել՝ աշխատանք կատարելով իր ներքին էներգիայի հաշվին։ Ջերմաստիճանն իջնում է T₁-ից մինչև T₂։'],
      ['3→4 իզոթերմ սեղմում', 'Գազը հպված է սառնարանին և սեղմվում է հաստատուն T₂ ջերմաստիճանում։ Արտաքին ուժերի աշխատանքն ամբողջությամբ անցնում է սառնարանին՝ |Q₂| ջերմաքանակի ձևով։'],
      ['4→1 ադիաբատ սեղմում', 'Գազը կրկին ջերմամեկուսացված է և սեղմվում է։ Արտաքին ուժերի աշխատանքը մեծացնում է ներքին էներգիան, ջերմաստիճանը T₂-ից բարձրանում է մինչև T₁, և գազը վերադառնում է 1 վիճակ։'],
    ],
  },
  rect: {
    box: '<b>Ուղղանկյուն ցիկլ</b> · 2 իզոխոր + 2 իզոբար<br>p–V դիագրամում ուղղանկյուն է, և A = (p₂ − p₁)(V₂ − V₁)։ Գազը ջերմաքանակ է ստանում 1→2 և 2→3 փուլերում, տալիս է՝ 3→4 և 4→1 փուլերում։',
    stages: [
      ['1→2 իզոխոր տաքացում', 'Մխոցն անշարժ է (V = const), գազը տաքանում է։ A = 0, և ստացած ջերմաքանակն ամբողջությամբ մեծացնում է ներքին էներգիան՝ Q = ΔU = C<sub>V</sub>ΔT։'],
      ['2→3 իզոբար ընդարձակում', 'Գազը տաքանում և ընդարձակվում է հաստատուն ճնշման տակ։ Ջերմաքանակի մի մասը ծախսվում է աշխատանքի վրա (A = pΔV), մնացածը՝ ներքին էներգիայի աճի․ Q = C<sub>p</sub>ΔT։'],
      ['3→4 իզոխոր սառեցում', 'Մխոցն անշարժ է, գազը սառչում է՝ ջերմաքանակ տալով սառնարանին։ A = 0, Q = ΔU &lt; 0։'],
      ['4→1 իզոբար սեղմում', 'Գազը սառչում և սեղմվում է հաստատուն ճնշման տակ՝ ջերմաքանակ տալով սառնարանին․ Q = C<sub>p</sub>ΔT &lt; 0, A = pΔV &lt; 0։'],
    ],
  },
  otto: {
    box: '<b>Օտտոյի ցիկլ</b> · 2 ադիաբատ + 2 իզոխոր<br>Ներքին այրման (բենզինային) շարժիչի պարզեցված մոդելը։ Տաքացումը վառելիքի այրումն է, սառեցումը՝ այրված գազերի արտանետումը։',
    stages: [
      ['1→2 ադիաբատ սեղմում', 'Աշխատանքային խառնուրդի սեղմումը։ Q = 0, արտաքին ուժերի աշխատանքը մեծացնում է ներքին էներգիան, և ջերմաստիճանը բարձրանում է։'],
      ['2→3 իզոխոր տաքացում', 'Վառելիքի այրումը։ Մխոցը չի հասցնում շարժվել (A = 0), և գազը ստանում է Q₁ = C<sub>V</sub>(T₃ − T₂) ջերմաքանակ։'],
      ['3→4 ադիաբատ ընդարձակում', 'Աշխատանքային քայլը։ Գազը կատարում է աշխատանք իր ներքին էներգիայի հաշվին, ջերմաստիճանն իջնում է։'],
      ['4→1 իզոխոր սառեցում', 'Այրված գազերի արտանետումը։ Գազը տալիս է |Q₂| = C<sub>V</sub>(T₄ − T₁) ջերմաքանակ, և ցիկլը փակվում է։'],
    ],
  },
};
const CONTACT_NAME = { hot: 'տաքացուցիչը', ins: 'ջերմամեկուսիչ տակդիրը', cold: 'սառնարանը' };

// ---------- Formatting ----------
const fJ = (v) => { const r = Math.round(v); return r === 0 ? '0' : String(r).replace('-', '−'); };
const fJs = (v) => { const r = Math.round(v); return r === 0 ? '0' : (r > 0 ? '+' : '−') + Math.abs(r); };
const fT = (T) => (Math.abs(T - Math.round(T)) < 0.05 ? T.toFixed(0) : T.toFixed(1));
const fP = (p) => (p >= 1000 ? p.toFixed(0) : p.toFixed(1));
const fV = (V) => V.toFixed(V < 10 ? 2 : 1);
const fPct = (x) => `${(x * 100).toFixed(1)} %`;

// ---------- Parameters and controls ----------
const params = {
  carnot: { T1: 600, T2: 300, V1: 10, V2: 20 },
  rect: { p1: 100, p2: 200, V1: 10, V2: 20 },
  otto: { T1: 300, T3: 1500, V1: 30, r: 6 },
};
let type = 'carnot';
let cycle = null;
let timeline = null;
const warn = { carnot: '', rect: '', otto: '' };

const K = (v) => `${v.toFixed(0)} Կ`;
const SLIDERS = {
  carnot: {
    T1: ['cT1', K], T2: ['cT2', K],
    V1: ['cV1', (v) => `${v.toFixed(1)} լ`], V2: ['cV2', (v) => `${v.toFixed(1)} լ`],
  },
  rect: {
    p1: ['rP1', (v) => `${v.toFixed(0)} կՊա`], p2: ['rP2', (v) => `${v.toFixed(0)} կՊա`],
    V1: ['rV1', (v) => `${v.toFixed(0)} լ`], V2: ['rV2', (v) => `${v.toFixed(0)} լ`],
  },
  otto: {
    T1: ['oT1', K], T3: ['oT3', K],
    V1: ['oV1', (v) => `${v.toFixed(0)} լ`], r: ['oR', (v) => v.toFixed(1)],
  },
};

/** Keeps every parameter set physically meaningful; returns a warning or ''. */
function constrain(t, key) {
  const P = params[t];
  if (t === 'carnot') {
    if (key === 'T1' && P.T2 > P.T1 - 50) { P.T2 = P.T1 - 50; return 'T₂-ը պետք է փոքր լինի T₁-ից. T₂-ը նույնպես իջեցվեց։'; }
    if (key === 'T2' && P.T1 < P.T2 + 50) { P.T1 = P.T2 + 50; return 'T₁-ը պետք է մեծ լինի T₂-ից. T₁-ը նույնպես բարձրացվեց։'; }
    if (key === 'V1' && P.V2 < P.V1 + 2) { P.V2 = P.V1 + 2; return 'V₂-ը պետք է մեծ լինի V₁-ից։'; }
    if (key === 'V2' && P.V1 > P.V2 - 2) { P.V1 = P.V2 - 2; return 'V₁-ը պետք է փոքր լինի V₂-ից։'; }
  } else if (t === 'rect') {
    if (key === 'p1' && P.p2 < P.p1 + 20) { P.p2 = P.p1 + 20; return 'p₂-ը պետք է մեծ լինի p₁-ից։'; }
    if (key === 'p2' && P.p1 > P.p2 - 20) { P.p1 = P.p2 - 20; return 'p₁-ը պետք է փոքր լինի p₂-ից։'; }
    if (key === 'V1' && P.V2 < P.V1 + 2) { P.V2 = P.V1 + 2; return 'V₂-ը պետք է մեծ լինի V₁-ից։'; }
    if (key === 'V2' && P.V1 > P.V2 - 2) { P.V1 = P.V2 - 2; return 'V₁-ը պետք է փոքր լինի V₂-ից։'; }
  } else {
    // T3 must exceed the temperature after the adiabatic compression.
    const T2 = P.T1 * P.r ** (GAMMA - 1);
    const minT3 = Math.ceil((T2 + 50) / 50) * 50;
    if (P.T3 < minT3) {
      P.T3 = minT3;
      return `T₃-ը պետք է մեծ լինի սեղմումից հետո ստացվող T₂ = ${T2.toFixed(0)} Կ ջերմաստիճանից։`;
    }
  }
  return '';
}

const handles = {};
for (const [t, map] of Object.entries(SLIDERS)) {
  handles[t] = {};
  for (const [key, [id, format]] of Object.entries(map)) {
    handles[t][key] = bindRange(id, {
      format,
      onInput: (v) => {
        params[t][key] = v;
        warn[t] = constrain(t, key);
        for (const [k2, h] of Object.entries(handles[t])) {
          if (h.value !== params[t][k2]) h.set(params[t][k2], { silent: true });
        }
        rebuild(false);
      },
    });
  }
}

let speed = 1;
bindRange('speed', { format: (v) => `${v.toFixed(2)}×`, onInput: (v) => { speed = v; } });

let paused = false;
let stepTo = null;          // timeline time to stop at («Հաջորդ փուլ»)
let tau = 0;                // time inside the cycle, s at speed 1
const play = bindPlayPause('playBtn', { onChange: (p) => { paused = p; stepTo = null; } });

onClick('nextBtn', () => {
  paused = true;
  play.set(true);
  const base = stepTo ?? tau;
  stepTo = timeline.segs.map((s) => s.end).find((e) => e > base + 1e-6) ?? timeline.total;
});
onClick('resetBtn', () => {
  tau = 0;
  stepTo = null;
  paused = false;
  play.set(false);
});

bindSegmented('cycle', {
  onChange: (v) => {
    type = v;
    for (const t of Object.keys(params)) byId(`params-${t}`).hidden = t !== type;
    tau = 0;
    stepTo = null;
    rebuild(true);
  },
});

// ---------- Cycle + timeline ----------
const IDX = { hot: -1, ins: 0, cold: 1 };   // block position on the carriage

function rebuild() {
  const P = params[type];
  cycle = type === 'carnot' ? carnot(P) : type === 'rect' ? rectangle(P) : otto(P);
  const contacts = cycle.energies.map((e) => (e.Q > 1e-6 ? 'hot' : e.Q < -1e-6 ? 'cold' : 'ins'));
  const segs = [];
  let t = 0;
  contacts.forEach((c, k) => {
    const prev = contacts[(k + 3) % 4];
    const move = c !== prev ? DUR_MOVE : 0;
    segs.push({ k, start: t, runStart: t + move, end: t + move + DUR_RUN, contact: c, prev });
    t += move + DUR_RUN;
  });
  timeline = { segs, total: t };
  if (tau >= t) tau = 0;
  if (stepTo !== null && stepTo > t) stepTo = t;
  renderStatic();
  lastStageKey = '';
}

const ease = (u) => u * u * (3 - 2 * u);

function current() {
  const seg = timeline.segs.find((s) => tau < s.end) ?? timeline.segs[3];
  const moving = tau < seg.runStart;
  const s = moving ? 0 : clamp((tau - seg.runStart) / DUR_RUN, 0, 1);
  const u = moving ? ease((tau - seg.start) / (seg.runStart - seg.start)) : 1;
  const stage = cycle.stages[seg.k];
  return {
    seg, k: seg.k, s, moving,
    carriage: lerp(IDX[seg.prev], IDX[seg.contact], u),
    st: stage.at(s),
    dir: Math.sign(stage.b.V - stage.a.V),
  };
}

// ---------- Static texts / tables ----------
function renderStatic() {
  const info = CYCLES[type];
  setHTML('cycleBox', info.box);
  const { corners, stages, energies } = cycle;

  $('#statesTable tbody').innerHTML = corners.map((c, i) =>
    `<tr><td>${i + 1}</td><td>${fP(c.p)}</td><td>${fV(c.V)}</td><td>${fT(c.T)}</td></tr>`).join('');

  const cls = (q) => (Math.round(q) > 0 ? 'pos' : Math.round(q) < 0 ? 'neg' : '');
  $('#stagesTable tbody').innerHTML = stages.map((_, k) => {
    const e = energies[k];
    return `<tr><td>${info.stages[k][0]}</td><td>${fJs(e.dU)}</td><td class="${cls(e.Q)}">${fJs(e.Q)}</td><td>${fJs(e.A)}</td></tr>`;
  }).join('');
  const sumQ = energies.reduce((s, e) => s + e.Q, 0);
  $('#stagesTable tfoot').innerHTML =
    `<tr><td>Ամբողջ ցիկլը</td><td>${fJ(cycle.dU)}</td><td>${fJs(sumQ)}</td><td>${fJs(cycle.A)}</td></tr>`;

  setText('q1Val', `${fJ(cycle.Q1)} Ջ`);
  setText('q2Val', `${fJ(cycle.Q2)} Ջ`);
  setText('aVal', `${fJ(cycle.A)} Ջ`);
  setText('etaVal', fPct(cycle.eta));
  setText('etaCVal', fPct(cycle.etaCarnot));
  setText('duVal', `${fJ(cycle.dU)} Ջ`);
  setHTML('etaCLabel', type === 'carnot'
    ? 'η<sub>Կառնո</sub> = 1 − T₂/T₁'
    : 'η<sub>Կառնո</sub> = 1 − T<sub>min</sub>/T<sub>max</sub>');

  const etaHint = byId('etaHint');
  if (type === 'carnot') {
    etaHint.innerHTML = 'Կառնոյի ցիկլի ՕԳԳ-ն կախված է միայն T₁ և T₂ ջերմաստիճաններից, ոչ թե ծավալներից։ ΔU<sub>ցիկլ</sub> = 0, ուստի A = Q₁ − |Q₂|։';
  } else {
    const ratio = cycle.etaCarnot / cycle.eta;
    const extra = type === 'otto' ? ` Ստուգում՝ η = 1 − ε<sup>1−γ</sup> = ${fPct(1 - params.otto.r ** (1 - GAMMA))}։` : '';
    etaHint.innerHTML = `Կառնոյի շարժիչի ՕԳԳ-ն նույն T<sub>max</sub> = ${fT(cycle.Tmax)} Կ և T<sub>min</sub> = ${fT(cycle.Tmin)} Կ ջերմաստիճանների միջև ${ratio.toFixed(1)} անգամ մեծ է։${extra}`;
  }

  const hint = byId(`hint-${type}`);
  const [c1, c2, c3, c4] = corners;
  let info2;
  if (type === 'carnot') {
    info2 = `Ադիաբատներից՝ V₃ = V₂·(T₁/T₂)<sup>3/2</sup> = ${fV(c3.V)} լ, V₄ = V₁·(T₁/T₂)<sup>3/2</sup> = ${fV(c4.V)} լ։`;
  } else if (type === 'rect') {
    info2 = `pV = νRT-ից՝ T₁ = ${fT(c1.T)} Կ, T₂ = ${fT(c2.T)} Կ, T₃ = ${fT(c3.T)} Կ, T₄ = ${fT(c4.T)} Կ։`;
  } else {
    info2 = `Ադիաբատ սեղմումից հետո՝ T₂ = T₁·ε<sup>γ−1</sup> = ${fT(c2.T)} Կ, ընդարձակումից հետո՝ T₄ = ${fT(c4.T)} Կ։`;
  }
  hint.innerHTML = warn[type] ? `${warn[type]} ${info2}` : info2;
  hint.classList.toggle('hint--warn', !!warn[type]);
}

let lastStageKey = '';
function renderLive(cur) {
  const { st } = cur;
  setText('pNow', `${fP(st.p)} կՊա`);
  setText('vNow', `${fV(st.V)} լ`);
  setText('tNow', `${st.T.toFixed(0)} Կ`);
  setText('uNow', `${fJ(CV * st.T)} Ջ`);

  const key = `${type}:${cur.k}:${cur.moving}`;
  if (key === lastStageKey) return;
  lastStageKey = key;
  const [title, desc] = CYCLES[type].stages[cur.k];
  const e = cycle.energies[cur.k];
  if (cur.moving) {
    setHTML('stageBox', `<b>${title}</b> · նախապատրաստում<br>Տակդիրը տեղաշարժվում է՝ գլանի տակ բերելով ${CONTACT_NAME[cur.seg.contact]}։`);
  } else {
    setHTML('stageBox', `<b>${title}</b><br>${desc}<br>ΔU = ${fJs(e.dU)} Ջ, Q = ${fJs(e.Q)} Ջ, A = ${fJs(e.A)} Ջ`);
  }
  [...$('#stagesTable tbody').rows].forEach((r, i) => r.classList.toggle('is-current', i === cur.k));
}

// ---------- Scene ----------
function sceneLayout(W) {
  const wide = W >= 640;
  const ew = wide ? Math.round(W * 0.6) : W;            // engine area width
  const eH = Math.round(clamp(ew * 0.8, 350, 460));      // engine area height
  const sk = wide ? { x: ew, y: 0, w: W - ew, h: eH } : { x: 0, y: eH, w: W, h: 220 };
  const h = (eH - 130) / 2;                              // gas column at V max
  const wt = 6;
  const cw = Math.round(Math.min(clamp(ew * 0.17, 50, 92), (ew - 16) / 5 - 2 * wt));
  const bw = cw + 2 * wt;
  const cx = Math.round(ew / 2);
  const Rw = h / 2 + 6;                                  // flywheel radius
  const yc = 6 + Rw;                                     // flywheel axle
  const yBot = 2 * h + 52;                               // inner bottom of the cylinder
  return { W, H: wide ? eH : eH + sk.h, wide, ew, eH, sk, h, wt, cw, bw, cx, Rw, yc, yBot, pt: 10, Lr: 14 };
}

let L = null;
const scene = fluidCanvas(byId('scene'), {
  height: (w) => sceneLayout(w).H,
  onResize: () => { L = sceneLayout(scene.width); },
});
L = sceneLayout(scene.width);

const gas = createGas(34);
let clock = 0;

function mix(hexA, hexB, t) {
  const a = parseInt(hexA.slice(1), 16), b = parseInt(hexB.slice(1), 16);
  const ch = (shift) => Math.round(lerp((a >> shift) & 255, (b >> shift) & 255, t));
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}
/** Gas tint: blue at the coldest state of the cycle, red at the hottest. */
function tempColor(T) {
  const t = clamp((T - cycle.Tmin) / (cycle.Tmax - cycle.Tmin || 1), 0, 1);
  return t < 0.5 ? mix(C.cold, C.mid, t * 2) : mix(C.mid, C.hot, t * 2 - 1);
}

function reservoirLabels() {
  if (type === 'carnot') return { hot: `T₁ = ${fT(cycle.Tmax)} Կ`, cold: `T₂ = ${fT(cycle.Tmin)} Կ` };
  return { hot: `≥ ${fT(cycle.Tmax)} Կ`, cold: `≤ ${fT(cycle.Tmin)} Կ` };
}

function drawScene(cur) {
  const { ctx } = scene;
  const { W, H, h, wt, cw, bw, cx, Rw, yc, yBot, pt, Lr, ew, eH, wide } = L;
  const { st } = cur;
  clear(ctx, W, H, COLORS.canvasBg);

  // Divider between the engine and the energy-flow diagram
  if (wide) line(ctx, ew + 0.5, 14, ew + 0.5, eH - 14, { color: COLORS.grid, width: 1 });
  else line(ctx, 14, eH + 0.5, W - 14, eH + 0.5, { color: COLORS.grid, width: 1 });

  const gasH = (h * st.V) / cycle.Vmax;
  const gasTop = yBot - gasH;
  const xl = cx - cw / 2, xr = cx + cw / 2;
  const gasColor = tempColor(st.T);
  const flowing = cur.moving ? 0 : cur.seg.contact;   // reservoir exchanging heat now

  // ----- Carriage with the three reservoirs -----
  const blockTop = yBot + wt, blockH = 36, blockBot = blockTop + blockH;
  const carX = cx - cur.carriage * bw;
  line(ctx, 8, blockBot + 6.5, ew - 8, blockBot + 6.5, { color: COLORS.axis, width: 1 });
  const labels = reservoirLabels();
  for (const [name, idx] of Object.entries(IDX)) {
    const bx = carX + idx * bw - bw / 2 + 2, bwid = bw - 4;
    const active = flowing === name;
    const col = name === 'hot' ? C.hot : name === 'cold' ? C.cold : COLORS.text3;
    ctx.save();
    if (active && name !== 'ins') { ctx.shadowColor = alpha(col, 0.8); ctx.shadowBlur = 16; }
    roundRect(ctx, bx, blockTop, bwid, blockH, 4);
    ctx.fillStyle = alpha(col, name === 'ins' ? 0.12 : active ? 0.42 : 0.24);
    ctx.fill();
    ctx.restore();
    if (name === 'ins') {
      ctx.save();
      roundRect(ctx, bx, blockTop, bwid, blockH, 4);
      ctx.clip();
      ctx.strokeStyle = alpha(COLORS.text3, 0.5);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = bx - blockH; x < bx + bwid; x += 7) { ctx.moveTo(x, blockBot); ctx.lineTo(x + blockH, blockTop); }
      ctx.stroke();
      ctx.restore();
    }
    roundRect(ctx, bx, blockTop, bwid, blockH, 4);
    ctx.strokeStyle = alpha(col, active ? 1 : 0.6);
    ctx.lineWidth = active ? 2 : 1.2;
    ctx.stroke();
    circle(ctx, bx + 9, blockBot + 3, 3, { fill: C.wall });
    circle(ctx, bx + bwid - 9, blockBot + 3, 3, { fill: C.wall });
    const bxc = bx + bwid / 2;
    const title = name === 'hot' ? 'տաքացուցիչ' : name === 'cold' ? 'սառնարան' : 'մեկուսիչ';
    text(ctx, title, bxc, blockBot + 19, { color: name === 'ins' ? COLORS.text2 : col, size: 10.5, weight: 600, align: 'center' });
    if (name !== 'ins') text(ctx, labels[name], bxc, blockBot + 32, { color: COLORS.text2, size: 10, family: 'mono', align: 'center' });
  }

  // ----- Gas and molecules -----
  ctx.fillStyle = alpha(gasColor, 0.13);
  ctx.fillRect(xl, gasTop, cw, gasH);
  const rPx = Math.max(2, DISC_R * cw * 0.9);
  ctx.save();
  ctx.beginPath();
  ctx.rect(xl, gasTop, cw, gasH);
  ctx.clip();
  ctx.fillStyle = gasColor;
  ctx.beginPath();
  for (const m of gas.particles) {
    const my = Math.max(yBot - m.x * cw, gasTop + rPx);
    const mx = xl + m.y * cw;
    ctx.moveTo(mx + rPx, my);
    ctx.arc(mx, my, rPx, 0, TAU);
  }
  ctx.fill();
  ctx.restore();

  // ----- Cylinder walls (open at the top) -----
  const wallTop = yBot - h - pt - 6;
  ctx.fillStyle = C.wall;
  ctx.fillRect(xl - wt, wallTop, wt, yBot - wallTop);
  ctx.fillRect(xr, wallTop, wt, yBot - wallTop);
  ctx.fillStyle = flowing === 'hot' ? mix(C.metal, C.hot, 0.5) : flowing === 'cold' ? mix(C.metal, C.cold, 0.5) : C.metal;
  ctx.fillRect(xl - wt, yBot, cw + 2 * wt, wt);

  // ----- Heat-flow arrows Q₁ (in) / Q₂ (out) -----
  if (flowing === 'hot' || flowing === 'cold') {
    const into = flowing === 'hot';
    const col = into ? C.hot : C.cold;
    const yA = blockTop + blockH * 0.8;
    const yB = Math.max(gasTop + 10, yBot - 52);
    for (let i = 0; i < 3; i++) {
      const x = cx + (i - 1) * cw * 0.28;
      for (let j = 0; j < 2; j++) {
        const ph = (clock * 0.9 + i * 0.33 + j * 0.5) % 1;
        const y = into ? lerp(yA, yB, ph) : lerp(yB, yA, ph);
        const a = Math.sin(Math.PI * ph);
        arrow(ctx, x, y + (into ? 8 : -8), x, y + (into ? -8 : 8), { color: alpha(col, a), width: 3, head: 8 });
      }
    }
    text(ctx, into ? 'Q₁' : 'Q₂', xl - wt - 10, yBot - 4, { color: col, size: 15, weight: 700, align: 'right' });
    text(ctx, into ? 'ստանում է' : 'տալիս է', xl - wt - 10, yBot + 13, { color: col, size: 10, align: 'right' });
  }

  // ----- Piston, rods, flywheel -----
  ctx.fillStyle = C.piston;
  ctx.fillRect(xl + 1, gasTop - pt, cw - 2, pt);
  ctx.strokeStyle = C.pistonEdge;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(xl + 1.6, gasTop - pt + 0.6, cw - 3.2, pt - 1.2);

  const r = (h * (1 - cycle.Vmin / cycle.Vmax)) / 2;   // crank radius = half the stroke
  const l = Rw + 10 + r;                                // connecting rod length
  const crossY = gasTop - pt - Lr;
  const x = crossY - yc;                                // crosshead below the axle
  let theta = Math.acos(clamp((x * x + r * r - l * l) / (2 * x * r || 1), -1, 1));
  if (cur.dir < 0) theta = TAU - theta;
  const pinX = cx + r * Math.sin(theta), pinY = yc + r * Math.cos(theta);

  ctx.fillStyle = C.rod;
  ctx.fillRect(cx - 3, crossY, 6, gasTop - pt - crossY);

  // Flywheel
  circle(ctx, cx, yc, Rw, { stroke: C.wheel, width: 7 });
  circle(ctx, cx, yc, Rw - 7, { stroke: alpha(C.wheel, 0.35), width: 1 });
  for (let j = 0; j < 6; j++) {
    const a = theta + (j * TAU) / 6;
    line(ctx, cx + Math.sin(a) * 9, yc + Math.cos(a) * 9, cx + Math.sin(a) * (Rw - 3), yc + Math.cos(a) * (Rw - 3),
      { color: alpha(C.wheel, 0.7), width: 2.5 });
  }
  circle(ctx, cx, yc, 10, { fill: C.wheel });
  circle(ctx, cx, yc, 3.5, { fill: COLORS.canvasBg });
  line(ctx, cx, yc, pinX, pinY, { color: C.rod, width: 7, cap: 'round' });   // crank arm
  line(ctx, pinX, pinY, cx, crossY, { color: C.rod, width: 5, cap: 'round' }); // connecting rod
  roundRect(ctx, cx - 9, crossY - 5, 18, 10, 3);
  ctx.fillStyle = C.rod;
  ctx.fill();
  circle(ctx, pinX, pinY, 4.5, { fill: COLORS.canvasBg, stroke: C.rod, width: 2 });
  circle(ctx, cx, crossY, 2.5, { fill: COLORS.canvasBg });

  // ----- Work arrow A (gas → flywheel when expanding, flywheel → gas when compressed) -----
  if (!cur.moving && cur.dir !== 0) {
    const ax = xr + wt + 16;
    const y0 = yBot - h * 0.2, y1 = yBot - h * 0.95;
    const up = cur.dir > 0;
    const ph = (clock * 0.8) % 1;
    for (let j = 0; j < 2; j++) {
      const q = (ph + j * 0.5) % 1;
      const yy = up ? lerp(y0, y1, q) : lerp(y1, y0, q);
      arrow(ctx, ax, yy + (up ? 9 : -9), ax, yy + (up ? -9 : 9),
        { color: alpha(C.work, 0.95 * Math.sin(Math.PI * q)), width: 3, head: 8 });
    }
    const ty = (y0 + y1) / 2;
    const lines = up ? ['գազը կատարում', 'է աշխատանք'] : ['գազի վրա', 'կատարվում է', 'աշխատանք'];
    text(ctx, up ? 'A > 0' : 'A < 0', ax + 12, ty, { color: C.work, size: 13, weight: 700 });
    lines.forEach((t, j) => text(ctx, t, ax + 12, ty + 16 + j * 13, { color: C.work, size: 10 }));
  }

  drawSankey(L.sk);
}

/** Energy flow per cycle: Q₁ splits into the work A and the heat |Q₂| given to the cooler. */
function drawSankey({ x, y, w, h }) {
  const { ctx } = scene;
  const pad = 16;
  const { Q1, Q2, A } = cycle;
  text(ctx, 'Էներգիայի հոսքը մեկ ցիկլում', x + pad, y + 18, { color: COLORS.text2, size: 12, weight: 600 });
  text(ctx, `η = ${fPct(cycle.eta)}`, x + w - pad, y + 18, { color: COLORS.coral, size: 14, weight: 700, family: 'mono', align: 'right' });
  text(ctx, `η Կառնո = ${fPct(cycle.etaCarnot)}`, x + w - pad, y + 36, { color: COLORS.text3, size: 10.5, family: 'mono', align: 'right' });

  const Bt = clamp(Math.min(h * 0.3, w * 0.24), 34, 96);
  const yT = y + 84;
  const x0 = x + pad;
  const xs = x0 + w * 0.3;
  const xe = x + w - pad - 12;
  const a = (Bt * A) / Q1;
  const q = Bt - a;
  const Ro = q + 16, Ri = 16;
  const yEnd = y + h - 22;

  // Q₁ band
  const g = ctx.createLinearGradient(x0, 0, xs, 0);
  g.addColorStop(0, alpha(C.hot, 0.85));
  g.addColorStop(1, alpha(C.hot, 0.55));
  ctx.fillStyle = g;
  ctx.fillRect(x0, yT, xs - x0, Bt);
  text(ctx, `Q₁ = ${fJ(Q1)} Ջ`, x0, yT - 26, { color: C.hot, size: 12.5, weight: 700, family: 'mono' });
  text(ctx, 'տաքացուցիչից', x0, yT - 11, { color: COLORS.text3, size: 10.5 });

  // A band (straight on)
  ctx.fillStyle = alpha(C.work, 0.7);
  ctx.fillRect(xs, yT, xe - xs, a);
  ctx.beginPath();
  ctx.moveTo(xe, yT - 5);
  ctx.lineTo(xe + 12, yT + a / 2);
  ctx.lineTo(xe, yT + a + 5);
  ctx.closePath();
  ctx.fill();
  text(ctx, `A = ${fJ(A)} Ջ`, xe + 10, yT - 26, { color: C.work, size: 12.5, weight: 700, family: 'mono', align: 'right' });
  text(ctx, 'օգտակար աշխատանք', xe + 10, yT - 11, { color: COLORS.text3, size: 10.5, align: 'right' });

  // |Q₂| band: turns down towards the cooler
  const cyy = yT + a + Ro;
  ctx.fillStyle = alpha(C.cold, 0.7);
  ctx.beginPath();
  ctx.moveTo(xs, yT + a);
  ctx.arc(xs, cyy, Ro, -Math.PI / 2, 0);
  ctx.lineTo(xs + Ro, yEnd - 10);
  ctx.lineTo(xs + Ro + 5, yEnd - 10);
  ctx.lineTo(xs + (Ro + Ri) / 2, yEnd + 2);
  ctx.lineTo(xs + Ri - 5, yEnd - 10);
  ctx.lineTo(xs + Ri, yEnd - 10);
  ctx.lineTo(xs + Ri, cyy);
  ctx.arc(xs, cyy, Ri, 0, -Math.PI / 2, true);
  ctx.closePath();
  ctx.fill();
  const ly = Math.max(cyy + 10, (cyy + yEnd) / 2);
  text(ctx, `|Q₂| = ${fJ(Q2)} Ջ`, xs + Ro + 10, ly - 7, { color: C.cold, size: 12.5, weight: 700, family: 'mono' });
  text(ctx, 'սառնարանին', xs + Ro + 10, ly + 9, { color: COLORS.text3, size: 10.5 });

  if (L.wide) {
    text(ctx, 'Q₁ = A + |Q₂|', xs + Ro + 10, ly + 34, { color: COLORS.text3, size: 11, family: 'mono' });
    text(ctx, 'ΔU = 0', xs + Ro + 10, ly + 50, { color: COLORS.text3, size: 11, family: 'mono' });
  }
}

// ---------- p–V diagram ----------
const chart = fluidCanvas(byId('chart'), { height: (w) => Math.round(clamp(w * 0.56, 280, 460)) });
let hover = -1;

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

let CH = null;   // last chart mapping (for hover)

function drawChart(cur) {
  const { ctx, width: W, height: H } = chart;
  if (!W) return;
  const m = { l: 52, r: 18, t: 26, b: 40 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const nTicks = W < 500 ? 4 : 6;
  const vStep = niceStep((cycle.Vmax * 1.08) / nTicks);
  const pStep = niceStep((cycle.pmax * 1.1) / nTicks);
  const vMax = Math.ceil((cycle.Vmax * 1.08) / vStep) * vStep;
  const pMax = Math.ceil((cycle.pmax * 1.1) / pStep) * pStep;
  const X = (V) => m.l + (V / vMax) * pw;
  const Y = (p) => m.t + ph - (p / pMax) * ph;
  CH = { X, Y };

  clear(ctx, W, H, COLORS.canvasBg);
  for (let v = 0; v <= vMax + 1e-9; v += vStep) {
    const xx = X(v);
    line(ctx, xx, m.t, xx, m.t + ph, { color: COLORS.grid, width: 1 });
    text(ctx, String(+v.toFixed(3)), xx, m.t + ph + 8, { color: COLORS.text3, size: 10, family: 'mono', align: 'center', baseline: 'top' });
  }
  for (let p = pStep; p <= pMax + 1e-9; p += pStep) {
    const yy = Y(p);
    line(ctx, m.l, yy, m.l + pw, yy, { color: COLORS.grid, width: 1 });
    text(ctx, String(+p.toFixed(3)), m.l - 7, yy, { color: COLORS.text3, size: 10, family: 'mono', align: 'right' });
  }
  line(ctx, m.l, m.t - 8, m.l, m.t + ph, { color: COLORS.axis, width: 1.2 });
  line(ctx, m.l, m.t + ph, m.l + pw + 8, m.t + ph, { color: COLORS.axis, width: 1.2 });
  text(ctx, 'p, կՊա', 8, 12, { color: COLORS.text2, size: 11, family: 'mono' });
  text(ctx, 'V, լ', m.l + pw, H - 10, { color: COLORS.text2, size: 11, family: 'mono', align: 'right' });

  ctx.save();
  ctx.beginPath();
  ctx.rect(m.l, m.t - 6, pw + 6, ph + 6);
  ctx.clip();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Background isotherms T_max and T_min
  const isoNames = type === 'carnot' ? ['T₁', 'T₂'] : ['Tmax', 'Tmin'];
  [cycle.Tmax, cycle.Tmin].forEach((T, i) => {
    const col = i === 0 ? C.hot : C.cold;
    const vFrom = Math.max(vMax / 400, (R * T) / pMax);
    ctx.strokeStyle = alpha(col, 0.5);
    ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    for (let j = 0; j <= 120; j++) {
      const V = vFrom * (vMax / vFrom) ** (j / 120);
      const xx = X(V), yy = Y((R * T) / V);
      j ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  });

  // Cycle area (= work)
  const pts = [];
  cycle.stages.forEach((s) => { for (let j = 0; j < 60; j++) pts.push(s.at(j / 60)); });
  ctx.beginPath();
  pts.forEach((s, j) => (j ? ctx.lineTo(X(s.V), Y(s.p)) : ctx.moveTo(X(s.V), Y(s.p))));
  ctx.closePath();
  ctx.fillStyle = alpha(C.area, 0.2);
  ctx.fill();

  // Stages coloured by the sign of Q
  const stageColor = (k) => {
    const Q = cycle.energies[k].Q;
    return Q > 1e-6 ? C.hot : Q < -1e-6 ? C.cold : C.adiabat;
  };
  const strokeStage = (k, s1, width, col) => {
    const st = cycle.stages[k];
    ctx.strokeStyle = col;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let j = 0; j <= 80; j++) {
      const s = st.at((s1 * j) / 80);
      j ? ctx.lineTo(X(s.V), Y(s.p)) : ctx.moveTo(X(s.V), Y(s.p));
    }
    ctx.stroke();
  };
  cycle.stages.forEach((_, k) => strokeStage(k, 1, 2.4, stageColor(k)));
  if (cur.s > 0) strokeStage(cur.k, cur.s, 5, alpha(stageColor(cur.k), 0.55));
  ctx.restore();

  // Isotherm labels: at the right edge, or higher up the curve if that is too close to the V axis
  [cycle.Tmax, cycle.Tmin].forEach((T, i) => {
    const pLab = Math.max((R * T) / vMax, pMax * 0.07);
    const lx = X((R * T) / pLab), ly = Y(pLab);
    const label = `${isoNames[i]} = ${fT(T)} Կ`;
    ctx.font = font(10.5, { family: 'mono' });
    const tw = ctx.measureText(label).width;
    const right = lx + 4 + tw > m.l + pw;
    roundRect(ctx, (right ? m.l + pw - 2 - tw : lx + 4) - 3, ly - 19, tw + 6, 15, 4);
    ctx.fillStyle = C.pillBg;
    ctx.fill();
    text(ctx, label, right ? m.l + pw - 2 : lx + 4, ly - 5,
      { color: i === 0 ? C.hot : C.cold, size: 10.5, family: 'mono', align: right ? 'right' : 'left', baseline: 'bottom' });
  });

  // Direction arrows at mid-stage
  cycle.stages.forEach((st, k) => {
    const a = st.at(0.46), b = st.at(0.56);
    const ax = X(a.V), ay = Y(a.p), bx = X(b.V), by = Y(b.p);
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 0.5) return;
    const ux = (bx - ax) / len, uy = (by - ay) / len;
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    arrow(ctx, mx - ux * 6, my - uy * 6, mx + ux * 6, my + uy * 6, { color: stageColor(k), width: 2, head: 9 });
  });

  // Work label at the centroid of the cycle
  let A2 = 0, cxs = 0, cys = 0;
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[i], p1 = pts[(i + 1) % pts.length];
    const x0 = X(p0.V), y0 = Y(p0.p), x1 = X(p1.V), y1 = Y(p1.p);
    const c = x0 * y1 - x1 * y0;
    A2 += c; cxs += (x0 + x1) * c; cys += (y0 + y1) * c;
  }
  if (Math.abs(A2) > 1) {
    const gx = cxs / (3 * A2), gy = cys / (3 * A2);
    const label = `A = ${fJ(cycle.A)} Ջ`;
    ctx.font = font(12, { weight: 700, family: 'mono' });
    const tw = ctx.measureText(label).width;
    roundRect(ctx, gx - tw / 2 - 6, gy - 10, tw + 12, 20, 6);
    ctx.fillStyle = C.pillBg;
    ctx.fill();
    text(ctx, label, gx, gy, { color: C.area, size: 12, weight: 700, family: 'mono', align: 'center' });
  }

  // Corner points 1–4: labels pushed away from the centre and from close neighbours
  const P = cycle.corners.map((c) => ({ x: X(c.V), y: Y(c.p) }));
  const cxm = P.reduce((s, q) => s + q.x, 0) / 4;
  const cym = P.reduce((s, q) => s + q.y, 0) / 4;
  P.forEach((q, i) => {
    circle(ctx, q.x, q.y, hover === i ? 6 : 4, { fill: COLORS.text, stroke: COLORS.canvasBg, width: 1.5 });
    let dx = q.x - cxm, dy = q.y - cym;
    let d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    P.forEach((o, j) => {
      const dd = Math.hypot(q.x - o.x, q.y - o.y);
      if (j !== i && dd < 40) { dx += (2 * (q.x - o.x)) / (dd || 1); dy += (2 * (q.y - o.y)) / (dd || 1); }
    });
    d = Math.hypot(dx, dy) || 1;
    text(ctx, String(i + 1), q.x + (dx / d) * 14, q.y + (dy / d) * 14, { color: COLORS.text, size: 12.5, weight: 700, align: 'center' });
  });

  // Current state
  const sx = X(cur.st.V), sy = Y(cur.st.p);
  circle(ctx, sx, sy, 10, { fill: alpha(C.point, 0.22) });
  circle(ctx, sx, sy, 5.5, { fill: C.point, stroke: COLORS.canvasBg, width: 2 });

  // Tooltip for the hovered corner
  if (hover >= 0) {
    const c = cycle.corners[hover];
    const rows = [`Վիճակ ${hover + 1}`, `p = ${fP(c.p)} կՊա`, `V = ${fV(c.V)} լ`, `T = ${fT(c.T)} Կ`];
    ctx.font = font(11.5, { family: 'mono' });
    const tw = Math.max(...rows.map((s) => ctx.measureText(s).width)) + 20;
    const th = rows.length * 16 + 10;
    const px = X(c.V), py = Y(c.p);
    const bx = clamp(px + 14, 4, W - tw - 4) === px + 14 ? px + 14 : px - 14 - tw;
    const by = clamp(py - th / 2, 4, H - th - 4);
    roundRect(ctx, clamp(bx, 4, W - tw - 4), by, tw, th, 8);
    ctx.fillStyle = C.pillBg;
    ctx.fill();
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1;
    ctx.stroke();
    rows.forEach((s, j) => text(ctx, s, clamp(bx, 4, W - tw - 4) + 10, by + 13 + j * 16,
      { color: j ? COLORS.text : COLORS.text2, size: 11.5, weight: j ? 500 : 700, family: j ? 'mono' : 'sans' }));
  }
}

function pickCorner(e) {
  if (!CH) return;
  const pos = pointerPos(chart, e);
  let best = -1, bestD = 24;
  cycle.corners.forEach((c, i) => {
    const d = Math.hypot(CH.X(c.V) - pos.x, CH.Y(c.p) - pos.y);
    if (d < bestD) { bestD = d; best = i; }
  });
  setHover(best);
}
function setHover(i) {
  hover = i;
  [...$('#statesTable tbody').rows].forEach((r, j) => r.classList.toggle('is-current', j === i));
}
chart.canvas.addEventListener('pointermove', pickCorner);
chart.canvas.addEventListener('pointerdown', pickCorner);
chart.canvas.addEventListener('pointerleave', () => setHover(-1));

// ---------- Main loop ----------
rebuild();

startLoop((dt) => {
  if (!paused || stepTo !== null) {
    tau += dt * speed;
    if (stepTo !== null && tau >= stepTo) { tau = stepTo; stepTo = null; }
    if (tau >= timeline.total) tau -= timeline.total;
  }
  clock += dt;
  const cur = current();
  if (!L || L.W !== scene.width) L = sceneLayout(scene.width);
  const lenW = ((L.h * cur.st.V) / cycle.Vmax) / L.cw;
  gas.step(dt, lenW, V_RMS_300 * Math.sqrt(cur.st.T / 300));
  drawScene(cur);
  drawChart(cur);
  renderLive(cur);
});

