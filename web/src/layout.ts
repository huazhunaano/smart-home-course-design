import type { Device, Furniture, FurnitureType, Room } from "./types";

/** 房间多边形质心（cm） */
export function centroid(poly: number[][]): [number, number] {
  const n = poly.length || 1;
  return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n];
}

/** 房间多边形包围盒（cm） */
export function bbox(poly: number[][]) {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  return { x1: Math.min(...xs), x2: Math.max(...xs), y1: Math.min(...ys), y2: Math.max(...ys) };
}

/**
 * 计算每台设备在平面图上的坐标（cm）。
 * 绑定家具的设备取家具中心；其余按房间内序号做网格排布，并裁剪到房间包围盒内。
 */
export function devicePositions(
  rooms: Room[],
  devices: Device[],
  furniture: Furniture[],
  types: FurnitureType[]
): Map<string, [number, number]> {
  const typeMap = new Map(types.map((t) => [t.id, t]));
  const map = new Map<string, [number, number]>();
  const counts = new Map<string, number>();
  for (const d of devices) {
    const bound = furniture.find((f) => f.deviceId === d.id);
    if (bound) {
      const t = typeMap.get(bound.typeId);
      map.set(d.id, [bound.x + (t?.w ?? 60) / 2, bound.y + (t?.h ?? 60) / 2]);
      continue;
    }
    const room = rooms.find((r) => r.id === d.roomId);
    if (!room) continue;
    const i = counts.get(d.roomId) ?? 0;
    counts.set(d.roomId, i + 1);
    const [cx, cy] = centroid(room.polygon);
    const b = bbox(room.polygon);
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = Math.min(Math.max(cx - 52 + col * 52, b.x1 + 18), b.x2 - 18);
    const y = Math.min(Math.max(cy + 34 + row * 44, b.y1 + 24), b.y2 - 14);
    map.set(d.id, [x, y]);
  }
  return map;
}
