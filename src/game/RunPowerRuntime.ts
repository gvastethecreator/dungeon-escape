/**
 * Runtime bag for timed powers, curses, and related run-local flags.
 * DungeonWorld keeps presentation and seats; this owns remaining windows.
 */

import {
  activateAnnihilationPulse,
  createAnnihilationPulseClock,
  isAnnihilationPulseActive,
  tickAnnihilationPulse,
  type AnnihilationPulseClock,
} from "./AnnihilationPulse";
import {
  activateCullBrand,
  createCullBrandState,
  isCullBrandActive,
  restoreCullBrand,
  tickCullBrand,
  type CullBrandState,
} from "./CullBrand";
import { activateFogClear, isFogClearActive, tickFogClear } from "./FogClear";
import { activateFrenzyCurse, isFrenzyCurseActive, tickFrenzyCurse } from "./FrenzyCurse";
import { activateGloomCurse, isGloomCurseActive, tickGloomCurse } from "./GloomCurse";
import { activateHandTorch, isHandTorchActive, tickHandTorch } from "./HandTorch";
import { activateLuminousWard, isLuminousWardActive, tickLuminousWard } from "./LuminousWard";
import { activateMirrorCurse, isMirrorCurseActive, tickMirrorCurse } from "./MirrorCurse";
import { activateMobilityBoost, isMobilityBoostActive, tickMobilityBoost } from "./MobilityBoost";
import { armPhoenixCharge, clampPhoenixCharges, hasPhoenixCharge } from "./PhoenixEgg";
import { activateSlowCurse, isSlowCurseActive, tickSlowCurse } from "./SlowCurse";
import { activateSpinCurse, isSpinCurseActive, tickSpinCurse } from "./SpinCurse";
import { activateSwarmCurse, isSwarmCurseActive } from "./SwarmCurse";
import { activateTimeFreeze, isTimeFreezeActive, tickTimeFreeze } from "./TimeFreeze";

/** Pickup kinds that only mutate this bag (not stones/resolve). */
export type RunPowerPickupKind =
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

export interface RunPowerRuntimeState {
  timeFreezeSeconds: number;
  luminousWardSeconds: number;
  mobilityBoostSeconds: number;
  fogClearSeconds: number;
  handTorchSeconds: number;
  slowCurseSeconds: number;
  frenzyCurseSeconds: number;
  gloomCurseSeconds: number;
  swarmCurseActive: boolean;
  mirrorCurseSeconds: number;
  spinCurseSeconds: number;
  cullBrand: CullBrandState;
  annihilationPulse: AnnihilationPulseClock;
  phoenixCharges: number;
  mapRevealed: boolean;
}

export interface RunPowerRuntimeProgress {
  timeFreezeRemaining?: number;
  luminousWardRemaining?: number;
  annihilationPulseRemaining?: number;
  mapRevealed?: boolean;
  mobilityBoostRemaining?: number;
  fogClearRemaining?: number;
  handTorchRemaining?: number;
  slowCurseRemaining?: number;
  frenzyCurseRemaining?: number;
  gloomCurseRemaining?: number;
  swarmCurseActive?: boolean;
  cullBrandRemaining?: number;
  mirrorCurseRemaining?: number;
  spinCurseRemaining?: number;
  phoenixCharges?: number;
}

export interface RunPowerTickResult {
  /** Pulse rings that should fire this frame. */
  pulseCount: number;
}

export function createRunPowerRuntime(): RunPowerRuntimeState {
  return {
    timeFreezeSeconds: 0,
    luminousWardSeconds: 0,
    mobilityBoostSeconds: 0,
    fogClearSeconds: 0,
    handTorchSeconds: 0,
    slowCurseSeconds: 0,
    frenzyCurseSeconds: 0,
    gloomCurseSeconds: 0,
    swarmCurseActive: false,
    mirrorCurseSeconds: 0,
    spinCurseSeconds: 0,
    cullBrand: createCullBrandState(),
    annihilationPulse: createAnnihilationPulseClock(),
    phoenixCharges: 0,
    mapRevealed: false,
  };
}

