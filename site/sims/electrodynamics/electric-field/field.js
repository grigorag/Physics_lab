// Electrostatics of point charges in a plane — pure physics, no DOM.
//
// Units: SI. Positions in metres, charges are objects { x, y, q } with q in
// nanocoulombs, field in V/m, potential in V. The y axis points up.

export const K = 8.99e9;      // N·m²/C²
export const NC = 1e-9;       // C per nC

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Field strength vector at (x, y): writes { ex, ey } (V/m) into `out`. */
export function fieldAt(charges, x, y, out = { ex: 0, ey: 0 }) {
  let ex = 0, ey = 0;
  for (const c of charges) {
    const dx = x - c.x, dy = y - c.y;
    const r2 = dx * dx + dy * dy;
    if (r2 < 1e-12) continue;
    const s = (K * c.q * NC) / (r2 * Math.sqrt(r2));
    ex += s * dx;
    ey += s * dy;
  }
  out.ex = ex;
  out.ey = ey;
  return out;
}

/** Potential at (x, y) in volts (zero at infinity). */
export function potentialAt(charges, x, y) {
  let phi = 0;
  for (const c of charges) {
    const r = Math.max(Math.hypot(x - c.x, y - c.y), 1e-6);
    phi += (K * c.q * NC) / r;
  }
  return phi;
}

// ---------- Field lines ----------

const START_R = 0.003;   // m: lines start this far from their charge
const CAPTURE = 0.004;   // m: a line this close to a sink charge ends on it

const tmp = { ex: 0, ey: 0 };
/** Unit vector along dir·E; returns false at a null point. */
function unitField(charges, x, y, dir, out) {
  fieldAt(charges, x, y, tmp);
  const m = Math.hypot(tmp.ex, tmp.ey);
  if (!(m > 1e-9)) return false;
  out.x = (dir * tmp.ex) / m;
  out.y = (dir * tmp.ey) / m;
  return true;
}

/**
 * Integrates one line from (x, y) along E (dir = +1) or against it (dir = −1)
 * with RK4 and a step that shrinks near charges.
 * Returns { pts: [x0, y0, x1, y1, …], end: index of the charge it ended on or −1, endAngle }.
 */
function trace(charges, x, y, dir, ds, ext, maxLen) {
  const pts = [x, y];
  const k1 = { x: 0, y: 0 }, k2 = { x: 0, y: 0 }, k3 = { x: 0, y: 0 }, k4 = { x: 0, y: 0 };
  let len = 0;
  for (let step = 0; step < 8000; step++) {
    let dMin = Infinity, hit = -1;
    for (let i = 0; i < charges.length; i++) {
      const c = charges[i];
      const d = Math.hypot(x - c.x, y - c.y);
      if (d < dMin) dMin = d;
      if (c.q * dir < 0 && d < CAPTURE) hit = i;
    }
    if (hit >= 0) {
      const c = charges[hit];
      pts.push(c.x, c.y);
      return { pts, end: hit, endAngle: Math.atan2(y - c.y, x - c.x) };
    }
    const h = clamp(0.35 * dMin, 0.0006, ds);
    if (!unitField(charges, x, y, dir, k1)) break;
    if (!unitField(charges, x + 0.5 * h * k1.x, y + 0.5 * h * k1.y, dir, k2)) break;
    if (!unitField(charges, x + 0.5 * h * k2.x, y + 0.5 * h * k2.y, dir, k3)) break;
    if (!unitField(charges, x + h * k3.x, y + h * k3.y, dir, k4)) break;
    x += (h / 6) * (k1.x + 2 * k2.x + 2 * k3.x + k4.x);
    y += (h / 6) * (k1.y + 2 * k2.y + 2 * k3.y + k4.y);
    len += h;
    pts.push(x, y);
    if (x < ext.xmin || x > ext.xmax || y < ext.ymin || y > ext.ymax || len > maxLen) break;
  }
  return { pts, end: -1, endAngle: 0 };
}

