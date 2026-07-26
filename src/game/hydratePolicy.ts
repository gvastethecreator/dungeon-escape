/**
 * Authority hydrate vs local map — never silent-wipe an in-progress dungeon.
 *
 * Adopt remote seed only when there is no local dungeon yet (cold enter PLAY).
 * When a map already exists, status/UI may show the remote seed; SYNC / run
 * select remains the explicit rebuild path.
 */
export function shouldAdoptHydratedSeed(
  hasLocalDungeon: boolean,
  remoteSeed: string | undefined | null,
  _localSeed: string,
): boolean {
  if (!remoteSeed || !String(remoteSeed).trim()) return false;
  if (hasLocalDungeon) return false;
  return true;
}
