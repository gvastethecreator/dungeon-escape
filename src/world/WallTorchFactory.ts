import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createFlameTongueGeometry } from "./FlameGeometry";
import { createImageSculptedProp } from "./ImageSculptedPropKit";
import type { DungeonMaterials } from "./MaterialLibrary";
import { FIRE_LIGHT_TUNING } from "../systems/LightTuning";

/** Keep the mount readable at corridor range without pushing it above player-scale furniture. */
export const WALL_TORCH_MESH_SCALE = 0.78;
export const WALL_LANTERN_MESH_SCALE = 0.76;

export interface WallTorchAssembly {
  root: THREE.Group;
  flame: THREE.Mesh;
  flameDetails: THREE.Object3D[];
  halos: THREE.Mesh[];
  light: THREE.PointLight | null;
  baseIntensity: number;
  baseY: number;
}

export function createWallLantern(
  position: THREE.Vector3,
  facing: THREE.Vector3,
  lit: boolean,
  materials: DungeonMaterials,
): WallTorchAssembly {
  const root = createImageSculptedProp("wall-lantern", materials);
  root.name = "Image-sculpted wall lantern sconce";
  root.position.copy(position);
  root.rotation.y = Math.atan2(facing.x, facing.z);
  const baseY = 0.76;
  const flame = new THREE.Mesh(
    createFlameTongueGeometry(0.09, 0.25, 7, 0.03),
    new THREE.MeshBasicMaterial({
      color: 0xffd38a,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: true,
      side: THREE.DoubleSide,
    }),
  );
  flame.name = "Lantern warm flame";
  flame.visible = lit;
  flame.position.set(0, baseY, 0.43);
  flame.scale.y = 1.12;
  root.add(flame);
  const baseIntensity = 42;
  const light = lit
    ? new THREE.PointLight(0xc9864d, baseIntensity, FIRE_LIGHT_TUNING.wallRange, 1.94)
    : null;
  const halos: THREE.Mesh[] = [];
  if (light) {
    light.name = "Wall lantern radial point light";
    light.position.set(0, baseY + 0.04, 0.48);
    root.add(light);
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.82, 12, 8),
      new THREE.MeshBasicMaterial({
        color: 0xb97844,
        transparent: true,
        opacity: 0.055,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        toneMapped: false,
      }),
    );
    halo.name = "Wall lantern spherical light halo";
    halo.position.copy(light.position);
    halo.renderOrder = 2;
    halos.push(halo);
    root.add(halo);
  }
  root.scale.setScalar(WALL_LANTERN_MESH_SCALE);
  return { root, flame, flameDetails: [], halos, light, baseIntensity, baseY };
}

