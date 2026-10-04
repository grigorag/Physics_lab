// Relative motion in 1D — two ladybugs on the ground or on a moving belt.
//
// The scene is drawn in fixed canvas pixels (900 × 560). World x is measured
// in "cm" and equals canvas x − WORLD_OFFSET, so canvas x = 0 is world −100.
// A bug on the belt moves relative to the ground with v = v₀ + v_belt.
// The scene is an illustration and keeps its own light colors.

import { fixedCanvas } from '../../../assets/js/core/canvas.js';
import { startLoop } from '../../../assets/js/core/loop.js';
import { bindRange, bindCheckbox, bindSegmented, bindPlayPause, onClick } from '../../../assets/js/core/controls.js';
import { byId } from '../../../assets/js/core/dom.js';
import { arrow, roundRect } from '../../../assets/js/core/draw.js';
import { font } from '../../../assets/js/core/theme.js';
import { TAU } from '../../../assets/js/core/math.js';

const W = 900;
const H = 560;
const view = fixedCanvas(byId('cv'), W, H);
const { ctx } = view;

// ---------- Layout regions (canvas pixels) ----------
const HEADER_BOTTOM = 60;
const BELT_TOP = 220, BELT_BOTTOM = 330;
const RULER_TOP = 500, RULER_BOTTOM = H;
const PLAY_TOP = HEADER_BOTTOM;
const PLAY_BOTTOM = RULER_TOP;

// ---------- World <-> canvas ----------
const WORLD_OFFSET = 100;
const toCanvasX = (wx) => wx + WORLD_OFFSET;
const WORLD_MIN = -WORLD_OFFSET;      // −100
const WORLD_MAX = W - WORLD_OFFSET;   //  800

const RED = '#c14a3a';
const BLUE = '#2b6bb0';
const C_OWN = '#2e7d32';     // own velocity arrow
const C_BELT = '#c79100';    // belt velocity arrow
const C_GROUND = '#1a1a1a';  // resulting (ground-frame) velocity arrow
const C_MEET = '232, 131, 111';

// ---------- State ----------
const state = {
  paused: true,             // start paused; user presses «Սկսել»
  showVectors: true,
  time: 0,
  beltVx: 20,
  beltPhase: 0,
  lb1: { x0: 0, vx: 70, x: 0, surface: 'ground', yGround: 140, yBelt: 250, y: 140, color: RED },
  lb2: { x0: 0, vx: 50, x: 0, surface: 'belt', yGround: 415, yBelt: 305, y: 305, color: BLUE },
  meetings: [],
  flashStart: -Infinity,
};

const onBelt = (lb) => lb.surface === 'belt';
const groundVx = (lb) => lb.vx + (onBelt(lb) ? state.beltVx : 0);
const syncSurfaceY = (lb) => { lb.y = lb.surface === 'ground' ? lb.yGround : lb.yBelt; };

// ---------- Controls ----------
bindRange('belt-vx', { onInput: (v) => { state.beltVx = v; } });

for (const [key, lb] of [['lb1', state.lb1], ['lb2', state.lb2]]) {
  bindRange(`${key}-x0`, { onInput: (v) => { lb.x0 = v; lb.x = v; } });
  bindRange(`${key}-vx`, { onInput: (v) => { lb.vx = v; } });
  bindSegmented(`${key}-surface`, {
    value: lb.surface,
    onChange: (v) => { lb.surface = v; syncSurfaceY(lb); },
  });
}

const play = bindPlayPause('playBtn', {
  paused: true,
  label: (p) => (p ? (state.time > 0 ? '▶ Շարունակել' : '▶ Սկսել') : '⏸ Դադար'),
  onChange: (p) => { state.paused = p; },
});

bindCheckbox('vectorsToggle', { onChange: (on) => { state.showVectors = on; } });

function reset() {
  state.lb1.x = state.lb1.x0;
  state.lb2.x = state.lb2.x0;
  syncSurfaceY(state.lb1);
  syncSurfaceY(state.lb2);
  state.time = 0;
  state.meetings = [];
  state.beltPhase = 0;
  state.flashStart = -Infinity;
  state.paused = true;
  play.set(true);
  // Initial overlap counts as a meeting at t = 0
  if (Math.abs(state.lb1.x - state.lb2.x) < 0.5) {
    state.meetings.push({ t: 0, x: state.lb1.x });
    state.flashStart = state.time;
  }
}
onClick('resetBtn', reset);
reset();

