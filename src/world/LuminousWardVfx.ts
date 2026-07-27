import * as THREE from "three";

import { LUMINOUS_WARD_DURATION_SECONDS } from "../game/LuminousWard";

export interface LuminousWardViewer {
  x: number;
  y: number;
  z: number;
}

/**
 * Player-centred field for the luminous ward. The light remains in the scene
 * at all times; intensity and material opacity fade to zero after expiry.
 * This avoids a renderer light-list rebuild when the item is picked up.
 */
export class LuminousWardVfx {
  readonly root = new THREE.Group();
  readonly light: THREE.PointLight;
  private readonly innerRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private readonly outerRing: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  private readonly verticalHalo: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  private readonly motes: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private readonly baseLightIntensity = 5.4;
  private readonly baseLightRange = 13;
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();

  constructor() {
    this.root.name = "Luminous ward player field";

    this.light = new THREE.PointLight(0xb9e879, 0, this.baseLightRange, 2);
    this.light.name = "Luminous ward area light";
    this.light.position.y = 1.18;

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xc7f39a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    const outerMaterial = ringMaterial.clone();
    outerMaterial.color.setHex(0x84b75d);
    const haloMaterial = ringMaterial.clone();
    haloMaterial.color.setHex(0xd4ffad);

    this.innerRing = new THREE.Mesh(new THREE.RingGeometry(2.75, 3.08, 36), ringMaterial);
    this.innerRing.name = "Luminous ward ground radius";
    this.innerRing.rotation.x = -Math.PI / 2;
    this.innerRing.position.y = 0.025;
    this.innerRing.renderOrder = 3;

    this.outerRing = new THREE.Mesh(new THREE.TorusGeometry(3.38, 0.028, 5, 36), outerMaterial);
    this.outerRing.name = "Luminous ward outer ring";
    this.outerRing.rotation.x = -Math.PI / 2;
    this.outerRing.position.y = 0.06;
    this.outerRing.renderOrder = 3;

    this.verticalHalo = new THREE.Mesh(new THREE.TorusGeometry(2.52, 0.018, 5, 28), haloMaterial);
    this.verticalHalo.name = "Luminous ward vertical halo";
    this.verticalHalo.rotation.z = Math.PI / 2;
    this.verticalHalo.position.y = 1.02;
    this.verticalHalo.renderOrder = 3;

    const positions = new Float32Array(18 * 3);
    for (let index = 0; index < 18; index += 1) {
      const angle = (index / 18) * Math.PI * 2;
      const radius = 1.25 + (index % 5) * 0.48;
      positions[index * 3] = Math.cos(angle) * radius;
      positions[index * 3 + 1] = 0.35 + (index % 6) * 0.26;
      positions[index * 3 + 2] = Math.sin(angle) * radius;
    }
    const moteGeometry = new THREE.BufferGeometry();
    moteGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.motes = new THREE.Points(
      moteGeometry,
      new THREE.PointsMaterial({
        color: 0xe0ffc1,
        size: 0.075,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
        toneMapped: false,
      }),
    );
    this.motes.name = "Luminous ward floating motes";
    this.motes.renderOrder = 3;

    this.root.add(this.light, this.innerRing, this.outerRing, this.verticalHalo, this.motes);
    this.update(0, 0, { x: 0, y: 0, z: 0 });
  }

  update(remaining: number, elapsed: number, viewer: LuminousWardViewer): void {
    const active = remaining > 0.0001;
    const life = THREE.MathUtils.clamp(remaining / LUMINOUS_WARD_DURATION_SECONDS, 0, 1);
    const pulse = 0.92 + Math.sin(elapsed * 5.6) * 0.08;
    const fade = active ? 0.74 + life * 0.26 : 0;

    this.position.set(viewer.x, Math.max(0.02, viewer.y - 1.48), viewer.z);
    this.root.position.copy(this.position);
    this.light.intensity = this.baseLightIntensity * fade * pulse;
    this.light.distance = this.baseLightRange;
    this.innerRing.material.opacity = 0.08 * fade;
    this.outerRing.material.opacity = 0.32 * fade * pulse;
    this.verticalHalo.material.opacity = 0.18 * fade;
    this.motes.material.opacity = 0.28 * fade;
    this.outerRing.rotation.z = elapsed * 0.36;
    this.verticalHalo.rotation.y = -elapsed * 0.52;
    this.motes.rotation.y = elapsed * 0.42;
    this.scale.setScalar(0.96 + pulse * 0.05);
    this.innerRing.scale.copy(this.scale);
    this.outerRing.scale.copy(this.scale);
    this.verticalHalo.scale.set(1, 0.92 + life * 0.08, 1);
  }

  dispose(): void {
    this.innerRing.geometry.dispose();
    this.innerRing.material.dispose();
    this.outerRing.geometry.dispose();
    this.outerRing.material.dispose();
    this.verticalHalo.geometry.dispose();
    this.verticalHalo.material.dispose();
    this.motes.geometry.dispose();
    this.motes.material.dispose();
    this.root.clear();
  }
}
