/**
 * TSL / WebGPU flavour of the room surface materials (WGP-09).
 *
 * Node graph properties only survive `clone()` on node materials, so the
 * WebGPU path swaps the concrete class. Loaded lazily by TslMaterialModules.
 */
import type * as THREE from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";

import { registerTslBuilder } from "../systems/TslMaterialModules";
import { ROOM_SURFACE_NODE_MATERIAL_TSL_BUILDER_ID } from "./RoomSurfaceMaterials";

export function createRoomSurfaceNodeMaterial(
  params: THREE.MeshStandardMaterialParameters,
): THREE.MeshStandardMaterial {
  return new MeshStandardNodeMaterial(params) as unknown as THREE.MeshStandardMaterial;
}

registerTslBuilder(ROOM_SURFACE_NODE_MATERIAL_TSL_BUILDER_ID, createRoomSurfaceNodeMaterial);