// ---------- Physics ----------
function update(dt) {
  state.beltPhase += state.beltVx * dt;

  const prevX1 = state.lb1.x;
  const prevX2 = state.lb2.x;
  const prevDx = prevX1 - prevX2;

  state.lb1.x += groundVx(state.lb1) * dt;
  state.lb2.x += groundVx(state.lb2) * dt;
  state.time += dt;

  // Meeting = sign change of the separation; interpolate the exact moment.
  const currDx = state.lb1.x - state.lb2.x;
  if (prevDx !== 0 && prevDx * currDx < 0) {
    const f = prevDx / (prevDx - currDx);
    const tMeet = (state.time - dt) + f * dt;
    const xMeet = prevX1 + f * (state.lb1.x - prevX1);
    state.meetings.push({ t: tMeet, x: xMeet });
    state.flashStart = state.time;
  }
}

// ---------- Drawing ----------
function drawHeader() {
  ctx.fillStyle = '#2a2620';
  ctx.fillRect(0, 0, W, HEADER_BOTTOM);
  ctx.fillStyle = '#ffd23f';
  ctx.fillRect(0, HEADER_BOTTOM - 2, W, 2);

  // Clock
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#a8a094';
  ctx.font = font(11, { weight: 600 });
  ctx.fillText('ԺԱՄԱՆԱԿ', 18, 10);

  ctx.font = font(24, { weight: 700, family: 'mono' });
  ctx.fillStyle = '#ffd23f';
  ctx.fillText('t = ' + state.time.toFixed(2) + ' վ', 18, 25);

  // Meeting info
  ctx.textAlign = 'right';
  if (state.meetings.length === 0) {
    ctx.font = font(13, { weight: 400, family: 'display', style: 'italic' });
    ctx.fillStyle = '#8a8275';
    ctx.fillText('սպասում ենք հանդիպման…', W - 18, 23);
  } else {
    const last = state.meetings[state.meetings.length - 1];
    ctx.fillStyle = '#a8a094';
    ctx.font = font(11, { weight: 600 });
    ctx.fillText('ՀԱՆԴԻՊՈՒՄ #' + state.meetings.length, W - 18, 10);

    ctx.font = font(18, { weight: 700, family: 'mono' });
    ctx.fillStyle = '#e8836f';
    ctx.fillText('t = ' + last.t.toFixed(2) + ' վ    x = ' + last.x.toFixed(1) + ' սմ', W - 18, 27);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function drawGround() {
  const grad = ctx.createLinearGradient(0, PLAY_TOP, 0, PLAY_BOTTOM);
  grad.addColorStop(0, '#cfe0b8');
  grad.addColorStop(1, '#b5cc99');
  ctx.fillStyle = grad;
  ctx.fillRect(0, PLAY_TOP, W, BELT_TOP - PLAY_TOP);
  ctx.fillRect(0, BELT_BOTTOM, W, PLAY_BOTTOM - BELT_BOTTOM);

  ctx.strokeStyle = 'rgba(80, 100, 60, 0.18)';
  ctx.lineWidth = 1;
  const step = 40;
  // Vertical and horizontal lines are stroked separately so the crossings
  // come out slightly darker, as in the original.
  ctx.beginPath();
  for (let x = 0; x <= W; x += step) {
    ctx.moveTo(x + 0.5, PLAY_TOP);
    ctx.lineTo(x + 0.5, BELT_TOP);
    ctx.moveTo(x + 0.5, BELT_BOTTOM);
    ctx.lineTo(x + 0.5, PLAY_BOTTOM);
  }
  ctx.stroke();
  ctx.beginPath();
  for (let y = PLAY_TOP; y <= BELT_TOP; y += step) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(W, y + 0.5);
  }
  for (let y = BELT_BOTTOM + (step - BELT_BOTTOM % step); y <= PLAY_BOTTOM; y += step) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(W, y + 0.5);
  }
  ctx.stroke();

  // Grass specks (deterministic pattern)
  ctx.fillStyle = 'rgba(70, 90, 50, 0.32)';
  for (let i = 0; i < 110; i++) {
    const sx = (i * 97 + 13) % W;
    const sy = ((i * 53 + 7) % (PLAY_BOTTOM - PLAY_TOP)) + PLAY_TOP;
    if (sy > BELT_TOP - 6 && sy < BELT_BOTTOM + 6) continue;
    ctx.fillRect(sx, sy, 1.5, 1.5);
  }
}

