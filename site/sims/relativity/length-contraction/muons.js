// Tab 2: cosmic muons seen from the Earth frame (time dilation) and from the
// muon frame (the atmosphere is contracted). Both panels use the same
// vertical scale (px per km) and show the same instant of the flight.

import { fluidCanvas } from '../../../assets/js/core/canvas.js';
import { bindRange, bindPlayPause, onClick } from '../../../assets/js/core/controls.js';
import { clear, line, arrow, text } from '../../../assets/js/core/draw.js';
import { COLORS, alpha } from '../../../assets/js/core/theme.js';
import { byId, setText, setHTML } from '../../../assets/js/core/dom.js';
import { clamp } from '../../../assets/js/core/math.js';
import { muon as muonPhysics, MUON_TAU } from './physics.js';
import { fmtTime, fmtPercent } from './format.js';

const N = 40;                 // muons in the bunch
const AXIS_KM = 16;           // altitude range of a panel
const FLIGHT = 6;             // seconds of animation for the whole flight
const HOLD = 1.6;             // pause at the ground before restarting
const SIDE_BY_SIDE = 560;     // canvas width from which the panels sit next to each other

// Proper decay times as exact quantiles of the exponential law, so that the
// number still alive at proper time τ is N·e^(−τ/τ₀) (rounded).
const DECAY = Array.from({ length: N }, (_, i) => -MUON_TAU * Math.log((i + 0.5) / N));
const SLOT = Array.from({ length: N }, (_, i) => (i * 17) % N);       // horizontal order
const JITTER = Array.from({ length: N }, (_, i) => ((i * 7) % 5) - 2);