export function resetRunPowerRuntime(
  state: RunPowerRuntimeState,
  options: { carryPhoenix?: boolean } = {},
): void {
  const carryPhoenix = options.carryPhoenix ? state.phoenixCharges : 0;
  state.timeFreezeSeconds = 0;
  state.luminousWardSeconds = 0;
  state.mobilityBoostSeconds = 0;
  state.fogClearSeconds = 0;
  state.handTorchSeconds = 0;
  state.slowCurseSeconds = 0;
  state.frenzyCurseSeconds = 0;
  state.gloomCurseSeconds = 0;
  state.swarmCurseActive = false;
  state.mirrorCurseSeconds = 0;
  state.spinCurseSeconds = 0;
  restoreCullBrand(state.cullBrand, 0, 0);
  state.annihilationPulse.remaining = 0;
  state.annihilationPulse.timeSincePulse = 0;
  state.phoenixCharges = carryPhoenix;
  state.mapRevealed = false;
}

export function tickRunPowerRuntime(
  state: RunPowerRuntimeState,
  delta: number,
): RunPowerTickResult {
  state.timeFreezeSeconds = tickTimeFreeze(state.timeFreezeSeconds, delta);
  state.luminousWardSeconds = tickLuminousWard(state.luminousWardSeconds, delta);
  state.mobilityBoostSeconds = tickMobilityBoost(state.mobilityBoostSeconds, delta);
  state.fogClearSeconds = tickFogClear(state.fogClearSeconds, delta);
  state.handTorchSeconds = tickHandTorch(state.handTorchSeconds, delta);
  state.slowCurseSeconds = tickSlowCurse(state.slowCurseSeconds, delta);
  state.frenzyCurseSeconds = tickFrenzyCurse(state.frenzyCurseSeconds, delta);
  state.gloomCurseSeconds = tickGloomCurse(state.gloomCurseSeconds, delta);
  state.mirrorCurseSeconds = tickMirrorCurse(state.mirrorCurseSeconds, delta);
  state.spinCurseSeconds = tickSpinCurse(state.spinCurseSeconds, delta);
  tickCullBrand(state.cullBrand, delta);
  const pulseCount = tickAnnihilationPulse(state.annihilationPulse, delta);
  return { pulseCount };
}

export function restoreRunPowerRuntime(
  state: RunPowerRuntimeState,
  progress: RunPowerRuntimeProgress,
): void {
  state.timeFreezeSeconds = Math.max(0, progress.timeFreezeRemaining ?? 0);
  state.luminousWardSeconds = Math.max(0, progress.luminousWardRemaining ?? 0);
  state.annihilationPulse.remaining = Math.max(0, progress.annihilationPulseRemaining ?? 0);
  state.annihilationPulse.timeSincePulse = 0;
  state.mapRevealed = progress.mapRevealed === true;
  state.mobilityBoostSeconds = Math.max(0, progress.mobilityBoostRemaining ?? 0);
  state.fogClearSeconds = Math.max(0, progress.fogClearRemaining ?? 0);
  state.handTorchSeconds = Math.max(0, progress.handTorchRemaining ?? 0);
  state.slowCurseSeconds = Math.max(0, progress.slowCurseRemaining ?? 0);
  state.frenzyCurseSeconds = Math.max(0, progress.frenzyCurseRemaining ?? 0);
  state.gloomCurseSeconds = Math.max(0, progress.gloomCurseRemaining ?? 0);
  state.swarmCurseActive = progress.swarmCurseActive === true;
  state.mirrorCurseSeconds = Math.max(0, progress.mirrorCurseRemaining ?? 0);
  state.spinCurseSeconds = Math.max(0, progress.spinCurseRemaining ?? 0);
  const cullRemaining = Math.max(0, progress.cullBrandRemaining ?? 0);
  restoreCullBrand(state.cullBrand, cullRemaining, cullRemaining > 0 ? 1 : 0);
  state.phoenixCharges = clampPhoenixCharges(progress.phoenixCharges ?? 0);
}

/**
 * Activate a power/curse pickup on the bag.
 * Returns true when the kind was handled (including map / swarm).
 * Control curses clear the sibling control window.
 */
