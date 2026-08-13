import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { listBiomeIdentities } from "./systems/BiomeIdentity";
import { parseDungeonMoodId, type DungeonMoodId } from "./systems/DungeonMood";
import { ITEM_FRAMES } from "./world/AssetLibrary";
import { enemyGroundY, getEnemySpriteRenderMetrics } from "./world/EnemyArchetypes";
import {
  animationFrameIndex,
  enemyAnimationSetsForMood,
  enemyAttackFrameIndex,
  ENEMY_ROSTER,
  type EnemyAnimationDefinition,
  type EnemyRosterKind,
} from "./world/EnemySpriteAtlas";
import {
  biomeSpriteDecorAtlasFrame,
  BIOME_SPRITE_DECOR_ATLAS_SIZE,
} from "./world/BiomeSpriteDecorContract";
import {
  biomeSpriteDecorCatalog,
  biomeSpriteDecorTextureUrl,
} from "./world/BiomeSpriteDecorCatalogs.generated";
import {
  advanceUncannyWallPlayback,
  createUncannyWallPlayback,
  sampleUncannyWallPlayback,
  type UncannyWallPlaybackState,
} from "./world/UncannyWallRuntime";
import {
  UNCANNY_WALL_ATLAS_COLUMNS,
  UNCANNY_WALL_ATLAS_SIZE,
  uncannyWallAnimations,
  uncannyWallAtlasUrl,
} from "./world/UncannyWallCatalog.generated";

export const SPRITE_PLAYGROUND_FAMILIES = ["enemy", "prop", "uncanny", "item"] as const;
export type SpritePlaygroundFamily = (typeof SPRITE_PLAYGROUND_FAMILIES)[number];
export const SPRITE_PLAYGROUND_CLIPS = ["movement", "attack"] as const;
export type SpritePlaygroundClip = (typeof SPRITE_PLAYGROUND_CLIPS)[number];

export const DEFAULT_SPRITE_PLAYGROUND_ID = "goblin";
export const DEFAULT_SPRITE_PLAYGROUND_MOOD: DungeonMoodId = "ash";
export const DEFAULT_SPRITE_PLAYGROUND_CLIP: SpritePlaygroundClip = "movement";

export const SPRITE_PLAYGROUND_ITEM_ENTRIES = [
  { key: "skullSeal", label: "Skull seal" },
  { key: "resolveFlask", label: "Resolve flask" },
  { key: "ironKey", label: "Iron key" },
  { key: "reliquary", label: "Reliquary" },
] as const;

export type SpritePlaygroundItemKey = (typeof SPRITE_PLAYGROUND_ITEM_ENTRIES)[number]["key"];

export interface SpritePlaygroundEntry {
  id: string;
  family: SpritePlaygroundFamily;
  key: string;
  label: string;
  animated: boolean;
}

export interface SpritePlaygroundGroup {
  id: SpritePlaygroundFamily;
  label: string;
  entries: readonly SpritePlaygroundEntry[];
}

export interface SpritePlaygroundQuery {
  id: string;
  family: SpritePlaygroundFamily;
  key: string;
  mood: DungeonMoodId;
  clip: SpritePlaygroundClip;
  errors: string[];
}

export interface SpritePlaygroundAtlasUv {
  offsetX: number;
  offsetY: number;
  repeatX: number;
  repeatY: number;
}

export interface SpritePlaygroundHandle {
  destroyed: boolean;
  destroy: () => void;
}

interface SpritePlaygroundElements {
  canvas: HTMLCanvasElement;
  title: HTMLElement;
  search: HTMLInputElement;
  select: HTMLSelectElement;
  catalog: HTMLElement;
  mood: HTMLSelectElement;
  move: HTMLButtonElement;
  attack: HTMLButtonElement;
  play: HTMLButtonElement;
  prev: HTMLButtonElement;
  next: HTMLButtonElement;
  grid: HTMLButtonElement;
  billboard: HTMLButtonElement;
  fit: HTMLButtonElement;
  speed: HTMLInputElement;
  metrics: HTMLElement;
  state: HTMLElement;
  error: HTMLElement;
}

const ITEM_ATLAS_SRC = "/assets/sprites/iron-ash-items.webp";
const ITEM_ATLAS_SIZE = [887, 443] as const;

