import type { GridCell } from "../dungeon/types";

export interface MinimapDrawInvalidator {
  shouldDraw(
    playerCell: GridCell | null,
    playerYaw: number,
    exploredCount: number,
    featureRevision: number,
    force?: boolean,
  ): boolean;
}

/** Keeps the canvas idle until a visible minimap input changes. */
export function createMinimapDrawInvalidator(): MinimapDrawInvalidator {
  let initialized = false;
  let cellX = Number.NaN;
  let cellY = Number.NaN;
  let yaw = Number.NaN;
  let explored = -1;
  let features = -1;

  return {
    shouldDraw(playerCell, playerYaw, exploredCount, featureRevision, force = false): boolean {
      const nextCellX = playerCell?.x ?? Number.NaN;
      const nextCellY = playerCell?.y ?? Number.NaN;
      const changed =
        force ||
        !initialized ||
        !Object.is(cellX, nextCellX) ||
        !Object.is(cellY, nextCellY) ||
        yaw !== playerYaw ||
        explored !== exploredCount ||
        features !== featureRevision;
      if (!changed) return false;
      initialized = true;
      cellX = nextCellX;
      cellY = nextCellY;
      yaw = playerYaw;
      explored = exploredCount;
      features = featureRevision;
      return true;
    },
  };
}

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
