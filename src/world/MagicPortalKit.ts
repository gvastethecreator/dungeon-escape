import * as THREE from "three";

import { FLOOR } from "../dungeon/generateDungeon";
import type { DungeonData, GridCell } from "../dungeon/types";

export const MAGIC_PORTAL_ENTRY_RADIUS = 0.7;

/** Matches the clear opening inside the fixed stone frame in StaticDungeonScene. */
export const MAGIC_PORTAL_APERTURE = Object.freeze({
  halfWidth: 0.7,
  baseY: 0.2,
  shoulderY: 2.52,
  apexY: 3.22,
});

export const MAGIC_PORTAL_NAMES = Object.freeze({
  interior: "Portal magic interior",
  veil: "Portal veil",
  vortex: "Portal vortex field",
  spiral: "Portal spiral current",
  runeArch: "Portal rune arch",
  runes: "Portal arch runes",
});

const PORTAL_HEIGHT = MAGIC_PORTAL_APERTURE.apexY - MAGIC_PORTAL_APERTURE.baseY;
const PORTAL_SHOULDER_UV =
  (MAGIC_PORTAL_APERTURE.shoulderY - MAGIC_PORTAL_APERTURE.baseY) / PORTAL_HEIGHT;
const PORTAL_HEIGHT_TO_RADIUS = PORTAL_HEIGHT / MAGIC_PORTAL_APERTURE.halfWidth;

const PORTAL_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PORTAL_APERTURE_GLSL = /* glsl */ `
  float apertureEdgeDistance(vec2 uv) {
    float normalizedX = (uv.x - 0.5) * 2.0;
    float sideDistance = 1.0 - abs(normalizedX);
    float bottomDistance = uv.y * 2.0;
    if (uv.y <= ${PORTAL_SHOULDER_UV.toFixed(8)}) {
      return min(sideDistance, bottomDistance);
    }
    float archY = (uv.y - ${PORTAL_SHOULDER_UV.toFixed(8)}) * ${PORTAL_HEIGHT_TO_RADIUS.toFixed(8)};
    return 1.0 - length(vec2(normalizedX, archY));
  }
`;

const PORTAL_FIELD_FRAGMENT_SHADER = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime;

  ${PORTAL_APERTURE_GLSL}

  void main() {
    vec2 point = vec2((vUv.x - 0.5) * 1.42, (vUv.y - 0.46) * 2.15);
    float radius = length(point);
    float angle = atan(point.y, point.x);
    float broadFlow = 0.5 + 0.5 * sin(angle * 3.0 - radius * 13.0 + uTime * 1.75);
    float counterFlow = 0.5 + 0.5 * sin(angle * 5.0 + radius * 9.0 - uTime * 1.15);
    float current = pow(broadFlow, 2.2) * 0.72 + pow(counterFlow, 4.0) * 0.28;
    float depthPulse = 0.9 + sin(uTime * 2.3 - radius * 5.0) * 0.1;
    float edgeGlow = 1.0 - smoothstep(0.0, 0.16, apertureEdgeDistance(vUv));
    float core = exp(-radius * 2.6);
    vec3 deepColor = vec3(0.018, 0.045, 0.14);
    vec3 magicColor = vec3(0.08, 0.48, 0.96);
    vec3 brightColor = vec3(0.44, 0.84, 1.0);
    vec3 color = mix(deepColor, magicColor, current * 0.82 + core * 0.14);
    color = mix(color, brightColor, edgeGlow * 0.42);
    float alpha = (0.5 + current * 0.36 + edgeGlow * 0.12) * depthPulse;
    gl_FragColor = vec4(color, alpha);
  }
`;

const PORTAL_SPIRAL_FRAGMENT_SHADER = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime;

  ${PORTAL_APERTURE_GLSL}

  void main() {
    vec2 point = vec2((vUv.x - 0.5) * 1.42, (vUv.y - 0.46) * 2.15);
    float radius = length(point);
    float angle = atan(point.y, point.x);
    float primaryWave = 0.5 + 0.5 * sin(angle * 3.0 - radius * 13.0 + uTime * 1.75);
    float secondaryWave = 0.5 + 0.5 * sin(angle * 6.0 - radius * 20.0 + uTime * 1.2);
    float primary = smoothstep(0.86, 0.99, primaryWave);
    float secondary = smoothstep(0.94, 0.995, secondaryWave) * 0.38;
    float edgeEcho = 1.0 - smoothstep(0.0, 0.055, apertureEdgeDistance(vUv));
    float pulse = 0.84 + sin(uTime * 2.8 - radius * 4.0) * 0.16;
    float alpha = min(1.0, primary + secondary + edgeEcho * 0.24) * pulse * 0.82;
    vec3 color = mix(vec3(0.18, 0.62, 1.0), vec3(0.78, 0.95, 1.0), primary);
    gl_FragColor = vec4(color, alpha);
  }
`;

