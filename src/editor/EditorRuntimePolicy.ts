import type { EngineMode } from "../game/EngineMode";

export interface GameRenderLoopState {
  readonly appDisposed: boolean;
  readonly engineMode: EngineMode;
  readonly visibilityState: DocumentVisibilityState;
  readonly welcomeOpen: boolean;
}

/** The Three.js world has no visible consumer while Creation or Debug owns the screen. */
export function shouldRunGameRenderLoop(state: GameRenderLoopState): boolean {
  return (
    !state.appDisposed &&
    !state.welcomeOpen &&
    state.engineMode === "play" &&
    state.visibilityState === "visible"
  );
}

/** Pixel-art plan views gain no useful detail from a 2x backing buffer. */
export function resolveEditorCanvasPixelRatio(
  devicePixelRatio: number,
  debug: boolean,
  viewportArea: number,
): number {
  const safeRatio = Number.isFinite(devicePixelRatio) ? Math.max(1, devicePixelRatio) : 1;
  const cap = debug || viewportArea >= 900_000 ? 1 : 1.25;
  return Math.min(safeRatio, cap);
}

export interface EditorCanvasDiagnostics {
  readonly bufferHeight: number;
  readonly bufferWidth: number;
  readonly drawCount: number;
  readonly lastDrawMs: number;
  readonly pixelRatio: number;
  readonly viewportHeight: number;
  readonly viewportWidth: number;
  readonly visibleCells: number;
}

export const EMPTY_EDITOR_CANVAS_DIAGNOSTICS: EditorCanvasDiagnostics = Object.freeze({
  bufferHeight: 0,
  bufferWidth: 0,
  drawCount: 0,
  lastDrawMs: 0,
  pixelRatio: 1,
  viewportHeight: 0,
  viewportWidth: 0,
  visibleCells: 0,
});
