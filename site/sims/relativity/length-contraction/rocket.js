// Tab 1: a rocket of proper length L₀ flies along a 300 m station ruler.
// The scene can be viewed from the station frame (rocket contracted) or from
// the rocket frame (station contracted). Distances on the canvas are metres
// of the displayed frame; one scale k (px per metre) is used for everything.

import { fluidCanvas, onDrag } from '../../../assets/js/core/canvas.js';
import { bindRange, bindCheckbox, bindSegmented, bindPlayPause, onClick } from '../../../assets/js/core/controls.js';
import { clear, line, text } from '../../../assets/js/core/draw.js';
import { COLORS, themed, alpha, font, onThemeChange, fontsReady } from '../../../assets/js/core/theme.js';
import { byId, setText, setHTML } from '../../../assets/js/core/dom.js';
import { clamp } from '../../../assets/js/core/math.js';
import { rocket as rocketPhysics, contraction } from './physics.js';
import { fmtTime, group } from './format.js';

const STATION = 300;            // proper length of the station ruler, m
const VIEW_MIN = -20;           // visible window, metres of the displayed frame
const VIEW_MAX = 320;
const VIEW_W = VIEW_MAX - VIEW_MIN;
const LIGHT_SPEED = 100;        // on-screen metres per real second for v = c (speed ×1)
const HALF_H = 19;              // half height of the rocket with fins, m
const BODY_R = 11;              // body radius, m

