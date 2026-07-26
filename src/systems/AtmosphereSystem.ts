import * as THREE from "three";

import { createSeededRandom } from "../core/random";
import { FLOOR } from "../dungeon/generateDungeon";
import { gridToWorld } from "../dungeon/gridCollision";
import type { DungeonData, GridCell } from "../dungeon/types";
import type { DungeonMood } from "./DungeonMood";
import { getDungeonMood } from "./DungeonMood";

interface MistBank {
  sprite: THREE.Sprite;
  baseY: number;
  phase: number;
  baseOpacity: number;
}

interface SoftGroundFog {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  baseDensity: number;
  mask: THREE.DataTexture;
}

/** Matches DungeonWorld wall/tile height. */
export const SOFT_FOG_DEFAULT_WALL_HEIGHT = 4.4;
/** Half-size of the local fog box that follows the player (meters, XZ). */
export const SOFT_FOG_LOCAL_HALF = 12;
/** Max ray length inside the volume — avoids hard “map edge” cuts. */
export const SOFT_FOG_MAX_DIST = 15;
/**
 * Dual height falloff (ground layer + air layer). Both continuous exponentials:
 * thick near floor, still present at eye level, soft dissolve under ceiling.
 */
export const SOFT_FOG_HEIGHT_FALLOFF_GROUND = 1.05;
export const SOFT_FOG_HEIGHT_FALLOFF_AIR = 0.34;
/** Kept for tests / tuning of “overall” vertical read (air layer). */
export const SOFT_FOG_HEIGHT_FALLOFF = SOFT_FOG_HEIGHT_FALLOFF_AIR;
/** Distance falloff γ along the view ray (soft dissolve with range). */
export const SOFT_FOG_DIST_FALLOFF = 0.07;
/** Scale on analytical optical depth before Beer–Lambert. */
export const SOFT_FOG_DENSITY = 0.62;
export const SOFT_FOG_MAX_ALPHA = 0.26;

/**
 * Soft volume haze from mood. Pulls mist toward fog base, then caps Rec.709
 * luminance so bright ice/mist hexes cannot bleach torch contrast. Dark moods
 * keep authored depth — only bright haze is compressed.
 */
export function fogVolumeColor(mood: DungeonMood): THREE.Color {
  const color = new THREE.Color(mood.mistColor);
  color.lerp(new THREE.Color(mood.fog), 0.55);
  const lum = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
  const targetLum = 0.22;
  if (lum > targetLum) {
    color.multiplyScalar(targetLum / lum);
  } else {
    // Mild settle for already-dark authored mist (grim/frost/molten).
    color.multiplyScalar(0.88);
  }
  return color;
}

