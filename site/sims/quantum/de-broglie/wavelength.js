// Tab 1 — de Broglie wavelength of a moving object.
// Top of the canvas: a schematic travelling wave packet; bottom: a logarithmic
// length scale (10⁻³⁵ m … 1 m) with λ and a few reference sizes.

import { fluidCanvas } from '../../../assets/js/core/canvas.js';
import { bindRange, bindSelect, bindSegmented } from '../../../assets/js/core/controls.js';
import { byId, $, setText, setHTML } from '../../../assets/js/core/dom.js';
import { line, text, circle } from '../../../assets/js/core/draw.js';
import { COLORS, alpha, font } from '../../../assets/js/core/theme.js';
import { clamp, lerp, TAU } from '../../../assets/js/core/math.js';
import { OBJECTS, H, C, E, deBroglie, speedFromVoltage, voltageForSpeed } from './physics.js';
import { sci, num, round3, sup, niceLength } from './format.js';

const NAMES = {
  electron: 'էլեկտրոն', proton: 'պրոտոն', alpha: 'α-մասնիկ',
  c60: 'C₆₀ մոլեկուլ', dust: 'փոշեհատիկ', ball: 'գնդակ',
};

const LOG_MIN = -35, LOG_MAX = 0;           // range of the length scale, log10(m)
const REFS = [
  { log: -15, label: 'ատոմի միջուկ · 10⁻¹⁵ մ', color: 'coral' },
  { log: -10, label: 'ատոմ · 10⁻¹⁰ մ', color: 'teal' },
  { log: Math.log10(5e-7), label: 'տեսանելի լույսի ալիք · 5·10⁻⁷ մ', color: 'purple' },
  { log: -4, label: 'մազի հաստություն · 10⁻⁴ մ', color: 'blue' },
];
const ROW_H = 18;
const SCALE_H = 100 + REFS.length * ROW_H;   // height of the scale block
const waveHeight = (w) => clamp(w * 0.36, 200, 330);

