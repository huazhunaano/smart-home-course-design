import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { FloorPlan } from "./components/FloorPlan";
import { DevicePanel } from "./components/DevicePanel";
import type { Device, EventItem, Furniture, FurnitureType, Room, Scene } from "./types";
import { useRealtime } from "./useRealtime";

let eventSeq = 1;

export default function App() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [furniture, setFurniture] = useState<Furniture[]>([]);
  const [types, setTypes] = useState<FurnitureType[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [selectedRoom, setSelectedRoom] = useState("R2");
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [progress, setProgress] = useState("");
  const [loadError, setLoadError] = useState("");

  const pushEvent = useCallback((text: string, bad = false) => {
    setEvents((prev) =>
      [{ id: eventSeq++, text, time: new Date().toLocaleTimeString(), bad }, ...prev].slice(0, 8)
    );
  }, []);

  useEffect(() => {
    Promise.all([api.rooms(), api.devices(), api.furniture(), api.furnitureTypes(), api.scenes()])
      .then(([r, d, f, t, s]) => {
        setRooms(r);
        setDevices(d);
        setFurniture(f);
        setTypes(t);
        setScenes(s);
      })
      .catch((e) => setLoadError(String(e.message || e)));
  }, []);

  const online = useRealtime((msg) => {
    if (msg.type === "device.state") {
      const { deviceId, state, version } = msg.data;
      setDevices((prev) => prev.map((d) => (d.id === deviceId ? { ...d, state, version } : d)));
    } else if (msg.type === "command.result") {
      const r = msg.data;
      if (!r.ok) pushEvent(`命令失败：${r.error}`, true);
    } else if (msg.type === "scene.progress") {
      const p = msg.data;
      setProgress(`场景 ${p.sceneId}：${p.done}/${p.total}${p.failed ? `，失败 ${p.failed}` : ""}`);
      if (p.done === p.total) setTimeout(() => setProgress(""), 2500);
    }
  });

  const roomDevices = useMemo(
    () => devices.filter((d) => d.roomId === selectedRoom),
    [devices, selectedRoom]
  );
  const currentDevice = devices.find((d) => d.id === selectedDevice) ?? null;

  const onCommand = async (deviceId: string, capability: string, value: unknown) => {
    setPending(true);
    setError(null);
    const dev = devices.find((d) => d.id === deviceId);
    try {
      const res = await api.command(deviceId, capability, value);
      setDevices((prev) =>
        prev.map((d) =>
          d.id === deviceId ? { ...d, state: res.state ?? d.state, version: res.version ?? d.version } : d
        )
      );
      pushEvent(`${dev?.name ?? deviceId} · ${capability} → ${String(value)}（${res.latencyMs} ms）`);
    } catch (e: any) {
      const msg = String(e.message || e);
      setError(msg);
      pushEvent(`${dev?.name ?? deviceId} 失败：${msg}`, true);
    } finally {
      setPending(false);
    }
  };

  const onTrigger = async (sceneId: string) => {
    setError(null);
    setProgress(`场景 ${sceneId}：执行中`);
    try {
      const res = await api.trigger(sceneId);
      pushEvent(`场景 ${sceneId} 完成：${res.total - res.failed}/${res.total}`);
    } catch (e: any) {
      setError(String(e.message || e));
    }
  };

  const onMoveFurniture = async (id: string, x: number, y: number) => {
    setFurniture((prev) => prev.map((f) => (f.id === id ? { ...f, x, y } : f)));
    try {
      await api.moveFurniture(id, x, y);
    } catch (e: any) {
      setError(String(e.message || e));
    }
  };

  const onAddFurniture = async (typeId: string) => {
    const t = types.find((x) => x.id === typeId);
    if (!t) return;
    try {
      const created = await api.addFurniture({
        roomId: selectedRoom,
        typeId,
        name: t.name,
        x: 60 + Math.round(Math.random() * 40),
        y: 60 + Math.round(Math.random() * 40),
      });
      setFurniture((prev) => [...prev, created]);
      pushEvent(`已添加家具：${created.name}`);
    } catch (e: any) {
      setError(String(e.message || e));
    }
  };

  if (loadError) {
    return (
      <div className="boot">
        <h1>无法连接后端</h1>
        <p>{loadError}</p>
        <p className="hint">请先在 server 目录执行：python -m uvicorn app.main:app --port 8000</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>智能家居 · 平面图控制台</h1>
          <p className="sub">第 18 组 · 五层架构演示（展示 → 控制 → 设备；状态经 WebSocket 回推）</p>
        </div>
        <div className="scene-bar">
          {scenes.map((s) => (
            <button key={s.id} className="btn" onClick={() => onTrigger(s.id)}>
              {s.name}
            </button>
          ))}
          <span className={online ? "status on" : "status"}>{online ? "实时在线" : "连接中…"}</span>
        </div>
      </header>

      {progress && <div className="progress">{progress}</div>}

      <main className="layout">
        <aside className="left">
          <h3>房间</h3>
          <div className="room-list">
            {rooms.map((r) => {
              const count = devices.filter((d) => d.roomId === r.id).length;
              return (
                <button
                  key={r.id}
                  className={r.id === selectedRoom ? "room active" : "room"}
                  onClick={() => {
                    setSelectedRoom(r.id);
                    setSelectedDevice(null);
                  }}
                >
                  <span>{r.name}</span>
                  <em>{count}</em>
                </button>
              );
            })}
          </div>
          <h3>家具库</h3>
          <div className="palette">
            {types.map((t) => (
              <button key={t.id} className="chip" onClick={() => onAddFurniture(t.id)}>
                {t.name}
              </button>
            ))}
          </div>
        </aside>

        <section className="canvas">
          <FloorPlan
            rooms={rooms}
            furniture={furniture}
            types={types}
            devices={devices}
            selectedRoom={selectedRoom}
            selectedDevice={selectedDevice}
            onSelectRoom={(id) => {
              setSelectedRoom(id);
              setSelectedDevice(null);
            }}
            onSelectDevice={(id) => {
              setSelectedDevice(id);
              const d = devices.find((x) => x.id === id);
              if (d) setSelectedRoom(d.roomId);
            }}
            onMoveFurniture={onMoveFurniture}
          />
          <p className="hint">拖动家具即可移动并保存；点击房间或设备查看详情。设备圆点黑色表示开启。</p>
        </section>

        <aside className="right">
          <DevicePanel
            device={currentDevice}
            roomDevices={roomDevices}
            onSelect={(id) => {
              setSelectedDevice(id);
              const d = devices.find((x) => x.id === id);
              if (d) setSelectedRoom(d.roomId);
            }}
            onCommand={onCommand}
            pending={pending}
            error={error}
          />
        </aside>
      </main>

      <footer className="events">
        {events.length === 0 ? <span className="hint">暂无事件</span> : events.map((e) => (
          <div key={e.id} className={e.bad ? "event bad" : "event"}>
            <span>{e.time}</span>
            <b>{e.text}</b>
          </div>
        ))}
      </footer>
    </div>
  );
}
