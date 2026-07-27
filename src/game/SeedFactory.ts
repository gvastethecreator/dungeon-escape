const MAX_PROCEDURAL_SEED = 999_999;

/** Maps cryptographic entropy to the editor's numeric range and guarantees a change. */
export function nextProceduralSeed(entropy: number, previousSeed = 0): number {
  const safeEntropy = Number.isFinite(entropy) ? Math.floor(Math.abs(entropy)) : 0;
  const candidate = 1 + (safeEntropy % MAX_PROCEDURAL_SEED);
  return candidate === previousSeed ? (candidate % MAX_PROCEDURAL_SEED) + 1 : candidate;
}
