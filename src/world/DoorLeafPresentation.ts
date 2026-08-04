/**
 * Door leaf damp and passable flags after DoorOpenPolicy decides target open.
 */

import * as THREE from "three";

import { isDoorClosed, isDoorPassable } from "./DoorOpenPolicy";
import type { StaticDoorActor } from "./StaticDungeonScene";

export const DOOR_OPEN_DAMP = 9;
export const DOOR_CLOSE_DAMP = 3.2;

/** Damp openness toward target and write leaf rotations + collision userData. */
export function updateDoorLeafPresentation(door: StaticDoorActor, delta: number): void {
  const target = door.targetOpen ? 1 : 0;
  door.openness = THREE.MathUtils.damp(
    door.openness,
    target,
    target > door.openness ? DOOR_OPEN_DAMP : DOOR_CLOSE_DAMP,
    delta,
  );
  door.left.rotation.y = (door.left.userData.openRotation as number) * door.openness;
  door.right.rotation.y = (door.right.userData.openRotation as number) * door.openness;
  door.root.userData.passable = isDoorPassable(door.openness);
  door.root.userData.closed = isDoorClosed(door.openness);
}