function createMistTexture(): THREE.Texture {
  if (typeof document === "undefined") {
    const data = new Uint8Array([200, 202, 198, 120]);
    const texture = new THREE.DataTexture(data, 1, 1);
    texture.needsUpdate = true;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create mist texture.");
  const gradient = context.createRadialGradient(64, 34, 3, 64, 34, 61);
  gradient.addColorStop(0, "rgba(214, 216, 207, 0.44)");
  gradient.addColorStop(0.44, "rgba(157, 166, 165, 0.2)");
  gradient.addColorStop(1, "rgba(88, 98, 101, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

/** Coarse lit motes — count scales with floor area. */
// Mote budgets trimmed for smoother mid-range GPUs (still reads as ash motes).
export const DUST_COARSE_MIN = 360;
export const DUST_COARSE_MAX = 900;
export const DUST_COARSE_PER_FLOOR = 0.5;
/** World-unit point size range (varied per mote). */
export const DUST_COARSE_SIZE_MIN = 0.045;
export const DUST_COARSE_SIZE_MAX = 0.19;
/** Peak opacity while visible (particles also fade in/out over time). */
export const DUST_COARSE_OPACITY = 0.46;

/** Fine floating dust layer. */
export const DUST_FINE_MIN = 280;
export const DUST_FINE_MAX = 720;
export const DUST_FINE_PER_FLOOR = 0.38;
export const DUST_FINE_SIZE_MIN = 0.028;
export const DUST_FINE_SIZE_MAX = 0.11;
export const DUST_FINE_OPACITY = 0.34;

/** Kept for tests / callers that still read a single size token (mid of range). */
export const DUST_COARSE_SIZE = (DUST_COARSE_SIZE_MIN + DUST_COARSE_SIZE_MAX) * 0.5;
export const DUST_FINE_SIZE = (DUST_FINE_SIZE_MIN + DUST_FINE_SIZE_MAX) * 0.5;

function createDustTexture(): THREE.Texture {
  if (typeof document === "undefined") {
    const data = new Uint8Array([255, 250, 235, 255]);
    const texture = new THREE.DataTexture(data, 1, 1);
    texture.needsUpdate = true;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create dust texture.");
  // Hotter core + shorter falloff so each mote reads as a speck, not a faint smear.
  const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 14);
  gradient.addColorStop(0, "rgba(255, 252, 240, 1)");
  gradient.addColorStop(0.22, "rgba(255, 244, 210, 0.95)");
  gradient.addColorStop(0.55, "rgba(230, 215, 175, 0.55)");
  gradient.addColorStop(1, "rgba(160, 150, 120, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 32, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Soft floor mask: 5×5 blur so walkable area edges feather, not grid. */
function createFloorMaskTexture(dungeon: DungeonData): THREE.DataTexture {
  const w = dungeon.width;
  const h = dungeon.height;
  const raw = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      raw[y * w + x] = dungeon.grid[y]?.[x] === FLOOR ? 1 : 0;
    }
  }
  const soft = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let sum = 0;
      let count = 0;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const sx = x + dx;
          const sy = y + dy;
          if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
          // Distance weight for rounder soft edges.
          const weight = 1 / (1 + dx * dx + dy * dy);
          sum += raw[sy * w + sx]! * weight;
          count += weight;
        }
      }
      soft[y * w + x] = sum / Math.max(1e-6, count);
    }
  }
  const data = new Uint8Array(w * h);
  for (let i = 0; i < soft.length; i += 1) {
    data[i] = Math.round(Math.min(1, soft[i]!) * 255);
  }
  const texture = new THREE.DataTexture(data, w, h, THREE.RedFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  texture.colorSpace = THREE.NoColorSpace;
  texture.name = "Dungeon floor fog mask";
  return texture;
}

/**
 * Local wall-height volume that follows the player.
 * Analytical height fog: ρ(y)=ρ0·e^(−βy), integrated along the ray → continuous
 * vertical gradient with no discrete bands or map-edge cliffs.
 */
