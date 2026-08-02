import * as THREE from "three";

export interface PhoenixViewer {
  x: number;
  y: number;
  z: number;
}

/**
 * Phoenix has no ambient field while equipped — only a HUD chip.
 * Revival visuals come from AnnihilationPulseVfx when the charge is spent.
 * This class stays as a no-op seam so world wiring stays stable.
 */
export class PhoenixEggVfx {
  readonly root = new THREE.Group();

  constructor() {
    this.root.name = "Phoenix egg (hud-only, no ambient particles)";
    this.root.visible = false;
  }

  /** @deprecated No rise plume; annihilation pulse owns revival VFX. */
  triggerRise(_viewer: PhoenixViewer): void {
    // Intentionally empty: pulse rings + enemy bursts cover the rebirth moment.
  }

  update(
    _charges: number,
    _elapsed: number,
    _delta: number,
    _viewer: PhoenixViewer,
  ): void {
    // Equipped state is silent — no floating motes while carrying the egg.
  }

  setWarmupVisible(_visible: boolean, _viewer: PhoenixViewer): void {
    this.root.visible = false;
  }

  dispose(): void {
    // No GPU resources.
  }
}
