import type { GridCell } from "../dungeon/types";
import type { StoneId } from "../ui/copy";
import type { FloorExplorationRestore, FloorExplorationSnapshot } from "./FloorExploration";
import type { LocalRunResumeState } from "./LocalRunSave";
import type { PersistedRunSession, PlayRuntimeProgress, PlayRuntimeSnapshot } from "./PlayRuntime";
import type { RunMode } from "./RunSession";

export interface RunSessionSource {
  readonly seed: string;
  readonly resolve: number;
  readonly foundStoneIds: readonly StoneId[];
  readonly portalOpen: boolean;
  readonly runMode: RunMode;
  readonly exitReached: boolean;
}

export interface RunResumeCaptureInput {
  readonly play: Pick<PlayRuntimeSnapshot, "runMode" | "runSeconds" | "perStoneSeconds">;
  readonly player: {
    readonly position: Readonly<{ x: number; y: number; z: number }>;
    readonly lookYaw: number;
    readonly lookPitch: number;
    readonly distanceTravelled: number;
  };
  readonly world: {
    readonly difficultyElapsed: number;
    readonly timeFreezeRemaining: number;
    readonly luminousWardRemaining: number;
    readonly annihilationPulseRemaining: number;
    readonly mapRevealed: boolean;
    readonly mobilityBoostRemaining: number;
    readonly fogClearRemaining: number;
    readonly slowCurseRemaining: number;
    readonly frenzyCurseRemaining: number;
    readonly gloomCurseRemaining: number;
    readonly swarmCurseActive: boolean;
    readonly cullBrandRemaining: number;
    readonly shotgunShells: number;
    readonly shotgunPumpRemaining: number;
    readonly mirrorCurseRemaining: number;
    readonly spinCurseRemaining: number;
    readonly phoenixCharges: number;
  };
  readonly exploration: FloorExplorationSnapshot;
  readonly campaign: {
    readonly rootSeed?: string;
    readonly biomeId: string;
  };
}

export type ExplorationActivation =
  | { readonly kind: "start" }
  | { readonly kind: "restore"; readonly state: FloorExplorationRestore }
  | { readonly kind: "switch-floor"; readonly entryCell: Readonly<GridCell> };

export interface RunResumeActivationPlan {
  readonly persistedSession: PersistedRunSession;
  readonly runtimeProgress?: PlayRuntimeProgress;
  readonly playerPose?: Readonly<LocalRunResumeState["player"]>;
  readonly generation: Readonly<{
    seed: string;
    activeFloor: number;
    campaignBiomeId: string | null;
  }>;
  readonly exploration: ExplorationActivation;
}

export interface RunFloorTransitionInput {
  readonly domain: RunSessionSource;
  readonly resume: LocalRunResumeState;
  readonly destination: {
    readonly floorIndex: number;
    readonly entryCell: Readonly<GridCell>;
    readonly position: Readonly<{ x: number; y: number; z: number }>;
    readonly yaw: number;
    readonly pitch: number;
  };
}

function cloneStoneSeconds(
  source: Readonly<Partial<Record<StoneId, number>>> | undefined,
): Partial<Record<StoneId, number>> | undefined {
  return source ? { ...source } : undefined;
}

function cloneVisitedFloors(
  source: Readonly<Record<string, readonly string[]>> | undefined,
): Record<string, string[]> | undefined {
  if (!source) return undefined;
  const clone: Record<string, string[]> = {};
  for (const [floor, cells] of Object.entries(source)) clone[floor] = [...cells];
  return clone;
}

function cloneResume(resume: LocalRunResumeState): LocalRunResumeState {
  return {
    ...resume,
    player: { ...resume.player },
    visitedCells: [...resume.visitedCells],
    visitedFloors: cloneVisitedFloors(resume.visitedFloors),
    perStoneSeconds: cloneStoneSeconds(resume.perStoneSeconds),
  };
}

function explorationRestore(resume: LocalRunResumeState): FloorExplorationRestore {
  return {
    activeFloor: resume.activeFloor,
    visitedCells: [...resume.visitedCells],
    visitedFloors: cloneVisitedFloors(resume.visitedFloors),
    mapRevealed: resume.mapRevealed,
  };
}

