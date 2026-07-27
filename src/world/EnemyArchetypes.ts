import type { EnemyRosterKind } from "./EnemySpriteAtlas";

export type EnemyKind = EnemyRosterKind;
export type EnemyBehavior =
  | "pursue"
  | "stalk"
  | "guard"
  | "orbit"
  | "skitter"
  | "dash_halt"
  | "phase"
  | "erratic";
export type EnemySilhouette = "humanoid" | "creature" | "spectral";

export interface EnemyArchetype {
  /** Intended visible body width in world meters, after transparent atlas padding. */
  width: number;
  /** Intended visible body height in world meters, after transparent atlas padding. */
  height: number;
  speed: number;
  detectionRange: number;
  preferredRange: number;
  attackRange: number;
  damage: number;
  attackCooldown: number;
  behavior: EnemyBehavior;
  silhouette: EnemySilhouette;
  lowProfile: boolean;
  hoverOffset: number;
}

/**
 * Visual scale and combat intent for the front-facing v5 roster.
 * Humanoids, creatures, and spectral threats stay separate in the runtime too.
 */
export const ENEMY_ARCHETYPES: Readonly<Record<EnemyKind, EnemyArchetype>> = {
  carrion: {
    width: 1.38,
    height: 0.95,
    speed: 1.55,
    detectionRange: 15,
    preferredRange: 0.78,
    attackRange: 1.04,
    damage: 9,
    attackCooldown: 0.82,
    behavior: "skitter",
    silhouette: "creature",
    lowProfile: true,
    hoverOffset: 0,
  },
  goblin: {
    width: 0.88,
    height: 1.55,
    speed: 1.95,
    detectionRange: 17,
    preferredRange: 0.88,
    attackRange: 1.12,
    damage: 8,
    attackCooldown: 0.72,
    behavior: "dash_halt",
    silhouette: "humanoid",
    lowProfile: false,
    hoverOffset: 0,
  },
  ghost: {
    width: 0.9,
    height: 1.95,
    speed: 0.92,
    detectionRange: 20,
    preferredRange: 1.5,
    attackRange: 1.4,
    damage: 10,
    attackCooldown: 1.15,
    behavior: "phase",
    silhouette: "spectral",
    lowProfile: false,
    hoverOffset: 0.22,
  },
  ratling: {
    width: 0.95,
    height: 1.2,
    speed: 1.78,
    detectionRange: 15,
    preferredRange: 0.7,
    attackRange: 1.02,
    damage: 7,
    attackCooldown: 0.68,
    behavior: "skitter",
    silhouette: "creature",
    lowProfile: true,
    hoverOffset: 0,
  },
  husk: {
    width: 0.78,
    height: 1.95,
    speed: 0.72,
    detectionRange: 14,
    preferredRange: 1.1,
    attackRange: 1.32,
    damage: 16,
    attackCooldown: 1.4,
    behavior: "pursue",
    silhouette: "humanoid",
    lowProfile: false,
    hoverOffset: 0,
  },
  imp: {
    width: 0.9,
    height: 1.05,
    speed: 1.58,
    detectionRange: 18,
    preferredRange: 2.35,
    attackRange: 1.06,
    damage: 9,
    attackCooldown: 0.88,
    behavior: "orbit",
    silhouette: "humanoid",
    lowProfile: false,
    hoverOffset: 0.26,
  },
  "zombie-orc": {
    width: 1.35,
    height: 2.2,
    speed: 0.76,
    detectionRange: 16,
    preferredRange: 1.2,
    attackRange: 1.46,
    damage: 19,
    attackCooldown: 1.48,
    behavior: "pursue",
    silhouette: "humanoid",
    lowProfile: false,
    hoverOffset: 0,
  },
  spider: {
    width: 1.55,
    height: 0.75,
    speed: 1.68,
    detectionRange: 16,
    preferredRange: 0.72,
    attackRange: 1.06,
    damage: 8,
    attackCooldown: 0.7,
    behavior: "skitter",
    silhouette: "creature",
    lowProfile: true,
    hoverOffset: 0,
  },
  "bone-slime": {
    width: 1.25,
    height: 1,
    speed: 0.82,
    detectionRange: 15,
    preferredRange: 1.02,
    attackRange: 1.25,
    damage: 13,
    attackCooldown: 1.14,
    behavior: "guard",
    silhouette: "creature",
    lowProfile: true,
    hoverOffset: 0,
  },
  "white-eyed-shadow": {
    width: 0.82,
    height: 1.95,
    speed: 1.18,
    detectionRange: 20,
    preferredRange: 1.72,
    attackRange: 1.3,
    damage: 12,
    attackCooldown: 0.95,
    behavior: "erratic",
    silhouette: "humanoid",
    lowProfile: false,
    hoverOffset: 0,
  },
  "carrion-stalker": {
    width: 1.48,
    height: 1.08,
    speed: 1.74,
    detectionRange: 16,
    preferredRange: 0.7,
    attackRange: 1.08,
    damage: 11,
    attackCooldown: 0.78,
    behavior: "skitter",
    silhouette: "creature",
    lowProfile: true,
    hoverOffset: 0,
  },
};

