import type { EditorCanvasDiagnostics } from "./EditorRuntimePolicy";

export interface EditorDebugSnapshot {
  readonly canvas: EditorCanvasDiagnostics;
  readonly doors: number;
  readonly floor: string;
  readonly loopRunning: boolean;
  readonly rooms: number;
  readonly threats: string;
}

export interface EditorDebugTelemetryElements {
  readonly buffer: HTMLElement;
  readonly cells: HTMLElement;
  readonly doors: HTMLElement;
  readonly dpr: HTMLElement;
  readonly draw: HTMLElement;
  readonly floor: HTMLElement;
  readonly loop: HTMLElement;
  readonly mode: HTMLElement;
  readonly paints: HTMLElement;
  readonly panel: HTMLElement;
  readonly rooms: HTMLElement;
  readonly threats: HTMLElement;
}

export interface EditorDebugTelemetryClock {
  clearTimeout(handle: unknown): void;
  setTimeout(callback: () => void, delayMs: number): unknown;
}

const BROWSER_CLOCK: EditorDebugTelemetryClock = {
  clearTimeout(handle) {
    globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
  setTimeout(callback, delayMs) {
    return globalThis.setTimeout(callback, delayMs);
  },
};

function write(element: HTMLElement, value: string): void {
  if (element.textContent !== value) element.textContent = value;
}

/** Low-frequency, change-only telemetry for the demand-driven plan renderer. */
export class EditorDebugTelemetry {
  #active = false;
  #disposed = false;
  #lastSignature = "";
  #timer: unknown = null;

  constructor(
    private readonly elements: EditorDebugTelemetryElements,
    private readonly readSnapshot: () => EditorDebugSnapshot,
    private readonly clock: EditorDebugTelemetryClock = BROWSER_CLOCK,
    private readonly refreshMs = 500,
  ) {}

  setActive(active: boolean): void {
    if (this.#disposed) return;
    if (this.#active === active) {
      if (active) this.refresh();
      return;
    }
    this.#active = active;
    this.#clearTimer();
    if (!active) return;
    this.#lastSignature = "";
    this.refresh();
    this.#schedule();
  }

  refresh(): void {
    if (!this.#active || this.#disposed) return;
    const snapshot = this.readSnapshot();
    const { canvas } = snapshot;
    const signature = JSON.stringify(snapshot);
    if (signature === this.#lastSignature) return;
    this.#lastSignature = signature;

    const drawMs = Number.isFinite(canvas.lastDrawMs) ? canvas.lastDrawMs : 0;
    const frameState = drawMs <= 12 ? "ok" : drawMs <= 24 ? "warn" : "hot";
    this.elements.panel.dataset.frameState = frameState;
    write(this.elements.mode, snapshot.loopRunning ? "3D ACTIVE" : "DEMAND");
    write(this.elements.loop, snapshot.loopRunning ? "LIVE" : "PAUSED");
    write(this.elements.draw, `${drawMs.toFixed(1)}ms`);
    write(this.elements.cells, String(canvas.visibleCells));
    write(this.elements.paints, String(canvas.drawCount));
    write(this.elements.buffer, `${canvas.bufferWidth}×${canvas.bufferHeight}`);
    write(this.elements.dpr, `${canvas.pixelRatio.toFixed(2)}×`);
    write(this.elements.floor, snapshot.floor);
    write(this.elements.rooms, String(snapshot.rooms));
    write(this.elements.doors, String(snapshot.doors));
    write(this.elements.threats, snapshot.threats);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#active = false;
    this.#clearTimer();
  }

  #schedule(): void {
    this.#timer = this.clock.setTimeout(() => {
      this.#timer = null;
      if (!this.#active || this.#disposed) return;
      this.refresh();
      this.#schedule();
    }, this.refreshMs);
  }

  #clearTimer(): void {
    if (this.#timer === null) return;
    this.clock.clearTimeout(this.#timer);
    this.#timer = null;
  }
}
