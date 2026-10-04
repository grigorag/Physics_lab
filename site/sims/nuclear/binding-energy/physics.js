// Nuclear binding energy — data and formulas (no DOM).
//
// Masses are ATOMIC masses in unified atomic mass units (AME tables, rounded
// to 6 decimals). Because atomic masses are used throughout, the hydrogen-atom
// mass m_H stands for the proton: the electron masses cancel in Δm and in Q.

export const U_MEV = 931.494;          // 1 u·c² in MeV
export const M_H = 1.007825;           // ¹H atom, u
export const M_N = 1.008665;           // neutron, u
export const MEV_J = 1.602177e-13;     // 1 MeV in J
export const U_KG = 1.660539e-27;      // 1 u in kg
export const COAL_J_PER_KG = 3e7;      // heat of combustion of coal, J/kg

// [symbol, Z, A, atomic mass (u), Armenian name]
const TABLE = [
  ['H', 1, 1, 1.007825, 'ջրածին-1 (պրոտիում)'],
  ['H', 1, 2, 2.014102, 'ջրածին-2 (դեյտերիում)'],
  ['H', 1, 3, 3.016049, 'ջրածին-3 (տրիտիում)'],
  ['He', 2, 3, 3.016029, 'հելիում-3'],
  ['He', 2, 4, 4.002603, 'հելիում-4'],
  ['Li', 3, 6, 6.015123, 'լիթիում-6'],
  ['Li', 3, 7, 7.016003, 'լիթիում-7'],
  ['Be', 4, 9, 9.012183, 'բերիլիում-9'],
  ['C', 6, 12, 12.000000, 'ածխածին-12'],
  ['N', 7, 14, 14.003074, 'ազոտ-14'],
  ['O', 8, 16, 15.994915, 'թթվածին-16'],
  ['Ne', 10, 20, 19.992440, 'նեոն-20'],
  ['Al', 13, 27, 26.981539, 'ալյումին-27'],
  ['Ca', 20, 40, 39.962591, 'կալցիում-40'],
  ['Fe', 26, 56, 55.934936, 'երկաթ-56'],
  ['Ni', 28, 62, 61.928345, 'նիկել-62'],
  ['Cu', 29, 63, 62.929598, 'պղինձ-63'],
  ['Sr', 38, 90, 89.907730, 'ստրոնցիում-90'],
  ['Kr', 36, 92, 91.926173, 'կրիպտոն-92'],
  ['Ag', 47, 107, 106.905092, 'արծաթ-107'],
  ['Cs', 55, 137, 136.907089, 'ցեզիում-137'],
  ['Ba', 56, 141, 140.914403, 'բարիում-141'],
  ['Pb', 82, 208, 207.976652, 'կապար-208'],
  ['U', 92, 235, 235.043930, 'ուրան-235'],
  ['U', 92, 238, 238.050788, 'ուրան-238'],
  ['Pu', 94, 239, 239.052163, 'պլուտոնիում-239'],
];

/** Mass defect (u) of a nuclide: Z·m_H + N·m_n − M_atom. */
export const massDefect = (Z, A, mass) => Z * M_H + (A - Z) * M_N - mass;

export const NUCLIDES = TABLE.map(([sym, Z, A, mass, name]) => {
  const N = A - Z;
  const parts = Z * M_H + N * M_N;       // mass of the separated nucleons (as ¹H atoms + neutrons)
  const dm = parts - mass;
  const E = dm * U_MEV;                  // binding energy, MeV
  return { key: `${sym}${A}`, sym, Z, N, A, mass, name, parts, dm, E, eps: E / A };
});

const BY_KEY = new Map(NUCLIDES.map((n) => [n.key, n]));
export const nuclide = (key) => BY_KEY.get(key);

/** The free neutron as a reaction particle. */
export const NEUTRON = { key: 'n', sym: 'n', Z: 0, N: 1, A: 1, mass: M_N, name: 'նեյտրոն', E: 0, eps: 0 };
export const particle = (key) => (key === 'n' ? NEUTRON : nuclide(key));

// ---------- Semi-empirical mass formula (Weizsäcker) ----------
export const SEMF = { av: 15.75, as: 17.8, ac: 0.711, aa: 23.7, ap: 11.18 };   // MeV

/** Z on the line of β-stability (real-valued). */
export const stableZ = (A) => A / (2 + 0.015 * Math.pow(A, 2 / 3));

/** Binding energy (MeV) by the Weizsäcker formula. With pairing = true, Z and A
 *  must be integers (δ = ±ap/√A for even-even / odd-odd nuclei, 0 for odd A). */
export function semfBinding(A, Z, pairing = false) {
  const { av, as, ac, aa, ap } = SEMF;
  let B = av * A - as * Math.pow(A, 2 / 3) - (ac * Z * Z) / Math.cbrt(A) - (aa * (A - 2 * Z) ** 2) / A;
  if (pairing && A % 2 === 0) B += (Z % 2 === 0 ? 1 : -1) * ap / Math.sqrt(A);
  return B;
}

/** Smooth trend of the specific binding energy (MeV per nucleon) along the
 *  stability line; the pairing term averages out and is left out. */
export const semfTrend = (A) => semfBinding(A, stableZ(A)) / A;

// ---------- Reactions ----------
// left / right: [count, particle key]
export const REACTIONS = [
  { id: 'dt', kind: 'fusion', left: [[1, 'H2'], [1, 'H3']], right: [[1, 'He4'], [1, 'n']] },
  { id: 'dd', kind: 'fusion', left: [[2, 'H2']], right: [[1, 'He3'], [1, 'n']] },
  { id: 'pp', kind: 'fusion', left: [[4, 'H1']], right: [[1, 'He4']] },
  { id: 'fission', kind: 'fission', left: [[1, 'U235'], [1, 'n']], right: [[1, 'Ba141'], [1, 'Kr92'], [3, 'n']] },
];

const sum = (side, f) => side.reduce((s, [k, key]) => s + k * f(particle(key)), 0);

/** Energy balance of a reaction (masses in u, energies in MeV, per-kg in J/kg). */
export function reactionEnergy(r) {
  const mIn = sum(r.left, (p) => p.mass);
  const mOut = sum(r.right, (p) => p.mass);
  const dm = mIn - mOut;
  const Q = dm * U_MEV;
  const nucleons = sum(r.left, (p) => p.A);
  // Fuel = the reacting nuclei (an incoming neutron is not fuel).
  const fuel = sum(r.left.filter(([, key]) => key !== 'n'), (p) => p.mass);
  const perKg = (Q * MEV_J) / (fuel * U_KG);          // J per kg of fuel
  return {
    mIn, mOut, dm, Q, nucleons, fuel,
    perNucleon: Q / nucleons,
    perKg,
    coalKg: perKg / COAL_J_PER_KG,                    // kg of coal giving the same heat
    bindIn: sum(r.left, (p) => p.E),
    bindOut: sum(r.right, (p) => p.E),
  };
}