function drawBelt() {
  const grad = ctx.createLinearGradient(0, BELT_TOP, 0, BELT_BOTTOM);
  grad.addColorStop(0, '#2c2c2c');
  grad.addColorStop(0.5, '#444');
  grad.addColorStop(1, '#2c2c2c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, BELT_TOP, W, BELT_BOTTOM - BELT_TOP);

  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, BELT_TOP - 4, W, 6);
  ctx.fillRect(0, BELT_BOTTOM - 2, W, 6);
  ctx.fillStyle = '#5a5a5a';
  ctx.fillRect(0, BELT_TOP - 1, W, 1);
  ctx.fillRect(0, BELT_BOTTOM, W, 1);

  // Moving chevrons show the belt's direction and speed
  const chevSpacing = 70;
  const phase = ((state.beltPhase % chevSpacing) + chevSpacing) % chevSpacing;
  const dir = state.beltVx >= 0 ? 1 : -1;
  const cy = (BELT_TOP + BELT_BOTTOM) / 2;
  const cHeight = (BELT_BOTTOM - BELT_TOP) * 0.55;

  ctx.save();
  ctx.strokeStyle = 'rgba(255, 210, 63, 0.95)';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let x = -chevSpacing * 2; x < W + chevSpacing * 2; x += chevSpacing) {
    const cx = x + phase;
    ctx.beginPath();
    ctx.moveTo(cx - 14 * dir, cy - cHeight / 2);
    ctx.lineTo(cx + 14 * dir, cy);
    ctx.lineTo(cx - 14 * dir, cy + cHeight / 2);
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let y = BELT_TOP + 6; y < BELT_BOTTOM; y += 8) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(W, y + 0.5);
  }
  ctx.stroke();
}

