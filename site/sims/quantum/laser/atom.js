// Tab «Ատոմ և ֆոտոն»: absorption, spontaneous and stimulated emission
// on a single two-level atom.

import { fluidCanvas } from '../../../assets/js/core/canvas.js';
import { bindRange, onClick } from '../../../assets/js/core/controls.js';
import { clear, line, arrow, circle, text } from '../../../assets/js/core/draw.js';
import { COLORS, alpha, themed, currentTheme } from '../../../assets/js/core/theme.js';
import { clamp, lerp, TAU } from '../../../assets/js/core/math.js';
import { wavelengthToRGB } from '../../../assets/js/core/color.js';
import { setText, setHTML } from '../../../assets/js/core/dom.js';
import { ATOM, wavelength, resonant, randomLifetime } from './physics.js';

const SPEED = 1.0;        // photon speed, scene units per second (atom → edge ≈ 1 unit)
const START = -1.3;       // where an incoming photon appears (scene units)
const PACKET = 58;        // length of the drawn wave packet, px
const SPLIT = 9;          // half-distance between the two stimulated photons, px
const MIN_LIFE = 0.8;     // the excited atom is shown at least this long, s

const eV = (E) => `${E.toFixed(2)} էՎ`;

export function createAtomTab() {
  const C = themed(() => ({
    nucleus: COLORS.coral,
    electron: COLORS.blue,
    up: COLORS.green,
    down: COLORS.amber,
  }));

  const view = fluidCanvas(document.getElementById('aScene'), {
    height: (w) => (w < 560 ? 420 : clamp(Math.round(w * 0.46), 290, 400)),
  });

  const state = {
    t: 0,
    excited: false,
    level: 0,              // animated electron position: 0 = E1 … 1 = E2
    angle: 0,              // electron angle on its orbit
    excitedSince: 0,
    decayAt: Infinity,
    photons: [],
    flash: null,           // { dir: +1 | −1, t } – transition arrow on the level diagram
    ring: -10,             // time of the last emission/absorption (glow around the atom)
    lastLife: null,
    lastAngle: null,
  };

  const energy = bindRange('aEnergy', { format: eV, onInput: updateStats });

  onClick('aAbsorb', () => { prepare(false); fire(); });
  onClick('aSpont', () => {
    prepare(true);
    scheduleDecay();
    say('<b>Ինքնակամ ճառագայթում.</b> ատոմը գրգռված է (էլեկտրոնը E₂ մակարդակում է)։ Ոչ ոք չի կարող կանխատեսել, թե որ պահին այն կճառագայթի. սպասենք…');
  });
  onClick('aStim', () => { prepare(true); fire(); });
  onClick('aFire', () => fire());

  function say(html) { setHTML('aCallout', html); }

  function prepare(excited) {
    state.photons = [];
    state.excited = excited;
    state.level = excited ? 1 : 0;
    state.excitedSince = state.t;
    state.decayAt = Infinity;
    state.flash = null;
    updateStats();
  }

  function scheduleDecay() {
    state.decayAt = state.t + Math.max(MIN_LIFE, randomLifetime(ATOM.tau));
  }

  function fire() {
    if (state.photons.some((p) => p.incoming && !p.done)) return;
    const E = energy.value;
    state.photons.push({
      ox: START, oy: 0, dx: 1, dy: 0, s: 0, E, phase: 0, off: 0, splitAt: 0, incoming: true, done: false,
    });
    const note = resonant(E)
      ? `դրա էներգիան ճիշտ հավասար է E₂ − E₁ = ${eV(ATOM.dE)}-ի`
      : `դրա էներգիան հավասար չէ E₂ − E₁ = ${eV(ATOM.dE)}-ի`;
    say(`Ատոմին է մոտենում hν = ${eV(E)} էներգիայով ֆոտոն. ${note}։ Ատոմը ${state.excited ? 'գրգռված' : 'հիմնական'} վիճակում է։`);
  }

  /** The incoming photon has reached the atom. */
  function resolve(p) {
    p.done = true;
    if (!resonant(p.E)) {
      say(`<b>Ֆոտոնն անցավ առանց փոխազդելու.</b> hν = ${eV(p.E)} ≠ E₂ − E₁ = ${eV(ATOM.dE)}։ Ատոմը կարող է կլանել ֆոտոնը կամ հարկադրաբար ճառագայթել միայն այն դեպքում, երբ hν = E₂ − E₁։`);
      if (state.excited && state.decayAt === Infinity) scheduleDecay();
      return;
    }
    if (!state.excited) {
      p.dead = true;
      state.excited = true;
      state.excitedSince = state.t;
      state.flash = { dir: 1, t: state.t };
      state.ring = state.t;
      scheduleDecay();
      say('<b>Կլանում.</b> ֆոտոնի էներգիան ճիշտ հավասար է E₂ − E₁-ին. ֆոտոնն անհետացավ, իսկ էլեկտրոնն անցավ E₂ մակարդակ։ Ատոմը գրգռված է և որոշ ժամանակ անց ինքնակամ կճառագայթի։');
    } else {
      state.excited = false;
      state.decayAt = Infinity;
      state.flash = { dir: -1, t: state.t };
      state.ring = state.t;
      p.off = -1;
      p.splitAt = state.t;
      state.photons.push({ ...p, off: 1, incoming: false });
      say('<b>Հարկադրական ճառագայթում.</b> ֆոտոնը «ստիպեց» գրգռված ատոմին ճառագայթել։ Ատոմից հեռանում են երկու միանման ֆոտոններ՝ նույն էներգիայով, նույն ուղղությամբ և նույն փուլով. լույսն ուժեղացավ։');
    }
    updateStats();
  }

  function emitSpontaneous() {
    const th = Math.random() * TAU;
    state.excited = false;
    state.decayAt = Infinity;
    state.flash = { dir: -1, t: state.t };
    state.ring = state.t;
    state.lastLife = state.t - state.excitedSince;
    state.lastAngle = (th * 180) / Math.PI;
    state.photons.push({
      ox: 0, oy: 0, dx: Math.cos(th), dy: -Math.sin(th), s: 0.1, E: ATOM.dE,
      phase: Math.random() * TAU, off: 0, splitAt: 0, incoming: false, done: true,
    });
    say(`<b>Ինքնակամ ճառագայթում.</b> ${state.lastLife.toFixed(1)} վ անց ատոմն ինքն իրեն վերադարձավ հիմնական վիճակ և արձակեց hν = E₂ − E₁ = ${eV(ATOM.dE)} էներգիայով ֆոտոն՝ պատահական ուղղությամբ և պատահական փուլով։`);
    updateStats();
  }

  function updateStats() {
    const E = energy.value;
    setText('aHnu', eV(E));
    setText('aLambda', `${wavelength(E).toFixed(0)} նմ`);
    setText('aMatch', resonant(E) ? 'այո' : 'ոչ');
    setText('aState', state.excited ? 'գրգռված (E₂)' : 'հիմնական (E₁)');
    setText('aLife', state.lastLife === null ? '—' : `${state.lastLife.toFixed(1)} վ`);
    setText('aDir', state.lastAngle === null ? '—' : `${state.lastAngle.toFixed(0)}°`);
  }

  /* ---------------- drawing ---------------- */

  function photonColor(E) {
    const rgb = wavelengthToRGB(clamp(wavelength(E), 400, 700));
    const k = currentTheme() === 'light' ? 0.78 : 1;
    return `rgb(${rgb.map((c) => Math.round(c * k)).join(',')})`;
  }

  /** Wavy arrow whose head is at (x, y), pointing along (dx, dy). */
  function wavyArrow(ctx, x, y, dx, dy, E, phase, color) {
    const k = (TAU / 16) * (E / ATOM.dE);       // shorter wavelength for a larger energy
    const nx = -dy, ny = dx;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let s = -PACKET; s <= -7; s += 1) {
      const taper = Math.min(1, (-7 - s) / 8, (s + PACKET) / 6);
      const a = 5.5 * taper * Math.sin(k * s + phase);
      const px = x + dx * s + nx * a, py = y + dy * s + ny * a;
      if (s === -PACKET) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - dx * 9 + nx * 4.5, y - dy * 9 + ny * 4.5);
    ctx.lineTo(x - dx * 9 - nx * 4.5, y - dy * 9 - ny * 4.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawScene(ctx, r) {
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const S = r.w / 2 / 1.05;                       // px per scene unit
    const r1 = clamp(S * 0.17, 20, 44), r2 = r1 * 2;

    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();

    // Axis of the incoming photon
    line(ctx, r.x, cy, r.x + r.w, cy, { color: COLORS.grid, width: 1, dash: [4, 6] });

    // Glow right after a transition
    const age = state.t - state.ring;
    if (age < 0.6) {
      circle(ctx, cx, cy, r2 + 6 + age * 30, { stroke: alpha(COLORS.amber, 0.5 * (1 - age / 0.6)), width: 3 });
    }

    // Orbits, nucleus, electron
    circle(ctx, cx, cy, r1, { stroke: COLORS.axis, width: 1.2 });
    ctx.save();
    ctx.setLineDash([4, 4]);
    circle(ctx, cx, cy, r2, { stroke: COLORS.axis, width: 1.2 });
    ctx.restore();
    text(ctx, 'E₁', cx + r1 * 0.72 + 4, cy + r1 * 0.72 + 6, { color: COLORS.text3, size: 11 });
    text(ctx, 'E₂', cx + r2 * 0.72 + 4, cy + r2 * 0.72 + 6, { color: COLORS.text3, size: 11 });
    circle(ctx, cx, cy, 7, { fill: C.nucleus });
    const re = lerp(r1, r2, state.level);
    const ex = cx + re * Math.cos(state.angle), ey = cy - re * Math.sin(state.angle);
    circle(ctx, ex, ey, 5, { fill: C.electron, stroke: COLORS.canvasBg, width: 1.5 });

    // Photons
    for (const p of state.photons) {
      const lateral = p.off * SPLIT * clamp((state.t - p.splitAt) / 0.2, 0, 1);
      const x = cx + (p.ox + p.dx * p.s) * S - p.dy * lateral;
      const y = cy + (p.oy + p.dy * p.s) * S + p.dx * lateral;
      wavyArrow(ctx, x, y, p.dx, p.dy, p.E, p.phase, photonColor(p.E));
    }
    ctx.restore();

    text(ctx, state.excited ? 'ատոմը գրգռված է' : 'ատոմը հիմնական վիճակում է', cx, r.y + r.h - 14, {
      color: COLORS.text2, size: 12, align: 'center',
    });
  }

  function drawLevels(ctx, r) {
    const E = energy.value;
    const xL = r.x + 34, xR = r.x + r.w - 16;
    const y1 = r.y + r.h - 34;
    const pxPerEv = (r.h - 78) / 3.1;
    const y2 = y1 - ATOM.dE * pxPerEv;

    text(ctx, 'Էներգիական մակարդակներ', r.x + 12, r.y + 16, { color: COLORS.text3, size: 11, weight: 600 });

    line(ctx, xL, y1, xR, y1, { color: COLORS.text, width: 2 });
    line(ctx, xL, y2, xR, y2, { color: COLORS.text, width: 2 });
    text(ctx, 'E₁', xL - 8, y1, { color: COLORS.text2, size: 13, align: 'right' });
    text(ctx, 'E₂', xL - 8, y2, { color: COLORS.text2, size: 13, align: 'right' });
    text(ctx, 'հիմնական', xR, y1 + 12, { color: COLORS.text3, size: 11, align: 'right' });
    text(ctx, 'գրգռված', xR, y2 - 11, { color: COLORS.text3, size: 11, align: 'right' });

    const w = xR - xL;

    // Photon energy as an arrow starting from E1
    const xp = xL + w * 0.2;
    const yp = y1 - E * pxPerEv;
    const pc = photonColor(E);
    arrow(ctx, xp, y1 - 2, xp, yp, { color: pc, width: 2.5, head: 8 });
    line(ctx, xp - 12, yp, xp + 12, yp, { color: pc, width: 1.5, dash: [3, 3] });
    text(ctx, 'hν', xp - 9, (y1 + Math.max(yp, y2)) / 2 + 4, { color: COLORS.text2, size: 12, align: 'right', style: 'italic', family: 'display' });
    text(ctx, eV(E), xp + 16, yp + (Math.abs(yp - y2) < 9 ? (yp <= y2 ? -9 : 10) : 0), { color: COLORS.text2, size: 11, family: 'mono' });

    // ΔE marker
    const xd = xL + w * 0.86;
    arrow(ctx, xd, y1 - 3, xd, y2 + 3, { color: COLORS.text3, width: 1.2, head: 6 });
    arrow(ctx, xd, y2 + 3, xd, y1 - 3, { color: COLORS.text3, width: 1.2, head: 6 });
    text(ctx, eV(ATOM.dE), xd - 7, (y1 + y2) / 2, { color: COLORS.text3, size: 11, family: 'mono', align: 'right' });

    // Electron and the transition arrow
    const xe = xL + w * 0.5;
    const ye = lerp(y1, y2, state.level);
    if (state.flash && state.t - state.flash.t < 1.2) {
      const a = 1 - (state.t - state.flash.t) / 1.2;
      const up = state.flash.dir > 0;
      const col = alpha(up ? C.up : C.down, a);
      const xa = xe + 16;
      if (up) arrow(ctx, xa, y1 - 4, xa, y2 + 4, { color: col, width: 2.5 });
      else arrow(ctx, xa, y2 + 4, xa, y1 - 4, { color: col, width: 2.5 });
    }
    circle(ctx, xe, ye, 6, { fill: C.electron, stroke: COLORS.canvasBg, width: 1.5 });
  }

  function draw() {
    const { ctx, width: W, height: H } = view;
    if (!W) return;
    clear(ctx, W, H, COLORS.canvasBg);
    if (W < 560) {
      const hs = Math.round(H * 0.52);
      drawScene(ctx, { x: 0, y: 0, w: W, h: hs });
      line(ctx, 0, hs, W, hs, { color: COLORS.grid, width: 1 });
      drawLevels(ctx, { x: 0, y: hs, w: W, h: H - hs });
    } else {
      const ws = Math.round(W * 0.62);
      drawScene(ctx, { x: 0, y: 0, w: ws, h: H });
      line(ctx, ws, 0, ws, H, { color: COLORS.grid, width: 1 });
      drawLevels(ctx, { x: ws, y: 0, w: W - ws, h: H });
    }
  }

  function frame(dt) {
    state.t += dt;
    state.angle += dt * (state.excited ? 1.5 : 2.6);
    const target = state.excited ? 1 : 0;
    state.level += clamp(target - state.level, -dt * 5, dt * 5);

    for (const p of state.photons) {
      const before = p.ox + p.dx * p.s;
      p.s += SPEED * dt;
      if (p.incoming && !p.done && before < 0 && p.ox + p.dx * p.s >= 0) resolve(p);
    }
    state.photons = state.photons.filter((p) => !p.dead && p.s < 3.2);

    if (state.excited && state.t >= state.decayAt) emitSpontaneous();
    draw();
  }

  updateStats();
  return { frame };
}
