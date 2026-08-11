import type { DungeonData, GridCell } from "../dungeon/types";
import type { DungeonMood } from "../systems/DungeonMood";

export interface LazyDungeonEditorViewOptions {
  onSelectSpawn(cell: GridCell): void;
}

export interface DungeonEditorViewPort {
  setDungeon(dungeon: DungeonData, mood?: DungeonMood): void;
  setSpawn(cell: GridCell): void;
  setDebug(debug: boolean): void;
  redraw(): void;
  dispose(): void;
}

export interface DungeonEditorViewConstructor {
  new (canvas: HTMLCanvasElement, options: LazyDungeonEditorViewOptions): DungeonEditorViewPort;
}

export type DungeonEditorViewLoader = () => Promise<{
  DungeonEditorView: DungeonEditorViewConstructor;
}>;

/** Loads the editor renderer only when Creation or Debug needs it. */
export class LazyDungeonEditorView {
  private view: DungeonEditorViewPort | null = null;
  private loading: Promise<void> | null = null;
  private dungeon: DungeonData | null = null;
  private mood: DungeonMood | undefined;
  private spawn: GridCell | null = null;
  private debug = false;
  private disposed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly options: LazyDungeonEditorViewOptions,
    private readonly loadModule: DungeonEditorViewLoader = () => import("./DungeonEditorView"),
  ) {}

  get isLoaded(): boolean {
    return this.view !== null;
  }

  async ensureLoaded(): Promise<void> {
    if (this.view || this.disposed) return;
    if (this.loading) return this.loading;
    this.loading = this.loadModule()
      .then(({ DungeonEditorView }) => {
        if (this.disposed) return;
        const view = new DungeonEditorView(this.canvas, this.options);
        this.view = view;
        if (this.dungeon) view.setDungeon(this.dungeon, this.mood);
        if (this.spawn) view.setSpawn(this.spawn);
        view.setDebug(this.debug);
      })
      .finally(() => {
        this.loading = null;
      });
    return this.loading;
  }

  setDungeon(dungeon: DungeonData, mood?: DungeonMood): void {
    this.dungeon = dungeon;
    this.mood = mood;
    this.spawn = dungeon.spawn;
    this.view?.setDungeon(dungeon, mood);
  }

  setSpawn(cell: GridCell): void {
    this.spawn = { ...cell };
    this.view?.setSpawn(cell);
  }

  setDebug(debug: boolean): void {
    this.debug = debug;
    this.view?.setDebug(debug);
  }

  redraw(): void {
    this.view?.redraw();
  }

  dispose(): void {
    this.disposed = true;
    this.view?.dispose();
    this.view = null;
    this.dungeon = null;
    this.spawn = null;
  }
}
