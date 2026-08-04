import type { AudioLoadDiagnostics } from "../audio/GameAudio";
import type { DungeonEngineApi, DungeonRuntimeState, RendererDiagnostics } from "../main";
import type { FirstPersonController } from "../player/FirstPersonController";
import type { PerspectiveCamera, Scene } from "three";

declare global {
  interface Window {
    __DUNGEON_SHELL_INTENT__?:
      | { type: "click"; targetId: string }
      | { type: "leaderboard-seed"; seed: string; biome: string }
      | { type: "profile-submit"; profileName: string; avatarIndex: number };
    __BLACK_FLAG_DUNGEON_ENGINE__: DungeonEngineApi;
    __BLACK_FLAG_PROTOTYPE__: DungeonEngineApi;
    __THREE_GAME_DIAGNOSTICS__: {
      getState(): DungeonRuntimeState;
      getResidentFloorCount(): number;
      getRenderer(): RendererDiagnostics;
      getScene(): Scene;
      getCamera(): PerspectiveCamera;
      getController(): FirstPersonController;
      getAudio(): AudioLoadDiagnostics;
      getLoop(): { running: boolean; frames: number; renders: number };
    };
  }
}

export {};
