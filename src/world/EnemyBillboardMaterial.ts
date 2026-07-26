import * as THREE from "three";
import type { EnemyAnimationDefinition } from "./EnemySpriteAtlas";

export function createEnemyBillboardMaterial(map: THREE.Texture): THREE.MeshStandardMaterial {
  const atlasFrame = new THREE.Vector4(0, 0, 1, 1);
  const material = new THREE.MeshStandardMaterial({
    map,
    color: 0xc8c4b8,
    emissive: 0x050403,
    emissiveIntensity: 0.16,
    roughness: 0.96,
    metalness: 0,
    transparent: true,
    alphaTest: 0.14,
    depthWrite: true,
    fog: true,
    toneMapped: true,
    side: THREE.DoubleSide,
  });
  material.name = "Lit enemy billboard material";
  material.userData.enemyAtlasFrame = atlasFrame;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uEnemyAtlasFrame = { value: atlasFrame };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float aEnemyVisibility;\nvarying float vEnemyVisibility;\nuniform vec4 uEnemyAtlasFrame;",
      )
      .replace(
        "#include <uv_vertex>",
        "#include <uv_vertex>\nvMapUv = uEnemyAtlasFrame.xy + vMapUv * uEnemyAtlasFrame.zw;",
      )
      .replace(
        "#include <begin_vertex>",
        "vEnemyVisibility = aEnemyVisibility;\n#include <begin_vertex>",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vEnemyVisibility;")
      .replace(
        "#include <alphatest_fragment>",
        "diffuseColor.a *= clamp(vEnemyVisibility, 0.0, 1.0);\n#include <alphatest_fragment>",
      );
  };
  material.customProgramCacheKey = () => "enemy-billboard-opacity-atlas-v3";
  return material;
}

export function setEnemyBillboardFrame(
  material: THREE.MeshStandardMaterial,
  animation: EnemyAnimationDefinition,
  frameIndex: number,
): void {
  const frame = animation.frames[frameIndex % animation.frames.length]!;
  const target = material.userData.enemyAtlasFrame as THREE.Vector4 | undefined;
  if (!target) return;
  target.set(
    frame.x / animation.size[0],
    1 - (frame.y + frame.h) / animation.size[1],
    frame.w / animation.size[0],
    frame.h / animation.size[1],
  );
}

export function createEnemyContactShadowMaterial(): THREE.MeshBasicMaterial {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = ((x + 0.5) / size) * 2 - 1;
      const ny = ((y + 0.5) / size) * 2 - 1;
      const distance = Math.sqrt(nx * nx + ny * ny);
      const alpha = Math.max(0, 1 - distance);
      const offset = (y * size + x) * 4;
      data[offset] = 10;
      data[offset + 1] = 9;
      data[offset + 2] = 8;
      data[offset + 3] = Math.round(alpha * alpha * 185);
    }
  }
  const map = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  map.name = "Enemy radial contact shadow";
  map.needsUpdate = true;
  map.colorSpace = THREE.NoColorSpace;
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearFilter;
  map.generateMipmaps = false;
  const material = new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    depthWrite: false,
    fog: true,
    toneMapped: true,
  });
  material.name = "Enemy contact shadow material";
  material.userData.sharedDungeonMaterial = true;
  return material;
}

export function disposeEnemyContactShadowMaterial(material: THREE.MeshBasicMaterial): void {
  material.map?.dispose();
  material.dispose();
}
