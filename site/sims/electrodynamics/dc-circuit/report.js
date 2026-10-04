// Text side of the lab: stats, explicit law checks, element cards and the
// formula box for each preset, all computed from the solved circuit. DOM-free.

const SUB = ['₀', '₁', '₂', '₃'];

/** Meter-style number: 2 decimals, 1 above 100. */
export function num(v) {
  if (!Number.isFinite(v)) return '∞';
  if (Math.abs(v) < 0.005) return '0.00';
  return Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(2);
}
/** A resistance set by a slider: integers stay integers. */
export const ohm = (R) => (Number.isInteger(R) ? String(R) : R.toFixed(1));

const V = (v) => `${num(v)} Վ`;
const A = (v) => `${num(v)} Ա`;
const W = (v) => `${num(v)} Վտ`;
const OHM = (v) => `${Number.isFinite(v) ? num(v) : '∞'} Օմ`;

const OK = ' <span class="ok">✓</span>';
const near = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));

const KIND = { R: 'ռեզիստոր', lamp: 'լամպ', rheo: 'ռեոստատ' };

/** Total external resistance seen by the source (∞ when no current flows). */
function external(sol, st) {
  const I = sol.res.E.I;
  const U = st.E - I * (st.r ?? 0);
  if (I <= 1e-9) return Infinity;
  return Math.max(0, U / I);
}

function loadCard(sol, e, color) {
  const { U, I, P } = sol.res[e.id];
  return {
    title: `<span class="sym">${e.name}</span> · ${KIND[e.kind]}`,
    color,
    lines: [['R', `${ohm(e.R)} Օմ`], ['U', V(Math.abs(U))], ['I', A(Math.abs(I))], ['P', W(Math.abs(P))]],
  };
}

function sourceCard(st, sol) {
  const I = sol.res.E.I;
  const lines = [['ε', V(st.E)]];
  if (st.r !== undefined) lines.push(['r', `${ohm(st.r)} Օմ`]);
  lines.push(['I', A(I)], ['P = εI', W(st.E * I)]);
  return { title: st.r !== undefined ? 'Աղբյուր · <span class="sym">ε, r</span>' : 'Աղբյուր · <span class="sym">ε (r = 0)</span>', color: 'var(--text-2)', lines };
}

const COL = ['var(--coral)', 'var(--teal)', 'var(--amber)'];