/** `need` new angles placed in the largest gaps between the sorted `angles`. */
function fillGaps(angles, need) {
  const out = [];
  if (!angles.length) {
    for (let k = 0; k < need; k++) out.push(((k + 0.5) / need) * TAU);
    return out;
  }
  const a = angles.map((v) => ((v % TAU) + TAU) % TAU).sort((p, q) => p - q);
  for (let k = 0; k < need; k++) {
    let best = 0, bestGap = -1;
    for (let i = 0; i < a.length; i++) {
      const next = i + 1 < a.length ? a[i + 1] : a[0] + TAU;
      if (next - a[i] > bestGap) { bestGap = next - a[i]; best = i; }
    }
    const mid = (a[best] + bestGap / 2) % TAU;
    out.push(mid);
    a.push(mid);
    a.sort((p, q) => p - q);
  }
  return out;
}

/**
 * Field lines of the configuration. The number of lines leaving (entering) a
 * charge is proportional to |q|: `base` lines for the largest charge.
 * Lines start on positive charges; negative charges that received fewer lines
 * than their share get the rest traced backwards (they come from infinity).
 * Every returned polyline [x0, y0, x1, y1, …] is oriented along E.
 */
export function traceFieldLines(charges, { bounds, ds = 0.0025, base = 16, margin = 0.6, maxLen = 3 } = {}) {
  const lines = [];
  if (!charges.length) return lines;
  const qmax = Math.max(...charges.map((c) => Math.abs(c.q)));
  const count = (c) => Math.max(2, Math.round((base * Math.abs(c.q)) / qmax));
  const ext = {
    xmin: bounds.xmin - margin, xmax: bounds.xmax + margin,
    ymin: bounds.ymin - margin, ymax: bounds.ymax + margin,
  };
  const arrivals = charges.map(() => []);

  for (const c of charges) {
    if (c.q <= 0) continue;
    const n = count(c);
    for (let k = 0; k < n; k++) {
      const a = ((k + 0.5) / n) * TAU;
      const l = trace(charges, c.x + START_R * Math.cos(a), c.y + START_R * Math.sin(a), 1, ds, ext, maxLen);
      l.pts.unshift(c.x, c.y);
      lines.push(l.pts);
      if (l.end >= 0) arrivals[l.end].push(l.endAngle);
    }
  }

  charges.forEach((c, i) => {
    if (c.q >= 0) return;
    const need = count(c) - arrivals[i].length;
    if (need <= 0) return;
    for (const a of fillGaps(arrivals[i], need)) {
      const l = trace(charges, c.x + START_R * Math.cos(a), c.y + START_R * Math.sin(a), -1, ds, ext, maxLen);
      // Reverse so the polyline runs along E (towards the negative charge).
      const p = [];
      for (let k = l.pts.length - 2; k >= 0; k -= 2) p.push(l.pts[k], l.pts[k + 1]);
      p.push(c.x, c.y);
      lines.push(p);
    }
  });
  return lines;
}

// ---------- Potential grid and equipotential lines ----------

/**
 * Potential sampled on (nx+1) × (ny+1) nodes covering `bounds`.
 * Node (i, j): x = xmin + i·dx, y = ymax − j·dy (row 0 is the top edge).
 */
export function potentialGrid(charges, bounds, nx, ny) {
  const cols = nx + 1, rows = ny + 1;
  const grid = new Float32Array(cols * rows);
  const dx = (bounds.xmax - bounds.xmin) / nx;
  const dy = (bounds.ymax - bounds.ymin) / ny;
  for (let j = 0; j < rows; j++) {
    const y = bounds.ymax - j * dy;
    for (let i = 0; i < cols; i++) {
      grid[j * cols + i] = potentialAt(charges, bounds.xmin + i * dx, y);
    }
  }
  return grid;
}

/**
 * "Nice" potential levels (1 · 1.5 · 2 · 3 · 5 · 7 × 10ⁿ V, both signs) scaled
 * to the configuration: from 1/5 to 30× the potential that the largest charge
 * creates at 10 cm. The zero level is added when both signs are present.
 * Returns an ascending array.
 */