function drawRuler() {
  const grad = ctx.createLinearGradient(0, RULER_TOP, 0, RULER_BOTTOM);
  grad.addColorStop(0, '#ebd9b5');
  grad.addColorStop(1, '#d8c39a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, RULER_TOP, W, RULER_BOTTOM - RULER_TOP);

  ctx.fillStyle = '#a48657';
  ctx.fillRect(0, RULER_TOP, W, 2);
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillRect(0, RULER_TOP + 2, W, 1);

  // Ticks every 10 canvas px
  ctx.fillStyle = '#3a2f1c';
  for (let x = 0; x <= W; x += 10) {
    const h = x % 100 === 0 ? 16 : x % 50 === 0 ? 10 : 5;
    ctx.fillRect(x, RULER_TOP + 4, x % 100 === 0 ? 2 : 1, h);
  }

  // Labels at major ticks, in world x
  ctx.font = font(11, { weight: 700, family: 'mono' });
  ctx.textBaseline = 'top';
  for (let x = 0; x <= W; x += 100) {
    let align = 'center';
    let drawX = x;
    if (x === 0) { align = 'left'; drawX = 4; }
    else if (x > W - 50) { align = 'right'; drawX = W - 4; }
    ctx.textAlign = align;
    ctx.fillText(String(x - WORLD_OFFSET), drawX, RULER_TOP + 24);
  }

  // Origin mark (world x = 0)
  ctx.fillStyle = 'rgba(193, 74, 58, 0.55)';
  ctx.fillRect(toCanvasX(0) - 0.5, RULER_TOP, 1.5, 4);

  // Unit
  ctx.font = font(11, { weight: 400, family: 'display', style: 'italic' });
  ctx.fillStyle = '#6b5a3a';
  ctx.textAlign = 'right';
  ctx.fillText('սանտիմետր (սմ)', W - 6, RULER_TOP + 42);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function drawMeetingMarker() {
  if (state.meetings.length === 0) return;
  const last = state.meetings[state.meetings.length - 1];
  const cx = toCanvasX(last.x);
  if (cx < 0 || cx > W) return;

  ctx.save();
  ctx.strokeStyle = `rgba(${C_MEET}, 0.85)`;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.moveTo(cx + 0.5, PLAY_TOP);
  ctx.lineTo(cx + 0.5, PLAY_BOTTOM);
  ctx.stroke();
  ctx.setLineDash([]);

  const tag = '× ' + last.x.toFixed(1);
  ctx.font = font(11, { weight: 700, family: 'mono' });
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';
  const tw = ctx.measureText(tag).width + 12;
  const ty = PLAY_TOP + 6;
  ctx.fillStyle = `rgba(${C_MEET}, 0.95)`;
  ctx.fillRect(cx - tw / 2, ty, tw, 18);
  ctx.fillStyle = '#fbf8f1';
  ctx.fillText(tag, cx, ty + 4);

  // Expanding ring right after a meeting
  const since = state.time - state.flashStart;
  if (since >= 0 && since < 1.2) {
    const t = since / 1.2;
    ctx.strokeStyle = `rgba(${C_MEET}, ${(1 - t) * 0.7})`;
    ctx.lineWidth = 3 * (1 - t) + 0.5;
    ctx.beginPath();
    ctx.arc(cx, (state.lb1.y + state.lb2.y) / 2, 8 + t * 60, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

function drawOffscreenIndicator(lb, cy, offLeft) {
  const ex = offLeft ? 12 : W - 12;
  const s = offLeft ? 1 : -1;
  ctx.save();
  ctx.fillStyle = lb.color;
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(ex, cy);
  ctx.lineTo(ex + 12 * s, cy - 8);
  ctx.lineTo(ex + 12 * s, cy + 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.font = font(11, { weight: 700, family: 'mono' });
  ctx.textBaseline = 'middle';
  ctx.textAlign = offLeft ? 'left' : 'right';
  ctx.fillText('x = ' + lb.x.toFixed(0), ex + 18 * s, cy);
  ctx.restore();
}

function drawLadybug(lb) {
  const cx = toCanvasX(lb.x);
  const cy = lb.y;
  const angle = groundVx(lb) >= 0 ? 0 : Math.PI;

  const offLeft = cx < 18;
  const offRight = cx > W - 18;
  if (offLeft || offRight) {
    drawOffscreenIndicator(lb, cy, offLeft);
    return;
  }

  ctx.save();
  ctx.translate(cx, cy);

  // Shadow
  ctx.save();
  ctx.translate(2, 3);
  ctx.rotate(angle);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 17, 13, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  ctx.rotate(angle);

  // Legs
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const lx of [-8, 0, 8]) {
    const dx = lx === 0 ? 0 : (lx > 0 ? 3 : -3);
    ctx.moveTo(lx, -8);
    ctx.lineTo(lx + dx, -14);
    ctx.moveTo(lx, 8);
    ctx.lineTo(lx + dx, 14);
  }
  ctx.stroke();

  // Body
  ctx.fillStyle = lb.color;
  ctx.beginPath();
  ctx.ellipse(0, 0, 16, 12, 0, 0, TAU);
  ctx.fill();

  // Highlight
  const hg = ctx.createRadialGradient(-3, -3, 2, 0, 0, 16);
  hg.addColorStop(0, 'rgba(255,255,255,0.35)');
  hg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.ellipse(0, 0, 16, 12, 0, 0, TAU);
  ctx.fill();

  // Center line
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(8, 0);
  ctx.lineTo(-14, 0);
  ctx.stroke();

  // Spots
  ctx.fillStyle = '#1a1a1a';
  for (const [sx, sy] of [[3, -6], [3, 6], [-7, -6], [-7, 6], [-2, 0]]) {
    ctx.beginPath();
    ctx.arc(sx, sy, 2.2, 0, TAU);
    ctx.fill();
  }

  // Head
  ctx.beginPath();
  ctx.ellipse(13, 0, 5, 7, 0, 0, TAU);
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(15, -3, 1, 0, TAU);
  ctx.arc(15, 3, 1, 0, TAU);
  ctx.fill();

  // Antennae
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(16, -3);
  ctx.quadraticCurveTo(22, -7, 24, -10);
  ctx.moveTo(16, 3);
  ctx.quadraticCurveTo(22, 7, 24, 10);
  ctx.stroke();
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  ctx.arc(24, -10, 1.4, 0, TAU);
  ctx.arc(24, 10, 1.4, 0, TAU);
  ctx.fill();

  ctx.restore();
}

/** Horizontal velocity arrow; head proportions match the original drawing. */
function velArrow(x, y, length, color, width, head) {
  if (Math.abs(length) < 2) return;
  arrow(ctx, x, y, x + length, y, { color, width, head: head * 1.03, spread: 0.507 });
}

function drawVectors(lb) {
  if (!state.showVectors) return;
  const cx = toCanvasX(lb.x);
  if (cx < 18 || cx > W - 18) return;
  const SCALE = 0.55;
  const beltVx = onBelt(lb) ? state.beltVx : 0;

  velArrow(cx, lb.y - 22, lb.vx * SCALE, C_OWN, 2.5, 9);
  if (onBelt(lb) && Math.abs(beltVx) > 0.5) {
    velArrow(cx, lb.y - 36, beltVx * SCALE, C_BELT, 2.5, 9);
  }
  velArrow(cx, lb.y + 22, (lb.vx + beltVx) * SCALE, C_GROUND, 3, 10);
}

function drawLegend() {
  if (!state.showVectors) return;
  const x = 14, y = PLAY_BOTTOM - 70;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, 210, 60, 4);
  ctx.fill();
  ctx.stroke();

  ctx.font = font(12, { weight: 400 });
  ctx.textBaseline = 'middle';
  const rows = [
    [C_OWN, 'սեփական արագություն'],
    [C_BELT, 'ժապավենի արագություն'],
    [C_GROUND, 'արդյունարար (գետին)'],
  ];
  rows.forEach(([color, label], i) => {
    ctx.fillStyle = color;
    ctx.fillRect(x + 10, y + 14 + 16 * i, 16, 3);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillText(label, x + 32, y + 15 + 16 * i);
  });
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  drawGround();
  drawBelt();
  drawRuler();
  drawMeetingMarker();
  drawHeader();

  drawVectors(state.lb1);
  drawVectors(state.lb2);
  drawLadybug(state.lb1);
  drawLadybug(state.lb2);

  drawLegend();
}

// ---------- Readouts ----------
const fmt = (v) => ((v >= 0 ? '+' : '') + v.toFixed(0)).padStart(5, ' ');
const offScreenStr = (lb) => ((lb.x < WORLD_MIN || lb.x > WORLD_MAX) ? ' • էկրանից դուրս' : '');

const readoutEls = { r1: byId('r1'), r2: byId('r2'), rb: byId('rb') };
const lastHTML = {};
function setReadout(id, html) {
  if (lastHTML[id] === html) return;
  lastHTML[id] = html;
  readoutEls[id].innerHTML = html;
}

function surfaceLine(lb) {
  const on = onBelt(lb);
  return `<span style="color:${on ? lb.color : 'var(--text-3)'}">${on ? 'Դիրքը՝ ժապավենի վրա' : 'Դիրքը՝ գետնի վրա'}</span>`;
}

function updateReadouts() {
  const { lb1, lb2 } = state;

  setReadout('r1',
    `x = ${lb1.x.toFixed(1)} սմ${offScreenStr(lb1)}<br>` +
    `սեփական V<sub>x</sub>: ${fmt(lb1.vx)} սմ/վ<br>` +
    `Երկրի նկատմամբ V<sub>x</sub>: ${fmt(groundVx(lb1))} սմ/վ<br>` +
    surfaceLine(lb1));

  setReadout('r2',
    `x = ${lb2.x.toFixed(1)} սմ${offScreenStr(lb2)}<br>` +
    `սեփական V<sub>x</sub>: ${fmt(lb2.vx)} սմ/վ<br>` +
    `Երկրի նկատմամբ. V<sub>x</sub>: ${fmt(groundVx(lb2))} սմ/վ<br>` +
    surfaceLine(lb2));

  const dirArrow = state.beltVx > 0 ? '→' : (state.beltVx < 0 ? '←' : '—');
  setReadout('rb',
    `V<sub>x</sub> = ${fmt(state.beltVx)} սմ/վ<br>` +
    `ուղղ.: ${dirArrow}<br>` +
    `հանդիպումներ: ${state.meetings.length}`);
}

// ---------- Main loop ----------
startLoop((dt) => {
  if (!state.paused) update(dt);
  draw();
  updateReadouts();
});