export function spritePlaygroundEnemyLabel(kind: EnemyRosterKind): string {
  return kind.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function spritePlaygroundAtlasUv(
  frame: { x: number; y: number; w: number; h: number },
  size: readonly [number, number],
): SpritePlaygroundAtlasUv {
  return {
    offsetX: frame.x / size[0],
    offsetY: 1 - (frame.y + frame.h) / size[1],
    repeatX: frame.w / size[0],
    repeatY: frame.h / size[1],
  };
}

export function uncannyWallFrameRect(
  slot: number,
  frame: number,
): { x: number; y: number; w: number; h: number } {
  const cell = UNCANNY_WALL_ATLAS_SIZE[0] / UNCANNY_WALL_ATLAS_COLUMNS;
  const column =
    ((frame % UNCANNY_WALL_ATLAS_COLUMNS) + UNCANNY_WALL_ATLAS_COLUMNS) %
    UNCANNY_WALL_ATLAS_COLUMNS;
  const row = Math.min(UNCANNY_WALL_ATLAS_COLUMNS - 1, Math.max(0, Math.trunc(slot)));
  return { x: column * cell, y: row * cell, w: cell, h: cell };
}

export function listSpritePlaygroundGroups(mood: DungeonMoodId): SpritePlaygroundGroup[] {
  return [
    {
      id: "enemy",
      label: "Enemies",
      entries: ENEMY_ROSTER.map((kind) => ({
        id: kind,
        family: "enemy" as const,
        key: kind,
        label: spritePlaygroundEnemyLabel(kind),
        animated: true,
      })),
    },
    {
      id: "prop",
      label: "Biome props",
      entries: biomeSpriteDecorCatalog(mood).props.map((prop) => ({
        id: `prop:${prop.id}`,
        family: "prop" as const,
        key: prop.id,
        label: prop.label,
        animated: false,
      })),
    },
    {
      id: "uncanny",
      label: "Uncanny walls",
      entries: uncannyWallAnimations(mood).map((wall) => ({
        id: `uncanny:${wall.id}`,
        family: "uncanny" as const,
        key: wall.id,
        label: wall.label,
        animated: true,
      })),
    },
    {
      id: "item",
      label: "Items",
      entries: SPRITE_PLAYGROUND_ITEM_ENTRIES.map((item) => ({
        id: `item:${item.key}`,
        family: "item" as const,
        key: item.key,
        label: item.label,
        animated: false,
      })),
    },
  ];
}

export function flattenSpritePlaygroundEntries(
  groups: readonly SpritePlaygroundGroup[],
  search = "",
): SpritePlaygroundEntry[] {
  const needle = search.trim().toLowerCase();
  return groups.flatMap((group) =>
    group.entries.filter(
      (entry) =>
        !needle ||
        entry.id.toLowerCase().includes(needle) ||
        entry.key.toLowerCase().includes(needle) ||
        entry.label.toLowerCase().includes(needle) ||
        group.label.toLowerCase().includes(needle),
    ),
  );
}

export function findSpritePlaygroundEntry(
  groups: readonly SpritePlaygroundGroup[],
  requested: string,
): SpritePlaygroundEntry | undefined {
  const trimmed = requested.trim();
  if (!trimmed) return undefined;
  const all = flattenSpritePlaygroundEntries(groups);
  return (
    all.find((entry) => entry.id === trimmed) ??
    all.find((entry) => entry.key === trimmed) ??
    all.find((entry) => entry.family === "enemy" && entry.key === trimmed)
  );
}

export function parseSpritePlaygroundQuery(search: string): SpritePlaygroundQuery {
  const params = new URLSearchParams(search);
  const errors: string[] = [];
  const requestedMood = params.get("mood")?.trim();
  const parsedMood = parseDungeonMoodId(requestedMood);
  const mood = parsedMood ?? DEFAULT_SPRITE_PLAYGROUND_MOOD;
  if (requestedMood && !parsedMood) {
    errors.push(`Unknown mood “${requestedMood}”; using ${DEFAULT_SPRITE_PLAYGROUND_MOOD}.`);
  }

  const requestedClip = params.get("clip")?.trim();
  const clip: SpritePlaygroundClip =
    requestedClip === "attack" || requestedClip === "movement"
      ? requestedClip
      : DEFAULT_SPRITE_PLAYGROUND_CLIP;
  if (requestedClip && clip !== requestedClip) {
    errors.push(`Unknown clip “${requestedClip}”; using movement.`);
  }

  const groups = listSpritePlaygroundGroups(mood);
  const requestedId = params.get("sprite")?.trim() ?? DEFAULT_SPRITE_PLAYGROUND_ID;
  const entry =
    findSpritePlaygroundEntry(groups, requestedId) ??
    findSpritePlaygroundEntry(groups, DEFAULT_SPRITE_PLAYGROUND_ID)!;
  if (!findSpritePlaygroundEntry(groups, requestedId)) {
    errors.push(`Unknown sprite “${requestedId}”; using ${entry.label}.`);
  }

  return {
    id: entry.id,
    family: entry.family,
    key: entry.key,
    mood,
    clip: entry.family === "enemy" ? clip : DEFAULT_SPRITE_PLAYGROUND_CLIP,
    errors,
  };
}

/** Keep the current orbit offset when the subject origin changes. */
export function retainSpritePlaygroundOrbit(
  camera: THREE.PerspectiveCamera,
  previousTarget: THREE.Vector3Like,
  nextTarget: THREE.Vector3Like,
): void {
  camera.position.x += nextTarget.x - previousTarget.x;
  camera.position.y += nextTarget.y - previousTarget.y;
  camera.position.z += nextTarget.z - previousTarget.z;
}

export function spritePlaygroundSearch(query: {
  id: string;
  mood?: string;
  clip?: string;
}): string {
  const params = new URLSearchParams();
  params.set("sprite", query.id);
  if (query.mood && query.mood !== DEFAULT_SPRITE_PLAYGROUND_MOOD) params.set("mood", query.mood);
  if (query.clip && query.clip !== DEFAULT_SPRITE_PLAYGROUND_CLIP) params.set("clip", query.clip);
  const text = params.toString();
  return text ? `?${text}` : "";
}

function isEnemyKind(value: string): value is EnemyRosterKind {
  return ENEMY_ROSTER.some((kind) => kind === value);
}

function isItemKey(value: string): value is SpritePlaygroundItemKey {
  return SPRITE_PLAYGROUND_ITEM_ENTRIES.some((item) => item.key === value);
}

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Sprite playground element “#${id}” is missing.`);
  return element as T;
}

