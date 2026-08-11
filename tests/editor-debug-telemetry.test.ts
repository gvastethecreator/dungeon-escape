import { describe, expect, test } from "bun:test";

import {
  EditorDebugTelemetry,
  type EditorDebugTelemetryClock,
} from "../src/editor/EditorDebugTelemetry";

function element(): HTMLElement {
  return { dataset: {}, textContent: "" } as unknown as HTMLElement;
}

describe("EditorDebugTelemetry", () => {
  test("reports demand-driven map state and stops its bounded sampler", () => {
    const callbacks: Array<() => void> = [];
    const cleared: unknown[] = [];
    const clock: EditorDebugTelemetryClock = {
      clearTimeout(handle) {
        cleared.push(handle);
      },
      setTimeout(callback) {
        callbacks.push(callback);
        return callbacks.length;
      },
    };
    const elements = {
      panel: element(),
      mode: element(),
      loop: element(),
      draw: element(),
      cells: element(),
      paints: element(),
      buffer: element(),
      dpr: element(),
      floor: element(),
      rooms: element(),
      doors: element(),
      threats: element(),
    };
    const telemetry = new EditorDebugTelemetry(
      elements,
      () => ({
        canvas: {
          bufferHeight: 480,
          bufferWidth: 800,
          drawCount: 3,
          lastDrawMs: 7.25,
          pixelRatio: 1,
          viewportHeight: 480,
          viewportWidth: 800,
          visibleCells: 612,
        },
        doors: 8,
        floor: "1/2",
        loopRunning: false,
        rooms: 16,
        threats: "12/20",
      }),
      clock,
    );

    telemetry.setActive(true);
    expect(elements.mode.textContent).toBe("DEMAND");
    expect(elements.loop.textContent).toBe("PAUSED");
    expect(elements.draw.textContent).toBe("7.3ms");
    expect(elements.cells.textContent).toBe("612");
    expect(elements.buffer.textContent).toBe("800×480");
    expect(callbacks).toHaveLength(1);

    telemetry.setActive(false);
    expect(cleared).toEqual([1]);
    telemetry.dispose();
  });
});
