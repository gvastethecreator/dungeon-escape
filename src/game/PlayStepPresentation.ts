/**
 * Maps a Play step to presentation events. PlayRuntime still owns step order.
 * The host applies audio, HUD trauma, and banners without putting that chain
 * inside the renderer loop body.
 */

import { projectPlayStepDamage } from "../systems/PlayStepEffects";
import type { DamageWashKind } from "../systems/HazardFeel";

export interface PlayStepPresentationPickup {
  readonly kind: string | null;
  readonly position: { readonly x: number; readonly y: number; readonly z: number } | null;
}

export interface PlayStepPresentationUpdate {
  readonly collectedPickup: PlayStepPresentationPickup | null;
  readonly annihilationPulse: {
    readonly position: { readonly x: number; readonly y: number; readonly z: number };
    readonly hits: number;
  } | null;
  readonly cullBrandKill: {
    readonly position: { readonly x: number; readonly y: number; readonly z: number };
  } | null;
  readonly shotgunFire: {
    readonly position: { readonly x: number; readonly y: number; readonly z: number };
    readonly hits: number;
    readonly pump: boolean;
  } | null;
  readonly shotgunDryFire: {
    readonly position: { readonly x: number; readonly y: number; readonly z: number };
  } | null;
  readonly doorSound: {
    readonly kind: "open" | "close";
    readonly position: { readonly x: number; readonly y: number; readonly z: number };
  } | null;
  readonly chestSound: {
    readonly position: { readonly x: number; readonly y: number; readonly z: number };
  } | null;
  readonly damage: number;
  readonly surfaceEffect: {
    readonly kind: "fire" | "ice" | "toxin" | "spikes" | null;
    readonly damage: number;
  };
  readonly damageSource: {
    readonly position: { readonly x: number; readonly y: number; readonly z: number };
    readonly voice: unknown;
  } | null;
  readonly knockback: { readonly x: number; readonly z: number } | null;
}

export interface PlayStepPresentationEffects {
  readonly status?: string;
  readonly playPickup?: boolean;
  readonly pickup?: { readonly label: string } | null;
  readonly questPortalOpen?: boolean;
  readonly phoenixRevive?: boolean;
  readonly phoenixCharges?: number;
  readonly playEnemyHit?: boolean;
  readonly flash?: "event" | "damage";
}

export type PlayStepPresentationEvent =
  | { readonly kind: "status"; readonly text: string }
  | {
      readonly kind: "pickup";
      readonly pickup: PlayStepPresentationPickup;
      readonly label: string;
      readonly portal: boolean;
    }
  | {
      readonly kind: "annihilation-pulse";
      readonly position: { readonly x: number; readonly y: number; readonly z: number };
      readonly hits: number;
    }
  | {
      readonly kind: "cull-brand";
      readonly position: { readonly x: number; readonly y: number; readonly z: number };
    }
  | {
      readonly kind: "shotgun-fire";
      readonly position: { readonly x: number; readonly y: number; readonly z: number };
      readonly hits: number;
      readonly pump: boolean;
    }
  | {
      readonly kind: "shotgun-dry";
      readonly position: { readonly x: number; readonly y: number; readonly z: number };
    }
  | { readonly kind: "phoenix-revive" }
  | { readonly kind: "phoenix-charges"; readonly charges: number }
  | {
      readonly kind: "enemy-hit";
      readonly knockback: { readonly x: number; readonly z: number } | null;
      readonly enemyDamage: number;
      readonly surface: PlayStepPresentationUpdate["surfaceEffect"];
      readonly hasAttacker: boolean;
      readonly attacker: PlayStepPresentationUpdate["damageSource"];
    }
  | {
      readonly kind: "door";
      readonly sound: NonNullable<PlayStepPresentationUpdate["doorSound"]>;
    }
  | {
      readonly kind: "chest";
      readonly position: { readonly x: number; readonly y: number; readonly z: number };
    }
  | { readonly kind: "flash"; readonly flash: "event" | "damage" };

