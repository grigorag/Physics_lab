// Tab 3 — reactor core with control rods.
// Same Monte-Carlo engine as the lump; split ²³⁵U nuclei are replaced after
// ≈ 0.5 s (fresh fuel), so a steady state with k = 1 is possible.

import { fluidCanvas } from '../../../assets/js/core/canvas.js';
import { bindRange, bindCheckbox, onClick } from '../../../assets/js/core/controls.js';
import { byId, setText } from '../../../assets/js/core/dom.js';
import { clear, line, text } from '../../../assets/js/core/draw.js';
import { COLORS, alpha, onThemeChange } from '../../../assets/js/core/theme.js';
import { clamp } from '../../../assets/js/core/math.js';
import { createWorld, buildReactor, MEV_TO_J } from './physics.js';
import { C, fmt, sci, int, drawParticles, niceStep } from './shared.js';

const RC = 0.012;
const SPEED = 0.4;
const CORE = { density: 170, enrichment: 1, strips: 8, stripW: 0.14, gap: 0.16, rodW: 0.1, H: 1.5 };
const NOMINAL = 80;              // fissions per second = 100 % power
const BAND = [70, 130];          // allowed power range, %
const SCRAM_AT = 200;            // automatic protection threshold, %
const ROD_SPEED = 0.25;          // normal drive speed, depth fraction per s
const SCRAM_SPEED = 1.5;         // rods falling in, depth fraction per s
const WINDOW = 40;               // s shown on the power chart
const TOP = 0.32;                // world units above the core for the rod drives