export function createRocket() {
  const state = {
    beta: 0.6,
    L0: 100,
    frame: 'station',
    speed: 1,
    outline: true,
    paused: false,
    s: 0,                 // station mark (m) that is next to the rocket's tail right now
    measure: null,        // { phase: 'armed' | 'waitA' | 'done', a, b }
  };
  let phys = rocketPhysics(state.beta, state.L0);
  let chartDirty = true;
  let noteKey = '';

  const C = themed((light) => ({
    body: light ? '#e3e8f3' : '#2b3454',
    station: light ? '#e9edf6' : '#1d2438',
    mark: COLORS.amber,
  }));

  const view = fluidCanvas(byId('lcScene'), { height: (w) => Math.round(162 + (94 * w) / VIEW_W) });
  const chart = fluidCanvas(byId('lcChart'), {
    height: (w) => Math.round(clamp(w * 0.3, 180, 250)),
    onResize: () => { chartDirty = true; },
  });
  onThemeChange(() => { chartDirty = true; });
  fontsReady().then(() => { chartDirty = true; });

  // ---------- positions ----------

  /** Tail position of the resting rocket in the rocket-frame view. */
  const tailRest = () => STATION / 2 - state.L0 / 2;

  function centred() {
    return state.frame === 'station'
      ? STATION / 2 - phys.L / 2
      : STATION / 2 - (phys.gamma * state.L0) / 2;
  }

  /** Range of s for one pass in the current frame. */
  function range() {
    if (state.frame === 'station') return [VIEW_MIN - 10 - phys.L, VIEW_MAX + 10];
    const g = phys.gamma;
    return [-g * (VIEW_MAX + 10 - tailRest()), STATION + g * (tailRest() - VIEW_MIN + 10)];
  }

  function wrap() {
    const [min, max] = range();
    if (state.s > max || state.s < min) state.s = min;
  }

  // ---------- simulation ----------

  function finishMeasure(a, b) {
    state.measure = { phase: 'done', a, b };
    state.paused = true;
    play.set(true);
  }

  function step(dt) {
    if (state.paused) return;
    const m = state.measure;
    if (state.beta < 1e-9) {
      // Nothing moves: keep the rocket over the middle of the ruler.
      state.s = centred();
    } else {
      const rate = state.beta * LIGHT_SPEED * state.speed;       // displayed-frame metres per second
      // In the rocket frame the marks are 1/γ apart, so γ·v marks pass per second.
      state.s += (state.frame === 'station' ? rate : rate * phys.gamma) * dt;
      // A pending rocket-frame measurement finishes before the station leaves.
      if (!(m && m.phase === 'waitA')) wrap();
    }
    if (!m || m.phase === 'done') return;

    if (state.frame === 'station') {
      // Both ends are marked at the same station time.
      if (state.s >= 0 && state.s + phys.L <= STATION) finishMeasure(state.s, state.s + phys.L);
      return;
    }

    // Rocket frame: the same two station events are not simultaneous.
    // The nose is marked when station mark b is at the nose, the tail later,
    // when mark a = b − L reaches the tail.
    const span = phys.gamma * state.L0;       // station marks covered by the rocket right now
    if (m.phase === 'armed') {
      const a = Math.max(0, state.s + span - phys.L);
      if (a <= STATION - phys.L + 1e-9) { m.a = a; m.b = a + phys.L; m.phase = 'waitB'; }
    }
    if (m.phase === 'waitB' && state.s >= m.b - span - 1e-9) m.phase = 'waitA';
    if (m.phase === 'waitA' && state.s >= m.a - 1e-9) {
      state.s = m.a;
      finishMeasure(m.a, m.b);
    }
  }

  // ---------- drawing ----------

  /** Outline of the rocket in rest metres: tail at x = 0, nose at x = L0, axis y = 0. */
  function rocketParts(L0) {
    const nose = Math.min(26, L0 * 0.35);
    const xb = L0 - nose;
    const windows = [];
    for (let x = xb - 9; x >= 26; x -= 18) windows.push(x);
    return {
      body(ctx) {
        ctx.moveTo(5, -BODY_R);
        ctx.lineTo(xb, -BODY_R);
        ctx.lineTo(xb, BODY_R);
        ctx.lineTo(5, BODY_R);
        ctx.closePath();
      },
      nose(ctx) {
        ctx.moveTo(xb, -BODY_R);
        ctx.quadraticCurveTo(xb + nose * 0.62, -BODY_R, L0, 0);
        ctx.quadraticCurveTo(xb + nose * 0.62, BODY_R, xb, BODY_R);
        ctx.closePath();
      },
      fins(ctx) {
        for (const sgn of [-1, 1]) {
          ctx.moveTo(22, sgn * BODY_R);
          ctx.lineTo(7, sgn * HALF_H);
          ctx.lineTo(0, sgn * HALF_H);
          ctx.lineTo(5, sgn * BODY_R);
          ctx.closePath();
        }
        ctx.moveTo(5, -6.5);
        ctx.lineTo(0, -8.5);
        ctx.lineTo(0, 8.5);
        ctx.lineTo(5, 6.5);
        ctx.closePath();
      },
      windows(ctx) {
        for (const x of windows) {
          ctx.moveTo(x + 4.2, 0);
          ctx.arc(x, 0, 4.2, 0, Math.PI * 2);
        }
      },
    };
  }

  /** Builds a path in rest metres, squeezed by `f` along x; stroke stays unscaled. */
  function shape(ctx, x, y, k, f, build) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k * f, k);
    ctx.beginPath();
    build(ctx);
    ctx.restore();
  }

  function drawRocket(ctx, xTail, yc, k, f, ghost) {
    const parts = rocketParts(state.L0);
    if (ghost) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = COLORS.text3;
      ctx.lineWidth = 1.2;
      for (const part of [parts.fins, parts.body, parts.nose, parts.windows]) {
        shape(ctx, xTail, yc, k, f, part);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    ctx.lineWidth = 1.4;
    ctx.lineJoin = 'round';
    const paint = (part, fill, stroke) => {
      shape(ctx, xTail, yc, k, f, part);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.stroke();
    };
    paint(parts.fins, alpha(COLORS.red, 0.75), COLORS.red);
    paint(parts.body, C.body, COLORS.text2);
    paint(parts.nose, alpha(COLORS.red, 0.75), COLORS.red);
    paint(parts.windows, alpha(COLORS.blue, 0.45), COLORS.blue);
  }

  /** Horizontal dimension line with a label above it. */
  function dimension(ctx, x1, x2, y, label, color) {
    line(ctx, x1, y, x2, y, { color, width: 1.2 });
    line(ctx, x1, y - 4, x1, y + 4, { color, width: 1.2 });
    line(ctx, x2, y - 4, x2, y + 4, { color, width: 1.2 });
    labelClamped(ctx, label, (x1 + x2) / 2, y - 9, { color, size: 11, weight: 600 });
  }

  /** Centred text kept inside the canvas. */
  function labelClamped(ctx, str, x, y, opts) {
    const half = measure(ctx, str, opts) / 2 + 6;
    const cx = half * 2 > view.width ? view.width / 2 : clamp(x, half, view.width - half);
    text(ctx, str, cx, y, { ...opts, align: 'center' });
  }

  function measure(ctx, str, { size = 12, weight = 500 } = {}) {
    ctx.save();
    ctx.font = font(size, { weight });
    const w = ctx.measureText(str).width;
    ctx.restore();
    return w;
  }

  function drawStation(ctx, x0, f, k, y) {
    const w = STATION * k * f;
    const X = (m) => x0 + m * k * f;

    // modules hanging under the platform (contracted along x only)
    shape(ctx, x0, y.mod, k, f, (c) => {
      c.rect(50, 0, 10, 3);
      c.roundRect(25, 3, 60, 11, 5);
      c.rect(146, 0, 8, 3);
      c.moveTo(159, 10.5);
      c.arc(150, 10.5, 9, 0, Math.PI * 2);
      c.rect(204, 0, 8, 3);
      c.roundRect(188, 3, 40, 9, 4);
      c.moveTo(262, 0);
      c.lineTo(262, 7);
      c.moveTo(272, 7);
      c.arc(262, 7, 10, 0, Math.PI);
      c.closePath();
    });
    ctx.fillStyle = C.station;
    ctx.fill();
    ctx.strokeStyle = COLORS.text3;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // platform = ruler
    ctx.fillStyle = C.station;
    ctx.strokeStyle = COLORS.text2;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.rect(x0, y.rul, w, y.bar);
    ctx.fill();
    ctx.stroke();

    // ticks and labels, thinned out when the ruler is contracted
    const px = k * f;
    const labelStep = [50, 100, 300].find((s) => s * px >= 34) ?? 300;
    const tickStep = [10, 50, 100, 300].find((s) => labelStep % s === 0 && s * px >= 4.5) ?? labelStep;
    for (let m = 0; m <= STATION; m += tickStep) {
      const x = X(m);
      if (x < -30 || x > view.width + 30) continue;
      const major = m % labelStep === 0;
      const len = major ? y.bar : m % 50 === 0 ? y.bar * 0.7 : y.bar * 0.45;
      line(ctx, x, y.rul, x, y.rul + len, { color: major ? COLORS.text : COLORS.text2, width: major ? 1.4 : 1 });
      if (major) {
        text(ctx, String(m), x, y.lab, { color: COLORS.text2, size: 10.5, family: 'mono', align: 'center' });
      }
    }
    if (X(STATION) > 0 && X(STATION) < view.width - 26 && labelStep * px >= 34) {
      text(ctx, 'մ', X(STATION) + 14 + (STATION >= 100 ? 4 : 0), y.lab, { color: COLORS.text3, size: 10.5 });
    }
  }

  function marker(ctx, x, yTip) {
    ctx.beginPath();
    ctx.moveTo(x, yTip);
    ctx.lineTo(x - 5, yTip - 8);
    ctx.lineTo(x + 5, yTip - 8);
    ctx.closePath();
    ctx.fillStyle = C.mark;
    ctx.fill();
  }

  function draw() {
    const { ctx, width: W, height: H } = view;
    if (W < 40) return;
    clear(ctx, W, H);
    const k = W / VIEW_W;
    const X = (xi) => (xi - VIEW_MIN) * k;
    const g = phys.gamma;
    const inStation = state.frame === 'station';
    const m = state.measure;

    const y = {};
    y.dimG = 50;
    y.ghost = y.dimG + 8 + HALF_H * k;
    y.rocket = y.ghost + HALF_H * k + 10 + HALF_H * k;
    y.dimR = y.rocket + HALF_H * k + 20;
    y.lab = y.dimR + 16;
    y.rul = y.lab + 10;
    y.bar = 11;
    y.mod = y.rul + y.bar;
    y.ghostS = y.mod + 20 * k + 8;
    y.txt = y.ghostS + 18;

    // heading
    text(ctx, inStation ? 'Կայանի հաշվարկման համակարգ' : 'Հրթիռի հաշվարկման համակարգ', 12, 18,
      { color: COLORS.red, size: 12, weight: 600 });
    const bTxt = `${state.beta.toFixed(3)}c`;
    text(ctx, state.beta === 0 ? 'v = 0' : inStation ? `հրթիռ → ${bTxt}` : `կայան ← ${bTxt}`, W - 12, 18,
      { color: COLORS.text2, size: 11.5, family: 'mono', align: 'right' });

    // geometry of the displayed frame
    const tail = inStation ? state.s : tailRest();                 // rocket tail, view metres
    const len = inStation ? phys.L : state.L0;                     // rocket length in this frame
    const fRocket = inStation ? 1 / g : 1;
    const fStation = inStation ? 1 : 1 / g;
    const station0 = inStation ? 0 : tail - state.s / g;           // station mark 0, view metres
    const markX = (mark) => X(station0 + mark * fStation);

    drawStation(ctx, X(station0), fStation, k, y);

    // station: rest outline and length in the rocket frame
    if (!inStation) {
      const mid = X(station0 + (STATION * fStation) / 2);
      if (state.outline && state.beta > 0) {
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = COLORS.text3;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(mid - (STATION * k) / 2, y.ghostS, STATION * k, 6);
        ctx.restore();
      }
      labelClamped(ctx, `կայանի ${STATION} մ-ն այս համակարգում՝ ${(STATION / g).toFixed(1)} մ`, mid, y.txt,
        { color: COLORS.text2, size: 11 });
    }

    // rocket: rest outline above (station frame only — in its own frame it is not contracted)
    const xTail = X(tail);
    const xNose = X(tail + len);
    if (inStation && state.outline) {
      const gx = X(tail + len / 2 - state.L0 / 2);
      drawRocket(ctx, gx, y.ghost, k, 1, true);
      dimension(ctx, gx, gx + state.L0 * k, y.dimG, `ուրվագիծ՝ L₀ = ${state.L0} մ`, COLORS.text3);
    }
    drawRocket(ctx, xTail, y.rocket, k, fRocket, false);

    // extension lines and the length of the rocket in this frame
    const done = m && m.phase === 'done';
    const extColor = done && inStation ? C.mark : COLORS.text3;
    const yBottom = y.rocket + HALF_H * k + 3;
    const extTo = done && inStation ? y.rul : y.dimR + 4;
    line(ctx, xTail, yBottom, xTail, extTo, { color: extColor, width: 1, dash: [3, 3] });
    line(ctx, xNose, y.rocket + 3, xNose, extTo, { color: extColor, width: 1, dash: [3, 3] });
    let label;
    if (!inStation) label = `L₀ = ${state.L0} մ`;
    else if (done) label = `L = ${m.b.toFixed(1)} − ${m.a.toFixed(1)} = ${(m.b - m.a).toFixed(1)} մ`;
    else label = `L = ${phys.L.toFixed(1)} մ`;
    dimension(ctx, xTail, xNose, y.dimR, label, done && inStation ? C.mark : COLORS.text);

    // marks left on the station ruler
    if (m && m.phase !== 'armed') {
      if (inStation) {
        marker(ctx, markX(m.a), y.rul);
        marker(ctx, markX(m.b), y.rul);
      } else {
        if (m.phase === 'waitA' || done) marker(ctx, markX(m.b), y.rul);
        if (done) {
          marker(ctx, markX(m.a), y.rul);
          line(ctx, xTail, y.dimR + 4, xTail, y.rul - 8, { color: C.mark, width: 1, dash: [3, 3] });
          line(ctx, markX(m.a), y.rul + 0.5, markX(m.b), y.rul + 0.5, { color: C.mark, width: 3 });
        }
      }
    }
  }

  // ---------- chart: L/L₀ against β ----------

  const PAD = { l: 46, r: 16, t: 16, b: 34 };

  function drawChart() {
    const { ctx, width: W, height: H } = chart;
    if (W < 40) return;
    clear(ctx, W, H);
    const pw = W - PAD.l - PAD.r;
    const ph = H - PAD.t - PAD.b;
    const px = (b) => PAD.l + b * pw;
    const py = (r) => PAD.t + (1 - r) * ph;

    for (let i = 0; i <= 5; i++) {
      const v = i / 5;
      line(ctx, px(v), py(0), px(v), py(1), { color: COLORS.grid });
      line(ctx, px(0), py(v), px(1), py(v), { color: COLORS.grid });
      text(ctx, v.toFixed(1), px(v), py(0) + 12, { color: COLORS.text3, size: 10.5, family: 'mono', align: 'center' });
      text(ctx, v.toFixed(1), PAD.l - 8, py(v), { color: COLORS.text3, size: 10.5, family: 'mono', align: 'right' });
    }
    line(ctx, px(0), py(0), px(1), py(0), { color: COLORS.axis });
    line(ctx, px(0), py(0), px(0), py(1), { color: COLORS.axis });
    text(ctx, 'β = v/c', px(1), py(0) + 26, { color: COLORS.text2, size: 11, align: 'right' });
    text(ctx, 'L/L₀', PAD.l + 8, PAD.t + 20, { color: COLORS.text2, size: 11 });

    ctx.beginPath();
    for (let i = 0; i <= 300; i++) {
      const b = i / 300;
      const x = px(b);
      const yy = py(contraction(b));
      if (i === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.strokeStyle = COLORS.red;
    ctx.lineWidth = 2;
    ctx.stroke();

    const r = contraction(state.beta);
    const cx = px(state.beta);
    const cy = py(r);
    line(ctx, cx, cy, cx, py(0), { color: COLORS.text3, dash: [3, 3] });
    line(ctx, px(0), cy, cx, cy, { color: COLORS.text3, dash: [3, 3] });
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.red;
    ctx.fill();
    ctx.strokeStyle = COLORS.canvasBg;
    ctx.lineWidth = 2;
    ctx.stroke();

    const tag = `β = ${state.beta.toFixed(3)},  L/L₀ = ${r.toFixed(3)}`;
    const left = state.beta > 0.5;
    text(ctx, tag, left ? cx - 10 : cx + 10, r > 0.25 ? cy + 16 : cy - 14,
      { color: COLORS.text, size: 11, family: 'mono', align: left ? 'right' : 'left' });
  }

  onDrag(chart, {
    start: (p) => setBetaFromChart(p),
    move: (p) => setBetaFromChart(p),
  });
  function setBetaFromChart(p) {
    const b = clamp((p.x - PAD.l) / (chart.width - PAD.l - PAD.r), 0, 0.99);
    betaCtl.set(Math.round(b / 0.005) * 0.005);
  }

  // ---------- texts ----------

  function updateStats() {
    setText('lcBeta', state.beta.toFixed(3));
    setText('lcV', `${group(phys.v / 1000)} կմ/վ`);
    setText('lcGamma', phys.gamma.toFixed(3));
    setText('lcL0', `${state.L0} մ`);
    setText('lcL', `${phys.L.toFixed(1)} մ`);
    setText('lcPct', `${phys.percent.toFixed(1)} %`);
    setText('lcT1', fmtTime(phys.tStation));
    setText('lcT2', fmtTime(phys.tRocket));
    chartDirty = true;
  }

  function updateNotes() {
    const m = state.measure;
    const key = `${state.frame}|${state.beta}|${state.L0}|${m ? m.phase : '-'}`;
    if (key === noteKey) return;
    noteKey = key;
    const inStation = state.frame === 'station';
    const b = (x) => `<b>${x}</b>`;

    let html;
    if (!m) {
      html = 'Սեղմեք «Չափել»՝ հրթիռի երկու ծայրերի դիրքերը կայանի քանոնի վրա նշելու համար։';
    } else if (m.phase === 'done' && inStation) {
      html = `Կայանի ժամացույցներով նույն պահին նշվեցին հետևի ծայրի դիրքը՝ ${b(`${m.a.toFixed(1)} մ`)}, և առջևի ծայրի դիրքը՝ ${b(`${m.b.toFixed(1)} մ`)}։<br>L = ${m.b.toFixed(1)} − ${m.a.toFixed(1)} = ${b(`${(m.b - m.a).toFixed(1)} մ`)}`;
    } else if (m.phase === 'done') {
      html = `Հրթիռի ժամացույցներով կայանի երկու նշանները դրվել են ${b('ոչ միաժամանակ')}. նախ նշվել է առջևի ծայրի դիրքը (${m.b.toFixed(1)} մ), իսկ Δt′ = vL₀/c² = ${b(fmtTime(phys.markDelay))} անց՝ հետևի ծայրինը (${m.a.toFixed(1)} մ)։ Այդ ընթացքում կայանը հասցրել է տեղաշարժվել, ուստի նշանների հեռավորությունը կայանի քանոնով ${b(`${(m.b - m.a).toFixed(1)} մ`)} է, ոչ թե L₀։`;
    } else if (m.phase === 'waitA') {
      html = `Կայանը նշեց առջևի ծայրի դիրքը (${b(`${m.b.toFixed(1)} մ`)})։ Հրթիռի ժամացույցներով հետևի ծայրի դիրքը դեռ չի նշվել…`;
    } else {
      html = inStation
        ? 'Սպասում ենք, մինչև հրթիռն ամբողջությամբ հայտնվի քանոնի դիմաց…'
        : 'Սպասում ենք, մինչև կայանի քանոնը հասնի հրթիռին…';
    }
    setHTML('lcMeasure', html);

    const g = phys.gamma.toFixed(2);
    setHTML('lcFrameNote', state.beta === 0
      ? 'Հրթիռը և կայանը միմյանց նկատմամբ անշարժ են. երկարությունները հավասար են սեփական երկարություններին։'
      : inStation
        ? `Քանոնն անշարժ է, հրթիռը շարժվում է և շարժման ուղղությամբ կարճացել է γ = ${b(g)} անգամ՝ ${state.L0} մ-ից դառնալով ${b(`${phys.L.toFixed(1)} մ`)}։ Բարձրությունը չի փոխվել, իսկ կլոր պատուհանները դարձել են էլիպսներ։`
        : `Հրթիռն անշարժ է և ունի իր սեփական երկարությունը՝ ${b(`${state.L0} մ`)}։ Կայանը սլանում է հակառակ ուղղությամբ, և հիմա նա է կարճացել γ = ${b(g)} անգամ. քանոնի բաժանումներն իրար մոտեցել են։`);
  }

  // ---------- controls ----------

  function changed() {
    phys = rocketPhysics(state.beta, state.L0);
    state.measure = null;
    wrap();
    updateStats();
  }

  function setPaused(p) {
    state.paused = p;
    play.set(p);
  }

  const betaCtl = bindRange('lcBetaIn', {
    format: (v) => v.toFixed(3),
    onInput: (v) => { state.beta = v; changed(); },
  });
  bindRange('lcL0In', {
    format: (v) => `${v} մ`,
    onInput: (v) => { state.L0 = v; changed(); },
  });
  bindRange('lcSpeed', {
    format: (v) => `×${v.toFixed(2)}`,
    onInput: (v) => { state.speed = v; },
  });
  bindCheckbox('lcOutline', { onChange: (v) => { state.outline = v; } });
  bindSegmented('lcFrame', {
    onChange: (v) => {
      state.frame = v;
      state.measure = null;
      state.s = centred();
    },
  });
  const play = bindPlayPause('lcPlay', {
    paused: false,
    onChange: (p) => {
      state.paused = p;
      if (!p && state.measure && state.measure.phase === 'done') state.measure = null;
    },
  });
  onClick('lcReset', () => {
    state.measure = null;
    state.s = centred();
    setPaused(false);
  });
  onClick('lcMeasureBtn', () => {
    state.measure = { phase: 'armed' };
    setPaused(false);
  });

  state.s = centred();
  updateStats();

  return {
    frame(dt) {
      step(dt);
      draw();
      updateNotes();
      if (chartDirty) { chartDirty = false; drawChart(); }
    },
  };
}
