import * as THREE from "three";

import { FLOOR } from "../dungeon/generateDungeon";
import type { DungeonData, GridCell } from "../dungeon/types";

export const MAGIC_PORTAL_ENTRY_RADIUS = 0.7;

export const MAGIC_PORTAL_NAMES = Object.freeze({
  interior: "Portal magic interior",
  veil: "Portal veil",
  vortex: "Portal vortex field",
  spiral: "Portal spiral",
  runeRing: "Portal rune ring",
});

const PORTAL_CENTER_Y = 1.65;

const PORTAL_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PORTAL_FRAGMENT_SHADER = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime;

  void main() {
    vec2 point = vUv * 2.0 - 1.0;
    float radius = length(point);
    float angle = atan(point.y, point.x);
    float disc = 1.0 - smoothstep(0.76, 1.0, radius);
    float spiral = 0.5 + 0.5 * sin(angle * 3.0 - radius * 18.0 + uTime * 2.1);
    spiral = spiral * spiral * spiral;
    float core = 1.0 - smoothstep(0.0, 0.32, radius);
    float pulse = 0.88 + sin(uTime * 2.7 - radius * 7.0) * 0.12;
    vec3 deepColor = vec3(0.035, 0.075, 0.18);
    vec3 magicColor = vec3(0.22, 0.68, 1.0);
    vec3 color = mix(deepColor, magicColor, spiral * 0.84 + core * 0.35);
    float alpha = disc * (0.32 + spiral * 0.56 + core * 0.18) * pulse;
    gl_FragColor = vec4(color, alpha);
  }