const SOFT_FOG_VERTEX = /* glsl */ `
  varying vec3 vWorldPos;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPos = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SOFT_FOG_FRAGMENT = /* glsl */ `
  precision mediump float;

  uniform vec3 uColor;
  uniform float uDensity;
  uniform float uHeight;
  uniform float uTime;
  uniform float uBetaGround;
  uniform float uBetaAir;
  uniform float uDistFalloff;
  uniform float uMaxDist;
  uniform float uMaxAlpha;
  uniform float uHalfExtent;
  uniform sampler2D uFloorMask;
  uniform vec2 uWorldMin;
  uniform vec2 uWorldSize;
  uniform vec2 uBoxCenter;

  varying vec3 vWorldPos;

  float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 m = mat2(0.8, -0.6, 0.6, 0.8);
    for (int i = 0; i < 4; i++) {
      v += a * valueNoise(p);
      p = m * p * 2.03;
      a *= 0.5;
    }
    return v;
  }

  float floorMaskAt(vec2 worldXZ) {
    vec2 uv = (worldXZ - uWorldMin) / uWorldSize;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
    return texture2D(uFloorMask, uv).r;
  }

  bool rayBox(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax, out float t0, out float t1) {
    vec3 inv = vec3(
      abs(rd.x) > 1e-5 ? 1.0 / rd.x : 1e6 * sign(rd.x + 1e-6),
      abs(rd.y) > 1e-5 ? 1.0 / rd.y : 1e6 * sign(rd.y + 1e-6),
      abs(rd.z) > 1e-5 ? 1.0 / rd.z : 1e6 * sign(rd.z + 1e-6)
    );
    vec3 tbot = (bmin - ro) * inv;
    vec3 ttop = (bmax - ro) * inv;
    vec3 tminv = min(tbot, ttop);
    vec3 tmaxv = max(tbot, ttop);
    t0 = max(max(tminv.x, tminv.y), tminv.z);
    t1 = min(min(tmaxv.x, tmaxv.y), tmaxv.z);
    return t1 > max(t0, 0.0);
  }

  // Soft oval-ish window (feather starts earlier → no box silhouette).
  float localWindow(vec2 worldXZ) {
    vec2 d = (worldXZ - uBoxCenter) / uHalfExtent;
    float r = length(d);
    return 1.0 - smoothstep(0.55, 1.0, r);
  }

  // Integral of A * exp(-C * t) from tEnter over length T.
  float integrateExp(float A, float C, float tEnter, float T) {
    float A1 = A * exp(-C * tEnter);
    if (abs(C) < 1e-4) return A1 * T;
    return A1 * (1.0 - exp(-C * T)) / C;
  }

  // Dual-layer height density at a world Y (for soft noise modulation samples).
  float heightDensity(float y) {
    float yg = max(y, 0.0);
    return 0.52 * exp(-uBetaGround * yg) + 0.48 * exp(-uBetaAir * yg);
  }

  void main() {
    vec3 ro = cameraPosition;
    vec3 rd = normalize(vWorldPos - ro);

    vec3 bmin = vec3(uBoxCenter.x - uHalfExtent, 0.0, uBoxCenter.y - uHalfExtent);
    vec3 bmax = vec3(uBoxCenter.x + uHalfExtent, uHeight, uBoxCenter.y + uHalfExtent);

    float t0;
    float t1;
    if (!rayBox(ro, rd, bmin, bmax, t0, t1)) discard;
    float tEnter = max(t0, 0.0);
    float tExit = min(min(t1, uMaxDist), tEnter + uMaxDist);
    if (tExit <= tEnter + 0.02) discard;

    float gamma = uDistFalloff;
    float y0 = max(ro.y, 0.0);
    float T = tExit - tEnter;

    // Soft large-scale wisps (view-stable enough to avoid crawling noise).
    vec2 drift = vec2(uTime * 0.01, -uTime * 0.0075);
    float n = fbm(ro.xz * 0.038 + rd.xz * 1.25 + drift);
    float n2 = fbm(ro.xz * 0.09 - rd.xz * 0.6 + drift.yx * 1.3 + 4.0);
    float wisp = 0.78 + 0.28 * n + 0.12 * n2;
    float rho0 = uDensity * wisp;

    /*
     * Dual analytical height fog (continuous, no cliffs):
     * ground layer: thick low soup   β_g large
     * air layer:    soft tall haze   β_a small
     * ρ(t) = Σ w_i · ρ0 · exp(−β_i · y(t)) · exp(−γ · t)
     */
    float optical =
      integrateExp(rho0 * 0.52 * exp(-uBetaGround * y0), uBetaGround * rd.y + gamma, tEnter, T)
      + integrateExp(rho0 * 0.48 * exp(-uBetaAir * y0), uBetaAir * rd.y + gamma, tEnter, T);

    // Soft mask / window + light height-aware noise along the ray.
    float maskAcc = 0.0;
    float winAcc = 0.0;
    float detailAcc = 0.0;
    const int SAMPLES = 8;
    for (int i = 0; i < SAMPLES; i++) {
      float ft = (float(i) + 0.5) / float(SAMPLES);
      // Slight ease so samples prefer mid-path (where fog reads best).
      float u = ft * ft * (3.0 - 2.0 * ft);
      float tt = tEnter + T * u;
      vec3 p = ro + rd * tt;
      maskAcc += floorMaskAt(p.xz);
      winAcc += localWindow(p.xz);
      float hd = heightDensity(p.y);
      float dn = fbm(p.xz * 0.07 + vec2(p.y * 0.2, uTime * 0.02));
      // Detail stronger near the floor, dies with height (keeps upper fade clean).
      detailAcc += (0.88 + 0.22 * dn) * mix(1.0, 0.55, clamp(p.y / max(uHeight, 0.001), 0.0, 1.0)) * hd;
    }
    float mask = maskAcc / float(SAMPLES);
    float window = winAcc / float(SAMPLES);
    float detail = detailAcc / float(SAMPLES);
    if (mask * window < 0.018) discard;

    // Near-lens soft kill so the player is not inside a fog blob.
    float nearSoft = smoothstep(0.2, 1.4, tEnter + T * 0.35);

    optical *= mask * window * nearSoft;
    // Blend analytical body with soft detail (never binary).
    optical *= mix(0.9, 1.18, clamp(detail, 0.0, 1.5));

    // Looking upward thins a bit more (sells the vertical gradient in silhouette).
    float up = clamp(rd.y, 0.0, 1.0);
    optical *= 1.0 - up * 0.22;

    float alpha = 1.0 - exp(-max(optical, 0.0));
    // Soft film response — long toe, no hard max wall.
    alpha = uMaxAlpha * (1.0 - exp(-1.35 * alpha));

    float bayer = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    alpha += (bayer - 0.5) * 0.004;

    if (alpha < 0.005) discard;

    // Slightly deepen color with optical depth (haze denser → a touch cooler/darker).
    vec3 col = mix(uColor * 1.06, uColor * 0.88, clamp(alpha / max(uMaxAlpha, 0.001), 0.0, 1.0));
    gl_FragColor = vec4(col, alpha);
  }
