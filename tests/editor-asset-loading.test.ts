import { describe, expect, test } from "bun:test";

import { FLOOR, WALL } from "../src/dungeon/generateDungeon";
import type { DungeonData } from "../src/dungeon/types";
import { DungeonEditorView } from "../src/editor/DungeonEditorView";
import { getDungeonMood } from "../src/systems/DungeonMood";

class PendingImage {
  decoding = "";
  height = 64;
  onerror: (() => void) | null = null;
  onload: (() => void) | null = null;
  url = "";
  width = 64;

  set src(url: string) {
    this.url = url;
    requestedUrls.push(url);
    const pending = imagesByUrl.get(url) ?? [];
    pending.push(this);
    imagesByUrl.set(url, pending);
  }

  resolve(): void {
    this.onload?.();
  }

  reject(): void {
    this.onerror?.();
  }
}

const requestedUrls: string[] = [];
const imagesByUrl = new Map<string, PendingImage[]>();

function resetImageRequests(): void {
  requestedUrls.length = 0;
  imagesByUrl.clear();
}

function completeImage(url: string): void {
  const image = imagesByUrl.get(url)?.[0];
  if (!image) throw new Error(`No pending editor image for ${url}`);
  image.resolve();
}

function failImage(url: string): void {
  const image = imagesByUrl.get(url)?.[0];
  if (!image) throw new Error(`No pending editor image for ${url}`);
  image.reject();
}

function makeCanvas(): {
  canvas: HTMLCanvasElement;
  drawnUrls: string[];
  fillRectCount: () => number;
} {
  const drawnUrls: string[] = [];
  let fillRectCount = 0;
  const gradient = { addColorStop: () => {} };
  const context = {
    arc: () => {},
    beginPath: () => {},
    clip: () => {},
    createRadialGradient: () => gradient,
    drawImage: (image: unknown) => {
      if (image instanceof PendingImage) drawnUrls.push(image.url);
    },
    fillRect: () => {
      fillRectCount += 1;
    },
    fillText: () => {},
    lineTo: () => {},
    moveTo: () => {},
    rect: () => {},
    restore: () => {},
    save: () => {},
    setTransform: () => {},
    stroke: () => {},
    strokeRect: () => {},
  };
  const canvas = {
    addEventListener: () => {},
    getBoundingClientRect: () => ({ height: 120, left: 0, top: 0, width: 200 }),
    getContext: () => context,
    removeEventListener: () => {},
    height: 0,
    width: 0,
  } as unknown as HTMLCanvasElement;
  return { canvas, drawnUrls, fillRectCount: () => fillRectCount };
}

function installPendingImage(): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "Image");
  Object.defineProperty(globalThis, "Image", {
    configurable: true,
    value: PendingImage,
    writable: true,
  });
  return () => {
    if (descriptor) Object.defineProperty(globalThis, "Image", descriptor);
    else delete (globalThis as { Image?: unknown }).Image;
  };
}

function installWindow(): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { devicePixelRatio: 1 },
    writable: true,
  });
  return () => {
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
    else delete (globalThis as { window?: unknown }).window;
  };
}

function makeDungeon(): DungeonData {
  const grid = [
    Uint8Array.from([WALL, WALL, WALL, WALL, WALL]),
    Uint8Array.from([WALL, FLOOR, FLOOR, FLOOR, WALL]),
    Uint8Array.from([WALL, FLOOR, FLOOR, FLOOR, WALL]),
    Uint8Array.from([WALL, WALL, WALL, WALL, WALL]),
  ];
  return {
    distances: new Int32Array(),
    edges: [],
    entranceRoomId: 0,
    exit: { x: 3, y: 2 },
    exitRoomId: 0,
    grid,
    height: 4,
    options: { presetId: "ash" } as unknown as DungeonData["options"],
    rooms: [{ center: { x: 2, y: 2 }, height: 2, id: 0, role: "room", width: 3, x: 1, y: 1 }],
    seed: "editor-assets",
    seedHash: 1,
    spawn: { x: 1, y: 1 },
    stats: { corridorRatio: 0, deadEnds: 0, loopCount: 0, roomCount: 1 },
    topologySignature: "",
    width: 5,
  } as unknown as DungeonData;
}