`;

export interface MagicPortalInterior {
  root: THREE.Group;
  veil: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  vortex: THREE.Mesh<THREE.CircleGeometry, THREE.ShaderMaterial>;
  spiral: THREE.Mesh<THREE.TubeGeometry, THREE.MeshBasicMaterial>;
  runeRing: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
}

function createSpiralGeometry(): THREE.TubeGeometry {
  const points: THREE.Vector3[] = [];
  const segments = 72;
  const turns = Math.PI * 5.5;
  for (let index = 0; index <= segments; index += 1) {
    const progress = index / segments;
    const angle = progress * turns;
    const radius = 0.055 + progress * 0.69;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 96, 0.018, 5, false);
}

/** Animated layers mounted inside the fixed stone portal frame. */
export function createMagicPortalInterior(): MagicPortalInterior {
  const root = new THREE.Group();
  root.name = MAGIC_PORTAL_NAMES.interior;
  root.position.set(0, PORTAL_CENTER_Y, 0.025);
  root.visible = false;

  const veil = new THREE.Mesh(
    new THREE.CircleGeometry(0.87, 40),
    new THREE.MeshBasicMaterial({
      color: 0x102342,
      transparent: true,
      opacity: 0.62,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  veil.name = MAGIC_PORTAL_NAMES.veil;
  veil.renderOrder = 2;

  const vortex = new THREE.Mesh(
    new THREE.CircleGeometry(0.83, 40),
    new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: PORTAL_VERTEX_SHADER,
      fragmentShader: PORTAL_FRAGMENT_SHADER,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  vortex.name = MAGIC_PORTAL_NAMES.vortex;
  vortex.position.z = 0.018;
  vortex.renderOrder = 3;

  const spiral = new THREE.Mesh(
    createSpiralGeometry(),
    new THREE.MeshBasicMaterial({
      color: 0x8bdcff,
      transparent: true,
      opacity: 0.86,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  spiral.name = MAGIC_PORTAL_NAMES.spiral;
  spiral.position.z = 0.055;
  spiral.renderOrder = 4;

  const runeRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.79, 0.022, 5, 48),
    new THREE.MeshBasicMaterial({
      color: 0xa6e6ff,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  runeRing.name = MAGIC_PORTAL_NAMES.runeRing;
  runeRing.position.z = 0.064;
  runeRing.renderOrder = 4;

  root.add(veil, vortex, spiral, runeRing);
  return { root, veil, vortex, spiral, runeRing };
}

export function setMagicPortalOpen(portalRoot: THREE.Object3D, open: boolean): void {
  const interior = portalRoot.getObjectByName(MAGIC_PORTAL_NAMES.interior);
  if (interior) interior.visible = open;
  portalRoot.userData.portalOpen = open;
}

export function setMagicPortalWarmupVisible(
  portalRoot: THREE.Object3D,
  visible: boolean,
  open: boolean,
): void {
  const interior = portalRoot.getObjectByName(MAGIC_PORTAL_NAMES.interior);
  if (interior) interior.visible = visible || open;
}

export function updateMagicPortal(portalRoot: THREE.Object3D, elapsed: number): void {
  const interior = portalRoot.getObjectByName(MAGIC_PORTAL_NAMES.interior);
  if (!interior?.visible) return;

  const vortex = portalRoot.getObjectByName(MAGIC_PORTAL_NAMES.vortex);
  if (vortex instanceof THREE.Mesh && vortex.material instanceof THREE.ShaderMaterial) {
    vortex.material.uniforms.uTime!.value = elapsed;
    vortex.rotation.z = elapsed * 0.12;
  }

  const spiral = portalRoot.getObjectByName(MAGIC_PORTAL_NAMES.spiral);
  if (spiral instanceof THREE.Mesh) {
    spiral.rotation.z = -elapsed * 0.58;
    spiral.scale.setScalar(0.98 + Math.sin(elapsed * 2.4) * 0.025);
  }

  const runeRing = portalRoot.getObjectByName(MAGIC_PORTAL_NAMES.runeRing);
  if (runeRing instanceof THREE.Mesh) runeRing.rotation.z = elapsed * 0.26;

  const veil = portalRoot.getObjectByName(MAGIC_PORTAL_NAMES.veil);
  if (veil instanceof THREE.Mesh && veil.material instanceof THREE.MeshBasicMaterial) {
    veil.material.opacity = 0.57 + Math.sin(elapsed * 3.1) * 0.07;
  }
}

/** Exit requires crossing the bright center, not touching any point in the exit cell. */
export function isInsideMagicPortal(
  player: Pick<THREE.Vector3Like, "x" | "z">,
  portalCenter: Pick<THREE.Vector3Like, "x" | "z">,
  atExit: boolean,
): boolean {
  if (!atExit) return false;
  return (
    Math.hypot(player.x - portalCenter.x, player.z - portalCenter.z) <= MAGIC_PORTAL_ENTRY_RADIUS
  );
}

function reachableApproachCells(dungeon: DungeonData): GridCell[] {
  const exitDistance =
    dungeon.distances[dungeon.exit.y * dungeon.width + dungeon.exit.x] ?? Number.POSITIVE_INFINITY;
  return [
    { x: dungeon.exit.x + 1, y: dungeon.exit.y },
    { x: dungeon.exit.x - 1, y: dungeon.exit.y },
    { x: dungeon.exit.x, y: dungeon.exit.y + 1 },
    { x: dungeon.exit.x, y: dungeon.exit.y - 1 },
  ]
    .filter((cell) => dungeon.grid[cell.y]?.[cell.x] === FLOOR)
    .filter((cell) => {
      const distance = dungeon.distances[cell.y * dungeon.width + cell.x] ?? -1;
      return distance >= 0 && distance < exitDistance;
    })
    .sort((left, right) => {
      const leftDistance = dungeon.distances[left.y * dungeon.width + left.x] ?? -1;
      const rightDistance = dungeon.distances[right.y * dungeon.width + right.x] ?? -1;
      return rightDistance - leftDistance;
    });
}

/** Face the portal toward the route used to enter the exit room. */
export function magicPortalApproachYaw(dungeon: DungeonData): number {
  const approach = reachableApproachCells(dungeon)[0] ?? dungeon.spawn;
  const normalX = approach.x - dungeon.exit.x;
  const normalZ = approach.y - dungeon.exit.y;
  return Math.atan2(normalX, normalZ);
}