export function collectPlayStepPresentation(
  worldUpdate: PlayStepPresentationUpdate,
  effects: PlayStepPresentationEffects,
): PlayStepPresentationEvent[] {
  const events: PlayStepPresentationEvent[] = [];
  if (effects.status) events.push({ kind: "status", text: effects.status });
  if (effects.playPickup && effects.pickup && worldUpdate.collectedPickup) {
    events.push({
      kind: "pickup",
      pickup: worldUpdate.collectedPickup,
      label: effects.pickup.label,
      portal: Boolean(effects.questPortalOpen),
    });
  }
  if (worldUpdate.annihilationPulse) {
    events.push({
      kind: "annihilation-pulse",
      position: worldUpdate.annihilationPulse.position,
      hits: worldUpdate.annihilationPulse.hits,
    });
  }
  if (worldUpdate.cullBrandKill) {
    events.push({
      kind: "cull-brand",
      position: worldUpdate.cullBrandKill.position,
    });
  }
  if (worldUpdate.shotgunFire) {
    events.push({
      kind: "shotgun-fire",
      position: worldUpdate.shotgunFire.position,
      hits: worldUpdate.shotgunFire.hits,
      pump: worldUpdate.shotgunFire.pump,
    });
  }
  if (worldUpdate.shotgunDryFire) {
    events.push({
      kind: "shotgun-dry",
      position: worldUpdate.shotgunDryFire.position,
    });
  }
  if (effects.phoenixRevive) events.push({ kind: "phoenix-revive" });
  else if (effects.phoenixCharges !== undefined) {
    events.push({ kind: "phoenix-charges", charges: effects.phoenixCharges });
  }
  if (effects.playEnemyHit) {
    events.push({
      kind: "enemy-hit",
      knockback: worldUpdate.knockback,
      enemyDamage: Math.max(0, worldUpdate.damage - worldUpdate.surfaceEffect.damage),
      surface: worldUpdate.surfaceEffect,
      hasAttacker: Boolean(worldUpdate.damageSource),
      attacker: worldUpdate.damageSource,
    });
  }
  if (worldUpdate.doorSound) events.push({ kind: "door", sound: worldUpdate.doorSound });
  if (worldUpdate.chestSound) {
    events.push({ kind: "chest", position: worldUpdate.chestSound.position });
  }
  if (effects.flash) events.push({ kind: "flash", flash: effects.flash });
  return events;
}

export interface PlayStepPresentationHost {
  setStatus(text: string): void;
  playPickup(pickup: PlayStepPresentationPickup): void;
  playPortal(): void;
  showPickupFeedback(label: string, pickup: { readonly label: string }): void;
  playAnnihilationPulse(position: { x: number; y: number; z: number }): void;
  playCullBrandKill(position: { x: number; y: number; z: number }): void;
  playShotgunFire(position: { x: number; y: number; z: number }, pump: boolean): void;
  playShotgunDry(position: { x: number; y: number; z: number }): void;
  kickShotgun(): void;
  applyPhoenixRevive(): void;
  setPhoenixCharges(charges: number): void;
  syncPhoenixHud(charges: number): void;
  playPhoenixRevive(): void;
  showPhoenixBanner(): void;
  addHitTrauma(amount: number): void;
  flash(kind?: "event" | "damage"): void;
  playDoor(kind: "open" | "close", position: { x: number; y: number; z: number }): void;
  playChest(position: { x: number; y: number; z: number }): void;
  playEnemyHit(
    position: { x: number; y: number; z: number },
    voice: unknown,
  ): void;
  playHazardDamage(): void;
  triggerDamageFeedback(knockback: { x: number; z: number } | null, washKind: DamageWashKind): void;
  updateResolve(): void;
}

export function applyPlayStepPresentation(
  events: readonly PlayStepPresentationEvent[],
  host: PlayStepPresentationHost,
  pickupFeedback: { readonly label: string } | null,
): void {
  for (const event of events) {
    switch (event.kind) {
      case "status":
        host.setStatus(event.text);
        break;
      case "pickup":
        host.playPickup(event.pickup);
        if (event.portal) host.playPortal();
        if (pickupFeedback) host.showPickupFeedback(event.label, pickupFeedback);
        break;
      case "annihilation-pulse":
        host.playAnnihilationPulse(event.position);
        if (event.hits > 0) {
          host.addHitTrauma(Math.min(0.72, 0.18 + event.hits * 0.03));
          host.flash("event");
        }
        break;
      case "cull-brand":
        host.playCullBrandKill(event.position);
        host.addHitTrauma(0.42);
        host.flash("event");
        break;
      case "shotgun-fire":
        host.kickShotgun();
        host.playShotgunFire(event.position, event.pump);
        if (event.hits > 0) {
          host.addHitTrauma(Math.min(0.62, 0.16 + event.hits * 0.04));
          host.flash("event");
        }
        break;
      case "shotgun-dry":
        host.playShotgunDry(event.position);
        break;
      case "phoenix-revive":
        host.applyPhoenixRevive();
        host.setPhoenixCharges(0);
        host.syncPhoenixHud(0);
        host.playPhoenixRevive();
        host.addHitTrauma(0.55);
        host.flash("event");
        host.showPhoenixBanner();
        host.updateResolve();
        break;
      case "phoenix-charges":
        host.setPhoenixCharges(event.charges);
        host.syncPhoenixHud(event.charges);
        break;
      case "enemy-hit": {
        const damageIntent = projectPlayStepDamage({
          enemyDamage: event.enemyDamage,
          surface: event.surface,
          hasAttacker: event.hasAttacker,
        });
        host.triggerDamageFeedback(event.knockback, damageIntent.washKind);
        if (damageIntent.useAttackerAudio && event.attacker) {
          host.playEnemyHit(event.attacker.position, event.attacker.voice);
        } else {
          host.playHazardDamage();
        }
        break;
      }
      case "door":
        host.playDoor(event.sound.kind, event.sound.position);
        break;
      case "chest":
        host.playChest(event.position);
        break;
      case "flash":
        host.flash(event.flash);
        break;
    }
  }
}