export interface MagicPortalInterior {
  root: THREE.Group;
  veil: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>;
  vortex: THREE.Mesh<THREE.ShapeGeometry, THREE.ShaderMaterial>;
  spiral: THREE.Mesh<THREE.ShapeGeometry, THREE.ShaderMaterial>;
  runeArch: THREE.Mesh<THREE.TubeGeometry, THREE.MeshBasicMaterial>;
  runes: THREE.InstancedMesh<THREE.OctahedronGeometry, THREE.MeshBasicMaterial>;
}

function createPortalApertureShape(inset = 0): THREE.Shape {
  const halfWidth = MAGIC_PORTAL_APERTURE.halfWidth - inset;
  const baseY = MAGIC_PORTAL_APERTURE.baseY + inset;
  const shoulderY = MAGIC_PORTAL_APERTURE.shoulderY;
  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth, baseY);
  shape.lineTo(halfWidth, baseY);
  shape.lineTo(halfWidth, shoulderY);
  shape.absarc(0, shoulderY, halfWidth, 0, Math.PI, false);
  shape.lineTo(-halfWidth, baseY);
  shape.closePath();
  return shape;
}

/** Full door aperture with normalized UVs for shader layers. */
export function createPortalApertureGeometry(inset = 0): THREE.ShapeGeometry {
  const geometry = new THREE.ShapeGeometry(createPortalApertureShape(inset), 32);
  geometry.name = "Magic portal door aperture geometry";
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  const halfWidth = MAGIC_PORTAL_APERTURE.halfWidth - inset;
  const baseY = MAGIC_PORTAL_APERTURE.baseY + inset;
  const height = MAGIC_PORTAL_APERTURE.shoulderY + halfWidth - baseY;
  for (let index = 0; index < position.count; index += 1) {
    uv.setXY(
      index,
      (position.getX(index) + halfWidth) / (halfWidth * 2),
      (position.getY(index) - baseY) / height,
    );
  }
  uv.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

class PortalBoundaryCurve extends THREE.Curve<THREE.Vector3> {
  constructor(private readonly inset: number) {
    super();
  }

  override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const halfWidth = MAGIC_PORTAL_APERTURE.halfWidth - this.inset;
    const baseY = MAGIC_PORTAL_APERTURE.baseY + this.inset;
    const shoulderY = MAGIC_PORTAL_APERTURE.shoulderY;
    const bottomLength = halfWidth * 2;
    const sideLength = shoulderY - baseY;
    const archLength = Math.PI * halfWidth;
    const totalLength = bottomLength + sideLength * 2 + archLength;
    let distance = THREE.MathUtils.clamp(t, 0, 1) * totalLength;

    if (distance <= bottomLength) return target.set(-halfWidth + distance, baseY, 0);
    distance -= bottomLength;
    if (distance <= sideLength) return target.set(halfWidth, baseY + distance, 0);
    distance -= sideLength;
    if (distance <= archLength) {
      const angle = distance / halfWidth;
      return target.set(Math.cos(angle) * halfWidth, shoulderY + Math.sin(angle) * halfWidth, 0);
    }
    distance -= archLength;
    return target.set(-halfWidth, shoulderY - Math.min(distance, sideLength), 0);
  }
}

/** Reusable trim that follows the rectangular sides and curved crown. */
export function createPortalApertureOutlineGeometry(
  tubeRadius: number,
  inset = 0,
): THREE.TubeGeometry {
  const geometry = new THREE.TubeGeometry(new PortalBoundaryCurve(inset), 72, tubeRadius, 5, true);
  geometry.name = "Magic portal aperture outline geometry";
  return geometry;
}

