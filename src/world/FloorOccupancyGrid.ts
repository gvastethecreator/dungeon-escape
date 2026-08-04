/**
 * Compact, per-floor occupancy state for dungeon-local tile coordinates.
 *
 * Writes reject invalid cells so a placement bug is visible while building a
 * scene. Read queries return false for invalid cells, which keeps callers that
 * probe edge neighbors deterministic without allocating a sentinel cell.
 */
export const FloorOccupancyBit = {
  Solid: 1 << 0,
  Object: 1 << 1,
  WallDecoration: 1 << 2,
  Objective: 1 << 3,
  Hazard: 1 << 4,
  Stair: 1 << 5,
  CeilingDecoration: 1 << 6,
} as const;

export type FloorOccupancyBit = (typeof FloorOccupancyBit)[keyof typeof FloorOccupancyBit];

export type FloorOccupancyMask = number;

/**
 * Read-only numeric cell probe used by placement planners.  It intentionally
 * exposes coordinates and masks rather than a serialized `"x,y"` ledger, so
 * a planner can stay on its owning floor without materializing an aggregate
 * occupancy Set.
 */
export interface CellOccupancyQuery {
  isOccupied(x: number, y: number, mask?: FloorOccupancyMask): boolean;
}

export type FloorOccupancyCategory =
  | "solid"
  | "object"
  | "wallDecoration"
  | "objective"
  | "hazard"
  | "stair"
  | "ceilingDecoration";

export interface FloorOccupancyCell {
  floorIndex: number;
  x: number;
  y: number;
}

export interface FloorOccupancyBitCount {
  bit: FloorOccupancyBit;
  category: FloorOccupancyCategory;
  cells: number;
}

export interface FloorOccupancyOverlapCount {
  first: FloorOccupancyCategory;
  second: FloorOccupancyCategory;
  cells: number;
}

export interface FloorOccupancyGridDiagnostics {
  floorIndex: number;
  width: number;
  height: number;
  memoryBytes: number;
  occupiedCells: number;
  overlapCells: number;
  bitCounts: readonly FloorOccupancyBitCount[];
  overlaps: readonly FloorOccupancyOverlapCount[];
}

export interface FloorOccupancyLegacyFlatKeyCollision {
  category: FloorOccupancyCategory;
  x: number;
  y: number;
  floorIndices: readonly number[];
}

export interface FloorOccupancyPlacementChange {
  floorIndex: number;
  placementId: string;
  kind: "added" | "removed" | "moved";
  from?: Readonly<{ x: number; y: number }>;
  to?: Readonly<{ x: number; y: number }>;
}

export interface FloorOccupancyReport {
  legacyFlatKeyCollisions: readonly FloorOccupancyLegacyFlatKeyCollision[];
  placementChanges: readonly FloorOccupancyPlacementChange[];
  perFloor: readonly FloorOccupancyGridDiagnostics[];
  memoryBytes: number;
}

interface BitDescriptor {
  bit: FloorOccupancyBit;
  category: FloorOccupancyCategory;
}

const BIT_DESCRIPTORS: readonly BitDescriptor[] = [
  { bit: FloorOccupancyBit.Solid, category: "solid" },
  { bit: FloorOccupancyBit.Object, category: "object" },
  { bit: FloorOccupancyBit.WallDecoration, category: "wallDecoration" },
  { bit: FloorOccupancyBit.Objective, category: "objective" },
  { bit: FloorOccupancyBit.Hazard, category: "hazard" },
  { bit: FloorOccupancyBit.Stair, category: "stair" },
  { bit: FloorOccupancyBit.CeilingDecoration, category: "ceilingDecoration" },
];

const ALL_BITS = BIT_DESCRIPTORS.reduce((mask, descriptor) => mask | descriptor.bit, 0);

function isInteger(value: number): boolean {
  return Number.isSafeInteger(value);
}

function assertDimension(name: string, value: number, minimum: number): void {
  if (!isInteger(value) || value < minimum) {
    throw new RangeError(
      "FloorOccupancyGrid " + name + " must be a safe integer at least " + minimum + ".",
    );
  }
}

function assertMask(mask: number): asserts mask is FloorOccupancyMask {
  if (!isInteger(mask) || mask <= 0 || (mask & ~ALL_BITS) !== 0) {
    throw new RangeError("FloorOccupancyGrid mask must contain one or more known occupancy bits.");
  }
}

function freezeDiagnostics(
  diagnostics: FloorOccupancyGridDiagnostics,
): FloorOccupancyGridDiagnostics {
  return Object.freeze({
    ...diagnostics,
    bitCounts: Object.freeze(diagnostics.bitCounts.map((count) => Object.freeze({ ...count }))),
    overlaps: Object.freeze(diagnostics.overlaps.map((overlap) => Object.freeze({ ...overlap }))),
  });
}

