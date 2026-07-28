import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import { FLOOR } from "../dungeon/generateDungeon";
import type { DungeonData, GridCell } from "../dungeon/types";
import type { BiomeId } from "../systems/BiomeIdentity";
import { getBiomePortalProfile, type BiomePortalProfile } from "./BiomePortalProfile";
import type { DungeonMaterials } from "./MaterialLibrary";

export const MAGIC_PORTAL_ENTRY_RADIUS = 0.7;

/** Matches the clear opening inside the fixed stone frame in StaticDungeonScene. */
export const MAGIC_PORTAL_APERTURE = Object.freeze({
  halfWidth: 0.7,
  baseY: 0.2,
  shoulderY: 2.52,
  apexY: 3.22,
});

export const MAGIC_PORTAL_NAMES = Object.freeze({
  gate: "Escape portal gate",
  frame: "Faceted escape portal arch",
  signature: "Portal biome signature",
  seal: "Portal sealed bars",
  trim: "Portal aperture trim",
  interior: "Portal magic interior",
  veil: "Portal veil",
  vortex: "Portal vortex field",
  spiral: "Portal spiral current",
  runeArch: "Portal rune arch",
  runes: "Portal arch runes",
  sealedVeil: "Portal sealed energy veil",
});

const PORTAL_HEIGHT = MAGIC_PORTAL_APERTURE.apexY - MAGIC_PORTAL_APERTURE.baseY;
const PORTAL_SHOULDER_UV =
  (MAGIC_PORTAL_APERTURE.shoulderY - MAGIC_PORTAL_APERTURE.baseY) / PORTAL_HEIGHT;
const PORTAL_HEIGHT_TO_RADIUS = PORTAL_HEIGHT / MAGIC_PORTAL_APERTURE.halfWidth;
const MEGALITHIC_PILLAR_X = 1.12;

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
  uniform vec3 uDeepColor;
  uniform vec3 uMagicColor;
  uniform vec3 uBrightColor;
  uniform float uPrimaryArms;
  uniform float uSecondaryArms;
  uniform float uRadialFrequency;
  uniform float uFlowSpeed;
  uniform float uCounterSpeed;
  uniform float uSpiralSharpness;

  ${PORTAL_APERTURE_GLSL}

  void main() {
    vec2 point = vec2((vUv.x - 0.5) * 1.42, (vUv.y - 0.46) * 2.15);
    float radius = length(point);
    float angle = atan(point.y, point.x);
    float broadFlow = 0.5 + 0.5 * sin(angle * uPrimaryArms - radius * uRadialFrequency + uTime * uFlowSpeed);
    float counterFlow = 0.5 + 0.5 * sin(angle * uSecondaryArms + radius * uRadialFrequency * 0.72 - uTime * uCounterSpeed);
    float current = pow(broadFlow, uSpiralSharpness) * 0.72 + pow(counterFlow, uSpiralSharpness + 1.35) * 0.28;
    float depthPulse = 0.9 + sin(uTime * 2.3 - radius * 5.0) * 0.1;
    float edgeGlow = 1.0 - smoothstep(0.0, 0.16, apertureEdgeDistance(vUv));
    float core = exp(-radius * 2.6);
    vec3 color = mix(uDeepColor, uMagicColor, current * 0.82 + core * 0.14);
    color = mix(color, uBrightColor, edgeGlow * 0.42);
    float alpha = (0.5 + current * 0.36 + edgeGlow * 0.12) * depthPulse;
    gl_FragColor = vec4(color, alpha);
  }
