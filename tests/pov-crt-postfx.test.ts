import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import {
  POV_CRT_HALATION_STRENGTH,
  POV_CRT_HISTORY_WEIGHT,
  PovPostFx,
} from "../src/systems/PovPostFx";

interface PovPostFxInternals {
  sceneTarget: THREE.WebGLRenderTarget;
  historyTargets: readonly [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  historyReady: boolean;
  material: THREE.ShaderMaterial;
}

describe("POV CRT post effect", () => {
  test("keeps a bounded halation and temporal phosphor stage", () => {
    const post = new PovPostFx();
    const internals = post as unknown as PovPostFxInternals;

    expect(POV_CRT_HALATION_STRENGTH).toBeGreaterThan(0.1);
    expect(POV_CRT_HALATION_STRENGTH).toBeLessThan(0.3);
    expect(POV_CRT_HISTORY_WEIGHT).toBeGreaterThan(0.2);
    expect(POV_CRT_HISTORY_WEIGHT).toBeLessThan(0.35);
    expect(internals.material.fragmentShader).toContain("vec3 crtHalation");
    expect(internals.material.fragmentShader).toContain("uniform sampler2D tHistory");
    expect(internals.material.fragmentShader).toContain("decayedHistory");
    expect(internals.material.fragmentShader).toContain("jitterGate");
    expect(internals.material.fragmentShader).toContain("scanBeam");

    post.dispose();
  });

  test("sizes both history buffers at the effective render ratio", () => {
    const post = new PovPostFx();
    const internals = post as unknown as PovPostFxInternals;

    post.setSize(1000, 700, 0.7);

    expect(internals.sceneTarget.width).toBe(700);
    expect(internals.sceneTarget.height).toBe(490);
    for (const target of internals.historyTargets) {
      expect(target.width).toBe(700);
      expect(target.height).toBe(490);
    }

    post.dispose();
  });

  test("the CRT toggle clears history without disabling POV feedback", () => {
    const post = new PovPostFx();
    const internals = post as unknown as PovPostFxInternals;
    internals.historyReady = true;

    post.setCrtEnabled(false);

    expect(post.isCrtEnabled()).toBe(false);
    expect(post.isEnabled()).toBe(true);
    expect(internals.historyReady).toBe(false);
    expect(internals.material.uniforms.uCrtEnabled.value).toBe(0);
    expect(internals.material.uniforms.uHistoryReady.value).toBe(0);

    post.dispose();
  });
});
