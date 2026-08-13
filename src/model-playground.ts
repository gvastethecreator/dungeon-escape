import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

import { listBiomeIdentities } from "./systems/BiomeIdentity";
import type { DungeonRenderer } from "./systems/DungeonRenderer";
import { getDungeonMood, parseDungeonMoodId, type DungeonMoodId } from "./systems/DungeonMood";
import { createPmremAdapter } from "./systems/EnvironmentBind";
import { resolveDungeonExposure } from "./systems/LightTuning";
import {
  createPlayRendererHandle,
  readPlayRendererBackendName,
  type PlayRendererHandle,
} from "./systems/PlayRendererFactory";
import { bootPlayShaderMode } from "./systems/PlayShaderBoot";
import {
  applyMoodToDungeonMaterials,
  createDungeonMaterials,
  type DungeonMaterials,
} from "./world/MaterialLibrary";
import { ThreeResourceDisposer } from "./world/ThreeResourceDisposer";
import {
  collectModelQaMetrics,
  createIdempotentCleanup,
  createModelQaLoadBarrier,
  createModelQaModel,
  DEFAULT_MODEL_QA_ID,
  disposeModelQaResources,
  frameModelQaCamera,
  getModelQaBounds,
  getModelQaEntry,
  MODEL_QA_CATALOG,
  MODEL_QA_LOAD_TIMEOUT_MS,
  MODEL_QA_VIEWS,
  parseModelQaQuery,
  type ModelQaBounds,
  type ModelQaModelId,
  type ModelQaView,
} from "./model-lab";

export const MODEL_PLAYGROUND_VIEWS = MODEL_QA_VIEWS;
export const DEFAULT_MODEL_PLAYGROUND_ID = DEFAULT_MODEL_QA_ID;
export const DEFAULT_MODEL_PLAYGROUND_VIEW: ModelQaView = "rear-left";

export const MODEL_PLAYGROUND_GROUP_DEFS = [
  { id: "architecture", label: "Architecture", count: 12 },
  { id: "carpentry", label: "Carpentry", count: 13 },
  { id: "lighting", label: "Lighting", count: 6 },
  { id: "magic", label: "Magic", count: 9 },
  { id: "hanging", label: "Hanging", count: 7 },
  { id: "ambient", label: "Ambient", count: 8 },
] as const;

export interface ModelPlaygroundGroup {
  id: string;
  label: string;
  entries: readonly { id: ModelQaModelId; label: string }[];
}

export interface ModelPlaygroundQuery {
  id: ModelQaModelId;
  view: ModelQaView;
  mood: DungeonMoodId | "neutral";
  renderer: "auto" | "webgl" | "webgpu";
  autoRotate: boolean;
  errors: string[];
}

export interface ModelPlaygroundOrbitFrame {
  target: readonly [number, number, number];
  minDistance: number;
  maxDistance: number;
}

export interface ModelPlaygroundHandle {
  destroyed: boolean;
  destroy: () => void;
}

interface ModelPlaygroundElements {
  canvas: HTMLCanvasElement;
  title: HTMLElement;
  search: HTMLInputElement;
  select: HTMLSelectElement;
  catalog: HTMLElement;
  mood: HTMLSelectElement;
  views: HTMLElement;
  grid: HTMLButtonElement;
  axes: HTMLButtonElement;
  wire: HTMLButtonElement;
  spin: HTMLButtonElement;
  fit: HTMLButtonElement;
  metrics: HTMLElement;
  state: HTMLElement;
  error: HTMLElement;
}

export function listModelPlaygroundGroups(
  catalog: typeof MODEL_QA_CATALOG = MODEL_QA_CATALOG,
): ModelPlaygroundGroup[] {
  let offset = 0;
  const groups: ModelPlaygroundGroup[] = MODEL_PLAYGROUND_GROUP_DEFS.map((def) => {
    const slice = catalog.slice(offset, offset + def.count);
    offset += def.count;
    return {
      id: def.id,
      label: def.label,
      entries: slice.map(({ id, label }) => ({ id, label })),
    };
  });
  const extras = catalog.slice(offset);
  const doors = extras.filter((entry) => entry.id.startsWith("door-"));
  const items = extras.filter((entry) => !entry.id.startsWith("door-"));
  if (doors.length > 0) {
    groups.push({
      id: "biome-doors",
      label: "Biome doors",
      entries: doors.map(({ id, label }) => ({ id, label })),
    });
  }
  if (items.length > 0) {
    groups.push({
      id: "runtime",
      label: "Relics and items",
      entries: items.map(({ id, label }) => ({ id, label })),
    });
  }
  return groups;
}

