import { describe, expect, test } from "bun:test";

const source = await Bun.file(new URL("../src/forge/main.js", import.meta.url)).text();

describe("Creation enemy preview", () => {
  test("uses native Sprite atlas framing instead of the broken instanced atlas shader", () => {
    expect(source).toContain("new THREE.SpriteMaterial");
    expect(source).toContain("new THREE.Sprite(enemyMaterial(kind))");
    expect(source).toContain("texture.repeat.set(frame.w / animation.size[0]");
    expect(source).toContain("1 - (frame.y + frame.h) / animation.size[1]");
    expect(source).not.toContain("aForgeEnemyFrame");
    expect(source).not.toContain("forge-instanced-enemy-atlas");
  });
});
