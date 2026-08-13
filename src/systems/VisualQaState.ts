import { parseLaunchConfiguration, type VisualQaState } from "../launch/LaunchConfiguration";

export type { VisualQaState } from "../launch/LaunchConfiguration";

/**
 * Deterministic visual states stay behind the existing performance-audit flag.
 * They let release QA capture animated, hard-to-reach overlays without changing
 * a normal player run or exposing visible debug controls.
 */
export function readVisualQaState(search: string): VisualQaState | null {
  return parseLaunchConfiguration(search).visualQa.state;
}

/** Keep campaign captures repeatable. Normal New Game ignores this unless visual QA is enabled. */
export function readVisualQaSeed(search: string): string | null {
  return parseLaunchConfiguration(search).visualQa.seed;
}