export function flattenModelPlaygroundEntries(
  groups: readonly ModelPlaygroundGroup[],
  search = "",
): Array<{ id: ModelQaModelId; label: string }> {
  const needle = search.trim().toLowerCase();
  return groups.flatMap((group) =>
    group.entries.filter(
      (entry) =>
        !needle ||
        entry.id.includes(needle) ||
        entry.label.toLowerCase().includes(needle) ||
        group.label.toLowerCase().includes(needle),
    ),
  );
}

export function parseModelPlaygroundQuery(search: string): ModelPlaygroundQuery {
  const parsed = parseModelQaQuery(search);
  const params = new URLSearchParams(search);
  const autoRotate = params.get("spin");
  const requestedView = params.get("view")?.trim();
  return {
    ...parsed,
    view: requestedView ? parsed.view : DEFAULT_MODEL_PLAYGROUND_VIEW,
    autoRotate: autoRotate === "1" || autoRotate === "true",
  };
}

export function modelPlaygroundSearch(query: {
  id: string;
  view?: string;
  mood?: string;
  renderer?: string;
  autoRotate?: boolean;
}): string {
  const params = new URLSearchParams();
  params.set("model", query.id);
  if (query.view && query.view !== DEFAULT_MODEL_PLAYGROUND_VIEW) params.set("view", query.view);
  if (query.mood && query.mood !== "neutral") params.set("mood", query.mood);
  if (query.autoRotate) params.set("spin", "1");
  if (query.renderer && query.renderer !== "auto") params.set("renderer", query.renderer);
  const text = params.toString();
  return text ? `?${text}` : "";
}

export function frameModelPlaygroundOrbit(
  camera: THREE.PerspectiveCamera,
  bounds: ModelQaBounds,
  view: ModelQaView,
  aspect: number,
  modelId?: ModelQaModelId,
): ModelPlaygroundOrbitFrame {
  frameModelQaCamera(camera, bounds, view, aspect, modelId);
  camera.up.set(0, 1, 0);
  const target = new THREE.Vector3(...bounds.center);
  if (view === "top") {
    const distance = Math.max(camera.position.distanceTo(target), bounds.radius * 1.4);
    camera.position.set(
      target.x,
      target.y + distance,
      target.z + Math.max(0.08, bounds.radius * 0.05),
    );
    camera.lookAt(target);
  }
  camera.position.lerp(target, 0.14);
  camera.near = Math.max(0.01, bounds.radius * 0.02);
  camera.far = Math.max(80, bounds.radius * 40);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return {
    target: [target.x, target.y, target.z],
    minDistance: Math.max(0.12, bounds.radius * 0.35),
    maxDistance: Math.max(6, bounds.radius * 12),
  };
}

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Model playground element “#${id}” is missing.`);
  return element as T;
}

function playgroundElements(): ModelPlaygroundElements {
  return {
    canvas: requiredElement<HTMLCanvasElement>("model-playground-canvas"),
    title: requiredElement("model-playground-title"),
    search: requiredElement<HTMLInputElement>("model-playground-search"),
    select: requiredElement<HTMLSelectElement>("model-playground-select"),
    catalog: requiredElement("model-playground-catalog"),
    mood: requiredElement<HTMLSelectElement>("model-playground-mood"),
    views: requiredElement("model-playground-views"),
    grid: requiredElement<HTMLButtonElement>("model-playground-grid"),
    axes: requiredElement<HTMLButtonElement>("model-playground-axes"),
    wire: requiredElement<HTMLButtonElement>("model-playground-wire"),
    spin: requiredElement<HTMLButtonElement>("model-playground-spin"),
    fit: requiredElement<HTMLButtonElement>("model-playground-fit"),
    metrics: requiredElement("model-playground-metrics"),
    state: requiredElement("model-playground-state"),
    error: requiredElement("model-playground-error"),
  };
}