export function createWallTorch(
  position: THREE.Vector3,
  facing: THREE.Vector3,
  lit: boolean,
  materials?: DungeonMaterials,
): WallTorchAssembly {
  const root = new THREE.Group();
  root.name = "Wall torch sconce";
  root.position.copy(position);
  root.rotation.y = Math.atan2(facing.x, facing.z);

  const iron =
    materials?.iron ??
    new THREE.MeshStandardMaterial({
      color: 0x343534,
      roughness: 0.72,
      metalness: 0.48,
      emissive: 0x090706,
      emissiveIntensity: 0.28,
    });
  const ember = new THREE.MeshBasicMaterial({
    color: 0xd7a05c,
    transparent: true,
    opacity: 0.78,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: true,
    side: THREE.DoubleSide,
  });
  const core = new THREE.MeshBasicMaterial({
    color: 0xffe0a1,
    transparent: true,
    opacity: 0.82,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: true,
    side: THREE.DoubleSide,
  });

  const plateShape = new THREE.Shape();
  plateShape.moveTo(0, -0.3);
  plateShape.lineTo(-0.2, -0.16);
  plateShape.lineTo(-0.18, 0.2);
  plateShape.quadraticCurveTo(0, 0.34, 0.18, 0.2);
  plateShape.lineTo(0.2, -0.16);
  plateShape.closePath();
  const plate = new THREE.Mesh(
    new THREE.ExtrudeGeometry(plateShape, {
      depth: 0.065,
      bevelEnabled: true,
      bevelSegments: 1,
      bevelSize: 0.018,
      bevelThickness: 0.015,
      curveSegments: 3,
    }),
    iron,
  );
  plate.name = "Torch forged shield plate";
  plate.position.z = 0.025;
  const crown = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.09, 0.12), iron);
  crown.name = "Torch wall crown";
  crown.position.set(0, 0.22, 0.07);
  const boltGeometry = new THREE.CylinderGeometry(0.035, 0.035, 0.04, 6);
  for (const x of [-0.105, 0.105]) {
    const bolt = new THREE.Mesh(boltGeometry, iron);
    bolt.rotation.x = Math.PI / 2;
    bolt.position.set(x, -0.12, 0.105);
    root.add(bolt);
  }

  const bracketPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.08, 0.08),
    new THREE.Vector3(0, -0.1, 0.3),
    new THREE.Vector3(0, -0.01, 0.5),
    new THREE.Vector3(0, 0.14, 0.57),
  ]);
  const bracket = new THREE.Mesh(new THREE.TubeGeometry(bracketPath, 8, 0.052, 6, false), iron);
  bracket.name = "Torch scroll bracket";
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.082, 0.72, 7), iron);
  handle.name = "Torch raised handle";
  handle.rotation.x = -0.22;
  handle.position.set(0, 0.27, 0.59);

  const lowerRing = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.035, 5, 10), iron);
  lowerRing.name = "Torch basket lower ring";
  lowerRing.rotation.x = Math.PI / 2;
  lowerRing.position.set(0, 0.57, 0.67);
  const upperRing = lowerRing.clone();
  upperRing.name = "Torch basket upper ring";
  upperRing.scale.setScalar(1.16);
  upperRing.position.y = 0.75;
  for (const x of [-0.13, 0.13]) {
    const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 5), iron);
    rib.position.set(x, 0.66, 0.67);
    rib.rotation.z = x * 0.55;
    root.add(rib);
  }

  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(1.18, 16),
    new THREE.MeshBasicMaterial({
      color: 0xb87943,
      transparent: true,
      opacity: 0.075,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  glow.name = "Torch wall glow card";
  glow.visible = lit;
  glow.position.set(0, 0.36, 0.015);
  glow.renderOrder = 1;

  const baseY = 0.93;
  const flame = new THREE.Mesh(createFlameTongueGeometry(0.15, 0.44, 7, 0.07), ember);
  flame.name = "Torch outer flame";
  flame.visible = lit;
  flame.position.set(0, baseY, 0.67);
  flame.scale.set(0.88, 1.08, 0.88);
  flame.renderOrder = 4;
  const flameCore = new THREE.Mesh(createFlameTongueGeometry(0.075, 0.27, 7, -0.025), core);
  flameCore.name = "Torch flame core";
  flameCore.visible = lit;
  flameCore.position.set(0, baseY - 0.015, 0.69);
  flameCore.scale.y = 1.06;
  flameCore.renderOrder = 5;

  const ironParts = [
    plate,
    crown,
    bracket,
    handle,
    lowerRing,
    upperRing,
    ...root.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh),
  ];
  const ironGeometry = mergeGeometries(
    ironParts.map((part) => {
      part.updateMatrix();
      const geometry = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
      return geometry.applyMatrix4(part.matrix);
    }),
    false,
  );
  root.clear();
  if (ironGeometry) {
    const ironBatch = new THREE.Mesh(ironGeometry, iron);
    ironBatch.name = "Torch wall plate";
    root.add(ironBatch);
  }
  // Authored-part tags survive batching and keep debug inspection useful.
  const forgedShieldTag = new THREE.Object3D();
  forgedShieldTag.name = "Torch forged shield plate";
  const scrollBracketTag = new THREE.Object3D();
  scrollBracketTag.name = "Torch scroll bracket";
  root.add(forgedShieldTag, scrollBracketTag);
  root.add(glow, flame, flameCore);

  const baseIntensity = 44;
  const light = lit
    ? new THREE.PointLight(0xd18b4c, baseIntensity, FIRE_LIGHT_TUNING.wallRange, 1.92)
    : null;
  const halos: THREE.Mesh[] = [];
  if (light) {
    halos.push(glow);
    light.name = "Wall torch radial point light";
    light.position.set(0, baseY + 0.05, 0.92);
    root.add(light);
    for (const [radius, opacity] of [
      [0.72, 0.055],
      [1.35, 0.022],
    ] as const) {
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 12, 8),
        new THREE.MeshBasicMaterial({
          color: 0xc88a51,
          transparent: true,
          opacity,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.BackSide,
          toneMapped: false,
        }),
      );
      halo.name = "Wall torch spherical light halo";
      halo.position.set(0, baseY + 0.05, 0.86);
      halo.renderOrder = 2;
      halos.push(halo);
      root.add(halo);
    }
  }

  root.scale.setScalar(WALL_TORCH_MESH_SCALE);
  return { root, flame, flameDetails: [flameCore], halos, light, baseIntensity, baseY };
}
