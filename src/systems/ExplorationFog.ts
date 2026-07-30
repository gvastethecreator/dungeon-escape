export interface ExplorationFogState {
  readonly exploredCount: number;
  readonly totalWalkableCells: number;
  readonly mapRevealed: boolean;
}

/**
 * Hide distant, unvisited geometry early in a floor, then return to the biome's
 * authored fog once roughly 45% of its walkable cells have been discovered.
 */
export function resolveExplorationFogMultiplier(state: ExplorationFogState): number {
  if (state.mapRevealed) return 1;
  const total = Math.max(1, Math.floor(state.totalWalkableCells));
  const explored = Math.max(0, Math.min(total, Math.floor(state.exploredCount)));
  const progress = Math.min(1, explored / (total * 0.45));
  const smoothProgress = progress * progress * (3 - 2 * progress);
  const undiscovered = 1 - smoothProgress;
  return 1 + undiscovered * undiscovered * 1.2;
}
