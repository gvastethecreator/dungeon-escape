import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import {
  createLaunchHistory,
  parseLaunchConfiguration,
  updateLaunchUrl,
} from "../src/launch/LaunchConfiguration";

describe("launch configuration", () => {
  test("parses one immutable boot snapshot", () => {
    const config = parseLaunchConfiguration(
      "?seed=%20CAMPANA-17%20&mood=FROST&authority=%20http%3A%2F%2Flocalhost%3A8787%20" +
        "&skipRunIntro=true&perfAudit=0&qaState=portal&quality=1&crt=0&safeRender=invalid",
    );

    expect(config).toEqual({
      seed: "CAMPANA-17",
      mood: "frost",
      authorityBaseUrl: "http://localhost:8787",
      skipRunIntro: true,
      performanceAudit: true,
      visualQa: {
        enabled: true,
        state: "portal",
        seed: "CAMPANA-17",
        parityScene: null,
        floorIndex: 0,
      },
      render: { quality: true, crt: false, safeRender: null, renderer: "auto" },
    });
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.visualQa)).toBe(true);
    expect(Object.isFrozen(config.render)).toBe(true);
  });

  test("preserves mood precedence and QA gates", () => {
    const normal = parseLaunchConfiguration("?theme=molten&qaState=dead&seed=LONG-RUN");
    const explicitEmptyMood = parseLaunchConfiguration("?mood=&theme=frost");

    expect(normal.mood).toBe("molten");
    expect(normal.visualQa).toEqual({
      enabled: false,
      state: null,
      seed: null,
      parityScene: null,
      floorIndex: 0,
    });
    expect(explicitEmptyMood.mood).toBeNull();
  });

  test("gates deterministic parity scenes and floors behind perfAudit", () => {
    expect(
      parseLaunchConfiguration("?perfAudit=1&seed=WGP02&parityScene=torch-hall&floor=2").visualQa,
    ).toEqual({
      enabled: true,
      state: null,
      seed: "WGP02",
      parityScene: "torch-hall",
      floorIndex: 2,
    });
    expect(parseLaunchConfiguration("?parityScene=torch-hall&floor=2").visualQa.enabled).toBe(
      false,
    );
  });

  test("parses renderer preference and falls unknown values to auto", () => {
    expect(parseLaunchConfiguration("?renderer=webgpu").render.renderer).toBe("webgpu");
    expect(parseLaunchConfiguration("?renderer=webgl").render.renderer).toBe("webgl");
    expect(parseLaunchConfiguration("?renderer=auto").render.renderer).toBe("auto");
    expect(parseLaunchConfiguration("?renderer=WEBGPU").render.renderer).toBe("webgpu");
    expect(parseLaunchConfiguration("?renderer=metal").render.renderer).toBe("auto");
    expect(parseLaunchConfiguration("").render.renderer).toBe("auto");
  });

  test("updates only supplied runtime URL state", () => {
    expect(
      updateLaunchUrl("https://game.test/dungeon?theme=frost&seed=OLD#hall", {
        mode: "play",
        seed: "NEW",
      }),
    ).toBe("https://game.test/dungeon?theme=frost&seed=NEW&mode=play#hall");
  });

  test("history adapter always uses the pure URL update", () => {
    let href = "https://game.test/?perfAudit=1";
    const history = createLaunchHistory({
      currentHref: () => href,
      replaceHref(next) {
        href = next;
      },
    });

    history.replace({ seed: "NEXT" });
    history.replace({ mode: "debug" });

    expect(href).toBe("https://game.test/?perfAudit=1&seed=NEXT&mode=debug");
  });

  test("browser host parses launch search once and domain bridge owns no URL behavior", () => {
    const main = readFileSync("src/main.ts", "utf8");
    const bridge = readFileSync("src/domain/bridge.ts", "utf8");

    expect(main.match(/window\.location\.search/g)).toHaveLength(1);
    expect(main).not.toContain("new URLSearchParams");
    expect(bridge).not.toContain("window.location");
    expect(bridge).not.toContain("history.replaceState");
  });
});
