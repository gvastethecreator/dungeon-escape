import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import {
  DEFAULT_MODEL_QA_ID,
  MODEL_QA_CATALOG,
  MODEL_QA_REFERENCE_COUNT,
  createModelQaModel,
  getModelQaBounds,
} from "../src/model-lab";
import {
  DEFAULT_MODEL_PLAYGROUND_ID,
  flattenModelPlaygroundEntries,
  frameModelPlaygroundOrbit,
  listModelPlaygroundGroups,
  modelPlaygroundSearch,
  parseModelPlaygroundQuery,
} from "../src/model-playground";
import { createDungeonMaterials } from "../src/world/MaterialLibrary";

describe("model playground", () => {
  test("exposes an interactive page with camera controls and a catalog", async () => {
    const html = await Bun.file(new URL("../model-playground.html", import.meta.url)).text();
    const css = await Bun.file(new URL("../src/model-playground.css", import.meta.url)).text();
    const vite = await Bun.file(new URL("../vite.config.ts", import.meta.url)).text();
    const audit = await Bun.file(
      new URL("../scripts/audit-runtime-assets.ts", import.meta.url),
    ).text();

    expect(html).toContain('id="model-playground-canvas"');
    expect(html).toContain('id="model-playground-catalog"');
    expect(html).toContain('id="model-playground-mood"');
    expect(html).toContain("LMB orbit");
    expect(css).toContain("#model-playground-canvas:focus-visible");
    expect(css).toContain("touch-action: none");
    expect(vite).toContain("model-playground.html");
    expect(audit).toContain("model-playground.html");
  });

  test("groups partition the runtime catalog without dropping extras", () => {
    const groups = listModelPlaygroundGroups();
    const ids = groups.flatMap((group) => group.entries.map((entry) => entry.id));

    expect(DEFAULT_MODEL_PLAYGROUND_ID).toBe(DEFAULT_MODEL_QA_ID);
    expect(groups.slice(0, 6).reduce((count, group) => count + group.entries.length, 0)).toBe(
      MODEL_QA_REFERENCE_COUNT,
    );
    expect(ids).toEqual(MODEL_QA_CATALOG.map((entry) => entry.id));
    expect(groups.some((group) => group.id === "biome-doors")).toBe(true);
    expect(groups.some((group) => group.id === "runtime")).toBe(true);
  });

  test("filters catalog entries by id, label, or group name", () => {
    const groups = listModelPlaygroundGroups();
    const doors = flattenModelPlaygroundEntries(groups, "door");
    const relics = flattenModelPlaygroundEntries(groups, "relics");

    expect(doors.length).toBeGreaterThan(0);
    expect(doors.every((entry) => /door/i.test(entry.id) || /door/i.test(entry.label))).toBe(true);
    expect(relics.some((entry) => entry.id === "phoenix-egg")).toBe(true);
  });

  test("parses and serializes model, mood, view, and spin query state", () => {
    expect(parseModelPlaygroundQuery("?model=crypt-stone")).toMatchObject({
      id: "crypt-stone",
      view: "rear-left",
      mood: "neutral",
      renderer: "auto",
      autoRotate: false,
      errors: [],
    });
    expect(parseModelPlaygroundQuery("?model=crypt-stone&view=top&mood=frost&spin=1")).toEqual({
      id: "crypt-stone",
      view: "top",
      mood: "frost",
      renderer: "auto",
      autoRotate: true,
      errors: [],
    });

    expect(modelPlaygroundSearch({ id: "treasure-chest" })).toBe("?model=treasure-chest");
    expect(
      modelPlaygroundSearch({
        id: "crypt-stone",
        view: "top",
        mood: "frost",
        autoRotate: true,
        renderer: "webgpu",
      }),
    ).toBe("?model=crypt-stone&view=top&mood=frost&spin=1&renderer=webgpu");
  });

  test("frames an orbit camera on the model bounds with a stable Y-up", () => {
    const root = createModelQaModel("reliquary-altar", createDungeonMaterials({ compact: true }));
    const bounds = getModelQaBounds(root);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);

    const framed = frameModelPlaygroundOrbit(camera, bounds, "right", 16 / 9, "reliquary-altar");
    expect(framed.target).toEqual(bounds.center);
    expect(camera.up.y).toBe(1);
    expect(camera.position.x).toBeGreaterThan(bounds.center[0]);
    expect(camera.near).toBeLessThan(bounds.radius);
    expect(camera.far).toBeGreaterThan(bounds.radius * 8);
    expect(framed.minDistance).toBeGreaterThan(0);
    expect(framed.maxDistance).toBeGreaterThan(framed.minDistance);

    const top = frameModelPlaygroundOrbit(camera, bounds, "top", 1, "reliquary-altar");
    expect(camera.position.y).toBeGreaterThan(bounds.center[1]);
    expect(camera.position.z).toBeGreaterThan(top.target[2]);
    expect(camera.up.y).toBe(1);
  });
});
