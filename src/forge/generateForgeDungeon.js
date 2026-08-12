import {
  FORGE_CORRIDOR_WIDTHS,
  FORGE_ROOM_BANDS,
  FORGE_SCATTER_RADIUS,
  getForgeDoorwayDirection,
  sealInvalidForgeRoomOpenings,
  selectDepthSpreadRoomIds,
} from "./layoutTuning";
import { FORGE_THEME_PROFILES } from "./ForgeThemeProfiles";
import { FLOOR, POOL, TYPE, VOID, WALL, delaunay, makeRng } from "./ForgeProceduralPrimitives";
/* ---------------- name generator ---------------- */
function dungeonName(rng, th) {
  const C = ["Mal", "Vor", "Ash", "Ker", "Ul", "Dra", "Noth", "Zar", "Bel", "Mor", "Gol", "Ith"];
  const D = ["goth", "ath", "ruk", "esh", "mir", "gul", "dan", "oth", "ek", "ash", "uzek", "arim"];
  return (
    "The " +
    rng.pick(th.nameA) +
    " " +
    rng.pick(th.nameB) +
    " of " +
    rng.pick(C) +
    "\u2019" +
    rng.pick(D)
  );
}

/* ---------------- generator ---------------- */
function normalizeForgeGenerationParams(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new TypeError("Forge generation params must be an object.");
  if (!Number.isSafeInteger(input.seed) || input.seed < 0 || input.seed > 0xffffffff)
    throw new RangeError("Forge generation seed must be an unsigned 32-bit integer.");
  if (!Number.isSafeInteger(input.roomCount) || input.roomCount < 2 || input.roomCount > 80)
    throw new RangeError("Forge generation roomCount must be an integer from 2 to 80.");
  if (
    typeof input.loopChance !== "number" ||
    !Number.isFinite(input.loopChance) ||
    input.loopChance < 0 ||
    input.loopChance > 1
  )
    throw new RangeError("Forge generation loopChance must be a number from 0 to 1.");
  if (
    typeof input.decorDensity !== "number" ||
    !Number.isFinite(input.decorDensity) ||
    input.decorDensity < 0 ||
    input.decorDensity > 1
  )
    throw new RangeError("Forge generation decorDensity must be a number from 0 to 1.");
  if (typeof input.themeKey !== "string" || !Object.hasOwn(FORGE_THEME_PROFILES, input.themeKey))
    throw new RangeError("Forge generation themeKey is unsupported.");
  return {
    seed: input.seed,
    roomCount: input.roomCount,
    loopChance: input.loopChance,
    decorDensity: input.decorDensity,
    themeKey: input.themeKey,
  };
}

export function generateForgeDungeon(input) {
  const params = normalizeForgeGenerationParams(input);
  let attempt = 0,
    seed = params.seed >>> 0,
    d = null;
  while (attempt < 5) {
    d = tryGenerate(seed, params);
    if (d.valid) break;
    seed = (Math.imul(seed, 9301) + 49297) >>> 0;
    attempt++;
  }
  d.stats.genMs = 0;
  d.stats.attempts = attempt + 1;
  return d;
}

