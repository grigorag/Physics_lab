// Transverse and longitudinal waves on a chain of masses coupled by springs.
//
// Mass 0 is driven by the source on the left; the right end is either a fixed
// wall or free. The same scalar displacement d_i is drawn vertically
// (transverse mode) or horizontally (longitudinal mode).

import { fluidCanvas } from '../../../assets/js/core/canvas.js';
import { startLoop } from '../../../assets/js/core/loop.js';
import {
  bindRange, bindCheckbox, bindTabs, bindPlayPause, onClick,
} from '../../../assets/js/core/controls.js';
import { byId, setText, setHTML } from '../../../assets/js/core/dom.js';
import { clear, text } from '../../../assets/js/core/draw.js';
import { COLORS } from '../../../assets/js/core/theme.js';
import { TAU } from '../../../assets/js/core/math.js';
import {
  N, m, createChain, resetChain, step, cutoffFreq, harmFreq,
} from './physics.js';

const C = {
  guide: 'rgba(139,150,179,0.18)',
  rest: 'rgba(139,150,179,0.16)',
  mount: '#2d3656',
  spring: '#5a6794',
  source: '#f6ad55',
  muted: '#8b96b3',
  arrow: '#4fd1c5',
};

// ---------- State ----------
const P = { amp: 34, damp: 0, freq: 1.1, k: 55 };
const chain = createChain();
let mode = 'transverse';
let drive = 'continuous';   // 'continuous' | 'pulse'
let rightWall = true;       // true = fixed wall on the right, false = free end
let paused = false;

// ---------- Canvas & layout ----------
const view = fluidCanvas(byId('cv'), {
  height: (w) => Math.min(560, Math.max(360, w * 0.55)),
  onResize: () => { layout(); draw(); },
});
const { ctx } = view;

let x0 = new Array(N);      // rest x positions
let y0 = 0;                 // baseline y
let ballR = 9;              // ball radius (shrinks when the chain is dense)

function layout() {
  const { width: W, height: H } = view;
  y0 = H / 2;
  x0 = new Array(N);
  const left = 80, right = W - 60;
  for (let i = 0; i < N; i++) x0[i] = left + (right - left) * i / (N - 1);
  // Original radius is 9 px; on narrow screens keep neighbours from merging.
  ballR = Math.min(9, Math.max(3, ((right - left) / (N - 1)) * 0.45));
}

function reset() { resetChain(chain); }

// ---------- Rendering ----------
function ballPos(i) {
  const d = chain.d;
  if (mode === 'transverse') return { x: x0[i], y: y0 + d[i] };
  return { x: x0[i] + d[i], y: y0 };
}

function drawSpring(p1, p2, coils) {
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;     // along spring
  const px = -uy, py = ux;                // perpendicular
  const amp = Math.min(4, Math.max(2, ballR * 0.45)); // zig-zag half-width (4 px at full size)
  const segs = coils * 2;
  const pad = 0.18;                       // straight bit at each end
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  for (let s = 1; s < segs; s++) {
    const f = pad + (1 - 2 * pad) * (s / segs);
    const off = (s % 2 ? 1 : -1) * amp;
    ctx.lineTo(p1.x + ux * len * f + px * off, p1.y + uy * len * f + py * off);
  }
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();
}

function arrowHead(x, y, dx, dy) {
  const s = 5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - dx * s + dy * s * 0.6, y - dy * s + dx * s * 0.6);
  ctx.lineTo(x - dx * s - dy * s * 0.6, y - dy * s - dx * s * 0.6);
  ctx.closePath();
  ctx.fill();
}

function draw() {
  const { width: W, height: H } = view;
  if (!W) return;
  const d = chain.d;

  clear(ctx, W, H, COLORS.canvasBg);

  // baseline + equilibrium markers (faint)
  if (mode === 'transverse') {
    ctx.strokeStyle = C.guide;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(60, y0);
    ctx.lineTo(W - 50, y0);
    ctx.stroke();
  }
  ctx.fillStyle = C.rest;
  for (let i = 0; i < N; i++) {
    ctx.beginPath(); ctx.arc(x0[i], y0, 2, 0, TAU); ctx.fill();
  }

  // left source post and right wall
  ctx.fillStyle = C.mount;
  ctx.fillRect(46, y0 - 60, 8, 120);                       // source mount
  if (rightWall) ctx.fillRect(W - 54, y0 - 60, 8, 120);    // fixed wall

  // springs
  ctx.strokeStyle = C.spring;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'miter';
  let prev = { x: 46 + 8, y: y0 };
  for (let i = 0; i < N; i++) {
    const p = ballPos(i);
    drawSpring(prev, p, 6);
    prev = p;
  }
  if (rightWall) drawSpring(prev, { x: W - 54, y: y0 }, 6);  // last spring to the wall

  // balls, colored by displacement magnitude (teal → orange/red)
  for (let i = 0; i < N; i++) {
    const p = ballPos(i);
    const disp = Math.abs(d[i]) / (P.amp || 1);
    const hue = 190 - Math.min(disp, 1) * 160;
    const r = ballR;
    if (i === 0) {
      ctx.fillStyle = C.source;
    } else {
      const g = ctx.createRadialGradient(p.x - 2, p.y - 2, 1, p.x, p.y, r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.35, `hsl(${hue},75%,62%)`);
      g.addColorStop(1, `hsl(${hue},75%,42%)`);
      ctx.fillStyle = g;
    }
    ctx.beginPath(); ctx.arc(p.x, p.y, i === 0 ? r + 1 : r, 0, TAU); ctx.fill();
  }

  // labels
  const lbl = { size: 12, baseline: 'alphabetic' };
  text(ctx, 'աղբյուր', 30, y0 - 70, { ...lbl, color: C.source });
  text(ctx, rightWall ? 'պատ' : 'ազատ ծայր', W - (rightWall ? 70 : 120), y0 - 70, { ...lbl, color: C.muted });

  // oscillation-direction indicator (bottom-left)
  ctx.strokeStyle = C.arrow;
  ctx.fillStyle = C.arrow;
  ctx.lineWidth = 2;
  const ax = 24, ay = H - 36;
  ctx.beginPath();
  if (mode === 'transverse') {        // oscillation vertical, propagation horizontal
    ctx.moveTo(ax, ay - 16); ctx.lineTo(ax, ay + 16); ctx.stroke();
    arrowHead(ax, ay - 16, 0, -1); arrowHead(ax, ay + 16, 0, 1);
  } else {                            // oscillation horizontal
    ctx.moveTo(ax - 14, ay); ctx.lineTo(ax + 14, ay); ctx.stroke();
    arrowHead(ax - 14, ay, -1, 0); arrowHead(ax + 14, ay, 1, 0);
  }
  text(ctx, 'տատանում', ax + 22, ay + 4, { ...lbl, color: C.muted });
}