export function createMuons() {
  const state = { beta: 0.995, h: 10, p: 0, hold: 0, paused: false };
  let phys = muonPhysics(state.beta, state.h);

  const view = fluidCanvas(byId('muScene'), {
    height: (w) => (w >= SIDE_BY_SIDE ? Math.round(clamp(w * 0.5, 340, 450)) : 2 * 290 + 10),
  });

  function step(dt) {
    if (state.paused) return;
    if (state.p < 1) {
      state.p = Math.min(1, state.p + dt / FLIGHT);
    } else {
      state.hold += dt;
      if (state.hold > HOLD) { state.p = 0; state.hold = 0; }
    }
  }

  function panels() {
    const { width: W, height: H } = view;
    if (W >= SIDE_BY_SIDE) {
      const w = (W - 1) / 2;
      return [{ x: 0, y: 0, w, h: H }, { x: w + 1, y: 0, w, h: H }];
    }
    const h = (H - 1) / 2;
    return [{ x: 0, y: 0, w: W, h }, { x: 0, y: h + 1, w: W, h }];
  }

  function drawPanel(ctx, r, earth) {
    const g = phys.gamma;
    const tau = state.p * phys.tMuon;             // proper time of the muons now
    const yTop = r.y + 56;
    const yGround0 = r.y + r.h - 30;
    const km = (yGround0 - yTop) / AXIS_KM;       // px per km
    const yCreate = yGround0 - state.h * km;      // screen level where the muons are born
    const f = earth ? 1 : 1 / g;                  // contraction of everything fixed to the Earth

    // Earth frame: ground at rest, muons fall. Muon frame: muons at rest, the
    // ground (and the whole atmosphere layer) rises.
    const yMu = earth ? yCreate + state.p * state.h * km : yCreate;
    const yGround = earth ? yGround0 : yCreate + state.h * f * (1 - state.p) * km;
    const yLayer = yGround - state.h * f * km;    // top of the layer = where the muons were born

    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();

    // atmosphere layer of (contracted) thickness h·f
    ctx.fillStyle = alpha(COLORS.blue, 0.1);
    ctx.fillRect(r.x, yLayer, r.w, yGround - yLayer);
    line(ctx, r.x, yLayer, r.x + r.w, yLayer, { color: alpha(COLORS.blue, 0.7), dash: [5, 4] });

    // ground with a mountain, squeezed vertically in the muon frame
    const peak = (dx, hKm) => [r.x + r.w * dx, yGround - hKm * km * f];
    ctx.beginPath();
    ctx.moveTo(r.x, yGround);
    ctx.lineTo(...peak(0.06, 0));
    ctx.lineTo(...peak(0.14, 1.6));
    ctx.lineTo(...peak(0.19, 0.9));
    ctx.lineTo(...peak(0.25, 2.4));
    ctx.lineTo(...peak(0.36, 0));
    ctx.lineTo(r.x + r.w, yGround);
    ctx.lineTo(r.x + r.w, r.y + r.h);
    ctx.lineTo(r.x, r.y + r.h);
    ctx.closePath();
    ctx.fillStyle = alpha(COLORS.green, 0.22);
    ctx.fill();
    ctx.strokeStyle = COLORS.green;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // altitude marks fixed to the Earth
    for (let a = 5; a <= 15; a += 5) {
      const y = yGround - a * km * f;
      if (y < r.y + 44) continue;
      line(ctx, r.x, y, r.x + 7, y, { color: COLORS.text3 });
      if (earth && Math.abs(a - state.h) > 0.7) text(ctx, `${a} կմ`, r.x + 11, y, { color: COLORS.text3, size: 10, family: 'mono' });
    }

    // thickness of the layer
    const xd = r.x + r.w - 16;
    const yA = Math.max(yLayer, r.y + 46);
    line(ctx, xd, yA, xd, yGround, { color: COLORS.text2, width: 1.2 });
    line(ctx, xd - 4, yA, xd + 4, yA, { color: COLORS.text2, width: 1.2 });
    line(ctx, xd - 4, yGround, xd + 4, yGround, { color: COLORS.text2, width: 1.2 });
    const dimText = earth ? `h = ${state.h.toFixed(1)} կմ` : `h/γ = ${phys.hMuonKm.toFixed(2)} կմ`;
    const yDim = clamp((yA + yGround) / 2, r.y + 62, r.y + r.h - 12);
    text(ctx, dimText, xd - 8, earth ? yDim : Math.max(yDim, yCreate + 16),
      { color: COLORS.text, size: 11, family: 'mono', align: 'right' });

    // the bunch
    const x0 = r.x + r.w * 0.42;
    const x1 = r.x + r.w * 0.66;
    const rad = r.w > 380 ? 3 : 2.5;
    let alive = 0;
    for (let i = 0; i < N; i++) {
      const x = x0 + ((x1 - x0) * SLOT[i]) / (N - 1);
      if (DECAY[i] > tau) {
        alive++;
        ctx.beginPath();
        ctx.arc(x, yMu + JITTER[i] * 2, rad, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.red;
        ctx.fill();
      } else {
        // decayed: a faint ring where it happened
        const frac = DECAY[i] / phys.tMuon;
        const y = earth ? yCreate + frac * state.h * km : yMu;
        ctx.beginPath();
        ctx.arc(x, y + JITTER[i] * 2, rad - 0.5, 0, Math.PI * 2);
        ctx.strokeStyle = alpha(COLORS.red, 0.4);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // mean paths, measured from the birth level (Earth frame)
    if (earth) {
      const yClassic = yCreate + phys.rangeClassicalKm * km;
      const yRel = yCreate + phys.rangeKm * km;
      const xl = x1 + 10;
      line(ctx, x0 - 8, yClassic, x1 + 8, yClassic, { color: COLORS.amber, width: 1.5, dash: [4, 3] });
      text(ctx, `${phys.rangeClassicalKm.toFixed(2)} կմ`, xl + 2, yClassic - 7,
        { color: COLORS.amber, size: 10.5, family: 'mono' });
      if (yRel < yGround0 - 2) {
        line(ctx, x0 - 8, yRel, x1 + 8, yRel, { color: COLORS.red, width: 1.5, dash: [4, 3] });
        text(ctx, `${phys.rangeKm.toFixed(2)} կմ`, xl + 2, yRel + 9,
          { color: COLORS.red, size: 10.5, family: 'mono' });
      }
    }

    // who moves
    if (state.p < 1) {
      if (earth) {
        const xa = x0 - 16;
        arrow(ctx, xa, yMu - 6, xa, yMu + 18, { color: COLORS.red, width: 1.6, head: 7 });
        text(ctx, 'v', xa - 6, yMu + 6, { color: COLORS.red, size: 11, style: 'italic', align: 'right' });
      } else {
        const xa = r.x + r.w * 0.3;
        const yb = Math.min(yGround + 34, r.y + r.h - 8);
        arrow(ctx, xa, yb, xa, yb - 24, { color: COLORS.green, width: 1.6, head: 7 });
        text(ctx, 'v', xa + 8, yb - 10, { color: COLORS.green, size: 11, style: 'italic' });
      }
    }
    ctx.restore();

    // heading and clock
    text(ctx, earth ? 'Երկրի համակարգ' : 'Մյուոնի համակարգ', r.x + 12, r.y + 18,
      { color: COLORS.red, size: 12, weight: 600 });
    const clock = earth ? `t = ${fmtTime(state.p * phys.tEarth)}` : `t′ = ${fmtTime(tau)}`;
    text(ctx, `${clock}   N = ${alive}/${N}`, r.x + 12, r.y + 36, { color: COLORS.text2, size: 11, family: 'mono' });
  }

  function draw() {
    const { ctx, width: W, height: H } = view;
    if (W < 40) return;
    clear(ctx, W, H);
    const [a, b] = panels();
    drawPanel(ctx, a, true);
    drawPanel(ctx, b, false);
    if (W >= SIDE_BY_SIDE) line(ctx, b.x - 0.5, 0, b.x - 0.5, H, { color: COLORS.axis });
    else line(ctx, 0, b.y - 0.5, W, b.y - 0.5, { color: COLORS.axis });
  }

  function update() {
    phys = muonPhysics(state.beta, state.h);
    state.p = 0;
    state.hold = 0;
    setText('muGamma', phys.gamma.toFixed(2));
    setText('muLife', fmtTime(phys.lifeEarth));
    setText('muD0', `${phys.rangeClassicalKm.toFixed(2)} կմ`);
    setText('muD', `${phys.rangeKm.toFixed(2)} կմ`);
    setText('muH', `${phys.hMuonKm.toFixed(2)} կմ`);
    setText('muT1', fmtTime(phys.tEarth));
    setText('muT2', fmtTime(phys.tMuon));
    setText('muN', fmtPercent(phys.survive));
    setText('muN0', fmtPercent(phys.surviveClassical));
    const b = (x) => `<b>${x}</b>`;
    setHTML('muNote',
      `${b('Երկրի համակարգում')} մյուոնի ժամացույցը դանդաղում է γ = ${phys.gamma.toFixed(2)} անգամ. այն միջինում ապրում է ${b(fmtTime(phys.lifeEarth))} և անցնում ${b(`${phys.rangeKm.toFixed(2)} կմ`)}՝ առանց հարաբերականության սպասվող ${phys.rangeClassicalKm.toFixed(2)} կմ-ի փոխարեն։ `
      + `${b('Մյուոնի համակարգում')} նրա կյանքի տևողությունը սովորականն է՝ 2.2 մկվ, բայց ${state.h.toFixed(1)} կմ հաստությամբ մթնոլորտի շերտը կրճատվել է մինչև ${b(`${phys.hMuonKm.toFixed(2)} կմ`)}, և Երկիրը հասնում է նրան ${b(fmtTime(phys.tMuon))}-ում։ `
      + `Երկու դեպքում էլ Երկրի մակերևույթին հասնում է մյուոնների ${b(fmtPercent(phys.survive))}-ը։`);
  }

  bindRange('muBeta', {
    format: (v) => v.toFixed(4),
    onInput: (v) => { state.beta = v; update(); },
  });
  bindRange('muAlt', {
    format: (v) => `${v.toFixed(1)} կմ`,
    onInput: (v) => { state.h = v; update(); },
  });
  const play = bindPlayPause('muPlay', {
    paused: false,
    onChange: (p) => { state.paused = p; },
  });
  onClick('muReset', () => {
    state.p = 0;
    state.hold = 0;
    state.paused = false;
    play.set(false);
  });

  update();

  return {
    frame(dt) {
      step(dt);
      draw();
    },
  };
}
