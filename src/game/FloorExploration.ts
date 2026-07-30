import { FLOOR } from "../dungeon/generateDungeon";
import type { DungeonData, GridCell } from "../dungeon/types";

/** Default Chebyshev radius revealed when the player enters a cell. */
export const MINIMAP_REVEAL_RADIUS = 2;

const CELL_KEY_PATTERN = /^-?\d+,-?\d+$/;
const FLOOR_KEY_PATTERN = /^(0|[1-9]\d*)$/;

export interface FloorExplorationRestore {
  readonly activeFloor?: number;
  readonly visitedCells?: readonly string[];
  readonly visitedFloors?: Readonly<Record<string, readonly string[]>>;
  readonly mapRevealed?: boolean;
}

export interface FloorExplorationSnapshot {
  readonly activeFloor: number;
  readonly visitedCells: string[];
  readonly visitedFloors: Record<string, string[]>;
  readonly mapRevealed: boolean;
}

export interface FloorExplorationView {
  readonly floorIndex: number;
  /** Undefined means the whole active floor is visible. */
  readonly explored: ReadonlySet<string> | undefined;
  readonly exploredCount: number;
  readonly mapRevealed: boolean;
}

export interface ExplorationChange {
  readonly cellChanged: boolean;
  readonly cellsAdded: number;
  readonly exploredCount: number;
}

export type FloorExplorationRestoreResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "invalid-floor" | "invalid-cell" };

export function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

/** Add only walkable cells in a Chebyshev radius to an exploration set. */
export function collectExploredAround(
  dungeon: DungeonData,
  center: GridCell,
  radius: number,
  into: Set<string> = new Set(),
): Set<string> {
  const r = Math.max(0, Math.floor(radius));
  for (let y = center.y - r; y <= center.y + r; y += 1) {
    for (let x = center.x - r; x <= center.x + r; x += 1) {
      if (dungeon.grid[y]?.[x] !== FLOOR) continue;
      into.add(cellKey(x, y));
    }
  }
  return into;
}

function dungeonFloor(dungeon: DungeonData): { index: number; count: number } {
  const index = dungeon.floor?.index ?? 0;
  const count = dungeon.floor?.count ?? 1;
  if (
    !Number.isInteger(index) ||
    !Number.isInteger(count) ||
    count < 1 ||
    index < 0 ||
    index >= count
  ) {
    throw new RangeError(`Invalid dungeon floor ${index}/${count}.`);
  }
  return { index, count };
}

function isGridCell(cell: GridCell): boolean {
  return Number.isInteger(cell.x) && Number.isInteger(cell.y);
}

function isCellKey(value: string): boolean {
  if (!CELL_KEY_PATTERN.test(value)) return false;
  const [x, y] = value.split(",").map(Number);
  return Number.isSafeInteger(x) && Number.isSafeInteger(y);
}

function parseCellKey(value: string): GridCell | null {
  if (!isCellKey(value)) return null;
  const [x, y] = value.split(",").map(Number);
  return x === undefined || y === undefined ? null : { x, y };
}

function isCellKeyInBounds(dungeon: DungeonData, value: string): boolean {
  const cell = parseCellKey(value);
  return (
    cell !== null &&
    cell.x >= 0 &&
    cell.y >= 0 &&
    cell.x < dungeon.width &&
    cell.y < dungeon.height
  );
}

function isWalkableCellKey(dungeon: DungeonData, value: string): boolean {
  const cell = parseCellKey(value);
  return cell !== null && dungeon.grid[cell.y]?.[cell.x] === FLOOR;
}

function createReadonlySetView(read: () => ReadonlySet<string>): ReadonlySet<string> {
  const view = {
    get size() {
      return read().size;
    },
    has(value: string) {
      return read().has(value);
    },
    entries() {
      return read().entries();
    },
    keys() {
      return read().keys();
    },
    values() {
      return read().values();
    },
    forEach(
      callback: (value: string, value2: string, set: ReadonlySet<string>) => void,
      thisArg?: unknown,
    ) {
      for (const value of read()) callback.call(thisArg, value, value, view);
    },
    [Symbol.iterator]() {
      return read()[Symbol.iterator]();
    },
  } satisfies ReadonlySet<string>;
  return Object.freeze(view);
}

function createExplorationView(read: {
  floorIndex: () => number;
  explored: () => ReadonlySet<string> | undefined;
  exploredCount: () => number;
  mapRevealed: () => boolean;
}): FloorExplorationView {
  return Object.freeze({
    get floorIndex() {
      return read.floorIndex();
    },
    get explored() {
      return read.explored();
    },
    get exploredCount() {
      return read.exploredCount();
    },
    get mapRevealed() {
      return read.mapRevealed();
    },
  });
}

/**
 * Owns fog-of-war state for one run. It has no storage, DOM, or network effects;
 * callers supply dungeons and persist the defensive snapshots it returns.
 */
export class FloorExploration {
  readonly #revealRadius: number;
  readonly #cellsByFloor = new Map<number, Set<string>>();
  readonly #activeCellsView: ReadonlySet<string>;
  readonly #view: FloorExplorationView;
  #dungeon: DungeonData | null = null;
  #floorCount = 1;
  #activeFloor = 0;
  #lastCellKey: string | null = null;
  #mapRevealed = false;

