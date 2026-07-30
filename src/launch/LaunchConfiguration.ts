import type { EngineMode } from "../game/EngineMode";

export type VisualQaState = "critical" | "dead" | "portal" | "won";
export type LaunchQueryFlag = boolean | null;

export interface LaunchRenderOverrides {
  readonly quality: LaunchQueryFlag;
  readonly crt: LaunchQueryFlag;
  readonly safeRender: LaunchQueryFlag;
}

export interface LaunchConfiguration {
  readonly seed: string | null;
  readonly mood: string | null;
  readonly authorityBaseUrl: string;
  readonly skipRunIntro: boolean;
  readonly performanceAudit: boolean;
  readonly visualQa: Readonly<{
    state: VisualQaState | null;
    seed: string | null;
  }>;
  readonly render: Readonly<LaunchRenderOverrides>;
}

export interface LaunchUrlUpdate {
  readonly mode?: EngineMode;
  readonly seed?: string;
}

export interface LaunchHistory {
  replace(update: LaunchUrlUpdate): void;
}

export interface LaunchHistoryEnvironment {
  currentHref(): string;
  replaceHref(href: string): void;
}

function queryFlag(params: URLSearchParams, key: string): LaunchQueryFlag {
  const raw = params.get(key);
  if (raw === null) return null;
  if (raw === "" || raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  return null;
}

function trimmed(value: string | null): string | null {
  const result = value?.trim();
  return result ? result : null;
}

function visualQaState(value: string | null): VisualQaState | null {
  return value === "critical" || value === "dead" || value === "portal" || value === "won"
    ? value
    : null;
}

function safeParams(search: string): URLSearchParams {
  try {
    return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  } catch {
    return new URLSearchParams();
  }
}

export function parseLaunchConfiguration(search: string): LaunchConfiguration {
  const params = safeParams(search);
  const seed = trimmed(params.get("seed"));
  const moodSource = params.has("mood") ? params.get("mood") : params.get("theme");
  const mood = trimmed(moodSource)?.toLowerCase() ?? null;
  const performanceAudit = params.has("perfAudit");
  const visualQa = Object.freeze({
    state: performanceAudit ? visualQaState(params.get("qaState")) : null,
    seed: performanceAudit && seed ? seed.slice(0, 96) : null,
  });
  const render = Object.freeze({
    quality: queryFlag(params, "quality"),
    crt: queryFlag(params, "crt"),
    safeRender: queryFlag(params, "safeRender"),
  });

  return Object.freeze({
    seed,
    mood,
    authorityBaseUrl: params.get("authority")?.trim() ?? "",
    skipRunIntro: params.get("skipRunIntro") === "1" || params.get("skipRunIntro") === "true",
    performanceAudit,
    visualQa,
    render,
  });
}

export function updateLaunchUrl(href: string, update: LaunchUrlUpdate): string {
  const url = new URL(href);
  if (update.mode !== undefined) url.searchParams.set("mode", update.mode);
  if (update.seed !== undefined) url.searchParams.set("seed", update.seed);
  return url.href;
}

export function createLaunchHistory(environment: LaunchHistoryEnvironment): LaunchHistory {
  return {
    replace(update) {
      environment.replaceHref(updateLaunchUrl(environment.currentHref(), update));
    },
  };
}
