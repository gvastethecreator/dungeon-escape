export interface ForgeRoomPresentationInput {
  cx?: unknown;
  cy?: unknown;
  sx0?: unknown;
  sy0?: unknown;
  w?: unknown;
  h?: unknown;
}

export interface ForgeRoomPresentationRect {
  cx: number;
  cy: number;
  sx0: number;
  sy0: number;
  w: number;
  h: number;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function positiveExtent(value: unknown): number {
  const extent = Math.abs(finiteNumber(value, 1));
  return extent > 0 ? extent : 1;
}

/**
 * Normalize host-owned room geometry before Forge writes it into a Three.js
 * position buffer. Older presentation payloads did not include sx0/sy0, so
 * their safe animation origin is the final room center.
 */
export function resolveForgeRoomPresentationRect(
  room: ForgeRoomPresentationInput,
): ForgeRoomPresentationRect {
  const cx = finiteNumber(room.cx, 0);
  const cy = finiteNumber(room.cy, 0);
  return {
    cx,
    cy,
    sx0: finiteNumber(room.sx0, cx),
    sy0: finiteNumber(room.sy0, cy),
    w: positiveExtent(room.w),
    h: positiveExtent(room.h),
  };
}