export function report(id, st, sol) {
  const loads = sol.edges.filter((e) => e.kind === 'R' || e.kind === 'lamp' || e.kind === 'rheo').filter((e) => e.id !== 'r');
  const r = (k) => sol.res[k];
  const I = sol.res.E.I;
  const Rext = external(sol, st);
  const closed = st.sw.K;
  const out = { stats: [], checks: '', warn: '', cards: [], formula: '' };

  out.cards = loads.map((e, i) => loadCard(sol, e, COL[i]));
  out.cards.push(sourceCard(st, sol));
  const openMsg = '<b>Բանալի K-ն բաց է</b>, շղթան փակ չէ, և հոսանք չի անցնում։ Սեղմեք բանալու վրա՝ այն փակելու համար։';

  if (id === 'ohm') {
    const U = r('V').U, Ia = r('A').I;
    out.stats = [
      ['ԷլՇՈՒ ε', V(st.E)],
      ['Դիմադրություն R', `${ohm(st.R1)} Օմ`],
      ['Ամպերաչափ I', A(Ia)],
      ['Վոլտաչափ U', V(U)],
      ['Հզորություն P = UI', W(U * Ia)],
    ];
    out.checks = closed
      ? `<b>Օհմի օրենք</b><br>I = U / R = ${num(U)} / ${ohm(st.R1)} = ${A(U / st.R1)}${near(U / st.R1, Ia) ? OK : ''}`
      : openMsg;
    out.formula = '<b>I = U / R</b><br>Օհմի օրենքը շղթայի տեղամասի համար<br><br><b>P = UI = I²R = U²/R</b><br>հոսանքի հզորությունը<br><br>I(U) գրաֆիկը ուղիղ է, որի թեքությունը 1/R է։';
  }

  if (id === 'series') {
    const n = st.three ? 3 : 2;
    const ks = Array.from({ length: n }, (_, i) => i + 1);
    const Us = ks.map((k) => r(`V${k}`).U);
    const Is = ks.map((k) => r(`R${k}`).I);
    const sumU = Us.reduce((s, u) => s + u, 0);
    const sumR = ks.reduce((s, k) => s + st[`R${k}`], 0);
    out.stats = [
      ['ԷլՇՈՒ ε', V(st.E)],
      ['Ընդհանուր դիմադրություն R', OHM(sumR)],
      ['Հոսանքի ուժ I', A(r('A').I)],
      ...ks.map((k, i) => [`Լարում U${SUB[k]}`, V(Us[i])]),
    ];
    out.checks = (closed ? '' : `${openMsg}<br><br>`)
      + `<b>Լարումները գումարվում են</b><br>${ks.map((k) => `U${SUB[k]}`).join(' + ')} = ${Us.map(num).join(' + ')} = ${V(sumU)}${closed && near(sumU, st.E) ? ' = ε' + OK : ''}`
      + `<br><b>Հոսանքը նույնն է</b><br>${ks.map((k) => `I${SUB[k]}`).join(' = ')} = I = ${A(r('A').I)}${Is.every((x) => near(x, r('A').I)) ? OK : ''}`
      + `<br><b>Դիմադրությունները գումարվում են</b><br>R = ${ks.map((k) => ohm(st[`R${k}`])).join(' + ')} = ${OHM(sumR)}`;
    out.formula = '<b>I = I₁ = I₂ = I₃</b><br>բոլոր տարրերով անցնում է նույն հոսանքը<br><br><b>U = U₁ + U₂ + U₃</b><br>լարումները գումարվում են<br><br><b>R = R₁ + R₂ + R₃</b><br><br><b>U₁ / U₂ = R₁ / R₂</b><br>ավելի մեծ դիմադրության վրա լարումն ավելի մեծ է';
  }

  if (id === 'parallel') {
    const n = st.three ? 3 : 2;
    const ks = Array.from({ length: n }, (_, i) => i + 1);
    const Is = ks.map((k) => r(`A${k}`).I);
    const on = ks.filter((k) => st.sw[`K${k}`]);
    const sumI = Is.reduce((s, x) => s + x, 0);
    const Rpar = on.length ? 1 / on.reduce((s, k) => s + 1 / st[`R${k}`], 0) : Infinity;
    out.stats = [
      ['ԷլՇՈՒ ε', V(st.E)],
      ['Ընդհանուր դիմադրություն R', OHM(closed ? Rpar : Infinity)],
      ['Գլխավոր ամպերաչափ I', A(r('A').I)],
      ...ks.map((k, i) => [`Ճյուղի հոսանք I${SUB[k]}`, A(Is[i])]),
    ];
    const offs = ks.filter((k) => !st.sw[`K${k}`]);
    let html = closed ? '' : `${openMsg}<br><br>`;
    html += `<b>Հոսանքները գումարվում են</b><br>${ks.map((k) => `I${SUB[k]}`).join(' + ')} = ${Is.map(num).join(' + ')} = ${A(sumI)}${near(sumI, r('A').I) ? ' = I' + OK : ''}`;
    if (offs.length) html += `<br><span class="muted">${offs.map((k) => `K${SUB[k]}`).join(', ')} բաց է, ուստի այդ ճյուղով հոսանք չկա։</span>`;
    if (on.length && closed) {
      const Us = on.map((k) => r(`R${k}`).U);
      html += `<br><b>Լարումը նույնն է</b><br>${on.map((k) => `U${SUB[k]}`).join(' = ')} = ${V(Us[0])}${Us.every((u) => near(u, st.E)) ? ' = ε' + OK : ''}`;
      html += `<br><b>Հաղորդականությունները գումարվում են</b><br>1/R = ${on.map((k) => `1/${ohm(st[`R${k}`])}`).join(' + ')} ⇒ R = ${OHM(Rpar)}${near(Rpar, Rext) ? OK : ''}`;
    }
    out.checks = html;
    out.formula = '<b>U = U₁ = U₂ = U₃</b><br>բոլոր ճյուղերի լարումը նույնն է<br><br><b>I = I₁ + I₂ + I₃</b><br>հոսանքները գումարվում են<br><br><b>1/R = 1/R₁ + 1/R₂ + 1/R₃</b><br>երկու ճյուղի դեպքում՝ R = R₁R₂ / (R₁ + R₂)<br><br><b>I₁ / I₂ = R₂ / R₁</b>';
  }

  if (id === 'mixed') {
    const R23 = (st.R2 * st.R3) / (st.R2 + st.R3);
    const Rt = st.R1 + R23;
    const U1 = r('V1').U, Up = r('Vp').U, I2 = r('A2').I, I3 = r('A3').I, Im = r('A').I;
    out.stats = [
      ['ԷլՇՈՒ ε', V(st.E)],
      ['R₂ ∥ R₃', OHM(R23)],
      ['Ընդհանուր դիմադրություն R', OHM(closed ? Rt : Infinity)],
      ['Գլխավոր հոսանք I', A(Im)],
      ['Լարում R₁-ի վրա U₁', V(U1)],
      ['Զուգահեռ մասի լարում U₂', V(Up)],
      ['Ճյուղերի հոսանքներ I₂, I₃', `${num(I2)}, ${num(I3)} Ա`],
    ];
    out.checks = (closed ? '' : `${openMsg}<br><br>`)
      + `<b>Ընդհանուր դիմադրությունը</b><br>R = R₁ + R₂R₃/(R₂ + R₃) = ${ohm(st.R1)} + ${num(R23)} = ${OHM(Rt)}${closed && near(Rt, Rext) ? OK : ''}`
      + `<br><b>Գլխավոր հոսանքը բաժանվում է</b><br>I₂ + I₃ = ${num(I2)} + ${num(I3)} = ${A(I2 + I3)}${near(I2 + I3, Im) ? ' = I' + OK : ''}`
      + `<br><b>Լարումները գումարվում են</b><br>U₁ + U₂ = ${num(U1)} + ${num(Up)} = ${V(U1 + Up)}${closed && near(U1 + Up, st.E) ? ' = ε' + OK : ''}`;
    out.formula = '<b>R = R₁ + R₂R₃ / (R₂ + R₃)</b><br>նախ փոխարինում ենք զուգահեռ մասը մեկ համարժեք դիմադրությամբ<br><br><b>I = ε / R,  U₁ = IR₁</b><br><br><b>U₂ = ε − U₁,  I₂ = U₂ / R₂,  I₃ = U₂ / R₃</b>';
  }

  if (id === 'source') {
    const Im = r('A').I, U = r('V').U;
    const Isc = st.E / st.r;
    const Pl = r('R1').P;
    const Pmax = (st.E * st.E) / (4 * st.r);
    out.stats = [
      ['ԷլՇՈՒ ε', V(st.E)],
      ['Ներքին դիմադրություն r', `${ohm(st.r)} Օմ`],
      ['Արտաքին դիմադրություն R', OHM(Rext)],
      ['Հոսանքի ուժ I', A(Im)],
      ['Սեղմերի լարում U', V(U)],
      ['Կարճ միացման հոսանք ε/r', A(Isc)],
      ['Բեռի հզորություն P', W(Pl)],
      ['ՕԳԳ η = U/ε', Im > 0 ? `${(100 * U / st.E).toFixed(1)} %` : '—'],
    ];
    out.checks = closed
      ? `<b>Լրիվ շղթայի Օհմի օրենք</b><br>I = ε / (R + r) = ${num(st.E)} / (${num(Rext)} + ${ohm(st.r)}) = ${A(st.E / (Rext + st.r))}${near(st.E / (Rext + st.r), Im) ? OK : ''}`
        + `<br><b>Սեղմերի լարում</b><br>U = ε − Ir = ${num(st.E)} − ${num(Im)}·${ohm(st.r)} = ${V(st.E - Im * st.r)}${near(st.E - Im * st.r, U) ? OK : ''}`
        + `<br><b>Բեռի առավելագույն հզորություն</b><br>R = r = ${ohm(st.r)} Օմ դեպքում՝ P<sub>max</sub> = ε²/4r = ${W(Pmax)}`
      : `${openMsg}<br><br>Բաց շղթայում I = 0, ուստի վոլտաչափը ցույց է տալիս հենց ԷլՇՈՒ-ն՝ U = ε = ${V(U)}։`;
    if (closed && st.sw.KS) {
      out.warn = `<b>Կարճ միացում։</b> K₂ բանալին միացրել է աղբյուրի սեղմերը առանց բեռի, արտաքին դիմադրությունը ≈ 0։ Հոսանքը սահմանափակում է միայն ներքին դիմադրությունը՝ I = ε / r = ${A(Isc)}, սեղմերի լարումը՝ U = 0, իսկ ամբողջ ${W(st.E * Isc)} հզորությունն անջատվում է աղբյուրի ներսում։ Իրական մարտկոցն այդպիսի ռեժիմում արագ տաքանում և փչանում է։`;
    }
    out.formula = '<b>I = ε / (R + r)</b><br>Օհմի օրենքը լրիվ շղթայի համար<br><br><b>U = ε − Ir = IR</b><br>սեղմերի լարումը<br><br><b>I<sub>կ.մ.</sub> = ε / r</b><br>կարճ միացման հոսանքը (R = 0)<br><br><b>P = ε²R / (R + r)²</b><br>առավելագույնն է R = r դեպքում՝ P<sub>max</sub> = ε² / 4r';
  }

  return out;
}
