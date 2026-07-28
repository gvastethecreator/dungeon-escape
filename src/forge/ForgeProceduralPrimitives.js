/* ---------------- RNG ---------------- */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function makeRng(seed) {
  const r = mulberry32(seed);
  return {
    f: (a, b) => a + r() * (b - a),
    i: (a, b) => a + Math.floor(r() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(r() * arr.length)],
    chance: (p) => r() < p,
    raw: r,
    gauss(mu, sig) {
      let u = 0,
        v = 0;
      while (u === 0) u = r();
      while (v === 0) v = r();
      return mu + sig * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
  };
}

/* ---------------- constants ---------------- */
export const VOID = 0,
  FLOOR = 1,
  WALL = 2,
  POOL = 3;
export const TYPE = {
  ENTRANCE: "entrance",
  COMBAT: "combat",
  ELITE: "elite",
  TREASURE: "treasure",
  SHRINE: "shrine",
  BOSS: "boss",
};

/* ---------------- Delaunay (Bowyer–Watson) ---------------- */
export function delaunay(pts) {
  const n = pts.length;
  if (n < 2) return [];
  if (n === 2) return [[0, 1]];
  const P = pts.map((p, i) => ({
    x: p.x + ((i * 0.618033) % 1) * 1e-3,
    y: p.y + ((i * 0.414213) % 1) * 1e-3,
    i,
  }));
  let minX = 1e18,
    minY = 1e18,
    maxX = -1e18,
    maxY = -1e18;
  for (const p of P) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const dm = Math.max(maxX - minX, maxY - minY, 1),
    mx = (minX + maxX) / 2,
    my = (minY + maxY) / 2;
  const s1 = { x: mx - 30 * dm, y: my - dm, i: -1 },
    s2 = { x: mx, y: my + 30 * dm, i: -2 },
    s3 = { x: mx + 30 * dm, y: my - dm, i: -3 };
  const mkTri = (a, b, c) => {
    const t = [a, b, c];
    const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
    if (Math.abs(d) < 1e-12) {
      t.ccx = 0;
      t.ccy = 0;
      t.r2 = Infinity;
      return t;
    }
    const a2 = a.x * a.x + a.y * a.y,
      b2 = b.x * b.x + b.y * b.y,
      c2 = c.x * c.x + c.y * c.y;
    t.ccx = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
    t.ccy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
    t.r2 = (a.x - t.ccx) * (a.x - t.ccx) + (a.y - t.ccy) * (a.y - t.ccy);
    return t;
  };
  let tris = [mkTri(s1, s2, s3)];
  for (const p of P) {
    const bad = [],
      edges = [];
    for (const t of tris) {
      if ((p.x - t.ccx) * (p.x - t.ccx) + (p.y - t.ccy) * (p.y - t.ccy) < t.r2) bad.push(t);
    }
    for (const t of bad) for (let e = 0; e < 3; e++) edges.push([t[e], t[(e + 1) % 3]]);
    const poly = [];
    for (let i = 0; i < edges.length; i++) {
      let shared = false;
      for (let j = 0; j < edges.length; j++) {
        if (i === j) continue;
        const a = edges[i],
          b = edges[j];
        if ((a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0])) {
          shared = true;
          break;
        }
      }
      if (!shared) poly.push(edges[i]);
    }
    tris = tris.filter((t) => !bad.includes(t));
    for (const e of poly) tris.push(mkTri(e[0], e[1], p));
  }
  tris = tris.filter((t) => t[0].i >= 0 && t[1].i >= 0 && t[2].i >= 0);
  const seen = new Set(),
    out = [];
  for (const t of tris)
    for (let e = 0; e < 3; e++) {
      const a = t[e].i,
        b = t[(e + 1) % 3].i,
        lo = Math.min(a, b),
        hi = Math.max(a, b),
        k = lo * 4096 + hi;
      if (!seen.has(k)) {
        seen.add(k);
        out.push([lo, hi]);
      }
    }
  return out;
}