function createPortalRunes(
  material: THREE.MeshBasicMaterial,
): THREE.InstancedMesh<THREE.OctahedronGeometry, THREE.MeshBasicMaterial> {
  const geometry = new THREE.OctahedronGeometry(0.045, 0);
  geometry.name = "Magic portal rune geometry";
  const count = 14;
  const runes = new THREE.InstancedMesh(geometry, material, count);
  runes.name = MAGIC_PORTAL_NAMES.runes;
  const curve = new PortalBoundaryCurve(0.055);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();
  for (let index = 0; index < count; index += 1) {
    const progress = (index + 0.5) / count;
    curve.getPoint(progress, position);
    const tangent = curve.getTangent(progress);
    euler.set(0, 0, Math.atan2(tangent.y, tangent.x) + Math.PI / 4);
    quaternion.setFromEuler(euler);
    const size = index % 2 === 0 ? 1 : 0.72;
    scale.set(size, size * 1.24, 0.65);
    matrix.compose(position, quaternion, scale);
    runes.setMatrixAt(index, matrix);
  }
  runes.instanceMatrix.needsUpdate = true;
  runes.computeBoundingBox();
  runes.computeBoundingSphere();
  runes.renderOrder = 5;
  return runes;
}

function portalShaderMaterial(fragmentShader: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: PORTAL_VERTEX_SHADER,
    fragmentShader,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

/** Animated layers fill the whole arch instead of forming a disc in its center. */
export function createMagicPortalInterior(): MagicPortalInterior {
  const root = new THREE.Group();
  root.name = MAGIC_PORTAL_NAMES.interior;
  root.position.z = 0.025;
  root.visible = false;

  const apertureGeometry = createPortalApertureGeometry();
  const veil = new THREE.Mesh(
    apertureGeometry,
    new THREE.MeshBasicMaterial({
      color: 0x07142e,
      transparent: true,
      opacity: 0.76,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  veil.name = MAGIC_PORTAL_NAMES.veil;
  veil.renderOrder = 2;

  const vortex = new THREE.Mesh(
    apertureGeometry,
    portalShaderMaterial(PORTAL_FIELD_FRAGMENT_SHADER),
  );
  vortex.name = MAGIC_PORTAL_NAMES.vortex;
  vortex.position.z = 0.014;
  vortex.renderOrder = 3;

  const spiral = new THREE.Mesh(
    apertureGeometry,
    portalShaderMaterial(PORTAL_SPIRAL_FRAGMENT_SHADER),
  );
  spiral.name = MAGIC_PORTAL_NAMES.spiral;
  spiral.position.z = 0.032;
  spiral.renderOrder = 4;

  const runeMaterial = new THREE.MeshBasicMaterial({
    color: 0x9ce5ff,
    transparent: true,
    opacity: 0.76,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const runeArch = new THREE.Mesh(createPortalApertureOutlineGeometry(0.014, 0.045), runeMaterial);
  runeArch.name = MAGIC_PORTAL_NAMES.runeArch;
  runeArch.position.z = 0.052;
  runeArch.renderOrder = 5;

  const runes = createPortalRunes(runeMaterial);
  runes.position.z = 0.057;

  root.add(veil, vortex, spiral, runeArch, runes);
  return { root, veil, vortex, spiral, runeArch, runes };
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

  for (const name of [MAGIC_PORTAL_NAMES.vortex, MAGIC_PORTAL_NAMES.spiral]) {
    const layer = portalRoot.getObjectByName(name);
    if (layer instanceof THREE.Mesh && layer.material instanceof THREE.ShaderMaterial) {
      layer.material.uniforms.uTime!.value = elapsed;
    }
  }

  const runeArch = portalRoot.getObjectByName(MAGIC_PORTAL_NAMES.runeArch);
  if (runeArch instanceof THREE.Mesh && runeArch.material instanceof THREE.MeshBasicMaterial) {
    runeArch.material.opacity = 0.68 + Math.sin(elapsed * 2.2) * 0.12;
  }

  const veil = portalRoot.getObjectByName(MAGIC_PORTAL_NAMES.veil);
  if (veil instanceof THREE.Mesh && veil.material instanceof THREE.MeshBasicMaterial) {
    veil.material.opacity = 0.72 + Math.sin(elapsed * 1.7) * 0.05;
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
