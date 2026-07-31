import { describe, expect, test } from "bun:test";

describe("play view falloff", () => {
  test("softens objects entering the player view without covering editor modes", async () => {
    const host = await Bun.file(new URL("../index.html", import.meta.url)).text();
    const css = await Bun.file(new URL("../src/styles.css", import.meta.url)).text();

    expect(host).toContain('<div class="view-falloff" aria-hidden="true"></div>');
    expect(css).toMatch(/\.view-falloff\s*\{[\s\S]*pointer-events:\s*none/);
    expect(css).toMatch(/\.view-falloff\s*\{[\s\S]*transition:\s*opacity\s+420ms/);
    expect(css).toMatch(
      /\.app-shell\[data-engine-mode="play"\]\s+\.view-falloff\s*\{\s*opacity:\s*1/,
    );
    expect(css).not.toMatch(/data-engine-mode="editor"[^}]*\.view-falloff/);
  });

  test("precipitation biome events do not paint diagonal screen streaks", async () => {
    const css = await Bun.file(new URL("../src/styles.css", import.meta.url)).text();
    // Fall pulses use world ceiling particles; no repeating diagonal gradients.
    expect(css).not.toMatch(/data-biome-event="dustfall"[\s\S]{0,400}repeating-linear-gradient/);
    expect(css).not.toMatch(/data-biome-event="cinderfall"[\s\S]{0,400}repeating-linear-gradient/);
    expect(css).not.toMatch(/data-biome-event="spore-bloom"[\s\S]{0,400}repeating-linear-gradient/);
    expect(css).not.toContain("@keyframes biome-fall");
  });
});
