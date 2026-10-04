// Tab 2 — electron diffraction on a thin polycrystalline graphite foil
// (Thomson / teaching-tube geometry). Electrons arrive one by one and light up
// a fluorescent screen; the glow decays like a phosphor, so the rings follow
// the sliders. The canvas stays dark in both themes.

import { fluidCanvas } from '../../../assets/js/core/canvas.js';
import { bindRange, bindCheckbox } from '../../../assets/js/core/controls.js';
import { byId, setText, setHTML } from '../../../assets/js/core/dom.js';
import { line, text, circle, roundRect } from '../../../assets/js/core/draw.js';
import { DARK, alpha } from '../../../assets/js/core/theme.js';
import { TAU } from '../../../assets/js/core/math.js';
import { M_E, C, deBroglie, speedFromVoltage, braggAngle, ringRadius, GRAPHITE_D, gauss } from './physics.js';
import { sci, num } from './format.js';

const SCREEN_R = 50;             // screen radius, mm
const N = 240;                   // glow buffer resolution (cells across the screen)
const RATE = 9000;               // electrons per second reaching the foil
const TAU_GLOW = 1.3;            // phosphor decay time, s
const BEAM_SIGMA = 0.7;          // beam spot size on the screen, mm
const RING_COLORS = ['amber', 'blue'];
const PHOSPHOR = '#7dffb0';
const NARROW = 620;              // below this width the screen and the scheme are stacked

const schemeHeight = (w) => Math.round(w * 0.42 + 30);
const canvasHeight = (w) => (w < NARROW ? w - 16 + schemeHeight(w) : Math.min(Math.max(w * 0.5, 320), 520));

