/**
 * DUNGEON FORGE — entry point.
 *
 * A self-contained procedural dungeon generator + real-time showcase.
 * The whole pipeline (scatter → separate → Delaunay → MST+loops → semantics
 * → carve → rasterize+BFS → decorate → instanced render) lives in this module,
 * driven by a single deterministic mulberry32 stream so any seed rebuilds the
 * exact same dungeon.
 *
 * The generator derives from a modified version of Majid Manzarpour's
 * threejs-procedural-dungeon. See THIRD_PARTY_NOTICES.md.
 *
 * Rendering targets Three.js r128 (see README → "A note on the Three.js
 * version"). The named-export namespace import below is the ESM equivalent of
 * the global `THREE` the original prototype pulled from a CDN.
 */
import * as THREE from "three";
import {
  FORGE_CORRIDOR_WIDTHS,
  FORGE_ROOM_BANDS,
  FORGE_SCATTER_RADIUS,
  getForgeDoorwayDirection,
  sealInvalidForgeRoomOpenings,
  selectDepthSpreadRoomIds,
  selectForgeMagicStonePlacements,
} from "./layoutTuning";
import {
  ENEMY_ARCHETYPES,
  getEnemySpriteRenderMetrics,
  isLowProfileEnemy,
} from "../world/EnemyArchetypes";
import {
  createEnemyContactShadowMaterial,
  resolveEnemyContactShadowLayout,
} from "../world/EnemyBillboardMaterial";
import { selectEnemyKindsForSpawns } from "../world/EnemySpawnPlan";
import { enemyAnimationsForMood } from "../world/EnemySpriteAtlas";
import { createMagicStone } from "../world/MagicStoneKit";
import { auditAndRepairForgeSurface } from "./SurfaceGeometryAudit";
import { resolveForgeRenderQuality } from "./ForgeRenderQuality";
import { resolveEditorLightingProfile } from "../editor/EditorLightingProfiles";
import { nextProceduralSeed } from "../game/SeedFactory";
import {
  BIOME_PARTICLE_MOTION_ID,
  BIOME_PARTICLE_SHAPE_ID,
  getBiomeParticleProfile,
} from "../systems/BiomeParticleProfile";

/* ================================================================
   DUNGEON FORGE — procedural dungeon generator core + showcase
   Pipeline: scatter → separate → Delaunay → MST+loops → semantics
             → carve → rasterize+BFS → decorate → instanced render
   Deterministic: mulberry32 threaded through every stage.
   ================================================================ */

/* ---------------- RNG ---------------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeRng(seed) {
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
const VOID = 0,
  FLOOR = 1,
  WALL = 2,
  POOL = 3;
const TYPE = {
  ENTRANCE: "entrance",
  COMBAT: "combat",
  ELITE: "elite",
  TREASURE: "treasure",
  SHRINE: "shrine",
  BOSS: "boss",
};
const TINT = {
  entrance: 0x3fd0bb,
  combat: 0x8f95a3,
  elite: 0x9b6cf0,
  treasure: 0xd9a441,
  shrine: 0x5a8fe8,
  boss: 0xd8433a,
};

/* ---------------- theme specs ----------------
   Each theme is one data object: palette, lighting rig, liquid shader
   params, particle system, prop-kit flags consumed by the generator,
   and name-generator word pools. Everything downstream is data-driven. */
const THEMES = {
  ancient: {
    label: "ANCIENT",
    accent: "#e8973f",
    bg: 0x07080d,
    fog: 0x07080d,
    fogD: 0.0021,
    hemi: [0x2e3a52, 0x0a0b10, 0.55],
    dir: [0xffe8c8, 0.85],
    floor: 0x8a8f9c,
    corridor: 0x6d7380,
    wall: 0x5c626e,
    cap: 0x757b88,
    pillar: 0x6a707e,
    debris: [0x4c515e, 0x60584a],
    flame: 0xffa640,
    flameCore: 0xfff3c8,
    torchLight: [0xff8c3a, 1.5, 9.5],
    cloth: 0x7d2c26,
    corridorArc: 0.28,
    pools: null,
    particles: { kind: 0, color: 0xaab4cc, n: 110 },
    nameA: ["Sunken", "Forgotten", "Silent", "Hollow", "Elder", "Broken", "Nameless", "Fallen"],
    nameB: [
      "Halls",
      "Vaults",
      "Catacombs",
      "Depths",
      "Sanctum",
      "Undercroft",
      "Barrows",
      "Reliquary",
    ],
  },
  molten: {
    label: "MOLTEN",
    accent: "#ff8642",
    bg: 0x0c0605,
    fog: 0x1a0b04,
    fogD: 0.0028,
    hemi: [0x6b3419, 0x160503, 0.55],
    dir: [0xffd9b0, 0.5],
    floor: 0x7a685c,
    corridor: 0x614f44,
    wall: 0x503e34,
    cap: 0x6b5546,
    pillar: 0x5e4a3e,
    debris: [0x4a382e, 0x60462f],
    flame: 0xff8c26,
    flameCore: 0xffe9b0,
    torchLight: [0xff7326, 1.7, 10],
    cloth: 0x7d2416,
    corridorArc: 0.18,
    pools: { mode: 0, colA: 0x2b0d05, colB: 0xff5a1f, glow: 1.55, amount: 0.16, pits: 2 },
    particles: { kind: 1, color: 0xffa050, n: 240 },
    nameA: [
      "Molten",
      "Ashen",
      "Cindered",
      "Smouldering",
      "Charred",
      "Burning",
      "Ember",
      "Scorched",
    ],
    nameB: ["Forges", "Furnaces", "Calderas", "Foundry", "Kilns", "Vents", "Crucible", "Depths"],
  },
  frost: {
    label: "FROST",
    accent: "#7fd4ff",
    bg: 0x060a12,
    fog: 0x0b1522,
    fogD: 0.0024,
    hemi: [0x3a5a80, 0x0a0e18, 0.5],
    dir: [0xcfe4ff, 0.82],
    floor: 0x93a0b2,
    corridor: 0x78848f,
    wall: 0x60708a,
    cap: 0x8194ac,
    pillar: 0x70809a,
    debris: [0x55617a, 0x6d7a90],
    flame: 0x86d9ff,
    flameCore: 0xe8f7ff,
    torchLight: [0x6fc4ff, 1.35, 9.5],
    cloth: 0x2b4d70,
    corridorArc: 0.46,
    pools: { mode: 1, colA: 0x4a86c0, colB: 0xbfe4ff, glow: 0.55, amount: 0 },
    lakes: true,
    icicles: true,
    particles: { kind: 2, color: 0xdff0ff, n: 260 },
    nameA: [
      "Frozen",
      "Rimebound",
      "Glacial",
      "Howling",
      "Pale",
      "Shivering",
      "Wintered",
      "Whitelocked",
    ],
    nameB: [
      "Crypts",
      "Caverns",
      "Hollows",
      "Galleries",
      "Sepulchre",
      "Warrens",
      "Reaches",
      "Throat",
    ],
  },
  grim: {
    label: "GRIM",
    accent: "#9fe66a",
    bg: 0x070a07,
    fog: 0x0a130a,
    fogD: 0.003,
    hemi: [0x2c4030, 0x070a06, 0.52],
    dir: [0xbfd8b0, 0.45],
    floor: 0x7c8276,
    corridor: 0x62685c,
    wall: 0x4f5549,
    cap: 0x666c5e,
    pillar: 0x5c6254,
    debris: [0x4a4f44, 0x5e5c48],
    flame: 0x8fe05a,
    flameCore: 0xe9ffd0,
    torchLight: [0x77d94a, 1.35, 9],
    cloth: 0x33461f,
    corridorArc: 0.5,
    pools: { mode: 3, colA: 0x0a1207, colB: 0x41602c, glow: 0.6, amount: 0.05, pits: 1 },
    graveyards: true,
    bones: true,
    particles: { kind: 3, color: 0x9fe66a, n: 150 },
    nameA: ["Blighted", "Weeping", "Rotting", "Cursed", "Umbral", "Plagued", "Mournful", "Grim"],
    nameB: [
      "Necropolis",
      "Ossuary",
      "Tombs",
      "Charnels",
      "Graves",
      "Catacombs",
      "Morgue",
      "Crypts",
    ],
  },
  verdant: {
    label: "VERDANT",
    accent: "#59d68f",
    bg: 0x060c09,
    fog: 0x091510,
    fogD: 0.0023,
    hemi: [0x2f5a46, 0x08120c, 0.6],
    dir: [0xd8f0c8, 0.8],
    floor: 0x848e7e,
    corridor: 0x6a7560,
    wall: 0x556050,
    cap: 0x6e7a66,
    pillar: 0x606c5c,
    debris: [0x49543f, 0x5c644c],
    flame: 0x62e0a8,
    flameCore: 0xe6fff0,
    torchLight: [0x4ad98e, 1.3, 9],
    cloth: 0x1f5038,
    corridorArc: 0.58,
    pools: { mode: 2, colA: 0x0c3532, colB: 0x2fa38a, glow: 0.6, amount: 0.05, pits: 1 },
    roots: true,
    shafts: true,
    particles: { kind: 4, color: 0x8fe6b8, n: 200 },
    nameA: [
      "Verdant",
      "Overgrown",
      "Sporebound",
      "Tangled",
      "Mossgrown",
      "Waking",
      "Feral",
      "Blooming",
    ],
    nameB: [
      "Gardens",
      "Warrens",
      "Roots",
      "Conservatory",
      "Hollows",
      "Groves",
      "Cisterns",
      "Arbors",
    ],
  },
  obsidian: {
    label: "OBSIDIAN",
    accent: "#c25f8b",
    bg: 0x050307,
    fog: 0x100714,
    fogD: 0.0031,
    hemi: [0x4c2858, 0x080309, 0.44],
    dir: [0xcf9fd2, 0.46],
    floor: 0x302438,
    corridor: 0x281d30,
    wall: 0x211827,
    cap: 0x49304f,
    pillar: 0x392640,
    debris: [0x241a2a, 0x4f293c],
    flame: 0xe06c58,
    flameCore: 0xffd0b3,
    torchLight: [0xd95855, 1.3, 8.6],
    cloth: 0x5f1f3b,
    corridorArc: 0.36,
    pools: { mode: 0, colA: 0x180713, colB: 0x8f2949, glow: 0.72, amount: 0.05, pits: 1 },
    particles: { kind: 1, color: 0xc17d9c, n: 180 },
    nameA: ["Glassbound", "Black", "Shattered", "Violet", "Riven", "Jagged", "Burned"],
    nameB: ["Vaults", "Crags", "Halls", "Fracture", "Depths", "Fane", "Scar"],
  },
  sunken: {
    label: "SUNKEN",
    accent: "#62bdb1",
    bg: 0x030a0b,
    fog: 0x06191a,
    fogD: 0.0029,
    hemi: [0x315f60, 0x041010, 0.52],
    dir: [0x98ceca, 0.52],
    floor: 0x456563,
    corridor: 0x365352,
    wall: 0x2f4544,
    cap: 0x527270,
    pillar: 0x405f5d,
    debris: [0x294443, 0x3a625b],
    flame: 0x6fc7ba,
    flameCore: 0xd9fff6,
    torchLight: [0x54b8ae, 1.2, 9.2],
    cloth: 0x1f4d4b,
    corridorArc: 0.42,
    pools: { mode: 2, colA: 0x092e32, colB: 0x287b78, glow: 0.38, amount: 0.11, pits: 2 },
    lakes: true,
    particles: { kind: 2, color: 0x8bc4b5, n: 210 },
    nameA: ["Sunken", "Drowned", "Tidal", "Flooded", "Brined", "Submerged", "Lost"],
    nameB: ["Temple", "Cisterns", "Vaults", "Causeway", "Archive", "Halls", "Reliquary"],
  },
  fungal: {
    label: "FUNGAL",
    accent: "#74d6bf",
    bg: 0x08050c,
    fog: 0x160c1c,
    fogD: 0.003,
    hemi: [0x5f3f70, 0x0f0714, 0.48],
    dir: [0xc9afd8, 0.45],
    floor: 0x55425d,
    corridor: 0x493650,
    wall: 0x3b2d43,
    cap: 0x684e72,
    pillar: 0x503b59,
    debris: [0x372a3d, 0x45665c],
    flame: 0x68d8bd,
    flameCore: 0xdffff8,
    torchLight: [0x4ccab1, 1.25, 8.8],
    cloth: 0x492551,
    corridorArc: 0.56,
    pools: { mode: 3, colA: 0x150b19, colB: 0x3e766f, glow: 0.58, amount: 0.06, pits: 1 },
    roots: true,
    particles: { kind: 4, color: 0x78d6c0, n: 250 },
    nameA: ["Sporebound", "Blooming", "Pale", "Mycelial", "Bruised", "Breathing", "Soft"],
    nameB: ["Warrens", "Colony", "Grotto", "Hollows", "Nursery", "Chambers", "Veins"],
  },
  backrooms: {
    label: "BACKROOMS",
    fluorescent: true,
    accent: "#d7cb7d",
    bg: 0x0d0c07,
    fog: 0x1a180b,
    fogD: 0.0024,
    hemi: [0x77704d, 0x121006, 0.56],
    dir: [0xe2dcad, 0.5],
    floor: 0x796b45,
    corridor: 0x695d3c,
    wall: 0x95894f,
    cap: 0xa59b68,
    pillar: 0x887c4b,
    debris: [0x514a2c, 0x6e6239],
    flame: 0xe5dda7,
    flameCore: 0xffffd5,
    torchLight: [0xe1d99b, 1.15, 9.4],
    cloth: 0x6b633b,
    corridorArc: 0.04,
    pools: null,
    particles: { kind: 0, color: 0xcfc58a, n: 105 },
    nameA: ["Endless", "Vacant", "Yellow", "Flickering", "Stagnant", "Lost", "Silent"],
    nameB: ["Offices", "Halls", "Annex", "Floor", "Cubicles", "Rooms", "Threshold"],
  },
};
const THEME_KEYS = Object.keys(THEMES);
const REGULAR_THEME_KEYS = THEME_KEYS.filter((key) => key !== "backrooms");

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