/**
 * Dense one-byte-per-cell occupancy mask. The floor index identifies this
 * owner; it is intentionally never folded into the typed-array offset.
 */
export class FloorOccupancyGrid implements CellOccupancyQuery {
  readonly floorIndex: number;
  readonly width: number;
  readonly height: number;
  readonly #cells: Uint8Array;

  constructor(floorIndex: number, width: number, height: number) {
    assertDimension("floorIndex", floorIndex, 0);
    assertDimension("width", width, 1);
    assertDimension("height", height, 1);
    const cellCount = width * height;
    if (!Number.isSafeInteger(cellCount)) {
      throw new RangeError("FloorOccupancyGrid dimensions exceed the dense array limit.");
    }
    this.floorIndex = floorIndex;
    this.width = width;
    this.height = height;
    this.#cells = new Uint8Array(cellCount);
  }

  get memoryBytes(): number {
    return this.#cells.byteLength;
  }

  get cellCount(): number {
    return this.#cells.length;
  }

  mark(x: number, y: number, bits: FloorOccupancyMask): boolean {
    assertMask(bits);
    const index = this.writeIndex(x, y);
    const before = this.#cells[index] ?? 0;
    const after = before | bits;
    this.#cells[index] = after;
    return after !== before;
  }

  unmark(x: number, y: number, bits: FloorOccupancyMask): boolean {
    assertMask(bits);
    const index = this.writeIndex(x, y);
    const before = this.#cells[index] ?? 0;
    const after = before & ~bits;
    this.#cells[index] = after;
    return after !== before;
  }

  set(x: number, y: number, bits: number): boolean {
    if (!isInteger(bits) || bits < 0 || (bits & ~ALL_BITS) !== 0) {
      throw new RangeError("FloorOccupancyGrid set mask may contain only known occupancy bits.");
    }
    const index = this.writeIndex(x, y);
    const before = this.#cells[index] ?? 0;
    this.#cells[index] = bits;
    return bits !== before;
  }

  has(x: number, y: number, bits: FloorOccupancyMask): boolean {
    assertMask(bits);
    const mask = this.readMask(x, y);
    return (mask & bits) === bits;
  }

  hasAny(x: number, y: number, bits: FloorOccupancyMask): boolean {
    assertMask(bits);
    return (this.readMask(x, y) & bits) !== 0;
  }

  isOccupied(x: number, y: number, mask: FloorOccupancyMask = ALL_BITS): boolean {
    return this.hasAny(x, y, mask);
  }

  getMask(x: number, y: number): number {
    return this.readMask(x, y);
  }

  clear(): void {
    this.#cells.fill(0);
  }

  diagnostics(): FloorOccupancyGridDiagnostics {
    const bitCounts = BIT_DESCRIPTORS.map((descriptor) => ({
      bit: descriptor.bit,
      category: descriptor.category,
      cells: 0,
    }));
    const overlaps: FloorOccupancyOverlapCount[] = [];
    let occupiedCells = 0;
    let overlapCells = 0;

    for (const mask of this.#cells) {
      if (mask === 0) continue;
      occupiedCells += 1;
      let matchingBits = 0;
      for (let index = 0; index < BIT_DESCRIPTORS.length; index += 1) {
        const descriptor = BIT_DESCRIPTORS[index]!;
        if ((mask & descriptor.bit) === 0) continue;
        matchingBits += 1;
        bitCounts[index]!.cells += 1;
      }
      if (matchingBits > 1) overlapCells += 1;
    }

    for (let first = 0; first < BIT_DESCRIPTORS.length; first += 1) {
      for (let second = first + 1; second < BIT_DESCRIPTORS.length; second += 1) {
        const left = BIT_DESCRIPTORS[first]!;
        const right = BIT_DESCRIPTORS[second]!;
        let cells = 0;
        const combined = left.bit | right.bit;
        for (const mask of this.#cells) {
          if ((mask & combined) === combined) cells += 1;
        }
        if (cells > 0) {
          overlaps.push({ first: left.category, second: right.category, cells });
        }
      }
    }

    return freezeDiagnostics({
      floorIndex: this.floorIndex,
      width: this.width,
      height: this.height,
      memoryBytes: this.memoryBytes,
      occupiedCells,
      overlapCells,
      bitCounts,
      overlaps,
    });
  }

  private readMask(x: number, y: number): number {
    if (!this.isInside(x, y)) return 0;
    return this.#cells[y * this.width + x] ?? 0;
  }

  private writeIndex(x: number, y: number): number {
    if (!this.isInside(x, y)) {
      throw new RangeError(
        "FloorOccupancyGrid write is outside this floor's dungeon-local bounds.",
      );
    }
    return y * this.width + x;
  }

