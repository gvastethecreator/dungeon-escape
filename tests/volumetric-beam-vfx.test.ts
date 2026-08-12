import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import * as THREE from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";

import {
  createShaderProgramModeRegistry,
  getShaderProgramModeRegistry,
  resetShaderProgramModeRegistryForTests,
  setShaderProgramModeRegistry,
} from "../src/systems/ShaderProgramMode";
import { loadTslMaterialModules } from "../src/systems/TslMaterialModules";
import {
  createVolumetricBeam,
  getVolumetricBeamStrength,
  registerVolumetricBeamShaderFactory,
  setVolumetricBeamStrength,
  tickVolumetricBeamTime,
  tintVolumetricBeamColor,
  VOLUMETRIC_BEAM_SHADER_FACTORY_ID,
  type VolumetricBeamUniformHandles,
} from "../src/world/VolumetricBeam";

// The shader program mode registry is process-global; leaking `tsl` mode
// into later test files would build node materials where GLSL is expected.
afterEach(() => {
  resetShaderProgramModeRegistryForTests();
});

// TSL builders live in lazily imported `*.tsl` siblings so the WebGL bundle
// never pulls in `three/webgpu`; tests must preload them like Play boot does.
beforeAll(async () => {
  await loadTslMaterialModules();
});

describe("volumetric beam dual-mode", () => {
  test("glsl mode keeps shader defines and shared handles", () => {
    resetShaderProgramModeRegistryForTests();
    registerVolumetricBeamShaderFactory();

    const signal = createVolumetricBeam(0xc88a51, 3, 0.7, 0.1);
    const ambient = createVolumetricBeam(0xc8c0b0, 4.2, 0.8, 0.1, {
      role: "ambient",
      blending: THREE.NormalBlending,
      fog: true,
      toneMapped: true,
    });
    const objective = createVolumetricBeam(0xb04a28, 3.8, 0.56, 0.12, {
      signalStyle: "objective",
      topRadius: 0.1,
    });

    expect(signal.material).toBeInstanceOf(THREE.ShaderMaterial);
    expect(
      (signal.material as THREE.ShaderMaterial).defines?.AMBIENT_STRATA_PROFILE,
    ).toBeUndefined();
    expect((ambient.material as THREE.ShaderMaterial).defines?.AMBIENT_STRATA_PROFILE).toBe(1);
    expect((objective.material as THREE.ShaderMaterial).defines?.OBJECTIVE_STRATA_PROFILE).toBe(1);

    const signalMat = signal.material as THREE.Material;
    const handles = signalMat.userData.volumetricBeamHandles as VolumetricBeamUniformHandles;
    tickVolumetricBeamTime(signal, 4);
    expect(handles.uTime.value).toBe(4);
    setVolumetricBeamStrength(signal, 0.33);
    expect(getVolumetricBeamStrength(signal)).toBeCloseTo(0.33);
    expect(tintVolumetricBeamColor(signalMat, new THREE.Color(0xff0000), 1)).toBe(true);
  });

  test("TSL mode builds three separate MeshBasicNodeMaterial graphs without defines", () => {
    resetShaderProgramModeRegistryForTests();
    setShaderProgramModeRegistry(createShaderProgramModeRegistry("tsl"));
    registerVolumetricBeamShaderFactory();

    const signal = createVolumetricBeam(0xc88a51, 3, 0.7, 0.1);
    const ambient = createVolumetricBeam(0xc8c0b0, 4.2, 0.8, 0.1, {
      role: "ambient",
      blending: THREE.NormalBlending,
      fog: true,
      toneMapped: true,
    });
    const objective = createVolumetricBeam(0xb04a28, 3.8, 0.56, 0.12, {
      signalStyle: "objective",
    });

    const signalMat = signal.material as MeshBasicNodeMaterial;
    const ambientMat = ambient.material as MeshBasicNodeMaterial;
    const objectiveMat = objective.material as MeshBasicNodeMaterial;
    expect(signalMat).toBeInstanceOf(MeshBasicNodeMaterial);
    expect(ambientMat).toBeInstanceOf(MeshBasicNodeMaterial);
    expect(objectiveMat).toBeInstanceOf(MeshBasicNodeMaterial);
    expect(signal.userData.shaderProgramMode).toBe("tsl");
    expect(signal.userData.profile).toBe("signal-smooth");
    expect(ambient.userData.profile).toBe("retro-crossed-strata");
    expect(objective.userData.profile).toBe("objective-strata");
    expect(signalMat.userData.beamProfile).toBe("signal-smooth");
    expect(ambientMat.userData.beamProfile).toBe("retro-crossed-strata");
    expect(objectiveMat.userData.beamProfile).toBe("objective-strata");
    // No GLSL preprocessor path on TSL materials.
    expect((signalMat as unknown as THREE.ShaderMaterial).defines).toBeUndefined();
    expect(ambientMat.colorNode).toBeTruthy();
    expect(objectiveMat.opacityNode).toBeTruthy();

    const handles = ambientMat.userData.volumetricBeamHandles as VolumetricBeamUniformHandles;
    tickVolumetricBeamTime(ambient, 9.5);
    expect(handles.uTime.value).toBe(9.5);
    setVolumetricBeamStrength(ambient, 0.05);
    expect(getVolumetricBeamStrength(ambient)).toBeCloseTo(0.05);

    resetShaderProgramModeRegistryForTests();
  });

  test("factory id is registered for both modes", () => {
    resetShaderProgramModeRegistryForTests();
    registerVolumetricBeamShaderFactory();
    expect(getShaderProgramModeRegistry().supports(VOLUMETRIC_BEAM_SHADER_FACTORY_ID, "glsl")).toBe(
      true,
    );
    expect(getShaderProgramModeRegistry().supports(VOLUMETRIC_BEAM_SHADER_FACTORY_ID, "tsl")).toBe(
      true,
    );
  });
});