/* ---------------- Delaunay (Bowyer–Watson) ---------------- */
function delaunay(pts) {
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

/* ---------------- generator ---------------- */
function generateDungeon(params) {
  const t0 = performance.now();
  let attempt = 0,
    seed = params.seed >>> 0,
    d = null;
  while (attempt < 5) {
    d = tryGenerate(seed, params);
    if (d.valid) break;
    seed = (Math.imul(seed, 9301) + 49297) >>> 0;
    attempt++;
  }
  d.stats.genMs = performance.now() - t0;
  d.stats.attempts = attempt + 1;
  return d;
}

function tryGenerate(seed, params) {
  const rng = makeRng(seed);
  const N = params.roomCount;
  const TH = THEMES[params.themeKey];

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
  const carveManhattan = (from, to, w) => {
    if (from.x !== to.x) hLine(from.x, to.x, from.y, w);
    if (from.y !== to.y) vLine(from.y, to.y, to.x, w);
  };
  const roundedCorridor = (A, B, w, horizontalFirst) => {
    const dx = B.cx - A.cx,
      dy = B.cy - A.cy;
    if (!dx || !dy) {
      carveManhattan({ x: A.cx, y: A.cy }, { x: B.cx, y: B.cy }, w);
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
    carveManhattan({ x: A.cx, y: A.cy }, entry, w);
    let previous = entry;
    for (let step = 1; step <= 8; step++) {
      const angle = startAngle + (sweep * step) / 8;
      const point = {
        x: Math.round(center.x + Math.cos(angle) * turnRadius),
        y: Math.round(center.y + Math.sin(angle) * turnRadius),
      };
      carveManhattan(previous, point, w);
      previous = point;
    }
    carveManhattan(previous, exit, w);
    carveManhattan(exit, { x: B.cx, y: B.cy }, w);
  };

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
    if (ovX >= w + 2 && dy > 0) {
      const x = Math.round(
        (Math.max(A.cx - A.w / 2, B.cx - B.w / 2) + Math.min(A.cx + A.w / 2, B.cx + B.w / 2)) / 2,
      );
      vLine(A.cy, B.cy, x, w);
    } else if (ovY >= w + 2 && dx > 0) {
      const y = Math.round(
        (Math.max(A.cy - A.h / 2, B.cy - B.h / 2) + Math.min(A.cy + A.h / 2, B.cy + B.h / 2)) / 2,
      );
      hLine(A.cx, B.cx, y, w);
    } else {
      const horizontalFirst = rng.chance(0.5);
      if (Math.min(dx, dy) >= 3 && rng.chance(TH.corridorArc ?? 0.34)) {
        roundedCorridor(A, B, w, horizontalFirst);
      } else if (horizontalFirst) {
        hLine(A.cx, B.cx, A.cy, w);
        vLine(A.cy, B.cy, B.cx, w);
      } else {
        vLine(A.cy, B.cy, A.cx, w);
        hLine(A.cx, B.cx, B.cy, w);
      }
    }
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
  const torches = [];
  for (const c of torchCand) {
    let ok = true;
    for (const t of torches)
      if (Math.max(Math.abs(t.x - c.x), Math.abs(t.y - c.y)) < 4) {
        ok = false;
        break;
      }
    if (ok) torches.push(c);
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

/* ================================================================
   RENDERER
   ================================================================ */
const canvasBg = 0x07080d;
let renderQuality = resolveForgeRenderQuality(innerWidth, devicePixelRatio);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(renderQuality.pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(canvasBg);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = renderQuality.directionalShadows;
renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoftShadowMap is deprecated in modern three (it silently falls back to this anyway)
renderer.info.autoReset = false;
document.body.appendChild(renderer.domElement);
const maxAniso = renderer.capabilities.getMaxAnisotropy();

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(canvasBg, 0.002);

const BASE_HALF = 55;
let aspect = innerWidth / innerHeight;
const cam = new THREE.OrthographicCamera(
  -BASE_HALF * aspect,
  BASE_HALF * aspect,
  BASE_HALF,
  -BASE_HALF,
  -400,
  800,
);
let yaw = Math.PI / 4,
  pitch = 0.64;
const camTarget = new THREE.Vector3(0, 0, 0);
function updateCam() {
  const cp = Math.cos(pitch),
    sp = Math.sin(pitch);
  const f = new THREE.Vector3(cp * Math.sin(yaw), sp, cp * Math.cos(yaw));
  cam.position.copy(camTarget).addScaledVector(f, 220);
  cam.lookAt(camTarget);
}
updateCam();

function fitCameraToDungeon(width, height) {
  camTarget.set(0, 0, 0);
  const fit = BASE_HALF / (Math.max(width, height) * 0.5);
  cam.zoom = Math.min(2.2, Math.max(0.22, fit));
  cam.updateProjectionMatrix();
  updateCam();
  if (innerWidth > 700) {
    const cameraRight = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).normalize();
    const panelHalfWidth = Math.min(170, innerWidth * 0.16);
    const worldPerPixel = (2 * BASE_HALF) / (cam.zoom * innerHeight);
    camTarget.addScaledVector(cameraRight, -panelHalfWidth * worldPerPixel);
    updateCam();
  }
}

/* Analytic-light gain. r128 shipped the legacy (pre-physical) lighting model;
   modern three is physically based and dropped `useLegacyLights`, so the same
   intensity values render far dimmer. The legacy→physical gap here is dominated
   by the point lights (candela reinterpretation ≈ 4π) on top of the diffuse
   BRDF's 1/π, so 4π restores the brightness the theme intensities were authored
   against. Measured against the r128 original: floors land at the same ~0.17
   linear instead of ~0.04. */
const LIGHT_K = 4 * Math.PI;

/* painted-miniature light rig: warm key with soft shadows, cool ambient */
const hemi = new THREE.HemisphereLight(0x2e3a52, 0x0a0b10, 0.55);
scene.add(hemi);
/* Static editor fill keeps the underside of walls and props readable. It is
   one shared light for the whole preview, never one light per cell. */
const editorFill = new THREE.AmbientLight(0x9bb6b6, 0);
scene.add(editorFill);
const dirL = new THREE.DirectionalLight(0xffe8c8, 0.85);
dirL.position.set(72, 78, 46);
dirL.castShadow = renderQuality.directionalShadows;
dirL.shadow.mapSize.set(2048, 2048);
dirL.shadow.bias = -0.0004;
dirL.shadow.normalBias = 0.55;
dirL.shadow.camera.near = 1;
dirL.shadow.camera.far = 320;
scene.add(dirL);

/* -------- shared temp objects -------- */
const _p = new THREE.Vector3(),
  _q = new THREE.Quaternion(),
  _s = new THREE.Vector3(),
  _m = new THREE.Matrix4(),
  _c = new THREE.Color(),
  _Y = new THREE.Vector3(0, 1, 0),
  _E = new THREE.Euler();
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

/* ================================================================
   POST PIPELINE — scene renders linear into an RT (MSAA on WebGL2),
   then: bright-pass -> separable blur (bloom) -> final composite with
   tilt-shift focus band, cool-shadow/warm-highlight grade, vignette,
   grain, and gamma. Toggleable for A/B and perf comparison.
   ================================================================ */
const POST = (() => {
  const tri = new THREE.BufferGeometry();
  tri.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
  );
  const qcam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mkScene = (mat) => {
    const s = new THREE.Scene();
    s.add(new THREE.Mesh(tri, mat));
    return s;
  };
  const V = `varying vec2 vUv; void main(){ vUv = position.xy*0.5+0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
  const thresh = new THREE.ShaderMaterial({
    uniforms: { tS: { value: null } },
    vertexShader: V,
    fragmentShader: `
    varying vec2 vUv; uniform sampler2D tS;
    void main(){
      vec3 c = texture2D(tS, vUv).rgb;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      gl_FragColor = vec4(c * smoothstep(0.58, 0.95, l), 1.0);
    }`,
    depthTest: false,
    depthWrite: false,
  });
  const blur = new THREE.ShaderMaterial({
    uniforms: {
      tS: { value: null },
      uDir: { value: new THREE.Vector2(1, 0) },
      uRes: { value: new THREE.Vector2(1, 1) },
    },
    vertexShader: V,
    fragmentShader: `
    varying vec2 vUv; uniform sampler2D tS; uniform vec2 uDir, uRes;
    void main(){
      vec2 px = uDir / uRes;
      vec3 c = texture2D(tS, vUv).rgb * 0.227;
      c += (texture2D(tS, vUv + px*1.384).rgb + texture2D(tS, vUv - px*1.384).rgb) * 0.316;
      c += (texture2D(tS, vUv + px*3.230).rgb + texture2D(tS, vUv - px*3.230).rgb) * 0.0703;
      gl_FragColor = vec4(c, 1.0);
    }`,
    depthTest: false,
    depthWrite: false,
  });
  const fin = new THREE.ShaderMaterial({
    uniforms: {
      tS: { value: null },
      tB: { value: null },
      uRes: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uBloom: { value: 0.9 },
      uTilt: { value: 1.0 },
      uExposure: { value: 1.8 },
    },
    vertexShader: V,
    fragmentShader: `
    varying vec2 vUv; uniform sampler2D tS, tB; uniform vec2 uRes; uniform float uTime, uBloom, uTilt, uExposure;
    void main(){
      vec2 px = 1.0 / uRes;
      vec3 col = texture2D(tS, vUv).rgb;
      /* Tilt-shift focus band. Sample the neighbour taps in uniform control flow
         (radius collapses to 0 where band==0) to avoid undefined implicit-
         derivative LOD inside a conditional. */
      float band = smoothstep(0.15, 0.52, abs(vUv.y - 0.5)) * uTilt;
      float r = band * 3.4;
      vec3 b = col * 0.4;
      b += texture2D(tS, vUv + vec2( px.x*r,  px.y*r*0.6)).rgb * 0.15;
      b += texture2D(tS, vUv + vec2(-px.x*r,  px.y*r*0.6)).rgb * 0.15;
      b += texture2D(tS, vUv + vec2( px.x*r, -px.y*r*0.6)).rgb * 0.15;
      b += texture2D(tS, vUv + vec2(-px.x*r, -px.y*r*0.6)).rgb * 0.15;
      col = mix(col, b, min(1.0, band));
      col += texture2D(tB, vUv).rgb * uBloom;
      /* The scene target is linear HDR. Apply a compact filmic exposure before
         the grade so dark biome albedos retain shape instead of falling below
         the final gamma curve; bright practicals still compress cleanly. */
      col = vec3(1.0) - exp(-col * uExposure);
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, col * vec3(0.90, 0.97, 1.12), (1.0 - smoothstep(0.0, 0.4, lum)) * 0.38);
      col = mix(col, col * vec3(1.07, 1.01, 0.93), smoothstep(0.45, 1.0, lum) * 0.28);
      col = mix(vec3(lum), col, 1.09);
      col = (col - 0.5) * 1.05 + 0.5;
      float vg = smoothstep(1.35, 0.5, length(vUv - 0.5) * 1.55);
      col *= mix(0.78, 1.02, vg);
      float gr = fract(sin(dot(gl_FragCoord.xy + mod(uTime,10.0)*37.0, vec2(12.9898,78.233))) * 43758.5453);
      col += (gr - 0.5) * 0.02;
      col = pow(max(col, 0.0), vec3(0.4545));
      gl_FragColor = vec4(col, 1.0);
    }`,
    depthTest: false,
    depthWrite: false,
  });
  return {
    qcam,
    sThresh: mkScene(thresh),
    sBlur: mkScene(blur),
    sFinal: mkScene(fin),
    thresh,
    blur,
    fin,
    rtScene: null,
    rtA: null,
    rtB: null,
    w: 0,
    h: 0,
    enabled: true,
  };
})();
function setupRTs() {
  const size = new THREE.Vector2();
  renderer.getDrawingBufferSize(size);
  if (POST.w === size.x && POST.h === size.y && POST.rtScene) return;
  POST.w = size.x;
  POST.h = size.y;
  if (POST.rtScene) {
    POST.rtScene.dispose();
    POST.rtA.dispose();
    POST.rtB.dispose();
  }
  const ps = {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    depthBuffer: true,
    stencilBuffer: false,
  };
  /* MSAA is requested via the `samples` option now (WebGLMultisampleRenderTarget
     was removed in r138). Modern three is WebGL2-only, so multisampling is
     always available. The scene renders here in raw linear (three applies neither
     tone-map nor colour conversion to a non-canvas target); the composite pass
     grades and gamma-encodes it — matching the r128 original exactly. */
  POST.rtScene = new THREE.WebGLRenderTarget(size.x, size.y, { ...ps, samples: 4 });
  const pb = {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    depthBuffer: false,
    stencilBuffer: false,
  };
  POST.rtA = new THREE.WebGLRenderTarget(size.x >> 2, size.y >> 2, pb);
  POST.rtB = new THREE.WebGLRenderTarget(size.x >> 2, size.y >> 2, pb);
}
let curBg = new THREE.Color(canvasBg);
const _cBg = new THREE.Color();
function renderFrame() {
  if (!POST.enabled) {
    /* straight-to-canvas debug path: let three apply sRGB + its ACES tone map */
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(curBg);
    renderer.setRenderTarget(null);
    renderer.render(scene, cam);
    return;
  }
  setupRTs();
  /* clear color bypasses material shaders, so linearize it here — the final
     composite pass applies gamma and lands it back on the authored value */
  renderer.setClearColor(_cBg.copy(curBg).convertSRGBToLinear());
  /* rtScene stores raw linear HDR (three skips tone-map + colour conversion when
     the target isn't the canvas); the post shaders tone-map and gamma-encode it. */
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setRenderTarget(POST.rtScene);
  renderer.render(scene, cam);
  POST.thresh.uniforms.tS.value = POST.rtScene.texture;
  renderer.setRenderTarget(POST.rtA);
  renderer.render(POST.sThresh, POST.qcam);
  POST.blur.uniforms.uRes.value.set(POST.w >> 2, POST.h >> 2);
  POST.blur.uniforms.tS.value = POST.rtA.texture;
  POST.blur.uniforms.uDir.value.set(1, 0);
  renderer.setRenderTarget(POST.rtB);
  renderer.render(POST.sBlur, POST.qcam);
  POST.blur.uniforms.tS.value = POST.rtB.texture;
  POST.blur.uniforms.uDir.value.set(0, 1);
  renderer.setRenderTarget(POST.rtA);
  renderer.render(POST.sBlur, POST.qcam);
  POST.fin.uniforms.tS.value = POST.rtScene.texture;
  POST.fin.uniforms.tB.value = POST.rtA.texture;
  POST.fin.uniforms.uRes.value.set(POST.w, POST.h);
  POST.fin.uniforms.uTime.value = elapsed;
  renderer.setRenderTarget(null);
  renderer.render(POST.sFinal, POST.qcam);
}

/* ================================================================
   PROCEDURAL TEXTURES — canvas-generated, shared, tiny
   ================================================================ */
function makeCanvas(sz) {
  const c = document.createElement("canvas");
  c.width = c.height = sz;
  return [c, c.getContext("2d")];
}
const texRand = mulberry32(0xc0ffee);
function makeCrackTex() {
  const [cv, g] = makeCanvas(128);
  g.lineCap = "round";
  const branch = (x, y, a, w, d) => {
    if (d <= 0 || w < 0.4) return;
    const len = 9 + texRand() * 15,
      nx = x + Math.cos(a) * len,
      ny = y + Math.sin(a) * len;
    g.strokeStyle = "rgba(255,255,255," + (0.45 + 0.5 * Math.min(1, w / 3)).toFixed(2) + ")";
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(nx, ny);
    g.stroke();
    branch(nx, ny, a + (texRand() - 0.5) * 1.0, w * 0.76, d - 1);
    if (texRand() < 0.55) branch(nx, ny, a + (texRand() - 0.5) * 2.2, w * 0.55, d - 2);
  };
  for (let i = 0; i < 3; i++) branch(64, 64, texRand() * 6.28, 3, 6);
  return new THREE.CanvasTexture(cv);
}
function makeRuneTex() {
  const [cv, g] = makeCanvas(256);
  g.translate(128, 128);
  g.lineCap = "round";
  g.strokeStyle = "rgba(255,255,255,0.85)";
  g.lineWidth = 3;
  g.beginPath();
  g.arc(0, 0, 104, 0, 6.2832);
  g.stroke();
  g.lineWidth = 1.6;
  g.beginPath();
  g.arc(0, 0, 76, 0, 6.2832);
  g.stroke();
  for (let i = 0; i < 20; i++) {
    g.save();
    g.rotate((i / 20) * 6.2832);
    g.translate(90, 0);
    g.rotate(1.5708);
    g.lineWidth = 2.6;
    g.beginPath();
    let x = -4 + texRand() * 8,
      y = -7;
    g.moveTo(x, y);
    for (let s = 0; s < 3; s++) {
      x += (texRand() - 0.5) * 12;
      y += 4 + texRand() * 4;
      g.lineTo(x, y);
    }
    g.stroke();
    g.restore();
  }
  return new THREE.CanvasTexture(cv);
}
function makeSwirlTex() {
  const [cv, g] = makeCanvas(256);
  g.translate(128, 128);
  g.lineCap = "round";
  for (let arm = 0; arm < 3; arm++)
    for (let i = 0; i < 44; i++) {
      const t0 = i / 44,
        a = arm * 2.094 + t0 * 4.4,
        r = 6 + t0 * 112;
      g.strokeStyle = "rgba(255,255,255," + (0.55 * (1 - t0)).toFixed(3) + ")";
      g.lineWidth = 7 * (1 - t0) + 1.5;
      g.beginPath();
      g.arc(0, 0, r, a, a + 0.32);
      g.stroke();
    }
  const grd = g.createRadialGradient(0, 0, 0, 0, 0, 36);
  grd.addColorStop(0, "rgba(255,255,255,0.9)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.beginPath();
  g.arc(0, 0, 36, 0, 6.2832);
  g.fill();
  return new THREE.CanvasTexture(cv);
}
function makeShaftTex() {
  const [cv, g] = makeCanvas(64);
  const grd = g.createLinearGradient(0, 0, 0, 64);
  grd.addColorStop(0, "rgba(255,255,255,0.7)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}
function makeGlowTex() {
  const [cv, g] = makeCanvas(128);
  const grd = g.createRadialGradient(64, 64, 3, 64, 64, 62);
  grd.addColorStop(0, "rgba(255,255,255,0.85)");
  grd.addColorStop(0.35, "rgba(255,255,255,0.28)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.beginPath();
  g.arc(64, 64, 62, 0, 6.2832);
  g.fill();
  return new THREE.CanvasTexture(cv);
}
function makeClothTex() {
  const [cv, g] = makeCanvas(64);
  g.fillStyle = "#351a20";
  g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 64; i += 2) {
    g.fillStyle = i % 4 === 0 ? "rgba(196, 125, 106, 0.12)" : "rgba(8, 5, 7, 0.2)";
    g.fillRect(i, 0, 1, 64);
    g.fillStyle = i % 6 === 0 ? "rgba(220, 168, 139, 0.08)" : "rgba(9, 6, 8, 0.14)";
    g.fillRect(0, i, 64, 1);
  }
  for (let i = 0; i < 90; i += 1) {
    const shade = 38 + Math.floor(texRand() * 34);
    g.fillStyle = `rgba(${shade + 42}, ${shade}, ${shade + 7}, 0.22)`;
    g.fillRect(Math.floor(texRand() * 64), Math.floor(texRand() * 64), 1, 1);
  }
  const texture = new THREE.CanvasTexture(cv);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 3);
  texture.magFilter = THREE.NearestFilter;
  return texture;
}
function makeMossTex() {
  const [cv, g] = makeCanvas(64);
  g.fillStyle = "#17241a";
  g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 180; i += 1) {
    const x = Math.floor(texRand() * 64);
    const y = Math.floor(texRand() * 64);
    const size = 1 + Math.floor(texRand() * 4);
    const light = 34 + Math.floor(texRand() * 46);
    g.fillStyle = `rgba(${Math.floor(light * 0.55)}, ${light}, ${Math.floor(light * 0.45)}, 0.48)`;
    g.fillRect(x, y, size, Math.max(1, size - 1));
  }
  const texture = new THREE.CanvasTexture(cv);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.5, 2.5);
  texture.magFilter = THREE.NearestFilter;
  return texture;
}
function loadDungeonSurfaceTex(url) {
  const t = new THREE.TextureLoader().load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = Math.min(4, maxAniso);
  return t;
}
function loadDungeonRoleTex(url, options = {}) {
  const { color = true, repeatX = 1, repeatY = repeatX, nearest = false } = options;
  const texture = new THREE.TextureLoader().load(url);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.magFilter = nearest ? THREE.NearestFilter : THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = Math.min(4, maxAniso);
  return texture;
}
const BIOME_KEYS = [
  "ancient",
  "molten",
  "frost",
  "grim",
  "verdant",
  "ash",
  "iron",
  "obsidian",
  "sunken",
  "fungal",
  "backrooms",
];
const BIOME_TEX = Object.fromEntries(
  BIOME_KEYS.map((id) => [
    id,
    {
      floor: loadDungeonSurfaceTex(`/assets/textures/biomes/${id}/floor.png`),
      wall: loadDungeonSurfaceTex(`/assets/textures/biomes/${id}/wall.png`),
      ceiling: loadDungeonSurfaceTex(`/assets/textures/biomes/${id}/ceiling.png`),
    },
  ]),
);
/* Real play-surface maps for the editor preview so Creation matches play. */
const TEX = {
  stone: BIOME_TEX.ash.wall,
  floor: BIOME_TEX.ash.floor,
  crack: makeCrackTex(),
  rune: makeRuneTex(),
  swirl: makeSwirlTex(),
  shaft: makeShaftTex(),
  glow: makeGlowTex(),
  cloth: makeClothTex(),
  moss: makeMossTex(),
  trim: loadDungeonRoleTex(
    "/assets/concepts/dungeon-clutter-kit-v1-pbr/black-iron/black-iron_albedo.png",
    { repeatX: 1.5 },
  ),
  trimNormal: loadDungeonRoleTex(
    "/assets/concepts/dungeon-clutter-kit-v1-pbr/black-iron/black-iron_normal.png",
    { color: false, repeatX: 1.5 },
  ),
  trimRoughness: loadDungeonRoleTex(
    "/assets/concepts/dungeon-clutter-kit-v1-pbr/black-iron/black-iron_roughness.png",
    { color: false, repeatX: 1.5 },
  ),
  ice: loadDungeonRoleTex("/assets/textures/generated/iron-ash-prop-ice-v1.png", {
    repeatX: 1.4,
    nearest: true,
  }),
  bark: loadDungeonRoleTex(
    "/assets/concepts/dungeon-clutter-kit-v1-pbr/aged-oak/aged-oak_albedo.png",
    { repeatX: 2, repeatY: 3 },
  ),
  barkNormal: loadDungeonRoleTex(
    "/assets/concepts/dungeon-clutter-kit-v1-pbr/aged-oak/aged-oak_normal.png",
    { color: false, repeatX: 2, repeatY: 3 },
  ),
};

/* ================================================================
   MATERIAL KIT — named roles, shared across all instanced sets
   ================================================================ */
const matStone = new THREE.MeshStandardMaterial({
  map: TEX.stone,
  roughness: 0.92,
  metalness: 0.02,
});
const matFloor = new THREE.MeshStandardMaterial({
  map: TEX.floor,
  roughness: 0.94,
  metalness: 0.02,
});
function installEditorAlbedoLift(material) {
  const lift = {
    gain: { value: 1.08 },
    gamma: { value: 0.92 },
  };
  material.userData.editorAlbedoLift = lift;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.editorAlbedoGain = lift.gain;
    shader.uniforms.editorAlbedoGamma = lift.gamma;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float editorAlbedoGain;\nuniform float editorAlbedoGamma;",
      )
      .replace(
        "#include <map_fragment>",
        "#include <map_fragment>\ndiffuseColor.rgb = pow(max(diffuseColor.rgb, vec3(0.0)), vec3(editorAlbedoGamma)) * editorAlbedoGain;",
      );
  };
  material.customProgramCacheKey = () => "editor-albedo-lift-v1";
}
installEditorAlbedoLift(matFloor);
installEditorAlbedoLift(matStone);
function applyForgeBiomeMaterials(themeKey) {
  const key = BIOME_TEX[themeKey] ? themeKey : "ash";
  const maps = BIOME_TEX[key];
  const profile = resolveEditorLightingProfile(key);
  matFloor.map = maps.floor;
  matFloor.color.setScalar(1.08);
  matFloor.roughness = profile.floorRoughness;
  matFloor.needsUpdate = true;
  matStone.map = maps.wall;
  matStone.color.setScalar(1.04);
  matStone.roughness = profile.wallRoughness;
  matStone.needsUpdate = true;
  const gamma = Math.max(0.74, Math.min(0.98, 1 - (profile.surfaceGain - 1) * 0.09));
  const gain = 0.98 + profile.surfaceGain * 0.13;
  matFloor.userData.editorAlbedoLift.gain.value = gain;
  matFloor.userData.editorAlbedoLift.gamma.value = gamma;
  matStone.userData.editorAlbedoLift.gain.value = gain * 0.98;
  matStone.userData.editorAlbedoLift.gamma.value = gamma;
  matTrim.roughness = profile.trimRoughness;
  matTrim.metalness = profile.trimMetalness;
  matTrim.needsUpdate = true;
}
const matTrim = new THREE.MeshStandardMaterial({
  name: "forge-black-iron",
  map: TEX.trim,
  normalMap: TEX.trimNormal,
  normalScale: new THREE.Vector2(0.46, 0.46),
  roughnessMap: TEX.trimRoughness,
  roughness: 0.72,
  metalness: 0.68,
});
const matGlow = new THREE.MeshBasicMaterial({ color: 0xffffff });
matGlow.toneMapped = false;
const matCloth = new THREE.MeshStandardMaterial({
  name: "forge-worn-cloth",
  map: TEX.cloth,
  side: THREE.DoubleSide,
  roughness: 0.96,
  metalness: 0,
});
const matIce = new THREE.MeshStandardMaterial({
  name: "forge-frosted-ice",
  map: TEX.ice,
  roughness: 0.3,
  metalness: 0.02,
  transparent: true,
  opacity: 0.82,
});
const matMoss = new THREE.MeshStandardMaterial({
  name: "forge-damp-moss",
  map: TEX.moss,
  roughness: 1,
  metalness: 0,
  side: THREE.DoubleSide,
});
const matBark = new THREE.MeshStandardMaterial({
  name: "forge-aged-roots",
  map: TEX.bark,
  normalMap: TEX.barkNormal,
  normalScale: new THREE.Vector2(0.34, 0.34),
  roughness: 0.95,
  metalness: 0,
});
const matCrackD = new THREE.MeshBasicMaterial({
  map: TEX.crack,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
matCrackD.toneMapped = false;
const matRune = new THREE.MeshBasicMaterial({
  map: TEX.rune,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
});
matRune.toneMapped = false;
const matPortal = new THREE.MeshBasicMaterial({
  map: TEX.swirl,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
matPortal.toneMapped = false;
const matShaft = new THREE.MeshBasicMaterial({
  map: TEX.shaft,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
  opacity: 0.13,
});
matShaft.toneMapped = false;
const matSkirt = new THREE.MeshBasicMaterial({
  map: TEX.glow,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  opacity: 0.5,
});
matSkirt.toneMapped = false;

/* liquid surface shader: lava / ice / water / miasma via uMode */
const liquidMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: {
    uTime: { value: 0 },
    uMode: { value: 0 },
    uGlow: { value: 1 },
    uOp: { value: 1 },
    uColA: { value: new THREE.Color(0x000000) },
    uColB: { value: new THREE.Color(0xffffff) },
  },
  vertexShader: `
    attribute vec2 aE;
    attribute vec4 aM;
    varying vec2 vP, vE;
    varying vec4 vM;
    void main(){ vP = vec2(position.x, position.z); vE = aE; vM = aM;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    precision highp float;
    varying vec2 vP, vE;
    varying vec4 vM;
    uniform float uTime, uMode, uGlow, uOp;
    uniform vec3 uColA, uColB;
    float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
    float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
      float a=h21(i), b=h21(i+vec2(1,0)), c=h21(i+vec2(0,1)), d=h21(i+vec2(1,1));
      return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }
    float fbm(vec2 p){ float v=0.0, a=0.5;
      for(int i=0;i<4;i++){ v+=a*vnoise(p); p=p*2.03+11.7; a*=0.5; } return v; }
    void main(){
      vec3 col;
      if(uMode < 0.5){
        float n = fbm(vP*0.55 + vec2(uTime*0.045, uTime*0.021));
        float crust = smoothstep(0.40, 0.62, n);
        float veins = smoothstep(0.06, 0.0, abs(n-0.5));
        col = mix(uColB*1.6, uColA, crust);
        col += vec3(1.0,0.72,0.32) * veins * 0.9;
        col += uColB * 0.22 * (0.5 + 0.5*sin(uTime*1.7 + n*22.0));
      } else if(uMode < 1.5){
        float n = fbm(vP*0.8);
        float cr = smoothstep(0.47, 0.5, abs(fract(n*6.0)-0.5));
        col = mix(uColA, uColB, n);
        col += vec3(1.0) * cr * 0.16;
        float tw = step(0.994, h21(floor(vP*3.0) + floor(uTime*2.0)));
        col += vec3(0.8,0.95,1.0) * tw * 0.45;
      } else if(uMode < 2.5){
        float n = fbm(vP*0.7 + vec2(uTime*0.05, -uTime*0.035));
        float n2 = fbm(vP*1.3 - vec2(uTime*0.04, uTime*0.05));
        float caust = pow(1.0 - abs(n - n2), 6.0);
        col = mix(uColA, uColB, n*0.85) + vec3(0.5,0.9,0.8)*caust*0.35;
      } else {
        vec2 w = vP + 1.5*vec2(fbm(vP*0.35 + uTime*0.02), fbm(vP*0.35 - uTime*0.016));
        float n = fbm(w*0.5);
        col = mix(uColA, uColB, smoothstep(0.25, 0.75, n));
        col += uColB * 0.3 * smoothstep(0.6, 0.9, n);
      }
      /* soften true borders only: cooled crust for lava, depth falloff for
         water/ice, alpha fade for miasma */
      float e = 0.0;
      e = max(e, vM.x * smoothstep(0.26, 0.5, -vE.x));
      e = max(e, vM.y * smoothstep(0.26, 0.5,  vE.x));
      e = max(e, vM.z * smoothstep(0.26, 0.5, -vE.y));
      e = max(e, vM.w * smoothstep(0.26, 0.5,  vE.y));
      float aOut = uOp;
      if(uMode < 0.5)      col = mix(col, vec3(0.10,0.03,0.01), e*0.85);
      else if(uMode < 1.5) col *= (1.0 - 0.25*e);
      else if(uMode < 2.5) col *= (1.0 - 0.4*e);
      else                 aOut *= (1.0 - 0.55*e);
      gl_FragColor = vec4(col * (0.5 + uGlow), aOut);
    }`,
});

/* One shared GPU field. Profiles supply a distinct motion and silhouette per biome. */
const partMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms: {
    uTime: { value: 0 },
    uRamp: { value: 1 },
    uZoom: { value: 2 },
    uMotion: { value: 0 },
    uShape: { value: 0 },
    uColor: { value: new THREE.Color(0xffffff) },
    uColorAlt: { value: new THREE.Color(0xffffff) },
    uOpacity: { value: 0.7 },
    uSpeed: { value: 0.25 },
    uTurbulence: { value: 0.4 },
    uFlow: { value: new THREE.Vector3() },
  },
  vertexShader: `
    attribute float aSeed;
    attribute float aSize;
    attribute float aTint;
    uniform float uTime, uRamp, uZoom, uMotion, uOpacity, uSpeed, uTurbulence;
    uniform vec3 uFlow;
    varying float vA, vTint, vPhase;
    float h(float n){ return fract(sin(n*127.1)*43758.5453); }
    void main(){
      vec3 p = position;
      float s = aSeed, phase = s*6.2831853;
      float t = fract(s + uTime*max(uSpeed, 0.01)*0.16);
      float wave = sin(uTime*(0.55+uSpeed)+phase);
      float alphaPulse = 0.72 + 0.28*sin(uTime*(0.8+uSpeed)+phase*1.7);
      float sizePulse = 1.0;
      if(uMotion < 0.5){
        p += uFlow*sin(uTime*.18+phase)*2.4;
        p.x += sin(uTime*.42+phase)*uTurbulence*.42;
        p.z += cos(uTime*.36+phase*1.3)*uTurbulence*.36;
        p.y += wave*uTurbulence*.24;
      } else if(uMotion < 1.5){
        p.y += t*(1.4 + abs(uFlow.y)*2.0);
        p.x += sin(uTime*.8+phase)*uTurbulence*.38;
        p.z += cos(uTime*.64+phase)*uTurbulence*.3;
      } else if(uMotion < 2.5){
        p.y += (1.-t)*3.15;
        p.x += sin(uTime*.5+phase)*uTurbulence*.6;
        p.z += cos(uTime*.44+phase*1.2)*uTurbulence*.48;
      } else if(uMotion < 3.5){
        float r=.18+h(s+3.7)*(.38+uTurbulence*.45);
        p.x += cos(uTime*uSpeed+phase)*r;
        p.z += sin(uTime*uSpeed*.83+phase)*r;
        p.y += .3+sin(uTime*.7+phase*1.4)*.22;
      } else if(uMotion < 4.5){
        p.y += (1.-t*.58)*2.4;
        p.x += sin(uTime*1.1+phase)*uTurbulence*.72;
        p.z += cos(uTime*.76+phase*1.5)*uTurbulence*.52;
        sizePulse=.8+abs(wave)*.36;
      } else if(uMotion < 5.5){
        float burst=fract(t*2.+h(s+4.));
        vec3 dir=normalize(uFlow+vec3(sin(phase),.22,cos(phase))*.28);
        p += dir*burst*(.8+uTurbulence*1.7);
        p.y += sin(burst*3.1415926)*.24;
        alphaPulse=.7+.3*sin(burst*6.2831853+phase);
      } else if(uMotion < 6.5){
        p.x += sin(uTime*.4+phase)*uTurbulence*.42;
        p.z += cos(uTime*.37+phase)*uTurbulence*.38;
        p.y += .28+sin(uTime*.5+phase*1.2)*.24;
        alphaPulse=.38+.62*pow(.5+.5*wave,2.);
        sizePulse=.78+.42*(.5+.5*wave);
      } else {
        float gate=step(.48,h(floor(uTime*(3.+uSpeed*5.))+s*31.));
        p.x += floor(sin(uTime*.34+phase)*2.)*uTurbulence*.12;
        alphaPulse=mix(.56,1.,gate);
      }
      vA = uOpacity*max(.56,alphaPulse)*uRamp;
      vTint = aTint;
      vPhase = phase;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      gl_PointSize = clamp(aSize*sizePulse*uZoom, 1.0, 10.0);
    }`,
  fragmentShader: `
    precision mediump float;
    uniform vec3 uColor, uColorAlt;
    uniform float uShape;
    varying float vA, vTint, vPhase;
    void main(){
      vec2 uv=gl_PointCoord-.5;
      float cs=cos(vPhase), sn=sin(vPhase);
      uv=mat2(cs,-sn,sn,cs)*uv;
      float d=length(uv), mask=0.;
      if(uShape<.5) mask=smoothstep(.5,.08,d);
      else if(uShape<1.5) mask=smoothstep(.48,.08,length(vec2(uv.x*3.4,uv.y)));
      else if(uShape<2.5){ float arms=min(abs(uv.x),abs(uv.y)); float diag=min(abs(uv.x+uv.y),abs(uv.x-uv.y))*.72; float crystal=1.-smoothstep(.035,.075,min(arms,diag)); mask=crystal*smoothstep(.37,.14,d); }
      else if(uShape<3.5){ float edge=.36+sin(atan(uv.y,uv.x)*5.+vPhase)*.08; mask=smoothstep(edge+.08,edge-.08,d); }
      else if(uShape<4.5) mask=smoothstep(.5,.05,length(vec2(uv.x*.72,uv.y*2.6)));
      else if(uShape<5.5){ float core=smoothstep(.23,.04,d); float rim=smoothstep(.42,.35,d)*(1.-smoothstep(.31,.37,d)); mask=max(core,rim*.52); }
      else if(uShape<6.5) mask=1.-smoothstep(.32,.48,abs(uv.x)*.72+abs(uv.y)*1.28);
      else if(uShape<7.5){ float ring=1.-smoothstep(.035,.09,abs(d-.32)); float glint=smoothstep(.12,.01,length(uv-vec2(-.13,.13))); mask=max(ring*.8,glint); }
      else mask=1.-smoothstep(.32,.48,max(abs(uv.x),abs(uv.y)));
      float a=mask*vA;
      if(a<.025) discard;
      gl_FragColor=vec4(mix(uColor,uColorAlt,vTint),a);
    }`,
});
partMat.toneMapped = false;

/* ================================================================
   PROCEDURAL GEOMETRY KIT — authored, merged, shared, instanced
   ================================================================ */
function bgFromTris(v) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(v), 3));
  const p = g.attributes.position,
    uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = (p.getX(i) + p.getZ(i)) * 0.53 + 0.5;
    uv[i * 2 + 1] = p.getY(i) * 0.61 + (p.getX(i) - p.getZ(i)) * 0.21;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
function chamferBox(w, h, d, ch) {
  const hw = w / 2,
    hd = d / 2,
    iw = Math.max(0.01, hw - ch),
    id = Math.max(0.01, hd - ch),
    hb = Math.max(0.01, h - ch);
  const v = [];
  const q = (a, b, c, e) => {
    v.push(
      a[0],
      a[1],
      a[2],
      b[0],
      b[1],
      b[2],
      c[0],
      c[1],
      c[2],
      a[0],
      a[1],
      a[2],
      c[0],
      c[1],
      c[2],
      e[0],
      e[1],
      e[2],
    );
  };
  const b0 = [-hw, 0, -hd],
    b1 = [hw, 0, -hd],
    b2 = [hw, 0, hd],
    b3 = [-hw, 0, hd];
  const m0 = [-hw, hb, -hd],
    m1 = [hw, hb, -hd],
    m2 = [hw, hb, hd],
    m3 = [-hw, hb, hd];
  const t0 = [-iw, h, -id],
    t1 = [iw, h, -id],
    t2 = [iw, h, id],
    t3 = [-iw, h, id];
  q(b1, b0, m0, m1);
  q(b3, b2, m2, m3);
  q(b2, b1, m1, m2);
  q(b0, b3, m3, m0);
  q(m1, m0, t0, t1);
  q(m3, m2, t2, t3);
  q(m2, m1, t1, t2);
  q(m0, m3, t3, t0);
  q(t3, t2, t1, t0);
  q(b0, b1, b2, b3);
  return bgFromTris(v);
}
function spireGeo(rBase, h, twist) {
  const rings = [
    { r: rBase, y: 0, a: 0 },
    { r: rBase * 0.8, y: h * 0.45, a: twist * 0.5 },
    { r: rBase * 0.48, y: h * 0.78, a: twist },
  ];
  const pt = (r, y, a, k) => {
    const ang = a + (k * Math.PI) / 2 + Math.PI / 4;
    return [Math.cos(ang) * r, y, Math.sin(ang) * r];
  };
  const v = [];
  for (let i = 0; i < rings.length - 1; i++) {
    const A = rings[i],
      B = rings[i + 1];
    for (let k = 0; k < 4; k++) {
      const a0 = pt(A.r, A.y, A.a, k),
        a1 = pt(A.r, A.y, A.a, k + 1),
        b0 = pt(B.r, B.y, B.a, k),
        b1 = pt(B.r, B.y, B.a, k + 1);
      v.push(...a1, ...a0, ...b0, ...a1, ...b0, ...b1);
    }
  }
  const T = rings[rings.length - 1];
  for (let k = 0; k < 4; k++) {
    const a0 = pt(T.r, T.y, T.a, k),
      a1 = pt(T.r, T.y, T.a, k + 1);
    v.push(...a1, ...a0, 0, h, 0);
  }
  for (let k = 0; k < 4; k++) {
    const a0 = pt(rings[0].r, 0, 0, k),
      a1 = pt(rings[0].r, 0, 0, k + 1);
    v.push(...a0, ...a1, 0, 0, 0);
  }
  return bgFromTris(v);
}
function xg(g, x, y, z, rx, ry, rz, sx, sy, sz) {
  const c = g.index ? g.toNonIndexed() : g.clone();
  _m.compose(
    _p.set(x, y, z),
    _q.setFromEuler(_E.set(rx, ry, rz)),
    _s.set(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz),
  );
  c.applyMatrix4(_m);
  return c;
}
function mergeGeos(list) {
  let vc = 0;
  for (const g of list) vc += g.attributes.position.count;
  const pos = new Float32Array(vc * 3),
    nor = new Float32Array(vc * 3),
    uv = new Float32Array(vc * 2);
  let o = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return out;
}
const tube = (a, b, c) =>
  new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, b, c), 7, 0.055, 6, false);

const GEO = {};
GEO.floor = chamferBox(0.96, 0.22, 0.96, 0.05).translate(0, -0.22, 0);
GEO.wall = chamferBox(1, 1, 1, 0.07);
GEO.wallCap = chamferBox(1.09, 0.13, 1.09, 0.035);
GEO.basin = new THREE.BoxGeometry(1, 0.55, 1).translate(0, -0.43, 0);
GEO.pillar = mergeGeos([
  xg(chamferBox(0.68, 0.15, 0.68, 0.035), 0, 0, 0, 0, 0, 0, 1),
  xg(new THREE.CylinderGeometry(0.19, 0.25, 1.5, 10), 0, 0.89, 0, 0, 0, 0, 1),
  xg(new THREE.CylinderGeometry(0.27, 0.27, 0.07, 10), 0, 1.68, 0, 0, 0, 0, 1),
  xg(chamferBox(0.55, 0.14, 0.55, 0.03), 0, 1.72, 0, 0, 0, 0, 1),
]);
GEO.archPost = chamferBox(0.24, 1.74, 0.24, 0.045);
GEO.archLintel = mergeGeos([
  xg(new THREE.TorusGeometry(0.46, 0.11, 5, 14, Math.PI), 0, -0.15, 0, 0, 0, 0, 1),
  xg(new THREE.BoxGeometry(0.86, 0.14, 0.36), 0, -0.16, 0, 0, 0, 0, 1),
]);
GEO.torch = mergeGeos([
  xg(new THREE.BoxGeometry(0.07, 0.36, 0.07), 0, 0.16, 0.07, -0.42, 0, 0, 1),
  xg(new THREE.CylinderGeometry(0.11, 0.05, 0.16, 7), 0, 0.36, 0.15, 0, 0, 0, 1),
]);
GEO.flame = new THREE.ConeGeometry(0.13, 0.42, 7).translate(0, 0.21, 0);
GEO.flameCore = new THREE.ConeGeometry(0.065, 0.26, 7).translate(0, 0.13, 0);
GEO.panelFrame = chamferBox(0.96, 0.08, 0.34, 0.025);
GEO.panelGlow = new THREE.BoxGeometry(0.76, 0.09, 0.17);
GEO.debrisA = xg(new THREE.IcosahedronGeometry(0.15, 0), 0, 0.05, 0, 0, 0, 0, 1);
GEO.debrisB = mergeGeos([
  xg(new THREE.IcosahedronGeometry(0.13, 0), 0, 0.05, 0, 0.3, 0.5, 0, 1),
  xg(new THREE.IcosahedronGeometry(0.09, 0), 0.17, 0.04, 0.05, 0, 1.1, 0.4, 1),
  xg(new THREE.IcosahedronGeometry(0.07, 0), -0.12, 0.03, 0.13, 0.7, 0, 0, 1),
]);
GEO.debrisC = xg(chamferBox(0.34, 0.07, 0.28, 0.02), 0, 0, 0, 0, 0.4, 0.06, 1);
GEO.chestBody = mergeGeos([
  xg(chamferBox(0.8, 0.36, 0.52, 0.04), 0, 0, 0, 0, 0, 0, 1),
  xg(
    new THREE.CylinderGeometry(0.25, 0.25, 0.78, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2),
    0,
    0.36,
    0,
    0,
    0,
    0,
    1,
  ),
  xg(new THREE.CircleGeometry(0.25, 8, 0, Math.PI), 0.39, 0.36, 0, 0, Math.PI / 2, 0, 1),
  xg(new THREE.CircleGeometry(0.25, 8, 0, Math.PI), -0.39, 0.36, 0, 0, -Math.PI / 2, 0, 1),
]);
GEO.chestTrim = mergeGeos([
  xg(new THREE.BoxGeometry(0.07, 0.4, 0.55), -0.2, 0.2, 0, 0, 0, 0, 1),
  xg(new THREE.BoxGeometry(0.07, 0.4, 0.55), 0.2, 0.2, 0, 0, 0, 0, 1),
  xg(
    new THREE.TorusGeometry(0.26, 0.036, 6, 10, Math.PI).rotateY(Math.PI / 2),
    -0.2,
    0.36,
    0,
    0,
    0,
    0,
    1,
  ),
  xg(
    new THREE.TorusGeometry(0.26, 0.036, 6, 10, Math.PI).rotateY(Math.PI / 2),
    0.2,
    0.36,
    0,
    0,
    0,
    0,
    1,
  ),
  xg(new THREE.BoxGeometry(0.11, 0.16, 0.06), 0, 0.33, 0.26, 0, 0, 0, 1),
]);
GEO.chestSeam = new THREE.BoxGeometry(0.6, 0.045, 0.03).translate(0, 0.36, 0.25);
GEO.grave = mergeGeos([
  xg(new THREE.BoxGeometry(0.36, 0.5, 0.09), 0, 0.25, 0, 0, 0, 0, 1),
  xg(
    new THREE.CylinderGeometry(0.18, 0.18, 0.09, 10, 1, false, 0, Math.PI)
      .rotateX(Math.PI / 2)
      .rotateZ(Math.PI / 2),
    0,
    0.5,
    0,
    0,
    0,
    0,
    1,
  ),
]);
GEO.sarco = mergeGeos([
  xg(chamferBox(1.5, 0.44, 0.8, 0.06), 0, 0, 0, 0, 0, 0, 1),
  xg(chamferBox(1.38, 0.16, 0.68, 0.05), 0, 0.44, 0, 0, 0, 0, 1),
]);
/* Small floor campfire (replaces floor candles): ring + logs + coal bed. */
GEO.campfire = mergeGeos([
  xg(new THREE.CylinderGeometry(0.22, 0.26, 0.04, 8), 0, 0.02, 0, 0, 0, 0, 1),
  xg(new THREE.BoxGeometry(0.1, 0.08, 0.12), 0.2, 0.05, 0.05, 0, 0.4, 0, 1),
  xg(new THREE.BoxGeometry(0.1, 0.09, 0.11), -0.18, 0.05, 0.08, 0, -0.5, 0, 1),
  xg(new THREE.BoxGeometry(0.11, 0.07, 0.1), 0.04, 0.04, -0.2, 0, 0.2, 0, 1),
  xg(new THREE.BoxGeometry(0.1, 0.08, 0.1), -0.08, 0.05, -0.16, 0, 0.8, 0, 1),
  xg(
    new THREE.CylinderGeometry(0.04, 0.05, 0.34, 5).rotateZ(Math.PI / 2),
    0.02,
    0.1,
    0.02,
    0,
    0.4,
    0.2,
    1,
  ),
  xg(
    new THREE.CylinderGeometry(0.04, 0.05, 0.32, 5).rotateZ(Math.PI / 2),
    -0.02,
    0.09,
    0.02,
    0,
    -0.9,
    0.15,
    1,
  ),
  xg(new THREE.IcosahedronGeometry(0.05, 0), 0, 0.1, 0, 0, 0, 0, 1),
  xg(new THREE.IcosahedronGeometry(0.04, 0), 0.06, 0.09, -0.04, 0, 0, 0, 1),
]);
GEO.candle = GEO.campfire; /* legacy alias for older forge payloads */
GEO.icicle = mergeGeos([
  xg(new THREE.ConeGeometry(0.075, 0.5, 6).rotateX(Math.PI), 0, -0.25, 0, 0, 0, 0, 1),
  xg(new THREE.ConeGeometry(0.05, 0.34, 6).rotateX(Math.PI), 0.11, -0.17, 0.04, 0, 0, 0, 1),
  xg(new THREE.ConeGeometry(0.04, 0.26, 5).rotateX(Math.PI), -0.09, -0.13, -0.05, 0, 0, 0, 1),
]);
GEO.shard = spireGeo(0.17, 0.6, 0.6);
GEO.roots = mergeGeos([
  xg(tube(V3(0, 1.75, -0.1), V3(0.05, 1.1, 0.42), V3(0.5, 0.02, 0.75)), 0, 0, 0, 0, 0, 0, 1),
  xg(tube(V3(-0.1, 1.6, -0.1), V3(-0.3, 0.9, 0.4), V3(-0.55, 0.02, 0.9)), 0, 0, 0, 0, 0, 0, 1),
  xg(tube(V3(0.12, 1.45, -0.08), V3(0.15, 0.8, 0.3), V3(0.05, 0.02, 1.1)), 0, 0, 0, 0, 0, 0, 1),
  xg(tube(V3(-0.02, 1.2, -0.05), V3(-0.5, 0.7, 0.3), V3(-0.2, 0.02, 0.55)), 0, 0, 0, 0, 0, 0, 1),
]);
GEO.moss = new THREE.CircleGeometry(0.42, 9).rotateX(-Math.PI / 2).translate(0, 0.013, 0);
GEO.crack = new THREE.PlaneGeometry(1.2, 1.2).rotateX(-Math.PI / 2).translate(0, 0.016, 0);
GEO.skirt = new THREE.PlaneGeometry(2.7, 2.7).rotateX(-Math.PI / 2).translate(0, 0.02, 0);
GEO.bannerRod = new THREE.CylinderGeometry(0.028, 0.028, 0.74, 6).rotateZ(Math.PI / 2);
GEO.bannerCloth = (() => {
  const s = new THREE.Shape();
  s.moveTo(-0.27, 0);
  s.lineTo(0.27, 0);
  s.lineTo(0.27, -0.62);
  s.lineTo(0, -0.8);
  s.lineTo(-0.27, -0.62);
  s.closePath();
  return new THREE.ShapeGeometry(s);
})();
GEO.emblem = new THREE.PlaneGeometry(0.17, 0.17).rotateZ(Math.PI / 4);
GEO.bossShard = spireGeo(0.34, 2.3, 0.7);
GEO.plinth = chamferBox(0.92, 0.5, 0.92, 0.06);
GEO.platform = chamferBox(2.35, 0.14, 2.35, 0.06);
GEO.crystal = mergeGeos([
  xg(new THREE.OctahedronGeometry(0.3, 0), 0, 0, 0, 0, 0, 0, 1, 1.45, 1),
  xg(new THREE.OctahedronGeometry(0.16, 0), 0, 0.34, 0, 0, 0.6, 0, 1, 1.4, 1),
]);
GEO.ring = new THREE.TorusGeometry(0.95, 0.07, 8, 30).rotateX(-Math.PI / 2);
GEO.portal = new THREE.CircleGeometry(0.86, 24).rotateX(-Math.PI / 2);
GEO.runeRing = new THREE.RingGeometry(1.5, 2.3, 48).rotateX(-Math.PI / 2);
GEO.shaft = new THREE.CylinderGeometry(0.45, 1.7, 6, 12, 1, true).translate(0, 3, 0);
GEO.brazier = mergeGeos([
  xg(new THREE.BoxGeometry(0.07, 0.5, 0.07), 0.16, 0.25, 0, 0, 0, -0.25, 1),
  xg(new THREE.BoxGeometry(0.07, 0.5, 0.07), -0.08, 0.25, 0.14, 0.22, 0, 0.13, 1),
  xg(new THREE.BoxGeometry(0.07, 0.5, 0.07), -0.08, 0.25, -0.14, -0.22, 0, 0.13, 1),
  xg(new THREE.CylinderGeometry(0.32, 0.16, 0.26, 9), 0, 0.52, 0, 0, 0, 0, 1),
]);
GEO.coals = mergeGeos([
  xg(new THREE.IcosahedronGeometry(0.09, 0), 0, 0.63, 0.03, 0, 0, 0, 1),
  xg(new THREE.IcosahedronGeometry(0.07, 0), 0.1, 0.62, -0.06, 0, 0.5, 0, 1),
  xg(new THREE.IcosahedronGeometry(0.06, 0), -0.1, 0.61, -0.02, 0.4, 0, 0, 1),
]);
GEO.bone = mergeGeos([
  xg(
    new THREE.CylinderGeometry(0.024, 0.024, 0.34, 5).rotateZ(Math.PI / 2),
    0,
    0.03,
    0,
    0,
    0.4,
    0,
    1,
  ),
  xg(
    new THREE.CylinderGeometry(0.02, 0.02, 0.3, 5).rotateZ(Math.PI / 2),
    0.04,
    0.05,
    0.06,
    0,
    -0.7,
    0,
    1,
  ),
  xg(new THREE.SphereGeometry(0.08, 7, 6), -0.12, 0.08, -0.09, 0, 0, 0, 1),
  xg(new THREE.BoxGeometry(0.07, 0.05, 0.06), -0.12, 0.03, -0.03, 0, 0, 0, 1),
]);

const forgeSurfaceAudit = Object.entries(GEO).map(([name, geometry]) =>
  auditAndRepairForgeSurface(name, geometry),
);
document.documentElement.dataset.forgeSurfaceAudit = JSON.stringify({
  geometries: forgeSurfaceAudit.length,
  repairedNormals: forgeSurfaceAudit.filter((entry) => entry.repairedNormals).length,
  repairedUvs: forgeSurfaceAudit.filter((entry) => entry.repairedUvs).length,
});

/* -------- instance set builder with reveal + tilt support -------- */
function instSet() {
  return {
    px: [],
    py: [],
    pz: [],
    sx: [],
    sy: [],
    sz: [],
    rx: [],
    ry: [],
    rz: [],
    col: [],
    delay: [],
    n: 0,
    add(x, y, z, sx, sy, sz, ry, color, delay) {
      this.px.push(x);
      this.py.push(y);
      this.pz.push(z);
      this.sx.push(sx);
      this.sy.push(sy);
      this.sz.push(sz);
      this.rx.push(0);
      this.ry.push(ry);
      this.rz.push(0);
      this.col.push(color);
      this.delay.push(delay);
      this.n++;
    },
    addT(x, y, z, sx, sy, sz, rx, ry, rz, color, delay) {
      this.px.push(x);
      this.py.push(y);
      this.pz.push(z);
      this.sx.push(sx);
      this.sy.push(sy);
      this.sz.push(sz);
      this.rx.push(rx);
      this.ry.push(ry);
      this.rz.push(rz);
      this.col.push(color);
      this.delay.push(delay);
      this.n++;
    },
  };
}
/* shadow: 0 = none, 1 = cast+receive, 2 = receive only */
function buildMesh(set, geo, mat, mode, dur, shadow) {
  const alloc = Math.max(set.n, 1);
  const mesh = new THREE.InstancedMesh(geo, mat, alloc);
  mesh.count = set.n;
  /* Always allocate an instance-colour buffer, even for the "spare" instances
     past set.n. A shared material rendered by some meshes with instanceColor and
     some without compiles to two program variants and can trip the renderer's
     attribute fast-path; giving every InstancedMesh a colour buffer keeps them
     all on one variant. (Originally a hard r128 crash; cheap insurance since.) */
  const liftStructuralPalette = mat === matFloor || mat === matStone;
  const paletteGain = Math.max(1, Math.sqrt(activeEditorLightingProfile.surfaceGain) * 1.2);
  for (let i = 0; i < alloc; i++) {
    const color = i < set.n ? set.col[i] : 0xffffff;
    mesh.setColorAt(
      i,
      _c.set(liftStructuralPalette ? liftEditorPalette(color, paletteGain) : color),
    );
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  if (shadow === 1) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  } else if (shadow === 2) mesh.receiveShadow = true;
  mesh.userData = { set, mode, dur, settled: false };
  writeInstances(mesh, Infinity);
  return mesh;
}
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t) => {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};
function writeInstances(mesh, t) {
  const u = mesh.userData,
    s = u.set;
  let allDone = true;
  for (let i = 0; i < s.n; i++) {
    let k = (t - s.delay[i]) / u.dur;
    if (k < 1) allDone = false;
    k = Math.max(0.0001, Math.min(1, k));
    const g = u.mode === "rise" ? easeOutCubic(k) : easeOutBack(k) * Math.min(1, k * 8);
    _q.setFromEuler(_E.set(s.rx[i], s.ry[i], s.rz[i]));
    if (u.mode === "rise") {
      _p.set(s.px[i], s.py[i], s.pz[i]);
      _s.set(s.sx[i], s.sy[i] * Math.max(g, 0.0001), s.sz[i]);
    } else {
      const m = Math.max(g, 0.0001);
      _p.set(s.px[i], s.py[i], s.pz[i]);
      _s.set(s.sx[i] * m, s.sy[i] * m, s.sz[i] * m);
    }
    _m.compose(_p, _q, _s);
    mesh.setMatrixAt(i, _m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  u.settled = allDone;
}

/* -------- scene state -------- */
let D = null;
let group = null;
let meshes = {};
let overlay = null;
let lights = [];
let activeEditorLightingProfile = resolveEditorLightingProfile("ash");
let floorColorsBase = null,
  floorColorsHeat = null;
let animT = Infinity,
  animEnd = 0,
  animating = false;
let fx = {
  liquids: [],
  shafts: [],
  spinners: [],
  parts: null,
  enemyRoot: null,
  enemyMaterials: [],
  stones: [],
};
let levelGeos = [];
const lerpC = (a, b, t) => _c.set(a).lerp(new THREE.Color(b), t).getHex();
function liftEditorPalette(color, gain = 1) {
  _c.set(color);
  const max = Math.max(_c.r, _c.g, _c.b, 0.0001);
  _c.multiplyScalar(Math.min(gain, 0.9 / max));
  return _c.getHex();
}

function disposeLevel() {
  if (group) {
    scene.remove(group);
    group.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
      if (o.isLine || o.isPoints) {
        o.geometry.dispose();
        if (o.material && o.material.dispose && o.material !== partMat) o.material.dispose();
      }
    });
  }
  for (const material of fx.enemyMaterials) {
    material.map?.dispose();
    material.dispose();
  }
  for (const stone of fx.stones) {
    stone.root.traverse((object) => {
      if (!object.isMesh) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material.dispose();
    });
  }
  for (const g of levelGeos) g.dispose();
  levelGeos = [];
  group = null;
  meshes = {};
  overlay = null;
  lights = [];
  fx = {
    liquids: [],
    shafts: [],
    spinners: [],
    parts: null,
    enemyRoot: null,
    enemyMaterials: [],
    stones: [],
  };
}

function applyThemeEnv(TH) {
  const profile = resolveEditorLightingProfile(
    themeSel === "random" ? resolveTheme(D?.seed ?? 0) : themeSel,
  );
  scene.fog.color.set(TH.fog);
  curBg.set(TH.bg);
  hemi.color.set(TH.hemi[0]);
  hemi.groundColor.set(TH.hemi[1]);
  hemi.intensity = TH.hemi[2] * LIGHT_K;
  editorFill.color.set(TH.hemi[0]).lerp(new THREE.Color(0xffffff), 0.38);
  editorFill.intensity = profile.ambientGain * LIGHT_K;
  dirL.color.set(TH.dir[0]);
  dirL.intensity = TH.dir[1] * LIGHT_K * profile.keyGain;
  renderer.toneMappingExposure = profile.exposure;
  POST.fin.uniforms.uExposure.value = Math.max(1.7, 1.22 + profile.surfaceGain * 0.72);
  scene.fog.density = TH.fogD * profile.fogScale;
  document.documentElement.style.setProperty("--ember", TH.accent);
}

function buildLiquidMesh(cells, wx, wz, y) {
  /* aE = corner-local coords, aM = which of the 4 sides border non-liquid.
     The shader uses both to soften only true edges: single-cell pools get a
     full cooled rim, lake interiors stay seamless. */
  const key = new Set(cells.map((c) => c.x + "," + c.y));
  const n = cells.length;
  const pos = new Float32Array(n * 18),
    ae = new Float32Array(n * 12),
    am = new Float32Array(n * 24);
  const CE = [-0.5, -0.5, -0.5, 0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5, -0.5];
  let o = 0,
    oe = 0,
    om = 0;
  for (const c of cells) {
    const x0 = wx(c.x) - 0.51,
      x1 = wx(c.x) + 0.51,
      z0 = wz(c.y) - 0.51,
      z1 = wz(c.y) + 0.51;
    pos.set([x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0], o);
    o += 18;
    ae.set(CE, oe);
    oe += 12;
    const mx0 = key.has(c.x - 1 + "," + c.y) ? 0 : 1,
      mx1 = key.has(c.x + 1 + "," + c.y) ? 0 : 1;
    const mz0 = key.has(c.x + "," + (c.y - 1)) ? 0 : 1,
      mz1 = key.has(c.x + "," + (c.y + 1)) ? 0 : 1;
    for (let k = 0; k < 6; k++) {
      am[om++] = mx0;
      am[om++] = mx1;
      am[om++] = mz0;
      am[om++] = mz1;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aE", new THREE.BufferAttribute(ae, 2));
  g.setAttribute("aM", new THREE.BufferAttribute(am, 4));
  levelGeos.push(g);
  return new THREE.Mesh(g, liquidMat);
}

function buildScene(d) {
  disposeLevel();
  D = d;
  const TH = THEMES[d.params.themeKey];
  activeEditorLightingProfile = resolveEditorLightingProfile(d.params.themeKey);
  const accC = parseInt(TH.accent.slice(1), 16);
  applyForgeBiomeMaterials(d.params.themeKey);
  applyThemeEnv(TH);
  group = new THREE.Group();
  scene.add(group);
  const W = d.W,
    H = d.H,
    grid = d.grid,
    roomId = d.roomId,
    corridor = d.corridor,
    doorway = d.doorway,
    bfs = d.bfs,
    maxBfs = d.maxBfs,
    rooms = d.rooms,
    lakeMask = d.lakeMask;
  const idx = (x, y) => y * W + x,
    wx = (x) => x - W / 2 + 0.5,
    wz = (y) => y - H / 2 + 0.5;
  const cellRng = makeRng(d.seed ^ 0x9e3779b9);
  const dStep = 0.016;

  /* moss + pool adjacency masks for floor tinting */
  const mossMask = new Uint8Array(W * H);
  for (const p of d.props) if (p.kind === "moss") mossMask[idx(p.x, p.y)] = 1;
  const poolAdj = (x, y) => {
    const c = idx(x, y);
    return (
      (x < W - 1 && grid[c + 1] === POOL) ||
      (x > 0 && grid[c - 1] === POOL) ||
      (y < H - 1 && grid[c + W] === POOL) ||
      (y > 0 && grid[c - W] === POOL)
    );
  };

  /* floors */
  const fs = instSet();
  floorColorsBase = [];
  floorColorsHeat = [];
  const base = new THREE.Color(),
    tint = new THREE.Color(),
    heatA = new THREE.Color(0x2f4bb0),
    heatB = new THREE.Color(0xe8502f);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = idx(x, y);
      if (grid[c] !== FLOOR || lakeMask[c]) continue;
      let walls8 = 0;
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          const nx = x + ox,
            ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H || grid[idx(nx, ny)] === WALL) walls8++;
        }
      const rid = roomId[c];
      base.set(corridor[c] ? TH.corridor : TH.floor);
      if (rid >= 0 && rooms[rid].type !== TYPE.COMBAT)
        base.lerp(tint.set(TINT[rooms[rid].type]), 0.17);
      if (doorway[c]) base.multiplyScalar(1.14);
      if (mossMask[c]) base.lerp(tint.set(0x4c7a42), 0.32);
      if (TH.pools && TH.pools.mode === 0 && poolAdj(x, y)) base.lerp(tint.set(0xff7a33), 0.3);
      base.multiplyScalar(1 - 0.11 * Math.min(walls8, 4));
      base.multiplyScalar((x + y) & 1 ? 0.965 : 1.0);
      base.multiplyScalar(cellRng.f(0.94, 1.06));
      floorColorsBase.push(base.getHex());
      const diff = rid >= 0 ? rooms[rid].difficulty : maxBfs ? bfs[c] / maxBfs : 0.5;
      floorColorsHeat.push(
        heatA
          .clone()
          .lerp(heatB, Math.min(1, diff))
          .multiplyScalar(0.55 + 0.45 * (1 - 0.09 * Math.min(walls8, 4)))
          .getHex(),
      );
      fs.add(
        wx(x),
        cellRng.f(-0.02, 0.008),
        wz(y),
        1,
        1,
        1,
        0,
        floorColorsBase[floorColorsBase.length - 1],
        Math.max(0, bfs[c]) * dStep,
      );
    }
  meshes.floor = buildMesh(fs, GEO.floor, matFloor, "pop", 0.34, 2);

  /* walls + trim caps */
  const nearFloorBfs = (x, y) => {
    let b = 1e4;
    for (let oy = -1; oy <= 1; oy++)
      for (let ox = -1; ox <= 1; ox++) {
        const nx = x + ox,
          ny = y + oy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && bfs[idx(nx, ny)] >= 0)
          b = Math.min(b, bfs[idx(nx, ny)]);
      }
    return b === 1e4 ? 0 : b;
  };
  const ws = instSet(),
    cs = instSet();
  const wcol = new THREE.Color();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (grid[idx(x, y)] !== WALL) continue;
      const h = 2.2;
      const dl = nearFloorBfs(x, y) * dStep + 0.3;
      wcol.set(TH.wall).multiplyScalar(cellRng.f(0.9, 1.08));
      ws.add(wx(x), 0, wz(y), 1, h, 1, 0, wcol.getHex(), dl);
      wcol.set(TH.cap).multiplyScalar(cellRng.f(0.92, 1.1));
      cs.add(wx(x), h, wz(y), 1, 1, 1, 0, wcol.getHex(), dl + 0.12);
    }
  meshes.wall = buildMesh(ws, GEO.wall, matStone, "rise", 0.42, 1);
  meshes.wallCap = buildMesh(cs, GEO.wallCap, matStone, "pop", 0.3, 1);

  /* prop instance sets */
  const S = {
    pillar: instSet(),
    arch: instSet(),
    archL: instSet(),
    torchArm: instSet(),
    flame: instSet(),
    flameCore: instSet(),
    panelFrame: instSet(),
    panelGlow: instSet(),
    debrisA: instSet(),
    debrisB: instSet(),
    debrisC: instSet(),
    chest: instSet(),
    chestTrim: instSet(),
    chestGlow: instSet(),
    grave: instSet(),
    sarco: instSet(),
    campfire: instSet(),
    bone: instSet(),
    icicle: instSet(),
    shardIce: instSet(),
    roots: instSet(),
    moss: instSet(),
    crackD: instSet(),
    skirt: instSet(),
    bannerRod: instSet(),
    bannerCloth: instSet(),
    emblem: instSet(),
    crystal: instSet(),
    ring: instSet(),
    plinth: instSet(),
    platform: instSet(),
    brazier: instSet(),
    coals: instSet(),
    basin: instSet(),
    bossGlow: instSet(),
    bossRock: instSet(),
  };
  const addFluorescent = (x, z, ry, delay, scale = 1) => {
    S.panelFrame.add(x, 2.08, z, scale, 1, scale, ry, 0x3f3c2d, delay);
    S.panelGlow.add(x, 2.075, z, scale, 1, scale, ry, TH.flameCore, delay + 0.08);
  };
  const pd = (x, y) => Math.max(0, bfs[idx(x, y)]) * dStep + 0.62;
  const shaftAt = [];
  let portalXZ = null,
    runeXZ = null;

  for (const p of d.props) {
    const X = wx(p.x),
      Z = wz(p.y),
      dl = pd(p.x, p.y);
    switch (p.kind) {
      case "pillar": {
        const s = p.scale * 1.15;
        S.pillar.add(X, 0, Z, s, s, s, (cellRng.i(0, 3) * Math.PI) / 2, TH.pillar, dl);
        break;
      }
      case "debris": {
        const set = [S.debrisA, S.debrisB, S.debrisC][p.v || 0];
        set.add(
          X,
          0,
          Z,
          p.scale,
          p.scale * 0.85,
          p.scale,
          p.rot,
          lerpC(TH.debris[0], TH.debris[1], cellRng.raw()),
          dl,
        );
        break;
      }
      case "chest":
        S.chest.add(X, 0, Z, 1, 1, 1, p.rot, 0x8a5a2c, dl);
        S.chestTrim.add(X, 0, Z, 1, 1, 1, p.rot, 0xc8a24a, dl);
        S.chestGlow.add(X, 0, Z, 1, 1, 1, p.rot, 0xffd27a, dl + 0.15);
        break;
      case "shrineCrystal": {
        S.plinth.add(X, 0, Z, 1, 1, 1, p.rot, lerpC(TH.pillar, 0xffffff, 0.12), dl);
        S.crystal.add(X, 1.4, Z, 1.05, 1.05, 1.05, p.rot, 0x8fbcff, dl + 0.2);
        if (TH.fluorescent) {
          addFluorescent(X, Z, p.rot, dl + 0.15, 1.15);
        } else {
          for (let k = 0; k < 4; k++) {
            const a = (k * Math.PI) / 2 + Math.PI / 4,
              cx = X + Math.cos(a) * 0.36,
              cz = Z + Math.sin(a) * 0.36;
            S.campfire.add(cx, 0, cz, 0.85, 0.85, 0.85, 0, 0x5a5248, dl + 0.15);
            S.flameCore.add(cx, 0.65, cz, 0.5, 0.5, 0.5, 0, TH.flameCore, dl + 0.25);
          }
        }
        shaftAt.push([X, Z, 1]);
        break;
      }
      case "ring":
        S.platform.add(X, -0.02, Z, 1, 1, 1, 0, lerpC(TH.floor, 0xffffff, 0.1), dl);
        S.ring.add(X, 0.16, Z, 1, 1, 1, 0, 0x3fd0bb, dl + 0.1);
        S.pillar.add(X - 1.45, 0.1, Z, 0.72, 0.72, 0.72, 0, TH.pillar, dl + 0.15);
        S.pillar.add(X + 1.45, 0.1, Z, 0.72, 0.72, 0.72, 0, TH.pillar, dl + 0.15);
        portalXZ = [X, Z];
        shaftAt.push([X, Z, 0.9]);
        break;
      case "bossCrystal": {
        S.bossGlow.add(X, 0, Z, 1.15, 1.15, 1.15, p.rot, 0xff4636, dl);
        S.bossGlow.add(X + 0.55, 0, Z - 0.42, 0.6, 0.75, 0.6, p.rot + 1.2, 0xff6a45, dl + 0.12);
        S.bossRock.addT(
          X - 0.62,
          0,
          Z + 0.42,
          0.75,
          0.8,
          0.75,
          0.05,
          p.rot + 2.1,
          -0.06,
          0x4a3336,
          dl + 0.15,
        );
        S.bossRock.addT(
          X + 0.75,
          0,
          Z + 0.55,
          0.55,
          0.6,
          0.55,
          -0.06,
          p.rot + 3.6,
          0.05,
          0x51383a,
          dl + 0.2,
        );
        S.bossRock.addT(
          X - 0.5,
          0,
          Z - 0.62,
          0.5,
          0.55,
          0.5,
          0.04,
          p.rot + 4.9,
          0.04,
          0x452f31,
          dl + 0.24,
        );
        const r = rooms[p.roomId];
        runeXZ = {
          x: X,
          z: Z,
          s: Math.min(1.6, Math.max(0.8, (Math.min(r.w, r.h) / 2 - 1.5) / 2.3)),
        };
        break;
      }
      case "brazier":
        if (TH.fluorescent) {
          addFluorescent(X, Z, p.rot, dl);
        } else {
          S.brazier.add(X, 0, Z, 1, 1, 1, cellRng.f(0, 6.28), 0x3a3f4a, dl);
          S.coals.add(X, 0, Z, 1, 1, 1, 0, 0xff7a30, dl + 0.1);
          S.flame.add(X, 0.62, Z, 1.35, 1.35, 1.35, 0, TH.flame, dl + 0.12);
          S.flameCore.add(X, 0.66, Z, 1.3, 1.3, 1.3, 0, TH.flameCore, dl + 0.12);
        }
        break;
      case "grave":
        S.grave.addT(
          X,
          0,
          Z,
          p.scale,
          p.scale,
          p.scale,
          cellRng.f(-0.08, 0.08),
          p.rot,
          cellRng.f(-0.13, 0.13),
          lerpC(TH.wall, 0xffffff, 0.15),
          dl,
        );
        break;
      case "sarco":
        S.sarco.add(X, 0, Z, 1, 1, 1, p.rot, lerpC(TH.pillar, 0xffffff, 0.08), dl);
        break;
      case "campfire":
      case "candle" /* legacy kind → small floor campfire */:
        if (TH.fluorescent) {
          addFluorescent(X, Z, p.rot, dl, p.scale);
        } else {
          S.campfire.add(X, 0, Z, p.scale, p.scale, p.scale, cellRng.f(0, 6.28), 0x5a5248, dl);
          S.flame.add(X, 0.28 * p.scale, Z, 0.95, 1.2, 0.95, 0, TH.flame, dl + 0.1);
          S.flameCore.add(X, 0.32 * p.scale, Z, 0.7, 0.85, 0.7, 0, TH.flameCore, dl + 0.12);
        }
        break;
      case "icicle":
        S.icicle.add(
          wx(p.x) + p.dx * 0.42,
          1.75,
          wz(p.y) + p.dy * 0.42,
          p.scale,
          p.scale,
          p.scale,
          p.rot,
          0xbfe2ff,
          nearFloorBfs(p.x, p.y) * dStep + 0.7,
        );
        break;
      case "shardIce":
        S.shardIce.addT(
          X,
          -0.1,
          Z,
          p.scale,
          p.scale,
          p.scale,
          cellRng.f(-0.15, 0.15),
          p.rot,
          cellRng.f(-0.15, 0.15),
          0xcfeaff,
          dl,
        );
        break;
      case "roots":
        S.roots.add(
          wx(p.x),
          0,
          wz(p.y),
          p.scale,
          p.scale,
          p.scale,
          Math.atan2(p.dx, p.dy),
          0x5a4632,
          nearFloorBfs(p.x, p.y) * dStep + 0.6,
        );
        break;
      case "moss":
        S.moss.add(
          X,
          0,
          Z,
          p.scale,
          p.scale,
          p.scale,
          p.rot,
          lerpC(0x3f6b3a, 0x5a8a4a, cellRng.raw()),
          dl,
        );
        break;
      case "crack": {
        /* centered on the pool/lake edge so branches radiate outward */
        const cx = X - (p.dx || 0) * 0.5,
          cz = Z - (p.dy || 0) * 0.5;
        const vc = p.ice ? 0x9fd8ff : TH.pools && TH.pools.mode === 3 ? 0x86c05a : 0xff6a28;
        S.crackD.add(cx, 0, cz, p.scale, p.scale, p.scale, p.rot, vc, dl);
        break;
      }
      case "bones":
        S.bone.add(X, 0, Z, p.scale, p.scale, p.scale, p.rot, 0xcfc4a4, dl);
        break;
      case "banner": {
        const ry = Math.atan2(p.dx, p.dy);
        const bx = wx(p.x) + p.dx * 0.54,
          bz = wz(p.y) + p.dy * 0.54;
        const bdl = nearFloorBfs(p.x, p.y) * dStep + 0.7;
        S.bannerRod.add(bx, 1.98, bz, 1, 1, 1, ry, 0x6a5a3a, bdl);
        S.bannerCloth.add(
          bx + p.dx * 0.03,
          1.96,
          bz + p.dy * 0.03,
          1,
          1,
          1,
          ry,
          TH.cloth,
          bdl + 0.05,
        );
        S.emblem.add(bx + p.dx * 0.06, 1.6, bz + p.dy * 0.06, 1, 1, 1, ry, accC, bdl + 0.1);
        break;
      }
    }
  }

  /* torches */
  for (const t of d.torches) {
    const ry = Math.atan2(t.dx, t.dy);
    const X = wx(t.x) + t.dx * 0.5,
      Z = wz(t.y) + t.dy * 0.5,
      dl = nearFloorBfs(t.x, t.y) * dStep + 0.66;
    if (TH.fluorescent) {
      addFluorescent(X + t.dx * 0.1, Z + t.dy * 0.1, ry, dl);
    } else {
      S.torchArm.add(X, 1.02, Z, 1, 1, 1, ry, 0x4a4038, dl);
      S.flame.add(X + t.dx * 0.16, 1.5, Z + t.dy * 0.16, 1.2, 1.2, 1.2, 0, TH.flame, dl + 0.08);
      S.flameCore.add(
        X + t.dx * 0.16,
        1.53,
        Z + t.dy * 0.16,
        1.2,
        1.2,
        1.2,
        0,
        TH.flameCore,
        dl + 0.08,
      );
    }
  }

  /* Exact production creatures replace the old crystal/spire spawn markers.
     Keep native Sprite billboarding here: the atlas frame transform lives on
     each shared kind texture and stays correct while the Forge camera orbits.
     Pivot at opaque feet (or opaque crown for ceiling imps) so basals and
     contact shadows sit on the correct plane. */
  const enemyRoot = new THREE.Group();
  enemyRoot.name = "Production enemy preview";
  const enemyMaterials = new Map();
  const forgeWallHeight = 2.2;
  const enemyScaleMul = 0.74;
  // Soft theme wash — keep biome atlas hue readable (not a flat grey mask).
  const enemyPreviewTint = new THREE.Color(0xf4f0e8)
    .lerp(new THREE.Color(TH.accent), 0.12)
    .lerp(new THREE.Color(TH.wall), 0.08);
  const selectedEnemyKinds = selectEnemyKindsForSpawns(
    `CREATION-${d.seed}`,
    d.spawns.map((spawn) => spawn.tier),
  );
  const enemyMoodAnims = enemyAnimationsForMood(d.params.themeKey);
  const enemyShadowMaterial = createEnemyContactShadowMaterial();
  enemyShadowMaterial.name = "Forge enemy contact shadow material";
  fx.enemyMaterials.push(enemyShadowMaterial);
  const enemyMaterial = (kind) => {
    const cached = enemyMaterials.get(kind);
    if (cached) return cached;
    const animation = enemyMoodAnims[kind];
    const frame = animation.frames[0];
    const texture = new THREE.TextureLoader().load(animation.src);
    texture.name = `Forge biome enemy ${d.params.themeKey} ${kind}`;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.repeat.set(frame.w / animation.size[0], frame.h / animation.size[1]);
    texture.offset.set(frame.x / animation.size[0], 1 - (frame.y + frame.h) / animation.size[1]);
    const material = new THREE.SpriteMaterial({
      map: texture,
      color: enemyPreviewTint,
      transparent: true,
      opacity: 0.92,
      alphaTest: 0.08,
      depthTest: true,
      depthWrite: false,
      fog: true,
      toneMapped: true,
    });
    material.name = `Forge enemy ${d.params.themeKey} ${kind}`;
    enemyMaterials.set(kind, material);
    fx.enemyMaterials.push(material);
    return material;
  };
  d.spawns.forEach((sp, index) => {
    const X = wx(sp.x),
      Z = wz(sp.y);
    const kind = selectedEnemyKinds[index] || "goblin";
    const archetype = ENEMY_ARCHETYPES[kind];
    const spriteMetrics = getEnemySpriteRenderMetrics(kind, d.params.themeKey);
    const planeW = spriteMetrics.planeWidth * enemyScaleMul;
    const planeH = spriteMetrics.planeHeight * enemyScaleMul;
    const sprite = new THREE.Sprite(enemyMaterial(kind));
    sprite.name = `Enemy preview ${kind}`;
    const ceilingMounted = kind === "imp";
    if (ceilingMounted) {
      // Pivot on opaque crown so the body hangs into the room under the cap.
      sprite.center.set(0.5, 1 - spriteMetrics.topPaddingRatio);
      sprite.position.set(X, forgeWallHeight - 0.18, Z);
    } else {
      // Pivot on opaque feet; hoverOffset lifts spectral / airborne bodies.
      sprite.center.set(0.5, spriteMetrics.bottomPaddingRatio);
      sprite.position.set(X, 0.035 + archetype.hoverOffset * enemyScaleMul, Z);
    }
    sprite.scale.set(planeW, planeH, 1);
    sprite.renderOrder = 4;
    sprite.userData = { kind, tier: sp.tier, roomId: sp.roomId, ceilingMounted };
    enemyRoot.add(sprite);

    const feetY = ceilingMounted
      ? sprite.position.y -
        planeH * (1 - spriteMetrics.topPaddingRatio - spriteMetrics.bottomPaddingRatio)
      : sprite.position.y;
    const shadowLayout = resolveEnemyContactShadowLayout({
      bodyWidth: archetype.width * enemyScaleMul,
      lowProfile: isLowProfileEnemy(kind),
      feetY,
      visibility: 1,
      spectral: archetype.silhouette === "spectral",
    });
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), enemyShadowMaterial);
    shadow.name = `Enemy contact shadow ${kind}`;
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(X, shadowLayout.y, Z);
    shadow.scale.set(shadowLayout.width, shadowLayout.depth, 1);
    shadow.renderOrder = 1;
    shadow.frustumCulled = true;
    enemyRoot.add(shadow);
  });
  fx.enemyRoot = enemyRoot;
  group.add(enemyRoot);

  /* Shared placement + production 3D kits keep Creation and Play in sync. */
  const stonePlacements = selectForgeMagicStonePlacements({
    width: W,
    height: H,
    grid,
    roomIds: roomId,
    corridors: corridor,
    doorways: doorway,
    pools: Uint8Array.from({ length: W * H }, (_, index) => (grid[index] === POOL ? 1 : 0)),
    lakeMask,
    bfs,
    rooms,
    excludedRoomIds: new Set([d.entrance, d.boss]),
    blockedCells: [...d.props, ...d.spawns],
    floorValue: FLOOR,
  });
  for (const [index, placement] of stonePlacements.entries()) {
    const stone = createMagicStone(placement.stoneId, { darkStone: matStone, iron: matTrim });
    stone.root.position.set(wx(placement.x), 0.04, wz(placement.y));
    stone.root.scale.setScalar(0.78);
    stone.light.userData.base = stone.baseLightIntensity * 0.36;
    stone.light.userData.ph = index * 1.73;
    stone.light.userData.ramp = 1;
    stone.glow.userData.baseOpacity = stone.baseGlowOpacity;
    stone.root.userData.baseY = stone.root.position.y;
    stone.root.userData.phase = index * 1.37;
    fx.stones.push(stone);
    lights.push(stone.light);
    group.add(stone.root);
  }
  applyCompactStonePreview();

  /* doorway arches */
  for (const a of d.arches) {
    const X = wx(a.x) + (a.roomDx || 0) * 0.5,
      Z = wz(a.y) + (a.roomDy || 0) * 0.5;
    const half = a.len / 2 + 0.15;
    const dlA = nearFloorBfs(Math.round(a.x), Math.round(a.y)) * dStep + 0.7;
    const col = lerpC(TH.wall, 0xffffff, 0.12);
    if (a.px === 1) {
      S.arch.add(X - half, 0, Z, 1, 1, 1, 0, col, dlA);
      S.arch.add(X + half, 0, Z, 1, 1, 1, 0, col, dlA);
      S.archL.add(X, 1.62, Z, a.len + 0.42, 1, 1, 0, col, dlA + 0.1);
    } else {
      S.arch.add(X, 0, Z - half, 1, 1, 1, 0, col, dlA);
      S.arch.add(X, 0, Z + half, 1, 1, 1, 0, col, dlA);
      S.archL.add(X, 1.62, Z, a.len + 0.42, 1, 1, Math.PI / 2, col, dlA + 0.1);
    }
  }

  /* liquid pockets + frozen lakes */
  if (TH.pools) {
    liquidMat.uniforms.uMode.value = TH.pools.mode;
    liquidMat.uniforms.uColA.value.set(TH.pools.colA);
    liquidMat.uniforms.uColB.value.set(TH.pools.colB);
    liquidMat.uniforms.uGlow.value = TH.pools.glow;
  }
  if (d.pools.length) {
    const skirtC = TH.pools.mode === 0 ? 0xff5a1f : TH.pools.mode === 3 ? 0x33531e : 0x11463c;
    for (const p of d.pools) {
      const dl = nearFloorBfs(p.x, p.y) * dStep + 0.5;
      S.basin.add(wx(p.x), 0, wz(p.y), 1, 1, 1, 0, lerpC(TH.wall, 0x000000, 0.35), dl);
      S.skirt.add(
        wx(p.x),
        0,
        wz(p.y),
        cellRng.f(0.85, 1.25),
        1,
        cellRng.f(0.85, 1.25),
        cellRng.f(0, 6.28),
        skirtC,
        dl + 0.15,
      );
    }
    const m = buildLiquidMesh(d.pools, wx, wz, -0.08);
    group.add(m);
    fx.liquids.push(m);
  }
  if (d.lakeCells.length) {
    const m = buildLiquidMesh(d.lakeCells, wx, wz, -0.12);
    group.add(m);
    fx.liquids.push(m);
  }

  const setDefs = [
    ["pillar", GEO.pillar, matStone, "rise", 0.4, 1],
    ["arch", GEO.archPost, matStone, "rise", 0.45, 1],
    ["archL", GEO.archLintel, matStone, "pop", 0.35, 1],
    ["torchArm", GEO.torch, matTrim, "pop", 0.3, 0],
    ["flame", GEO.flame, matGlow, "pop", 0.3, 0],
    ["flameCore", GEO.flameCore, matGlow, "pop", 0.3, 0],
    ["panelFrame", GEO.panelFrame, matTrim, "pop", 0.3, 0],
    ["panelGlow", GEO.panelGlow, matGlow, "pop", 0.3, 0],
    ["debrisA", GEO.debrisA, matStone, "pop", 0.3, 2],
    ["debrisB", GEO.debrisB, matStone, "pop", 0.3, 2],
    ["debrisC", GEO.debrisC, matStone, "pop", 0.3, 2],
    ["chest", GEO.chestBody, matStone, "pop", 0.35, 1],
    ["chestTrim", GEO.chestTrim, matTrim, "pop", 0.35, 0],
    ["chestGlow", GEO.chestSeam, matGlow, "pop", 0.4, 0],
    ["grave", GEO.grave, matStone, "rise", 0.4, 1],
    ["sarco", GEO.sarco, matStone, "pop", 0.4, 1],
    ["campfire", GEO.campfire, matStone, "pop", 0.35, 1],
    ["bone", GEO.bone, matStone, "pop", 0.3, 0],
    ["icicle", GEO.icicle, matIce, "pop", 0.35, 0],
    ["shardIce", GEO.shard, matIce, "pop", 0.35, 0],
    ["roots", GEO.roots, matBark, "rise", 0.5, 1],
    ["moss", GEO.moss, matMoss, "pop", 0.4, 0],
    ["crackD", GEO.crack, matCrackD, "pop", 0.4, 0],
    ["skirt", GEO.skirt, matSkirt, "pop", 0.5, 0],
    ["bannerRod", GEO.bannerRod, matTrim, "pop", 0.3, 0],
    ["bannerCloth", GEO.bannerCloth, matCloth, "rise", 0.4, 0],
    ["emblem", GEO.emblem, matGlow, "pop", 0.3, 0],
    ["crystal", GEO.crystal, matGlow, "pop", 0.4, 0],
    ["ring", GEO.ring, matGlow, "pop", 0.4, 0],
    ["plinth", GEO.plinth, matStone, "pop", 0.4, 1],
    ["platform", GEO.platform, matStone, "pop", 0.45, 2],
    ["brazier", GEO.brazier, matTrim, "pop", 0.35, 1],
    ["coals", GEO.coals, matGlow, "pop", 0.35, 0],
    ["basin", GEO.basin, matStone, "pop", 0.3, 0],
    ["bossGlow", GEO.bossShard, matGlow, "rise", 0.5, 0],
    ["bossRock", GEO.bossShard, matStone, "rise", 0.5, 1],
  ];
  for (const [k, geo, mat, mode, dur, sh] of setDefs)
    meshes[k] = buildMesh(S[k], geo, mat, mode, dur, sh);
  for (const k in meshes) group.add(meshes[k]);

  /* hero single meshes: portal swirl, boss rune ring, god-ray shafts */
  if (portalXZ) {
    matPortal.color.set(0x3fd0bb);
    const m = new THREE.Mesh(GEO.portal, matPortal);
    m.position.set(portalXZ[0], 0.12, portalXZ[1]);
    group.add(m);
    fx.spinners.push({ m, spd: 0.55 });
  }
  if (runeXZ) {
    matRune.color.set(0xff5040);
    const m = new THREE.Mesh(GEO.runeRing, matRune);
    m.position.set(runeXZ.x, 0.06, runeXZ.z);
    m.scale.setScalar(runeXZ.s);
    group.add(m);
    fx.spinners.push({ m, spd: -0.16 });
  }
  if (TH.shafts) {
    const big = rooms
      .filter((r) => r.type === TYPE.COMBAT && !r.lake)
      .sort((a, b) => b.w * b.h - a.w * a.h)
      .slice(0, 2);
    for (const r of big) shaftAt.push([wx(r.cx), wz(r.cy), 1.3]);
  }
  for (const s of shaftAt) {
    const m = new THREE.Mesh(GEO.shaft, matShaft);
    m.position.set(s[0], 0, s[1]);
    m.scale.setScalar(s[2]);
    group.add(m);
    fx.shafts.push(m);
  }

  /* Biome signature field. Source placement follows the material that emits it. */
  {
    const moodId = d.params.themeKey;
    const spec = getBiomeParticleProfile(moodId).signature;
    const pts = [];
    const pp = (x, z, y) => pts.push({ x, z, y });
    if (moodId === "molten" || moodId === "obsidian") {
      for (const p of d.pools)
        pp(wx(p.x) + cellRng.f(-0.3, 0.3), wz(p.y) + cellRng.f(-0.3, 0.3), -0.02);
      for (const t of d.torches) pp(wx(t.x) + t.dx * 0.66, wz(t.y) + t.dy * 0.66, 1.5);
      for (const p of d.props) if (p.kind === "brazier") pp(wx(p.x), wz(p.y), 0.62);
    } else if (moodId === "grim") {
      for (const p of d.props) {
        if (p.kind === "grave" || p.kind === "sarco")
          pp(wx(p.x) + cellRng.f(-0.2, 0.2), wz(p.y) + cellRng.f(-0.2, 0.2), 0.3);
        else if (p.kind === "candle" || p.kind === "campfire") pp(wx(p.x), wz(p.y), 0.28);
        else if (p.kind === "bones") pp(wx(p.x), wz(p.y), 0.1);
      }
      for (const p of d.pools) pp(wx(p.x), wz(p.y), 0);
    } else if (moodId === "verdant" || moodId === "fungal") {
      for (const p of d.props) {
        if (p.kind === "moss")
          pp(wx(p.x) + cellRng.f(-0.25, 0.25), wz(p.y) + cellRng.f(-0.25, 0.25), 0.05);
        else if (p.kind === "roots")
          pp(wx(p.x) + p.dx * 0.8, wz(p.y) + p.dy * 0.8, cellRng.f(0.2, 1.4));
      }
      for (const p of d.pools) pp(wx(p.x), wz(p.y), 0);
    } else if (moodId === "ancient" || moodId === "backrooms") {
      for (const s of shaftAt)
        for (let k = 0; k < 10; k++)
          pp(
            s[0] + cellRng.f(-0.8, 0.8) * s[2],
            s[1] + cellRng.f(-0.8, 0.8) * s[2],
            cellRng.f(0.3, 2.4),
          );
      for (const t of d.torches)
        pp(wx(t.x) + t.dx * 0.7, wz(t.y) + t.dy * 0.7, cellRng.f(1.2, 1.9));
    } else if (moodId === "sunken") {
      for (const p of d.pools)
        for (let k = 0; k < 4; k++)
          pp(wx(p.x) + cellRng.f(-0.35, 0.35), wz(p.y) + cellRng.f(-0.35, 0.35), 0);
    } else {
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++)
          if (grid[idx(x, y)] === FLOOR && cellRng.chance(0.18))
            pp(wx(x) + cellRng.f(-0.35, 0.35), wz(y) + cellRng.f(-0.35, 0.35), 0);
    }
    if (!pts.length)
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++)
          if (grid[idx(x, y)] === FLOOR && cellRng.chance(0.1)) pp(wx(x), wz(y), 0);
    if (pts.length) {
      const n = Math.min(spec.maxCount, Math.max(spec.minCount, pts.length * 8));
      const pos = new Float32Array(n * 3),
        seed = new Float32Array(n),
        size = new Float32Array(n),
        tint = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const p = pts[cellRng.i(0, pts.length - 1)];
        pos[i * 3] = p.x + cellRng.f(-0.22, 0.22);
        pos[i * 3 + 1] = p.y + cellRng.f(0.02, 0.42);
        pos[i * 3 + 2] = p.z + cellRng.f(-0.22, 0.22);
        seed[i] = cellRng.raw();
        size[i] = spec.sizeMin + (spec.sizeMax - spec.sizeMin) * Math.pow(cellRng.raw(), 1.3);
        tint[i] = Math.pow(cellRng.raw(), 1.5);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
      g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
      g.setAttribute("aTint", new THREE.BufferAttribute(tint, 1));
      levelGeos.push(g);
      partMat.uniforms.uMotion.value = BIOME_PARTICLE_MOTION_ID[spec.motion];
      partMat.uniforms.uShape.value = BIOME_PARTICLE_SHAPE_ID[spec.shape];
      partMat.uniforms.uColor.value.set(spec.color);
      partMat.uniforms.uColorAlt.value.set(spec.colorAlt);
      partMat.uniforms.uOpacity.value = spec.opacity;
      partMat.uniforms.uSpeed.value = spec.speed;
      partMat.uniforms.uTurbulence.value = spec.turbulence;
      partMat.uniforms.uFlow.value.set(spec.flowX, spec.flowY, spec.flowZ);
      const pm = new THREE.Points(g, partMat);
      pm.name = `Forge biome particles: ${spec.name}`;
      pm.frustumCulled = false;
      group.add(pm);
      fx.parts = pm;
    }
  }

  /* shadow camera fit */
  const shHalf = Math.max(W, H) * 0.62 + 6;
  dirL.shadow.camera.left = -shHalf;
  dirL.shadow.camera.right = shHalf;
  dirL.shadow.camera.top = shHalf;
  dirL.shadow.camera.bottom = -shHalf;
  dirL.shadow.camera.updateProjectionMatrix();

  /* lights: farthest-point sample of torches + key lights */
  const budget = 12;
  const keys = [];
  keys.push({ x: rooms[d.entrance].cx, y: rooms[d.entrance].cy, col: 0x3fd0bb, i: 1.0, dist: 13 });
  keys.push({ x: rooms[d.boss].cx, y: rooms[d.boss].cy, col: 0xff4030, i: 1.7, dist: 17, ry: 2.2 });
  const shr = rooms.filter((r) => r.type === TYPE.SHRINE);
  if (shr.length) keys.push({ x: shr[0].cx, y: shr[0].cy, col: 0x6f9dff, i: 1.0, dist: 12 });
  const tb = Math.max(4, budget - keys.length);
  const chosen = [];
  if (d.torches.length) {
    chosen.push(d.torches[0]);
    while (chosen.length < Math.min(tb, d.torches.length)) {
      let best = null,
        bd = -1;
      for (const t of d.torches) {
        let dm = 1e9;
        for (const c of chosen) {
          const q = (t.x - c.x) * (t.x - c.x) + (t.y - c.y) * (t.y - c.y);
          if (q < dm) dm = q;
        }
        if (dm > bd) {
          bd = dm;
          best = t;
        }
      }
      chosen.push(best);
    }
  }
  let li = 0;
  for (const k of keys) {
    const L = new THREE.PointLight(k.col, k.i, k.dist, 2);
    L.position.set(wx(k.x), k.ry || 1.6, wz(k.y));
    L.userData = { base: k.i, ph: li * 2.1, ramp: 1 };
    group.add(L);
    lights.push(L);
    li++;
  }
  for (const t of chosen) {
    const L = new THREE.PointLight(TH.torchLight[0], TH.torchLight[1], TH.torchLight[2], 2);
    L.position.set(wx(t.x) + t.dx * 0.6, 1.7, wz(t.y) + t.dy * 0.6);
    L.userData = { base: TH.torchLight[1], ph: li * 1.7, ramp: 1 };
    group.add(L);
    lights.push(L);
    li++;
  }

  /* graph overlay */
  overlay = new THREE.Group();
  group.add(overlay);
  const mkLines = (pairs, color, y, op) => {
    const pos = new Float32Array(Math.max(pairs.length, 1) * 6);
    pairs.forEach((e, i) => {
      pos.set(
        [wx(rooms[e.a].cx), y, wz(rooms[e.a].cy), wx(rooms[e.b].cx), y, wz(rooms[e.b].cy)],
        i * 6,
      );
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const m = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: op,
      depthTest: false,
    });
    const l = new THREE.LineSegments(g, m);
    l.renderOrder = 5;
    overlay.add(l);
    return l;
  };
  const delPairs = delaunay(rooms.map((r) => ({ x: r.cx, y: r.cy }))).map((e) => ({
    a: e[0],
    b: e[1],
  }));
  overlay.userData = {
    del: mkLines(delPairs, 0x6a7385, 2.5, 0.13),
    mst: mkLines(
      d.edges.filter((e) => !e.isLoop),
      0xdfe4f0,
      2.6,
      0.7,
    ),
    loop: mkLines(
      d.edges.filter((e) => e.isLoop),
      0x39d5e0,
      2.65,
      0.9,
    ),
    crit: mkLines(
      d.edges.filter((e) => e.isCritical),
      0xff4d4d,
      2.75,
      0.95,
    ),
  };
  {
    const pos = new Float32Array(rooms.length * 3),
      col = new Float32Array(rooms.length * 3);
    rooms.forEach((r, i) => {
      pos.set([wx(r.cx), 2.85, wz(r.cy)], i * 3);
      _c.set(TINT[r.type]);
      col.set([_c.r, _c.g, _c.b], i * 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(
      g,
      new THREE.PointsMaterial({
        size: 6,
        sizeAttenuation: false,
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
      }),
    );
    pts.renderOrder = 6;
    overlay.add(pts);
    overlay.userData.pts = pts;
  }
  {
    const pos = new Float32Array(rooms.length * 8 * 3),
      col = new Float32Array(rooms.length * 8 * 3);
    rooms.forEach((r, i) => {
      _c.set(TINT[r.type]);
      for (let k = 0; k < 8; k++) col.set([_c.r, _c.g, _c.b], (i * 8 + k) * 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const m = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    });
    const rects = new THREE.LineSegments(g, m);
    rects.renderOrder = 7;
    overlay.add(rects);
    overlay.userData.rects = rects;
  }
  overlay.userData.wx = wx;
  overlay.userData.wz = wz;

  /* fog + camera framing */
  /* Gentle atmospheric haze keyed to the FIXED ~220u orthographic camera
     pullback (see updateCam), NOT the geometry size. FogExp2 measures distance
     from the camera, and every dungeon is viewed from the same 220u away, so a
     size-scaled density (e.g. 1.15/max(W,H) ≈ 0.01) reads as ~0.8% visibility
     and drowns the whole level in near-black fog. A small constant keeps the
     dungeon readable (~80% visible at centre) while edges fade for depth. */
  scene.fog.density = TH.fogD;
  // Fill the usable canvas, then account for the desktop controls that sit
  // above its left edge. The prior 0.62 fit left the maze small and centered
  // behind the panel, wasting almost half of the visible workspace.
  fitCameraToDungeon(W, H);

  const maxDelay = maxBfs * dStep + 1.2;
  animEnd = 2.3 + maxDelay + 0.8;
}

function updateRects(t) {
  const u = overlay.userData,
    rects = u.rects,
    pos = rects.geometry.attributes.position.array;
  const k = easeOutCubic(Math.min(1, Math.max(0, t / 0.95)));
  D.rooms.forEach((r, i) => {
    const cx = r.sx0 + (r.cx - r.sx0) * k,
      cy = r.sy0 + (r.cy - r.sy0) * k;
    const x0 = u.wx(cx - r.w / 2),
      x1 = u.wx(cx + r.w / 2),
      z0 = u.wz(cy - r.h / 2),
      z1 = u.wz(cy + r.h / 2),
      y = 0.35;
    pos.set(
      [x0, y, z0, x1, y, z0, x1, y, z0, x1, y, z1, x1, y, z1, x0, y, z1, x0, y, z1, x0, y, z0],
      i * 24,
    );
  });
  rects.geometry.attributes.position.needsUpdate = true;
}

/* -------- reveal / overlay opacity per frame -------- */
const clamp01 = (v) => Math.max(0, Math.min(1, v));
function phase(t, a, b) {
  return clamp01((t - a) / (b - a));
}
function applyReveal(t) {
  const u = overlay.userData,
    graphOn = el.tGraph.checked;
  updateRects(Math.min(t, 1.0));
  u.rects.material.opacity = 0.9 * (1 - phase(t, 2.5, 3.2));
  u.del.material.opacity = 0.13 * phase(t, 0.95, 1.45) * (graphOn ? 1 : 1 - phase(t, 3.0, 3.6));
  const resolved = phase(t, 1.55, 2.15);
  u.mst.material.opacity = 0.7 * resolved * (graphOn ? 1 : 1 - phase(t, 3.2, 3.9));
  u.loop.material.opacity = 0.9 * resolved * (graphOn ? 1 : 1 - phase(t, 3.2, 3.9));
  u.crit.material.opacity = 0.95 * phase(t, 1.9, 2.35) * (graphOn ? 1 : 1 - phase(t, 3.4, 4.1));
  u.pts.material.opacity = 0.95 * phase(t, 0.15, 0.5) * (graphOn ? 1 : 1 - phase(t, 3.0, 3.6));
  const tt = t - 2.3;
  for (const k in meshes) {
    const m = meshes[k];
    if (!m.userData.settled) writeInstances(m, tt);
  }
  const lightRamp = phase(t, 2.6, animEnd * 0.85);
  for (const L of lights) L.userData.ramp = lightRamp;
  setFxRamp(phase(t, 2.7, Math.max(3.6, animEnd * 0.8)));
  setStage(t);
}
function setFxRamp(v) {
  liquidMat.uniforms.uOp.value = v;
  partMat.uniforms.uRamp.value = v;
  matShaft.opacity = 0.13 * v;
  matSkirt.opacity = 0.5 * v;
  matRune.opacity = 0.85 * v;
  matPortal.opacity = 0.9 * v;
}
function setOverlayStatic() {
  setFxRamp(1);
  const u = overlay.userData,
    on = el.tGraph.checked;
  updateRects(1e3);
  u.rects.material.opacity = on ? 0.35 : 0;
  u.del.material.opacity = on ? 0.13 : 0;
  u.mst.material.opacity = on ? 0.7 : 0;
  u.loop.material.opacity = on ? 0.9 : 0;
  u.crit.material.opacity = on ? 0.95 : 0;
  u.pts.material.opacity = on ? 0.95 : 0;
  for (const L of lights) L.userData.ramp = 1;
}

/* -------- pipeline stepper -------- */
const pipeEls = [...document.querySelectorAll("#pipe li")];
function setStage(t) {
  const bounds = [0, 0.3, 0.95, 1.55, 2.3, 2.3 + Math.max(0.6, (animEnd - 2.3) * 0.55)];
  pipeEls.forEach((li, i) => {
    const s = bounds[i],
      e = i < 5 ? bounds[i + 1] : animEnd;
    li.classList.toggle("active", t >= s && t < e);
    li.classList.toggle("done", t >= e);
  });
}
function setStageDone() {
  pipeEls.forEach((li) => {
    li.classList.remove("active");
    li.classList.add("done");
  });
}

/* -------- UI refs -------- */
const $ = (id) => document.getElementById(id);
const el = {
  seed: $("seed"),
  dice: $("dice"),
  forge: $("forge"),
  rooms: $("rooms"),
  loops: $("loops"),
  decor: $("decor"),
  vRooms: $("vRooms"),
  vLoops: $("vLoops"),
  vDecor: $("vDecor"),
  tGraph: $("tGraph"),
  tHeat: $("tHeat"),
  tAnim: $("tAnim"),
  tPost: $("tPost"),
  dname: $("dname"),
  dsub: $("dsub"),
  vTheme: $("vTheme"),
  sRooms: $("sRooms"),
  sEdges: $("sEdges"),
  sCrit: $("sCrit"),
  sTiles: $("sTiles"),
  sLights: $("sLights"),
  sMs: $("sMs"),
  sCalls: $("sCalls"),
  sTris: $("sTris"),
  sFps: $("sFps"),
};

/* -------- theme selection -------- */
let themeSel = "random";
function setThemeSel(t) {
  themeSel = t;
  document
    .querySelectorAll("#chips .chip")
    .forEach((ch) => ch.classList.toggle("on", ch.dataset.t === t));
}
function moodChannel(seed, salt) {
  return (Math.imul((seed >>> 0) ^ salt, 2654435761) >>> 0);
}
function resolveTheme(seed) {
  if (themeSel !== "random") return themeSel;
  // Match runtime resolveDungeonMood: backrooms ~8%, all regular themes reachable.
  if (moodChannel(seed, 0xa5a5a5a5) % 100 < 8) return "backrooms";
  return REGULAR_THEME_KEYS[moodChannel(seed, 0xb7e15163) % REGULAR_THEME_KEYS.length];
}

/* -------- object-layer toggles (all on by default) -------- */
const objVis = { props: true, torches: true, particles: true, liquids: true, lights: true };
/* which instanced-mesh categories belong to each toggle; everything not listed
   (floor, wall, wallCap) is structural and always shown */
const OBJ_MESHES = {
  props: [
    "pillar",
    "arch",
    "archL",
    "debrisA",
    "debrisB",
    "debrisC",
    "chest",
    "chestTrim",
    "chestGlow",
    "grave",
    "sarco",
    "campfire",
    "bone",
    "icicle",
    "shardIce",
    "roots",
    "moss",
    "crackD",
    "skirt",
    "bannerRod",
    "bannerCloth",
    "emblem",
    "crystal",
    "ring",
    "plinth",
    "platform",
    "basin",
    "bossGlow",
    "bossRock",
  ],
  torches: ["torchArm", "flame", "flameCore", "panelFrame", "panelGlow", "brazier", "coals"],
};
/* Apply current toggle state to the live scene. Called after every forge (which
   rebuilds meshes/fx/lights) and whenever a chip is clicked. */
function applyObjectVis() {
  for (const cat in OBJ_MESHES)
    for (const k of OBJ_MESHES[cat]) if (meshes[k]) meshes[k].visible = objVis[cat];
  if (fx.parts) fx.parts.visible = objVis.particles;
  for (const m of fx.shafts) m.visible = objVis.particles;
  for (const m of fx.liquids) m.visible = objVis.liquids;
  for (const sp of fx.spinners) sp.m.visible = objVis.props;
  if (fx.enemyRoot) fx.enemyRoot.visible = objVis.props;
  for (const stone of fx.stones) stone.root.visible = objVis.props;
  for (const L of lights) L.visible = objVis.lights;
}

function applyCompactStonePreview() {
  const compact = !renderQuality.directionalShadows;
  for (const stone of fx.stones) {
    for (const child of stone.root.children) {
      if (child.userData.compactPreviewOptional) child.visible = !compact;
    }
  }
}

const prefersReduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
if (prefersReduced) el.tAnim.checked = false;

function setControlPanelCollapsed(collapsed) {
  const panel = document.getElementById("panel");
  const content = document.getElementById("panel-content");
  const collapse = document.getElementById("collapse");
  panel.classList.toggle("min", collapsed);
  content.inert = collapsed;
  collapse.textContent = collapsed ? "+" : "\u2013";
  collapse.setAttribute("aria-expanded", String(!collapsed));
  collapse.setAttribute("aria-label", collapsed ? "Expand controls" : "Collapse controls");
  collapse.title = collapsed ? "Expand controls" : "Collapse controls";
}

if (innerWidth < 640) {
  setControlPanelCollapsed(true);
}

function applyHeat(on) {
  if (!meshes.floor) return;
  const src = on ? floorColorsHeat : floorColorsBase;
  const paletteGain = Math.max(1, Math.sqrt(activeEditorLightingProfile.surfaceGain) * 1.2);
  for (let i = 0; i < src.length; i++)
    meshes.floor.setColorAt(i, _c.set(liftEditorPalette(src[i], paletteGain)));
  if (meshes.floor.instanceColor) meshes.floor.instanceColor.needsUpdate = true;
}
function settleAll() {
  for (const k in meshes) writeInstances(meshes[k], Infinity);
}
function finishAnim() {
  animating = false;
  animT = Infinity;
  settleAll();
  setOverlayStatic();
  setStageDone();
}

/* -------- forge -------- */
function forge(animate) {
  const seed = (parseInt(el.seed.value, 10) || 0) >>> 0;
  const themeKey = resolveTheme(seed);
  const params = {
    seed,
    roomCount: +el.rooms.value,
    loopChance: +el.loops.value / 100,
    decorDensity: +el.decor.value / 100,
    themeKey,
  };
  const d = generateDungeon(params);
  buildScene(d);
  publishDungeon(d);
  applyObjectVis();
  const TH = THEMES[themeKey];
  el.vTheme.textContent = themeSel === "random" ? "RANDOM \u00b7 " + TH.label : TH.label;
  el.dname.textContent = d.name;
  const st = d.stats;
  document.documentElement.dataset.forgeStats = JSON.stringify(st);
  el.dsub.innerHTML =
    "seed " +
    d.seed +
    ' \u00b7 <span style="color:var(--ember)">' +
    TH.label.toLowerCase() +
    "</span>" +
    " \u00b7 level " +
    ((d.seed % 9) + 2) +
    " \u00b7 " +
    (d.valid ? '<span class="ok">connected \u2713</span>' : '<span class="bad">unresolved</span>') +
    (st.attempts > 1 ? " \u00b7 attempt \u00d7" + (st.attempts - 1) : "");
  el.sRooms.textContent = st.rooms;
  el.sEdges.textContent = st.edges + " \u00b7 " + st.loops;
  el.sCrit.textContent = st.critLen + " rm";
  el.sTiles.textContent = st.floorTiles;
  el.sLights.textContent = lights.length;
  el.sMs.textContent = st.genMs.toFixed(1) + "ms";
  applyHeat(el.tHeat.checked);
  if (animate && el.tAnim.checked) {
    animating = true;
    animT = 0;
    for (const k in meshes) meshes[k].userData.settled = false;
    setFxRamp(0);
  } else finishAnim();
}

/* -------- host bridge --------
   The full Forge remains a standalone page. When embedded by the first-person
   engine it also publishes the generated topology so the same map can be
   explored in Play mode. Structured clone keeps the typed grid arrays intact. */
function publishDungeon(d) {
  if (window.parent === window) return;
  window.parent.postMessage(
    { type: "black-flag:forge-dungeon", version: 1, dungeon: d },
    location.origin,
  );
}

/* -------- live per-frame animation: flames, crystals, liquids, particles -------- */
function liveUpdate(time, tt) {
  for (const key of ["flame", "flameCore"]) {
    const fm = meshes[key];
    if (!fm || !fm.userData.set.n) continue;
    const fu = fm.userData,
      s = fu.set;
    for (let i = 0; i < s.n; i++) {
      const k = clamp01((tt - s.delay[i]) / fu.dur);
      const g = Math.max(0.0001, k >= 1 ? 1 : easeOutBack(k) * Math.min(1, k * 8));
      const fl = 0.86 + 0.22 * Math.sin(time * 11 + i * 2.7) * Math.sin(time * 5.3 + i * 1.31);
      _q.set(0, 0, 0, 1);
      _p.set(s.px[i], s.py[i] + 0.03 * Math.sin(time * 7 + i), s.pz[i]);
      _s.set(
        s.sx[i] * g * (0.92 + 0.12 * Math.sin(time * 13 + i * 3.1)),
        s.sy[i] * g * fl,
        s.sz[i] * g,
      );
      _m.compose(_p, _q, _s);
      fm.setMatrixAt(i, _m);
    }
    fm.instanceMatrix.needsUpdate = true;
  }
  const cm = meshes.crystal;
  if (cm && cm.userData.set.n) {
    const cu = cm.userData,
      s = cu.set;
    for (let i = 0; i < s.n; i++) {
      const k = clamp01((tt - s.delay[i]) / cu.dur);
      const g = Math.max(0.0001, k >= 1 ? 1 : easeOutBack(k) * Math.min(1, k * 8));
      _q.setFromAxisAngle(_Y, s.ry[i] + time * 0.9);
      _p.set(s.px[i], s.py[i] + 0.08 * Math.sin(time * 2.1 + i * 1.7), s.pz[i]);
      _s.set(s.sx[i] * g, s.sy[i] * g, s.sz[i] * g);
      _m.compose(_p, _q, _s);
      cm.setMatrixAt(i, _m);
    }
    cm.instanceMatrix.needsUpdate = true;
  }
  liquidMat.uniforms.uTime.value = time;
  partMat.uniforms.uTime.value = time;
  /* device pixels per world unit, so particle sizes track the ortho zoom */
  partMat.uniforms.uZoom.value = (renderer.domElement.height * cam.zoom) / (2 * BASE_HALF);
  for (const sp of fx.spinners) sp.m.rotation.y = time * sp.spd;
  for (const stone of fx.stones) {
    const phase = stone.root.userData.phase || 0;
    stone.root.rotation.y = time * 0.42 + phase;
    stone.root.position.y = stone.root.userData.baseY + Math.sin(time * 1.7 + phase) * 0.035;
    stone.glow.material.opacity =
      stone.glow.userData.baseOpacity * (0.84 + Math.sin(time * 2.1 + phase) * 0.16);
  }
  for (const L of lights) {
    const ramp = L.userData.ramp === undefined ? 1 : L.userData.ramp;
    L.intensity =
      L.userData.base *
      LIGHT_K *
      ramp *
      (0.84 +
        0.22 * Math.sin(time * 9 + L.userData.ph) * Math.sin(time * 4.7 + L.userData.ph * 1.7));
  }
}

/* -------- main loop -------- */
// three@0.178 has no THREE.Timer (added later); local clock keeps forge runnable.
let lastTickMs = performance.now();
let elapsed = 0;
let fpsFrames = 0,
  fpsTime = 0;
let hostPaused = false;
function tick() {
  /* RAF pauses entirely in occluded windows; keep a slow heartbeat so the
     build reveal and stats stay live when the tab is hidden */
  if (document.hidden || hostPaused) setTimeout(tick, 100);
  else requestAnimationFrame(tick);
  const now = performance.now();
  const dt = Math.min(Math.max(0, (now - lastTickMs) / 1000), 0.05);
  lastTickMs = now;
  if (hostPaused) return;
  elapsed += dt;
  if (animating) {
    animT += dt;
    applyReveal(animT);
    if (animT > animEnd + 0.35) finishAnim();
  }
  liveUpdate(elapsed, animating ? animT - 2.3 : Infinity);
  renderer.info.reset();
  renderFrame();
  fpsFrames++;
  fpsTime += dt;
  if (fpsTime >= 0.5) {
    el.sFps.textContent = Math.round(fpsFrames / fpsTime);
    el.sCalls.textContent = renderer.info.render.calls;
    const tr = renderer.info.render.triangles;
    el.sTris.textContent = tr > 1e6 ? (tr / 1e6).toFixed(2) + "M" : Math.round(tr / 1e3) + "k";
    fpsFrames = 0;
    fpsTime = 0;
  }
}

addEventListener("message", (event) => {
  if (event.origin !== location.origin || event.source !== window.parent) return;
  if (event.data?.type === "black-flag:forge-new-seed") {
    const requested = Number(event.data.seed);
    if (Number.isFinite(requested)) {
      el.seed.value = nextProceduralSeed(requested, Number(el.seed.value) || 0);
      forge(true);
    }
    return;
  }
  if (event.data?.type === "black-flag:forge-visibility") {
    hostPaused = !event.data.visible;
    // The iframe can publish its first payload before the host finishes
    // installing the message listener. Re-publish on the host visibility
    // handshake so a fast or cached Forge load cannot remain stuck on LOADING.
    if (event.data.visible && D) publishDungeon(D);
  }
});

/* -------- camera controls: drag pan, wheel zoom, shift-drag orbit -------- */
const cnv = renderer.domElement;
let dragging = false,
  orbiting = false,
  lastX = 0,
  lastY = 0;
cnv.addEventListener("pointerdown", (e) => {
  orbiting = e.button === 2 || (e.button === 0 && e.shiftKey);
  dragging = e.button === 0 && !e.shiftKey;
  lastX = e.clientX;
  lastY = e.clientY;
  cnv.setPointerCapture(e.pointerId);
});
cnv.addEventListener("pointermove", (e) => {
  if (!dragging && !orbiting) return;
  const dx = e.clientX - lastX,
    dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  if (orbiting) {
    yaw -= dx * 0.005;
    pitch = Math.min(1.15, Math.max(0.32, pitch + dy * 0.005));
  } else {
    const wpp = (2 * BASE_HALF) / cam.zoom / cnv.clientHeight;
    const fx = Math.sin(yaw),
      fz = Math.cos(yaw);
    camTarget.x += (-dx * fz - dy * fx) * wpp;
    camTarget.z += (dx * fx - dy * fz) * wpp;
  }
  updateCam();
});
const endDrag = () => {
  dragging = false;
  orbiting = false;
};
cnv.addEventListener("pointerup", endDrag);
cnv.addEventListener("pointercancel", endDrag);
cnv.addEventListener("contextmenu", (e) => e.preventDefault());
cnv.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    cam.zoom = Math.min(6, Math.max(0.12, cam.zoom * Math.exp(-e.deltaY * 0.0012)));
    cam.updateProjectionMatrix();
  },
  { passive: false },
);

/* -------- UI wiring -------- */
let deb = null;
const sliderRegen = () => {
  clearTimeout(deb);
  deb = setTimeout(() => forge(false), 220);
};
const randomizeEditorSeed = () => {
  const entropy = new Uint32Array(1);
  crypto.getRandomValues(entropy);
  el.seed.value = nextProceduralSeed(entropy[0] ?? 0, Number(el.seed.value) || 0);
};
el.rooms.addEventListener("input", () => {
  el.vRooms.textContent = el.rooms.value;
  sliderRegen();
});
el.loops.addEventListener("input", () => {
  el.vLoops.textContent = el.loops.value + "%";
  sliderRegen();
});
el.decor.addEventListener("input", () => {
  el.vDecor.textContent = el.decor.value + "%";
  sliderRegen();
});
el.seed.addEventListener("change", () => forge(true));
el.dice.addEventListener("click", () => {
  randomizeEditorSeed();
  forge(true);
});
el.forge.addEventListener("click", () => forge(true));
el.tGraph.addEventListener("change", () => {
  if (!animating) setOverlayStatic();
});
el.tHeat.addEventListener("change", () => applyHeat(el.tHeat.checked));
el.tPost.addEventListener("change", () => {
  POST.enabled = el.tPost.checked;
});
document.querySelectorAll("#chips .chip").forEach((ch) => {
  ch.addEventListener("click", () => {
    setThemeSel(ch.dataset.t);
    forge(true);
  });
});
document.querySelectorAll("#objchips .chip").forEach((ch) => {
  ch.addEventListener("click", () => {
    const cat = ch.dataset.o;
    objVis[cat] = !objVis[cat];
    ch.classList.toggle("on", objVis[cat]);
    ch.setAttribute("aria-pressed", objVis[cat]);
    applyObjectVis(); // no reforge needed — just flip visibility on the live scene
  });
});
document.getElementById("collapse").addEventListener("click", () => {
  const p = document.getElementById("panel");
  setControlPanelCollapsed(!p.classList.contains("min"));
});

addEventListener("keydown", (e) => {
  const tag = e.target.tagName;
  if (tag === "BUTTON") return;
  if (tag === "INPUT" && e.target.type !== "range" && e.target.type !== "checkbox") return;
  if (e.code === "KeyR") {
    randomizeEditorSeed();
    forge(true);
  } else if (e.code === "KeyG") {
    el.tGraph.checked = !el.tGraph.checked;
    if (!animating) setOverlayStatic();
  } else if (e.code === "KeyH") {
    el.tHeat.checked = !el.tHeat.checked;
    applyHeat(el.tHeat.checked);
  } else if (e.code === "KeyT") {
    const order = ["random"].concat(THEME_KEYS);
    setThemeSel(order[(order.indexOf(themeSel) + 1) % order.length]);
    forge(true);
  } else if (e.code === "KeyP") {
    el.tPost.checked = !el.tPost.checked;
    POST.enabled = el.tPost.checked;
  } else if (e.code === "Space") {
    e.preventDefault();
    if (animating) finishAnim();
  }
});

addEventListener("resize", () => {
  renderQuality = resolveForgeRenderQuality(innerWidth, devicePixelRatio);
  renderer.setPixelRatio(renderQuality.pixelRatio);
  renderer.shadowMap.enabled = renderQuality.directionalShadows;
  dirL.castShadow = renderQuality.directionalShadows;
  applyCompactStonePreview();
  aspect = innerWidth / innerHeight;
  cam.left = -BASE_HALF * aspect;
  cam.right = BASE_HALF * aspect;
  cam.top = BASE_HALF;
  cam.bottom = -BASE_HALF;
  cam.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  if (D) fitCameraToDungeon(D.W, D.H);
});

/* -------- go -------- */
randomizeEditorSeed();
forge(true);
tick();