export function applyPickupToRunPowers(state: RunPowerRuntimeState, kind: string): boolean {
  switch (kind) {
    case "time-freeze":
      state.timeFreezeSeconds = activateTimeFreeze();
      return true;
    case "annihilation-pulse":
      activateAnnihilationPulse(state.annihilationPulse);
      return true;
    case "cull-brand":
      activateCullBrand(state.cullBrand);
      return true;
    case "phoenix-egg":
      state.phoenixCharges = armPhoenixCharge(state.phoenixCharges);
      return true;
    case "luminous-ward":
      state.luminousWardSeconds = activateLuminousWard();
      return true;
    case "map":
      state.mapRevealed = true;
      return true;
    case "mobility":
      state.mobilityBoostSeconds = activateMobilityBoost(state.mobilityBoostSeconds);
      return true;
    case "clarity":
      state.fogClearSeconds = activateFogClear(state.fogClearSeconds);
      return true;
    case "swarm-curse":
      state.swarmCurseActive = activateSwarmCurse(state.swarmCurseActive);
      return true;
    case "slow-curse":
      state.slowCurseSeconds = activateSlowCurse(state.slowCurseSeconds);
      return true;
    case "frenzy-curse":
      state.frenzyCurseSeconds = activateFrenzyCurse(state.frenzyCurseSeconds);
      return true;
    case "gloom-curse":
      state.gloomCurseSeconds = activateGloomCurse(state.gloomCurseSeconds);
      return true;
    case "mirror-curse":
      state.spinCurseSeconds = 0;
      state.mirrorCurseSeconds = activateMirrorCurse(state.mirrorCurseSeconds);
      return true;
    case "spin-curse":
      state.mirrorCurseSeconds = 0;
      state.spinCurseSeconds = activateSpinCurse(state.spinCurseSeconds);
      return true;
    default:
      return false;
  }
}

export function isTimeFreezeOn(state: RunPowerRuntimeState): boolean {
  return isTimeFreezeActive(state.timeFreezeSeconds);
}

export function isLuminousWardOn(state: RunPowerRuntimeState): boolean {
  return isLuminousWardActive(state.luminousWardSeconds);
}

export function isAnnihilationPulseOn(state: RunPowerRuntimeState): boolean {
  return isAnnihilationPulseActive(state.annihilationPulse);
}

export function isMobilityBoostOn(state: RunPowerRuntimeState): boolean {
  return isMobilityBoostActive(state.mobilityBoostSeconds);
}

export function isFogClearOn(state: RunPowerRuntimeState): boolean {
  return isFogClearActive(state.fogClearSeconds);
}

export function isHandTorchOn(state: RunPowerRuntimeState): boolean {
  return isHandTorchActive(state.handTorchSeconds);
}

/** Refresh a full 15s hand-torch window from a wall sconce grab. */
export function equipHandTorchFromWall(state: RunPowerRuntimeState): void {
  state.handTorchSeconds = activateHandTorch();
}

export function isSlowCurseOn(state: RunPowerRuntimeState): boolean {
  return isSlowCurseActive(state.slowCurseSeconds);
}

export function isFrenzyCurseOn(state: RunPowerRuntimeState): boolean {
  return isFrenzyCurseActive(state.frenzyCurseSeconds);
}

export function isGloomCurseOn(state: RunPowerRuntimeState): boolean {
  return isGloomCurseActive(state.gloomCurseSeconds);
}

export function isMirrorCurseOn(state: RunPowerRuntimeState): boolean {
  return isMirrorCurseActive(state.mirrorCurseSeconds);
}

export function isSpinCurseOn(state: RunPowerRuntimeState): boolean {
  return isSpinCurseActive(state.spinCurseSeconds);
}

export function isSwarmCurseOn(state: RunPowerRuntimeState): boolean {
  return isSwarmCurseActive(state.swarmCurseActive);
}

export function isCullBrandOn(state: RunPowerRuntimeState): boolean {
  return isCullBrandActive(state.cullBrand);
}

export function hasPhoenixOn(state: RunPowerRuntimeState): boolean {
  return hasPhoenixCharge(state.phoenixCharges);
}