  private isInside(x: number, y: number): boolean {
    return isInteger(x) && isInteger(y) && x >= 0 && x < this.width && y >= 0 && y < this.height;
  }
}

/**
 * Short-lived dense reservation mask for one placement pass.  Unlike a Set of
 * cell keys it neither copies the floor grid nor creates string payloads.  A
 * caller drops the overlay after publishing its accepted cells to the owning
 * FloorOccupancyGrid.
 */
export class FloorOccupancyOverlay implements CellOccupancyQuery {
  readonly width: number;
  readonly height: number;
  readonly #cells: Uint8Array;

  constructor(width: number, height: number) {
    assertDimension("width", width, 1);
    assertDimension("height", height, 1);
    const cellCount = width * height;
    if (!Number.isSafeInteger(cellCount)) {
      throw new RangeError("FloorOccupancyOverlay dimensions exceed the dense array limit.");
    }
    this.width = width;
    this.height = height;
    this.#cells = new Uint8Array(cellCount);
  }

  mark(x: number, y: number, bits: FloorOccupancyMask): boolean {
    assertMask(bits);
    if (!this.isInside(x, y)) return false;
    const index = y * this.width + x;
    const before = this.#cells[index] ?? 0;
    const after = before | bits;
    this.#cells[index] = after;
    return after !== before;
  }

  hasAny(x: number, y: number, bits: FloorOccupancyMask): boolean {
    assertMask(bits);
    if (!this.isInside(x, y)) return false;
    return ((this.#cells[y * this.width + x] ?? 0) & bits) !== 0;
  }

  isOccupied(x: number, y: number, mask: FloorOccupancyMask = ALL_BITS): boolean {
    return this.hasAny(x, y, mask);
  }

  clear(): void {
    this.#cells.fill(0);
  }

  private isInside(x: number, y: number): boolean {
    return isInteger(x) && isInteger(y) && x >= 0 && x < this.width && y >= 0 && y < this.height;
  }
}

function clonePlacementChange(
  change: FloorOccupancyPlacementChange,
): FloorOccupancyPlacementChange {
  return Object.freeze({
    ...change,
    ...(change.from ? { from: Object.freeze({ ...change.from }) } : {}),
    ...(change.to ? { to: Object.freeze({ ...change.to }) } : {}),
  });
}

/**
 * Diagnostic-only report. It deliberately compares raw dungeon-local X/Y
 * cells between floor grids, exposing collisions a historic flat key ledger
 * would conflate without putting coordinate strings on the placement hot path.
 *
 * Placement changes come from a parity witness that compares emitted output to
 * its isolated baseline; they are never inferred from occupancy marks alone.
 */
export function createFloorOccupancyReport(
  grids: readonly FloorOccupancyGrid[],
  placementChanges: readonly FloorOccupancyPlacementChange[] = [],
): FloorOccupancyReport {
  const ordered = [...grids].sort((left, right) => left.floorIndex - right.floorIndex);
  const legacyFlatKeyCollisions: FloorOccupancyLegacyFlatKeyCollision[] = [];

  for (const descriptor of BIT_DESCRIPTORS) {
    for (let gridIndex = 0; gridIndex < ordered.length; gridIndex += 1) {
      const grid = ordered[gridIndex]!;
      for (let y = 0; y < grid.height; y += 1) {
        for (let x = 0; x < grid.width; x += 1) {
          if (!grid.has(x, y, descriptor.bit)) continue;
          let seenEarlier = false;
          for (let earlier = 0; earlier < gridIndex; earlier += 1) {
            if (ordered[earlier]!.has(x, y, descriptor.bit)) {
              seenEarlier = true;
              break;
            }
          }
          if (seenEarlier) continue;
          const floorIndices = [grid.floorIndex];
          for (let later = gridIndex + 1; later < ordered.length; later += 1) {
            if (ordered[later]!.has(x, y, descriptor.bit)) {
              floorIndices.push(ordered[later]!.floorIndex);
            }
          }
          if (floorIndices.length > 1) {
            legacyFlatKeyCollisions.push({
              category: descriptor.category,
              x,
              y,
              floorIndices: Object.freeze(floorIndices),
            });
          }
        }
      }
    }
  }

  legacyFlatKeyCollisions.sort(
    (left, right) =>
      left.category.localeCompare(right.category) || left.y - right.y || left.x - right.x,
  );
  const perFloor = ordered.map((grid) => grid.diagnostics());
  const memoryBytes = perFloor.reduce((total, diagnostics) => total + diagnostics.memoryBytes, 0);
  return Object.freeze({
    legacyFlatKeyCollisions: Object.freeze(
      legacyFlatKeyCollisions.map((collision) => Object.freeze({ ...collision })),
    ),
    placementChanges: Object.freeze(placementChanges.map(clonePlacementChange)),
    perFloor: Object.freeze(perFloor),
    memoryBytes,
  });
}