`;

function createSoftGroundFogMaterial(
  color: THREE.Color,
  density: number,
  mask: THREE.DataTexture,
  worldMin: THREE.Vector2,
  worldSize: THREE.Vector2,
  wallHeight: number,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: SOFT_FOG_VERTEX,
    fragmentShader: SOFT_FOG_FRAGMENT,
    uniforms: {
      uColor: { value: color },
      uDensity: { value: density },
      uHeight: { value: wallHeight },
      uTime: { value: 0 },
      uBetaGround: { value: SOFT_FOG_HEIGHT_FALLOFF_GROUND },
      uBetaAir: { value: SOFT_FOG_HEIGHT_FALLOFF_AIR },
      uDistFalloff: { value: SOFT_FOG_DIST_FALLOFF },
      uMaxDist: { value: SOFT_FOG_MAX_DIST },
      uMaxAlpha: { value: SOFT_FOG_MAX_ALPHA },
      uHalfExtent: { value: SOFT_FOG_LOCAL_HALF },
      uFloorMask: { value: mask },
      uWorldMin: { value: worldMin },
      uWorldSize: { value: worldSize },
      uBoxCenter: { value: new THREE.Vector2(0, 0) },
    },
    transparent: true,
    depthWrite: false,
    // Inside volume; shell would lose to wall depth. Short local range keeps it honest.
    depthTest: false,
    side: THREE.BackSide,
    fog: false,
    toneMapped: false,
    blending: THREE.NormalBlending,
  });
}

interface MoteCloud {
  points: THREE.Points;
  material: THREE.ShaderMaterial;
  baseY: Float32Array;
  count: number;
}

function createDustMoteMaterial(
  map: THREE.Texture,
  color: number,
  opacity: number,
  driftAmplitude = 0.08,
  driftSpeed = 0.45,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: map },
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uTime: { value: 0 },
      uPixelRatio: {
        value: typeof window !== "undefined" ? Math.min(window.devicePixelRatio, 1.5) : 1,
      },
      uAtten: { value: 280 },
      uDriftAmp: { value: driftAmplitude },
      uDriftSpeed: { value: driftSpeed },
    },
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aPhase;
      uniform float uTime;
      uniform float uOpacity;
      uniform float uPixelRatio;
      uniform float uAtten;
      uniform float uDriftAmp;
      uniform float uDriftSpeed;
      varying float vAlpha;

      void main() {
        // Each mote cycles on its own phase: visible, then soft vanish, then return.
        float speed = 0.09 + aPhase * 0.11;
        float t = fract(uTime * speed + aPhase);
        float appear = smoothstep(0.0, 0.14, t);
        float vanish = 1.0 - smoothstep(0.58, 0.82, t);
        // Dead zone after vanish so dust "disappears for a while".
        float alive = appear * vanish;
        vAlpha = uOpacity * alive * (0.55 + 0.45 * aPhase);

        // Vertical drift on GPU — avoids rewriting position buffers every frame.
        vec3 pos = position;
        pos.y += sin(uTime * uDriftSpeed + aPhase * 6.2831853) * uDriftAmp;
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        float depth = max(0.35, -mvPosition.z);
        gl_PointSize = aSize * uAtten * uPixelRatio / depth;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform vec3 uColor;
      varying float vAlpha;

      void main() {
        if (vAlpha < 0.01) discard;
        vec4 tex = texture2D(map, gl_PointCoord);
        float a = tex.a * vAlpha;
        if (a < 0.02) discard;
        gl_FragColor = vec4(uColor * tex.rgb, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    fog: false,
    toneMapped: false,
  });
}

export class AtmosphereSystem {
  readonly stats = { mistBanks: 0, motes: 0, groundFogTiles: 0 };
  private readonly group = new THREE.Group();
  private readonly mistTexture = createMistTexture();
  private readonly dustTexture = createDustTexture();
  private readonly mistBanks: MistBank[] = [];
  private softGroundFog: SoftGroundFog | null = null;
  private motes: THREE.Points | null = null;
  private fineMotes: THREE.Points | null = null;
  private moteMaterial: THREE.ShaderMaterial | null = null;
  private fineMoteMaterial: THREE.ShaderMaterial | null = null;
  private elapsed = 0;
  private readonly wallHeight: number;
  private readonly viewer = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly tileSize: number,
    wallHeight: number = SOFT_FOG_DEFAULT_WALL_HEIGHT,
  ) {
    this.wallHeight = wallHeight;
    this.group.name = "Dungeon atmosphere";
    scene.add(this.group);
  }

  setDungeon(dungeon: DungeonData, mood: DungeonMood = getDungeonMood("ash")): void {
    this.clear();
    this.elapsed = 0;
    const random = createSeededRandom(`${dungeon.seed}:atmosphere`);
    const rooms = [...dungeon.rooms].sort((a, b) => b.width * b.height - a.width * a.height);

    // Soft wisps through the column — dual-layer height bias (ground + air).
    const bankCount = Math.min(18, Math.max(9, Math.round(rooms.length * 0.6)));
    const wispColor = fogVolumeColor(mood);
    for (let index = 0; index < bankCount; index += 1) {
      const room = rooms[index % Math.max(1, rooms.length)];
      if (!room) continue;
      const center = gridToWorld(dungeon, room.center, this.tileSize);
      // Prefer lower/mid air (matches ground+air exponentials).
      const heightT = Math.pow(random.next(), 1.25);
      const baseY = 0.2 + heightT * (this.wallHeight * 0.88);
      const heightFade =
        0.52 * Math.exp(-SOFT_FOG_HEIGHT_FALLOFF_GROUND * baseY) +
        0.48 * Math.exp(-SOFT_FOG_HEIGHT_FALLOFF_AIR * baseY);
      const baseOpacity = (0.018 + heightFade * 0.055) * mood.dustOpacityScale;
      const material = new THREE.SpriteMaterial({
        map: this.mistTexture,
        color: wispColor,
        transparent: true,
        opacity: baseOpacity,
        depthWrite: false,
        depthTest: true,
        fog: false,
        toneMapped: false,
        blending: THREE.NormalBlending,
      });
      const sprite = new THREE.Sprite(material);
      sprite.position.set(
        center.x + (random.next() - 0.5) * room.width * this.tileSize * 0.48,
        baseY,
        center.z + (random.next() - 0.5) * room.height * this.tileSize * 0.48,
      );
      const scale = 4.0 + random.next() * 3.8 + heightFade * 2.0;
      sprite.scale.set(scale, scale * (0.42 + heightFade * 0.28), 1);
      sprite.renderOrder = 1;
      this.group.add(sprite);
      this.mistBanks.push({ sprite, baseY, phase: index * 1.71, baseOpacity });
    }

    const floorCells: GridCell[] = [];
    for (let y = 0; y < dungeon.height; y += 1) {
      for (let x = 0; x < dungeon.width; x += 1)
        if (dungeon.grid[y]?.[x] === FLOOR) floorCells.push({ x, y });
    }

    this.addSoftGroundFog(dungeon, floorCells, mood);

    const dustScale = mood.dustOpacityScale;
    const coarse = this.createMoteCloud(
      dungeon,
      floorCells,
      random,
      Math.min(
        DUST_COARSE_MAX,
        Math.max(DUST_COARSE_MIN, Math.round(floorCells.length * DUST_COARSE_PER_FLOOR)),
      ),
      DUST_COARSE_SIZE_MIN,
      DUST_COARSE_SIZE_MAX,
      DUST_COARSE_OPACITY * dustScale,
      "Lit dungeon dust motes",
      mood.dustColor,
      0.07,
      0.4,
    );
    const fine = this.createMoteCloud(
      dungeon,
      floorCells,
      random,
      Math.min(
        DUST_FINE_MAX,
        Math.max(DUST_FINE_MIN, Math.round(floorCells.length * DUST_FINE_PER_FLOOR)),
      ),
      DUST_FINE_SIZE_MIN,
      DUST_FINE_SIZE_MAX,
      DUST_FINE_OPACITY * dustScale,
      "Fine floating dust",
      mood.dustFineColor,
      0.11,
      0.55,
    );
    this.motes = coarse.points;
    this.fineMotes = fine.points;
    this.moteMaterial = coarse.material;
    this.fineMoteMaterial = fine.material;
    this.group.add(this.motes, this.fineMotes);
    this.stats.mistBanks = this.mistBanks.length;
    this.stats.motes = coarse.count + fine.count;
  }

  /**
   * @param viewerPosition Player/camera XZ follow target for the local fog volume.
   */
  update(delta: number, viewerPosition?: THREE.Vector3Like): void {
    this.elapsed += delta;
    if (viewerPosition) {
      this.viewer.set(viewerPosition.x, viewerPosition.y, viewerPosition.z);
      if (this.softGroundFog) {
        this.softGroundFog.mesh.position.x = viewerPosition.x;
        this.softGroundFog.mesh.position.z = viewerPosition.z;
        this.softGroundFog.mesh.position.y = this.wallHeight * 0.5;
        this.softGroundFog.material.uniforms.uBoxCenter.value.set(
          viewerPosition.x,
          viewerPosition.z,
        );
      }
    }
    for (const bank of this.mistBanks) {
      bank.sprite.position.y = bank.baseY + Math.sin(this.elapsed * 0.34 + bank.phase) * 0.1;
      bank.sprite.material.opacity =
        bank.baseOpacity + (Math.sin(this.elapsed * 0.47 + bank.phase) * 0.5 + 0.5) * 0.02;
    }
    if (this.softGroundFog) {
      this.softGroundFog.material.uniforms.uTime.value = this.elapsed;
      const pulse = 1 + Math.sin(this.elapsed * 0.17) * 0.03;
      this.softGroundFog.material.uniforms.uDensity.value = this.softGroundFog.baseDensity * pulse;
    }
    // Mote vertical drift is GPU-side (uTime + uDriftAmp); only tick uniforms.
    if (this.moteMaterial) this.moteMaterial.uniforms.uTime.value = this.elapsed;
    if (this.fineMoteMaterial) this.fineMoteMaterial.uniforms.uTime.value = this.elapsed;
    if (this.motes) this.motes.rotation.y = Math.sin(this.elapsed * 0.035) * 0.05;
    if (this.fineMotes) this.fineMotes.rotation.y = Math.sin(this.elapsed * 0.05 + 1.2) * -0.04;
  }

  dispose(): void {
    this.clear();
    this.mistTexture.dispose();
    this.dustTexture.dispose();
    this.scene.remove(this.group);
  }

  private addSoftGroundFog(
    dungeon: DungeonData,
    floorCells: readonly GridCell[],
    mood: DungeonMood,
  ): void {
    if (floorCells.length === 0) return;

    const worldMin = new THREE.Vector2(
      -(dungeon.width * this.tileSize) / 2,
      -(dungeon.height * this.tileSize) / 2,
    );
    const worldSize = new THREE.Vector2(
      dungeon.width * this.tileSize,
      dungeon.height * this.tileSize,
    );

    const mask = createFloorMaskTexture(dungeon);
    // Local box: follows player each frame; height = full wall column.
    const side = SOFT_FOG_LOCAL_HALF * 2;
    const geometry = new THREE.BoxGeometry(side, this.wallHeight, side);

    const baseDensity = SOFT_FOG_DENSITY * mood.volumeFogMul;
    const material = createSoftGroundFogMaterial(
      fogVolumeColor(mood),
      baseDensity,
      mask,
      worldMin,
      worldSize,
      this.wallHeight,
    );

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "Soft volumetric ground fog";
    mesh.position.set(0, this.wallHeight * 0.5, 0);
    mesh.renderOrder = 3;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.softGroundFog = { mesh, material, baseDensity, mask };
    this.stats.groundFogTiles = floorCells.length;
  }

  private createMoteCloud(
    dungeon: DungeonData,
    floorCells: readonly GridCell[],
    random: ReturnType<typeof createSeededRandom>,
    count: number,
    sizeMin: number,
    sizeMax: number,
    opacity: number,
    name: string,
    color: number,
    driftAmplitude: number,
    driftSpeed: number,
  ): MoteCloud {
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const baseY = new Float32Array(count);
    const sizeSpan = Math.max(0, sizeMax - sizeMin);
    for (let index = 0; index < count; index += 1) {
      const cell = random.pick(floorCells);
      const point = gridToWorld(dungeon, cell, this.tileSize);
      // Bias motes downward so the vertical gradient reads in particles too.
      const y = 0.15 + Math.pow(random.next(), 1.4) * (this.wallHeight * 0.9);
      positions[index * 3] = point.x + (random.next() - 0.5) * this.tileSize;
      positions[index * 3 + 1] = y;
      positions[index * 3 + 2] = point.z + (random.next() - 0.5) * this.tileSize;
      baseY[index] = y;
      // Bias toward smaller flecks; a few larger motes still appear.
      const sizeT = Math.pow(random.next(), 1.35);
      sizes[index] = sizeMin + sizeSpan * sizeT;
      phases[index] = random.next();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    const material = createDustMoteMaterial(
      this.dustTexture,
      color,
      opacity,
      driftAmplitude,
      driftSpeed,
    );
    const points = new THREE.Points(geometry, material);
    points.name = name;
    points.frustumCulled = false;
    return { points, material, baseY, count };
  }

  private clear(): void {
    if (this.softGroundFog) {
      this.softGroundFog.mask.dispose();
      this.softGroundFog = null;
    }
    while (this.group.children.length > 0) {
      const child = this.group.children[0]!;
      this.group.remove(child);
      if (child instanceof THREE.InstancedMesh || child instanceof THREE.Mesh) {
        child.geometry.dispose();
        const material = child.material;
        const materials = Array.isArray(material) ? material : [material];
        for (const entry of materials) entry.dispose();
        continue;
      }
      const object = child as THREE.Points | THREE.Sprite;
      if ((object as THREE.Points).isPoints) (object as THREE.Points).geometry.dispose();
      const material = object.material;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else material?.dispose();
    }
    this.mistBanks.length = 0;
    this.motes = null;
    this.fineMotes = null;
    this.moteMaterial = null;
    this.fineMoteMaterial = null;

    this.stats.mistBanks = 0;
    this.stats.motes = 0;
    this.stats.groundFogTiles = 0;
  }
}