export function createDiffraction() {
  const view = fluidCanvas(byId('dfCanvas'), { height: canvasHeight });
  const { ctx } = view;

  // glow buffer (float intensities) and its image
  const glow = new Float32Array(N * N);
  const inside = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      inside[j * N + i] = Math.hypot(i + 0.5 - N / 2, j + 0.5 - N / 2) <= N / 2 ? 1 : 0;
    }
  }
  const off = document.createElement('canvas');
  off.width = off.height = N;
  const offCtx = off.getContext('2d');
  const img = offCtx.createImageData(N, N);

  let cur = null;
  let carry = 0;

  const sU = bindRange('dfU', { format: (v) => `${v} Վ`, onInput: update });
  const sL = bindRange('dfL', { format: (v) => `${v} մմ`, onInput: update });
  const cTheory = bindCheckbox('dfTheory');
  const cPause = bindCheckbox('dfPause');

  function update() {
    const U = sU.value;
    const L = sL.value;                               // mm
    const v = speedFromVoltage(M_E, 1, U);
    const lambda = deBroglie(M_E, v);
    const rings = GRAPHITE_D.map((d) => {
      const theta = braggAngle(lambda, d);
      const r = ringRadius(L, theta);                 // mm
      return { d, theta, r, visible: r !== null && r <= SCREEN_R };
    });
    cur = { U, L, v, lambda, rings };

    setText('dfUVal', `${U} Վ`);
    setText('dfV', `${sci(v)} մ/վ`);
    setText('dfBeta', (v / C).toFixed(3));
    setText('dfLam', `${(lambda * 1e9).toFixed(4)} նմ = ${(lambda * 1e10).toFixed(3)} Å`);
    rings.forEach((ring, i) => {
      setText(`dfTh${i + 1}`, ring.theta === null ? 'չկա' : `${((ring.theta * 180) / Math.PI).toFixed(2)}°`);
      setText(`dfR${i + 1}`, ring.r === null ? '—'
        : ring.visible ? `${ring.r.toFixed(1)} մմ`
          : ring.r < 1000 ? `${ring.r.toFixed(0)} մմ (էկրանից դուրս)` : 'էկրանից դուրս');
    });

    const [a, b] = rings;
    let info;
    if (a.visible && b.visible) {
      info = `<b>Էկրանին երկու օղակ է։</b> r₂ / r₁ ≈ d₁ / d₂ ≈ 1.73։ Լարումը մեծացնելիս λ-ն փոքրանում է, և օղակները սեղմվում են։`;
    } else if (a.visible) {
      info = `<b>Էկրանին միայն ներքին օղակն է։</b> d₂ հարթություններից շեղված էլեկտրոններն անցնում են էկրանի կողքով (էկրանի շառավիղը ${SCREEN_R} մմ է)։ Մեծացրեք լարումը կամ փոքրացրեք L-ը։`;
    } else if (a.theta === null) {
      info = '<b>Դիֆրակցիոն օղակներ չկան։</b> λ-ն մեծ է 2d-ից, և Վուլֆ–Բրեգի պայմանը չի կատարվում ոչ մի անկյան համար։ Մեծացրեք լարումը։';
    } else {
      info = `<b>Օղակները էկրանից դուրս են։</b> Շեղված էլեկտրոններն անցնում են էկրանի կողքով (էկրանի շառավիղը ${SCREEN_R} մմ է), և էկրանին երևում է միայն չշեղված փնջի հետքը։ Մեծացրեք լարումը կամ փոքրացրեք L-ը։`;
    }
    if (U > 2500) info += ' <br>v-ն արդեն գերազանցում է 0.1c-ն. ոչ ռելյատիվիստական բանաձևի սխալը λ-ի համար 0.5 %-ից փոքր է։';
    setHTML('dfInfo', info);
  }

  // ---------- electrons → glow ----------

  function hit(x, y) {                                 // x, y in mm from the screen centre
    const i = Math.floor(((x / SCREEN_R) * 0.5 + 0.5) * N);
    const j = Math.floor(((y / SCREEN_R) * 0.5 + 0.5) * N);
    if (i < 0 || j < 0 || i >= N || j >= N) return;
    glow[j * N + i] += 1;
  }

  function emit(count) {
    const [a, b] = cur.rings;
    for (let n = 0; n < count; n++) {
      const u = Math.random();
      if (u < 0.1) {                                   // undeflected beam
        hit(gauss() * BEAM_SIGMA, gauss() * BEAM_SIGMA);
      } else if (u < 0.18) {                           // diffuse (inelastic) background
        hit(gauss() * 16, gauss() * 16);
      } else {
        const ring = u < 0.64 ? a : b;
        if (ring.r === null || ring.r > SCREEN_R + 4) continue;
        const r = ring.r + gauss() * (BEAM_SIGMA + 0.025 * ring.r);
        const phi = Math.random() * TAU;
        hit(r * Math.cos(phi), r * Math.sin(phi));
      }
    }
  }

  function step(dt) {
    const keep = Math.exp(-dt / TAU_GLOW);
    for (let i = 0; i < glow.length; i++) glow[i] *= keep;
    carry += RATE * dt;
    const count = Math.floor(carry);
    carry -= count;
    emit(count);
  }

  function renderGlow() {
    const data = img.data;
    for (let i = 0; i < glow.length; i++) {
      const p = i * 4;
      if (!inside[i]) { data[p + 3] = 0; continue; }
      const I = 1 - Math.exp(-0.55 * glow[i]);
      data[p] = 6 + 200 * I * I * I;
      data[p + 1] = 16 + 239 * I;
      data[p + 2] = 12 + 150 * I * I;
      data[p + 3] = 255;
    }
    offCtx.putImageData(img, 0, 0);
  }

  // ---------- drawing ----------

  function drawScreen(cx, cy, R) {
    const s = R / SCREEN_R;                            // px per mm
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(off, cx - R, cy - R, 2 * R, 2 * R);
    ctx.restore();
    circle(ctx, cx, cy, R, { stroke: alpha(DARK.text3, 0.7), width: 1.5 });

    if (cTheory.checked) {
      cur.rings.forEach((ring, i) => {
        if (!ring.visible) return;
        const color = DARK[RING_COLORS[i]];
        const r = ring.r * s;
        ctx.save();
        ctx.setLineDash([3, 5]);
        circle(ctx, cx, cy, r, { stroke: alpha(color, 0.75), width: 1 });
        ctx.restore();
        // radius label on a ray: ring 1 to the upper right, ring 2 to the lower right
        const ang = i === 0 ? -0.6 : 0.6;
        const px = cx + r * Math.cos(ang), py = cy + r * Math.sin(ang);
        line(ctx, cx, cy, px, py, { color: alpha(color, 0.75), width: 1 });
        const label = `r${i === 0 ? '₁' : '₂'} = ${ring.r.toFixed(1)} մմ`;
        const tx = Math.min(px + 6, cx + R - 78);
        text(ctx, label, tx, py + (i === 0 ? -9 : 10), { color, size: 11, family: 'mono', weight: 600 });
      });
    }

    // 10 mm scale bar
    const bx = cx - R + 4, by = cy + R - 6;
    line(ctx, bx, by, bx + 10 * s, by, { color: DARK.text2, width: 1.5 });
    line(ctx, bx, by - 3, bx, by + 3, { color: DARK.text2, width: 1.5 });
    line(ctx, bx + 10 * s, by - 3, bx + 10 * s, by + 3, { color: DARK.text2, width: 1.5 });
    text(ctx, '10 մմ', bx + 5 * s, by - 10, { color: DARK.text2, size: 10, family: 'mono', align: 'center' });
    text(ctx, 'էկրան (դիմացից)', cx + R, cy - R + 4, { color: DARK.text3, size: 10, align: 'right' });
  }

  /** Side view, to scale: gun → foil → screen. Region (x, y, w, h) in px. */
  function drawScheme(x, y, w, h) {
    const GUN = 55, MAX_L = 300;
    const s = Math.min((w - 16) / (GUN + MAX_L + 12), (h - 56) / (2 * SCREEN_R + 6));
    const fx = x + 8 + GUN * s;                        // foil position
    const cy = y + 22 + (h - 56) / 2;
    const sx = fx + cur.L * s;                         // screen position
    const beam = alpha(PHOSPHOR, 0.9);

    // electron gun
    roundRect(ctx, fx - GUN * s, cy - 9 * s, 34 * s, 18 * s, 3);
    ctx.fillStyle = alpha(DARK.text3, 0.25);
    ctx.fill();
    ctx.strokeStyle = DARK.text3;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    const gy = cy + 9 * s + 11;
    text(ctx, 'էլեկտրոնային', x + 8, gy, { color: DARK.text3, size: 10 });
    text(ctx, 'թնդանոթ', x + 8, gy + 12, { color: DARK.text3, size: 10 });
    text(ctx, `U = ${cur.U} Վ`, x + 8, gy + 26, { color: DARK.text2, size: 11, family: 'mono' });

    // primary beam
    line(ctx, fx - (GUN - 34) * s, cy, sx, cy, { color: beam, width: 1.6 });

    // diffracted rays (cones seen from the side)
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, cy - (SCREEN_R + 3) * s, w, 2 * (SCREEN_R + 3) * s);
    ctx.clip();
    cur.rings.forEach((ring, i) => {
      if (ring.r === null) return;
      const color = DARK[RING_COLORS[i]];
      for (const sgn of [1, -1]) {
        line(ctx, fx, cy, sx, cy + sgn * ring.r * s, { color: alpha(color, ring.visible ? 0.9 : 0.35), width: 1.3 });
      }
    });
    ctx.restore();

    // foil
    line(ctx, fx, cy - 11 * s, fx, cy + 11 * s, { color: DARK.text, width: 2.5 });
    text(ctx, 'գրաֆիտ', fx, cy - 11 * s - 10, { color: DARK.text2, size: 10, align: 'center' });

    // screen
    line(ctx, sx, cy - SCREEN_R * s, sx, cy + SCREEN_R * s, { color: PHOSPHOR, width: 3, cap: 'round' });
    cur.rings.forEach((ring, i) => {
      if (!ring.visible) return;
      for (const sgn of [1, -1]) circle(ctx, sx, cy + sgn * ring.r * s, 2.6, { fill: DARK[RING_COLORS[i]] });
    });
    const labelRight = sx + 44 < x + w;
    text(ctx, 'էկրան', labelRight ? sx + 7 : sx - 7, cy - SCREEN_R * s + 6, {
      color: DARK.text2, size: 10, align: labelRight ? 'left' : 'right',
    });

    // L dimension
    const dy = cy + SCREEN_R * s + 14;
    line(ctx, fx, dy, sx, dy, { color: DARK.text3, width: 1 });
    line(ctx, fx, dy - 4, fx, dy + 4, { color: DARK.text3, width: 1 });
    line(ctx, sx, dy - 4, sx, dy + 4, { color: DARK.text3, width: 1 });
    text(ctx, `L = ${cur.L} մմ`, (fx + sx) / 2, dy + 11, { color: DARK.text2, size: 11, family: 'mono', align: 'center' });
  }

  function frame(dt) {
    const W = view.width, Hh = view.height;
    if (W < 50 || !cur) return;
    if (!cPause.checked) step(dt);
    renderGlow();

    ctx.clearRect(0, 0, W, Hh);
    if (W < NARROW) {
      const R = (W - 32) / 2;
      drawScreen(W / 2, 8 + R, R);
      drawScheme(4, W - 16, W - 8, schemeHeight(W));
    } else {
      const R = (Hh - 28) / 2;
      drawScreen(W - 14 - R, Hh / 2, R);
      drawScheme(6, 70, W - 2 * R - 34, Hh - 90);
    }
  }

  update();
  return { frame };
}
