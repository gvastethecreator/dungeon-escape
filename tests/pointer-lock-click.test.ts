import { describe, expect, test } from "bun:test";

import { pointerLockClickActions } from "../src/player/FirstPersonController";

describe("pointer-lock click actions", () => {
  test("left click queues fire and interact so in-range chests and torches open", () => {
    expect(pointerLockClickActions(0)).toEqual(["fire", "interact"]);
    expect(pointerLockClickActions(-1, 1)).toEqual(["fire", "interact"]);
    expect(pointerLockClickActions(2)).toEqual(["jump"]);
    expect(pointerLockClickActions(1)).toBeNull();
    expect(pointerLockClickActions(-1, 0)).toBeNull();
  });

  test("controller listens for locked clicks on document capture, not only the canvas", async () => {
    const source = await Bun.file(
      new URL("../src/player/FirstPersonController.ts", import.meta.url),
    ).text();
    expect(source).toContain(
      'document.addEventListener("pointerdown", this.handlePointerDown, true)',
    );
    expect(source).toContain('document.addEventListener("mousedown", this.handleMouseDown, true)');
  });
});
