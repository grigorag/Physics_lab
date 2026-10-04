// The five preset circuits: hand-laid schematics (grid units) + the netlist
// that the general solver (solver.js) solves. DOM-free.
//
// An edge is one straight piece of the drawing between two nodes:
//   { id, kind, a, b, t?, name?, side?, size? }
// kind: 'wire' | 'lead' (voltmeter lead) | 'R' | 'lamp' | 'rheo' (rheostat) |
//       'src' (a = −, b = +) | 'sw' (switch) | 'A' (ammeter) | 'V' (voltmeter, reads φa − φb)
// t     position of the symbol along the edge (0…1, default ½)
// side  where its label / reading goes: 'top' | 'bottom' | 'left' | 'right'
// The current of every edge is counted from a to b.

import { solve } from './solver.js';

const SUB = ['₀', '₁', '₂', '₃'];
const load = (st, i) => (st.type === 'lamp' ? 'lamp' : 'R');

let auto = 0;
const W = (a, b) => ({ id: `w${auto++}`, kind: 'wire', a, b });
const LEAD = (a, b) => ({ id: `l${auto++}`, kind: 'lead', a, b });

export const PRESETS = {
  ohm: {
    cols: 8, rows: 4.6,
    nodes: {
      TL: [1, 1.15], A2: [3.3, 1.15], Ra: [3.9, 1.15], Rb: [5.7, 1.15], TR: [7, 1.15],
      BR: [7, 4.15], M: [3.9, 4.15], BL: [1, 4.15], Va: [3.9, 2.55], Vb: [5.7, 2.55],
    },
    defaults: { E: 12, R1: 6, sw: { K: true }, type: 'R' },
    edges(st) {
      auto = 0;
      return [
        { id: 'E', kind: 'src', a: 'M', b: 'BL', name: 'ε', side: 'bottom' },
        W('BL', 'TL'),
        { id: 'A', kind: 'A', a: 'TL', b: 'A2', side: 'top' },
        W('A2', 'Ra'),
        { id: 'R1', kind: load(st), a: 'Ra', b: 'Rb', name: 'R', side: 'top', R: st.R1 },
        W('Rb', 'TR'), W('TR', 'BR'),
        { id: 'K', kind: 'sw', a: 'BR', b: 'M', name: 'K', side: 'bottom' },
        LEAD('Ra', 'Va'), LEAD('Vb', 'Rb'),
        { id: 'V', kind: 'V', a: 'Va', b: 'Vb', side: 'bottom' },
      ];
    },
  },

  series: {
    cols: 10, rows: 5.2,
    nodes: {
      TL: [1, 2.2], TR: [9, 2.2], BR: [9, 4.75], BL: [1, 4.75],
      a1: [1.9, 2.2], b1: [3.3, 2.2], a2: [4.3, 2.2], b2: [5.7, 2.2], a3: [6.7, 2.2], b3: [8.1, 2.2],
      v1a: [1.9, 1.15], v1b: [3.3, 1.15], v2a: [4.3, 1.15], v2b: [5.7, 1.15], v3a: [6.7, 1.15], v3b: [8.1, 1.15],
      m1: [7, 4.75], m2: [4.6, 4.75],
    },
    defaults: { E: 12, R1: 2, R2: 4, R3: 6, three: true, sw: { K: true }, type: 'R' },
    edges(st) {
      auto = 0;
      const e = [
        { id: 'E', kind: 'src', a: 'm2', b: 'BL', name: 'ε', side: 'bottom' },
        W('BL', 'TL'), W('TL', 'a1'),
      ];
      const n = st.three ? 3 : 2;
      for (let i = 1; i <= 3; i++) {
        if (i <= n) {
          e.push({ id: `R${i}`, kind: load(st), a: `a${i}`, b: `b${i}`, name: `R${SUB[i]}`, side: 'bottom', R: st[`R${i}`] });
          e.push(LEAD(`a${i}`, `v${i}a`), LEAD(`v${i}b`, `b${i}`));
          e.push({ id: `V${i}`, kind: 'V', a: `v${i}a`, b: `v${i}b`, name: `V${SUB[i]}`, side: 'top' });
        } else {
          e.push(W(`a${i}`, `b${i}`));
        }
        e.push(W(`b${i}`, i < 3 ? `a${i + 1}` : 'TR'));
      }
      e.push(W('TR', 'BR'),
        { id: 'A', kind: 'A', a: 'BR', b: 'm1', side: 'bottom' },
        { id: 'K', kind: 'sw', a: 'm1', b: 'm2', name: 'K', side: 'bottom' });
      return e;
    },
  },

  parallel: {
    cols: 10.6, rows: 5.95,
    nodes: {
      TL: [1, 1.2], BL: [1, 5.8],
      ...branchNodes(1, 3.6), ...branchNodes(2, 6), ...branchNodes(3, 8.4),
    },
    defaults: { E: 12, R1: 6, R2: 3, R3: 12, three: true, sw: { K: true, K1: true, K2: true, K3: true }, type: 'R' },
    edges(st) {
      auto = 0;
      const n = st.three ? 3 : 2;
      const e = [
        { id: 'E', kind: 'src', a: 'BL', b: 'TL', name: 'ε', side: 'right' },
        { id: 'A', kind: 'A', a: 'TL', b: 'p1T', side: 'top' },
        { id: 'K', kind: 'sw', a: 'p1B', b: 'BL', name: 'K', side: 'bottom' },
      ];
      for (let i = 1; i <= n; i++) {
        e.push(
          { id: `K${i}`, kind: 'sw', a: `p${i}T`, b: `s${i}`, name: `K${SUB[i]}`, side: 'right' },
          { id: `R${i}`, kind: load(st), a: `s${i}`, b: `m${i}`, name: `R${SUB[i]}`, side: 'right', R: st[`R${i}`] },
          { id: `A${i}`, kind: 'A', a: `m${i}`, b: `p${i}B`, name: `A${SUB[i]}`, side: 'right' },
        );
        if (i < n) e.push(W(`p${i}T`, `p${i + 1}T`), W(`p${i + 1}B`, `p${i}B`));
      }
      return e;
    },
  },

  mixed: {
    cols: 11.3, rows: 5.75,
    nodes: {
      TL: [1, 1.2], Aa: [2.7, 1.2], R1a: [3.2, 1.2], R1b: [4.6, 1.2], VpT: [5.4, 1.2],
      J2T: [6.6, 1.2], J3T: [9.2, 1.2], m2: [6.6, 3.5], m3: [9.2, 3.5],
      J2B: [6.6, 5.6], J3B: [9.2, 5.6], VpB: [5.4, 5.6], BL: [1, 5.6],
      V1a: [3.2, 2.4], V1b: [4.6, 2.4],
    },
    defaults: { E: 12, R1: 4, R2: 6, R3: 3, sw: { K: true }, type: 'R' },
    edges(st) {
      auto = 0;
      return [
        { id: 'E', kind: 'src', a: 'BL', b: 'TL', name: 'ε', side: 'right' },
        { id: 'A', kind: 'A', a: 'TL', b: 'Aa', side: 'top' },
        W('Aa', 'R1a'),
        { id: 'R1', kind: load(st), a: 'R1a', b: 'R1b', name: 'R₁', side: 'top', R: st.R1 },
        W('R1b', 'VpT'), W('VpT', 'J2T'), W('J2T', 'J3T'),
        { id: 'R2', kind: load(st), a: 'J2T', b: 'm2', name: 'R₂', side: 'right', R: st.R2, t: 0.52 },
        { id: 'A2', kind: 'A', a: 'm2', b: 'J2B', name: 'A₂', side: 'right' },
        { id: 'R3', kind: load(st), a: 'J3T', b: 'm3', name: 'R₃', side: 'right', R: st.R3, t: 0.52 },
        { id: 'A3', kind: 'A', a: 'm3', b: 'J3B', name: 'A₃', side: 'right' },
        W('J3B', 'J2B'), W('J2B', 'VpB'),
        { id: 'K', kind: 'sw', a: 'VpB', b: 'BL', name: 'K', side: 'bottom' },
        LEAD('R1a', 'V1a'), LEAD('V1b', 'R1b'),
        { id: 'V1', kind: 'V', a: 'V1a', b: 'V1b', name: 'V₁', side: 'bottom' },
        { id: 'Vp', kind: 'V', a: 'VpT', b: 'VpB', name: 'V₂', side: 'left', t: 0.705 },
      ];
    },
  },

  source: {
    cols: 9.4, rows: 6.2,
    nodes: {
      TL: [1, 1.2], T1: [3.8, 1.2], TR: [6.6, 1.2], TRs: [8.2, 1.2],
      BR: [6.6, 4.7], BRs: [8.2, 4.7], Nn: [5.9, 4.7], Mm: [4.3, 4.7], Pp: [2.7, 4.7], BL: [1, 4.7],
      Vp: [2.7, 5.85], Vn: [5.9, 5.85],
    },
    box: [2.95, 5.65, 4.7],          // dashed outline of the real source: x from, x to, y centre
    defaults: { E: 12, r: 1, RL: 5, sw: { K: true, KS: false }, type: 'R' },
    edges(st) {
      auto = 0;
      return [
        { id: 'E', kind: 'src', a: 'Nn', b: 'Mm', name: 'ε', side: 'top', gap: 0.16 },
        { id: 'r', kind: 'R', a: 'Mm', b: 'Pp', name: 'r', side: 'top', R: st.r, size: 0.62, gap: 0.38 },
        W('Pp', 'BL'),
        { id: 'A', kind: 'A', a: 'BL', b: 'TL', side: 'right' },
        { id: 'K', kind: 'sw', a: 'TL', b: 'T1', name: 'K', side: 'top' },
        W('T1', 'TR'),
        { id: 'R1', kind: st.type === 'lamp' ? 'lamp' : 'rheo', a: 'TR', b: 'BR', name: 'R', side: 'left', R: st.RL, t: 0.42 },
        W('BR', 'Nn'),
        W('TR', 'TRs'),
        { id: 'KS', kind: 'sw', a: 'TRs', b: 'BRs', name: 'K₂', side: 'right' },
        W('BRs', 'BR'),
        LEAD('Pp', 'Vp'), LEAD('Vn', 'Nn'),
        { id: 'V', kind: 'V', a: 'Vp', b: 'Vn', side: 'bottom' },
      ];
    },
  },
};

