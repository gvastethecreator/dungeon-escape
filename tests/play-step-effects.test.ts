import { describe, expect, test } from "bun:test";
import { projectPlayStepDamage } from "../src/systems/PlayStepEffects";

describe("PlayStepEffects", () => {
  test("enemy-only hits use attacker audio and enemy wash", () => {
    const intent = projectPlayStepDamage({
      enemyDamage: 9,
      surface: { kind: null, damage: 0 },
      hasAttacker: true,
    });
    expect(intent.playEnemyHit).toBe(true);
    expect(intent.useAttackerAudio).toBe(true);
    expect(intent.washKind).toBe("enemy");
    expect(intent.totalDamage).toBe(9);
  });

  test("hazard surface wash wins when surface damages", () => {
    const intent = projectPlayStepDamage({
      enemyDamage: 0,
      surface: { kind: "fire", damage: 5 },
      hasAttacker: false,
    });
    expect(intent.playEnemyHit).toBe(true);
    expect(intent.useAttackerAudio).toBe(false);
    expect(intent.washKind).toBe("fire");
  });
});
