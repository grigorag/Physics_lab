// Tab 3 — energy of a nuclear reaction, Q = (Σm before − Σm after)·931.494 MeV,
// shown as a move along the E/A curve: from the reactants to the products.

import { fluidCanvas } from '../../../assets/js/core/canvas.js';
import { bindSegmented, onClick } from '../../../assets/js/core/controls.js';
import { byId, setText, setHTML } from '../../../assets/js/core/dom.js';
import { clear, arrow, text, roundRect } from '../../../assets/js/core/draw.js';
import { COLORS, alpha, font, onThemeChange, fontsReady } from '../../../assets/js/core/theme.js';
import { clamp, lerp } from '../../../assets/js/core/math.js';
import { REACTIONS, reactionEnergy, particle, COAL_J_PER_KG } from './physics.js';
import { chartLayout, drawChart } from './chart.js';
import { C, label, html, sci } from './shared.js';

const DURATION = 1.6;     // s, arrow animation

const INFO = {
  dt: {
    fuel: 'դեյտերիումի և տրիտիումի խառնուրդից',
    note: 'Ջերմամիջուկային ռեակտորների (օրինակ՝ ITER) հիմնական ռեակցիան։ Անջատված էներգիայի մեծ մասը՝ ≈14.1 ՄէՎ, տանում է նեյտրոնը, ≈3.5 ՄէՎ՝ α-մասնիկը (<sup>4</sup>He միջուկը)։',
  },
  dd: {
    fuel: 'դեյտերիումից',
    note: 'Դեյտերիումը կա սովորական ջրում՝ ջրածնի մոտ 6400 ատոմից մեկը։ Նույն հավանականությամբ ընթանում է նաև <sup>2</sup>H + <sup>2</sup>H → <sup>3</sup>H + p ռեակցիան (Q ≈ 4.0 ՄէՎ)։',
  },
  pp: {
    fuel: 'ջրածնից',
    note: '<b>Պարզեցում.</b> Արեգակում այս ռեակցիան ընթանում է մի քանի փուլով (պրոտոն-պրոտոնային շղթա)։ Չորս պրոտոնից առաջանում են <sup>4</sup>He միջուկ, 2 պոզիտրոն (e⁺) և 2 նեյտրինո (ν)։ Պոզիտրոնները ոչնչանում են էլեկտրոնների հետ, և ատոմային զանգվածներով հաշվարկն այդ էներգիան ներառում է։ Մոտ 0.5 ՄէՎ տանում են նեյտրինոները։',
  },
  fission: {
    fuel: 'ուրան-235-ից',
    note: 'Ուրան-235-ի բաժանման բազմաթիվ հնարավոր ձևերից մեկը։ Էներգիայի մեծ մասը բեկորների կինետիկ էներգիան է։ Բեկորները ռադիոակտիվ են և հետագայում անջատում են ևս ≈20 ՄէՎ, ուստի մեկ բաժանման միջին էներգիան ≈200 ՄէՎ է։',
  },
};

function equation(r, toText) {
  const side = (s) => s.map(([k, key]) => `${k > 1 ? (key === 'n' ? `${k}` : `${k} `) : ''}${toText(particle(key))}`).join(' + ');
  return `${side(r.left)} → ${side(r.right)}`;
}

