import { describe, expect, test } from "bun:test";

import {
  getForgeDoorwayDirection,
  sealInvalidForgeRoomOpenings,
  type ForgeGridTopology,
} from "../src/forge/layoutTuning";

function topology(width = 7, height = 7): ForgeGridTopology {
  return {
    width,
    height,
    grid: new Uint8Array(width * height),
    corridors: new Uint8Array(width * height),
    roomIds: new Int16Array(width * height).fill(-1),
  };
}

function setRoomCell(data: ForgeGridTopology, x: number, y: number, room = 0): void {
  const index = y * data.width + x;
  data.grid[index] = 1;
  data.roomIds[index] = room;
}

function setCorridor(data: ForgeGridTopology, x: number, y: number): void {
  const index = y * data.width + x;
  data.grid[index] = 1;
  data.corridors[index] = 1;
}

describe("Forge room boundary topology", () => {
  test("keeps a corridor that enters a room head-on", () => {
    const data = topology();
    setRoomCell(data, 4, 3);
    setCorridor(data, 3, 3);
    setCorridor(data, 2, 3);

    expect(getForgeDoorwayDirection(data, 3, 3)).toEqual({ dx: 1, dy: 0 });
    expect(sealInvalidForgeRoomOpenings(data)).toBe(0);
  });

  test("seals a corridor that cuts along a room edge without a framed entry", () => {
    const data = topology();
    for (let y = 1; y <= 5; y += 1) {
      setRoomCell(data, 4, y);
      setCorridor(data, 3, y);
    }

    expect(getForgeDoorwayDirection(data, 3, 3)).toBeNull();
    expect(sealInvalidForgeRoomOpenings(data)).toBe(5);
    for (let y = 1; y <= 5; y += 1) expect(data.grid[y * data.width + 3]).toBe(0);
  });

  test("keeps both cells of a two-wide doorway", () => {
    const data = topology();
    for (const y of [2, 3]) {
      setRoomCell(data, 4, y);
      setCorridor(data, 3, y);
      setCorridor(data, 2, y);
    }

    expect(sealInvalidForgeRoomOpenings(data)).toBe(0);
    expect(getForgeDoorwayDirection(data, 3, 2)).toEqual({ dx: 1, dy: 0 });
    expect(getForgeDoorwayDirection(data, 3, 3)).toEqual({ dx: 1, dy: 0 });
  });

  test("keeps a real entry beside a corridor junction", () => {
    const data = topology();
    setRoomCell(data, 4, 3);
    setCorridor(data, 3, 3);
    setCorridor(data, 2, 3);
    setCorridor(data, 3, 2);
    setCorridor(data, 3, 4);

    expect(getForgeDoorwayDirection(data, 3, 3)).toEqual({ dx: 1, dy: 0 });
    expect(sealInvalidForgeRoomOpenings(data)).toBe(0);
  });

  test("keeps rounded-corner entries that touch two cells of one room", () => {
    const data = topology();
    setRoomCell(data, 4, 3);
    setRoomCell(data, 3, 4);
    setCorridor(data, 3, 3);
    setCorridor(data, 2, 3);
    setCorridor(data, 3, 2);

    expect(getForgeDoorwayDirection(data, 3, 3)).toEqual({ dx: 1, dy: 0 });
    expect(sealInvalidForgeRoomOpenings(data)).toBe(0);
  });

  test("keeps and frames a turning opening when sealing it would split the map", () => {
    const data = topology();
    setRoomCell(data, 4, 3);
    setCorridor(data, 3, 3);
    setCorridor(data, 3, 2);

    expect(getForgeDoorwayDirection(data, 3, 3)).toBeNull();
    expect(sealInvalidForgeRoomOpenings(data)).toBe(0);
    expect(data.preservedOpenings?.has(3 * data.width + 3)).toBe(true);
    expect(getForgeDoorwayDirection(data, 3, 3)).toEqual({ dx: 1, dy: 0 });
  });
});