function setPressed(button: HTMLButtonElement, pressed: boolean): void {
  button.setAttribute("aria-pressed", pressed ? "true" : "false");
}

function isPressed(button: HTMLButtonElement): boolean {
  return button.getAttribute("aria-pressed") === "true";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function applyWireframe(root: THREE.Object3D | null, enabled: boolean): void {
  root?.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (material && "wireframe" in material) material.wireframe = enabled;
    }
  });
}

function directionalLight(
  color: number,
  intensity: number,
  position: readonly [number, number, number],
): THREE.DirectionalLight {
  const light = new THREE.DirectionalLight(color, intensity);
  light.position.set(...position);
  return light;
}

export function startModelPlayground(
  loadTimeoutMs = MODEL_QA_LOAD_TIMEOUT_MS,
): ModelPlaygroundHandle {
  window.__MODEL_PLAYGROUND__?.destroy?.();
  const query = parseModelPlaygroundQuery(window.location.search);
  const groups = listModelPlaygroundGroups();
  const handle: ModelPlaygroundHandle = { destroyed: false, destroy: () => {} };
  let elements: ModelPlaygroundElements | null = null;
  let playRendererHandle: PlayRendererHandle | null = null;
  let renderer: (THREE.WebGLRenderer & DungeonRenderer) | null = null;
  let materials: DungeonMaterials | null = null;
  let model: THREE.Group | null = null;
  let controls: OrbitControls | null = null;
  let bounds: ModelQaBounds | null = null;
  let raf = 0;
  let currentId: ModelQaModelId = query.id;
  let currentMood: DungeonMoodId | "neutral" = query.mood;
  let currentView: ModelQaView = query.view;
  let loadGeneration = 0;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
  const helpers = new THREE.Group();
  helpers.name = "Model playground helpers";
  const studioLights = new THREE.Group();
  studioLights.name = "Model playground studio lights";
  studioLights.add(
    new THREE.HemisphereLight(0xd9e0de, 0x25292b, 1.25),
    directionalLight(0xffe1bd, 2.35, [4.6, 6.2, 5.1]),
    directionalLight(0x9cb7c6, 1.25, [-4.4, 2.4, 3.2]),
    directionalLight(0xc9a77a, 1.45, [-3.5, 4.2, -4.8]),
  );
  scene.add(studioLights, helpers);
  scene.background = new THREE.Color(0x202326);

  const pageHideHandler = (): void => handle.destroy();
  const cleanups: Array<() => void> = [
    () => cancelAnimationFrame(raf),
    () => window.removeEventListener("pagehide", pageHideHandler),
    () => {
      applyWireframe(model, false);
      if (model) {
        model.removeFromParent();
        new ThreeResourceDisposer().dispose(model);
      }
    },
    () => {
      disposeModelQaResources(null, materials);
      materials = null;
    },
    () => {
      controls?.dispose();
      controls = null;
    },
    () => {
      if (scene.environment) {
        scene.environment.dispose();
        scene.environment = null;
      }
    },
    () => {
      playRendererHandle?.dispose();
      playRendererHandle = null;
      renderer = null;
    },
  ];
  const release = createIdempotentCleanup(cleanups);

  handle.destroy = () => {
    if (handle.destroyed) return;
    handle.destroyed = true;
    release();
  };
  window.__MODEL_PLAYGROUND__ = handle;
  window.addEventListener("pagehide", pageHideHandler, { once: true });

  const writeUrl = (): void => {
    const next = modelPlaygroundSearch({
      id: currentId,
      view: currentView,
      mood: currentMood,
      renderer: query.renderer,
      autoRotate: elements ? isPressed(elements.spin) : query.autoRotate,
    });
    const url = `${window.location.pathname}${next}`;
    if (`${window.location.pathname}${window.location.search}` !== url) {
      history.replaceState(null, "", url);
    }
  };

  const setStatus = (
    status: "loading" | "ready" | "error",
    errors: readonly string[] = [],
  ): void => {
    if (!elements) return;
    elements.state.textContent = status;
    elements.state.dataset.status = status;
    elements.error.hidden = errors.length === 0;
    elements.error.textContent = errors.join(" ");
  };

  const renderCatalog = (): void => {
    if (!elements) return;
    const visible = flattenModelPlaygroundEntries(groups, elements.search.value);
    const visibleIds = new Set(visible.map((entry) => entry.id));
    elements.catalog.replaceChildren();
    for (const group of groups) {
      const entries = group.entries.filter((entry) => visibleIds.has(entry.id));
      if (entries.length === 0) continue;
      const section = document.createElement("section");
      section.className = "model-playground__group";
      const heading = document.createElement("p");
      heading.className = "model-playground__group-label";
      heading.textContent = group.label;
      section.append(heading);
      for (const entry of entries) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "model-playground__entry";
        button.dataset.modelId = entry.id;
        button.textContent = entry.label;
        button.setAttribute("aria-current", entry.id === currentId ? "true" : "false");
        button.addEventListener("click", () => {
          void loadModel(entry.id, currentMood);
        });
        section.append(button);
      }
      elements.catalog.append(section);
    }

    if (elements.select.options.length === 0) {
      for (const group of groups) {
        const optgroup = document.createElement("optgroup");
        optgroup.label = group.label;
        for (const entry of group.entries) {
          const option = document.createElement("option");
          option.value = entry.id;
          option.textContent = entry.label;
          optgroup.append(option);
        }
        elements.select.append(optgroup);
      }
    }
    elements.select.value = currentId;
    const selected = getModelQaEntry(currentId);
    elements.title.textContent = selected?.label ?? currentId;
  };

  const applyStudioMood = (mood: DungeonMoodId | "neutral"): void => {
    if (!renderer) return;
    if (mood === "neutral") {
      scene.background = new THREE.Color(0x202326);
      scene.environmentIntensity = 0.42;
      renderer.toneMappingExposure = 1;
      return;
    }
    const look = getDungeonMood(mood);
    scene.background = new THREE.Color(look.background);
    scene.environmentIntensity = Math.max(0.22, look.environmentIntensity * look.iblScale);
    renderer.toneMappingExposure = resolveDungeonExposure(0.5, look.exposureBias);
  };

  const rebuildHelpers = (): void => {
    while (helpers.children.length > 0) {
      const child = helpers.children[0]!;
      helpers.remove(child);
      const object = child as THREE.Mesh;
      object.geometry?.dispose();
      const material = object.material;
      if (Array.isArray(material)) material.forEach((item) => item.dispose());
      else material?.dispose();
    }
    if (!bounds || !elements) return;
    const radius = Math.max(bounds.radius, 0.4);
    const grid = new THREE.GridHelper(Math.max(4, radius * 4), 16, 0x5d6563, 0x2c3231);
    grid.position.set(bounds.center[0], bounds.min[1], bounds.center[2]);
    grid.visible = isPressed(elements.grid);
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 2.1, 48),
      new THREE.MeshStandardMaterial({
        color: 0x1a1d1f,
        roughness: 1,
        metalness: 0,
        envMapIntensity: 0.2,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.copy(grid.position);
    ground.visible = isPressed(elements.grid);
    const axes = new THREE.AxesHelper(radius * 0.7);
    axes.position.set(...bounds.center);
    axes.visible = isPressed(elements.axes);
    helpers.add(grid, ground, axes);
  };
  cleanups.push(() => {
    bounds = null;
    rebuildHelpers();
  });

  const fitCamera = (view: ModelQaView = currentView): void => {
    if (!bounds || !controls || !renderer) return;
    currentView = view;
    const rect = elements!.canvas.getBoundingClientRect();
    const aspect = Math.max(0.01, rect.width / Math.max(1, rect.height));
    const framed = frameModelPlaygroundOrbit(camera, bounds, view, aspect, currentId);
    controls.target.set(...framed.target);
    controls.minDistance = framed.minDistance;
    controls.maxDistance = framed.maxDistance;
    controls.update();
    for (const button of elements!.views.querySelectorAll<HTMLButtonElement>("button[data-view]")) {
      setPressed(button, button.dataset.view === view);
    }
    writeUrl();
  };

  const resizeRenderer = (): void => {
    if (!renderer || !elements) return;
    const rect = elements.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  const loadModel = async (id: ModelQaModelId, mood: DungeonMoodId | "neutral"): Promise<void> => {
    if (handle.destroyed || !renderer) return;
    const generation = ++loadGeneration;
    setStatus("loading");
    applyWireframe(model, false);
    if (model) {
      model.removeFromParent();
      new ThreeResourceDisposer().dispose(model);
      model = null;
    }
    if (!materials || mood !== currentMood) {
      disposeModelQaResources(null, materials);
      materials = createDungeonMaterials();
      if (mood !== "neutral") {
        const look = getDungeonMood(mood);
        applyMoodToDungeonMaterials(materials, look.surfaceTint, 0.9 + look.surfaceStrength * 0.25);
      }
    }
    currentId = id;
    currentMood = mood;
    if (elements) elements.mood.value = mood;
    applyStudioMood(mood);
    renderCatalog();
    writeUrl();
    const barrier = createModelQaLoadBarrier(THREE.DefaultLoadingManager, loadTimeoutMs);
    try {
      model = createModelQaModel(id, materials, mood);
      scene.add(model);
      barrier.seal();
      const loadResult = await barrier.result;
      if (handle.destroyed || generation !== loadGeneration) return;
      if (loadResult.status === "error") {
        setStatus("error", loadResult.errors);
        return;
      }
      bounds = getModelQaBounds(model);
      applyWireframe(model, isPressed(elements!.wire));
      rebuildHelpers();
      fitCamera(currentView);
      const metrics = collectModelQaMetrics(model);
      elements!.metrics.textContent = `${id} · tri ${metrics.triangles} · geo ${metrics.geometries} · mat ${metrics.materials} · tex ${metrics.textures}`;
      setStatus("ready", query.errors);
    } catch (error: unknown) {
      barrier.cancel();
      if (handle.destroyed || generation !== loadGeneration) return;
      setStatus("error", [errorMessage(error)]);
    }
  };

  const cycleModel = (delta: number): void => {
    if (!elements) return;
    const visible = flattenModelPlaygroundEntries(groups, elements.search.value);
    if (visible.length === 0) return;
    const index = Math.max(
      0,
      visible.findIndex((entry) => entry.id === currentId),
    );
    const next = visible[(index + delta + visible.length) % visible.length];
    if (next) void loadModel(next.id, currentMood);
  };

  void (async () => {
    try {
      elements = playgroundElements();
      elements.mood.replaceChildren();
      const neutral = document.createElement("option");
      neutral.value = "neutral";
      neutral.textContent = "Studio";
      elements.mood.append(neutral);
      for (const biome of listBiomeIdentities()) {
        const option = document.createElement("option");
        option.value = biome.id;
        option.textContent = biome.label;
        elements.mood.append(option);
      }
      elements.mood.value = currentMood;
      for (const view of MODEL_PLAYGROUND_VIEWS) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.view = view;
        button.textContent = view;
        setPressed(button, view === currentView);
        button.addEventListener("click", () => fitCamera(view));
        elements.views.append(button);
      }
      setPressed(elements.spin, query.autoRotate);
      setPressed(elements.grid, true);
      renderCatalog();

      playRendererHandle = await createPlayRendererHandle({
        canvas: elements.canvas,
        preference: query.renderer,
        preferDefaultGpu: false,
      });
      await bootPlayShaderMode(playRendererHandle.shaderProgramMode);
      renderer = playRendererHandle.renderer as THREE.WebGLRenderer & DungeonRenderer;
      if ("setPixelRatio" in renderer) {
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      }
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1;
      (globalThis as { __rendererInfo?: unknown }).__rendererInfo = {
        app: "model-playground",
        requested: playRendererHandle.requested,
        backend: playRendererHandle.backend,
        backendName: readPlayRendererBackendName(playRendererHandle),
        isWebGpuRenderer: playRendererHandle.isWebGpuRenderer,
      };

      try {
        const pmrem = await createPmremAdapter(renderer);
        if (pmrem) {
          await Promise.resolve(pmrem.compileEquirectangularShader());
          const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
          scene.environment = envMap;
          scene.environmentIntensity = 0.42;
          pmrem.dispose();
        }
      } catch (error) {
        console.warn("Model playground environment bind failed", error);
      }

      controls = new OrbitControls(camera, elements.canvas);
      controls.enableDamping = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      controls.autoRotate = query.autoRotate;
      controls.autoRotateSpeed = 1.4;
      controls.screenSpacePanning = true;
      controls.update();

      const onResize = (): void => {
        resizeRenderer();
      };
      const onSearch = (): void => renderCatalog();
      const onSelect = (): void => {
        const requested = elements!.select.value;
        if (getModelQaEntry(requested)) void loadModel(requested as ModelQaModelId, currentMood);
      };
      const onMood = (): void => {
        const nextMood =
          elements!.mood.value === "neutral"
            ? "neutral"
            : (parseDungeonMoodId(elements!.mood.value) ?? "neutral");
        void loadModel(currentId, nextMood);
      };
      const onGrid = (): void => {
        setPressed(elements!.grid, !isPressed(elements!.grid));
        rebuildHelpers();
      };
      const onAxes = (): void => {
        setPressed(elements!.axes, !isPressed(elements!.axes));
        rebuildHelpers();
      };
      const onWire = (): void => {
        setPressed(elements!.wire, !isPressed(elements!.wire));
        applyWireframe(model, isPressed(elements!.wire));
      };
      const onSpin = (): void => {
        const next = !isPressed(elements!.spin);
        setPressed(elements!.spin, next);
        if (controls) controls.autoRotate = next;
        writeUrl();
      };
      const onFit = (): void => fitCamera(currentView);
      const onKeyDown = (event: KeyboardEvent): void => {
        if (handle.destroyed || !elements) return;
        const typing =
          event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement;
        if (typing) return;
        if (event.key === "ArrowLeft" || event.key === "[") {
          event.preventDefault();
          cycleModel(-1);
        } else if (event.key === "ArrowRight" || event.key === "]") {
          event.preventDefault();
          cycleModel(1);
        } else if (event.key === "r" || event.key === "R") {
          event.preventDefault();
          fitCamera(currentView);
        } else if (event.key === "g" || event.key === "G") {
          elements.grid.click();
        } else if (event.key === "w" || event.key === "W") {
          elements.wire.click();
        } else if (event.key === "a" || event.key === "A") {
          elements.spin.click();
        } else if (event.key === "x" || event.key === "X") {
          elements.axes.click();
        } else if (/^[1-6]$/.test(event.key)) {
          const view = MODEL_PLAYGROUND_VIEWS[Number(event.key) - 1];
          if (view) fitCamera(view);
        }
      };

      window.addEventListener("resize", onResize, { passive: true });
      window.addEventListener("keydown", onKeyDown);
      elements.search.addEventListener("input", onSearch);
      elements.select.addEventListener("change", onSelect);
      elements.mood.addEventListener("change", onMood);
      elements.grid.addEventListener("click", onGrid);
      elements.axes.addEventListener("click", onAxes);
      elements.wire.addEventListener("click", onWire);
      elements.spin.addEventListener("click", onSpin);
      elements.fit.addEventListener("click", onFit);
      elements.canvas.addEventListener("dblclick", onFit);
      cleanups.push(
        () => window.removeEventListener("resize", onResize),
        () => window.removeEventListener("keydown", onKeyDown),
        () => elements?.search.removeEventListener("input", onSearch),
        () => elements?.select.removeEventListener("change", onSelect),
        () => elements?.mood.removeEventListener("change", onMood),
        () => elements?.grid.removeEventListener("click", onGrid),
        () => elements?.axes.removeEventListener("click", onAxes),
        () => elements?.wire.removeEventListener("click", onWire),
        () => elements?.spin.removeEventListener("click", onSpin),
        () => elements?.fit.removeEventListener("click", onFit),
        () => elements?.canvas.removeEventListener("dblclick", onFit),
      );

      resizeRenderer();
      await loadModel(currentId, currentMood);

      const tick = (): void => {
        if (handle.destroyed || !renderer || !controls) return;
        raf = requestAnimationFrame(tick);
        controls.update();
        renderer.render(scene, camera);
      };
      tick();
    } catch (error: unknown) {
      setStatus("error", [errorMessage(error)]);
      handle.destroy();
    }
  })();

  return handle;
}

declare global {
  interface Window {
    __MODEL_PLAYGROUND__?: ModelPlaygroundHandle;
  }
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  if (document.getElementById("model-playground-canvas")) startModelPlayground();
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => window.__MODEL_PLAYGROUND__?.destroy?.());
}
