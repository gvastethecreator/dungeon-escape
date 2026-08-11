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
    expect(internals.material.fragmentShader).toContain("crtPhosphorMask");
    expect(internals.material.fragmentShader).toContain("uCrtHalation");
    expect(internals.material.fragmentShader).toContain("uCrtPersistence");
    expect(internals.material.fragmentShader).toContain("uCrtScanlines");
    expect(internals.material.fragmentShader).toContain("uCrtPhosphor");
    expect(internals.material.fragmentShader).toContain("vec3 crtGlow");
    expect(internals.material.fragmentShader).toContain("gradedColor += crtGlow");
    expect(internals.material.fragmentShader).toContain("limitToPalette");
    expect(internals.material.fragmentShader).toContain("paletteBayer4");
    expect(internals.material.fragmentShader).toContain("paletteOklab");
    expect(internals.material.fragmentShader).toContain("fwidth(sourceLab.x)");
    expect(internals.material.fragmentShader).toContain("uPaletteFlatSuppression");
    expect(internals.material.fragmentShader).toContain("uPaletteShadowStart");
    expect(internals.material.fragmentShader).toContain("secondClosest");
    expect(internals.material.fragmentShader).toContain("secondChance");
    expect(internals.material.fragmentShader).toContain("uPaletteOklabColors[index]");
    expect(internals.material.fragmentShader).not.toContain("paletteOklab(candidate)");
    expect(internals.material.fragmentShader).toContain("heatwaveOffset");
    expect(internals.material.fragmentShader).toContain("uHeatwave");
    expect(internals.material.fragmentShader).toContain("uToxinGreen");
    expect(internals.material.fragmentShader.match(/texture2D\(tDiffuse/g)).toHaveLength(8);

    post.dispose();
  });

  test("loads a classic palette and clamps its notable dithering", () => {
    const post = new PovPostFx();
    const internals = post as unknown as PovPostFxInternals;

    post.setPaletteEffect("cga-0-high", 2);

    expect(internals.material.uniforms.uPaletteEnabled.value).toBe(1);
    expect(internals.material.uniforms.uPaletteSize.value).toBe(4);
    expect(internals.material.uniforms.uPaletteDither.value).toBe(1);
    expect(internals.material.uniforms.uPaletteFlatSuppression.value).toBeCloseTo(0.82, 5);
    expect(internals.material.uniforms.uPaletteShadowStart.value).toBeCloseTo(0.08, 5);
    expect(internals.material.uniforms.uPaletteLightnessWeight.value).toBeCloseTo(6.5, 5);
    const colors = internals.material.uniforms.uPaletteColors.value as THREE.Vector3[];
    expect(
      colors.slice(0, 4).map(
        (color) =>
          `#${[color.x, color.y, color.z]
            .map((channel) =>
              Math.round(channel * 255)
                .toString(16)
                .padStart(2, "0"),
            )
            .join("")}`,
      ),
    ).toEqual(["#000000", "#55ff55", "#ff5555", "#ffff55"]);

    post.setPaletteEffect("off", 0.2);
    expect(internals.material.uniforms.uPaletteEnabled.value).toBe(0);
    expect(internals.material.uniforms.uPaletteSize.value).toBe(0);
    post.dispose();
  });

  test("tunes the CRT and compares world-grade with final-screen palette placement", () => {
    const post = new PovPostFx();
    const internals = post as unknown as PovPostFxInternals;

    post.setDisplayTuning({
      paletteStage: "world",
      paletteDitherScale: 0.8,
      paletteShadowGuard: 1.2,
      paletteFlatGuard: 1.1,
      paletteDetailBoost: 1.25,
      paletteLightnessBias: 0.02,
      halation: 0.21,
      persistence: 0.19,
      scanlines: 0.62,
      phosphorMask: 0.44,
      brightness: 1.06,
      curvatureScale: 1.25,
      grainScale: 0.5,
    });
    post.setParams(0.04, 0, 0, 0.01);

    expect(post.getDisplayTuning().paletteStage).toBe("world");
    expect(internals.material.uniforms.uPaletteStage.value).toBe(0);
    expect(internals.material.uniforms.uCrtHalation.value).toBe(0.21);
    expect(internals.material.uniforms.uCrtPersistence.value).toBe(0.19);
    expect(internals.material.uniforms.uCrtScanlines.value).toBe(0.62);
    expect(internals.material.uniforms.uCrtPhosphor.value).toBe(0.44);
    expect(internals.material.uniforms.uCrtBrightness.value).toBe(1.06);
    expect(internals.material.uniforms.uCurvature.value).toBeCloseTo(0.05, 5);
    expect(internals.material.uniforms.uGrain.value).toBeCloseTo(0.005, 5);

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

  test("restores renderer state when any enabled render pass fails", () => {
    for (const failingPass of [1, 2, 3]) {
      const post = new PovPostFx();
      const previousTarget = { name: "previous" } as unknown as THREE.WebGLRenderTarget;
      const renderer = {
        currentTarget: previousTarget as THREE.WebGLRenderTarget | null,
        toneMapping: THREE.ACESFilmicToneMapping,
        autoClear: false,
        getRenderTarget() {
          return this.currentTarget;
        },
        setRenderTarget(target: THREE.WebGLRenderTarget | null) {
          this.currentTarget = target;
        },
        clear() {},
        renderCalls: 0,
        render() {
          this.renderCalls += 1;
          if (this.renderCalls === failingPass) throw new Error(`pass ${failingPass}`);
        },
      };

      expect(() =>
        post.render(
          renderer as unknown as THREE.WebGLRenderer,
          new THREE.Scene(),
          new THREE.Camera(),
        ),
      ).toThrow(`pass ${failingPass}`);
      expect(renderer.currentTarget).toBe(previousTarget);
      expect(renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping);
      expect(renderer.autoClear).toBe(false);
      post.dispose();
    }
  });

  test("restores the prior target when a disabled-path draw fails", () => {
    const post = new PovPostFx();
    const previousTarget = { name: "previous" } as unknown as THREE.WebGLRenderTarget;
    const renderer = {
      currentTarget: previousTarget as THREE.WebGLRenderTarget | null,
      getRenderTarget() {
        return this.currentTarget;
      },
      setRenderTarget(target: THREE.WebGLRenderTarget | null) {
        this.currentTarget = target;
      },
      render() {
        throw new Error("disabled pass");
      },
    };
    post.setEnabled(false);

    expect(() =>
      post.render(
        renderer as unknown as THREE.WebGLRenderer,
        new THREE.Scene(),
        new THREE.Camera(),
      ),
    ).toThrow("disabled pass");
    expect(renderer.currentTarget).toBe(previousTarget);
    post.dispose();
  });
});
