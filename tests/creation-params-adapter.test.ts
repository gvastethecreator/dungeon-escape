import { describe, expect, test } from "bun:test";

import { DEFAULT_DUNGEON_PARAMS } from "../src/domain/core";
import {
  applyCreationParamsToForm,
  readCreationParams,
  type CreationParamsForm,
} from "../src/editor/CreationParamsAdapter";

function fakeForm(overrides: Partial<CreationParamsForm> = {}): CreationParamsForm {
  const value = (start: string) => ({ value: start });
  return {
    roomCount: value("12"),
    roomCountLabel: value("12"),
    loopRate: value("20"),
    loopRateLabel: value("20%"),
    decorDensity: value("40"),
    decorDensityLabel: value("40%"),
    mapWidth: value("41"),
    mapWidthLabel: value("41"),
    mapHeight: value("41"),
    mapHeightLabel: value("41"),
    minRoom: value("4"),
    minRoomLabel: value("4"),
    maxRoom: value("8"),
    maxRoomLabel: value("8"),
    corridorRadius: value("1"),
    corridorLabel: value("1"),
    roomPadding: value("2"),
    paddingLabel: value("2"),
    enemyDensity: value("50"),
    lightLevel: value("80"),
    lightLevelLabel: value("80%"),
    profileSelect: { value: "custom", options: [{ value: "custom" }, { value: "ash" }] },
    ...overrides,
  };
}

describe("CreationParamsAdapter", () => {
  test("reads numeric dungeon params from the form", () => {
    expect(readCreationParams(fakeForm())).toEqual({
      roomTarget: 12,
      loopRate: 20,
      decorDensity: 40,
      mapWidth: 41,
      mapHeight: 41,
      minRoomSize: 4,
      maxRoomSize: 8,
      corridorRadius: 1,
      roomPadding: 2,
      enemyDensity: 50,
      lightLevel: 80,
      profile: "custom",
    });
  });

  test("writes params back onto the form", () => {
    const form = fakeForm();
    applyCreationParamsToForm(form, DEFAULT_DUNGEON_PARAMS);
    expect(readCreationParams(form).roomTarget).toBe(DEFAULT_DUNGEON_PARAMS.roomTarget);
    expect(form.loopRateLabel.value).toBe(`${DEFAULT_DUNGEON_PARAMS.loopRate}%`);
  });

  test("keeps form readers out of Play campaign code", async () => {
    const main = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    expect(main).not.toContain("function readEditorParams");
    expect(main).not.toContain("function applyEditorParamsToForm");
    expect(main).toContain("readCreationParams(elements)");
  });
});