export interface EnemySpriteMetrics {
  frameSize: number;
  opaqueWidth: number;
  opaqueHeight: number;
  topPadding: number;
  bottomPadding: number;
}

/** Union alpha bounds measured across the four 320 px frames in each v5 atlas row. */
export const ENEMY_SPRITE_METRICS: Readonly<Record<EnemyKind, EnemySpriteMetrics>> = {
  carrion: {
    frameSize: 320,
    opaqueWidth: 288,
    opaqueHeight: 276,
    topPadding: 28,
    bottomPadding: 16,
  },
  goblin: {
    frameSize: 320,
    opaqueWidth: 184,
    opaqueHeight: 288,
    topPadding: 16,
    bottomPadding: 16,
  },
  ghost: { frameSize: 320, opaqueWidth: 147, opaqueHeight: 288, topPadding: 16, bottomPadding: 16 },
  ratling: {
    frameSize: 320,
    opaqueWidth: 288,
    opaqueHeight: 288,
    topPadding: 16,
    bottomPadding: 16,
  },
  husk: { frameSize: 320, opaqueWidth: 135, opaqueHeight: 288, topPadding: 16, bottomPadding: 16 },
  imp: { frameSize: 320, opaqueWidth: 256, opaqueHeight: 256, topPadding: 32, bottomPadding: 32 },
  "zombie-orc": {
    frameSize: 320,
    opaqueWidth: 246,
    opaqueHeight: 288,
    topPadding: 16,
    bottomPadding: 16,
  },
  spider: {
    frameSize: 320,
    opaqueWidth: 288,
    opaqueHeight: 181,
    topPadding: 123,
    bottomPadding: 16,
  },
  "bone-slime": {
    frameSize: 320,
    opaqueWidth: 288,
    opaqueHeight: 288,
    topPadding: 16,
    bottomPadding: 16,
  },
  "white-eyed-shadow": {
    frameSize: 320,
    opaqueWidth: 127,
    opaqueHeight: 288,
    topPadding: 16,
    bottomPadding: 16,
  },
  "carrion-stalker": {
    frameSize: 320,
    opaqueWidth: 288,
    opaqueHeight: 288,
    topPadding: 16,
    bottomPadding: 16,
  },
};

export interface EnemySpriteRenderMetrics {
  planeWidth: number;
  planeHeight: number;
  bottomPaddingRatio: number;
  topPaddingRatio: number;
}

export function getEnemySpriteRenderMetrics(kind: EnemyKind): EnemySpriteRenderMetrics {
  const sprite = ENEMY_SPRITE_METRICS[kind];
  const body = ENEMY_ARCHETYPES[kind];
  return {
    planeWidth: body.width / (sprite.opaqueWidth / sprite.frameSize),
    planeHeight: body.height / (sprite.opaqueHeight / sprite.frameSize),
    bottomPaddingRatio: sprite.bottomPadding / sprite.frameSize,
    topPaddingRatio: sprite.topPadding / sprite.frameSize,
  };
}

export interface EnemyMotion {
  forward: number;
  strafe: number;
  speedMultiplier: number;
}

export function isHumanoidEnemy(kind: EnemyKind): boolean {
  return ENEMY_ARCHETYPES[kind].silhouette === "humanoid";
}

export function isLowProfileEnemy(kind: EnemyKind): boolean {
  return ENEMY_ARCHETYPES[kind].lowProfile;
}

export function isHoverEnemy(kind: EnemyKind): boolean {
  return ENEMY_ARCHETYPES[kind].hoverOffset > 0;
}