function branchNodes(i, x) {
  return {
    [`p${i}T`]: [x, 1.2], [`s${i}`]: [x, 2.5], [`m${i}`]: [x, 4.0], [`p${i}B`]: [x, 5.8],
  };
}

/** A fresh, independent copy of a preset's default state. */
export function initialState(id) {
  const d = PRESETS[id].defaults;
  return { ...d, sw: { ...d.sw } };
}

/**
 * Builds the netlist from the drawn edges and solves it.
 * Returns { edges, phi: node → potential, res: id → { I, U, P }, ok }.
 * U = φ(a) − φ(b), I from a to b, P = U·I.
 */
export function evaluate(id, st) {
  const preset = PRESETS[id];
  const edges = preset.edges(st);
  const keys = Object.keys(preset.nodes);
  const index = new Map(keys.map((k, i) => [k, i]));
  const elements = [];
  const elemOf = new Map();

  for (const e of edges) {
    const a = index.get(e.a), b = index.get(e.b);
    let el = null;
    switch (e.kind) {
      case 'wire': case 'lead': case 'A': el = { type: 'E', a, b, E: 0 }; break;
      case 'sw': if (st.sw[e.id]) el = { type: 'E', a, b, E: 0 }; break;
      case 'src': el = { type: 'E', a, b, E: st.E }; break;
      case 'R': case 'lamp': case 'rheo': el = { type: 'R', a, b, R: e.R }; break;
      default: break;    // 'V': ideal voltmeter, open switch — no element
    }
    if (el) { elemOf.set(e.id, elements.length); elements.push(el); }
  }

  // Ground: the negative terminal of the source.
  const src = edges.find((e) => e.kind === 'src');
  const sol = solve(keys.length, elements, index.get(src.a));

  const phi = {};
  keys.forEach((k, i) => { phi[k] = sol.V[i]; });
  const res = {};
  for (const e of edges) {
    const k = elemOf.get(e.id);
    const I = k === undefined ? 0 : clean(sol.I[k]);
    const U = clean(phi[e.a] - phi[e.b]);
    res[e.id] = { I, U, P: U * I };
  }
  return { edges, phi, res, ok: sol.ok };
}

const clean = (v) => (Math.abs(v) < 1e-9 ? 0 : v);
