import type { Device, Furniture, FurnitureType, Result, Room, Scene } from "./types";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let detail: any = null;
    try {
      detail = await res.json();
    } catch {
      detail = null;
    }
    const msg = detail?.detail?.error || detail?.detail || `HTTP ${res.status}`;
    throw new Error(String(msg));
  }
  return res.json() as Promise<T>;
}

export const api = {
  rooms: () => req<Room[]>("/api/rooms"),
  devices: (roomId?: string) =>
    req<Device[]>("/api/devices" + (roomId ? `?room_id=${roomId}` : "")),
  furniture: (roomId?: string) =>
    req<Furniture[]>("/api/furniture" + (roomId ? `?room_id=${roomId}` : "")),
  furnitureTypes: () => req<FurnitureType[]>("/api/furniture-types"),
  scenes: () => req<Scene[]>("/api/scenes"),
  command: (deviceId: string, capability: string, value: unknown) =>
    req<Result>(`/api/devices/${deviceId}/commands`, {
      method: "POST",
      body: JSON.stringify({ capability, value }),
    }),
  trigger: (sceneId: string) =>
    req<{ sceneId: string; total: number; failed: number }>(`/api/scenes/${sceneId}/trigger`, {
      method: "POST",
    }),
  addFurniture: (body: Partial<Furniture> & { roomId: string; typeId: string }) =>
    req<Furniture>("/api/furniture", { method: "POST", body: JSON.stringify(body) }),
  moveFurniture: (id: string, x: number, y: number) =>
    req<Furniture>(`/api/furniture/${id}`, { method: "PATCH", body: JSON.stringify({ x, y }) }),
  deleteFurniture: (id: string) => req(`/api/furniture/${id}`, { method: "DELETE" }),
};
