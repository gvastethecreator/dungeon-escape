import { describe, expect, test } from "bun:test";

import type { DungeonData, GridCell } from "../src/dungeon/types";
import {
  LazyDungeonEditorView,
  type DungeonEditorViewConstructor,
} from "../src/editor/LazyDungeonEditorView";
import { getDungeonMood } from "../src/systems/DungeonMood";

describe("LazyDungeonEditorView", () => {
  test("stores editor state without loading editor code on the Play path", async () => {
    const calls: string[] = [];
    let loads = 0;
    class FakeEditorView {
      constructor(_canvas: HTMLCanvasElement, _options: { onSelectSpawn(cell: GridCell): void }) {
        calls.push("construct");
      }
      setDungeon(dungeon: DungeonData): void {
        calls.push(`dungeon:${dungeon.seed}`);
      }
      setSpawn(cell: GridCell): void {
        calls.push(`spawn:${cell.x},${cell.y}`);
      }
      setDebug(debug: boolean): void {
        calls.push(`debug:${debug}`);
      }
      redraw(): void {
        calls.push("redraw");
      }
      dispose(): void {
        calls.push("dispose");
      }
    }
    const dungeon = {
      seed: "LAZY-EDITOR",
      spawn: { x: 2, y: 3 },
    } as DungeonData;
    const view = new LazyDungeonEditorView(
      {} as HTMLCanvasElement,
      { onSelectSpawn: () => {} },
      async () => {
        loads += 1;
        return { DungeonEditorView: FakeEditorView as DungeonEditorViewConstructor };
      },
    );

    view.setDungeon(dungeon, getDungeonMood("ash"));
    view.setSpawn({ x: 4, y: 5 });
    view.setDebug(true);
    view.redraw();
    expect(loads).toBe(0);
    expect(calls).toEqual([]);

    await Promise.all([view.ensureLoaded(), view.ensureLoaded()]);
    expect(loads).toBe(1);
    expect(calls).toEqual(["construct", "dungeon:LAZY-EDITOR", "spawn:4,5", "debug:true"]);

    view.dispose();
    expect(calls.at(-1)).toBe("dispose");
  });
});
