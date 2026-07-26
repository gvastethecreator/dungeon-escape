import type { ForgeTorchMetadata, GridCell } from "../dungeon/types";

function distanceSquared(left: { x: number; y: number }, right: { x: number; y: number }): number {
  return (left.x - right.x) ** 2 + (left.y - right.y) ** 2;
}

function nearestIndex(
  torches: readonly ForgeTorchMetadata[],
  target: GridCell,
  excluded: ReadonlySet<number>,
): number {
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  torches.forEach((torch, index) => {
    if (excluded.has(index)) return;
    const distance = distanceSquared(torch, target);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

/**
 * Greedy farthest-point distribution of lit torches. Always anchors the nearest
 * torch to `spawn` and `exit`, then seeds coverage near any `roomCenters`
 * (one torch each, if budget allows) so the mid-map zones aren't left dark,
 * then fills the rest by maximizing distance to the nearest already-chosen
 * torch.
 *
 * `roomCenters` is optional and does not change the legacy contract: when
 * omitted (as in the test) behaviour is identical to the original.
 */
export function selectDistributedTorchIndices(
  torches: readonly ForgeTorchMetadata[],
  budget: number,
  spawn: GridCell,
  exit: GridCell,
  roomCenters: readonly GridCell[] = [],
): Set<number> {
  const chosen = new Set<number>();
  const target = Math.min(Math.max(0, budget), torches.length);
  if (target === 0) return chosen;
  // Mandatory anchors — entrance and exit coverage (kept first so the test
  // contract holds regardless of roomCenters).
  const entrance = nearestIndex(torches, spawn, chosen);
  if (entrance >= 0) chosen.add(entrance);
  if (chosen.size < target) {
    const destination = nearestIndex(torches, exit, chosen);
    if (destination >= 0) chosen.add(destination);
  }
  // Optional mid-map anchors: one torch per room center while budget remains.
  // This pulls lit coverage toward room interiors before the greedy farthest
  // point fill, reducing dark pockets in large multi-room maps.
  for (const center of roomCenters) {
    if (chosen.size >= target) break;
    const seed = nearestIndex(torches, center, chosen);
    if (seed >= 0) chosen.add(seed);
  }
  while (chosen.size < target) {
    let best = -1;
    let bestCoverage = -1;
    torches.forEach((torch, index) => {
      if (chosen.has(index)) return;
      let nearestChosen = Number.POSITIVE_INFINITY;
      for (const chosenIndex of chosen)
        nearestChosen = Math.min(nearestChosen, distanceSquared(torch, torches[chosenIndex]!));
      if (nearestChosen > bestCoverage) {
        best = index;
        bestCoverage = nearestChosen;
      }
    });
    if (best < 0) break;
    chosen.add(best);
  }
  return chosen;
}
