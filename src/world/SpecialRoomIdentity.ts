import type { DungeonData, DungeonRoom } from "../dungeon/types";

export type SpecialRoomIdentity = "lake" | "grave" | "treasure" | "shrine" | "elite" | "boss";

const SPECIAL_TYPES = new Set<SpecialRoomIdentity>(["treasure", "shrine", "elite", "boss"]);

export function resolveSpecialRoomIdentity(
  dungeon: DungeonData,
  room: DungeonRoom,
): SpecialRoomIdentity | null {
  const metadata = dungeon.forge?.rooms.find((candidate) => candidate.id === room.id);
  if (metadata?.lake) return "lake";
  if (metadata?.grave) return "grave";
  const type = (metadata?.type ?? dungeon.forge?.roomTypes[room.id] ?? "").toLowerCase();
  return SPECIAL_TYPES.has(type as SpecialRoomIdentity) ? (type as SpecialRoomIdentity) : null;
}

export function specialRoomLabel(
  dungeon: DungeonData,
  room: DungeonRoom,
  fallback: string,
): string {
  const metadata = dungeon.forge?.rooms.find((candidate) => candidate.id === room.id);
  const authoredType = (
    metadata?.type ??
    dungeon.forge?.roomTypes[room.id] ??
    fallback
  ).toUpperCase();
  const identity = resolveSpecialRoomIdentity(dungeon, room);
  if (identity === "lake") return `LAKE · ${authoredType}`;
  if (identity === "grave") return `GRAVE · ${authoredType}`;
  return authoredType;
}
