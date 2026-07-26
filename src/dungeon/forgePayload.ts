/**
 * Bounded DTO helpers for forge → host postMessage (plan 005).
 * Rejects incomplete graphs so the host never builds from garbage.
 */
import type { ForgeDungeonPayload } from "./importDungeonForge";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Narrow and validate a forge publish payload.
 * Returns null when the message body is not a loadable dungeon graph.
 */
export function normalizeForgePayload(raw: unknown): ForgeDungeonPayload | null {
  if (!isRecord(raw)) return null;
  if (raw.valid !== true) return null;
  if (!isFiniteNumber(raw.W) || !isFiniteNumber(raw.H) || raw.W < 5 || raw.H < 5) return null;
  if (!isFiniteNumber(raw.seed) || !isFiniteNumber(raw.entrance) || !isFiniteNumber(raw.boss))
    return null;
  if (!Array.isArray(raw.rooms) || raw.rooms.length < 2) return null;
  if (!Array.isArray(raw.edges)) return null;
  if (!isRecord(raw.params)) return null;
  if (
    !isFiniteNumber(raw.params.roomCount) ||
    !isFiniteNumber(raw.params.loopChance) ||
    raw.params.loopChance < 0 ||
    raw.params.loopChance > 1 ||
    !isFiniteNumber(raw.params.decorDensity) ||
    typeof raw.params.themeKey !== "string" ||
    !raw.params.themeKey.trim()
  )
    return null;
  if (raw.grid == null) return null;
  return raw as unknown as ForgeDungeonPayload;
}