export function createReaction() {
  const view = fluidCanvas(byId('rxCv'), {
    height: (w) => Math.round(clamp(w * 0.62, 320, 470)),
    onResize: () => { dirty = true; },
  });
  const { ctx } = view;
  let rx = REACTIONS[0];
  let t = 0;
  let dirty = true;

  bindSegmented('rxChoice', {
    onChange: (id) => { rx = REACTIONS.find((r) => r.id === id); restart(); update(); },
  });
  onClick('replayBtn', restart);

  function restart() { t = 0; dirty = true; }

  function draw() {
    if (!view.width) return;
    const { width: W, height: H } = view;
    clear(ctx, W, H, COLORS.canvasBg);
    const L = chartLayout(W, H);
    const nuc = (side) => side.map(([, key]) => particle(key)).filter((p) => p.key !== 'n');
    const from = nuc(rx.left), to = nuc(rx.right);
    const focus = new Set([...from, ...to].map((p) => p.key));
    drawChart(ctx, L, { focus, regions: false });

    const color = rx.kind === 'fusion' ? C.fusion : C.fission;
    const k = clamp(t / DURATION, 0, 1);
    const ease = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    for (const a of from) {
      for (const b of to) {
        const x1 = L.x(a.A), y1 = L.y(a.eps), x2 = L.x(b.A), y2 = L.y(b.eps);
        const len = Math.hypot(x2 - x1, y2 - y1);
        const s = 8 / len, e = 1 - 10 / len;           // keep off the dots
        const u = lerp(s, e, ease);
        if (u > s + 0.01) {
          arrow(ctx, lerp(x1, x2, s), lerp(y1, y2, s), lerp(x1, x2, u), lerp(y1, y2, u), { color, width: 2.2, head: 9 });
        }
      }
    }
    // Labels of the involved nuclides: reactants below their dots, products above.
    for (const p of [...from, ...to]) {
      const px = L.x(p.A), py = L.y(p.eps);
      const right = p.A < 200;
      const above = to.includes(p) || p.eps < 1;      // keep clear of the A axis
      text(ctx, `${label(p)} ${p.eps.toFixed(2)}`, px + (right ? 9 : -9), py + (above ? -12 : 12), {
        color: COLORS.text, size: 11, weight: 600, family: 'mono', align: right ? 'left' : 'right',
      });
    }

    // Summary box in the empty lower-right part of the chart.
    const en = reactionEnergy(rx);
    const l1 = equation(rx, label);
    const l2 = `Q = ${en.Q.toFixed(2)} ՄէՎ`;
    const fs = L.narrow ? 11.5 : 13;
    ctx.font = font(fs, { weight: 600, family: 'mono' });
    const w1 = ctx.measureText(l1).width;
    ctx.font = font(fs * 1.25, { weight: 700, family: 'mono' });
    const w2 = ctx.measureText(l2).width;
    const bw = Math.max(w1, w2) + 20;
    const bh = fs * 3.6;
    const bx = W - L.m.r - bw - 8, by = H - L.m.b - bh - 10;
    ctx.save();
    ctx.fillStyle = alpha(COLORS.canvasBg, 0.9);
    ctx.strokeStyle = alpha(color, 0.6);
    ctx.lineWidth = 1;
    roundRect(ctx, bx, by, bw, bh, 8);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    text(ctx, l1, bx + 10, by + fs * 1.1, { color: COLORS.text, size: fs, weight: 600, family: 'mono' });
    ctx.save();
    ctx.globalAlpha = 0.25 + 0.75 * ease;
    text(ctx, l2, bx + 10, by + fs * 2.55, { color: C.energy, size: fs * 1.25, weight: 700, family: 'mono' });
    ctx.restore();
  }

  function update() {
    const en = reactionEnergy(rx);
    const info = INFO[rx.id];
    setHTML('rx-eq', equation(rx, html));
    setText('rx-mIn', `${en.mIn.toFixed(6)} ա.զ.մ.`);
    setText('rx-mOut', `${en.mOut.toFixed(6)} ա.զ.մ.`);
    setText('rx-dm', `${en.dm.toFixed(6)} ա.զ.մ.`);
    setText('rx-Q', `${en.Q.toFixed(2)} ՄէՎ`);
    setText('rx-qn', `${en.perNucleon.toFixed(2)} ՄէՎ/նուկլոն`);
    setText('rx-kg', `${sci(en.perKg)} Ջ/կգ`);
    const kTonnes = en.coalKg / 1e6;            // thousand tonnes of coal per kg of fuel
    setHTML('rx-fuel',
      `1 կգ ${info.fuel} անջատվում է <b>${sci(en.perKg)} Ջ</b> էներգիա, իսկ 1 կգ ածուխ այրելիս՝ ընդամենը ≈${sci(COAL_J_PER_KG, 0)} Ջ։ `
      + `Նույն էներգիան ստանալու համար պետք է այրել <b>≈${kTonnes.toFixed(1)} հազար տոննա</b> ածուխ՝ ${sci(en.coalKg, 1)} անգամ ավելի։`);
    setHTML('rx-note', info.note);
    const list = (side) => side.map(([k, key]) => {
      const p = particle(key);
      return `${k > 1 ? `${k} × ` : ''}${html(p)}՝ <b>${p.mass.toFixed(6)}</b>`;
    }).join('<br>');
    setHTML('rx-left', `${list(rx.left)}<br>Σ = <b>${en.mIn.toFixed(6)}</b> ա.զ.մ.`);
    setHTML('rx-right', `${list(rx.right)}<br>Σ = <b>${en.mOut.toFixed(6)}</b> ա.զ.մ.`);
  }

  onThemeChange(() => { dirty = true; });
  fontsReady().then(() => { dirty = true; });
  update();

  return {
    tick(dt) {
      if (t < DURATION) { t = Math.min(DURATION, t + dt); dirty = true; }
      if (dirty) { dirty = false; draw(); }
    },
    redraw() { dirty = true; },
    restart,
  };
}
