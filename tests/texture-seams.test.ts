import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { FLOOR, generateDungeon, WALL } from "../src/dungeon/generateDungeon";
import {
  edgeBlendSeamlessRgba,
  normalMapRgbaFromAlbedo,
  registerTextureSource,
} from "../src/world/TextureTreatment";

describe("texture seam treatment", () => {
  test("edge-blend forces opposite borders toward the same colors", () => {
    const size = 64;
    const data = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const i = (y * size + x) * 4;
        data[i] = x < size / 2 ? 255 : 0;
        data[i + 1] = y < size / 2 ? 255 : 0;
        data[i + 2] = 128;
        data[i + 3] = 255;
      }
    }
    edgeBlendSeamlessRgba(data, size, 0.2);

    const at = (x: number, y: number) => {
      const i = (y * size + x) * 4;
      return [data[i]!, data[i + 1]!, data[i + 2]!] as const;
    };
    const left = at(0, Math.floor(size / 2));
    const right = at(size - 1, Math.floor(size / 2));
    const top = at(Math.floor(size / 2), 0);
    const bottom = at(Math.floor(size / 2), size - 1);
    // Opposite edges must match so wrapS/T does not flash a hard line.
    expect(Math.abs(left[0] - right[0])).toBeLessThanOrEqual(2);
    expect(Math.abs(left[1] - right[1])).toBeLessThanOrEqual(2);
    expect(Math.abs(top[0] - bottom[0])).toBeLessThanOrEqual(2);
    expect(Math.abs(top[1] - bottom[1])).toBeLessThanOrEqual(2);
  });

  test("registerTextureSource records edge-blend treatment", () => {
    const texture = new THREE.Texture();
    registerTextureSource(texture, "/assets/textures/biomes/ash/floor.png", { seam: "edge-blend" });
    expect(texture.userData.seamTreatment).toBe("edge-blend-wrap");
  });

  test("normal maps encode outward Z and react to albedo height", () => {
    const size = 32;
    const albedo = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const i = (y * size + x) * 4;
        // Bright ridge on the left, dark mortar on the right.
        const v = x < size / 2 ? 220 : 40;
        albedo[i] = v;
        albedo[i + 1] = v;
        albedo[i + 2] = v;
        albedo[i + 3] = 255;
      }
    }
    const normals = normalMapRgbaFromAlbedo(albedo, size, 4);
    const mid = (Math.floor(size / 2) * size + Math.floor(size / 2)) * 4;
    // Flat-ish far-right interior should still point mostly outward (B high).
    const far = (Math.floor(size / 2) * size + size - 2) * 4;
    expect(normals[far + 2]!).toBeGreaterThan(200);
    expect(normals[mid + 2]!).toBeGreaterThan(150);
    // Near the bright/dark transition, X channel should deviate from neutral 128.
    const edge = (Math.floor(size / 2) * size + Math.floor(size / 2) - 1) * 4;
    expect(Math.abs(normals[edge]! - 128)).toBeGreaterThan(8);
  });

  test("boundary wall cells expose one face per floor adjacency", () => {
    const dungeon = generateDungeon("wall-face-seams", {
      roomTarget: 8,
      minRoomSize: 5,
      maxRoomSize: 9,
    });
    let faceCount = 0;
    for (let y = 0; y < dungeon.height; y += 1) {
      for (let x = 0; x < dungeon.width; x += 1) {
        if (dungeon.grid[y]?.[x] !== WALL) continue;
        for (const [dx, dy] of [
          [0, -1],
          [1, 0],
          [0, 1],
          [-1, 0],
        ] as const) {
          if (dungeon.grid[y + dy]?.[x + dx] === FLOOR) faceCount += 1;
        }
      }
    }
    // Real dungeons always have exposed masonry; faces >> room count.
    expect(faceCount).toBeGreaterThan(dungeon.rooms.length * 4);
  });
});
