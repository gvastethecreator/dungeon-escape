export const FIRE_LOS_REFRESH_SECONDS = 0.12;
export const FIRE_LOS_MAX_STALE_SECONDS = 0.28;
export const FIRE_LOS_CHECK_BUDGET = 6;

export interface FireLosCandidate {
  cutoffDistance: number;
  losAge: number;
}

/** Selects a bounded set of due fire LOS checks without allocating per frame. */
export class FireLosScheduler {
  private readonly selected: number[] = [];

  select(
    fires: readonly FireLosCandidate[],
    distances: ArrayLike<number>,
    delta: number,
  ): readonly number[] {
    this.selected.length = 0;
    for (let index = 0; index < fires.length; index += 1) {
      const fire = fires[index];
      if (!fire || (distances[index] ?? Number.POSITIVE_INFINITY) > fire.cutoffDistance + 7)
        continue;
      fire.losAge += delta;
    }

    while (this.selected.length < FIRE_LOS_CHECK_BUDGET) {
      let bestIndex = -1;
      let bestDistance = Number.POSITIVE_INFINITY;
      let bestAge = -1;
      let bestIsStale = false;
      for (let index = 0; index < fires.length; index += 1) {
        const fire = fires[index];
        if (!fire || fire.losAge < FIRE_LOS_REFRESH_SECONDS) continue;
        const distance = distances[index] ?? Number.POSITIVE_INFINITY;
        if (distance > fire.cutoffDistance + 7) continue;
        const isStale = fire.losAge >= FIRE_LOS_MAX_STALE_SECONDS;
        if (
          bestIndex < 0 ||
          (isStale && !bestIsStale) ||
          (isStale === bestIsStale && (isStale ? fire.losAge > bestAge : distance < bestDistance))
        ) {
          bestIndex = index;
          bestDistance = distance;
          bestAge = fire.losAge;
          bestIsStale = isStale;
        }
      }
      if (bestIndex < 0) break;
      const selectedFire = fires[bestIndex];
      if (!selectedFire) break;
      selectedFire.losAge = 0;
      this.selected.push(bestIndex);
    }
    return this.selected;
  }
}