`;

const PORTAL_SPIRAL_FRAGMENT_SHADER = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime;
  uniform vec3 uMagicColor;
  uniform vec3 uBrightColor;
  uniform float uPrimaryArms;
  uniform float uSecondaryArms;
  uniform float uRadialFrequency;
  uniform float uFlowSpeed;
  uniform float uCounterSpeed;

  ${PORTAL_APERTURE_GLSL}

  void main() {
    vec2 point = vec2((vUv.x - 0.5) * 1.42, (vUv.y - 0.46) * 2.15);
    float radius = length(point);
    float angle = atan(point.y, point.x);
    float primaryWave = 0.5 + 0.5 * sin(angle * uPrimaryArms - radius * uRadialFrequency + uTime * uFlowSpeed);
    float secondaryWave = 0.5 + 0.5 * sin(angle * uSecondaryArms - radius * uRadialFrequency * 1.52 + uTime * uCounterSpeed);
    float primary = smoothstep(0.86, 0.99, primaryWave);
    float secondary = smoothstep(0.94, 0.995, secondaryWave) * 0.38;
    float edgeEcho = 1.0 - smoothstep(0.0, 0.055, apertureEdgeDistance(vUv));
    float pulse = 0.84 + sin(uTime * 2.8 - radius * 4.0) * 0.16;
    float alpha = min(1.0, primary + secondary + edgeEcho * 0.24) * pulse * 0.82;
    vec3 color = mix(uMagicColor, uBrightColor, primary);
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

export interface BiomeMagicPortal {
  root: THREE.Group;
  frame: THREE.Group;
  seal: THREE.Group;
  trim: THREE.Mesh<THREE.TubeGeometry, THREE.MeshStandardMaterial>;
  interior: MagicPortalInterior;
  profile: Readonly<BiomePortalProfile>;
}

function portalFrameMaterial(
  source: THREE.MeshStandardMaterial,
  profile: Readonly<BiomePortalProfile>,
): THREE.MeshStandardMaterial {
  const material = source.clone();
  material.name = `${profile.biomeId} portal frame material`;
  material.color.setHex(profile.frameColor);
  material.emissive.setHex(profile.frameEmissive);
  material.emissiveIntensity = profile.frameEmissiveIntensity;
  material.metalness = profile.frameMetalness;
  material.roughness = profile.frameRoughness;
  return material;
}

function portalReliefMaterial(
  source: THREE.MeshStandardMaterial,
  profile: Readonly<BiomePortalProfile>,
): THREE.MeshStandardMaterial {
  if (profile.biomeId !== "ancient") {
    source.userData.portalRelief = {
      biomeId: profile.biomeId,
      realization: "faceted geometry and shared frame PBR response",
    };
    return source;
  }

  // The ancient entrance is also shown under the colder dungeon rigs. Keep
  // the lift on the stone relief only: the iron seal and blue magic retain
  // their authored values while side and rear facets keep readable texture.
  const material = source.clone();
  material.name = "ancient portal locally lifted stone relief";
  material.color.offsetHSL(0, -0.018, 0.075);
  material.roughness = Math.min(material.roughness, 0.76);
  material.metalness = Math.min(material.metalness, 0.1);
  material.envMapIntensity = Math.max(material.envMapIntensity, 1.05);
  material.emissive.copy(material.color);
  material.emissiveMap = material.map;
  material.emissiveIntensity = 0.095;
  material.userData.portalRelief = {
    biomeId: profile.biomeId,
    realization: "faceted geometry with local mapped indirect fill",
    localValueLift: 0.075,
    localIndirectFill: 0.095,
  };
  return material;
}

function portalAccentMaterial(
  profile: Readonly<BiomePortalProfile>,
  source?: THREE.MeshStandardMaterial,
): THREE.MeshStandardMaterial {
  const material = source?.clone() ?? new THREE.MeshStandardMaterial();
  material.name = `${profile.biomeId} portal accent material`;
  material.color.setHex(profile.accentColor);
  material.emissive.setHex(profile.accentColor);
  material.emissiveIntensity = 0.1;
  material.metalness = profile.architecture === "industrial" ? 0.72 : 0.08;
  material.roughness =
    profile.architecture === "glacial" || profile.architecture === "shard" ? 0.24 : 0.58;
  return material;
}

function portalSealMaterial(
  profile: Readonly<BiomePortalProfile>,
  source: THREE.MeshStandardMaterial,
): THREE.MeshStandardMaterial {
  const material = source.clone();
  material.name = `${profile.biomeId} portal seal material`;
  material.color.setHex(profile.sealColor).multiplyScalar(0.62);
  material.emissive.setHex(profile.frameEmissive);
  material.emissiveIntensity = profile.frameEmissiveIntensity * 0.12;
  material.metalness = profile.sealKind === "bulkhead" ? 0.68 : 0.46;
  material.roughness = profile.sealKind === "organic" ? 0.92 : 0.62;
  return material;
}

function portalMesh<G extends THREE.BufferGeometry>(
  geometry: G,
  material: THREE.Material,
  name: string,
): THREE.Mesh<G, THREE.Material> {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

interface PortalBatch {
  material: THREE.Material;
  geometries: THREE.BufferGeometry[];
  sourceNames: string[];
  sourceGeometryTypes: string[];
}

function repairTriangleUvs(geometry: THREE.BufferGeometry): void {
  const position = geometry.getAttribute("position");
  const sourceUv = geometry.getAttribute("uv");
  const values = new Float32Array(position.count * 2);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const cross = new THREE.Vector3();

  for (let index = 0; index < position.count; index += 3) {
    const sourceArea = sourceUv
      ? Math.abs(
          (sourceUv.getX(index + 1) - sourceUv.getX(index)) *
            (sourceUv.getY(index + 2) - sourceUv.getY(index)) -
            (sourceUv.getY(index + 1) - sourceUv.getY(index)) *
              (sourceUv.getX(index + 2) - sourceUv.getX(index)),
        )
      : 0;
    const sourceFinite = sourceUv
      ? [index, index + 1, index + 2].every(
          (vertex) =>
            Number.isFinite(sourceUv.getX(vertex)) && Number.isFinite(sourceUv.getY(vertex)),
        )
      : false;
    if (sourceUv && sourceFinite && sourceArea > 1e-7) {
      for (let vertex = index; vertex < index + 3; vertex += 1) {
        values[vertex * 2] = sourceUv.getX(vertex);
        values[vertex * 2 + 1] = sourceUv.getY(vertex);
      }
      continue;
    }

    a.fromBufferAttribute(position, index);
    b.fromBufferAttribute(position, index + 1);
    c.fromBufferAttribute(position, index + 2);
    ab.copy(b).sub(a);
    ac.copy(c).sub(a);
    const abLength = Math.max(ab.length(), 1e-6);
    const projected = ac.dot(ab) / abLength;
    const height = Math.max(cross.crossVectors(ab, ac).length() / abLength, 1e-6);
    values[index * 2] = 0;
    values[index * 2 + 1] = 0;
    values[(index + 1) * 2] = abLength;
    values[(index + 1) * 2 + 1] = 0;
    values[(index + 2) * 2] = projected;
    values[(index + 2) * 2 + 1] = height;
  }

  let minimumU = Number.POSITIVE_INFINITY;
  let maximumU = Number.NEGATIVE_INFINITY;
  let minimumV = Number.POSITIVE_INFINITY;
  let maximumV = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < values.length; index += 2) {
    minimumU = Math.min(minimumU, values[index]!);
    maximumU = Math.max(maximumU, values[index]!);
    minimumV = Math.min(minimumV, values[index + 1]!);
    maximumV = Math.max(maximumV, values[index + 1]!);
  }
  const width = Math.max(maximumU - minimumU, 1e-6);
  const height = Math.max(maximumV - minimumV, 1e-6);
  for (let index = 0; index < values.length; index += 2) {
    values[index] = (values[index]! - minimumU) / width;
    values[index + 1] = (values[index + 1]! - minimumV) / height;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(values, 2));
}

function portalGeometryAt(
  source: THREE.Mesh,
  sectionInverse: THREE.Matrix4,
  instanceMatrix?: THREE.Matrix4,
): THREE.BufferGeometry {
  const geometry = source.geometry.index ? source.geometry.toNonIndexed() : source.geometry.clone();
  const transform = sectionInverse.clone().multiply(source.matrixWorld);
  if (instanceMatrix) transform.multiply(instanceMatrix);
  geometry.applyMatrix4(transform);
  if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
  for (const attribute of Object.keys(geometry.attributes)) {
    if (attribute !== "position" && attribute !== "normal" && attribute !== "uv") {
      geometry.deleteAttribute(attribute);
    }
  }
  geometry.clearGroups();
  repairTriangleUvs(geometry);
  return geometry;
}

function portalPartMarker(source: THREE.Mesh): THREE.Group {
  const marker = new THREE.Group();
  marker.name = source.name;
  marker.position.copy(source.position);
  marker.quaternion.copy(source.quaternion);
  marker.scale.copy(source.scale);
  marker.userData = {
    ...source.userData,
    sourceGeometryType: source.geometry.type,
    renderedByMaterialBatch: true,
  };
  return marker;
}

function batchPortalSection(section: THREE.Group, label: string): void {
  section.updateMatrixWorld(true);
  const sectionInverse = section.matrixWorld.clone().invert();
  const sources: THREE.Mesh[] = [];
  section.traverse((object) => {
    if (object instanceof THREE.Mesh) sources.push(object);
  });
  const batches = new Map<string, PortalBatch>();
  const instanceMatrix = new THREE.Matrix4();

  for (const source of sources) {
    if (Array.isArray(source.material)) {
      throw new Error(`${label} cannot batch multi-material part ${source.name}.`);
    }
    const batch = batches.get(source.material.uuid) ?? {
      material: source.material,
      geometries: [],
      sourceNames: [],
      sourceGeometryTypes: [],
    };
    const instanceCount = source instanceof THREE.InstancedMesh ? source.count : 1;
    for (let index = 0; index < instanceCount; index += 1) {
      if (source instanceof THREE.InstancedMesh) source.getMatrixAt(index, instanceMatrix);
      batch.geometries.push(
        portalGeometryAt(
          source,
          sectionInverse,
          source instanceof THREE.InstancedMesh ? instanceMatrix : undefined,
        ),
      );
    }
    batch.sourceNames.push(source.name);
    batch.sourceGeometryTypes.push(source.geometry.type);
    batches.set(source.material.uuid, batch);
  }

  for (const source of sources) {
    source.parent?.add(portalPartMarker(source));
    source.parent?.remove(source);
    source.geometry.dispose();
  }

  let batchIndex = 0;
  for (const batch of batches.values()) {
    const geometry =
      batch.geometries.length === 1
        ? batch.geometries[0]!
        : mergeGeometries(batch.geometries, false);
    if (!geometry) throw new Error(`${label} could not merge material batch ${batchIndex + 1}.`);
    if (batch.geometries.length > 1) batch.geometries.forEach((part) => part.dispose());
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, batch.material);
    mesh.name = `${label} material batch ${batchIndex + 1}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.materialRole = batch.material.name;
    mesh.userData.sourceMeshCount = batch.sourceNames.length;
    mesh.userData.sourcePartNames = batch.sourceNames;
    mesh.userData.sourceGeometryTypes = [...new Set(batch.sourceGeometryTypes)].sort();
    section.add(mesh);
    batchIndex += 1;
  }
  section.userData.runtimeBatching = {
    sourceMeshes: sources.length,
    drawCalls: batches.size,
    materialBatches: batches.size,
    sourceGeometryTypes: [...new Set(sources.map((source) => source.geometry.type))].sort(),
  };
  section.updateMatrixWorld(true);
}

