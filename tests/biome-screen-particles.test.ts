import { describe, expect, test } from "bun:test";

import { listBiomeIds } from "../src/systems/BiomeIdentity";
import { biomeScreenParticleTheme } from "../src/ui/BiomeScreenParticles";

describe("biome screen particles", () => {
  test("maps all canonical biomes to three themed ambient layers", () => {
    const signatures = new Set<string>();

    for (const biomeId of listBiomeIds()) {
      const theme = biomeScreenParticleTheme(biomeId);
      expect(theme.id).toBe(biomeId);
      expect(theme.label.length).toBeGreaterThan(8);
      expect(theme.layers.map((layer) => layer.kind)).toEqual(["support", "signature", "ceiling"]);
      expect(theme.layers.every((layer) => layer.name.toLowerCase().includes(biomeId))).toBe(true);

      const signature = theme.layers
        .map(
          (layer) =>
            `${layer.motion}:${layer.shape}:${layer.colors[0].toString(16)}:${layer.colors[1].toString(16)}`,
        )
        .join("|");
      signatures.add(signature);
    }

    expect(signatures.size).toBe(listBiomeIds().length);
  });

  test("mounts inert particle canvases on welcome and ending screens", async () => {
    const host = await Bun.file(new URL("../index.html", import.meta.url)).text();
    const css = await Bun.file(new URL("../src/styles.css", import.meta.url)).text();
    const main = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    const particles = await Bun.file(
      new URL("../src/ui/BiomeScreenParticles.ts", import.meta.url),
    ).text();

    expect(host).toContain('id="welcome-particles"');
    expect(host).toContain('id="end-particles"');
    expect(host.match(/class="biome-screen-particles"/g)).toHaveLength(2);
    expect(host.match(/aria-hidden="true"/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(css).toMatch(/\.biome-screen-particles\s*\{[\s\S]*pointer-events:\s*none/);
    expect(css).toContain('.end-overlay[data-end="won"] .biome-screen-particles');
    expect(main).toContain("welcomeScreenParticles.setBiome(biomeId)");
    expect(main).toContain("endScreenParticles.setBiome(endingBiomeId)");
    expect(main).toContain('endScreenParticles.setActive(mode === "won")');
    expect(particles).toContain("(prefers-reduced-motion: reduce)");
    expect(particles).toContain("FRAME_INTERVAL_MS = 1000 / 30");
    expect(particles).toContain("MAX_PIXEL_RATIO = 1.5");
  });
});
