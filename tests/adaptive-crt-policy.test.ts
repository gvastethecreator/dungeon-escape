import { describe, expect, test } from "bun:test";
import {
  ADAPTIVE_CRT_RECOVER_HYSTERESIS_MS,
  stepAdaptiveCrt,
} from "../src/systems/AdaptiveCrtPolicy";

describe("AdaptiveCrtPolicy", () => {
  test("disables when frame cost crosses the threshold", () => {
    const next = stepAdaptiveCrt(
      { enabled: true, autoDisabled: false },
      {
        frameMs: 40,
        disableMs: 33,
        manualOverride: false,
        enableByDefault: true,
      },
    );
    expect(next).toEqual({ enabled: false, autoDisabled: true });
  });

  test("recovers only after hysteresis gap", () => {
    const stillHot = stepAdaptiveCrt(
      { enabled: false, autoDisabled: true },
      {
        frameMs: 33 - ADAPTIVE_CRT_RECOVER_HYSTERESIS_MS + 0.5,
        disableMs: 33,
        manualOverride: false,
        enableByDefault: true,
      },
    );
    expect(stillHot).toEqual({ enabled: false, autoDisabled: true });

    const recovered = stepAdaptiveCrt(
      { enabled: false, autoDisabled: true },
      {
        frameMs: 33 - ADAPTIVE_CRT_RECOVER_HYSTERESIS_MS,
        disableMs: 33,
        manualOverride: false,
        enableByDefault: true,
      },
    );
    expect(recovered).toEqual({ enabled: true, autoDisabled: false });
  });

  test("manual override freezes auto transitions", () => {
    const frozen = stepAdaptiveCrt(
      { enabled: true, autoDisabled: false },
      {
        frameMs: 100,
        disableMs: 33,
        manualOverride: true,
        enableByDefault: true,
      },
    );
    expect(frozen).toEqual({ enabled: true, autoDisabled: false });
  });

  test("recovery respects enableByDefault false", () => {
    const next = stepAdaptiveCrt(
      { enabled: false, autoDisabled: true },
      {
        frameMs: 10,
        disableMs: 33,
        manualOverride: false,
        enableByDefault: false,
      },
    );
    expect(next).toEqual({ enabled: false, autoDisabled: false });
  });

  test("host only pushes presentation when enabled flips", async () => {
    const main = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    expect(main).toContain("if (crtEnabled !== previousCrtEnabled)");
    expect(main).not.toContain("crtAutoDisabled !== previousAutoDisabled");
  });
});

