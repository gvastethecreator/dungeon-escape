export interface FloorTransitionRequest {
  targetFloor: number;
  direction: "up" | "down";
}

export type FloorTransitionRejection =
  | "busy"
  | "not-ready"
  | "invalid-target"
  | "missing-linked-stair";

export type FloorTransitionStage =
  | "prepare"
  | "checkpoint"
  | "cover"
  | "activate"
  | "warmup"
  | "present"
  | "reveal"
  | "input"
  | "recovery";

export type FloorTransitionCheckpoint = "saved" | "session-only";
export type FloorTransitionWarmup = "ready" | "degraded";

export type FloorTransitionResult =
  | {
      kind: "completed";
      checkpoint: FloorTransitionCheckpoint;
      warmup: FloorTransitionWarmup;
    }
  | { kind: "rejected"; reason: FloorTransitionRejection }
  | {
      kind: "recovered";
      stage: FloorTransitionStage;
      activeFloor: "source" | "target";
      error: unknown;
    };

export type FloorTransitionPreparation<TPrepared> =
  | { ok: true; value: TPrepared }
  | { ok: false; reason: Exclude<FloorTransitionRejection, "busy"> };

export interface FloorTransitionPort<TPrepared> {
  prepare(request: FloorTransitionRequest): FloorTransitionPreparation<TPrepared>;
  checkpoint(prepared: TPrepared): boolean;
  setInputBlocked(blocked: boolean): void;
  fade(opaque: boolean): Promise<void>;
  activate(prepared: TPrepared): Promise<void>;
  isTargetActive(prepared: TPrepared): boolean;
  warmup(prepared: TPrepared): Promise<FloorTransitionWarmup>;
  present(
    prepared: TPrepared,
    checkpoint: FloorTransitionCheckpoint,
    warmup: FloorTransitionWarmup,
  ): void;
  recoverTarget(prepared: TPrepared, checkpoint: FloorTransitionCheckpoint, error: unknown): void;
}

/** Runs one checkpointed floor swap and always releases its cover/input gate. */
export class FloorTransitionDirector<TPrepared> {
  private busy = false;

  constructor(private readonly port: FloorTransitionPort<TPrepared>) {}

  async start(request: FloorTransitionRequest): Promise<FloorTransitionResult> {
    if (this.busy) return { kind: "rejected", reason: "busy" };
    this.busy = true;

    let prepared: TPrepared | null = null;
    let checkpoint: FloorTransitionCheckpoint = "session-only";
    let warmup: FloorTransitionWarmup = "ready";
    let stage: FloorTransitionStage = "prepare";
    let inputBlocked = false;
    let failure: Extract<FloorTransitionResult, { kind: "recovered" }> | null = null;

    try {
      const preparation = this.port.prepare(request);
      if (!preparation.ok) return { kind: "rejected", reason: preparation.reason };
      prepared = preparation.value;

      stage = "checkpoint";
      checkpoint = this.port.checkpoint(prepared) ? "saved" : "session-only";

      stage = "cover";
      this.port.setInputBlocked(true);
      inputBlocked = true;
      await this.port.fade(true);

      stage = "activate";
      await this.port.activate(prepared);

      stage = "warmup";
      warmup = await this.port.warmup(prepared);

      stage = "present";
      this.port.present(prepared, checkpoint, warmup);
    } catch (error) {
      const activeFloor = prepared && this.port.isTargetActive(prepared) ? "target" : "source";
      failure = { kind: "recovered", stage, activeFloor, error };
      if (prepared && activeFloor === "target") {
        try {
          this.port.recoverTarget(prepared, checkpoint, error);
        } catch (recoveryError) {
          failure = {
            kind: "recovered",
            stage: "recovery",
            activeFloor: "target",
            error: recoveryError,
          };
        }
      }
    } finally {
      if (inputBlocked) {
        try {
          stage = "reveal";
          await this.port.fade(false);
        } catch (error) {
          failure ??= {
            kind: "recovered",
            stage,
            activeFloor: prepared && this.port.isTargetActive(prepared) ? "target" : "source",
            error,
          };
        } finally {
          try {
            this.port.setInputBlocked(false);
          } catch (error) {
            failure ??= {
              kind: "recovered",
              stage: "input",
              activeFloor: prepared && this.port.isTargetActive(prepared) ? "target" : "source",
              error,
            };
          }
        }
      }
      this.busy = false;
    }

    return failure ?? { kind: "completed", checkpoint, warmup };
  }
}
