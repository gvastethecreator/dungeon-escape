import { describe, expect, test } from "bun:test";
import {
  isUiControlDisabled,
  resolveUiChangeCue,
  resolveUiClickCue,
  resolveUiHoverCue,
  resolveUiSoundTarget,
  type UiSoundTarget,
} from "../src/ui/UiSoundPolicy";

class FakeTarget implements UiSoundTarget {
  disabled = false;
  private readonly selectors: Set<string>;
  private readonly ancestorSelectors: Set<string>;
  private readonly attributes = new Map<string, string>();

  constructor(selectors: string[], ancestorSelectors: string[] = []) {
    this.selectors = new Set(selectors);
    this.ancestorSelectors = new Set(ancestorSelectors);
  }

  matches(query: string): boolean {
    return query.split(",").some((selector) => this.selectors.has(selector.trim()));
  }

  closest(query: string): UiSoundTarget | null {
    const selectors = query.split(",").map((selector) => selector.trim());
    return selectors.some(
      (selector) => this.selectors.has(selector) || this.ancestorSelectors.has(selector),
    )
      ? this
      : null;
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

describe("UiSoundPolicy", () => {
  test("resolves primary, secondary, toggle, tick, and default click priorities", () => {
    expect(resolveUiClickCue(new FakeTarget([".welcome-menu__item--primary"]))).toBe("uiSelect");
    expect(resolveUiClickCue(new FakeTarget(["#retry"]))).toBe("uiBack");
    expect(resolveUiClickCue(new FakeTarget(["input[type='checkbox']"]))).toBe("uiToggle");
    expect(resolveUiClickCue(new FakeTarget(["select"]))).toBe("uiTick");
    expect(resolveUiClickCue(new FakeTarget(["button"]))).toBe("uiClick");
  });

  test("denies disabled controls before applying role priority", () => {
    const nativeDisabled = new FakeTarget([".welcome-menu__item--primary"]);
    nativeDisabled.disabled = true;
    const ariaDisabled = new FakeTarget(["button"]);
    ariaDisabled.setAttribute("aria-disabled", "true");

    expect(isUiControlDisabled(nativeDisabled)).toBe(true);
    expect(resolveUiClickCue(nativeDisabled)).toBe("uiDeny");
    expect(resolveUiClickCue(ariaDisabled)).toBe("uiDeny");
    expect(resolveUiHoverCue(nativeDisabled)).toBeNull();
  });

  test("only emits hover for the intended interactive surfaces", () => {
    expect(resolveUiHoverCue(new FakeTarget([".biome-picker-option"]))).toBe("uiHover");
    expect(resolveUiHoverCue(new FakeTarget(["button"]))).toBeNull();
  });

  test("resolves change and range input cues without DOM globals", () => {
    expect(resolveUiChangeCue(new FakeTarget(["input[type='range']"]))).toBe("uiTick");
    expect(resolveUiChangeCue(new FakeTarget(["input[type='radio']"]))).toBe("uiToggle");
    expect(resolveUiChangeCue(new FakeTarget(["button"]))).toBeNull();
    expect(resolveUiSoundTarget(null)).toBeNull();
  });
});