export function createWavelength() {
  const view = fluidCanvas(byId('wlCanvas'), { height: (w) => waveHeight(w) + SCALE_H });
  const { ctx } = view;

  const anim = { s: 0, phase: 0 };          // packet travel (px) and carrier phase
  let cur = null;                            // current physical values

  const speed = bindRange('wlSpeed', { format: (s) => `${num(round3(10 ** s))} մ/վ`, onInput: update });
  const voltage = bindRange('wlVoltage', { format: (s) => `${num(round3(10 ** s))} Վ`, onInput: update });
  const mode = bindSegmented('wlMode', { onChange: update });
  const object = bindSelect('wlObject', { onChange: onObject });
  const voltageBtn = $('#wlMode button[data-value="voltage"]');

  function onObject() {
    const o = OBJECTS[object.value];
    speed.input.max = o.maxLogV.toFixed(3);
    if (speed.value > o.maxLogV) speed.input.value = o.maxLogV;
    speed.render();
    voltageBtn.disabled = !o.q;
    if (o.q) {
      // the voltage that gives 0.1c
      const maxLogU = Math.log10(voltageForSpeed(o.m, o.q, 10 ** o.maxLogV));
      voltage.input.max = maxLogU.toFixed(3);
      if (voltage.value > maxLogU) voltage.input.value = maxLogU;
      voltage.render();
    } else if (mode.value === 'voltage') {
      mode.set('speed', { silent: true });
    }
    update();
  }

  function update() {
    const o = OBJECTS[object.value];
    const byVoltage = mode.value === 'voltage' && o.q > 0;
    byId('wlSpeedField').hidden = byVoltage;
    byId('wlVoltageField').hidden = !byVoltage;

    let v, U = null;
    if (byVoltage) {
      U = round3(10 ** voltage.value);
      v = speedFromVoltage(o.m, o.q, U);
    } else {
      v = round3(10 ** speed.value);
    }
    const lambda = deBroglie(o.m, v);
    const ek = (o.m * v * v) / 2;
    cur = { key: object.value, m: o.m, v, U, lambda };

    setText('wlM', `${sci(o.m)} կգ`);
    setText('wlV', `${num(v)} մ/վ`);
    setText('wlBeta', num(v / C));
    setText('wlP', `${sci(o.m * v)} կգ·մ/վ`);
    setText('wlE', ek / E < 1e9 ? `${num(ek / E)} էՎ` : `${num(ek)} Ջ`);
    setText('wlL', `${sci(lambda)} մ`);

    const nice = niceLength(lambda);
    setHTML('wlBig', `<b>λ = ${sci(lambda)} մ</b>${nice ? `<br>= ${nice}` : ''}`);
    const ratio = lambda / 1e-10;
    setHTML('wlRatio', ratio >= 1
      ? `<b>${num(ratio)}</b> անգամ մեծ է ատոմից`
      : `<b>${num(1 / ratio)}</b> անգամ փոքր է ատոմից`);

    setText('wlModeHint', !o.q
      ? 'Չեզոք մարմինը էլեկտրական դաշտով չի արագացվում, ուստի տրվում է միայն արագությունը։'
      : byVoltage
        ? `Դադարի վիճակից U լարումով արագացված մասնիկ (լիցքը՝ q = ${o.q === 1 ? 'e' : '2e'})։ Արագությունը չի գերազանցում 0.1c-ն։`
        : 'Արագությունը չի գերազանցում 0.1c-ն, ուստի ռելյատիվիստական ուղղումները կարելի է անտեսել։');

    setHTML('wlInfo', verdict(lambda));
  }

  function verdict(lambda) {
    if (lambda >= 1e-7) {
      return '<b>Ալիքային հատկությունները վառ են արտահայտված։</b> λ-ն շատ ավելի մեծ է ատոմի չափից. այսպիսի դանդաղ մասնիկը դիֆրակցիա կտար նույնիսկ սովորական նեղ ճեղքերի վրա։';
    }
    if (lambda >= 1e-11) {
      return '<b>Ալիքային հատկությունները դիտելի են։</b> λ-ն համեմատելի է բյուրեղում ատոմների միջև հեռավորության հետ (~10⁻¹⁰ մ), ուստի բյուրեղի վրա մասնիկները դիֆրակցիա են տալիս։';
    }
    if (lambda >= 1e-15) {
      return '<b>Ալիքային հատկությունները դժվար է դիտել։</b> λ-ն ատոմից շատ փոքր է. դիֆրակցիա կարելի է նկատել միայն հատուկ, շատ նուրբ փորձերում։';
    }
    return '<b>Ալիքային հատկություններն աննկատելի են։</b> λ-ն անհամեմատ փոքր է նույնիսկ ատոմի միջուկից. բնության մեջ այդքան փոքր արգելքներ չկան, և մարմինը շարժվում է դասական մեխանիկայի օրենքներով։';
  }

  // ---------- drawing ----------

  /** Drawn wavelength in px: monotonic in log λ, clamped to what fits (schematic). */
  function drawnWavelength(W) {
    const t = clamp((Math.log10(cur.lambda) - LOG_MIN) / 32, 0, 1);
    const max = Math.min(140, W * 0.2);
    return 7 * (max / 7) ** t;
  }

  function drawPacket(dt) {
    const W = view.width;
    const h = waveHeight(W);
    const mid = 40 + (h - 40) * 0.46;
    const A = (h - 40) * 0.3;
    const lam = drawnWavelength(W);
    const k = TAU / lam;
    const sigma = Math.max(W * 0.1, lam * 0.85);
    const pxSpeed = lerp(0.07, 0.3, clamp(Math.log10(cur.v) / 7.5, 0, 1)) * W;   // schematic too

    // The envelope moves with the group velocity, the crests with half of it
    // (v_phase = v/2 for a free non-relativistic particle).
    anim.s += pxSpeed * dt;
    anim.phase = (anim.phase + k * pxSpeed * 0.5 * dt) % TAU;
    const span = W + 6 * sigma;
    const xc = (anim.s % span) - 3 * sigma;

    line(ctx, 0, mid, W, mid, { color: COLORS.axis, width: 1 });

    const env = (x) => A * Math.exp(-((x - xc) ** 2) / (2 * sigma * sigma));
    const x0 = Math.max(0, xc - 3.2 * sigma), x1 = Math.min(W, xc + 3.2 * sigma);
    if (x1 > x0) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = alpha(COLORS.pink, 0.45);
      ctx.lineWidth = 1;
      for (const sgn of [1, -1]) {
        ctx.beginPath();
        for (let x = x0; x <= x1; x += 2) ctx.lineTo(x, mid - sgn * env(x));
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.strokeStyle = COLORS.pink;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let x = x0; x <= x1; x += 0.5) ctx.lineTo(x, mid - env(x) * Math.cos(k * (x - xc) + anim.phase));
      ctx.stroke();
      ctx.restore();

      // λ dimension under the packet
      const y = mid + A + 12;
      const a = xc - lam / 2, b = xc + lam / 2;
      if (a > 4 && b < W - 4) {
        line(ctx, a, y, b, y, { color: COLORS.text2, width: 1.2 });
        line(ctx, a, y - 4, a, y + 4, { color: COLORS.text2, width: 1.2 });
        line(ctx, b, y - 4, b, y + 4, { color: COLORS.text2, width: 1.2 });
        text(ctx, 'λ', xc, y + 11, { color: COLORS.text2, size: 12, family: 'mono', align: 'center' });
      }
      // direction of motion
      const ay = mid - A - 12;
      if (xc > 30 && xc < W - 50) {
        line(ctx, xc - 14, ay, xc + 14, ay, { color: COLORS.text3, width: 1.2 });
        line(ctx, xc + 14, ay, xc + 9, ay - 3.5, { color: COLORS.text3, width: 1.2 });
        line(ctx, xc + 14, ay, xc + 9, ay + 3.5, { color: COLORS.text3, width: 1.2 });
        text(ctx, 'v', xc + 20, ay, { color: COLORS.text3, size: 11, family: 'mono', style: 'italic' });
      }
    }

    text(ctx, NAMES[cur.key], 12, 16, { color: COLORS.text2, size: 12, weight: 600 });
    text(ctx, `v = ${num(cur.v)} մ/վ`, 12, 33, { color: COLORS.text3, size: 11, family: 'mono' });
  }

  function drawScale() {
    const W = view.width;
    const top = waveHeight(W);
    const padL = 22, padR = 22;
    const X = (lg) => padL + ((lg - LOG_MIN) / (LOG_MAX - LOG_MIN)) * (W - padL - padR);
    const yAxis = top + 50;

    line(ctx, 0, top, W, top, { color: COLORS.grid, width: 1 });

    // axis with decade ticks
    line(ctx, X(LOG_MIN), yAxis, X(LOG_MAX), yAxis, { color: COLORS.axis, width: 1.5 });
    for (let lg = LOG_MIN; lg <= LOG_MAX; lg++) {
      const major = lg % 5 === 0;
      line(ctx, X(lg), yAxis, X(lg), yAxis + (major ? 7 : 3.5), { color: COLORS.axis, width: 1 });
      if (major && (W >= 520 || lg % 10 === 0)) {
        const label = lg === 0 ? '1 մ' : `10${sup(lg)}`;
        text(ctx, label, X(lg), yAxis + 17, { color: COLORS.text3, size: 10, family: 'mono', align: 'center' });
      }
    }

    // reference sizes: dot on the axis, label in a free row below
    ctx.font = font(11);
    const rowsRight = [];
    const y0 = yAxis + 38;
    for (const ref of REFS) {
      const color = COLORS[ref.color];
      const x = X(ref.log);
      const w = ctx.measureText(ref.label).width + 12;
      const lx = clamp(x - w / 2, 6, W - 6 - w);
      let row = 0;
      while (rowsRight[row] !== undefined && rowsRight[row] + 12 > lx) row++;
      rowsRight[row] = lx + w;
      const y = y0 + row * ROW_H;
      line(ctx, x, yAxis + 25, x, y - 7, { color: alpha(color, 0.55), width: 1, dash: [2, 3] });
      circle(ctx, x, yAxis, 4, { fill: color, stroke: COLORS.canvasBg, width: 1.5 });
      circle(ctx, lx + 3, y, 3, { fill: color });
      text(ctx, ref.label, lx + 12, y, { color: COLORS.text2, size: 11 });
    }

    // λ marker above the axis
    const lg = Math.log10(cur.lambda);
    const x = X(clamp(lg, LOG_MIN, LOG_MAX));
    const c = COLORS.amber;
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(x, yAxis - 3);
    ctx.lineTo(x - 6, yAxis - 14);
    ctx.lineTo(x + 6, yAxis - 14);
    ctx.closePath();
    ctx.fill();
    const label = `λ = ${sci(cur.lambda)} մ`;
    ctx.font = font(12, { family: 'mono', weight: 600 });
    const w = ctx.measureText(label).width;
    const lx = clamp(x - w / 2, 8, W - 8 - w);
    text(ctx, label, lx, yAxis - 26, { color: c, size: 12, family: 'mono', weight: 600 });
  }

  function frame(dt) {
    if (view.width < 50 || !cur) return;
    ctx.clearRect(0, 0, view.width, view.height);
    drawPacket(dt);
    drawScale();
  }

  onObject();
  return { frame };
}