function playgroundElements(): SpritePlaygroundElements {
  return {
    canvas: requiredElement<HTMLCanvasElement>("sprite-playground-canvas"),
    title: requiredElement("sprite-playground-title"),
    search: requiredElement<HTMLInputElement>("sprite-playground-search"),
    select: requiredElement<HTMLSelectElement>("sprite-playground-select"),
    catalog: requiredElement("sprite-playground-catalog"),
    mood: requiredElement<HTMLSelectElement>("sprite-playground-mood"),
    move: requiredElement<HTMLButtonElement>("sprite-playground-clip-move"),
    attack: requiredElement<HTMLButtonElement>("sprite-playground-clip-attack"),
    play: requiredElement<HTMLButtonElement>("sprite-playground-play"),
    prev: requiredElement<HTMLButtonElement>("sprite-playground-prev"),
    next: requiredElement<HTMLButtonElement>("sprite-playground-next"),
    grid: requiredElement<HTMLButtonElement>("sprite-playground-grid"),
    billboard: requiredElement<HTMLButtonElement>("sprite-playground-billboard"),
    fit: requiredElement<HTMLButtonElement>("sprite-playground-fit"),
    speed: requiredElement<HTMLInputElement>("sprite-playground-speed"),
    metrics: requiredElement("sprite-playground-metrics"),
    state: requiredElement("sprite-playground-state"),
    error: requiredElement("sprite-playground-error"),
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

function createIdempotentCleanup(actions: Array<() => void>): () => void {
  let done = false;
  return () => {
    if (done) return;
    done = true;
    for (const action of actions) {
      try {
        action();
      } catch {
        /* playground teardown is best-effort */
      }
    }
  };
}

function applyTextureFrame(
  texture: THREE.Texture,
  frame: { x: number; y: number; w: number; h: number },
  size: readonly [number, number],
): void {
  const uv = spritePlaygroundAtlasUv(frame, size);
  texture.offset.set(uv.offsetX, uv.offsetY);
  texture.repeat.set(uv.repeatX, uv.repeatY);
}

export function startSpritePlayground(): SpritePlaygroundHandle {
  window.__SPRITE_PLAYGROUND__?.destroy?.();
  const query = parseSpritePlaygroundQuery(window.location.search);
  const handle: SpritePlaygroundHandle = { destroyed: false, destroy: () => {} };
  let elements: SpritePlaygroundElements | null = null;
  let renderer: THREE.WebGLRenderer | null = null;
  let controls: OrbitControls | null = null;
  let mesh: THREE.Mesh | null = null;
  let material: THREE.MeshBasicMaterial | null = null;
  let raf = 0;
  let currentId = query.id;
  let currentMood = query.mood;
  let currentClip: SpritePlaygroundClip = query.clip;
  let elapsed = 0;
  let attackPulse = 0;
  let frameIndex = 0;
  let frameCount = 1;
  let loadGeneration = 0;
  let animation: EnemyAnimationDefinition | null = null;
  let uncannyPlayback: UncannyWallPlaybackState | null = null;
  let uncannyDurations: readonly [number, number, number, number] | null = null;
  let planeWidth = 1;
  let planeHeight = 1;
  let lastFrameMs = performance.now();
  let cameraFramed = false;
  const textureCache = new Map<string, THREE.Texture>();
  const loader = new THREE.TextureLoader();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1c1e);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 80);
  const helpers = new THREE.Group();
  helpers.name = "Sprite playground helpers";
  scene.add(helpers);

  const pageHideHandler = (): void => handle.destroy();
  const cleanups: Array<() => void> = [
    () => cancelAnimationFrame(raf),
    () => window.removeEventListener("pagehide", pageHideHandler),
    () => {
      mesh?.removeFromParent();
      mesh?.geometry.dispose();
      material?.dispose();
    },
    () => {
      for (const texture of textureCache.values()) texture.dispose();
      textureCache.clear();
    },
    () => {
      controls?.dispose();
      controls = null;
    },
    () => {
      renderer?.dispose();
      renderer = null;
    },
  ];
  const release = createIdempotentCleanup(cleanups);
  handle.destroy = () => {
    if (handle.destroyed) return;
    handle.destroyed = true;
    release();
  };
  window.__SPRITE_PLAYGROUND__ = handle;
  window.addEventListener("pagehide", pageHideHandler, { once: true });

  const groupsForMood = (): SpritePlaygroundGroup[] => listSpritePlaygroundGroups(currentMood);
  const currentEntry = (): SpritePlaygroundEntry =>
    findSpritePlaygroundEntry(groupsForMood(), currentId) ??
    findSpritePlaygroundEntry(groupsForMood(), DEFAULT_SPRITE_PLAYGROUND_ID)!;

  const writeUrl = (): void => {
    const next = spritePlaygroundSearch({
      id: currentId,
      mood: currentMood,
      clip: currentClip,
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
    const groups = groupsForMood();
    const visible = flattenSpritePlaygroundEntries(groups, elements.search.value);
    const visibleIds = new Set(visible.map((entry) => entry.id));
    elements.catalog.replaceChildren();
    for (const group of groups) {
      const entries = group.entries.filter((entry) => visibleIds.has(entry.id));
      if (entries.length === 0) continue;
      const section = document.createElement("section");
      section.className = "sprite-playground__group";
      const heading = document.createElement("p");
      heading.className = "sprite-playground__group-label";
      heading.textContent = group.label;
      section.append(heading);
      for (const entry of entries) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "sprite-playground__entry";
        button.dataset.spriteId = entry.id;
        button.textContent = entry.label;
        button.setAttribute("aria-current", entry.id === currentId ? "true" : "false");
        button.addEventListener("click", () => {
          void loadSprite(entry.id, currentMood);
        });
        section.append(button);
      }
      elements.catalog.append(section);
    }

    elements.select.replaceChildren();
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
    elements.select.value = currentId;
    elements.title.textContent = currentEntry().label;
    const canAttack = currentEntry().family === "enemy";
    elements.attack.disabled = !canAttack;
    setPressed(elements.move, currentClip === "movement" || !canAttack);
    setPressed(elements.attack, canAttack && currentClip === "attack");
  };

  const rebuildHelpers = (): void => {
    while (helpers.children.length > 0) {
      const child = helpers.children[0]!;
      helpers.remove(child);
      const object = child as THREE.Mesh;
      object.geometry?.dispose();
      const helperMaterial = object.material;
      if (Array.isArray(helperMaterial)) helperMaterial.forEach((item) => item.dispose());
      else helperMaterial?.dispose();
    }
    if (!elements || !isPressed(elements.grid)) return;
    const span = Math.max(4, Math.max(planeWidth, planeHeight) * 4);
    const grid = new THREE.GridHelper(span, 16, 0x5d6563, 0x2c3231);
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(Math.max(planeWidth, planeHeight) * 1.4, 48),
      new THREE.MeshBasicMaterial({ color: 0x151719, transparent: true, opacity: 0.9 }),
    );
    ground.rotation.x = -Math.PI / 2;
    helpers.add(grid, ground);
  };

  const fitCamera = (): void => {
    if (!controls || !mesh) return;
    const radius = Math.max(0.4, Math.hypot(planeWidth, planeHeight) * 0.5);
    const target = mesh.position.clone();
    camera.up.set(0, 1, 0);
    camera.position.set(
      target.x + radius * 1.15,
      target.y + radius * 0.42,
      target.z + radius * 1.85,
    );
    camera.near = Math.max(0.05, radius * 0.05);
    camera.far = Math.max(40, radius * 20);
    camera.updateProjectionMatrix();
    controls.target.copy(target);
    controls.minDistance = Math.max(0.4, radius * 0.6);
    controls.maxDistance = Math.max(8, radius * 10);
    controls.update();
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

  const updateMetrics = (): void => {
    if (!elements) return;
    const entry = currentEntry();
    const clipLabel = entry.family === "enemy" ? currentClip : entry.animated ? "loop" : "still";
    elements.metrics.textContent = `${entry.id} · ${currentMood} · ${clipLabel} ${frameIndex + 1}/${frameCount}`;
  };

  const applyCurrentFrame = (): void => {
    if (!material?.map) return;
    if (animation) {
      const safeIndex =
        ((frameIndex % animation.frames.length) + animation.frames.length) %
        animation.frames.length;
      applyTextureFrame(material.map, animation.frames[safeIndex]!, animation.size);
      return;
    }
    if (uncannyPlayback && uncannyDurations) {
      const sample = sampleUncannyWallPlayback(uncannyPlayback, uncannyDurations, false);
      const slot = Number(mesh?.userData.uncannySlot ?? 0);
      applyTextureFrame(
        material.map,
        uncannyWallFrameRect(slot, sample.frameA),
        UNCANNY_WALL_ATLAS_SIZE,
      );
      frameIndex = sample.frameA;
      frameCount = 4;
    }
  };

  const loadTexture = (src: string): Promise<THREE.Texture> => {
    const cached = textureCache.get(src);
    if (cached) return Promise.resolve(cached);
    return new Promise((resolve, reject) => {
      loader.load(
        src,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.magFilter = THREE.NearestFilter;
          texture.minFilter = THREE.NearestFilter;
          texture.generateMipmaps = false;
          texture.wrapS = THREE.ClampToEdgeWrapping;
          texture.wrapT = THREE.ClampToEdgeWrapping;
          textureCache.set(src, texture);
          resolve(texture);
        },
        undefined,
        (error) => reject(error instanceof Error ? error : new Error(`Failed to load ${src}`)),
      );
    });
  };

  const loadSprite = async (id: string, mood: DungeonMoodId): Promise<void> => {
    if (handle.destroyed) return;
    const generation = ++loadGeneration;
    currentMood = mood;
    const groups = listSpritePlaygroundGroups(mood);
    const entry =
      findSpritePlaygroundEntry(groups, id) ??
      findSpritePlaygroundEntry(groups, DEFAULT_SPRITE_PLAYGROUND_ID)!;
    currentId = entry.id;
    if (entry.family !== "enemy") currentClip = "movement";
    elapsed = 0;
    attackPulse = currentClip === "attack" ? 1 : 0;
    animation = null;
    uncannyPlayback = null;
    uncannyDurations = null;
    if (elements) elements.mood.value = mood;
    renderCatalog();
    writeUrl();
    setStatus("loading");

    try {
      let src = "";
      let size: readonly [number, number] = [1, 1];
      let frame = { x: 0, y: 0, w: 1, h: 1 };
      planeWidth = 1.2;
      planeHeight = 1.2;
      let groundY = planeHeight * 0.5;

      if (entry.family === "enemy" && isEnemyKind(entry.key)) {
        const sets = enemyAnimationSetsForMood(mood);
        const clip =
          currentClip === "attack" && sets[entry.key].attack
            ? sets[entry.key].attack!
            : sets[entry.key].movement;
        animation = clip;
        src = clip.src;
        size = clip.size;
        frame = clip.frames[0]!;
        frameCount = clip.frames.length;
        frameIndex = 0;
        const metrics = getEnemySpriteRenderMetrics(entry.key, mood);
        planeWidth = metrics.planeWidth;
        planeHeight = metrics.planeHeight;
        groundY = enemyGroundY(entry.key, mood);
      } else if (entry.family === "prop") {
        const prop = biomeSpriteDecorCatalog(mood).props.find((item) => item.id === entry.key);
        if (!prop) throw new Error(`Biome prop “${entry.key}” is missing.`);
        src = biomeSpriteDecorTextureUrl(mood);
        size = BIOME_SPRITE_DECOR_ATLAS_SIZE;
        frame = biomeSpriteDecorAtlasFrame(prop.slot);
        frameCount = 1;
        frameIndex = 0;
        planeWidth = prop.worldSize.width;
        planeHeight = prop.worldSize.height;
        groundY =
          prop.placement === "ceiling-hanging" ? 2.4 - planeHeight * 0.5 : planeHeight * 0.5;
      } else if (entry.family === "uncanny") {
        const wall = uncannyWallAnimations(mood).find((item) => item.id === entry.key);
        if (!wall) throw new Error(`Uncanny wall “${entry.key}” is missing.`);
        src = uncannyWallAtlasUrl(mood);
        size = UNCANNY_WALL_ATLAS_SIZE;
        frame = uncannyWallFrameRect(wall.slot, 0);
        frameCount = 4;
        frameIndex = 0;
        planeWidth = wall.worldSize.width;
        planeHeight = wall.worldSize.height;
        groundY = planeHeight * 0.5;
        uncannyPlayback = createUncannyWallPlayback(1);
        uncannyPlayback.mode = "animate";
        uncannyPlayback.remainingSeconds = wall.frameDurationsMs[0]! / 1000;
        uncannyDurations = wall.frameDurationsMs;
      } else if (entry.family === "item" && isItemKey(entry.key)) {
        src = ITEM_ATLAS_SRC;
        size = ITEM_ATLAS_SIZE;
        frame = ITEM_FRAMES[entry.key];
        frameCount = 1;
        frameIndex = 0;
        planeWidth = 0.82;
        planeHeight = 1.64;
        groundY = planeHeight * 0.5;
      } else {
        throw new Error(`Sprite “${entry.id}” cannot be resolved.`);
      }

      const texture = await loadTexture(src);
      if (handle.destroyed || generation !== loadGeneration) return;
      applyTextureFrame(texture, frame, size);
      mesh?.removeFromParent();
      mesh?.geometry.dispose();
      material?.dispose();
      material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.14,
        depthWrite: true,
        side: THREE.DoubleSide,
      });
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(planeWidth, planeHeight), material);
      mesh.name = `Sprite playground · ${entry.label}`;
      mesh.position.set(0, groundY, 0);
      mesh.userData.uncannySlot =
        entry.family === "uncanny"
          ? (uncannyWallAnimations(mood).find((item) => item.id === entry.key)?.slot ?? 0)
          : 0;
      scene.add(mesh);
      rebuildHelpers();
      if (!cameraFramed) {
        fitCamera();
        cameraFramed = true;
      } else if (controls) {
        const previousTarget = controls.target.clone();
        retainSpritePlaygroundOrbit(camera, previousTarget, mesh.position);
        controls.target.copy(mesh.position);
        controls.update();
      }
      updateMetrics();
      setStatus("ready", query.errors);
    } catch (error: unknown) {
      if (handle.destroyed || generation !== loadGeneration) return;
      setStatus("error", [errorMessage(error)]);
    }
  };

  const cycleSprite = (delta: number): void => {
    if (!elements) return;
    const visible = flattenSpritePlaygroundEntries(groupsForMood(), elements.search.value);
    if (visible.length === 0) return;
    const index = Math.max(
      0,
      visible.findIndex((entry) => entry.id === currentId),
    );
    const next = visible[(index + delta + visible.length) % visible.length];
    if (next) void loadSprite(next.id, currentMood);
  };

  const stepFrame = (delta: number): void => {
    if (!elements) return;
    setPressed(elements.play, false);
    if (animation) {
      frameIndex = (frameIndex + delta + animation.frames.length) % animation.frames.length;
      elapsed = frameIndex / Math.max(1, animation.fps);
      applyCurrentFrame();
      updateMetrics();
      return;
    }
    if (uncannyPlayback) {
      frameIndex = (frameIndex + delta + 4) % 4;
      uncannyPlayback.mode = "animate";
      uncannyPlayback.frame = frameIndex;
      applyCurrentFrame();
      updateMetrics();
    }
  };

  const playAttack = (): void => {
    if (currentEntry().family !== "enemy") return;
    currentClip = "attack";
    attackPulse = 1;
    elapsed = 0;
    if (elements) setPressed(elements.play, true);
    void loadSprite(currentId, currentMood);
  };

  void (async () => {
    try {
      elements = playgroundElements();
      for (const biome of listBiomeIdentities()) {
        const option = document.createElement("option");
        option.value = biome.id;
        option.textContent = biome.label;
        elements.mood.append(option);
      }
      elements.mood.value = currentMood;
      setPressed(elements.play, true);
      setPressed(elements.grid, true);
      setPressed(elements.billboard, true);
      renderCatalog();

      renderer = new THREE.WebGLRenderer({
        canvas: elements.canvas,
        antialias: false,
        alpha: false,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      controls = new OrbitControls(camera, elements.canvas);
      controls.enableDamping = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      controls.screenSpacePanning = true;

      const onResize = (): void => resizeRenderer();
      const onSearch = (): void => renderCatalog();
      const onSelect = (): void => {
        void loadSprite(elements!.select.value, currentMood);
      };
      const onMood = (): void => {
        const nextMood = parseDungeonMoodId(elements!.mood.value) ?? DEFAULT_SPRITE_PLAYGROUND_MOOD;
        const previous = currentEntry();
        const nextGroups = listSpritePlaygroundGroups(nextMood);
        const same = findSpritePlaygroundEntry(nextGroups, previous.id);
        const fallback =
          nextGroups.find((group) => group.id === previous.family)?.entries[0] ??
          findSpritePlaygroundEntry(nextGroups, DEFAULT_SPRITE_PLAYGROUND_ID)!;
        void loadSprite((same ?? fallback).id, nextMood);
      };
      const onMoveClip = (): void => {
        currentClip = "movement";
        void loadSprite(currentId, currentMood);
      };
      const onAttackClip = (): void => playAttack();
      const onPlay = (): void => setPressed(elements!.play, !isPressed(elements!.play));
      const onPrev = (): void => stepFrame(-1);
      const onNext = (): void => stepFrame(1);
      const onGrid = (): void => {
        setPressed(elements!.grid, !isPressed(elements!.grid));
        rebuildHelpers();
      };
      const onBillboard = (): void =>
        setPressed(elements!.billboard, !isPressed(elements!.billboard));
      const onFit = (): void => fitCamera();
      const onKeyDown = (event: KeyboardEvent): void => {
        if (handle.destroyed || !elements) return;
        const typing =
          event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement;
        if (typing) return;
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          cycleSprite(-1);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          cycleSprite(1);
        } else if (event.key === " ") {
          event.preventDefault();
          elements.play.click();
        } else if (event.key === "a" || event.key === "A") {
          event.preventDefault();
          playAttack();
        } else if (event.key === "[") {
          event.preventDefault();
          stepFrame(-1);
        } else if (event.key === "]") {
          event.preventDefault();
          stepFrame(1);
        } else if (event.key === "g" || event.key === "G") {
          elements.grid.click();
        } else if (event.key === "f" || event.key === "F") {
          elements.billboard.click();
        } else if (event.key === "r" || event.key === "R") {
          event.preventDefault();
          fitCamera();
        }
      };

      window.addEventListener("resize", onResize, { passive: true });
      window.addEventListener("keydown", onKeyDown);
      elements.search.addEventListener("input", onSearch);
      elements.select.addEventListener("change", onSelect);
      elements.mood.addEventListener("change", onMood);
      elements.move.addEventListener("click", onMoveClip);
      elements.attack.addEventListener("click", onAttackClip);
      elements.play.addEventListener("click", onPlay);
      elements.prev.addEventListener("click", onPrev);
      elements.next.addEventListener("click", onNext);
      elements.grid.addEventListener("click", onGrid);
      elements.billboard.addEventListener("click", onBillboard);
      elements.fit.addEventListener("click", onFit);
      elements.canvas.addEventListener("dblclick", onFit);
      cleanups.push(
        () => window.removeEventListener("resize", onResize),
        () => window.removeEventListener("keydown", onKeyDown),
        () => elements?.search.removeEventListener("input", onSearch),
        () => elements?.select.removeEventListener("change", onSelect),
        () => elements?.mood.removeEventListener("change", onMood),
        () => elements?.move.removeEventListener("click", onMoveClip),
        () => elements?.attack.removeEventListener("click", onAttackClip),
        () => elements?.play.removeEventListener("click", onPlay),
        () => elements?.prev.removeEventListener("click", onPrev),
        () => elements?.next.removeEventListener("click", onNext),
        () => elements?.grid.removeEventListener("click", onGrid),
        () => elements?.billboard.removeEventListener("click", onBillboard),
        () => elements?.fit.removeEventListener("click", onFit),
        () => elements?.canvas.removeEventListener("dblclick", onFit),
      );

      resizeRenderer();
      await loadSprite(currentId, currentMood);

      const tick = (): void => {
        if (handle.destroyed || !renderer || !controls) return;
        raf = requestAnimationFrame(tick);
        const now = performance.now();
        const delta = Math.min(0.05, (now - lastFrameMs) / 1000);
        lastFrameMs = now;
        const speed = Number(elements?.speed.value || 1);
        const playing = elements ? isPressed(elements.play) : true;
        if (playing && animation) {
          if (currentClip === "attack" && !animation.loop) {
            attackPulse = Math.max(
              0,
              attackPulse -
                (delta * speed) / Math.max(0.12, animation.frames.length / animation.fps),
            );
            frameIndex = enemyAttackFrameIndex(attackPulse, animation.frames.length);
            applyCurrentFrame();
            if (attackPulse <= 0 && currentClip === "attack") {
              currentClip = "movement";
              const entry = currentEntry();
              if (isEnemyKind(entry.key)) {
                const movement = enemyAnimationSetsForMood(currentMood)[entry.key].movement;
                animation = movement;
                elapsed = 0;
                frameIndex = 0;
                frameCount = movement.frames.length;
                renderCatalog();
                writeUrl();
                applyCurrentFrame();
              }
            }
          } else {
            elapsed += delta * speed;
            frameIndex = animationFrameIndex(animation, elapsed);
            applyCurrentFrame();
          }
          updateMetrics();
        } else if (playing && uncannyPlayback && uncannyDurations) {
          advanceUncannyWallPlayback(uncannyPlayback, delta * speed, uncannyDurations);
          applyCurrentFrame();
          updateMetrics();
        }
        if (mesh && elements && isPressed(elements.billboard)) {
          const yaw = Math.atan2(
            camera.position.x - mesh.position.x,
            camera.position.z - mesh.position.z,
          );
          mesh.rotation.set(0, yaw, 0);
        }
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
    __SPRITE_PLAYGROUND__?: SpritePlaygroundHandle;
  }
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  if (document.getElementById("sprite-playground-canvas")) startSpritePlayground();
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => window.__SPRITE_PLAYGROUND__?.destroy?.());
}