export function potentialLevels(charges) {
  if (!charges.length) return [];
  const qmax = Math.max(...charges.map((c) => Math.abs(c.q)));
  const ref = (K * qmax * NC) / 0.1;
  const lo = ref / 5, hi = ref * 30;
  const pos = [];
  for (let n = -2; n <= 7; n++) {
    for (const m of [1, 1.5, 2, 3, 5, 7]) {
      const v = m * 10 ** n;
      if (v >= lo && v <= hi) pos.push(+v.toPrecision(2));
    }
  }
  const hasPos = charges.some((c) => c.q > 0);
  const hasNeg = charges.some((c) => c.q < 0);
  const out = [];
  if (hasNeg) for (let i = pos.length - 1; i >= 0; i--) out.push(-pos[i]);
  if (hasPos && hasNeg) out.push(0);
  if (hasPos) out.push(...pos);
  return out;
}

/**
 * Marching squares over a potentialGrid. Returns line segments in world
 * coordinates, grouped by the sign of the level:
 *   { pos: [x1, y1, x2, y2, …], neg: […], zero: […] }
 */
export function contours(grid, bounds, nx, ny, levels) {
  const out = { pos: [], neg: [], zero: [] };
  if (!levels.length) return out;
  const cols = nx + 1;
  const dx = (bounds.xmax - bounds.xmin) / nx;
  const dy = (bounds.ymax - bounds.ymin) / ny;

  for (let j = 0; j < ny; j++) {
    const y0 = bounds.ymax - j * dy;
    for (let i = 0; i < nx; i++) {
      const a = grid[j * cols + i];            // top-left
      const b = grid[j * cols + i + 1];        // top-right
      const c = grid[(j + 1) * cols + i + 1];  // bottom-right
      const d = grid[(j + 1) * cols + i];      // bottom-left
      const lo = Math.min(a, b, c, d), hi = Math.max(a, b, c, d);
      if (levels[0] >= hi || levels[levels.length - 1] <= lo) continue;
      const x0 = bounds.xmin + i * dx;

      for (let k = 0; k < levels.length; k++) {
        const L = levels[k];
        if (L <= lo) continue;
        if (L >= hi) break;
        const code = (a > L ? 8 : 0) | (b > L ? 4 : 0) | (c > L ? 2 : 0) | (d > L ? 1 : 0);
        if (code === 0 || code === 15) continue;
        const dst = L > 0 ? out.pos : L < 0 ? out.neg : out.zero;
        // Crossing points on the four cell edges.
        const tx = x0 + (dx * (L - a)) / (b - a), ty = y0;
        const rx = x0 + dx, ry = y0 - (dy * (L - b)) / (c - b);
        const bx = x0 + (dx * (L - d)) / (c - d), by = y0 - dy;
        const lx = x0, ly = y0 - (dy * (L - a)) / (d - a);
        switch (code) {
          case 1: case 14: dst.push(lx, ly, bx, by); break;
          case 2: case 13: dst.push(bx, by, rx, ry); break;
          case 3: case 12: dst.push(lx, ly, rx, ry); break;
          case 4: case 11: dst.push(tx, ty, rx, ry); break;
          case 6: case 9: dst.push(tx, ty, bx, by); break;
          case 7: case 8: dst.push(lx, ly, tx, ty); break;
          default: {
            // Saddle (5: b, d above; 10: a, c above) — decide by the cell centre.
            const centreAbove = (a + b + c + d) / 4 > L;
            if ((code === 5) === centreAbove) dst.push(tx, ty, lx, ly, bx, by, rx, ry);
            else dst.push(tx, ty, rx, ry, lx, ly, bx, by);
          }
        }
      }
    }
  }
  return out;
}

// ---------- Test charge ----------

/**
 * One velocity-Verlet step of a test particle p = { x, y, vx, vy } with
 * charge-to-mass ratio qm (C/kg) in the field of `charges`; h in seconds.
 */
export function stepParticle(p, charges, qm, h) {
  fieldAt(charges, p.x, p.y, tmp);
  const ax = qm * tmp.ex, ay = qm * tmp.ey;
  p.x += p.vx * h + 0.5 * ax * h * h;
  p.y += p.vy * h + 0.5 * ay * h * h;
  fieldAt(charges, p.x, p.y, tmp);
  p.vx += 0.5 * (ax + qm * tmp.ex) * h;
  p.vy += 0.5 * (ay + qm * tmp.ey) * h;
}
