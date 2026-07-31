export interface ExplorationFogState {
  readonly exploredCount: number;
  readonly totalWalkableCells: number;
  readonly mapRevealed: boolean;
  /**
   * True once all four magic stones are bound (portal open). Clears the deep
   * exploration fog so the escape path reads at the biome's authored density.
   */
  readonly allStonesBound?: boolean;
}

/**
 * Deepest fog band for unmapped floors: only a few metres of readable depth.
 * Multiplies the biome's base FogExp2 density.
 */
export const EXPLORATION_FOG_HIDDEN_MAX = 9.4;
/**
 * Soft haze once the floor is mapped. Matches the previous "unknown" mid fog:
 * never crystal clear, but comfortable mid-range visibility.
 */
export const EXPLORATION_FOG_REVEALED = 5.2;
/**
 * Biome base fog after all four stones bind. Multiplier 1 leaves only the
 * mood-authored FogExp2 density so corridors stay readable to the portal.
 */
export const EXPLORATION_FOG_CLEAR = 1;

/**
 * Keep unvisited geometry behind a deep fog wall early on a floor, then settle
 * into the revealed soft haze once roughly 45% of walkable cells are discovered
 * (or the map is revealed outright). Binding every stone lifts the fog wall
 * completely so the escape path is visible.
 */
export function resolveExplorationFogMultiplier(state: ExplorationFogState): number {
  if (state.allStonesBound) return EXPLORATION_FOG_CLEAR;
  if (state.mapRevealed) return EXPLORATION_FOG_REVEALED;
  const total = Math.max(1, Math.floor(state.totalWalkableCells));
  const explored = Math.max(0, Math.min(total, Math.floor(state.exploredCount)));
  const progress = Math.min(1, explored / (total * 0.45));
  const smoothProgress = progress * progress * (3 - 2 * progress);
  const undiscovered = 1 - smoothProgress;
  return (
    EXPLORATION_FOG_REVEALED +
    undiscovered * undiscovered * (EXPLORATION_FOG_HIDDEN_MAX - EXPLORATION_FOG_REVEALED)
  );
}