export function createReactor() {
  const view = fluidCanvas(byId('rScene'), {
    height: (w) => clamp(Math.round(w * 0.62), 290, 500),
    onResize: () => render(),
  });
  const chartView = fluidCanvas(byId('rChart'), {
    height: (w) => clamp(Math.round(w * 0.3), 160, 220),
    onResize: () => drawChart(),
  });
  const { ctx } = view;

  const world = createWorld({ rc: RC, speed: SPEED, refuel: 0.5, kTau: 3, rateTau: 1, fragmentLife: 0.8 });
  let core = null;
  let rodDepth = 0.75;           // actual position of the rods (0 = withdrawn, 1 = fully in)
  let scrammed = false;
  let started = false;
  let samples = [];
  let sampleTimer = 0, uiTimer = 0;

  const depth = bindRange('rDepth', {
    format: (v) => `${v} %`,
    onInput: () => { if (scrammed) setScram(false); },
  });
  const auto = bindCheckbox('rAuto');
  const scramBtn = byId('rScram');

  /* ---------- World ↔ screen ---------- */
  function frameGeom() {
    const W = view.width, H = view.height;
    const wW = 2 * core.edge, wH = CORE.H + TOP;
    const s = Math.min((W - 16) / wW, (H - 14) / wH);
    const mid = TOP / 2;                  // world y of the picture centre
    return { s, X: (x) => W / 2 + x * s, Y: (y) => H / 2 - (y - mid) * s };
  }

  function rebuild() {
    core = buildReactor({ ...CORE, rc: RC });
    world.setFuel(core);
    world.absorbers = core.rods(rodDepth);
    samples = [];
    started = false;
    render();
    drawChart();
    updateStats();
  }

  function setScram(on) {
    scrammed = on;
    scramBtn.setAttribute('aria-pressed', String(on));
    if (on) depth.set(100, { silent: true });
  }

  /* ---------- Scene ---------- */
  function render() {
    const W = view.width, H = view.height;
    if (!W || !core) return;
    const { s, X, Y } = frameGeom();
    clear(ctx, W, H, COLORS.canvasBg);
    const h2 = CORE.H / 2;

    // vessel filled with the moderator
    const vx = X(-core.edge), vy = Y(h2), vw = 2 * core.edge * s, vh = CORE.H * s;
    ctx.fillStyle = C.moderator;
    ctx.fillRect(vx, vy, vw, vh);
    ctx.strokeStyle = COLORS.axis;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vx, vy, vw, vh);

    // fuel assemblies
    for (const f of core.strips) {
      ctx.fillStyle = C.fuelFill;
      ctx.fillRect(X(f.x0), Y(h2), (f.x1 - f.x0) * s, CORE.H * s);
      ctx.strokeStyle = C.fuelLine;
      ctx.lineWidth = 1;
      ctx.strokeRect(X(f.x0), Y(h2), (f.x1 - f.x0) * s, CORE.H * s);
    }

    drawParticles(ctx, world, { X, Y, s, fragmentLife: 0.8, rNuc: Math.max(1.6, RC * s * 1.15) });

    // control rods hang from drives above the core
    const rodColor = scrammed ? COLORS.red : C.rod;
    const topY = h2 + TOP * 0.9;
    for (const x of core.rodX) {
      const tip = h2 - rodDepth * CORE.H;
      const x0 = X(x - core.rodW / 2);
      ctx.fillStyle = alpha(rodColor, 0.85);
      ctx.fillRect(x0, Y(topY), core.rodW * s, (topY - tip) * s);
      ctx.fillStyle = rodColor;
      ctx.fillRect(x0 - 3, Y(topY) - 2, core.rodW * s + 6, 7);
    }
    // drive beam
    line(ctx, X(core.rodX[0]) - 6, Y(topY) - 2, X(core.rodX.at(-1)) + 6, Y(topY) - 2, { color: rodColor, width: 2 });

  }

  /* ---------- Power chart ---------- */
  function drawChart() {
    const { ctx: c, width: W, height: H } = chartView;
    if (!W) return;
    clear(c, W, H, COLORS.canvasBg);
    const padL = 44, padR = 12, top = 24, bottom = H - 24;
    const t = world.t;
    const t0 = Math.max(0, t - WINDOW);
    let maxV = 0;
    for (const [ts, v] of samples) if (ts >= t0) maxV = Math.max(maxV, v);
    const yTop = Math.max(240, Math.ceil(maxV * 1.1 / 50) * 50);
    const plotW = W - padL - padR;
    const Xc = (ts) => padL + ((ts - t0) / WINDOW) * plotW;
    const Yc = (v) => bottom - (v / yTop) * (bottom - top);

    // allowed band
    c.fillStyle = alpha(COLORS.green, 0.14);
    c.fillRect(padL, Yc(BAND[1]), plotW, Yc(BAND[0]) - Yc(BAND[1]));
    const ystep = niceStep(yTop / 4);
    for (let v = 0; v <= yTop + 1e-9; v += ystep) {
      const y = Yc(v);
      line(c, padL, y, W - padR, y, { color: v === 0 ? COLORS.axis : COLORS.grid, width: 1 });
      text(c, String(v), padL - 6, y, { color: COLORS.text3, size: 10, family: 'mono', align: 'right' });
    }
    text(c, 'P, % անվանականից', padL, 10, { color: COLORS.text3, size: 11 });
    line(c, padL, Yc(100), W - padR, Yc(100), { color: alpha(COLORS.green, 0.7), width: 1, dash: [4, 4] });
    line(c, padL, Yc(SCRAM_AT), W - padR, Yc(SCRAM_AT), { color: COLORS.red, width: 1.2, dash: [6, 4] });
    text(c, 'SCRAM', W - padR - 2, Yc(SCRAM_AT) - 8, { color: COLORS.red, size: 10, align: 'right', weight: 600 });

    const tstep = W < 520 ? 10 : 5;
    for (let k = Math.ceil(t0 / tstep); k * tstep <= t0 + WINDOW; k++) {
      const x = Xc(k * tstep);
      if (x > W - padR - 30) continue;
      text(c, String(k * tstep), x, bottom + 12, { color: COLORS.text3, size: 10, family: 'mono', align: 'center' });
    }
    text(c, 't, վ', W - padR, bottom + 12, { color: COLORS.text3, size: 11, align: 'right' });
    line(c, padL, top, padL, bottom, { color: COLORS.axis, width: 1 });

    if (samples.length > 1) {
      c.save();
      c.beginPath();
      c.rect(padL, top - 2, plotW, bottom - top + 4);
      c.clip();
      c.strokeStyle = COLORS.amber;
      c.lineWidth = 2;
      c.lineJoin = 'round';
      c.beginPath();
      let first = true;
      for (const [ts, v] of samples) {
        if (ts < t0 - 1) continue;
        if (first) { c.moveTo(Xc(ts), Yc(v)); first = false; } else c.lineTo(Xc(ts), Yc(v));
      }
      c.stroke();
      c.restore();
    }
    if (!started) {
      text(c, 'Սեղմեք «Գործարկել»', padL + plotW / 2, (top + bottom) / 2 + 20, { color: COLORS.text3, size: 12, align: 'center' });
    }
  }

  /* ---------- Numbers and status ---------- */
  function updateStats() {
    const w = world;
    const pct = (w.rate / NOMINAL) * 100;
    const k = w.k;
    setText('rPow', `${fmt(pct, 0)} %`);
    setText('rRate', fmt(w.rate, 0));
    setText('rK', k === k && started ? fmt(k, 2) : '—');
    setText('rNeu', int(w.neutrons.length));
    setText('rRod', `${Math.round(rodDepth * 100)} %`);
    setText('rFuel', `${fmt((100 * w.fuel) / w.fuel0, 0)} %`);
    setText('rE', `${sci(w.energyMeV * MEV_TO_J, 2)} Ջ`);

    let cls = 'green', html;
    const running = w.neutrons.length > 0;
    if (!started) {
      cls = 'blue';
      html = 'Ռեակտորն անջատված է։ Սեղմեք «Գործարկել», ապա ձողերը աստիճանաբար բարձրացրեք։';
    } else if (!running) {
      cls = 'red';
      html = scrammed
        ? '<b>Ռեակտորը կանգ առավ</b>՝ վթարային պաշտպանությունն իջեցրեց բոլոր ձողերը։ Բարձրացրեք ձողերը մի փոքր և նորից գործարկեք։'
        : '<b>Ռեակտորը կանգ առավ</b>. k &lt; 1, նեյտրոնները կլանվեցին։ Բարձրացրեք ձողերը և նորից գործարկեք։';
    } else if (scrammed) {
      cls = 'red';
      html = '<b>Վթարային պաշտպանություն (SCRAM)</b>. բոլոր ձողերն արագ իջնում են, k &lt; 1, շղթայական ռեակցիան մարում է։';
    } else if (pct > BAND[1]) {
      cls = 'amber';
      html = `Հզորությունը <b>չափազանց բարձր</b> է${k > 1.03 ? ' և աճում է (k &gt; 1)' : ''}։ Մի փոքր իջեցրեք ձողերը։`;
    } else if (pct < BAND[0]) {
      cls = k > 1.03 ? 'green' : 'amber';
      html = k > 1.03
        ? 'Հզորությունն աճում է (k &gt; 1)։ Երբ մոտենա կանաչ շերտին, մի փոքր իջեցրեք ձողերը։'
        : `Հզորությունը <b>ցածր</b> է${k < 0.97 ? ' և նվազում է (k &lt; 1)' : ''}։ Մի փոքր բարձրացրեք ձողերը։`;
    } else {
      cls = 'green';
      html = Math.abs(k - 1) < 0.06
        ? '<b>Կայուն աշխատանք</b>. k ≈ 1, ամեն բաժանում առաջացնում է միջինում ևս մեկը։'
        : `Հզորությունը թույլատրելի տիրույթում է, բայց k ≈ ${fmt(k, 2)}. հետևեք գրաֆիկին։`;
    }
    const box = byId('rStatus');
    box.innerHTML = html;
    box.style.setProperty('--accent', `var(--${cls})`);
  }

  /* ---------- Controls ---------- */
  onClick('rStart', () => {
    const fuel = world.nuclei.filter((q) => q.alive && q.type === 235);
    for (let i = 0; i < 8; i++) {
      const q = fuel[Math.floor(Math.random() * fuel.length)];
      world.fire(q.x, q.y);
    }
    started = true;
    updateStats();
  });
  onClick('rReset', () => {
    setScram(false);
    depth.set(75, { silent: true });
    rodDepth = 0.75;
    rebuild();
  });
  onClick('rScram', () => setScram(true));
  onThemeChange(() => { render(); drawChart(); });

  rebuild();

  return {
    show() { render(); drawChart(); },
    frame(dt) {
      // rod drives
      const target = depth.value / 100;
      const v = scrammed ? SCRAM_SPEED : ROD_SPEED;
      if (rodDepth !== target) {
        const d = clamp(target - rodDepth, -v * dt, v * dt);
        rodDepth = Math.abs(target - rodDepth) < 1e-4 ? target : rodDepth + d;
        world.absorbers = core.rods(rodDepth);
      }
      world.step(dt);
      if (auto.checked && !scrammed && (world.rate / NOMINAL) * 100 > SCRAM_AT) setScram(true);

      sampleTimer += dt;
      if (started && sampleTimer >= 0.1) {
        sampleTimer = 0;
        samples.push([world.t, (world.rate / NOMINAL) * 100]);
        while (samples.length && samples[0][0] < world.t - WINDOW - 2) samples.shift();
      }
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
