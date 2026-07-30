import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import {
  POV_CRT_HALATION_STRENGTH,
  POV_CRT_HISTORY_WEIGHT,
  POV_CRT_RENDER_SCALE,
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
    expect(POV_CRT_HALATION_STRENGTH).toBeLessThan(0.2);
    expect(POV_CRT_HISTORY_WEIGHT).toBeGreaterThan(0.1);
    expect(POV_CRT_HISTORY_WEIGHT).toBeLessThan(0.2);
    expect(POV_CRT_RENDER_SCALE).toBe(0.8);
    expect(internals.material.fragmentShader).toContain("vec3 crtHalation");
    expect(internals.material.fragmentShader).toContain("uniform sampler2D tHistory");
    expect(internals.material.fragmentShader).toContain("decayedHistory");
    expect(internals.material.fragmentShader).toContain("jitterGate");
    expect(internals.material.fragmentShader).toContain("scanBeam");
    expect(internals.material.fragmentShader).toContain("heatwaveOffset");
    expect(internals.material.fragmentShader).toContain("uHeatwave");
    expect(internals.material.fragmentShader).toContain("uToxinGreen");
    expect(internals.material.fragmentShader.match(/texture2D\(tDiffuse/g)).toHaveLength(8);

    post.dispose();
  });

  test("sizes both history buffers at the effective render ratio", () => {
    const post = new PovPostFx();
    const internals = post as unknown as PovPostFxInternals;

    post.setSize(1000, 700, 0.7);

    expect(internals.sceneTarget.width).toBe(700);
    expect(internals.sceneTarget.height).toBe(490);
    for (const target of internals.historyTargets) {
      expect(target.width).toBe(560);
      expect(target.height).toBe(392);
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

  test("hazard feel uniforms drive heatwave and toxin grade", () => {
    const post = new PovPostFx();
    const internals = post as unknown as PovPostFxInternals;

    post.setHazardFeel(0.7, 0.4, 0.2, 0.3);

    expect(internals.material.uniforms.uHeatwave.value).toBeCloseTo(0.7, 5);
    expect(internals.material.uniforms.uToxinGreen.value).toBeCloseTo(0.4, 5);
    expect(internals.material.uniforms.uIceBlue.value).toBeCloseTo(0.2, 5);
    expect(internals.material.uniforms.uSpikeEdge.value).toBeCloseTo(0.3, 5);

    post.setHazardFeel(2, -1, 0.5, 0);
    expect(internals.material.uniforms.uHeatwave.value).toBe(1);
    expect(internals.material.uniforms.uToxinGreen.value).toBe(0);

    post.dispose();
  });

  test("registers scene shaders synchronously against the post target", () => {
    const post = new PovPostFx();
    const internals = post as unknown as PovPostFxInternals;
    const previousTarget = { name: "previous" } as unknown as THREE.WebGLRenderTarget;
    const targets: Array<THREE.WebGLRenderTarget | null> = [];
    let compileCalls = 0;
    const renderer = {
      getRenderTarget: () => previousTarget,
      setRenderTarget: (target: THREE.WebGLRenderTarget | null) => targets.push(target),
      compile: () => {
        compileCalls += 1;
      },
    } as unknown as THREE.WebGLRenderer;

    post.compileScene(renderer, new THREE.Scene(), new THREE.Camera());

    expect(compileCalls).toBe(1);
    expect(targets).toEqual([internals.sceneTarget, previousTarget]);
    post.dispose();
  });

  test("restores the prior render target when synchronous registration fails", () => {
    const post = new PovPostFx();
    const previousTarget = { name: "previous" } as unknown as THREE.WebGLRenderTarget;
    const targets: Array<THREE.WebGLRenderTarget | null> = [];
    const renderer = {
      getRenderTarget: () => previousTarget,
      setRenderTarget: (target: THREE.WebGLRenderTarget | null) => targets.push(target),
      compile: () => {
        throw new Error("expected compile failure");
      },
    } as unknown as THREE.WebGLRenderer;

    expect(() => post.compileScene(renderer, new THREE.Scene(), new THREE.Camera())).toThrow(
      "expected compile failure",
    );
    expect(targets.at(-1)).toBe(previousTarget);
    post.dispose();
  });
});
