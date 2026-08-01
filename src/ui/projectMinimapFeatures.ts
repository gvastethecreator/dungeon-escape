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
    enemies,
    stones,
    pickups,
    timeFreeze: firstUncollected(input.pickups, "time-freeze"),
    luminousWard: firstUncollected(input.pickups, "luminous-ward"),
    annihilationPulse: firstUncollected(input.pickups, "annihilation-pulse"),
    map: firstUncollected(input.pickups, "map"),
    mobility: firstUncollected(input.pickups, "mobility"),
    clarity: firstUncollected(input.pickups, "clarity"),
    swarmCurse: firstUncollected(input.pickups, "swarm-curse"),
    slowCurse: firstUncollected(input.pickups, "slow-curse"),
    frenzyCurse: firstUncollected(input.pickups, "frenzy-curse"),
    gloomCurse: firstUncollected(input.pickups, "gloom-curse"),
    stairs,
    relic: input.relic,
    spawn: { ...input.spawn },
  };
}