function portalVoussoirGeometry(
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number,
  depth: number,
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const segments = 3;
  for (let index = 0; index <= segments; index += 1) {
    const angle = THREE.MathUtils.lerp(startAngle, endAngle, index / segments);
    const x = Math.cos(angle) * outerRadius;
    const y = Math.sin(angle) * outerRadius;
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  for (let index = segments; index >= 0; index -= 1) {
    const angle = THREE.MathUtils.lerp(startAngle, endAngle, index / segments);
    shape.lineTo(Math.cos(angle) * innerRadius, Math.sin(angle) * innerRadius);
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.008,
    bevelThickness: 0.008,
  });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

function addArchSpikes(
  group: THREE.Group,
  material: THREE.Material,
  count: number,
  length: number,
  inward = false,
): void {
  for (let index = 0; index < count; index += 1) {
    const angle = Math.PI * (index / Math.max(1, count - 1));
    const spike = portalMesh(
      new THREE.ConeGeometry(0.075 + (index % 2) * 0.025, length * (0.76 + (index % 3) * 0.12), 5),
      material,
      `Crown spike ${index + 1}`,
    );
    spike.position.set(Math.cos(angle) * 1.12, 2.52 + Math.sin(angle) * 1.12, 0.02);
    spike.rotation.z = -angle + (inward ? Math.PI / 2 : -Math.PI / 2);
    group.add(spike);
  }
}

function addOrganicStrand(
  group: THREE.Group,
  material: THREE.Material,
  start: THREE.Vector3,
  control: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  name: string,
): void {
  const curve = new THREE.QuadraticBezierCurve3(start, control, end);
  group.add(portalMesh(new THREE.TubeGeometry(curve, 18, radius, 5, false), material, name));
}

function createPortalSignature(
  profile: Readonly<BiomePortalProfile>,
  frameMaterial: THREE.MeshStandardMaterial,
  reliefMaterial: THREE.MeshStandardMaterial,
  accentMaterial: THREE.MeshStandardMaterial,
): THREE.Group {
  const group = new THREE.Group();
  group.name = `${MAGIC_PORTAL_NAMES.signature}: ${profile.signature}`;
  group.userData.biomeId = profile.biomeId;
  group.userData.architecture = profile.architecture;
  group.userData.signature = profile.signature;

  switch (profile.architecture) {
    case "megalithic": {
      for (let index = 0; index < 9; index += 1) {
        const startAngle = (index / 9) * Math.PI + 0.008;
        const endAngle = ((index + 1) / 9) * Math.PI - 0.008;
        const angle = (startAngle + endAngle) / 2;
        const block = portalMesh(
          portalVoussoirGeometry(0.72, 1.18, startAngle, endAngle, 0.56),
          index % 2 === 0 ? reliefMaterial : frameMaterial,
          `Ancient rune voussoir ${index + 1}`,
        );
        block.position.y = 2.52;
        group.add(block);
        if (index % 2 === 0) {
          const inset = portalMesh(
            new THREE.OctahedronGeometry(0.055, 0),
            accentMaterial,
            `Ancient restrained rune inset ${index + 1}`,
          );
          inset.scale.z = 0.34;
          inset.position.set(Math.cos(angle) * 0.95, 2.52 + Math.sin(angle) * 0.95, 0.3);
          inset.rotation.z = -angle + Math.PI / 2;
          group.add(inset);
        }
      }
      break;
    }
    case "volcanic":
      addArchSpikes(group, frameMaterial, 11, 0.52);
      addArchSpikes(group, accentMaterial, 5, 0.28, true);
      break;
    case "glacial":
      addArchSpikes(group, accentMaterial, 13, 0.64);
      for (const [index, x] of [-0.56, -0.28, 0, 0.28, 0.56].entries()) {
        const icicle = portalMesh(
          new THREE.ConeGeometry(0.06, 0.28 + (index % 3) * 0.12, 5),
          accentMaterial,
          `Frost hanging icicle ${index + 1}`,
        );
        icicle.position.set(x, 2.47 + Math.sqrt(Math.max(0, 0.49 - x * x)), 0.08);
        group.add(icicle);
      }
      break;
    case "ossuary": {
      for (const side of [-1, 1]) {
        for (let index = 0; index < 4; index += 1) {
          const rib = portalMesh(
            new THREE.TorusGeometry(0.28 + index * 0.035, 0.045, 5, 12, Math.PI * 0.72),
            frameMaterial,
            `Ossuary rib ${side < 0 ? "left" : "right"} ${index + 1}`,
          );
          rib.position.set(side * 0.83, 0.62 + index * 0.47, 0.04);
          rib.rotation.z = side < 0 ? -0.52 : Math.PI + 0.52;
          group.add(rib);
        }
      }
      for (const x of [-0.48, 0, 0.48]) {
        const skull = portalMesh(
          new THREE.DodecahedronGeometry(0.13, 0),
          frameMaterial,
          "Ossuary crown skull",
        );
        skull.position.set(x, 3.18 - Math.abs(x) * 0.28, 0.08);
        group.add(skull);
      }
      break;
    }
    case "rootbound": {
      for (const side of [-1, 1]) {
        addOrganicStrand(
          group,
          frameMaterial,
          new THREE.Vector3(side * 1.08, 0.05, 0.02),
          new THREE.Vector3(side * 0.68, 1.5, 0.12),
          new THREE.Vector3(side * 0.35, 3.16, 0.02),
          0.09,
          `Verdant climbing root ${side < 0 ? "left" : "right"}`,
        );
      }
      for (let index = 0; index < 8; index += 1) {
        const leaf = portalMesh(
          new THREE.ConeGeometry(0.1, 0.28, 5),
          accentMaterial,
          `Verdant leaf ${index + 1}`,
        );
        leaf.scale.x = 0.45;
        leaf.position.set(
          (index % 2 ? 1 : -1) * (0.83 + (index % 3) * 0.08),
          0.42 + index * 0.35,
          0.13,
        );
        leaf.rotation.z = index % 2 ? -0.72 : 0.72;
        group.add(leaf);
      }
      break;
    }
    case "funerary": {
      for (const side of [-1, 1]) {
        const censer = new THREE.Group();
        censer.name = `Ash hanging censer ${side < 0 ? "left" : "right"}`;
        censer.position.set(side * 1.12, 1.4, 0.06);
        const chain = portalMesh(
          new THREE.CylinderGeometry(0.018, 0.018, 0.72, 5),
          frameMaterial,
          "Censer chain",
        );
        chain.position.y = 0.35;
        const bowl = portalMesh(
          new THREE.SphereGeometry(0.16, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2),
          accentMaterial,
          "Censer ember bowl",
        );
        bowl.rotation.x = Math.PI;
        censer.add(chain, bowl);
        group.add(censer);
      }
      break;
    }
    case "industrial": {
      for (const side of [-1, 1]) {
        const pipe = portalMesh(
          new THREE.CylinderGeometry(0.1, 0.1, 2.62, 10),
          frameMaterial,
          "Iron pressure pipe",
        );
        pipe.position.set(side * 1.15, 1.38, 0.07);
        group.add(pipe);
        for (let index = 0; index < 5; index += 1) {
          const rivet = portalMesh(
            new THREE.SphereGeometry(0.055, 6, 4),
            accentMaterial,
            "Iron portal rivet",
          );
          rivet.position.set(side * 1.03, 0.44 + index * 0.48, 0.22);
          group.add(rivet);
        }
      }
      const gauge = portalMesh(
        new THREE.TorusGeometry(0.22, 0.055, 6, 18),
        accentMaterial,
        "Iron pressure gauge",
      );
      gauge.position.set(0, 3.42, 0.09);
      group.add(gauge);
      break;
    }
    case "shard":
      addArchSpikes(group, frameMaterial, 15, 0.74);
      addArchSpikes(group, accentMaterial, 7, 0.38, true);
      break;
    case "tidal": {
      for (const side of [-1, 1]) {
        for (let branch = 0; branch < 3; branch += 1) {
          addOrganicStrand(
            group,
            accentMaterial,
            new THREE.Vector3(side * 1.02, 0.08 + branch * 0.48, 0.02),
            new THREE.Vector3(side * (1.38 + branch * 0.08), 0.72 + branch * 0.52, 0.1),
            new THREE.Vector3(side * (1.2 + branch * 0.12), 1.24 + branch * 0.58, 0.02),
            0.055,
            `Sunken coral branch ${side < 0 ? "left" : "right"} ${branch + 1}`,
          );
        }
      }
      for (const x of [-0.52, 0, 0.52]) {
        const shell = portalMesh(
          new THREE.SphereGeometry(0.14, 8, 5, 0, Math.PI, 0, Math.PI),
          frameMaterial,
          "Sunken crown shell",
        );
        shell.scale.z = 0.38;
        shell.position.set(x, 3.16 - Math.abs(x) * 0.22, 0.16);
        group.add(shell);
      }
      break;
    }
    case "mycelial": {
      for (const side of [-1, 1]) {
        for (let index = 0; index < 4; index += 1) {
          const mushroom = new THREE.Group();
          mushroom.name = `Fungal portal mushroom ${side < 0 ? "left" : "right"} ${index + 1}`;
          mushroom.position.set(side * (1.03 + (index % 2) * 0.16), 0.42 + index * 0.62, 0.08);
          const stem = portalMesh(
            new THREE.CylinderGeometry(0.035, 0.055, 0.24, 6),
            frameMaterial,
            "Fungal stem",
          );
          stem.position.y = 0.1;
          const cap = portalMesh(
            new THREE.SphereGeometry(0.16, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2),
            accentMaterial,
            "Fungal luminous cap",
          );
          cap.scale.y = 0.55;
          cap.position.y = 0.22;
          mushroom.add(stem, cap);
          group.add(mushroom);
        }
      }
      break;
    }
    case "liminal": {
      const light = portalMesh(
        new THREE.BoxGeometry(1.28, 0.09, 0.16),
        accentMaterial,
        "Backrooms fluorescent lintel",
      );
      light.position.set(0, 3.52, 0.08);
      group.add(light);
      for (const side of [-1, 1]) {
        const conduit = portalMesh(
          new THREE.CylinderGeometry(0.045, 0.045, 2.72, 7),
          frameMaterial,
          "Backrooms wall conduit",
        );
        conduit.position.set(side * 1.14, 1.42, 0.12);
        group.add(conduit);
        const junction = portalMesh(
          new THREE.BoxGeometry(0.24, 0.31, 0.16),
          accentMaterial,
          "Backrooms junction box",
        );
        junction.position.set(side * 1.14, 1.12, 0.14);
        group.add(junction);
      }
      break;
    }
  }
  return group;
}

function createPortalFrame(
  profile: Readonly<BiomePortalProfile>,
  frameMaterial: THREE.MeshStandardMaterial,
  reliefMaterial: THREE.MeshStandardMaterial,
  accentMaterial: THREE.MeshStandardMaterial,
  hardwareMaterial: THREE.MeshStandardMaterial,
): THREE.Group {
  const frame = new THREE.Group();
  frame.name = MAGIC_PORTAL_NAMES.frame;
  frame.userData.biomeId = profile.biomeId;
  frame.userData.architecture = profile.architecture;

  for (const side of [-1, 1]) {
    const isMegalithic = profile.architecture === "megalithic";
    const pillarX = isMegalithic ? MEGALITHIC_PILLAR_X : 1.02;
    const pillar = portalMesh(
      isMegalithic
        ? new THREE.CylinderGeometry(0.29, 0.31, 2.5, 8)
        : new THREE.CylinderGeometry(
            0.2,
            0.24 * profile.pillarFlare,
            2.48,
            profile.architecture === "industrial" ? 12 : 8,
          ),
      reliefMaterial,
      `${profile.signature} pillar`,
    );
    pillar.position.set(side * pillarX, isMegalithic ? 1.57 : 1.28, 0);
    const base = portalMesh(
      isMegalithic
        ? new THREE.CylinderGeometry(0.52, 0.52, 0.11, 8)
        : new THREE.CylinderGeometry(0.34, 0.38 * profile.pillarFlare, 0.2, 8),
      frameMaterial,
      `${profile.signature} footing`,
    );
    base.position.set(side * pillarX, isMegalithic ? 0.055 : 0.1, 0);
    const capital = portalMesh(
      isMegalithic
        ? new THREE.CylinderGeometry(0.45, 0.38, 0.16, 8)
        : new THREE.CylinderGeometry(0.31, 0.24, 0.22, 8),
      reliefMaterial,
      `${profile.signature} capital`,
    );
    capital.position.set(side * pillarX, isMegalithic ? 2.97 : 2.52, 0);
    const footingStep = portalMesh(
      isMegalithic
        ? new THREE.CylinderGeometry(0.46, 0.46, 0.1, 8)
        : new THREE.CylinderGeometry(0.29, 0.34, 0.12, 8),
      reliefMaterial,
      `${profile.signature} footing step`,
    );
    footingStep.position.set(side * pillarX, isMegalithic ? 0.15 : 0.23, 0);
    frame.add(pillar, base, footingStep, capital);
    if (isMegalithic) {
      const footingCollar = portalMesh(
        new THREE.CylinderGeometry(0.39, 0.39, 0.12, 8),
        reliefMaterial,
        "Ancient upper footing collar",
      );
      footingCollar.position.set(side * pillarX, 0.25, 0);
      const capitalUnder = portalMesh(
        new THREE.CylinderGeometry(0.38, 0.31, 0.12, 8),
        reliefMaterial,
        `${profile.signature} lower capital step`,
      );
      capitalUnder.position.set(side * pillarX, 2.84, 0);
      const capSlab = portalMesh(
        new THREE.CylinderGeometry(0.43, 0.46, 0.12, 8),
        frameMaterial,
        "Ancient faceted cap slab",
      );
      capSlab.position.set(side * pillarX, 3.09, 0);
      const pyramidalCap = portalMesh(
        new THREE.ConeGeometry(0.39, 0.32, 8),
        frameMaterial,
        "Ancient pyramidal pillar cap",
      );
      pyramidalCap.position.set(side * pillarX, 3.31, 0);
      pyramidalCap.rotation.y = Math.PI / 8;
      frame.add(footingCollar, capitalUnder, capSlab, pyramidalCap);
      for (const y of [0.82, 1.62]) {
        const plate = portalMesh(
          new THREE.BoxGeometry(0.23, 0.34, 0.045),
          hardwareMaterial,
          `${profile.signature} iron pillar plate`,
        );
        plate.position.set(side * pillarX, y, 0.31);
        frame.add(plate);
      }
    }
  }

  if (profile.architecture === "megalithic") {
    const threshold = portalMesh(
      new THREE.BoxGeometry(1.52, 0.12, 0.58),
      frameMaterial,
      "Ancient low gate threshold plinth",
    );
    threshold.position.set(0, 0.06, 0);
    frame.add(threshold);
    const rivetGeometry = new THREE.SphereGeometry(0.026, 6, 4);
    const rivets = new THREE.InstancedMesh(rivetGeometry, hardwareMaterial, 16);
    rivets.name = `${profile.signature} pillar plate rivets`;
    const matrix = new THREE.Matrix4();
    let instance = 0;
    for (const side of [-1, 1]) {
      for (const y of [0.82, 1.62]) {
        for (const dx of [-0.075, 0.075]) {
          for (const dy of [-0.11, 0.11]) {
            matrix.makeTranslation(side * MEGALITHIC_PILLAR_X + dx, y + dy, 0.348);
            rivets.setMatrixAt(instance, matrix);
            instance += 1;
          }
        }
      }
    }
    rivets.instanceMatrix.needsUpdate = true;
    rivets.castShadow = true;
    frame.add(rivets);
  }

  if (profile.architecture !== "megalithic") {
    const crown = portalMesh(
      new THREE.TorusGeometry(0.93, 0.19 * profile.crownThickness, 8, 32, Math.PI),
      frameMaterial,
      `${profile.signature} crown`,
    );
    crown.position.y = 2.52;
    frame.add(crown);
  }

  const keystone = portalMesh(
    new THREE.OctahedronGeometry(0.24, 0),
    accentMaterial,
    `${profile.signature} keystone`,
  );
  keystone.scale.set(0.78, 1.28, 0.84);
  keystone.position.set(0, 3.43, 0);
  frame.add(
    keystone,
    createPortalSignature(profile, frameMaterial, reliefMaterial, accentMaterial),
  );
  batchPortalSection(frame, `${profile.biomeId} portal frame`);
  return frame;
}

function createPortalSeal(
  profile: Readonly<BiomePortalProfile>,
  material: THREE.MeshStandardMaterial,
  accent: THREE.MeshStandardMaterial,
): THREE.Group {
  const seal = new THREE.Group();
  seal.name = MAGIC_PORTAL_NAMES.seal;
  seal.userData.kind = profile.sealKind;
  seal.userData.biomeId = profile.biomeId;
  if (profile.sealKind === "bars") {
    for (let index = 0; index < 5; index += 1) {
      const bar = portalMesh(
        new THREE.CylinderGeometry(0.045, 0.05, 2.36, 6),
        material,
        `Seal bar ${index + 1}`,
      );
      bar.position.set(-0.58 + index * 0.29, 1.37, 0.06);
      const point = portalMesh(
        new THREE.ConeGeometry(0.09, 0.22, 6),
        material,
        `Seal point ${index + 1}`,
      );
      point.position.set(bar.position.x, 2.66, 0.06);
      seal.add(bar, point);
    }
    for (const [index, y] of [0.72, 1.48].entries()) {
      const brace = portalMesh(
        new THREE.BoxGeometry(index === 0 ? 1.46 : 1.68, index === 0 ? 0.08 : 0.1, 0.11),
        material,
        `Seal brace ${index + 1}`,
      );
      brace.position.set(0, y, 0.08);
      seal.add(brace);
    }
  } else if (profile.sealKind === "crossed") {
    for (const [index, rotation] of [-0.58, 0.58, -1.06, 1.06].entries()) {
      const beam = portalMesh(
        new THREE.BoxGeometry(0.12, index < 2 ? 2.72 : 1.78, 0.14),
        index < 2 ? material : accent,
        `Crossed seal ${index + 1}`,
      );
      beam.position.set(0, 1.4, 0.08 + index * 0.006);
      beam.rotation.z = rotation;
      seal.add(beam);
    }
  } else if (profile.sealKind === "organic") {
    for (let index = 0; index < 5; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      addOrganicStrand(
        seal,
        index === 2 ? accent : material,
        new THREE.Vector3(side * 0.72, 0.18 + index * 0.04, 0.08),
        new THREE.Vector3(-side * (0.22 + index * 0.08), 1.2 + index * 0.18, 0.11),
        new THREE.Vector3(side * (0.62 - index * 0.08), 2.72 - index * 0.1, 0.08),
        0.045 + (index % 2) * 0.014,
        `Organic seal strand ${index + 1}`,
      );
    }
  } else {
    for (let index = 0; index < 4; index += 1) {
      const panel = portalMesh(
        new THREE.BoxGeometry(1.42 - index * 0.08, 0.5, 0.16),
        index === 1 ? accent : material,
        `Bulkhead panel ${index + 1}`,
      );
      panel.position.set(0, 0.52 + index * 0.58, 0.08);
      seal.add(panel);
      for (const x of [-0.56, 0.56]) {
        const rivet = portalMesh(new THREE.SphereGeometry(0.045, 6, 4), accent, "Bulkhead rivet");
        rivet.position.set(x, panel.position.y, 0.18);
        seal.add(rivet);
      }
    }
  }
  batchPortalSection(seal, `${profile.biomeId} portal seal`);
  return seal;
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

function portalShaderMaterial(
  fragmentShader: string,
  profile: Readonly<BiomePortalProfile>,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uDeepColor: { value: new THREE.Color(profile.deepColor) },
      uMagicColor: { value: new THREE.Color(profile.magicColor) },
      uBrightColor: { value: new THREE.Color(profile.brightColor) },
      uPrimaryArms: { value: profile.primaryArms },
      uSecondaryArms: { value: profile.secondaryArms },
      uRadialFrequency: { value: profile.radialFrequency },
      uFlowSpeed: { value: profile.flowSpeed },
      uCounterSpeed: { value: profile.counterSpeed },
      uSpiralSharpness: { value: profile.spiralSharpness },
    },
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
export function createMagicPortalInterior(
  profile: Readonly<BiomePortalProfile> = getBiomePortalProfile("ancient"),
  sharedFlatMaterial?: THREE.MeshBasicMaterial,
): MagicPortalInterior {
  const root = new THREE.Group();
  root.name = MAGIC_PORTAL_NAMES.interior;
  root.position.z = 0.025;
  root.visible = false;

  const apertureGeometry = createPortalApertureGeometry();
  const flatMaterial =
    sharedFlatMaterial ??
    new THREE.MeshBasicMaterial({
      name: `${profile.biomeId} portal flat magic material`,
      color: profile.brightColor,
      transparent: true,
      opacity: 0.62,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
  const veil = new THREE.Mesh(apertureGeometry, flatMaterial);
  veil.name = MAGIC_PORTAL_NAMES.veil;
  veil.renderOrder = 2;

  const vortex = new THREE.Mesh(
    apertureGeometry,
    portalShaderMaterial(PORTAL_FIELD_FRAGMENT_SHADER, profile),
  );
  vortex.name = MAGIC_PORTAL_NAMES.vortex;
  vortex.position.z = 0.014;
  vortex.renderOrder = 3;

  const spiral = new THREE.Mesh(
    apertureGeometry,
    portalShaderMaterial(PORTAL_SPIRAL_FRAGMENT_SHADER, profile),
  );
  spiral.name = MAGIC_PORTAL_NAMES.spiral;
  spiral.position.z = 0.032;
  spiral.renderOrder = 4;

  const runeArch = new THREE.Mesh(createPortalApertureOutlineGeometry(0.014, 0.045), flatMaterial);
  runeArch.name = MAGIC_PORTAL_NAMES.runeArch;
  runeArch.position.z = 0.052;
  runeArch.renderOrder = 5;

  const runes = createPortalRunes(flatMaterial);
  runes.position.z = 0.057;

  root.add(veil, vortex, spiral, runeArch, runes);
  root.userData.biomeId = profile.biomeId;
  root.userData.architecture = profile.architecture;
  return { root, veil, vortex, spiral, runeArch, runes };
}

/** Complete portal assembly: biome frame, closed seal, full-door energy and trim. */
export function createBiomeMagicPortal(
  biomeId: BiomeId,
  materials: DungeonMaterials,
): BiomeMagicPortal {
  const profile = getBiomePortalProfile(biomeId);
  const root = new THREE.Group();
  root.name = MAGIC_PORTAL_NAMES.gate;
  root.userData.biomeId = biomeId;
  root.userData.architecture = profile.architecture;
  root.userData.signature = profile.signature;
  root.userData.portalOpen = false;

  const frameMaterial = portalFrameMaterial(materials[profile.material], profile);
  const reliefMaterial = portalReliefMaterial(frameMaterial, profile);
  const accentMaterial = portalAccentMaterial(profile, materials.iron);
  const sealSource =
    profile.sealKind === "organic"
      ? materials.root
      : profile.sealKind === "bulkhead"
        ? materials.paintedSteel
        : materials.iron;
  const sealMaterial = portalSealMaterial(profile, sealSource);
  const frame = createPortalFrame(
    profile,
    frameMaterial,
    reliefMaterial,
    accentMaterial,
    sealMaterial,
  );
  const seal = createPortalSeal(profile, sealMaterial, accentMaterial);
  const trim = new THREE.Mesh(createPortalApertureOutlineGeometry(0.055, 0.01), accentMaterial);
  trim.name = MAGIC_PORTAL_NAMES.trim;
  trim.position.z = 0.045;
  trim.castShadow = true;
  trim.receiveShadow = true;

  const flatMagicMaterial = new THREE.MeshBasicMaterial({
    name: `${biomeId} portal flat magic material`,
    color: profile.magicColor,
    transparent: true,
    opacity: biomeId === "ancient" ? 0.22 : 0.26,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const sealedVeil = new THREE.Mesh(createPortalApertureGeometry(0.035), flatMagicMaterial);
  sealedVeil.name = MAGIC_PORTAL_NAMES.sealedVeil;
  sealedVeil.position.z = -0.09;
  sealedVeil.renderOrder = 1;

  const interior = createMagicPortalInterior(profile, flatMagicMaterial);
  root.add(frame, sealedVeil, seal, trim, interior.root);
  root.userData.asset = "entrance-portal-gate";
  root.userData.reference =
    "assets-source/imagegen/model-references-v2/architecture/entrance-portal-gate-three-view.png";
  root.userData.collider = {
    type: "compound",
    parts: [
      { type: "box", size: [0.64, 3.48, 0.72], center: [-MEGALITHIC_PILLAR_X, 1.74, 0] },
      { type: "box", size: [0.64, 3.48, 0.72], center: [MEGALITHIC_PILLAR_X, 1.74, 0] },
    ],
  };
  root.userData.detailInventory = [
    "paired closed frame pillars",
    "paired low plinth steps and upper footing collars",
    "continuous low gate threshold plinth",
    "faceted capital slabs with pyramidal pillar caps",
    "segmented biome crown",
    "restrained emissive insets",
    `${profile.sealKind} sealed gate`,
  ];
  root.userData.sculptRuntime = {
    topology: "closed frame solids around a clear animated aperture",
    materialRoles: [
      profile.material,
      "accent",
      profile.sealKind === "organic" ? "root" : "iron",
      "flat-magic",
      "vortex-field",
      "spiral-current",
    ],
    pivots: {
      root: MAGIC_PORTAL_NAMES.gate,
      frame: MAGIC_PORTAL_NAMES.frame,
      seal: MAGIC_PORTAL_NAMES.seal,
      interior: MAGIC_PORTAL_NAMES.interior,
    },
    sockets: {
      entry: { type: "portal-entry", localPosition: [0, 0, 0.12] },
      aperture: { type: "portal-aperture", localPosition: [0, 1.65, 0] },
    },
    destructionGroups: {
      frame: [MAGIC_PORTAL_NAMES.frame],
      seal: [MAGIC_PORTAL_NAMES.seal],
      magic: [MAGIC_PORTAL_NAMES.sealedVeil, MAGIC_PORTAL_NAMES.interior],
    },
    runtimeBatching: {
      frame: frame.userData.runtimeBatching,
      seal: seal.userData.runtimeBatching,
      closedDrawCalls:
        Number(frame.userData.runtimeBatching.drawCalls) +
        Number(seal.userData.runtimeBatching.drawCalls) +
        2,
      openDrawCalls: Number(frame.userData.runtimeBatching.drawCalls) + 6,
      maximumVisibleDrawCalls: Math.max(
        Number(frame.userData.runtimeBatching.drawCalls) +
          Number(seal.userData.runtimeBatching.drawCalls) +
          2,
        Number(frame.userData.runtimeBatching.drawCalls) + 6,
      ),
    },
  };
  return { root, frame, seal, trim, interior, profile };
}

export function setMagicPortalOpen(portalRoot: THREE.Object3D, open: boolean): void {
  const interior = portalRoot.getObjectByName(MAGIC_PORTAL_NAMES.interior);
  if (interior) interior.visible = open;
  const seal = portalRoot.getObjectByName(MAGIC_PORTAL_NAMES.seal);
  if (seal) seal.visible = !open;
  const sealedVeil = portalRoot.getObjectByName(MAGIC_PORTAL_NAMES.sealedVeil);
  if (sealedVeil) sealedVeil.visible = !open;
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
