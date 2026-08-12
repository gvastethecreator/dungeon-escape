import { describe, expect, test } from "bun:test";

import { FLOOR, generateDungeon } from "../src/dungeon/generateDungeon";
import type { DungeonData, DungeonRoom } from "../src/dungeon/types";

function roomContains(room: DungeonRoom, x: number, y: number): boolean {
  return x >= room.x && x < room.x + room.width && y >= room.y && y < room.y + room.height;
}

function actualRoomOpenings(dungeon: DungeonData, room: DungeonRoom): Set<string> {
  const openings = new Set<string>();
  const visit = (x: number, y: number, outDx: number, outDy: number): void => {
    if (dungeon.grid[y]?.[x] !== FLOOR) return;
    const outsideX = x + outDx;
    const outsideY = y + outDy;
    if (dungeon.grid[outsideY]?.[outsideX] !== FLOOR) return;
    if (roomContains(room, outsideX, outsideY)) return;
    openings.add(`${x},${y},${outDx},${outDy}`);
  };

  for (let x = room.x; x < room.x + room.width; x += 1) {
    visit(x, room.y, 0, -1);
    visit(x, room.y + room.height - 1, 0, 1);
  }
  for (let y = room.y; y < room.y + room.height; y += 1) {
    visit(room.x, y, -1, 0);
    visit(room.x + room.width - 1, y, 1, 0);
  }
  return openings;
}

describe("classic dungeon topology contract", () => {
  test("every graph edge owns exactly two explicit, reachable doorways", () => {
    const dungeon = generateDungeon("EXPLICIT-DOORS", { roomTarget: 24 });
    const topology = dungeon.topology;
    expect(topology).toBeDefined();
    expect(topology?.doorways).toHaveLength(dungeon.edges.length * 2);
    expect(topology?.routes).toHaveLength(dungeon.edges.length);

    for (let edgeIndex = 0; edgeIndex < dungeon.edges.length; edgeIndex += 1) {
      const edge = dungeon.edges[edgeIndex];
      const doorways =
        topology?.doorways.filter((doorway) => doorway.edgeIndex === edgeIndex) ?? [];
      expect(doorways).toHaveLength(2);
      expect(new Set(doorways.map((doorway) => doorway.roomId))).toEqual(
        new Set([edge?.left, edge?.right]),
      );
      for (const doorway of doorways) {
        expect(dungeon.grid[doorway.cell.y]?.[doorway.cell.x]).toBe(FLOOR);
        expect(dungeon.grid[doorway.outside.y]?.[doorway.outside.x]).toBe(FLOOR);
        expect(
          dungeon.distances[doorway.cell.y * dungeon.width + doorway.cell.x],
        ).toBeGreaterThanOrEqual(0);
      }
      const route = topology?.routes?.[edgeIndex] ?? [];
      expect(route[0]).toEqual(dungeon.rooms[edge!.left]?.center);
      expect(route.at(-1)).toEqual(dungeon.rooms[edge!.right]?.center);
      for (let routeIndex = 0; routeIndex < route.length; routeIndex += 1) {
        const cell = route[routeIndex]!;
        expect(dungeon.grid[cell.y]?.[cell.x]).toBe(FLOOR);
        if (routeIndex === 0) continue;
        const previous = route[routeIndex - 1]!;
        expect(Math.abs(cell.x - previous.x) + Math.abs(cell.y - previous.y)).toBe(1);
      }
    }
  });

  test("room boundaries expose only generated doorway seats across a seed matrix", () => {
    for (let index = 0; index < 200; index += 1) {
      const dungeon = generateDungeon(`SEALED-ROOM-${index}`, {
        roomTarget: index % 3 === 0 ? 32 : 20,
        corridorRadius: index % 5 === 0 ? 1 : 0,
      });
      const topology = dungeon.topology;
      expect(topology).toBeDefined();
      for (const room of dungeon.rooms) {
        const expected = new Set(
          topology?.doorways
            .filter((doorway) => doorway.roomId === room.id)
            .map(
              (doorway) => `${doorway.cell.x},${doorway.cell.y},${doorway.outDx},${doorway.outDy}`,
            ),
        );
        expect(actualRoomOpenings(dungeon, room)).toEqual(expected);
      }
    }
  });

  test("doorway and corridor metadata are deterministic", () => {
    const first = generateDungeon("DOOR-DETERMINISM", { roomTarget: 28, corridorRadius: 1 });
    const second = generateDungeon("DOOR-DETERMINISM", { roomTarget: 28, corridorRadius: 1 });

    expect(first.topologySignature).toBe(second.topologySignature);
    expect(first.topology?.doorways).toEqual(second.topology?.doorways);
    expect(first.topology?.routes).toEqual(second.topology?.routes);
    expect([...first.topology!.corridors]).toEqual([...second.topology!.corridors]);
    expect([...first.topology!.roomIds]).toEqual([...second.topology!.roomIds]);
  });
});
