/**
 * Play HUD owner for timed power chips, curses, phoenix, and swarm flags.
 * Shell keeps DOM element refs; this module owns chip latch and dataset writes.
 */

import { TimedStatusChip } from "./TimedStatusChip";

export interface PlayStatusChipElements {
  root: HTMLElement;
  value: HTMLElement & { dateTime?: string };
}

export interface PlayStatusHudPorts {
  shell: HTMLElement;
  timeFreeze: PlayStatusChipElements;
  luminousWard: PlayStatusChipElements;
  annihilationPulse: PlayStatusChipElements;
  cullBrand: PlayStatusChipElements;
  fogClear: PlayStatusChipElements;
  mobility: PlayStatusChipElements;
  slowCurse: PlayStatusChipElements;
  frenzyCurse: PlayStatusChipElements;
  gloomCurse: PlayStatusChipElements;
  mirrorCurse: PlayStatusChipElements;
  spinCurse: PlayStatusChipElements;
  swarmRoot: HTMLElement;
  phoenixRoot: HTMLElement;
  /** Optional side effect when fog-clear active state changes (atmosphere pulse). */
  onFogClearActive?: (active: boolean) => void;
}

export interface PlayStatusSnapshot {
  timeFreeze?: number;
  luminousWard?: number;
  annihilationPulse?: number;
  cullBrand?: number;
  fogClear?: number;
  mobility?: number;
  phoenixCharges?: number;
  slow?: number;
  frenzy?: number;
  gloom?: number;
  mirror?: number;
  spin?: number;
  swarm?: boolean;
}

export class PlayStatusHud {
  private readonly timeFreeze: TimedStatusChip;
  private readonly luminousWard: TimedStatusChip;
  private readonly annihilationPulse: TimedStatusChip;
  private readonly cullBrand: TimedStatusChip;
  private readonly fogClear: TimedStatusChip;
  private readonly mobility: TimedStatusChip;
  private readonly slowCurse: TimedStatusChip;
  private readonly frenzyCurse: TimedStatusChip;
  private readonly gloomCurse: TimedStatusChip;
  private readonly mirrorCurse: TimedStatusChip;
  private readonly spinCurse: TimedStatusChip;
  private lastFogClearActive: boolean | null = null;

  constructor(private readonly ports: PlayStatusHudPorts) {
    const shell = ports.shell;
    this.timeFreeze = new TimedStatusChip({
      elements: ports.timeFreeze,
      shell,
      shellDatasetKey: "timeFreeze",
      ariaRemaining: "time freeze remaining",
    });
    this.luminousWard = new TimedStatusChip({
      elements: ports.luminousWard,
      shell,
      shellDatasetKey: "luminousWard",
      ariaRemaining: "ward remaining",
    });
    this.annihilationPulse = new TimedStatusChip({
      elements: ports.annihilationPulse,
      shell,
      shellDatasetKey: "annihilationPulse",
      ariaRemaining: "pulse remaining",
    });
    this.cullBrand = new TimedStatusChip({
      elements: ports.cullBrand,
      shell,
      shellDatasetKey: "cullBrand",
      ariaRemaining: "cull brand remaining",
    });
    this.fogClear = new TimedStatusChip({
      elements: ports.fogClear,
      shell,
      shellDatasetKey: "fogClear",
      ariaRemaining: "clear air remaining",
    });
    this.mobility = new TimedStatusChip({
      elements: ports.mobility,
      shell,
      shellDatasetKey: "mobilityBoost",
      ariaRemaining: "wayfinder remaining",
    });
    this.slowCurse = new TimedStatusChip({
      elements: ports.slowCurse,
      shell,
      shellDatasetKey: "slowCurse",
      ariaRemaining: "heavy limbs remaining",
    });
    this.frenzyCurse = new TimedStatusChip({
      elements: ports.frenzyCurse,
      shell,
      shellDatasetKey: "frenzyCurse",
      ariaRemaining: "blood frenzy remaining",
    });
    this.gloomCurse = new TimedStatusChip({
      elements: ports.gloomCurse,
      shell,
      shellDatasetKey: "gloomCurse",
      ariaRemaining: "gloom remaining",
    });
    this.mirrorCurse = new TimedStatusChip({
      elements: ports.mirrorCurse,
      shell,
      shellDatasetKey: "mirrorCurse",
      ariaRemaining: "mirror curse remaining",
    });
    this.spinCurse = new TimedStatusChip({
      elements: ports.spinCurse,
      shell,
      shellDatasetKey: "spinCurse",
      ariaRemaining: "spin curse remaining",
    });
  }

  reset(): void {
    this.timeFreeze.reset();
    this.luminousWard.reset();
    this.annihilationPulse.reset();
    this.cullBrand.reset();
    this.fogClear.reset();
    this.mobility.reset();
    this.slowCurse.reset();
    this.frenzyCurse.reset();
    this.gloomCurse.reset();
    this.mirrorCurse.reset();
    this.spinCurse.reset();
    this.syncSwarm(false);
    this.syncPhoenix(0);
    this.applyFogClearSideEffect(false);
  }

  /** Sync timed chips, curses, phoenix, and swarm from one snapshot. */
  sync(snapshot: PlayStatusSnapshot): void {
    if (snapshot.timeFreeze !== undefined) this.timeFreeze.sync(snapshot.timeFreeze);
    if (snapshot.luminousWard !== undefined) this.luminousWard.sync(snapshot.luminousWard);
    if (snapshot.annihilationPulse !== undefined)
      this.annihilationPulse.sync(snapshot.annihilationPulse);
    if (snapshot.cullBrand !== undefined) this.cullBrand.sync(snapshot.cullBrand);
    if (snapshot.fogClear !== undefined) {
      this.fogClear.sync(snapshot.fogClear);
      this.applyFogClearSideEffect(snapshot.fogClear > 0);
    }
    if (snapshot.mobility !== undefined) this.mobility.sync(snapshot.mobility);
    if (snapshot.phoenixCharges !== undefined) this.syncPhoenix(snapshot.phoenixCharges);
    if (snapshot.slow !== undefined) this.slowCurse.sync(snapshot.slow);
    if (snapshot.frenzy !== undefined) this.frenzyCurse.sync(snapshot.frenzy);
    if (snapshot.gloom !== undefined) this.gloomCurse.sync(snapshot.gloom);
    if (snapshot.mirror !== undefined) this.mirrorCurse.sync(snapshot.mirror);
    if (snapshot.spin !== undefined) this.spinCurse.sync(snapshot.spin);
    if (snapshot.swarm !== undefined) this.syncSwarm(snapshot.swarm);
  }

  private syncSwarm(active: boolean): void {
    this.ports.swarmRoot.hidden = !active;
    this.ports.shell.dataset.swarmCurse = active ? "true" : "false";
  }

  private syncPhoenix(charges: number): void {
    const armed = charges > 0;
    this.ports.phoenixRoot.hidden = !armed;
    this.ports.shell.dataset.phoenix = armed ? "true" : "false";
  }

  private applyFogClearSideEffect(active: boolean): void {
    if (this.lastFogClearActive === active) return;
    this.lastFogClearActive = active;
    this.ports.onFogClearActive?.(active);
  }
}
