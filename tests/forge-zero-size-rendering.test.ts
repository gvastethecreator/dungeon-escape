import { describe, expect, test } from "bun:test";

const source = await Bun.file(new URL("../src/forge/main.js", import.meta.url)).text();

type ForgeRenderSize = {
  width: number;
  height: number;
  bloomWidth: number;
  bloomHeight: number;
};

function loadRenderSizeResolver(): (width: number, height: number) => ForgeRenderSize | null {
  const match = source.match(/function resolveForgeRenderSize\(width, height\) \{[\s\S]*?\n\}/);
  if (!match) throw new Error("Forge render-size resolver is missing.");

  return Function(`"use strict"; ${match[0]}; return resolveForgeRenderSize;`)() as (
    width: number,
    height: number,
  ) => ForgeRenderSize | null;
}

describe("Forge zero-size rendering", () => {
  test("rejects zero-size viewports and keeps small bloom targets valid", () => {
    const resolveRenderSize = loadRenderSizeResolver();

    expect(resolveRenderSize(0, 900)).toBeNull();
    expect(resolveRenderSize(1440, 0)).toBeNull();
    expect(resolveRenderSize(1, 1)).toEqual({
      width: 1,
      height: 1,
      bloomWidth: 1,
      bloomHeight: 1,
    });
    expect(resolveRenderSize(1440, 900)).toEqual({
      width: 1440,
      height: 900,
      bloomWidth: 360,
      bloomHeight: 225,
    });
  });

  test("skips target allocation and frame rendering until the viewport can render", () => {
    expect(source).toMatch(
      /function setupRTs\(\) \{[\s\S]*?const targetSize = resolveForgeRenderSize\(size\.x, size\.y\);[\s\S]*?if \(!targetSize\) return false;/,
    );
    expect(source).toMatch(
      /function renderFrame\(\) \{\s*if \(!resolveForgeRenderSize\(innerWidth, innerHeight\)\) return false;/,
    );
    expect(source).toMatch(/function tick\(\) \{[\s\S]*?if \(!syncForgeViewport\(\)\) return;/);
  });
});
