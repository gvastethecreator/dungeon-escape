import * as THREE from "three";

import type { GridCell } from "../dungeon/types";
import type { StoneId } from "../ui/copy";
import type {
  RuntimeChestInstanceHandle,
  RuntimeDoorFrameInstanceHandle,
} from "./RuntimeModelBatching";

export type ChestRewardKind =
  | "resolve"
  | "time-freeze"
  | "luminous-ward"
  | "annihilation-pulse"
  | "cull-brand"
  | "phoenix-egg"
  | "map"
  | "mobility"
  | "clarity"
  | "swarm-curse"
  | "slow-curse"
  | "frenzy-curse"
  | "gloom-curse"
  | "mirror-curse"
  | "spin-curse";

export type StaticPickupKind = ChestRewardKind | "stone";

export interface StaticDoorActor {
  root: THREE.Group;
  left: THREE.Group;
  right: THREE.Group;
  openness: number;
  targetOpen: boolean;
  /** The immutable frame batches owned by this actor's resident floor. */
  runtimeBatch: RuntimeDoorFrameInstanceHandle | null;
}

export interface StaticPickupActor {
  /** Resident floor that owns this pickup; never infer it from world Y. */
  floorIndex: number;
  /** Stable plan/catalog identity. Present for all runtime-generated pickups. */
  id?: string;
  kind: StaticPickupKind;
  stoneId?: StoneId;
  object: THREE.Object3D;
  collected: boolean;
  collectTime: number;
  /** Parent-local origin captured when the collect flourish starts. */
  collectOriginX: number;
  collectOriginY: number;
  collectOriginZ: number;
  available: boolean;
  revealTime: number;
  baseY: number;
  baseScale: THREE.Vector3;
  autoCollect?: boolean;
  stoneSignal?: {
    light: THREE.PointLight;
    glow: THREE.Mesh;
    crown: THREE.Mesh;
    crystalAssembly: THREE.Group;
    effectColor: number;
    baseLightIntensity: number;
    baseGlowOpacity: number;
  };
  timeFreezeSignal?: {
    light: THREE.PointLight;
    baseIntensity: number;
  };
  luminousWardSignal?: {
    light: THREE.PointLight;
    glow: THREE.Mesh;
    baseIntensity: number;
    baseGlowOpacity: number;
  };
  annihilationPulseSignal?: {
    light: THREE.PointLight;
    glow: THREE.Mesh;
    baseIntensity: number;
    baseGlowOpacity: number;
  };
  cullBrandSignal?: {
    light: THREE.PointLight;
    glow: THREE.Mesh;
    baseIntensity: number;
    baseGlowOpacity: number;
  };
  phoenixEggSignal?: {
    light: THREE.PointLight;
    glow: THREE.Mesh;
    baseIntensity: number;
    baseGlowOpacity: number;
  };
}

export interface StaticChestActor {
  id: string;
  root: THREE.Group;
  lid: THREE.Group;
  reward: StaticPickupActor;
  opened: boolean;
  openness: number;
  runtimeBatch: RuntimeChestInstanceHandle | null;
}

export interface StaticStairActor {
  root: THREE.Group;
  direction: "up" | "down";
  targetFloor: number;
  cell: GridCell;
}
