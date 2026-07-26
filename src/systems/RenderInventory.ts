import * as THREE from "three";

export interface RenderInventory {
  totalCalls: number;
  buckets: Record<string, number>;
}

function renderBucket(name: string): string {
  const value = name.toLowerCase();
  if (value.startsWith("forge ")) return `forge:${value.split(" batch", 1)[0]!.slice(6)}`;
  if (value.startsWith("classic ")) return `classic:${value.split(" batch", 1)[0]!.slice(8)}`;
  if (value.startsWith("atmosphere ")) return "atmosphere-dressing";
  if (value.includes("room floor")) return "architecture-floor";
  if (value.includes("room ceiling")) return "architecture-ceiling";
  if (value.includes("masonry") || value.includes("wall core")) return "architecture-wall";
  if (value.includes("torch") || value.includes("lantern")) return "wall-fire";
  if (value.includes("campfire")) return "floor-fire";
  if (value.includes("brazier")) return "brazier-fire";
  if (value.includes("enemy")) return "enemies";
  if (value.includes("cobweb")) return "cobwebs";
  if (value.includes("potion") || value.includes("flask")) return "potion-chests";
  if (value.includes("stone") || value.includes("beacon")) return "magic-stones";
  if (value.includes("portal") || value.includes("entrance ring")) return "markers";
  if (value.includes("liquid") || value.includes("water")) return "liquids";
  if (value.includes("door") || value.includes("arch")) return "doors-arches";
  return value || "unnamed";
}

/** Optional, query-gated render audit used to target real draw-call hot spots. */
export function collectVisibleRenderInventory(
  root: THREE.Object3D,
  camera: THREE.Camera,
): RenderInventory {
  root.updateWorldMatrix(true, true);
  camera.updateWorldMatrix(true, false);
  const projection = new THREE.Matrix4().multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse,
  );
  const frustum = new THREE.Frustum().setFromProjectionMatrix(projection);
  const buckets = new Map<string, number>();
  let totalCalls = 0;

  root.traverseVisible((object) => {
    const renderable = object as THREE.Mesh | THREE.Line | THREE.Points | THREE.Sprite;
    if (
      !(renderable instanceof THREE.Mesh) &&
      !(renderable instanceof THREE.Line) &&
      !(renderable instanceof THREE.Points) &&
      !(renderable instanceof THREE.Sprite)
    )
      return;
    if (!object.layers.test(camera.layers)) return;
    if (object.frustumCulled && !frustum.intersectsObject(object)) return;

    const material = renderable.material;
    const calls = Array.isArray(material)
      ? material.filter((entry) => entry.visible).length
      : material?.visible
        ? 1
        : 0;
    if (calls === 0) return;
    const bucket = renderBucket(object.name);
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + calls);
    totalCalls += calls;
  });

  return {
    totalCalls,
    buckets: Object.fromEntries([...buckets].sort((left, right) => right[1] - left[1])),
  };
}
