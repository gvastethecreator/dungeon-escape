import type { DungeonData, DungeonRoom } from "../dungeon/types";

export type RoomTheme =
  | "entrance"
  | "quarters"
  | "library"
  | "crypt"
  | "combat"
  | "elite"
  | "treasure"
  | "shrine"
  | "boss";

const FALLBACK_THEMES: readonly RoomTheme[] = [
  "quarters",
  "library",
  "crypt",
  "combat",
  "shrine",
  "treasure",
];

export function roomTheme(dungeon: DungeonData, room: DungeonRoom): RoomTheme {
  if (room.role === "entrance") return "entrance";
  if (room.role === "exit") return "boss";
  const forgeType = dungeon.forge?.roomTypes[room.id]?.toLowerCase();
  if (
    forgeType &&
    ["combat", "elite", "treasure", "shrine", "boss", "entrance"].includes(forgeType)
  )
    return forgeType as RoomTheme;
  return (
    FALLBACK_THEMES[Math.abs(room.id + dungeon.seedHash) % FALLBACK_THEMES.length] ?? "quarters"
  );
}
