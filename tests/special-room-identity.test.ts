import { describe, expect, test } from "bun:test";

import type { DungeonData, DungeonRoom } from "../src/dungeon/types";
import { resolveSpecialRoomIdentity } from "../src/world/SpecialRoomIdentity";

const room: DungeonRoom = {
  id: 4,
  x: 1,
  y: 1,
  width: 6,
  height: 6,
  center: { x: 4, y: 4 },
  role: "room",
};

function dungeonWithRoom(metadata: Record<string, unknown>): DungeonData {
  return {
    seed: "identity",
    seedHash: 1,
    width: 8,
    height: 8,
    rooms: [room],
    forge: {
      roomTypes: { 4: String(metadata.type ?? "combat") },
      rooms: [{ id: 4, cx: 4, cy: 4, w: 6, h: 6, type: "combat", ...metadata }],
    },
  } as unknown as DungeonData;
}

describe("special room identity", () => {
  test("prioritizes lake and grave traits over the generic room type", () => {
    expect(resolveSpecialRoomIdentity(dungeonWithRoom({ type: "elite", lake: true }), room)).toBe(
      "lake",
    );
    expect(resolveSpecialRoomIdentity(dungeonWithRoom({ type: "combat", grave: true }), room)).toBe(
      "grave",
    );
  });

  test("keeps authored treasure, shrine, elite and boss identities", () => {
    for (const kind of ["treasure", "shrine", "elite", "boss"] as const) {
      expect(resolveSpecialRoomIdentity(dungeonWithRoom({ type: kind }), room)).toBe(kind);
    }
  });
});
