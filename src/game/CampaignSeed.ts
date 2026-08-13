/**
 * Campaign New Game seeds. Player runs mint a unique ASH-* string.
 * URL `?seed=` never owns a normal campaign unless visual QA is enabled.
 */

export function mintCampaignSeed(
  fillRandom: (target: Uint32Array) => ArrayLike<number> = (target) =>
    crypto.getRandomValues(target),
): string {
  const values = new Uint32Array(1);
  const filled = fillRandom(values);
  const entropy = Number(filled[0] ?? values[0] ?? 0) >>> 0;
  return `ASH-${entropy.toString(36).toUpperCase()}`;
}

export function nextCampaignSeed(
  visualQa: { readonly enabled: boolean; readonly seed: string | null },
  mintSeed: () => string = mintCampaignSeed,
): string {
  if (visualQa.enabled) {
    const pinned = visualQa.seed?.trim();
    if (pinned) return pinned;
  }
  return mintSeed();
}
