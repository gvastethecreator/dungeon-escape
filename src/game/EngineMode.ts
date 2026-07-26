export type EngineMode = "play" | "editor" | "debug";

export const ENGINE_MODES: readonly EngineMode[] = ["editor", "debug", "play"];

export function isEngineMode(value: string | undefined): value is EngineMode {
  return value === "play" || value === "editor" || value === "debug";
}

export function shouldMountForge(
  surface: "runtime" | "forge",
  mode: EngineMode,
  hasSource: boolean,
): boolean {
  return surface === "forge" && mode !== "play" && !hasSource;
}