// ---------- Mode ----------
const TITLES = { transverse: 'Լայնական ալիք', longitudinal: 'Երկայնական ալիք' };
const DESCS = {
  transverse: 'Շարքի յուրաքանչյուր գնդիկ տատանվում է ալիքի տարածման ուղղությանն ուղղահայաց (վեր-վար)։ Աղբյուրը ձախից շարժում է առաջին գնդիկը, և գրգիռը զսպանակների միջոցով փոխանցվում է հաջորդներին։',
  longitudinal: 'Գնդիկները տատանվում են ալիքի տարածման ուղղությամբ (ձախ-աջ)՝ առաջացնելով խտացման ու նոսրացման հատվածներ։ Տես՝ ինչպես են զսպանակները հերթով սեղմվում և ձգվում։',
};

function setMode(mo) {
  mode = mo;
  setText('modeTitle', TITLES[mo]);
  setText('desc', DESCS[mo]);
  reset();
}
const tabs = bindTabs('tabs', { onChange: setMode });

// ---------- Controls ----------
bindRange('amp', { format: (v) => v.toFixed(0), onInput: (v) => { P.amp = v; } });
bindRange('damp', { format: (v) => v.toFixed(2), onInput: (v) => { P.damp = v; } });
const freqCtl = bindRange('freq', {
  format: (v) => v.toFixed(2),
  onInput: (v) => { P.freq = v; updateCutoff(); },
});
bindRange('k', {
  format: (v) => v.toFixed(0),
  onInput: (v) => { P.k = v; updateCutoff(); updateHarm(); },
});
const nCtl = bindRange('nharm', { format: (v) => v.toFixed(0), onInput: () => updateHarm() });
const wallCtl = bindCheckbox('wall', { onChange: (on) => { rightWall = on; } });

function updateCutoff() {
  const fc = cutoffFreq(P.k);
  const over = P.freq > fc;
  setHTML('cutoff', `Կտրման հաճախություն f<sub>c</sub> ≈ <b>${fc.toFixed(2)}</b> ( = √(k/m)/π )։ ` +
    (over
      ? '⚠ Աղբյուրի հաճախությունը գերազանցում է f<sub>c</sub>-ն — ալիքը <b>չի տարածվում</b> (մարող/էվանեսցենտ)։ Բարձրացրու k-ն կամ իջեցրու հաճախությունը։'
      : 'Հաճախությունը < f<sub>c</sub> — ալիքը նորմալ տարածվում է շղթայով։'));
  const el = byId('cutoff');
  el.classList.toggle('hint--warn', over);
  el.classList.toggle('hint--ok', !over);
}

function updateHarm() {
  const n = nCtl.value;
  const fn = harmFreq(n, P.k);
  setHTML('harmInfo',
    `f<sub>${n}</sub> ≈ <b>${fn.toFixed(3)}</b> Հց &nbsp;(k=${P.k}, m=${m}, N=${N}, ${n} հանգույց-կիսաալիք)`);
}

onClick('snapBtn', () => {
  const fn = harmFreq(nCtl.value, P.k);
  P.freq = fn;                                   // exact value used by the physics
  freqCtl.set(fn, { silent: true });             // move the slider (snapped to its step)
  freqCtl.show(fn.toFixed(2));
  updateCutoff();
  drive = 'continuous';
  wallCtl.set(true, { silent: true });
  rightWall = true;
  reset();                                       // clean build-up of the standing wave
});

onClick('resetBtn', reset);
bindPlayPause('pauseBtn', { onChange: (p) => { paused = p; } });
onClick('pulseBtn', () => { drive = 'pulse'; reset(); });
onClick('contBtn', () => { drive = 'continuous'; reset(); });

// ---------- Start ----------
updateCutoff();
updateHarm();
layout();
setMode(tabs.value);

startLoop((dt) => {
  if (!paused) step(chain, P, { drive, rightWall }, dt);
  draw();
}, { maxDt: 0.033 });