async function flushImageTasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("DungeonEditorView asset loading", () => {
  test("requests only the active ash mood plus shared editor art at startup", () => {
    const restoreImage = installPendingImage();
    resetImageRequests();
    try {
      new DungeonEditorView(makeCanvas().canvas, { onSelectSpawn: () => {} });

      expect([...requestedUrls].sort()).toEqual(
        [
          "/assets/textures/biomes/ash/floor.webp",
          "/assets/textures/biomes/ash/wall.webp",
          "/assets/sprites/enemies-v8/biomes/ash-enemies.webp",
          "/assets/sprites/enemies-v8/iron-ash-enemies-v8.webp",
          "/assets/sprites/iron-ash-items.webp",
          "/assets/sprites/keyed/ember-sheet.webp",
          "/assets/sprites/keyed/ash-sheet.webp",
          "/assets/sprites/keyed/crypt-sheet.webp",
          "/assets/sprites/keyed/verdant-sheet.webp",
        ].sort(),
      );
    } finally {
      restoreImage();
    }
  });

  test("loads a new mood once, ignores stale art, and keeps the map drawable after a failure", async () => {
    const restoreImage = installPendingImage();
    const restoreWindow = installWindow();
    resetImageRequests();
    try {
      const { canvas, drawnUrls, fillRectCount } = makeCanvas();
      const view = new DungeonEditorView(canvas, { onSelectSpawn: () => {} });
      view.setDungeon(makeDungeon(), getDungeonMood("frost"));
      view.setMood(getDungeonMood("frost"));

      const frostUrls = [
        "/assets/textures/biomes/frost/floor.webp",
        "/assets/textures/biomes/frost/wall.webp",
        "/assets/sprites/enemies-v8/biomes/frost-enemies.webp",
      ];
      for (const url of frostUrls)
        expect(requestedUrls.filter((requested) => requested === url)).toHaveLength(1);

      completeImage("/assets/textures/biomes/ash/floor.webp");
      completeImage("/assets/textures/biomes/ash/wall.webp");
      await flushImageTasks();
      expect(drawnUrls).toEqual([]);

      completeImage("/assets/textures/biomes/frost/floor.webp");
      completeImage("/assets/textures/biomes/frost/wall.webp");
      await flushImageTasks();
      expect(drawnUrls).toContain("/assets/textures/biomes/frost/floor.webp");
      expect(drawnUrls).toContain("/assets/textures/biomes/frost/wall.webp");
      view.setMood(getDungeonMood("frost"));
      for (const url of frostUrls)
        expect(requestedUrls.filter((requested) => requested === url)).toHaveLength(1);

      view.setMood(getDungeonMood("molten"));
      view.setMood(getDungeonMood("molten"));
      const moltenUrls = [
        "/assets/textures/biomes/molten/floor.webp",
        "/assets/textures/biomes/molten/wall.webp",
        "/assets/sprites/enemies-v8/biomes/molten-enemies.webp",
      ];
      for (const url of moltenUrls)
        expect(requestedUrls.filter((requested) => requested === url)).toHaveLength(1);

      const imagesBeforeFailure = drawnUrls.length;
      const fillsBeforeFailure = fillRectCount();
      failImage("/assets/textures/biomes/molten/floor.webp");
      await flushImageTasks();
      view.setMood(getDungeonMood("molten"));
      for (const url of moltenUrls)
        expect(requestedUrls.filter((requested) => requested === url)).toHaveLength(1);
      completeImage("/assets/textures/biomes/molten/wall.webp");
      await flushImageTasks();
      expect(drawnUrls).toHaveLength(imagesBeforeFailure);
      expect(fillRectCount()).toBeGreaterThan(fillsBeforeFailure);
    } finally {
      restoreWindow();
      restoreImage();
    }
  });
});
