import type { DungeonEngineApi, DungeonRuntimeState, RendererDiagnostics } from "../main";
import type { FirstPersonController } from "../player/FirstPersonController";
import type { PerspectiveCamera, Scene } from "three";

declare global {
  interface Window {
    __BLACK_FLAG_DUNGEON_ENGINE__: DungeonEngineApi;
    __BLACK_FLAG_PROTOTYPE__: DungeonEngineApi;
    __THREE_GAME_DIAGNOSTICS__: {
      getState(): DungeonRuntimeState;
      getRenderer(): RendererDiagnostics;
      getScene(): Scene;
      getCamera(): PerspectiveCamera;
      getController(): FirstPersonController;
    };
  }
}

export {};
