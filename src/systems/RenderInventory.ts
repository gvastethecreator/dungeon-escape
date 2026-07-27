import * as THREE from "three";

export interface RenderInventory {
  totalCalls: number;
  buckets: Record<string, number>;
  mappedLitCalls: number;
  mappedWithoutUvCalls: number;
  mappedWithoutUvBuckets: Record<string, number>;
  degenerateUvCalls: number;
  degenerateUvBuckets: Record<string, number>;
  unreadyMappedCalls: number;
  unreadyMappedBuckets: Record<string, number>;
  untexturedLitCalls: number;
  untexturedLitBuckets: Record<string, number>;
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
  const mappedWithoutUvBuckets = new Map<string, number>();
  const degenerateUvBuckets = new Map<string, number>();
  const unreadyMappedBuckets = new Map<string, number>();
  const untexturedLitBuckets = new Map<string, number>();
  let totalCalls = 0;
  let mappedLitCalls = 0;
  let mappedWithoutUvCalls = 0;
  let degenerateUvCalls = 0;
  let unreadyMappedCalls = 0;
  let untexturedLitCalls = 0;

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
    const visibleMaterials = (Array.isArray(material) ? material : [material]).filter(
      (entry): entry is THREE.Material => Boolean(entry?.visible),
    );
    const calls = visibleMaterials.length;
    if (calls === 0) return;
    const bucket = renderBucket(object.name);
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + calls);
    for (const entry of visibleMaterials) {
      if (
        !(
          entry instanceof THREE.MeshStandardMaterial ||
          entry instanceof THREE.MeshPhysicalMaterial ||
          entry instanceof THREE.MeshLambertMaterial ||
          entry instanceof THREE.MeshPhongMaterial
        )
      )
        continue;
      if (entry.map) {
        mappedLitCalls += 1;
        const image = entry.map.image as
          | { width?: number; height?: number; videoWidth?: number; videoHeight?: number }
          | undefined;
        if (!image || !(image.width || image.videoWidth) || !(image.height || image.videoHeight)) {
          unreadyMappedCalls += 1;
          unreadyMappedBuckets.set(bucket, (unreadyMappedBuckets.get(bucket) ?? 0) + 1);
        }
        if (renderable instanceof THREE.Mesh) {
          const uv =
            renderable.geometry.getAttribute("uv") ?? renderable.geometry.getAttribute("uv1");
          if (!uv) {
            mappedWithoutUvCalls += 1;
            mappedWithoutUvBuckets.set(bucket, (mappedWithoutUvBuckets.get(bucket) ?? 0) + 1);
          } else {
            let minU = Number.POSITIVE_INFINITY;
            let maxU = Number.NEGATIVE_INFINITY;
            let minV = Number.POSITIVE_INFINITY;
            let maxV = Number.NEGATIVE_INFINITY;
            for (let index = 0; index < uv.count; index += 1) {
              minU = Math.min(minU, uv.getX(index));
              maxU = Math.max(maxU, uv.getX(index));
              minV = Math.min(minV, uv.getY(index));
              maxV = Math.max(maxV, uv.getY(index));
            }
            if (maxU - minU < 0.01 || maxV - minV < 0.01) {
              degenerateUvCalls += 1;
              degenerateUvBuckets.set(bucket, (degenerateUvBuckets.get(bucket) ?? 0) + 1);
            }
          }
        }
      } else {
        untexturedLitCalls += 1;
        untexturedLitBuckets.set(bucket, (untexturedLitBuckets.get(bucket) ?? 0) + 1);
      }
    }
    totalCalls += calls;
  });

  return {
    totalCalls,
    buckets: Object.fromEntries([...buckets].sort((left, right) => right[1] - left[1])),
    mappedLitCalls,
    mappedWithoutUvCalls,
    mappedWithoutUvBuckets: Object.fromEntries(
      [...mappedWithoutUvBuckets].sort((left, right) => right[1] - left[1]),
    ),
    degenerateUvCalls,
    degenerateUvBuckets: Object.fromEntries(
      [...degenerateUvBuckets].sort((left, right) => right[1] - left[1]),
    ),
    unreadyMappedCalls,
    unreadyMappedBuckets: Object.fromEntries(
      [...unreadyMappedBuckets].sort((left, right) => right[1] - left[1]),
    ),
    untexturedLitCalls,
    untexturedLitBuckets: Object.fromEntries(
      [...untexturedLitBuckets].sort((left, right) => right[1] - left[1]),
    ),
  };
}
