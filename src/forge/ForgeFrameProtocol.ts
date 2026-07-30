import type { ForgePresentationPayload } from "../dungeon/exportPlayDungeonToForge";

export type ForgeVisibilityMessage = {
  readonly type: "black-flag:forge-visibility";
  readonly visible: boolean;
};

export type ForgeProceduralSeedMessage = {
  readonly type: "black-flag:forge-new-seed";
  readonly seed: number;
};

export type ForgePresentationMessage = {
  readonly type: "black-flag:forge-presentation";
  readonly version: 1;
  readonly enabled: boolean;
  readonly animate: boolean;
  readonly seed?: number;
  readonly themeKey?: string;
  readonly dungeon?: ForgePresentationPayload;
};

export type ForgeHostMessage =
  | ForgeVisibilityMessage
  | ForgeProceduralSeedMessage
  | ForgePresentationMessage;

export type ForgeAnimationCompleteMessage = {
  readonly type: "black-flag:forge-anim-complete";
  readonly version: 1;
};

export type ForgeDungeonMessage = {
  readonly type: "black-flag:forge-dungeon";
  readonly version: 1;
  readonly dungeon: unknown;
};

export type ForgeFrameMessage = ForgeAnimationCompleteMessage | ForgeDungeonMessage;

export interface ForgePresentationInput {
  readonly animate: boolean;
  readonly seed?: number;
  readonly themeKey?: string | null;
  readonly dungeon?: ForgePresentationPayload;
}

export function forgeVisibilityMessage(visible: boolean): ForgeVisibilityMessage {
  return { type: "black-flag:forge-visibility", visible };
}

export function forgeProceduralSeedMessage(seed: number): ForgeProceduralSeedMessage {
  return { type: "black-flag:forge-new-seed", seed };
}

export function forgePresentationMessage(
  enabled: boolean,
  input: ForgePresentationInput,
): ForgePresentationMessage {
  return {
    type: "black-flag:forge-presentation",
    version: 1,
    enabled,
    animate: input.animate,
    seed: input.seed,
    themeKey: input.themeKey ?? undefined,
    dungeon: input.dungeon,
  };
}

export function isForgeAnimationCompleteMessage(
  value: unknown,
): value is ForgeAnimationCompleteMessage {
  if (typeof value !== "object" || value === null) return false;
  try {
    const candidate = value as Record<string, unknown>;
    return candidate.type === "black-flag:forge-anim-complete" && candidate.version === 1;
  } catch {
    return false;
  }
}
