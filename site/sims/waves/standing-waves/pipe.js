// Tab 2 — standing sound waves in an air column (open–open or open–closed).

import { fluidCanvas } from '../../../assets/js/core/canvas.js';
import { bindRange, bindSegmented, bindCheckbox, onClick } from '../../../assets/js/core/controls.js';
import { byId, setText, $$ } from '../../../assets/js/core/dom.js';
import { clear, line, text, circle, roundRect, arrow } from '../../../assets/js/core/draw.js';
import { COLORS, themed, alpha } from '../../../assets/js/core/theme.js';
import { clamp } from '../../../assets/js/core/math.js';
import {
  PIPE_Q, soundSpeed, pipeResonance, pipeShape, findExtrema, spectrumGrid,
} from './physics.js';
import {
  fmt, fmtHz, sub, createSlowClock, slowLabel, drawMarkers,
  createSpectrumChart, renderHarmonics,
} from './shared.js';

const NX = 241;
const NS = 41;
const HARMONICS = 6;

const C = themed((light) => ({
  wall: light ? '#5d6890' : '#8a96c0',
  wallFill: light ? '#d9deeb' : '#232a41',
  air: light ? 'rgba(31,114,196,0.75)' : 'rgba(120,180,240,0.8)',
  env: COLORS.blue,
  pressure: COLORS.amber,
  node: COLORS.coral,
  anti: COLORS.teal,
  speaker: light ? '#6f7ba3' : '#7f8bb5',
  muted: COLORS.text3,
}));

