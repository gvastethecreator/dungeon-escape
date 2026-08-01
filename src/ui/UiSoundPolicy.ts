import type { AudioCue } from "../audio/AudioAssetCatalog";

export interface UiSoundTarget {
  readonly disabled?: boolean;
  matches(selector: string): boolean;
  closest(selector: string): UiSoundTarget | null;
  hasAttribute(name: string): boolean;
  getAttribute(name: string): string | null;
}

export const UI_SOUND_SELECTOR =
  "button, [role='button'], a.button, summary, select, input[type='button'], input[type='submit'], input[type='checkbox'], input[type='radio'], .leaderboard-seed, .biome-picker-option, .welcome-menu__item, .welcome-music-toggle";

const PRIMARY_SELECTOR =
  ".biome-picker-option, .welcome-menu__item--primary, #leaderboard-submit, #welcome-new, #options-resume, #end-next-biome";
const SECONDARY_SELECTOR =
  "#biome-picker-back, .welcome-menu__item--secondary, #welcome-custom, summary, #retry, #new-dungeon";
const TOGGLE_SELECTOR =
  "#music-toggle, #welcome-music-toggle, #audio-toggle, #crt-toggle, #texture-smoothing-toggle, input[type='checkbox']";
const TICK_SELECTOR = "select, .leaderboard-seed";
const HOVER_SELECTOR =
  ".welcome-menu__item, .biome-picker-option, .leaderboard-seed, .welcome-music-toggle, #options-resume, button.mode-button, [data-engine-mode]";

function isUiSoundTarget(value: unknown): value is UiSoundTarget {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<UiSoundTarget>;
  return (
    typeof candidate.matches === "function" &&
    typeof candidate.closest === "function" &&
    typeof candidate.hasAttribute === "function" &&
    typeof candidate.getAttribute === "function"
  );
}

export function resolveUiSoundTarget(value: unknown): UiSoundTarget | null {
  return isUiSoundTarget(value) ? value.closest(UI_SOUND_SELECTOR) : null;
}

export function isUiControlDisabled(target: UiSoundTarget): boolean {
  return (
    target.disabled === true ||
    target.hasAttribute("disabled") ||
    target.getAttribute("aria-disabled") === "true"
  );
}

export function resolveUiClickCue(target: UiSoundTarget): AudioCue {
  if (isUiControlDisabled(target)) return "uiDeny";
  if (target.matches(PRIMARY_SELECTOR) || target.closest(PRIMARY_SELECTOR)) return "uiSelect";
  if (target.matches(SECONDARY_SELECTOR) || target.closest(SECONDARY_SELECTOR)) return "uiBack";
  if (target.matches(TOGGLE_SELECTOR) || target.closest(TOGGLE_SELECTOR)) return "uiToggle";
  if (target.matches(TICK_SELECTOR) || target.closest(TICK_SELECTOR)) return "uiTick";
  return "uiClick";
}

export function resolveUiHoverCue(target: UiSoundTarget): AudioCue | null {
  if (isUiControlDisabled(target) || !target.closest(HOVER_SELECTOR)) return null;
  return "uiHover";
}

export function resolveUiChangeCue(value: unknown): AudioCue | null {
  if (!isUiSoundTarget(value)) return null;
  if (value.matches("input[type='range']")) return "uiTick";
  if (value.matches("select, input[type='checkbox'], input[type='radio']")) return "uiToggle";
  return null;
}
