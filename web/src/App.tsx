import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { FloorPlan } from "./components/FloorPlan";
import { DevicePanel } from "./components/DevicePanel";
import type { Device, EventItem, Furniture, FurnitureType, Room, Scene } from "./types";
import { useRealtime } from "./useRealtime";

// 3D 场景体积较大，按需加载，避免拖慢首屏
const Scene3D = lazy(() => import("./components/Scene3D").then((m) => ({ default: m.Scene3D })));

let seq = 1;

function hasWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (canvas.getContext("webgl2") || canvas.getContext("webgl")));
  } catch {
    return false;
  }
}

type Env = { temperature: number; humidity: number } | null;

const SCENE_DESC: Record<string, string> = {
  home: "开灯 · 空调 · 窗帘",
  away: "关灯 · 断电 · 清扫",
  sleep: "关灯 · 窗帘 · 静音",
  night: "夜灯 · 镜前灯",
};

export default function App() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [furniture, setFurniture] = useState<Furniture[]>([]);
  const [types, setTypes] = useState<FurnitureType[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [env, setEnv] = useState<Env>(null);
  const [selectedRoom, setSelectedRoom] = useState("R2");
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [selectedFurniture, setSelectedFurniture] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [progress, setProgress] = useState("");
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [logOpen, setLogOpen] = useState(false);
  const [view3d, setView3d] = useState(false);

  const notify = useCallback((text: string, bad = false) => {
    setToast({ text, bad });
    window.setTimeout(() => setToast(null), 2600);
    setEvents((prev) => [{ id: seq++, text, time: new Date().toLocaleTimeString(), bad }, ...prev].slice(0, 50));
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
      .catch((e) => setLoadError(String(e.message || e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    api.env(selectedRoom)
      .then(setEnv)
      .catch(() => api.env().then(setEnv).catch(() => setEnv(null)));
  }, [selectedRoom]);

  const online = useRealtime((msg) => {
    if (msg.type === "device.state") {
      const { deviceId, state, version } = msg.data;
      setDevices((prev) => prev.map((d) => (d.id === deviceId ? { ...d, state, version } : d)));
      if (typeof state?.temperature === "number" && typeof state?.humidity === "number") {
        const dev = devices.find((d) => d.id === deviceId);
        if (dev?.roomId === selectedRoom) setEnv({ temperature: state.temperature, humidity: state.humidity });
      }
    } else if (msg.type === "command.result" && !msg.data.ok) {
      notify(`命令失败：${msg.data.error}`, true);
    } else if (msg.type === "scene.progress") {
      const p = msg.data;
      setProgress(`场景执行 ${p.done}/${p.total}${p.failed ? `，失败 ${p.failed}` : ""}`);
      if (p.done === p.total) window.setTimeout(() => setProgress(""), 2600);
    }
  });

  const roomDevices = useMemo(() => devices.filter((d) => d.roomId === selectedRoom), [devices, selectedRoom]);
  const currentDevice = devices.find((d) => d.id === selectedDevice) ?? null;
  const currentFurniture = furniture.find((f) => f.id === selectedFurniture) ?? null;
  const roomOn = roomDevices.filter((d) => d.state?.power === true).length;
  const allOn = devices.filter((d) => d.state?.power === true).length;

  const onCommand = async (deviceId: string, capability: string, value: unknown) => {
    setPending(true);
    setError(null);
    const dev = devices.find((d) => d.id === deviceId);
    try {
      const res = await api.command(deviceId, capability, value);
      setDevices((prev) =>
        prev.map((d) => (d.id === deviceId ? { ...d, state: res.state ?? d.state, version: res.version ?? d.version } : d))
      );
      notify(`${dev?.name ?? deviceId} · ${capability} → ${String(value)}（${res.latencyMs} ms）`);
    } catch (e: any) {
      const msg = String(e.message || e);
      setError(msg);
      notify(`${dev?.name ?? deviceId} 失败：${msg}`, true);
    } finally {
      setPending(false);
    }
  };

  const onTrigger = async (scene: Scene) => {
    setError(null);
    setProgress(`场景 ${scene.name}：执行中`);
    try {
      const res = await api.trigger(scene.id);
      notify(`场景「${scene.name}」完成：${res.total - res.failed}/${res.total}`);
    } catch (e: any) {
      notify(String(e.message || e), true);
    }
  };

  const onMoveFurniture = async (id: string, x: number, y: number) => {
    setFurniture((prev) => prev.map((f) => (f.id === id ? { ...f, x, y } : f)));
    try {
      await api.moveFurniture(id, x, y);
    } catch (e: any) {
      notify(String(e.message || e), true);
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
      setSelectedFurniture(created.id);
      setSelectedDevice(null);
      notify(`已添加「${created.name}」，可在右侧旋转或删除`);
    } catch (e: any) {
      notify(String(e.message || e), true);
    }
  };

  const onRotateFurniture = async (id: string) => {
    const f = furniture.find((x) => x.id === id);
    if (!f) return;
    const rotation = (f.rotation + 90) % 360;
    setFurniture((prev) => prev.map((x) => (x.id === id ? { ...x, rotation } : x)));
    try {
      await api.rotateFurniture(id, rotation);
    } catch (e: any) {
      notify(String(e.message || e), true);
    }
  };

  const onDeleteFurniture = async (id: string) => {
    const f = furniture.find((x) => x.id === id);
    if (!f || !window.confirm(`删除家具「${f.name}」？`)) return;
    try {
      await api.deleteFurniture(id);
      setFurniture((prev) => prev.filter((x) => x.id !== id));
      setSelectedFurniture(null);
      notify(`已删除「${f.name}」`);
    } catch (e: any) {
      notify(String(e.message || e), true);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (e.key === "Escape") {
        if (view3d) {
          setView3d(false);
          return;
        }
        setSelectedFurniture(null);
        setSelectedDevice(null);
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedFurniture) {
        e.preventDefault();
        onDeleteFurniture(selectedFurniture);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedFurniture, furniture, view3d]);

  const onEnter3D = () => {
    if (!currentDevice) {
      notify("请先在平面图或设备列表中选择一个设备", true);
      return;
    }
    if (!hasWebGL()) {
      notify("当前浏览器不支持 WebGL，已保持 2D 平面图", true);
      return;
    }
    setView3d(true);
  };

  const currentRoom = rooms.find((r) => r.id === currentDevice?.roomId) ?? null;

  useEffect(() => {
    if (view3d && !currentDevice) setView3d(false);
  }, [view3d, currentDevice]);

  if (loadError) {
    return (
      <div className="boot">
        <h1>无法连接后端</h1>
        <p>{loadError}</p>
        <p className="hint">请先在 server 目录执行：python -m uvicorn app.main:app --port 8000</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="app">
        <header className="appbar">
          <div className="brand"><div className="logo">⌂</div><div><h1>智能家居控制台</h1><p>正在载入…</p></div></div>
        </header>
        <div className="skeleton-layout">
          <div className="sk sk-rail" />
          <div className="sk sk-stage" />
          <div className="sk sk-inspector" />
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="appbar">
        <div className="brand">
          <div className="logo">⌂</div>
          <div>
            <h1>智能家居控制台</h1>
            <p>第 18 组 · 平面图 · 五层架构</p>
          </div>
        </div>
        <div className="appbar-right">
          <span className={online ? "pill online" : "pill"}><i className="pulse" />{online ? "实时在线" : "重连中"}</span>
        </div>
      </header>

      <section className="scene-row">
        {scenes.map((s) => (
          <button key={s.id} className="scene-card" onClick={() => onTrigger(s)}>
            <span className="scene-glyph">{s.name.slice(0, 1)}</span>
            <span className="scene-text">
              <b>{s.name}</b>
              <em>{SCENE_DESC[s.id] ?? "一键执行"}</em>
            </span>
          </button>
        ))}
        {progress && <span className="progress-pill">{progress}</span>}
      </section>

      <main className="workspace">
        <aside className="rail">
          <h3>房间</h3>
          <div className="room-list">
            {rooms.map((r) => {
              const total = devices.filter((d) => d.roomId === r.id).length;
              const on = devices.filter((d) => d.roomId === r.id && d.state?.power).length;
              return (
                <button
                  key={r.id}
                  className={r.id === selectedRoom ? "room active" : "room"}
                  onClick={() => { setSelectedRoom(r.id); setSelectedDevice(null); setSelectedFurniture(null); }}
                >
                  <span>{r.name}</span>
                  <em>{on}/{total}</em>
                </button>
              );
            })}
          </div>
          <h3>添加家具</h3>
          <div className="palette">
            {types.map((t) => (
              <button key={t.id} className="chip" onClick={() => onAddFurniture(t.id)}>{t.name}</button>
            ))}
          </div>
        </aside>

        <section className="stage">
          <div className="metrics">
            <div className="metric">
              <span>室内环境</span>
              <b>{env ? `${env.temperature.toFixed(1)}℃` : "--"}</b>
              <em>{env ? `湿度 ${env.humidity.toFixed(0)}%` : "暂无采样"}</em>
            </div>
            <div className="metric">
              <span>本房间开启</span>
              <b>{roomOn}<small> / {roomDevices.length}</small></b>
              <em>{rooms.find((r) => r.id === selectedRoom)?.name}</em>
            </div>
            <div className="metric">
              <span>全屋开启</span>
              <b>{allOn}<small> / {devices.length}</small></b>
              <em>{progress || "WebSocket 实时同步"}</em>
            </div>
          </div>

          {view3d && currentDevice && currentRoom ? (
            <Suspense fallback={<div className="scene3d scene3d-loading">正在载入 3D 场景…</div>}>
              <Scene3D
                room={currentRoom}
                device={currentDevice}
                devices={roomDevices}
                furniture={furniture}
                types={types}
                onExit={() => setView3d(false)}
              />
            </Suspense>
          ) : (
            <FloorPlan
              rooms={rooms}
              furniture={furniture}
              types={types}
              devices={devices}
              selectedRoom={selectedRoom}
              selectedDevice={selectedDevice}
              selectedFurniture={selectedFurniture}
              onSelectRoom={(id) => { setSelectedRoom(id); setSelectedDevice(null); setSelectedFurniture(null); }}
              onSelectDevice={(id) => {
                setSelectedDevice(id);
                setSelectedFurniture(null);
                const d = devices.find((x) => x.id === id);
                if (d) setSelectedRoom(d.roomId);
              }}
              onSelectFurniture={(id) => { setSelectedFurniture(id); setSelectedDevice(null); }}
              onMoveFurniture={onMoveFurniture}
              onEnter3D={onEnter3D}
            />
          )}
        </section>

        <aside className="inspector">
          <DevicePanel
            device={currentDevice}
            roomDevices={roomDevices}
            furniture={currentFurniture}
            onSelect={(id) => {
              if (!id) { setSelectedDevice(null); return; }
              setSelectedDevice(id);
              setSelectedFurniture(null);
              const d = devices.find((x) => x.id === id);
              if (d) setSelectedRoom(d.roomId);
            }}
            onCommand={onCommand}
            onRotateFurniture={onRotateFurniture}
            onDeleteFurniture={onDeleteFurniture}
            pending={pending}
            error={error}
          />
        </aside>
      </main>

      <footer className={logOpen ? "logbar open" : "logbar"}>
        <button className="log-toggle" onClick={() => setLogOpen((v) => !v)}>
          <b>事件记录</b>
          <span>{events[0] ? `${events[0].time} · ${events[0].text}` : "暂无事件"}</span>
          <em>{logOpen ? "收起" : "展开"}</em>
        </button>
        {logOpen && (
          <div className="log-list">
            {events.length === 0 ? <p className="hint">暂无事件</p> : events.map((e) => (
              <div key={e.id} className={e.bad ? "log-row bad" : "log-row"}>
                <span>{e.time}</span><b>{e.text}</b>
              </div>
            ))}
          </div>
        )}
      </footer>

      {toast && <div className={toast.bad ? "toast bad" : "toast"}>{toast.text}</div>}
    </div>
  );
}