export function captureRunResume(input: RunResumeCaptureInput): LocalRunResumeState | undefined {
  if (input.play.runMode !== "playing") return undefined;
  return {
    runSeconds: input.play.runSeconds,
    difficultyElapsed: input.world.difficultyElapsed,
    player: {
      x: input.player.position.x,
      y: input.player.position.y,
      z: input.player.position.z,
      yaw: input.player.lookYaw,
      pitch: input.player.lookPitch,
      distanceTravelled: input.player.distanceTravelled,
    },
    visitedCells: [...input.exploration.visitedCells],
    timeFreezeRemaining: input.world.timeFreezeRemaining,
    luminousWardRemaining: input.world.luminousWardRemaining,
    annihilationPulseRemaining: input.world.annihilationPulseRemaining,
    mapRevealed: input.world.mapRevealed || input.exploration.mapRevealed,
    mobilityBoostRemaining: input.world.mobilityBoostRemaining,
    fogClearRemaining: input.world.fogClearRemaining,
    slowCurseRemaining: input.world.slowCurseRemaining,
    frenzyCurseRemaining: input.world.frenzyCurseRemaining,
    gloomCurseRemaining: input.world.gloomCurseRemaining,
    swarmCurseActive: input.world.swarmCurseActive,
    cullBrandRemaining: input.world.cullBrandRemaining,
    shotgunShells: input.world.shotgunShells,
    shotgunPumpRemaining: input.world.shotgunPumpRemaining,
    mirrorCurseRemaining: input.world.mirrorCurseRemaining,
    spinCurseRemaining: input.world.spinCurseRemaining,
    phoenixCharges: input.world.phoenixCharges,
    activeFloor: input.exploration.activeFloor,
    campaignRootSeed: input.campaign.rootSeed,
    campaignBiomeId: input.campaign.biomeId,
    visitedFloors: cloneVisitedFloors(input.exploration.visitedFloors),
    perStoneSeconds: cloneStoneSeconds(input.play.perStoneSeconds),
  };
}

export function planRunResumeRestore(
  domain: RunSessionSource,
  resume?: LocalRunResumeState,
): RunResumeActivationPlan {
  const persistedSession: PersistedRunSession = {
    resolve: domain.resolve,
    foundStoneIds: [...domain.foundStoneIds],
    portalOpen: domain.portalOpen,
    runMode: domain.runMode,
    exitReached: domain.exitReached,
    runSeconds: resume?.runSeconds ?? 0,
    perStoneSeconds: cloneStoneSeconds(resume?.perStoneSeconds),
  };
  const generation = {
    seed: resume?.campaignRootSeed?.trim() || domain.seed,
    activeFloor: resume?.activeFloor ?? 0,
    campaignBiomeId: resume?.campaignBiomeId ?? null,
  };
  if (!resume) {
    return { persistedSession, generation, exploration: { kind: "start" } };
  }
  return {
    persistedSession,
    runtimeProgress: {
      progress: {
        difficultyElapsed: resume.difficultyElapsed,
        timeFreezeRemaining: resume.timeFreezeRemaining,
        luminousWardRemaining: resume.luminousWardRemaining,
        annihilationPulseRemaining: resume.annihilationPulseRemaining,
        mapRevealed: resume.mapRevealed,
        mobilityBoostRemaining: resume.mobilityBoostRemaining,
        fogClearRemaining: resume.fogClearRemaining,
        slowCurseRemaining: resume.slowCurseRemaining,
        frenzyCurseRemaining: resume.frenzyCurseRemaining,
        gloomCurseRemaining: resume.gloomCurseRemaining,
        swarmCurseActive: resume.swarmCurseActive,
        cullBrandRemaining: resume.cullBrandRemaining,
        shotgunShells: resume.shotgunShells,
        shotgunPumpRemaining: resume.shotgunPumpRemaining,
        mirrorCurseRemaining: resume.mirrorCurseRemaining,
        spinCurseRemaining: resume.spinCurseRemaining,
        phoenixCharges: resume.phoenixCharges,
      },
      player: { x: resume.player.x, z: resume.player.z },
    },
    playerPose: { ...resume.player },
    generation,
    exploration: { kind: "restore", state: explorationRestore(resume) },
  };
}

export function planFloorTransition(input: RunFloorTransitionInput): RunResumeActivationPlan {
  const { destination } = input;
  const pose = [
    destination.position.x,
    destination.position.y,
    destination.position.z,
    destination.yaw,
    destination.pitch,
  ];
  if (!Number.isInteger(destination.floorIndex) || destination.floorIndex < 0) {
    throw new RangeError("Floor transition target must be a non-negative integer.");
  }
  if (
    !Number.isInteger(destination.entryCell.x) ||
    !Number.isInteger(destination.entryCell.y) ||
    !pose.every(Number.isFinite)
  ) {
    throw new RangeError("Floor transition entry must be a finite grid pose.");
  }

  const nextResume = cloneResume(input.resume);
  nextResume.activeFloor = destination.floorIndex;
  // Swarm pressure is floor-local; do not carry doubled demand onto the next map.
  nextResume.swarmCurseActive = false;
  nextResume.player = {
    ...nextResume.player,
    x: destination.position.x,
    y: destination.position.y,
    z: destination.position.z,
    yaw: destination.yaw,
    pitch: destination.pitch,
  };
  const plan = planRunResumeRestore(input.domain, nextResume);
  return {
    ...plan,
    exploration: {
      kind: "switch-floor",
      entryCell: { x: destination.entryCell.x, y: destination.entryCell.y },
    },
  };
}