export function getEnemyMotion(
  kind: EnemyKind,
  distance: number,
  elapsed: number,
  phase: number,
): EnemyMotion {
  const archetype = ENEMY_ARCHETYPES[kind];
  if (distance > archetype.detectionRange) return { forward: 0, strafe: 0, speedMultiplier: 0 };
  const close = distance < archetype.preferredRange;

  if (archetype.behavior === "stalk") {
    return {
      forward: close ? -0.42 : distance > archetype.preferredRange + 0.8 ? 0.58 : 0,
      strafe: Math.sin(elapsed * 0.72 + phase) * 0.78,
      speedMultiplier: 1,
    };
  }
  if (archetype.behavior === "erratic") {
    const pulse = Math.sin(elapsed * 3.7 + phase) + Math.sin(elapsed * 7.1 + phase * 1.9) * 0.58;
    const surge = pulse > 0.55;
    const lateral =
      Math.sin(elapsed * 5.4 + phase) * 0.55 + Math.sin(elapsed * 2.1 + phase * 2.7) * 0.28;
    return {
      forward: close
        ? -0.36
        : distance > archetype.preferredRange + 0.65
          ? surge
            ? 1.18
            : 0.18
          : surge
            ? 0.38
            : 0,
      strafe: lateral * (surge ? 0.74 : 0.31),
      speedMultiplier: surge ? 1.32 : 0.46,
    };
  }
  if (archetype.behavior === "orbit") {
    return {
      forward: close ? -0.62 : distance > archetype.preferredRange + 1.1 ? 0.45 : 0,
      strafe: Math.sin(elapsed * 0.48 + phase) >= 0 ? 0.72 : -0.72,
      speedMultiplier: 1,
    };
  }
  if (archetype.behavior === "guard") {
    const closeBand = archetype.detectionRange * 0.55;
    return {
      forward: distance > archetype.preferredRange ? 0.85 : 0,
      strafe: 0,
      speedMultiplier: distance < closeBand ? 1 : 0.55,
    };
  }
  if (archetype.behavior === "skitter") {
    const lunge = Math.sin(elapsed * 3.8 + phase) > 0.62 ? 1.65 : 0.72;
    return {
      forward: distance > archetype.preferredRange ? 1 : 0,
      strafe: Math.sin(elapsed * 5.4 + phase) * 0.22,
      speedMultiplier: lunge,
    };
  }
  if (archetype.behavior === "dash_halt") {
    const cycle = Math.sin(elapsed * 2.35 + phase);
    const dashing = cycle > 0.12;
    const halt = cycle < -0.55;
    if (halt) return { forward: 0, strafe: 0, speedMultiplier: 0 };
    if (!dashing) {
      return {
        forward: distance > archetype.preferredRange ? 0.2 : 0,
        strafe: Math.sin(elapsed * 1.1 + phase) * 0.35,
        speedMultiplier: 0.15,
      };
    }
    return {
      forward: distance > archetype.preferredRange * 0.85 ? 1 : close ? -0.15 : 0.4,
      strafe: Math.sin(elapsed * 6.2 + phase) * 0.28,
      speedMultiplier: 1.85,
    };
  }
  if (archetype.behavior === "phase") {
    const hang = Math.sin(elapsed * 0.72 + phase) < -0.72;
    if (hang) {
      return {
        forward: distance > archetype.preferredRange + 2 ? 0.35 : 0,
        strafe: Math.sin(elapsed * 0.9 + phase) * 0.28,
        speedMultiplier: 0.28,
      };
    }
    const drift =
      Math.sin(elapsed * 0.38 + phase) * 0.92 + Math.sin(elapsed * 1.7 + phase * 2.1) * 0.28;
    return {
      forward: close ? -0.18 : distance > archetype.preferredRange + 0.5 ? 1 : 0.35,
      strafe: drift,
      speedMultiplier: 1.05 + Math.abs(Math.sin(elapsed * 1.2 + phase)) * 0.4,
    };
  }

  return { forward: distance > archetype.preferredRange ? 1 : 0, strafe: 0, speedMultiplier: 1 };
}

export function enemyGroundY(kind: EnemyKind): number {
  const archetype = ENEMY_ARCHETYPES[kind];
  const sprite = getEnemySpriteRenderMetrics(kind);
  return (
    sprite.planeHeight / 2 -
    sprite.bottomPaddingRatio * sprite.planeHeight +
    0.02 +
    archetype.hoverOffset
  );
}

export function enemyCeilingY(kind: EnemyKind, wallHeight: number, clearance = 0.38): number {
  const sprite = getEnemySpriteRenderMetrics(kind);
  return (
    wallHeight - clearance - sprite.planeHeight / 2 + sprite.topPaddingRatio * sprite.planeHeight
  );
}