  constructor(options: { revealRadius?: number } = {}) {
    this.#revealRadius = Math.max(0, Math.floor(options.revealRadius ?? MINIMAP_REVEAL_RADIUS));
    this.#activeCellsView = createReadonlySetView(() => this.#activeCells());
    this.#view = createExplorationView({
      floorIndex: () => this.#activeFloor,
      explored: () => (this.#mapRevealed ? undefined : this.#activeCellsView),
      exploredCount: () => this.#activeCells().size,
      mapRevealed: () => this.#mapRevealed,
    });
  }

  start(dungeon: DungeonData, entry: GridCell = dungeon.spawn): FloorExplorationView {
    const floor = dungeonFloor(dungeon);
    if (!isGridCell(entry)) throw new TypeError("Exploration entry must be an integer grid cell.");

    const cells = collectExploredAround(dungeon, entry, this.#revealRadius);
    this.#cellsByFloor.clear();
    this.#cellsByFloor.set(floor.index, cells);
    this.#dungeon = dungeon;
    this.#floorCount = floor.count;
    this.#activeFloor = floor.index;
    this.#lastCellKey = null;
    this.#mapRevealed = false;
    return this.#view;
  }

  restore(
    dungeon: DungeonData,
    restore: FloorExplorationRestore,
    entry: GridCell = dungeon.spawn,
  ): FloorExplorationRestoreResult {
    const floor = dungeonFloor(dungeon);
    if (!isGridCell(entry)) return { ok: false, reason: "invalid-cell" };
    if (
      restore.activeFloor !== undefined &&
      (!Number.isInteger(restore.activeFloor) ||
        restore.activeFloor < 0 ||
        restore.activeFloor >= floor.count ||
        restore.activeFloor !== floor.index)
    ) {
      return { ok: false, reason: "invalid-floor" };
    }

    const nextFloors = new Map<number, Set<string>>();
    for (const [key, cells] of Object.entries(restore.visitedFloors ?? {})) {
      if (!FLOOR_KEY_PATTERN.test(key)) return { ok: false, reason: "invalid-floor" };
      const index = Number(key);
      if (!Number.isSafeInteger(index) || index < 0 || index >= floor.count) {
        return { ok: false, reason: "invalid-floor" };
      }
      if (!Array.isArray(cells) || !cells.every((cell) => isCellKeyInBounds(dungeon, cell))) {
        return { ok: false, reason: "invalid-cell" };
      }
      nextFloors.set(index, new Set(cells));
    }

    const legacyCells = restore.visitedCells ?? [];
    if (!Array.isArray(legacyCells) || !legacyCells.every((cell) => isCellKeyInBounds(dungeon, cell))) {
      return { ok: false, reason: "invalid-cell" };
    }
    const activeCells = nextFloors.get(floor.index) ?? new Set(legacyCells);
    if (![...activeCells].every((cell) => isWalkableCellKey(dungeon, cell))) {
      return { ok: false, reason: "invalid-cell" };
    }
    nextFloors.set(floor.index, activeCells);
    if (activeCells.size === 0) {
      collectExploredAround(dungeon, entry, this.#revealRadius, activeCells);
    }

    this.#cellsByFloor.clear();
    for (const [index, cells] of nextFloors) this.#cellsByFloor.set(index, cells);
    this.#dungeon = dungeon;
    this.#floorCount = floor.count;
    this.#activeFloor = floor.index;
    this.#lastCellKey = null;
    this.#mapRevealed = restore.mapRevealed === true;
    return { ok: true };
  }

  switchFloor(dungeon: DungeonData, entry: GridCell): FloorExplorationView {
    const floor = dungeonFloor(dungeon);
    if (floor.count !== this.#floorCount) {
      throw new RangeError(`Floor count changed from ${this.#floorCount} to ${floor.count}.`);
    }
    if (!isGridCell(entry)) throw new TypeError("Exploration entry must be an integer grid cell.");

    const cells = new Set(
      [...(this.#cellsByFloor.get(floor.index) ?? [])].filter((cell) =>
        isWalkableCellKey(dungeon, cell),
      ),
    );
    if (cells.size === 0) collectExploredAround(dungeon, entry, this.#revealRadius, cells);
    this.#cellsByFloor.set(floor.index, cells);
    this.#dungeon = dungeon;
    this.#activeFloor = floor.index;
    this.#lastCellKey = null;
    return this.#view;
  }

  reveal(cell: GridCell): ExplorationChange {
    const dungeon = this.#dungeon;
    if (!dungeon || !isGridCell(cell)) {
      return { cellChanged: false, cellsAdded: 0, exploredCount: this.#activeCells().size };
    }
    const key = cellKey(cell.x, cell.y);
    const cellChanged = key !== this.#lastCellKey;
    this.#lastCellKey = key;
    const cells = this.#activeCells();
    const before = cells.size;
    collectExploredAround(dungeon, cell, this.#revealRadius, cells);
    return {
      cellChanged,
      cellsAdded: cells.size - before,
      exploredCount: cells.size,
    };
  }

  setMapRevealed(revealed: boolean): boolean {
    if (!revealed || this.#mapRevealed) return false;
    this.#mapRevealed = true;
    return true;
  }

  activeView(): FloorExplorationView {
    return this.#view;
  }

  snapshot(): FloorExplorationSnapshot {
    const visitedFloors: Record<string, string[]> = {};
    for (const index of [...this.#cellsByFloor.keys()].sort((left, right) => left - right)) {
      visitedFloors[String(index)] = [...(this.#cellsByFloor.get(index) ?? [])].sort();
    }
    return {
      activeFloor: this.#activeFloor,
      visitedCells: [...this.#activeCells()].sort(),
      visitedFloors,
      mapRevealed: this.#mapRevealed,
    };
  }

  #activeCells(): Set<string> {
    return this.#cellsByFloor.get(this.#activeFloor) ?? new Set<string>();
  }
}
