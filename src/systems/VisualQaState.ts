export type VisualQaState = "critical" | "dead" | "won";

/**
 * Deterministic visual states stay behind the existing performance-audit flag.
 * They let release QA capture animated, hard-to-reach overlays without changing
 * a normal player run or exposing visible debug controls.
 */
export function readVisualQaState(search: string): VisualQaState | null {
  const params = new URLSearchParams(search);
  if (!params.has("perfAudit")) return null;
  const state = params.get("qaState");
  return state === "critical" || state === "dead" || state === "won" ? state : null;
}
