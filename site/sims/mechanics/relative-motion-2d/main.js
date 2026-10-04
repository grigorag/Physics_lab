// Relative motion in 2D: two ladybugs crawl on the ground and across a
// horizontal conveyor belt. On the belt the belt velocity adds to a bug's own
// velocity; the arrows show own, belt and ground-frame (resultant) velocity.
//
// Fixed 800 × 520 canvas coordinates, y down; velocities in px/s.

import { fixedCanvas } from '../../../assets/js/core/canvas.js';
import { bindRange, bindCheckbox, bindPlayPause, onClick } from '../../../assets/js/core/controls.js';
import { setHTML } from '../../../assets/js/core/dom.js';
import { startLoop } from '../../../assets/js/core/loop.js';
import {
  W, H, BELT_TOP, BELT_BOTTOM,
  drawGround, drawBelt, drawLadybug, drawVectors, drawLegend,
} from './scene.js';

const { ctx } = fixedCanvas(document.getElementById('cv'), W, H);

// ---------- State ----------
const state = {
  paused: false,
  showVectors: true,
  beltVx: 60,
  beltPhase: 0, // animated offset for chevrons
  lb1: { x0: 120, y0: 90,  vx: 40, vy: 20, x: 120, y: 90,  color: '#c14a3a' },
  lb2: { x0: 120, y0: 260, vx: 30, vy: 0,  x: 120, y: 260, color: '#2b6bb0' },
};
const bugs = [state.lb1, state.lb2];

// ---------- Controls ----------
// Each slider writes one state field. A new start position takes effect on reset.
state.beltVx = bindRange('belt-vx', { onInput: (v) => { state.beltVx = v; } }).value;
for (const [key, lb] of [['lb1', state.lb1], ['lb2', state.lb2]]) {
  for (const field of ['x0', 'y0', 'vx', 'vy']) {
    lb[field] = bindRange(`${key}-${field}`, { onInput: (v) => { lb[field] = v; } }).value;
  }
}

bindPlayPause('playBtn', { paused: false, onChange: (p) => { state.paused = p; } });
bindCheckbox('vectorsToggle', { onChange: (on) => { state.showVectors = on; } });

function reset() {
  for (const lb of bugs) { lb.x = lb.x0; lb.y = lb.y0; }
  state.beltPhase = 0;
}
onClick('resetBtn', reset);
reset();

// ---------- Physics ----------
const onBelt = (lb) => lb.y >= BELT_TOP && lb.y <= BELT_BOTTOM;
/** Belt velocity carried by this bug (0 on the ground). */
const beltVxAt = (lb) => (onBelt(lb) ? state.beltVx : 0);

function update(dt) {
  state.beltPhase += state.beltVx * dt;

  for (const lb of bugs) {
    lb.x += (lb.vx + beltVxAt(lb)) * dt;
    lb.y += lb.vy * dt;

    // Wrap around edges so the bugs don't get lost
    if (lb.x < -20) lb.x = W + 20;
    if (lb.x > W + 20) lb.x = -20;
    if (lb.y < -20) lb.y = H + 20;
    if (lb.y > H + 20) lb.y = -20;
  }
}

// ---------- Drawing ----------
function draw() {
  drawGround(ctx);
  drawBelt(ctx, state.beltPhase, state.beltVx);

  // Vectors below the ladybugs (so the bugs stay visible)
  if (state.showVectors) for (const lb of bugs) drawVectors(ctx, lb, beltVxAt(lb));
  for (const lb of bugs) drawLadybug(ctx, lb, lb.vx + beltVxAt(lb), lb.vy);
  if (state.showVectors) drawLegend(ctx);
}

// ---------- Readouts ----------
const fmt = (v) => ((v >= 0 ? '+' : '') + v.toFixed(0)).padStart(4, ' ');

const shown = {};
function show(id, html) {
  if (shown[id] === html) return;   // avoid touching the DOM every frame
  shown[id] = html;
  setHTML(id, html);
}

function bugReadout(lb) {
  const onB = onBelt(lb);
  const gvx = lb.vx + beltVxAt(lb);
  return `սեփ.: (${fmt(lb.vx)}, ${fmt(lb.vy)})<br>` +
    `գետ.: (${fmt(gvx)}, ${fmt(lb.vy)})<br>` +
    `<span style="color:${onB ? lb.color : 'var(--text-3)'}">${onB ? 'ժապավենի վրա' : 'գետնի վրա'}</span>`;
}

function updateReadouts() {
  show('r1', bugReadout(state.lb1));
  show('r2', bugReadout(state.lb2));
  show('rb', `արագ.: ${fmt(state.beltVx)} px/վ<br>` +
    `ուղղ.: ${state.beltVx > 0 ? '→' : (state.beltVx < 0 ? '←' : '—')}`);
}

// ---------- Main loop ----------
startLoop((dt) => {
  if (!state.paused) update(dt);
  draw();
  updateReadouts();
});
