export type Room = { id: string; name: string; polygon: number[][] };

export type DeviceState = Record<string, any>;

export type Device = {
  id: string;
  roomId: string;
  name: string;
  type: string;
  capabilities: string[];
  driver: string;
  state: DeviceState;
  version: number;
  updatedAt: string;
};

export type Furniture = {
  id: string;
  roomId: string;
  typeId: string;
  name: string;
  x: number;
  y: number;
  rotation: number;
  deviceId: string | null;
};

export type FurnitureType = { id: string; name: string; w: number; h: number };

export type Scene = { id: string; name: string; enabled: boolean };

export type Result = {
  requestId: string;
  deviceId: string;
  ok: boolean;
  error: string | null;
  latencyMs: number;
  attempts: number;
  version?: number;
};

export type EventItem = { id: number; text: string; time: string; bad?: boolean };
