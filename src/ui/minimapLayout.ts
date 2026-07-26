/**
 * Coalesces minimap layout work behind one animation frame. Mode changes and
 * ResizeObserver callbacks may arrive together; measuring once after layout
 * settles avoids painting the hidden 1×1 canvas during Creation → Play.
 */
export interface MinimapLayoutScheduler {
  schedule(): void;
  dispose(): void;
}

export interface MinimapLayoutSchedulerOptions {
  measure(): void;
  draw(): void;
  requestFrame(callback: FrameRequestCallback): number;
  cancelFrame(handle: number): void;
}

export function createMinimapLayoutScheduler({
  measure,
  draw,
  requestFrame,
  cancelFrame,
}: MinimapLayoutSchedulerOptions): MinimapLayoutScheduler {
  let pendingFrame: number | null = null;
  let scheduled = false;
  let disposed = false;

  const schedule = (): void => {
    if (disposed || scheduled) return;
    scheduled = true;
    const frame = requestFrame(() => {
      scheduled = false;
      pendingFrame = null;
      if (disposed) return;
      measure();
      draw();
    });
    // Browser animation frames are asynchronous. This guard also keeps the
    // helper sound with synchronous test doubles.
    if (scheduled) pendingFrame = frame;
  };

  return {
    schedule,
    dispose(): void {
      disposed = true;
      scheduled = false;
      if (pendingFrame !== null) cancelFrame(pendingFrame);
      pendingFrame = null;
    },
  };
}
