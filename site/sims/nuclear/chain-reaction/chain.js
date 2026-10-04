// Tab 2 — chain reaction in a round lump of uranium.

import { fluidCanvas, onDrag } from '../../../assets/js/core/canvas.js';
import { bindRange, bindSegmented, bindPlayPause, onClick } from '../../../assets/js/core/controls.js';
import { byId, setText } from '../../../assets/js/core/dom.js';
import { clear, line, text } from '../../../assets/js/core/draw.js';
import { COLORS, alpha, onThemeChange } from '../../../assets/js/core/theme.js';
import { clamp, TAU } from '../../../assets/js/core/math.js';
import { createWorld, buildLump, MEV_PER_FISSION, MEV_TO_J } from './physics.js';
import { C, fmt, sci, int, kVerdict, drawParticles, niceStep } from './shared.js';

const RC = 0.012;          // capture radius, պ.մ.
const SPEED = 0.4;         // neutron speed, պ.մ./s (on screen)
const R_MAX = 1;

export function createChain() {
  const view = fluidCanvas(byId('cScene'), {
    height: (w) => clamp(Math.round(w * 0.62), 330, 520),
    onResize: () => render(),
  });
  const chartView = fluidCanvas(byId('cChart'), {
    height: (w) => clamp(Math.round(w * 0.28), 150, 200),
    onResize: () => drawChart(),
  });
  const { ctx } = view;

  const world = createWorld({ rc: RC, speed: SPEED });
  let paused = false;
  let simSpeed = 1;
  let uiTimer = 0;

  const radius = bindRange('cRadius', { format: (v) => `${fmt(v, 2)} պ.մ.`, onInput: rebuild });
  const enrich = bindRange('cEnrich', { format: (v) => `${v} %`, onInput: rebuild });
  const density = bindRange('cDensity', { format: (v) => String(v), onInput: rebuild });

  /* ---------- World ↔ screen ---------- */
  const scale = () => 0.46 * Math.min(view.width, view.height) / R_MAX;
  const X = (x) => view.width / 2 + x * scale();
  const Y = (y) => view.height / 2 - y * scale();

  function rebuild() {
    world.setFuel(buildLump({
      R: radius.value, density: density.value, enrichment: enrich.value / 100, rc: RC,
    }));
    const n = world.nuclei.length;
    const lambda = 1 / (2 * RC * density.value);
    byId('cInfo').innerHTML = `Միջուկներ՝ <b>${n}</b>, որից <sup>235</sup>U՝ <b>${world.fuel0}</b>։ `
      + `Նեյտրոնի միջին ազատ վազքը մինչև միջուկի հանդիպելը՝ λ ≈ <b>${fmt(lambda, 2)} պ.մ.</b>`;
    render();
    drawChart();
    updateStats();
  }

  /* ---------- Scene ---------- */
  function render() {
    const W = view.width, H = view.height;
    if (!W) return;
    const s = scale();
    clear(ctx, W, H, COLORS.canvasBg);
    const cx = W / 2, cy = H / 2;

    // reference: the largest lump
    ctx.save();
    ctx.setLineDash([3, 6]);
    ctx.strokeStyle = alpha(COLORS.text3, 0.35);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, R_MAX * s, 0, TAU);
    ctx.stroke();
    ctx.restore();

    const R = radius.value * s;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.fillStyle = C.lumpFill;
    ctx.fill();
    ctx.strokeStyle = C.lumpLine;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    drawParticles(ctx, world, { X, Y, s, rNuc: Math.max(1.8, RC * s * 1.15) });

    // radius marker
    const a = Math.PI * 0.25;
    const ex = cx + Math.cos(a) * R, ey = cy + Math.sin(a) * R;
    line(ctx, ex, ey, ex + 14, ey + 14, { color: C.lumpLine, width: 1 });
    text(ctx, 'R', ex + 18, ey + 18, { color: COLORS.text2, size: 13, style: 'italic', family: 'display' });
  }

  /* ---------- Fissions per generation ---------- */
  function drawChart() {
    const { ctx: c, width: W, height: H } = chartView;
    if (!W) return;
    clear(c, W, H, COLORS.canvasBg);
    const padL = 44, padR = 12, top = 26, bottom = H - 24;
    const G = Math.max(10, world.maxGen);
    let maxN = 0;
    for (let g = 1; g <= world.maxGen; g++) maxN = Math.max(maxN, world.gens[g] || 0);
    const step = Math.max(1, niceStep(Math.max(1, maxN) / 4));
    const top_ = Math.max(step, Math.ceil(maxN / step) * step);
    const plotW = W - padL - padR;
    const Yc = (v) => bottom - (v / top_) * (bottom - top);

    for (let v = 0; v <= top_ + 1e-9; v += step) {
      const y = Yc(v);
      line(c, padL, y, W - padR, y, { color: v === 0 ? COLORS.axis : COLORS.grid, width: 1 });
      text(c, String(v), padL - 6, y, { color: COLORS.text3, size: 10, family: 'mono', align: 'right' });
    }
    text(c, 'N (բաժանումներ)', padL, 10, { color: COLORS.text3, size: 11 });

    const bw = plotW / G;
    const every = Math.ceil(G / Math.max(4, Math.floor(plotW / 34)));
    for (let g = 1; g <= G; g++) {
      const x = padL + (g - 1) * bw;
      const n = world.gens[g] || 0;
      if (n > 0) {
        c.fillStyle = alpha(C.u235, 0.75);
        const y = Yc(n);
        c.fillRect(x + bw * 0.14, y, bw * 0.72, bottom - y);
      }
      if (g % every === 0 || g === 1) {
        text(c, String(g), x + bw / 2, bottom + 11, { color: COLORS.text3, size: 10, family: 'mono', align: 'center' });
      }
    }
    text(c, 'սերունդ g', W - padR, 10, { color: COLORS.text3, size: 11, align: 'right' });
    if (!world.fissions) {
      text(c, 'Դեռ բաժանումներ չկան', padL + plotW / 2, (top + bottom) / 2, { color: COLORS.text3, size: 12, align: 'center' });
    }
  }

  /* ---------- Numbers ---------- */
  function updateStats() {
    const w = world;
    setText('cGen', String(w.maxGen));
    setText('cFis', `${int(w.fissions)} (${w.fuel0 ? fmt((100 * w.fissions) / w.fuel0, 0) : 0} %)`);
    setText('cNeu', int(w.neutrons.length));
    setText('cEsc', int(w.escaped));
    setText('cCap', int(w.captured));
    setText('cEMeV', `${int(w.energyMeV)} ՄէՎ`);
    setText('cEJ', `${sci(w.energyMeV * MEV_TO_J, 2)} Ջ`);
    const k = w.k;
    setText('cK', k === k ? fmt(k, 2) : '—');

    const box = byId('cVerdict');
    const v = kVerdict(k);
    const running = w.neutrons.length > 0;
    let html;
    if (!w.fired) {
      html = 'Արձակեք նեյտրոն կենտրոնից կամ սեղմեք կտորի ներսում։';
    } else if (!v) {
      html = running ? 'Ռեակցիան ընթանում է… k-ն չափվում է։'
        : 'Նեյտրոնը դուրս թռավ կամ կլանվեց՝ ոչ մի բաժանում չառաջացնելով։ Փորձեք ևս մեկ անգամ։';
    } else {
      const kk = fmt(k, 2);
      if (v.cls === 'red') html = `k ≈ ${kk} &lt; 1՝ <b>մարող</b> ռեակցիա. նեյտրոնների մեծ մասը դուրս է թռչում կամ կլանվում <sup>238</sup>U-ով։`;
      else if (v.cls === 'amber') html = `k ≈ ${kk}՝ <b>կրիտիկական</b> վիճակ. բաժանումների թիվը սերնդից սերունդ մոտավորապես չի փոխվում։`;
      else html = `k ≈ ${kk} &gt; 1՝ <b>աճող</b> ռեակցիա (պայթյուն). բաժանումների թիվը յուրաքանչյուր սերնդում մեծանում է մոտ ${kk} անգամ։`;
      if (!running) html += ` Ռեակցիան ավարտվեց՝ բաժանվեց ${fmt((100 * w.fissions) / w.fuel0, 0)} % <sup>235</sup>U։`;
    }
    box.innerHTML = html;
    box.style.setProperty('--accent', v ? `var(--${v.cls})` : 'var(--green)');
  }

  /* ---------- Controls ---------- */
  onClick('cFire', () => { world.fire(0, 0); updateStats(); });
  onClick('cReset', rebuild);
  bindSegmented('cSpeed', { onChange: (v) => { simSpeed = parseFloat(v); } });
  bindPlayPause('cPlay', { onChange: (p) => { paused = p; } });

  onDrag(view, {
    start: (p) => {
      const s = scale();
      const x = (p.x - view.width / 2) / s, y = (view.height / 2 - p.y) / s;
      if (Math.hypot(x, y) > radius.value) return false;
      world.fire(x, y);
      updateStats();
      return false;
    },
  });

  onThemeChange(() => { render(); drawChart(); });

  rebuild();

  return {
    world,
    show() { render(); drawChart(); },
    frame(dt) {
      if (!paused) world.step(dt * simSpeed);
      render();
      uiTimer += dt;
      if (uiTimer > 0.1) {
        uiTimer = 0;
        updateStats();
        drawChart();
      }
    },
  };
}
