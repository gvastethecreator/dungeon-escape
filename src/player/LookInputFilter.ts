import * as THREE from "three";

export interface LookFrameDelta {
  x: number;
  y: number;
}

export class LookInputFilter {
  private pendingX = 0;
  private pendingY = 0;
  // Reused each frame — consume() is called once per frame and the caller reads
  // x/y immediately, so a single scratch instance is allocation-free and safe.
  private readonly scratch: LookFrameDelta = { x: 0, y: 0 };

  constructor(
    private readonly eventLimit = 72,
    private readonly frameLimit = 118,
  ) {}

  push(deltaX: number, deltaY: number): void {
    this.pendingX += THREE.MathUtils.clamp(deltaX, -this.eventLimit, this.eventLimit);
    this.pendingY += THREE.MathUtils.clamp(deltaY, -this.eventLimit, this.eventLimit);
  }

  consume(): LookFrameDelta {
    this.scratch.x = THREE.MathUtils.clamp(this.pendingX, -this.frameLimit, this.frameLimit);
    this.scratch.y = THREE.MathUtils.clamp(this.pendingY, -this.frameLimit, this.frameLimit);
    this.pendingX = 0;
    this.pendingY = 0;
    return this.scratch;
  }

  clear(): void {
    this.pendingX = 0;
    this.pendingY = 0;
  }
}
