// A small general DC circuit solver: modified nodal analysis (MNA) solved by
// Gaussian elimination with partial pivoting. DOM-free.
//
//   solve(nodeCount, elements, ground = 0)
//
// elements:
//   { type: 'R', a, b, R }   resistor, R > 0 (Ω)
//   { type: 'E', a, b, E }   ideal voltage source: φ(b) − φ(a) = E (V).
//                            E = 0 is an ideal wire / closed switch / ammeter.
// Every element's current I is the current flowing through it from a to b
// (for a source: inside it, from − to +). Open switches and ideal voltmeters
// are simply left out of the netlist.
//
// Returns { V: node potentials (ground = 0), I: current of each element, ok }.

const GMIN = 1e-12;   // tiny leak to ground so that a floating node never makes the matrix singular

export function solve(nodeCount, elements, ground = 0) {
  const idx = new Int32Array(nodeCount).fill(-1);
  let n = 0;
  for (let i = 0; i < nodeCount; i++) if (i !== ground) idx[i] = n++;

  const rowOf = new Int32Array(elements.length).fill(-1);
  let N = n;
  elements.forEach((e, k) => { if (e.type === 'E') rowOf[k] = N++; });

  const A = Array.from({ length: N }, () => new Float64Array(N + 1));
  for (let i = 0; i < n; i++) A[i][i] += GMIN;

  elements.forEach((e, k) => {
    const ia = idx[e.a];
    const ib = idx[e.b];
    if (e.type === 'R') {
      const g = 1 / e.R;
      if (ia >= 0) A[ia][ia] += g;
      if (ib >= 0) A[ib][ib] += g;
      if (ia >= 0 && ib >= 0) { A[ia][ib] -= g; A[ib][ia] -= g; }
    } else {
      const r = rowOf[k];
      // KCL rows: the source current leaves node a and enters node b.
      if (ia >= 0) { A[ia][r] += 1; A[r][ia] -= 1; }
      if (ib >= 0) { A[ib][r] -= 1; A[r][ib] += 1; }
      A[r][N] = e.E;
    }
  });

  const x = gauss(A, N);
  const ok = x !== null;
  const V = new Float64Array(nodeCount);
  if (ok) for (let i = 0; i < nodeCount; i++) V[i] = idx[i] >= 0 ? x[idx[i]] : 0;

  const I = elements.map((e, k) => {
    if (!ok) return 0;
    if (e.type === 'R') return (V[e.a] - V[e.b]) / e.R;
    return x[rowOf[k]];
  });
  return { V, I, ok };
}

/** Solves the augmented N × (N+1) system in place; null if singular. */
function gauss(A, N) {
  for (let c = 0; c < N; c++) {
    let p = c;
    for (let r = c + 1; r < N; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-15) return null;
    if (p !== c) [A[p], A[c]] = [A[c], A[p]];
    const piv = A[c];
    for (let r = c + 1; r < N; r++) {
      const f = A[r][c] / piv[c];
      if (f === 0) continue;
      const row = A[r];
      for (let k = c; k <= N; k++) row[k] -= f * piv[k];
    }
  }
  const x = new Float64Array(N);
  for (let r = N - 1; r >= 0; r--) {
    let s = A[r][N];
    for (let k = r + 1; k < N; k++) s -= A[r][k] * x[k];
    x[r] = s / A[r][r];
  }
  return x;
}