function tryGenerate(seed, params) {
  const rng = makeRng(seed);
  const N = params.roomCount;
  const TH = FORGE_THEME_PROFILES[params.themeKey];

  /* -- 1. scatter -- */
  const R = Math.sqrt(N) * FORGE_SCATTER_RADIUS;
  const rooms = [];
  const large = [];
  for (let i = 0; i < N; i++) {
    const t = rng.raw();
    let w, h, arch;
    if (t < 0.45) {
      arch = "s";
      w = rng.i(FORGE_ROOM_BANDS.small.min, FORGE_ROOM_BANDS.small.max);
      h = rng.i(FORGE_ROOM_BANDS.small.min, FORGE_ROOM_BANDS.small.max);
    } else if (t < 0.85) {
      arch = "m";
      w = rng.i(FORGE_ROOM_BANDS.medium.min, FORGE_ROOM_BANDS.medium.max);
      h = rng.i(FORGE_ROOM_BANDS.medium.min, FORGE_ROOM_BANDS.medium.max);
    } else {
      arch = "l";
      w = rng.i(FORGE_ROOM_BANDS.large.min, FORGE_ROOM_BANDS.large.max);
      h = rng.i(FORGE_ROOM_BANDS.large.min, FORGE_ROOM_BANDS.large.max);
      large.push(i);
    }
    const st = rng.raw();
    // Mostly orthogonal rooms keep the playable silhouette legible. Rare
    // octagons add a landmark without turning every route into a jagged blob.
    const shape = st < 0.86 ? "rect" : st < 0.97 ? "oct" : "ellipse";
    const ang = rng.f(0, Math.PI * 2),
      rad = R * Math.sqrt(rng.raw());
    rooms.push({
      id: i,
      cx: Math.cos(ang) * rad,
      cy: Math.sin(ang) * rad,
      w,
      h,
      arch,
      shape,
      sx0: Math.cos(ang) * rad,
      sy0: Math.sin(ang) * rad,
      type: TYPE.COMBAT,
      depth: 0,
      difficulty: 0.2,
      degree: 0,
    });
  }
  while (large.length < 2) {
    const j = rng.i(0, N - 1);
    if (rooms[j].arch !== "l") {
      rooms[j].arch = "l";
      rooms[j].w = rng.i(FORGE_ROOM_BANDS.large.min, FORGE_ROOM_BANDS.large.max);
      rooms[j].h = rng.i(FORGE_ROOM_BANDS.large.min, FORGE_ROOM_BANDS.large.max);
      rooms[j].shape = "rect";
      large.push(j);
    }
  }

  /* -- 2. separate -- */
  const PAD = 2;
  {
    const CX = new Float64Array(N),
      CY = new Float64Array(N),
      HW = new Float64Array(N),
      HH = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      CX[i] = rooms[i].cx;
      CY[i] = rooms[i].cy;
      HW[i] = rooms[i].w / 2 + PAD / 2;
      HH[i] = rooms[i].h / 2 + PAD / 2;
    }
    for (let iter = 0; iter < 300; iter++) {
      let moved = false;
      for (let i = 0; i < N; i++)
        for (let j = i + 1; j < N; j++) {
          const ox = HW[i] + HW[j] - Math.abs(CX[i] - CX[j]);
          if (ox <= 0) continue;
          const oy = HH[i] + HH[j] - Math.abs(CY[i] - CY[j]);
          if (oy <= 0) continue;
          moved = true;
          if (ox < oy) {
            const s = CX[i] <= CX[j] ? -1 : 1;
            CX[i] += (s * ox) / 2;
            CX[j] -= (s * ox) / 2;
          } else {
            const s = CY[i] <= CY[j] ? -1 : 1;
            CY[i] += (s * oy) / 2;
            CY[j] -= (s * oy) / 2;
          }
        }
      if (!moved) break;
    }
    for (let i = 0; i < N; i++) {
      rooms[i].cx = Math.round(CX[i]);
      rooms[i].cy = Math.round(CY[i]);
    }
  }

  /* -- 3. graph: Delaunay -> MST -> loops -- */
  const centers = rooms.map((r) => ({ x: r.cx, y: r.cy }));
  let delEdges = delaunay(centers);
  if (delEdges.length === 0) {
    delEdges = [];
    for (let i = 0; i < N - 1; i++) delEdges.push([i, i + 1]);
  }
  const elen = (e) =>
    Math.hypot(centers[e[0]].x - centers[e[1]].x, centers[e[0]].y - centers[e[1]].y);

  const adj = Array.from({ length: N }, () => []);
  delEdges.forEach((e, idx) => {
    const w = elen(e);
    adj[e[0]].push({ b: e[1], w, idx });
    adj[e[1]].push({ b: e[0], w, idx });
  });
  const inT = new Uint8Array(N);
  inT[0] = 1;
  let inCount = 1;
  const mstIdx = new Set();
  while (inCount < N) {
    let best = null;
    for (let a = 0; a < N; a++)
      if (inT[a]) for (const e of adj[a]) if (!inT[e.b] && (!best || e.w < best.w)) best = e;
    if (!best) break;
    inT[best.b] = 1;
    inCount++;
    mstIdx.add(best.idx);
  }
  if (inCount < N) return { valid: false, stats: {} };

  let mstLenSum = 0;
  for (const i of mstIdx) mstLenSum += elen(delEdges[i]);
  const mstMean = mstLenSum / Math.max(1, mstIdx.size);

  const edges = [];
  delEdges.forEach((e, idx) => {
    if (mstIdx.has(idx)) edges.push({ a: e[0], b: e[1], isLoop: false, isCritical: false });
    else if (elen(e) < mstMean * 2.2 && rng.chance(params.loopChance))
      edges.push({ a: e[0], b: e[1], isLoop: true, isCritical: false });
  });
  for (const e of edges) {
    rooms[e.a].degree++;
    rooms[e.b].degree++;
  }

  /* leaf guard: dungeons need dead ends — prune loop edges until >=3 leaves */
  if (N >= 20) {
    let leafCount = 0;
    for (let i = 0; i < N; i++) if (rooms[i].degree === 1) leafCount++;
    while (leafCount < 3) {
      let bi = -1,
        bs = -1;
      for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        if (!e.isLoop) continue;
        const s = (rooms[e.a].degree === 2 ? 1 : 0) + (rooms[e.b].degree === 2 ? 1 : 0);
        const L = Math.hypot(centers[e.a].x - centers[e.b].x, centers[e.a].y - centers[e.b].y);
        const score = s * 10000 + L;
        if (score > bs) {
          bs = score;
          bi = i;
        }
      }
      if (bi < 0) break;
      const e = edges[bi];
      if (--rooms[e.a].degree === 1) leafCount++;
      if (--rooms[e.b].degree === 1) leafCount++;
      edges.splice(bi, 1);
    }
  }

  /* -- 4. semantics before carving -- */
  const gAdj = Array.from({ length: N }, () => []);
  edges.forEach((e, i) => {
    gAdj[e.a].push({ b: e.b, i });
    gAdj[e.b].push({ b: e.a, i });
  });

  let boss = 0;
  for (let i = 1; i < N; i++) if (rooms[i].w * rooms[i].h > rooms[boss].w * rooms[boss].h) boss = i;

  const distFrom = (src) => {
    const D = new Int32Array(N).fill(-1);
    D[src] = 0;
    const q = [src];
    for (let h = 0; h < q.length; h++) {
      const a = q[h];
      for (const e of gAdj[a])
        if (D[e.b] < 0) {
          D[e.b] = D[a] + 1;
          q.push(e.b);
        }
    }
    return D;
  };
  const dB = distFrom(boss);
  let entrance = -1,
    bestD = -1;
  for (let i = 0; i < N; i++)
    if (i !== boss && rooms[i].degree === 1 && dB[i] > bestD) {
      bestD = dB[i];
      entrance = i;
    }
  if (entrance < 0) {
    for (let i = 0; i < N; i++)
      if (i !== boss && dB[i] > bestD) {
        bestD = dB[i];
        entrance = i;
      }
  }

  const dE = distFrom(entrance);
  let maxDepth = 1;
  for (let i = 0; i < N; i++) if (dE[i] > maxDepth) maxDepth = dE[i];
  rooms.forEach((r, i) => {
    r.depth = Math.max(0, dE[i]);
    r.difficulty = Math.min(1, 0.15 + 0.85 * (r.depth / maxDepth));
  });
  rooms[entrance].type = TYPE.ENTRANCE;
  rooms[entrance].difficulty = 0;
  rooms[boss].type = TYPE.BOSS;
  rooms[boss].difficulty = 1;
  // Entry and finale need clear, closed reading before any theme dressing.
  rooms[entrance].shape = "rect";
  rooms[boss].shape = "rect";

  const par = new Int32Array(N).fill(-1),
    pe = new Int32Array(N).fill(-1);
  {
    const q = [entrance],
      vis = new Uint8Array(N);
    vis[entrance] = 1;
    for (let h = 0; h < q.length; h++) {
      const a = q[h];
      for (const e of gAdj[a])
        if (!vis[e.b]) {
          vis[e.b] = 1;
          par[e.b] = a;
          pe[e.b] = e.i;
          q.push(e.b);
        }
    }
  }
  const critRooms = new Set();
  let critLen = 0;
  for (let c = boss; c !== -1; c = par[c]) {
    critRooms.add(c);
    if (pe[c] >= 0) {
      edges[pe[c]].isCritical = true;
      critLen++;
    }
    if (c === entrance) break;
  }

  const leaves = [];
  for (let i = 0; i < N; i++)
    if (i !== entrance && i !== boss && rooms[i].degree === 1) leaves.push(i);
  // Reward branches cover early through late play so health flasks are not
  // piled only in the deepest leaves. Two extra bands keep pressure fair.
  selectDepthSpreadRoomIds(
    leaves.map((id) => ({ id, depth: rooms[id].depth })),
    maxDepth,
    [0.18, 0.34, 0.48, 0.62, 0.78, 0.92],
  ).forEach((i) => {
    rooms[i].type = TYPE.TREASURE;
  });

  const shrineC = [];
  for (let i = 0; i < N; i++) {
    const r = rooms[i];
    if (
      r.type === TYPE.COMBAT &&
      !critRooms.has(i) &&
      r.depth > maxDepth * 0.3 &&
      r.depth < maxDepth * 0.85
    )
      shrineC.push(i);
  }
  const recoveryBranches = new Set(
    shrineC.filter((id) => gAdj[id].some((edge) => critRooms.has(edge.b))),
  );
  selectDepthSpreadRoomIds(
    shrineC.map((id) => ({ id, depth: rooms[id].depth })),
    maxDepth,
    [0.45, 0.72],
    recoveryBranches,
  ).forEach((id) => {
    rooms[id].type = TYPE.SHRINE;
  });
  const eliteC = [];
  for (const i of critRooms) {
    const r = rooms[i];
    if (r.type === TYPE.COMBAT && r.depth >= maxDepth * 0.55 && r.depth <= maxDepth * 0.85)
      eliteC.push(i);
  }
  eliteC.sort((a, b) => rooms[a].depth - rooms[b].depth);
  for (let k = 0; k < Math.min(2, eliteC.length); k++)
    rooms[eliteC[eliteC.length - 1 - k]].type = TYPE.ELITE;

  /* -- 4.5 theme room mutations (generation-aware) -- */
  if (TH.lakes) {
    const lc = [];
    for (let i = 0; i < N; i++) {
      const r = rooms[i];
      if ((r.type === TYPE.COMBAT || r.type === TYPE.ELITE) && Math.min(r.w, r.h) >= 9) lc.push(i);
    }
    for (let k = 0; k < 2 && lc.length > 0; k++)
      rooms[lc.splice(rng.i(0, lc.length - 1), 1)[0]].lake = true;
  }
  if (TH.graveyards) {
    const gc = [];
    for (let i = 0; i < N; i++) {
      const r = rooms[i];
      if (r.type === TYPE.COMBAT && r.shape !== "ellipse" && Math.min(r.w, r.h) >= 8) gc.push(i);
    }
    for (let k = 0; k < 3 && gc.length > 0; k++)
      rooms[gc.splice(rng.i(0, gc.length - 1), 1)[0]].grave = true;
  }

  /* -- 5. carve + rasterize -- */
  let minX = 1e9,
    minY = 1e9,
    maxX = -1e9,
    maxY = -1e9;
  for (const r of rooms) {
    minX = Math.min(minX, r.cx - Math.ceil(r.w / 2));
    maxX = Math.max(maxX, r.cx + Math.ceil(r.w / 2));
    minY = Math.min(minY, r.cy - Math.ceil(r.h / 2));
    maxY = Math.max(maxY, r.cy + Math.ceil(r.h / 2));
  }
  const PADG = 5,
    offX = PADG - minX,
    offY = PADG - minY;
  const W = maxX - minX + PADG * 2 + 1,
    H = maxY - minY + PADG * 2 + 1;
  for (const r of rooms) {
    r.cx += offX;
    r.cy += offY;
    r.sx0 += offX;
    r.sy0 += offY;
  }

  const grid = new Uint8Array(W * H);
  const roomId = new Int16Array(W * H).fill(-1);
  const corridor = new Uint8Array(W * H);
  const idx = (x, y) => y * W + x;
  const inB = (x, y) => x >= 0 && y >= 0 && x < W && y < H;

  for (const r of rooms) {
    const rx = r.w / 2,
      ry = r.h / 2,
      sh = r.shape,
      ch = Math.min(rx, ry) * 0.55;
    const irx2 = 1 / (rx * rx),
      iry2 = 1 / (ry * ry);
    const y0 = Math.max(0, Math.floor(r.cy - ry)),
      y1 = Math.min(H - 1, Math.ceil(r.cy + ry));
    const x0 = Math.max(0, Math.floor(r.cx - rx)),
      x1 = Math.min(W - 1, Math.ceil(r.cx + rx));
    for (let y = y0; y <= y1; y++) {
      const dy = y - r.cy,
        ady = Math.abs(dy),
        row = y * W;
      if (ady > ry) continue;
      for (let x = x0; x <= x1; x++) {
        const dx = x - r.cx,
          adx = Math.abs(dx);
        if (adx > rx) continue;
        let ok = true;
        if (sh === "ellipse") ok = dx * dx * irx2 + dy * dy * iry2 <= 1.0;
        else if (sh === "oct")
          ok = adx <= rx - ch || ady <= ry - ch || adx - (rx - ch) + (ady - (ry - ch)) <= ch;
        if (ok) {
          const c = row + x;
          grid[c] = FLOOR;
          roomId[c] = r.id;
        }
      }
    }
  }

  const stamp = (x, y) => {
    if (inB(x, y) && grid[idx(x, y)] !== FLOOR) {
      grid[idx(x, y)] = FLOOR;
      corridor[idx(x, y)] = 1;
    }
  };
  const offs = (w) => (w === 1 ? [0] : w === 2 ? [0, 1] : [-1, 0, 1]);
  const hLine = (x0, x1, y, w) => {
    const o = offs(w);
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) for (const k of o) stamp(x, y + k);
  };
  const vLine = (y0, y1, x, w) => {
    const o = offs(w);
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (const k of o) stamp(x + k, y);
  };
  const appendCardinalLine = (route, from, to) => {
    if (from.x !== to.x && from.y !== to.y) {
      throw new Error(`Forge edge route must be cardinal: ${from.x},${from.y} -> ${to.x},${to.y}.`);
    }
    let x = from.x,
      y = from.y;
    const append = () => {
      const previous = route[route.length - 1];
      if (!previous || previous.x !== x || previous.y !== y) route.push({ x, y });
    };
    append();
    const stepX = Math.sign(to.x - from.x),
      stepY = Math.sign(to.y - from.y);
    while (x !== to.x || y !== to.y) {
      x += stepX;
      y += stepY;
      append();
    }
  };
  const appendManhattan = (route, from, to, horizontalFirst = true) => {
    const corner = horizontalFirst ? { x: to.x, y: from.y } : { x: from.x, y: to.y };
    appendCardinalLine(route, from, corner);
    appendCardinalLine(route, corner, to);
  };
  const carveManhattan = (from, to, w, route) => {
    if (from.x !== to.x) hLine(from.x, to.x, from.y, w);
    if (from.y !== to.y) vLine(from.y, to.y, to.x, w);
    if (route) appendManhattan(route, from, to, true);
  };
  const roundedCorridor = (A, B, w, horizontalFirst, route) => {
    const dx = B.cx - A.cx,
      dy = B.cy - A.cy;
    if (!dx || !dy) {
      carveManhattan({ x: A.cx, y: A.cy }, { x: B.cx, y: B.cy }, w, route);
      return;
    }
    const sx = Math.sign(dx),
      sy = Math.sign(dy),
      turnRadius = Math.min(3, Math.max(1, Math.floor(Math.min(Math.abs(dx), Math.abs(dy)) / 3)));
    const startAngle = horizontalFirst ? -sy * (Math.PI / 2) : sx > 0 ? Math.PI : 0;
    const sweep = horizontalFirst ? sx * sy * (Math.PI / 2) : -sx * sy * (Math.PI / 2);
    const center = horizontalFirst
      ? { x: B.cx - sx * turnRadius, y: A.cy + sy * turnRadius }
      : { x: A.cx + sx * turnRadius, y: B.cy - sy * turnRadius };
    const entry = horizontalFirst
      ? { x: B.cx - sx * turnRadius, y: A.cy }
      : { x: A.cx, y: B.cy - sy * turnRadius };
    const exit = horizontalFirst
      ? { x: B.cx, y: A.cy + sy * turnRadius }
      : { x: A.cx + sx * turnRadius, y: B.cy };
    carveManhattan({ x: A.cx, y: A.cy }, entry, w, route);
    let previous = entry;
    for (let step = 1; step <= 8; step++) {
      const angle = startAngle + (sweep * step) / 8;
      const point = {
        x: Math.round(center.x + Math.cos(angle) * turnRadius),
        y: Math.round(center.y + Math.sin(angle) * turnRadius),
      };
      carveManhattan(previous, point, w, route);
      previous = point;
    }
    carveManhattan(previous, exit, w, route);
    carveManhattan(exit, { x: B.cx, y: B.cy }, w, route);
  };

  const edgeRoutes = [];
  for (const e of edges) {
    const A = rooms[e.a],
      B = rooms[e.b];
    let w = e.isCritical ? FORGE_CORRIDOR_WIDTHS.critical : FORGE_CORRIDOR_WIDTHS.standard;
    if (
      !e.isCritical &&
      (rooms[e.a].type === TYPE.TREASURE || rooms[e.b].type === TYPE.TREASURE) &&
      rng.chance(0.4)
    )
      w = FORGE_CORRIDOR_WIDTHS.branch;
    const dx = Math.abs(A.cx - B.cx),
      dy = Math.abs(A.cy - B.cy);
    const ovX = Math.min(A.cx + A.w / 2, B.cx + B.w / 2) - Math.max(A.cx - A.w / 2, B.cx - B.w / 2);
    const ovY = Math.min(A.cy + A.h / 2, B.cy + B.h / 2) - Math.max(A.cy - A.h / 2, B.cy - B.h / 2);
    const route = [];
    if (ovX >= w + 2 && dy > 0) {
      const x = Math.round(
        (Math.max(A.cx - A.w / 2, B.cx - B.w / 2) + Math.min(A.cx + A.w / 2, B.cx + B.w / 2)) / 2,
      );
      vLine(A.cy, B.cy, x, w);
      appendManhattan(route, { x: A.cx, y: A.cy }, { x, y: A.cy }, true);
      appendCardinalLine(route, { x, y: A.cy }, { x, y: B.cy });
      appendManhattan(route, { x, y: B.cy }, { x: B.cx, y: B.cy }, true);
    } else if (ovY >= w + 2 && dx > 0) {
      const y = Math.round(
        (Math.max(A.cy - A.h / 2, B.cy - B.h / 2) + Math.min(A.cy + A.h / 2, B.cy + B.h / 2)) / 2,
      );
      hLine(A.cx, B.cx, y, w);
      appendManhattan(route, { x: A.cx, y: A.cy }, { x: A.cx, y }, false);
      appendCardinalLine(route, { x: A.cx, y }, { x: B.cx, y });
      appendManhattan(route, { x: B.cx, y }, { x: B.cx, y: B.cy }, false);
    } else {
      const horizontalFirst = rng.chance(0.5);
      if (Math.min(dx, dy) >= 3 && rng.chance(TH.corridorArc ?? 0.34)) {
        roundedCorridor(A, B, w, horizontalFirst, route);
      } else if (horizontalFirst) {
        hLine(A.cx, B.cx, A.cy, w);
        vLine(A.cy, B.cy, B.cx, w);
        appendManhattan(route, { x: A.cx, y: A.cy }, { x: B.cx, y: B.cy }, true);
      } else {
        vLine(A.cy, B.cy, A.cx, w);
        hLine(A.cx, B.cx, B.cy, w);
        appendManhattan(route, { x: A.cx, y: A.cy }, { x: B.cx, y: B.cy }, false);
      }
    }
    edgeRoutes.push(route);
  }

  const doorwayTopology = {
    width: W,
    height: H,
    grid,
    corridors: corridor,
    roomIds: roomId,
    preservedOpenings: new Set(),
  };
  const sealedBoundaryLeaks = sealInvalidForgeRoomOpenings(doorwayTopology);

  // Sealing tangent room cuts can invalidate a centerline that was recorded
  // while its edge was carved. Repair only those routes against the final
  // corridor topology, forbidding shortcuts through unrelated rooms.
  const routeMarks = new Uint32Array(W * H),
    routePrevious = new Int32Array(W * H),
    routeQueue = new Int32Array(W * H);
  let routeEpoch = 0;
  const edgeRouteCellAllowed = (cell, edge, allowOtherRooms = false) => {
    if (grid[cell] !== FLOOR) return false;
    const owner = roomId[cell];
    return allowOtherRooms || owner < 0 || owner === edge.a || owner === edge.b;
  };
  const edgeRouteIsUsable = (edge, route) => {
    const A = rooms[edge.a],
      B = rooms[edge.b];
    if (!route?.length) return false;
    if (route[0].x !== A.cx || route[0].y !== A.cy) return false;
    const last = route[route.length - 1];
    if (last.x !== B.cx || last.y !== B.cy) return false;
    for (let index = 0; index < route.length; index++) {
      const cell = route[index],
        flat = idx(cell.x, cell.y);
      if (!inB(cell.x, cell.y) || !edgeRouteCellAllowed(flat, edge)) return false;
      if (index > 0) {
        const previous = route[index - 1];
        if (Math.abs(cell.x - previous.x) + Math.abs(cell.y - previous.y) !== 1) return false;
      }
    }
    return true;
  };
  const findFinalEdgeRoute = (edge, allowOtherRooms = false) => {
    const A = rooms[edge.a],
      B = rooms[edge.b],
      start = idx(A.cx, A.cy),
      goal = idx(B.cx, B.cy);
    routeEpoch++;
    let head = 0,
      tail = 0;
    routeQueue[tail++] = start;
    routeMarks[start] = routeEpoch;
    routePrevious[start] = -1;
    while (head < tail && routeMarks[goal] !== routeEpoch) {
      const current = routeQueue[head++],
        x = current % W,
        y = Math.floor(current / W);
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
      ]) {
        const nx = x + dx,
          ny = y + dy;
        if (!inB(nx, ny)) continue;
        const next = idx(nx, ny);
        if (routeMarks[next] === routeEpoch || !edgeRouteCellAllowed(next, edge, allowOtherRooms))
          continue;
        routeMarks[next] = routeEpoch;
        routePrevious[next] = current;
        routeQueue[tail++] = next;
      }
    }
    if (routeMarks[goal] !== routeEpoch) return [];
    const route = [];
    for (let current = goal; current !== -1; current = routePrevious[current]) {
      route.push({ x: current % W, y: Math.floor(current / W) });
    }
    return route.reverse();
  };
  edges.forEach((edge, edgeIndex) => {
    if (!edgeRouteIsUsable(edge, edgeRoutes[edgeIndex])) {
      const directRoute = findFinalEdgeRoute(edge);
      // Legacy Forge layouts can have an abstract edge whose original cut was
      // sealed beside a third room. In that case, show the real walkable route
      // through the final dungeon instead of restoring the invalid cut.
      edgeRoutes[edgeIndex] = directRoute.length ? directRoute : findFinalEdgeRoute(edge, true);
    }
  });

  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      if (grid[row + x] !== FLOOR) continue;
      const ya = Math.max(0, y - 1),
        yb = Math.min(H - 1, y + 1);
      const xa = Math.max(0, x - 1),
        xb = Math.min(W - 1, x + 1);
      for (let ny = ya; ny <= yb; ny++) {
        const nrow = ny * W;
        for (let nx = xa; nx <= xb; nx++) {
          const ni = nrow + nx;
          if (grid[ni] === VOID) grid[ni] = WALL;
        }
      }
    }
  }

  const doorway = new Uint8Array(W * H);
  const doorwayRoomDx = new Int8Array(W * H);
  const doorwayRoomDy = new Int8Array(W * H);
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      const c = row + x;
      if (!corridor[c]) continue;
      const direction = getForgeDoorwayDirection(doorwayTopology, x, y);
      if (direction) {
        doorway[c] = 1;
        doorwayRoomDx[c] = direction.dx;
        doorwayRoomDy[c] = direction.dy;
      }
    }
  }

  /* -- 5.5 theme carving: liquid pockets, frozen lakes, arches -- */
  /* Pockets replace single WALL cells with sunken liquid slots (POOL).
     Connectivity is untouched: floor cells never change, and any VOID
     exposed behind a pocket is backfilled with WALL. */
  const pools = [];
  if (TH.pools && TH.pools.amount > 0) {
    const nearDoorC = (x, y, d) => {
      for (let oy = -d; oy <= d; oy++)
        for (let ox = -d; ox <= d; ox++) {
          const nx = x + ox,
            ny = y + oy;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H && doorway[idx(nx, ny)]) return true;
        }
      return false;
    };
    const cand = [];
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const c = idx(x, y);
        if (grid[c] !== WALL || nearDoorC(x, y, 2)) continue;
        let nf = 0;
        if (grid[c + 1] === FLOOR) nf++;
        if (grid[c - 1] === FLOOR) nf++;
        if (grid[c + W] === FLOOR) nf++;
        if (grid[c - W] === FLOOR) nf++;
        if (nf === 1) cand.push({ x, y });
      }
    for (let i = cand.length - 1; i > 0; i--) {
      const j = rng.i(0, i);
      const t = cand[i];
      cand[i] = cand[j];
      cand[j] = t;
    }
    const target = Math.round(cand.length * TH.pools.amount);
    for (const s of cand) {
      if (pools.length >= target) break;
      let close = false;
      for (const p of pools)
        if (Math.max(Math.abs(p.x - s.x), Math.abs(p.y - s.y)) < 3) {
          close = true;
          break;
        }
      if (close) continue;
      grid[idx(s.x, s.y)] = POOL;
      pools.push({ x: s.x, y: s.y });
    }
    for (const p of pools)
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          const nx = p.x + ox,
            ny = p.y + oy;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H && grid[idx(nx, ny)] === VOID)
            grid[idx(nx, ny)] = WALL;
        }
  }

  /* Interior liquid pits: single floor cells sunk into lava/water/miasma.
     Carved before BFS validation, so connectivity is still guaranteed;
     interior-only + spacing >= 4 means a room can never be split. */
  if (TH.pools && TH.pools.pits) {
    for (const r of rooms) {
      if ((r.type !== TYPE.COMBAT && r.type !== TYPE.ELITE) || r.lake || r.grave) continue;
      let n = Math.min(TH.pools.pits, Math.floor((r.w * r.h) / 45) + 1),
        guard = 0;
      while (n > 0 && guard++ < 40) {
        const x = rng.i(Math.floor(r.cx - r.w / 2) + 2, Math.ceil(r.cx + r.w / 2) - 2);
        const y = rng.i(Math.floor(r.cy - r.h / 2) + 2, Math.ceil(r.cy + r.h / 2) - 2);
        if (!inB(x, y)) continue;
        const c = idx(x, y);
        if (roomId[c] !== r.id || grid[c] !== FLOOR || doorway[c]) continue;
        let ok = true;
        for (let oy = -1; oy <= 1 && ok; oy++)
          for (let ox = -1; ox <= 1; ox++)
            if (grid[idx(x + ox, y + oy)] !== FLOOR) {
              ok = false;
              break;
            }
        if (ok)
          for (const p of pools)
            if (Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) < 4) {
              ok = false;
              break;
            }
        if (!ok) continue;
        grid[c] = POOL;
        pools.push({ x, y });
        n--;
      }
    }
  }

  /* Frozen lakes: interior floor cells of lake rooms stay walkable (FLOOR
     for BFS) but are flagged so rendering swaps stone tiles for ice. */
  const lakeMask = new Uint8Array(W * H);
  const lakeCells = [];
  for (const r of rooms) {
    if (!r.lake) continue;
    for (let y = Math.floor(r.cy - r.h / 2) + 2; y <= Math.ceil(r.cy + r.h / 2) - 2; y++)
      for (let x = Math.floor(r.cx - r.w / 2) + 2; x <= Math.ceil(r.cx + r.w / 2) - 2; x++) {
        if (!inB(x, y)) continue;
        const c = idx(x, y);
        if (roomId[c] !== r.id || grid[c] !== FLOOR || doorway[c]) continue;
        let solid = false;
        for (let oy = -1; oy <= 1 && !solid; oy++)
          for (let ox = -1; ox <= 1; ox++)
            if (grid[idx(x + ox, y + oy)] !== FLOOR) {
              solid = true;
              break;
            }
        if (!solid) {
          lakeMask[c] = 1;
          lakeCells.push({ x, y });
        }
      }
  }

  /* Doorway arches: group doorway cells into runs perpendicular to the
     corridor axis; one arch frame per run of width <= 3. */
  const arches = [];
  {
    const aseen = new Uint8Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const c = idx(x, y);
        if (!doorway[c] || aseen[c]) continue;
        const rx = doorwayRoomDx[c],
          ry = doorwayRoomDy[c];
        if (!rx && !ry) continue;
        const px = rx === 0 ? 1 : 0,
          py = rx === 0 ? 0 : 1;
        let x0 = x,
          y0 = y,
          x1 = x,
          y1 = y;
        while (
          inB(x0 - px, y0 - py) &&
          doorway[idx(x0 - px, y0 - py)] &&
          doorwayRoomDx[idx(x0 - px, y0 - py)] === rx &&
          doorwayRoomDy[idx(x0 - px, y0 - py)] === ry &&
          !aseen[idx(x0 - px, y0 - py)]
        ) {
          x0 -= px;
          y0 -= py;
        }
        while (
          inB(x1 + px, y1 + py) &&
          doorway[idx(x1 + px, y1 + py)] &&
          doorwayRoomDx[idx(x1 + px, y1 + py)] === rx &&
          doorwayRoomDy[idx(x1 + px, y1 + py)] === ry &&
          !aseen[idx(x1 + px, y1 + py)]
        ) {
          x1 += px;
          y1 += py;
        }
        let len = 0;
        for (let ax = x0, ay = y0; ; ax += px, ay += py) {
          aseen[idx(ax, ay)] = 1;
          len++;
          if (ax === x1 && ay === y1) break;
        }
        if (len <= 3)
          arches.push({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, px, py, len, roomDx: rx, roomDy: ry });
      }
  }

  /* -- 6. BFS field + validation -- */
  const bfs = new Int16Array(W * H).fill(-1);
  const ei = idx(rooms[entrance].cx, rooms[entrance].cy);
  const total = W * H;
  let floorTotal = 0;
  for (let i = 0; i < total; i++) if (grid[i] === FLOOR) floorTotal++;
  let reach = 0,
    maxBfs = 0;
  if (grid[ei] === FLOOR) {
    const q = new Int32Array(floorTotal);
    let qh = 0,
      qt = 0;
    q[qt++] = ei;
    bfs[ei] = 0;
    reach = 1;
    while (qh < qt) {
      const c = q[qh++],
        x = c % W,
        b = bfs[c] + 1;
      let n;
      if (x > 0 && grid[(n = c - 1)] === FLOOR && bfs[n] < 0) {
        bfs[n] = b;
        q[qt++] = n;
        reach++;
      }
      if (x < W - 1 && grid[(n = c + 1)] === FLOOR && bfs[n] < 0) {
        bfs[n] = b;
        q[qt++] = n;
        reach++;
      }
      if (c >= W && grid[(n = c - W)] === FLOOR && bfs[n] < 0) {
        bfs[n] = b;
        q[qt++] = n;
        reach++;
      }
      if (c < total - W && grid[(n = c + W)] === FLOOR && bfs[n] < 0) {
        bfs[n] = b;
        q[qt++] = n;
        reach++;
      }
    }
    maxBfs = bfs[q[qt - 1]]; /* FIFO: last enqueued cell is farthest */
  }
  const valid = reach === floorTotal && floorTotal > 0;

  /* -- 7. decoration (pure data) -- */
  const props = [],
    spawns = [];
  const occ = new Uint8Array(W * H);
  const nearDoor = (x, y, d) => {
    for (let oy = -d; oy <= d; oy++)
      for (let ox = -d; ox <= d; ox++)
        if (inB(x + ox, y + oy) && doorway[idx(x + ox, y + oy)]) return true;
    return false;
  };
  const interior = (x, y) => {
    for (let oy = -1; oy <= 1; oy++)
      for (let ox = -1; ox <= 1; ox++)
        if (!inB(x + ox, y + oy) || grid[idx(x + ox, y + oy)] !== FLOOR) return false;
    return true;
  };
  const put = (kind, x, y, rot, scale, rid) => {
    props.push({ kind, x, y, rot: rot || 0, scale: scale || 1, roomId: rid });
    occ[idx(x, y)] = 1;
  };

  for (const r of rooms) {
    const cix = idx(r.cx, r.cy);
    if (r.type === TYPE.ENTRANCE) put("ring", r.cx, r.cy, 0, 1, r.id);
    if (r.type === TYPE.BOSS) {
      put("bossCrystal", r.cx, r.cy, rng.f(0, 6.28), 1, r.id);
      const rr = Math.max(2.5, Math.min(r.w, r.h) / 2 - 2),
        a0 = rng.f(0, 1);
      for (let k = 0; k < 6; k++) {
        const a = a0 + (k * Math.PI) / 3;
        const bx = Math.round(r.cx + Math.cos(a) * rr),
          by = Math.round(r.cy + Math.sin(a) * rr);
        if (inB(bx, by) && grid[idx(bx, by)] === FLOOR && !occ[idx(bx, by)] && !nearDoor(bx, by, 1))
          put("brazier", bx, by, 0, 1, r.id);
      }
    }
    if (r.type === TYPE.TREASURE && grid[cix] === FLOOR)
      put("chest", r.cx, r.cy, (rng.i(0, 3) * Math.PI) / 2, 1, r.id);
    if (r.type === TYPE.SHRINE && grid[cix] === FLOOR)
      put("shrineCrystal", r.cx, r.cy, rng.f(0, 6.28), 1, r.id);

    if (
      (r.type === TYPE.COMBAT || r.type === TYPE.ELITE) &&
      Math.min(r.w, r.h) >= 10 &&
      r.shape !== "ellipse" &&
      !r.grave &&
      !r.lake
    ) {
      const step = Math.min(r.w, r.h) >= 14 ? 4 : 3;
      for (let y = Math.ceil(r.cy - r.h / 2) + 2; y <= r.cy + r.h / 2 - 2; y++)
        for (let x = Math.ceil(r.cx - r.w / 2) + 2; x <= r.cx + r.w / 2 - 2; x++) {
          if ((x - r.cx) % step !== 0 || (y - r.cy) % step !== 0) continue;
          if (x === r.cx && y === r.cy) continue;
          if (interior(x, y) && !occ[idx(x, y)] && !nearDoor(x, y, 2))
            put("pillar", x, y, 0, rng.f(0.94, 1.06), r.id);
        }
    }
    if (r.grave) {
      for (let y = Math.ceil(r.cy - r.h / 2) + 2; y <= r.cy + r.h / 2 - 2; y += 2)
        for (let x = Math.ceil(r.cx - r.w / 2) + 2; x <= r.cx + r.w / 2 - 2; x += 2) {
          if (Math.abs(x - r.cx) <= 1 && Math.abs(y - r.cy) <= 1) continue;
          if (interior(x, y) && !occ[idx(x, y)] && !nearDoor(x, y, 2) && rng.chance(0.8))
            put("grave", x, y, rng.f(-0.3, 0.3), rng.f(0.85, 1.15), r.id);
        }
      if (Math.min(r.w, r.h) >= 10 && grid[cix] === FLOOR && !occ[cix])
        put("sarco", r.cx, r.cy, rng.chance(0.5) ? 0 : Math.PI / 2, 1, r.id);
      let cd = 4;
      while (cd-- > 0) {
        const x = rng.i(Math.floor(r.cx - r.w / 2) + 1, Math.ceil(r.cx + r.w / 2) - 1);
        const y = rng.i(Math.floor(r.cy - r.h / 2) + 1, Math.ceil(r.cy + r.h / 2) - 1);
        if (inB(x, y) && roomId[idx(x, y)] === r.id && grid[idx(x, y)] === FLOOR && !occ[idx(x, y)])
          put("campfire", x, y, 0, rng.f(0.9, 1.15), r.id);
      }
    }
    if (r.type === TYPE.COMBAT || r.type === TYPE.ELITE || r.type === TYPE.BOSS) {
      let area = 0;
      for (let y = Math.floor(r.cy - r.h / 2); y <= Math.ceil(r.cy + r.h / 2); y++)
        for (let x = Math.floor(r.cx - r.w / 2); x <= Math.ceil(r.cx + r.w / 2); x++)
          if (inB(x, y) && roomId[idx(x, y)] === r.id) area++;
      let count = Math.round((area / 18) * (0.5 + r.difficulty));
      if (r.type === TYPE.ELITE) count = Math.max(2, Math.round(count * 0.6));
      if (r.type === TYPE.BOSS) count = rng.i(2, 3);
      const tier = r.type === TYPE.ELITE ? 3 : Math.max(1, Math.ceil(r.difficulty * 3));
      let guard = 0;
      while (count > 0 && guard++ < 220) {
        const x = rng.i(Math.floor(r.cx - r.w / 2) + 1, Math.ceil(r.cx + r.w / 2) - 1);
        const y = rng.i(Math.floor(r.cy - r.h / 2) + 1, Math.ceil(r.cy + r.h / 2) - 1);
        if (!inB(x, y)) continue;
        const c = idx(x, y);
        if (roomId[c] === r.id && grid[c] === FLOOR && !occ[c] && !doorway[c] && !lakeMask[c]) {
          spawns.push({ x, y, tier, roomId: r.id });
          occ[c] = 1;
          count--;
        }
      }
    }
  }
  const torchCand = [];
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      const c = row + x;
      if (grid[c] !== WALL) continue;
      if (x < W - 1 && grid[c + 1] === FLOOR) torchCand.push({ x, y, dx: 1, dy: 0 });
      else if (x > 0 && grid[c - 1] === FLOOR) torchCand.push({ x, y, dx: -1, dy: 0 });
      else if (y < H - 1 && grid[c + W] === FLOOR) torchCand.push({ x, y, dx: 0, dy: 1 });
      else if (y > 0 && grid[c - W] === FLOOR) torchCand.push({ x, y, dx: 0, dy: -1 });
    }
  }
  for (let i = torchCand.length - 1; i > 0; i--) {
    const j = rng.i(0, i);
    const t = torchCand[i];
    torchCand[i] = torchCand[j];
    torchCand[j] = t;
  }
  // Even map coverage: shuffle candidates, then keep only those past a uniform
  // Chebyshev spacing so no room (including the entrance) steals the budget.
  const MAP_TORCH_SPACING = 4;
  const torches = [];
  for (const candidate of torchCand) {
    let ok = true;
    for (const placed of torches) {
      if (
        Math.max(Math.abs(placed.x - candidate.x), Math.abs(placed.y - candidate.y)) <
        MAP_TORCH_SPACING
      ) {
        ok = false;
        break;
      }
    }
    if (ok) torches.push(candidate);
  }
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      const c = row + x;
      if (grid[c] !== FLOOR || occ[c] || doorway[c] || lakeMask[c]) continue;
      const rid = roomId[c];
      const diff = rid >= 0 ? rooms[rid].difficulty : 0.5;
      let p = params.decorDensity * 0.045 * (1.25 - 0.6 * diff);
      if (corridor[c]) p *= 0.45;
      if (rng.chance(p))
        props.push({
          kind: "debris",
          x,
          y,
          rot: rng.f(0, 6.28),
          scale: rng.f(0.6, 1.35),
          roomId: rid,
          v: rng.i(0, 2),
        });
    }
  }

  /* -- 7.5 theme prop sweeps -- */
  const floorDir = (x, y) => {
    const c = idx(x, y);
    if (x < W - 1 && grid[c + 1] === FLOOR) return [1, 0];
    if (x > 0 && grid[c - 1] === FLOOR) return [-1, 0];
    if (y < H - 1 && grid[c + W] === FLOOR) return [0, 1];
    if (y > 0 && grid[c - W] === FLOOR) return [0, -1];
    return null;
  };
  if (TH.icicles) {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (grid[idx(x, y)] !== WALL) continue;
        const d = floorDir(x, y);
        if (d && rng.chance(0.06 + 0.08 * params.decorDensity))
          props.push({
            kind: "icicle",
            x,
            y,
            dx: d[0],
            dy: d[1],
            rot: rng.f(0, 6.28),
            scale: rng.f(0.7, 1.3),
          });
      }
    for (const lc of lakeCells)
      if (rng.chance(0.05))
        props.push({
          kind: "shardIce",
          x: lc.x,
          y: lc.y,
          rot: rng.f(0, 6.28),
          scale: rng.f(0.6, 1.2),
        });
  }
  if (TH.roots) {
    const sites = [];
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        if (grid[idx(x, y)] !== WALL) continue;
        const d = floorDir(x, y);
        if (d && roomId[idx(x + d[0], y + d[1])] >= 0) sites.push({ x, y, dx: d[0], dy: d[1] });
      }
    for (let i = sites.length - 1; i > 0; i--) {
      const j = rng.i(0, i);
      const t = sites[i];
      sites[i] = sites[j];
      sites[j] = t;
    }
    const breaches = [];
    for (const s of sites) {
      if (breaches.length >= 5) break;
      let close = false;
      for (const b of breaches)
        if (Math.max(Math.abs(b.x - s.x), Math.abs(b.y - s.y)) < 7) {
          close = true;
          break;
        }
      if (!close) breaches.push(s);
    }
    const mossMask = new Uint8Array(W * H);
    for (const b of breaches) {
      props.push({
        kind: "roots",
        x: b.x,
        y: b.y,
        dx: b.dx,
        dy: b.dy,
        rot: 0,
        scale: rng.f(0.9, 1.2),
      });
      for (let oy = -2; oy <= 2; oy++)
        for (let ox = -2; ox <= 2; ox++) {
          const nx = b.x + ox,
            ny = b.y + oy;
          if (!inB(nx, ny)) continue;
          const c = idx(nx, ny);
          if (grid[c] === FLOOR && !mossMask[c] && rng.chance(0.75)) {
            mossMask[c] = 1;
            props.push({ kind: "moss", x: nx, y: ny, rot: rng.f(0, 6.28), scale: rng.f(0.7, 1.4) });
          }
        }
    }
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const c = idx(x, y);
        if (grid[c] !== FLOOR || mossMask[c] || lakeMask[c]) continue;
        let nw = 0;
        if (x < W - 1 && grid[c + 1] === WALL) nw++;
        if (x > 0 && grid[c - 1] === WALL) nw++;
        if (y < H - 1 && grid[c + W] === WALL) nw++;
        if (y > 0 && grid[c - W] === WALL) nw++;
        if (nw > 0 && rng.chance(0.12 * params.decorDensity)) {
          mossMask[c] = 1;
          props.push({ kind: "moss", x, y, rot: rng.f(0, 6.28), scale: rng.f(0.6, 1.3) });
        }
      }
  }
  if (TH.bones) {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const c = idx(x, y);
        if (grid[c] !== FLOOR || occ[c] || doorway[c] || corridor[c]) continue;
        const rid = roomId[c];
        if (rid >= 0 && rooms[rid].depth > 1 && rng.chance(0.018 + 0.02 * params.decorDensity))
          props.push({
            kind: "bones",
            x,
            y,
            rot: rng.f(0, 6.28),
            scale: rng.f(0.8, 1.2),
            roomId: rid,
          });
      }
  }
  /* liquid veins: crack decals anchored to pool edges so they read as heat/
     rot radiating FROM the liquid into the surrounding stone, never floating
     mid-room. Frost gets pale fracture lines around lake shores. */
  {
    const DIRS = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    if (TH.pools && (TH.pools.mode === 0 || TH.pools.mode === 3)) {
      const pv = TH.pools.mode === 0 ? 0.8 : 0.45;
      for (const p of pools)
        for (const [dx, dy] of DIRS) {
          const nx = p.x + dx,
            ny = p.y + dy;
          if (!inB(nx, ny) || grid[idx(nx, ny)] !== FLOOR) continue;
          if (rng.chance(pv))
            props.push({
              kind: "crack",
              x: nx,
              y: ny,
              dx,
              dy,
              rot: rng.f(0, 6.28),
              scale: rng.f(0.9, 1.5),
            });
        }
    }
    if (TH.lakes) {
      for (const lc of lakeCells)
        for (const [dx, dy] of DIRS) {
          const nx = lc.x + dx,
            ny = lc.y + dy;
          if (!inB(nx, ny)) continue;
          const c2 = idx(nx, ny);
          if (grid[c2] !== FLOOR || lakeMask[c2]) continue;
          if (rng.chance(0.3))
            props.push({
              kind: "crack",
              x: nx,
              y: ny,
              dx,
              dy,
              rot: rng.f(0, 6.28),
              scale: rng.f(0.7, 1.2),
              ice: 1,
            });
        }
    }
  }
  for (const r of rooms) {
    if (r.type !== TYPE.ELITE && r.type !== TYPE.BOSS) continue;
    const cand = [];
    for (let y = Math.floor(r.cy - r.h / 2) - 1; y <= Math.ceil(r.cy + r.h / 2) + 1; y++)
      for (let x = Math.floor(r.cx - r.w / 2) - 1; x <= Math.ceil(r.cx + r.w / 2) + 1; x++) {
        if (!inB(x, y) || grid[idx(x, y)] !== WALL) continue;
        const d = floorDir(x, y);
        if (d && roomId[idx(x + d[0], y + d[1])] === r.id) cand.push({ x, y, dx: d[0], dy: d[1] });
      }
    for (let i = cand.length - 1; i > 0; i--) {
      const j = rng.i(0, i);
      const t = cand[i];
      cand[i] = cand[j];
      cand[j] = t;
    }
    const placed = [];
    for (const s of cand) {
      if (placed.length >= (r.type === TYPE.BOSS ? 4 : 2)) break;
      let close = false;
      for (const p of placed)
        if (Math.max(Math.abs(p.x - s.x), Math.abs(p.y - s.y)) < 4) {
          close = true;
          break;
        }
      if (!close) {
        placed.push(s);
        props.push({ kind: "banner", x: s.x, y: s.y, dx: s.dx, dy: s.dy, rot: 0, scale: 1 });
      }
    }
  }

  const loops = edges.filter((e) => e.isLoop).length;
  return {
    valid,
    params,
    seed,
    name: dungeonName(rng, TH),
    W,
    H,
    grid,
    roomId,
    corridor,
    doorway,
    bfs,
    maxBfs,
    rooms,
    edges,
    edgeRoutes,
    entrance,
    boss,
    maxDepth,
    props,
    spawns,
    torches,
    pools,
    lakeCells,
    lakeMask,
    arches,
    stats: {
      rooms: N,
      edges: edges.length,
      loops,
      critLen,
      floorTiles: floorTotal,
      reach,
      genMs: 0,
      attempts: 1,
      sealedBoundaryLeaks,
      preservedBoundaryOpenings: doorwayTopology.preservedOpenings.size,
    },
  };
}
