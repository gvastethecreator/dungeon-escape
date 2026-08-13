/**
 * Pure minimap marker projection from lightweight actor DTOs.
 * DungeonWorld supplies cells; this module owns filter policy.
 */

import type {
  MinimapCell,
  MinimapEnemy,
  MinimapFeatures,
  MinimapStair,
  MinimapStone,
} from "./minimapFeatures";
import type { StoneId } from "./copy";

export interface MinimapPickupDto {
  kind: string;
  available: boolean;
  collected: boolean;
  stoneId?: StoneId;
  cell: MinimapCell;
}

export interface MinimapEnemyDto {
  cell: MinimapCell;
  tier: number;
  scaleX: number;
  scaleY: number;
}

export interface MinimapStairDto {
  cell: MinimapCell;
  direction: "up" | "down";
}

export interface ProjectMinimapFeaturesInput {
  doors: readonly MinimapCell[];
  fires: readonly MinimapCell[];
  /** Optional floor-local hazards. Kept separate from static floor geometry. */
  hazards?: readonly MinimapCell[];
  enemies: readonly MinimapEnemyDto[];
  pickups: readonly MinimapPickupDto[];
  stairs?: readonly MinimapStairDto[];
  spawn: MinimapCell;
  relic?: MinimapCell;
}

function isLiveEnemy(enemy: MinimapEnemyDto): boolean {
  return enemy.scaleX > 0.001 && enemy.scaleY > 0.001;
}

function firstUncollected(
  pickups: readonly MinimapPickupDto[],
  kind: string,
): MinimapCell | undefined {
  const match = pickups.find((pickup) => pickup.kind === kind && !pickup.collected);
  return match ? match.cell : undefined;
}

/** Build the minimap feature snapshot from filtered actor records. */
export function projectMinimapFeatures(input: ProjectMinimapFeaturesInput): MinimapFeatures {
  const enemies: MinimapEnemy[] = input.enemies
    .filter(isLiveEnemy)
    .map((enemy) => ({ cell: enemy.cell, tier: enemy.tier }));

  const stones: MinimapStone[] = input.pickups
    .filter(
      (pickup): pickup is MinimapPickupDto & { kind: "stone"; stoneId: StoneId } =>
        pickup.kind === "stone" && pickup.stoneId !== undefined,
    )
    .map((pickup) => ({
      cell: pickup.cell,
      collected: pickup.collected,
      id: pickup.stoneId,
    }));

  const pickups: MinimapCell[] = input.pickups
    .filter((pickup) => pickup.kind === "resolve" && pickup.available && !pickup.collected)
    .map((pickup) => pickup.cell);

  const stairs: MinimapStair[] | undefined = input.stairs
    ? input.stairs.map((stair) => ({
        cell: { ...stair.cell },
        direction: stair.direction,
      }))
    : undefined;

  return {
    doors: [...input.doors],
    fires: [...input.fires],
    hazards: input.hazards ? [...input.hazards] : [],
    enemies,
    stones,
    pickups,
    timeFreeze: firstUncollected(input.pickups, "time-freeze"),
    luminousWard: firstUncollected(input.pickups, "luminous-ward"),
    annihilationPulse: firstUncollected(input.pickups, "annihilation-pulse"),
    cullBrand: firstUncollected(input.pickups, "cull-brand"),
    shotgun: firstUncollected(input.pickups, "shotgun"),
    phoenixEgg: firstUncollected(input.pickups, "phoenix-egg"),
    map: firstUncollected(input.pickups, "map"),
    mobility: firstUncollected(input.pickups, "mobility"),
    clarity: firstUncollected(input.pickups, "clarity"),
    swarmCurse: firstUncollected(input.pickups, "swarm-curse"),
    slowCurse: firstUncollected(input.pickups, "slow-curse"),
    frenzyCurse: firstUncollected(input.pickups, "frenzy-curse"),
    gloomCurse: firstUncollected(input.pickups, "gloom-curse"),
    mirrorCurse: firstUncollected(input.pickups, "mirror-curse"),
    spinCurse: firstUncollected(input.pickups, "spin-curse"),
    stairs,
    relic: input.relic,
    spawn: { ...input.spawn },
  };
}

/**
 * A preprojected floor marker layer. Static cells are allocated once while a
 * resident slab is built; pickup state is patched in place afterwards.
 */
export interface ResidentMinimapPickupBinding {
  readonly source: Pick<MinimapPickupDto, "kind" | "available" | "collected" | "stoneId">;
  readonly cell: MinimapCell;
}

export interface ResidentMinimapProjectionInput {
  readonly doors: readonly MinimapCell[];
  readonly fires: readonly MinimapCell[];
  readonly hazards?: readonly MinimapCell[];
  readonly pickups: readonly ResidentMinimapPickupBinding[];
  readonly stairs?: readonly MinimapStairDto[];
  readonly spawn: MinimapCell;
  readonly relic?: MinimapCell;
}

export interface ResidentMinimapProjection {
  /** Stable feature object selected by the active resident runtime. */
  readonly features: MinimapFeatures;
  /** Monotonic local revision for dynamic pickup state only. */
  readonly revision: number;
  /** Mutates only pickup-derived markers and reports a visible change. */
  refreshPickups(): boolean;
  /** Clears references when the owning runtime is disposed. */
  clear(): void;
}

type ResidentMinimapSingletonKey =
  | "timeFreeze"
  | "luminousWard"
  | "annihilationPulse"
  | "cullBrand"
  | "shotgun"
  | "phoenixEgg"
  | "map"
  | "mobility"
  | "clarity"
  | "swarmCurse"
  | "slowCurse"
  | "frenzyCurse"
  | "gloomCurse"
  | "mirrorCurse"
  | "spinCurse";

