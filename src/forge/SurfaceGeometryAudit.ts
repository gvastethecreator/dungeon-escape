import { BufferAttribute, type BufferGeometry } from "three";

export interface ForgeSurfaceAuditResult {
  name: string;
  vertexCount: number;
  repairedNormals: boolean;
  repairedUvs: boolean;
}

function normalizedAxis(value: number, min: number, span: number): number {
  return span > 1e-5 ? (value - min) / span : 0.5;
}

/**
 * Keeps every opaque Forge mesh ready for lit, mapped materials. Procedural
 * triangle meshes can miss attributes that Three's stock geometries include;
 * repair those gaps once, before any instanced meshes share the geometry.
 */
export function auditAndRepairForgeSurface(
  name: string,
  geometry: BufferGeometry,
): ForgeSurfaceAuditResult {
  const position = geometry.getAttribute("position");
  if (!position || position.count < 3) {
    throw new Error(`Forge geometry "${name}" has no renderable surface.`);
  }

  let repairedNormals = false;
  if (!geometry.getAttribute("normal")) {
    geometry.computeVertexNormals();
    repairedNormals = true;
  }

  let repairedUvs = false;
  if (!geometry.getAttribute("uv")) {
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    if (!bounds) throw new Error(`Forge geometry "${name}" has no bounds.`);

    const spans = [
      { axis: "x" as const, size: bounds.max.x - bounds.min.x },
      { axis: "y" as const, size: bounds.max.y - bounds.min.y },
      { axis: "z" as const, size: bounds.max.z - bounds.min.z },
    ].sort((a, b) => b.size - a.size);
    const [uAxis, vAxis] = spans;
    const uv = new Float32Array(position.count * 2);

    for (let index = 0; index < position.count; index += 1) {
      const values = {
        x: position.getX(index),
        y: position.getY(index),
        z: position.getZ(index),
      };
      uv[index * 2] = normalizedAxis(values[uAxis.axis], bounds.min[uAxis.axis], uAxis.size);
      uv[index * 2 + 1] = normalizedAxis(values[vAxis.axis], bounds.min[vAxis.axis], vAxis.size);
    }

    geometry.setAttribute("uv", new BufferAttribute(uv, 2));
    repairedUvs = true;
  }

  return {
    name,
    vertexCount: position.count,
    repairedNormals,
    repairedUvs,
  };
}