/** Small deterministic PRNG so the air particles keep their places. */
function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createPipe() {
  const P = { type: 'closed', L: 0.85, tC: 20 };
  let f = 0;

  const xs = Array.from({ length: NX }, (_, j) => j / (NX - 1));
  const xsS = Array.from({ length: NS }, (_, j) => j / (NS - 1));
  const Sre = new Float64Array(NX), Sim = new Float64Array(NX), Pab = new Float64Array(NX);
  const tRe = new Float64Array(NS), tIm = new Float64Array(NS), tP = new Float64Array(NS);
  const env = new Float64Array(NX);
  let ampMax = 0;
  let spectrum = { fs: [], amps: [] };
  let extrema = { nodes: [], antinodes: [] };
  let resonant = 0;
  const clock = createSlowClock();

  const v = () => soundSpeed(P.tC);
  const res = (i) => pipeResonance(i, P.type, P.L, v());
  const fMax = () => Math.ceil(1.1 * res(HARMONICS).f);

  // ---------- Canvas ----------
  const view = fluidCanvas(byId('pScene'), {
    height: (w) => clamp(Math.round(w * 0.3), 250, 320),
    onResize: () => { makeParticles(); draw(); },
  });
  const { ctx } = view;

  let particles = [];    // { u: fraction along the tube, y: fraction across, j: grid index }
  function makeParticles() {
    const rnd = mulberry(7);
    const { width: W, height: H } = view;
    const len = W - 24 - 56;
    const h = tubeH(H);
    const cols = Math.round(len / 10);
    const rows = Math.max(5, Math.floor((h - 10) / 13));
    particles = [];
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const u = clamp((c + 0.5 + (rnd() - 0.5) * 0.7) / cols, 0, 1);
        const y = (r + 0.5 + (rnd() - 0.5) * 0.6) / rows;
        particles.push({ u, y, j: u * (NX - 1) });
      }
    }
  }
  const tubeH = (H) => clamp(H * 0.44, 90, 150);

  const chart = createSpectrumChart(byId('pSpectrum'), () => ({
    title: 'Ամպլիտուդը՝ ռեզոնանսայինի նկատմամբ',
    fs: spectrum.fs,
    amps: spectrum.amps,
    fMin: 0,
    fMax: fMax(),
    peaks: Array.from({ length: HARMONICS }, (_, i) => {
      const r = res(i + 1);
      return { f: r.f, label: `f${sub(r.n)}` };
    }),
    f,
    a: ampMax,
    yUnit: 'A/Aռ',
    yScale: 1,
  }));

  // ---------- Physics updates ----------
  function updateShape() {
    ampMax = pipeShape(P.type, P.L, v(), f, xs, Sre, Sim, Pab);
    for (let j = 0; j < NX; j++) env[j] = Math.hypot(Sre[j], Sim[j]);
    extrema = findExtrema(env);
  }

  function updateSpectrum() {
    const peaks = Array.from({ length: HARMONICS + 1 }, (_, i) => res(i + 1).f);
    const fs = spectrumGrid(1, fMax(), peaks, (fp) => fp / (2 * PIPE_Q));
    const amps = fs.map((ff) => pipeShape(P.type, P.L, v(), ff, xsS, tRe, tIm, tP));
    spectrum = { fs, amps };
  }

  // ---------- Controls ----------
  const fCtl = bindRange('pF', { format: fmtHz, onInput: (x) => setF(x, false) });

  function setF(x, moveSlider = true) {
    f = clamp(x, 1, fMax());
    if (moveSlider) fCtl.set(f, { silent: true });
    fCtl.show(fmtHz(f));
    updateShape();
    refresh();
  }

  function paramsChanged() {
    fCtl.input.max = fMax();
    f = clamp(f, 1, fMax());
    fCtl.set(f, { silent: true });
    fCtl.show(fmtHz(f));
    updateShape();
    updateSpectrum();
    refresh();
  }

  bindSegmented('pType', { onChange: (t) => { P.type = t; paramsChanged(); } });
  bindRange('pL', { format: (x) => `${x.toFixed(2)} մ`, onInput: (x) => { P.L = x; paramsChanged(); } });
  bindRange('pTemp', {
    format: (x) => `${fmt(x, 0)} °C`,
    onInput: (x) => { P.tC = x; paramsChanged(); },
  });
  const showP = bindCheckbox('pPressure', { onChange: () => draw() });

  for (const [id, df] of [['pMinus10', -10], ['pMinus1', -1], ['pPlus1', 1], ['pPlus10', 10]]) {
    onClick(id, () => setF(Math.round((f + df) * 10) / 10));
  }
  const harmButtons = $$('#pHarm button');
  harmButtons.forEach((b, i) => {
    b.type = 'button';
    b.addEventListener('click', () => setF(res(i + 1).f));
  });

  // ---------- Sound ----------
  const sound = { ctx: null, osc: null, gain: null };
  const soundBtn = byId('pSound');
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) {
    soundBtn.disabled = true;
    setText('pSoundHint', 'Այս դիտարկիչը ձայն նվագարկել չի կարող (Web Audio API չկա)։');
  }
  const loudness = () => 0.03 + 0.12 * Math.min(1, ampMax);
  function soundUpdate() {
    if (!sound.osc) return;
    const now = sound.ctx.currentTime;
    sound.osc.frequency.setTargetAtTime(f, now, 0.02);
    sound.gain.gain.setTargetAtTime(loudness(), now, 0.05);
  }
  function soundStop() {
    if (!sound.osc) return;
    const { osc, gain } = sound;
    const now = sound.ctx.currentTime;
    gain.gain.setTargetAtTime(0, now, 0.03);
    osc.stop(now + 0.2);
    sound.osc = null;
    sound.gain = null;
    soundBtn.setAttribute('aria-pressed', 'false');
    soundBtn.textContent = '🔊 Լսել';
  }
  function soundStart() {
    try {
      sound.ctx = sound.ctx || new AudioCtx();
      sound.ctx.resume?.();
      const osc = sound.ctx.createOscillator();
      const gain = sound.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      gain.gain.value = 0;
      osc.connect(gain).connect(sound.ctx.destination);
      osc.start();
      gain.gain.setTargetAtTime(loudness(), sound.ctx.currentTime, 0.05);
      Object.assign(sound, { osc, gain });
      soundBtn.setAttribute('aria-pressed', 'true');
      soundBtn.textContent = '🔇 Լռեցնել';
    } catch {
      soundBtn.disabled = true;
      setText('pSoundHint', 'Ձայնը միացնել չհաջողվեց։');
    }
  }
  soundBtn.addEventListener('click', () => (sound.osc ? soundStop() : soundStart()));

  // ---------- Readouts ----------
  function refresh() {
    const list = Array.from({ length: HARMONICS }, (_, i) => res(i + 1));
    const near = renderHarmonics(harmButtons, list, f);
    resonant = ampMax > 0.5 ? near.n : 0;
    const lambda = v() / f;
    setText('pV', `${fmt(v(), 1)} մ/վ`);
    setText('pLambda', `${fmt(lambda, lambda < 1 ? 3 : 2)} մ`);
    setText('pQuarter', fmt((4 * P.L) / lambda, 2));
    setText('pAmp', `${fmt(Math.min(1, ampMax) * 100, 0)} %`);
    setText('pNear', `f${sub(near.n)} = ${fmtHz(near.f)}`);
    setText('pNodes', resonant
      ? `${extrema.nodes.length} / ${extrema.antinodes.length}`
      : '— (ռեզոնանս չկա)');
    soundUpdate();
    chart.draw();
  }

  // ---------- Drawing ----------
  function draw() {
    const { width: W, height: H } = view;
    if (!W) return;
    clear(ctx, W, H, COLORS.canvasBg);
    const xA = 56, xB = W - 24;
    const yc = Math.round(H * 0.5);
    const h = tubeH(H);
    const top = yc - h / 2, bot = yc + h / 2;
    const X = (j) => xA + (j / (NX - 1)) * (xB - xA);
    const ea = h / 2 - 8;                               // envelope half-height for |S| = 1
    const dmax = clamp((xB - xA) * 0.03, 6, 14);        // particle displacement for |S| = 1
    const ct = Math.cos(clock.phase), st = Math.sin(clock.phase);

    // tube
    ctx.fillStyle = alpha(C.wallFill, 0.35);
    ctx.fillRect(xA, top, xB - xA, h);
    line(ctx, xA, top, xB, top, { color: C.wall, width: 3, cap: 'round' });
    line(ctx, xA, bot, xB, bot, { color: C.wall, width: 3, cap: 'round' });
    if (P.type === 'closed') {
      ctx.fillStyle = C.wallFill;
      ctx.fillRect(xB, top - 6, 10, h + 12);
      line(ctx, xB, top - 6, xB, bot + 6, { color: C.wall, width: 3 });
    }

    // loudspeaker at the open end
    const sx = xA - 22;
    ctx.fillStyle = alpha(C.speaker, 0.3);
    ctx.strokeStyle = C.speaker;
    ctx.lineWidth = 1.5;
    roundRect(ctx, sx - 14, yc - 9, 10, 18, 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sx - 4, yc - 7);
    ctx.lineTo(sx + 8, yc - 18);
    ctx.lineTo(sx + 8, yc + 18);
    ctx.lineTo(sx - 4, yc + 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // air particles
    ctx.fillStyle = C.air;
    for (const p of particles) {
      const j0 = Math.min(NX - 2, Math.floor(p.j));
      const t = p.j - j0;
      const re = Sre[j0] + (Sre[j0 + 1] - Sre[j0]) * t;
      const im = Sim[j0] + (Sim[j0 + 1] - Sim[j0]) * t;
      const d = (re * ct - im * st) * dmax;
      const x = xA + p.u * (xB - xA) + d;
      const y = top + 5 + p.y * (h - 10);
      ctx.beginPath();
      ctx.arc(x, y, 2.1, 0, 6.2832);
      ctx.fill();
    }

    // displacement (and pressure) envelopes
    const curve = (arr, sign) => {
      ctx.beginPath();
      for (let j = 0; j < NX; j++) ctx.lineTo(X(j), yc + sign * Math.min(arr[j], 1.15) * ea);
    };
    ctx.beginPath();
    for (let j = 0; j < NX; j++) ctx.lineTo(X(j), yc - Math.min(env[j], 1.15) * ea);
    for (let j = NX - 1; j >= 0; j--) ctx.lineTo(X(j), yc + Math.min(env[j], 1.15) * ea);
    ctx.closePath();
    ctx.fillStyle = alpha(C.env, 0.08);
    ctx.fill();
    for (const sign of [-1, 1]) {
      curve(env, sign);
      ctx.strokeStyle = C.env;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    if (showP.checked) {
      ctx.save();
      ctx.setLineDash([6, 4]);
      for (const sign of [-1, 1]) {
        curve(Pab, sign);
        ctx.strokeStyle = C.pressure;
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
      ctx.restore();
    }
    line(ctx, xA, yc, xB, yc, { color: COLORS.axis, width: 1, dash: [3, 5] });

    // node / antinode letters (of the displacement wave)
    if (resonant) {
      for (const i of extrema.nodes) circle(ctx, X(i), yc, 3.5, { fill: COLORS.canvasBg, stroke: C.node, width: 2 });
      for (const i of extrema.antinodes) circle(ctx, X(i), yc, 3, { fill: C.anti });
      drawMarkers(ctx, {
        nodes: extrema.nodes,
        antinodes: extrema.antinodes,
        X,
        yNode: () => bot + 16,
        yAnti: () => bot + 16,
        nodeColor: C.node,
        antiColor: C.anti,
      });
    }

    // length
    const yd = bot + 38;
    arrow(ctx, (xA + xB) / 2 - 40, yd, xA, yd, { color: C.muted, width: 1, head: 6 });
    arrow(ctx, (xA + xB) / 2 + 40, yd, xB, yd, { color: C.muted, width: 1, head: 6 });
    text(ctx, `L = ${P.L.toFixed(2)} մ`, (xA + xB) / 2, yd, { color: C.muted, size: 11, align: 'center' });

    // info
    text(ctx, `f = ${fmtHz(f)}`, 14, 16, { color: COLORS.text, size: 13, weight: 600 });
    text(ctx, slowLabel(f), 14, 34, { color: C.muted, size: 11 });
    if (resonant) {
      text(ctx, `ռեզոնանս՝ ${resonant}-${resonant === 1 ? 'ին' : 'րդ'} հարմոնիկ`, W - 14, 16,
        { color: COLORS.teal, size: 11, weight: 600, align: 'right' });
    }
    text(ctx, P.type === 'closed' ? 'փակ ծայր' : 'բաց ծայր', xB, top - 16,
      { color: C.muted, size: 11, align: 'right' });
    text(ctx, 'բաց ծայր', xA, top - 16, { color: C.muted, size: 11 });
  }

  function frame(dt) {
    clock.advance(dt, f);
    draw();
  }

  makeParticles();
  f = res(1).f;
  paramsChanged();

  return {
    frame,
    redraw: () => { chart.draw(); draw(); },
    stopSound: soundStop,
    state: () => ({
      v: v(), f, ampMax, f1: res(1).f, f2: res(2).f,
      nodes: extrema.nodes.length, antinodes: extrema.antinodes.length, resonant,
    }),
    setF,
  };
}
