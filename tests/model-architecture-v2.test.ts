import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { createDungeonDoor } from "../src/world/DoorFactory";
import { createDungeonMaterials } from "../src/world/MaterialLibrary";

function modelMetrics(root: THREE.Object3D) {
  let meshes = 0;
  let triangles = 0;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    meshes += 1;
    const geometry = object.geometry;
    triangles += geometry.index
      ? geometry.index.count / 3
      : geometry.getAttribute("position").count / 3;
  });
  return { meshes, triangles };
}

function degenerateUvTriangleCount(geometry: THREE.BufferGeometry): number {
  const uv = geometry.getAttribute("uv") as THREE.BufferAttribute;
  const index = geometry.index;
  const triangleCount = index ? index.count / 3 : uv.count / 3;
  let degenerate = 0;
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const a = index ? index.getX(triangle * 3) : triangle * 3;
    const b = index ? index.getX(triangle * 3 + 1) : triangle * 3 + 1;
    const c = index ? index.getX(triangle * 3 + 2) : triangle * 3 + 2;
    const twiceArea = Math.abs(
      (uv.getX(b) - uv.getX(a)) * (uv.getY(c) - uv.getY(a)) -
        (uv.getY(b) - uv.getY(a)) * (uv.getX(c) - uv.getX(a)),
    );
    if (twiceArea <= 1e-8) degenerate += 1;
  }
  return degenerate;
}

describe("architecture model v2", () => {
  test("dungeon door keeps a simple closed volume, aligned UV halves and an action rig", () => {
    const door = createDungeonDoor(createDungeonMaterials(), 2.4, 4.4, {
      style: "dungeon",
    });
    const leftHinge = door.getObjectByName("Door leaf hinge")!;
    const leftLeaf = door.getObjectByName("Left closed iron-bound door leaf")!;
    const rightLeaf = door.getObjectByName("Right closed iron-bound door leaf")!;
    const leftHardware = door.getObjectByName("Left door iron straps")!;
    const frame = door.getObjectByName(
      "Joined stone door frame",
    ) as THREE.Mesh<THREE.BufferGeometry>;

    expect(door.userData.asset).toBe("dungeon-door");
    expect(door.userData.collider.type).toBe("box-frame");
    expect(leftHinge.userData.socket).toMatchObject({ type: "hinge", axis: [0, 1, 0] });
    expect(leftHinge.userData.collider.type).toBe("box");
    expect(leftLeaf.userData.component).toBe("oak-plank-leaf");
    expect(leftHardware.userData.repetitionSystem).toBe("hinges-and-pull-ring");
    expect(door.userData.transomSealed).toBe(true);
    expect(door.userData.frameShape).toBe("rectangular");
    expect(door.userData.rearClosed).toBe(true);
    expect(door.userData.centerSeam).toBeCloseTo(0.012, 4);
    expect(modelMetrics(frame).triangles).toBe(48);
    const frameUvs = frame.geometry.getAttribute("uv") as THREE.BufferAttribute;
    const frameVs = Array.from({ length: frameUvs.count }, (_, index) => frameUvs.getY(index));
    expect(Math.max(...frameVs) - Math.min(...frameVs)).toBeGreaterThan(3.5);

    door.updateMatrixWorld(true);
    const transomRay = new THREE.Raycaster(
      new THREE.Vector3(0, 2.45, 1),
      new THREE.Vector3(0, 0, -1),
    );
    expect(transomRay.intersectObject(door, true).length).toBeGreaterThan(0);
    const rearRay = new THREE.Raycaster(
      new THREE.Vector3(0.4, 1.2, -1),
      new THREE.Vector3(0, 0, 1),
    );
    expect(rearRay.intersectObject(door, true).length).toBeGreaterThan(0);

    const leafSize = new THREE.Box3().setFromObject(leftLeaf).getSize(new THREE.Vector3());
    expect(leafSize.y).toBeCloseTo(2.23, 2);
    expect(leafSize.z).toBeGreaterThanOrEqual(0.115);
    const leftBounds = new THREE.Box3().setFromObject(leftLeaf);
    const rightBounds = new THREE.Box3().setFromObject(rightLeaf);
    expect(rightBounds.min.x - leftBounds.max.x).toBeCloseTo(0.012, 4);

    const metrics = modelMetrics(door);
    expect(metrics.meshes).toBe(5);
    expect(metrics.triangles).toBeGreaterThan(350);
    expect(metrics.triangles).toBeLessThan(800);

    const leafMesh = leftLeaf as THREE.Mesh<THREE.BufferGeometry>;
    const uvs = leafMesh.geometry.getAttribute("uv") as THREE.BufferAttribute;
    const leftUs = Array.from({ length: uvs.count }, (_, index) => uvs.getX(index));
    expect(Math.min(...leftUs)).toBeCloseTo(0, 3);
    expect(Math.max(...leftUs)).toBeCloseTo(0.5, 3);

    const rightUvs = (rightLeaf as THREE.Mesh<THREE.BufferGeometry>).geometry.getAttribute(
      "uv",
    ) as THREE.BufferAttribute;
    const rightUs = Array.from({ length: rightUvs.count }, (_, index) => rightUvs.getX(index));
    expect(Math.min(...rightUs)).toBeCloseTo(0.5, 3);
    expect(Math.max(...rightUs)).toBeCloseTo(1, 3);
    expect(degenerateUvTriangleCount(leafMesh.geometry)).toBe(0);
    expect(
      degenerateUvTriangleCount((rightLeaf as THREE.Mesh<THREE.BufferGeometry>).geometry),
    ).toBe(0);
  });

  test("office door uses a square panel, push bars, kick plates and three hinge barrels", () => {
    const door = createDungeonDoor(createDungeonMaterials(), 2.4, 4.4, {
      style: "office",
      curvedArch: false,
    });
    const leaf = door.getObjectByName("Left closed iron-bound door leaf")!;
    const hardware = door.getObjectByName("Left office push bar")!;

    expect(door.userData.asset).toBe("office-door");
    expect(leaf.userData.component).toBe("painted-steel-panel");
    expect(hardware.userData.repetitionSystem).toBe("push-bar-brackets-and-hinges");

    const leafSize = new THREE.Box3().setFromObject(leaf).getSize(new THREE.Vector3());
    expect(leafSize.y).toBeCloseTo(2.23, 2);
    expect(modelMetrics(door).triangles).toBeLessThan(1_000);
  });
});
