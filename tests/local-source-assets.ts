import { existsSync } from "node:fs";
import { resolve } from "node:path";

export const LOCAL_SOURCE_ROOT = resolve(import.meta.dir, "../assets-source");

export function localSourcePath(...parts: string[]): string {
  return resolve(LOCAL_SOURCE_ROOT, ...parts);
}

export function hasLocalSourceAssets(...parts: string[]): boolean {
  return existsSync(parts.length === 0 ? LOCAL_SOURCE_ROOT : localSourcePath(...parts));
}