function pickupState(binding: ResidentMinimapPickupBinding): number {
  return (binding.source.available ? 1 : 0) | (binding.source.collected ? 2 : 0);
}

function nextUncollectedCell(
  bindings: readonly ResidentMinimapPickupBinding[],
  kind: string,
): MinimapCell | undefined {
  for (const binding of bindings) {
    if (binding.source.kind === kind && !binding.source.collected) return binding.cell;
  }
  return undefined;
}

class ResidentMinimapProjectionOwner implements ResidentMinimapProjection {
  readonly features: MinimapFeatures;
  private readonly pickupStates: number[];
  private readonly stoneBindings: readonly ResidentMinimapPickupBinding[];
  private revisionValue = 0;
  private cleared = false;

  constructor(
    private readonly bindings: readonly ResidentMinimapPickupBinding[],
    input: ResidentMinimapProjectionInput,
  ) {
    this.features = projectMinimapFeatures({
      doors: input.doors,
      fires: input.fires,
      hazards: input.hazards,
      // Enemy presentation remains global until RDL-15 establishes a resident
      // owner. Never bake those markers into every floor projection.
      enemies: [],
      pickups: bindings.map(({ source, cell }) => ({ ...source, cell })),
      stairs: input.stairs,
      spawn: input.spawn,
      relic: input.relic,
    });
    this.pickupStates = bindings.map(pickupState);
    this.stoneBindings = bindings.filter(
      (
        binding,
      ): binding is ResidentMinimapPickupBinding & {
        source: Pick<MinimapPickupDto, "kind" | "available" | "collected"> & {
          kind: "stone";
          stoneId: StoneId;
        };
      } => binding.source.kind === "stone" && binding.source.stoneId !== undefined,
    );
    // Replace the one-shot projection's cell clones with the resident static
    // cells now, so later state changes do not allocate marker objects.
    this.syncPickupMarkers();
  }

  get revision(): number {
    return this.revisionValue;
  }

  refreshPickups(): boolean {
    if (this.cleared) return false;
    let dirty = false;
    for (let index = 0; index < this.bindings.length; index += 1) {
      const next = pickupState(this.bindings[index]!);
      if (this.pickupStates[index] === next) continue;
      this.pickupStates[index] = next;
      dirty = true;
    }
    if (!dirty) return false;
    const changed = this.syncPickupMarkers();
    if (changed) this.revisionValue += 1;
    return changed;
  }

  clear(): void {
    if (this.cleared) return;
    this.cleared = true;
    this.features.doors.length = 0;
    this.features.fires.length = 0;
    if (this.features.hazards) this.features.hazards.length = 0;
    this.features.enemies.length = 0;
    this.features.stones.length = 0;
    this.features.pickups.length = 0;
    if (this.features.stairs) this.features.stairs.length = 0;
    this.features.timeFreeze = undefined;
    this.features.luminousWard = undefined;
    this.features.annihilationPulse = undefined;
    this.features.cullBrand = undefined;
    this.features.shotgun = undefined;
    this.features.phoenixEgg = undefined;
    this.features.map = undefined;
    this.features.mobility = undefined;
    this.features.clarity = undefined;
    this.features.swarmCurse = undefined;
    this.features.slowCurse = undefined;
    this.features.frenzyCurse = undefined;
    this.features.gloomCurse = undefined;
    this.features.mirrorCurse = undefined;
    this.features.spinCurse = undefined;
    this.revisionValue += 1;
  }

  private syncPickupMarkers(): boolean {
    let changed = false;
    let stoneIndex = 0;
    for (const binding of this.stoneBindings) {
      const marker = this.features.stones[stoneIndex];
      if (!marker) break;
      if (marker.cell !== binding.cell) {
        marker.cell = binding.cell;
        changed = true;
      }
      if (marker.collected !== binding.source.collected) {
        marker.collected = binding.source.collected;
        changed = true;
      }
      stoneIndex += 1;
    }

    let writeIndex = 0;
    for (const binding of this.bindings) {
      const source = binding.source;
      if (source.kind !== "resolve" || !source.available || source.collected) continue;
      const previous = this.features.pickups[writeIndex];
      if (previous !== binding.cell) {
        this.features.pickups[writeIndex] = binding.cell;
        changed = true;
      }
      writeIndex += 1;
    }
    if (this.features.pickups.length !== writeIndex) {
      this.features.pickups.length = writeIndex;
      changed = true;
    }

    const singletons: ReadonlyArray<readonly [ResidentMinimapSingletonKey, string]> = [
      ["timeFreeze", "time-freeze"],
      ["luminousWard", "luminous-ward"],
      ["annihilationPulse", "annihilation-pulse"],
      ["cullBrand", "cull-brand"],
      ["shotgun", "shotgun"],
      ["phoenixEgg", "phoenix-egg"],
      ["map", "map"],
      ["mobility", "mobility"],
      ["clarity", "clarity"],
      ["swarmCurse", "swarm-curse"],
      ["slowCurse", "slow-curse"],
      ["frenzyCurse", "frenzy-curse"],
      ["gloomCurse", "gloom-curse"],
      ["mirrorCurse", "mirror-curse"],
      ["spinCurse", "spin-curse"],
    ];
    for (const [key, kind] of singletons) {
      const next = nextUncollectedCell(this.bindings, kind);
      if (this.features[key] === next) continue;
      this.features[key] = next;
      changed = true;
    }
    return changed;
  }
}

/** Builds one resident-floor projection; rebinds only swap this stable object. */
export function createResidentMinimapProjection(
  input: ResidentMinimapProjectionInput,
): ResidentMinimapProjection {
  return new ResidentMinimapProjectionOwner(input.pickups, input);
}
