import { useMemo, useRef, useState } from "react";
import type { Device, Furniture, FurnitureType, Room } from "../types";
import { DeviceIcon } from "./icons";

type Props = {
  rooms: Room[];
  furniture: Furniture[];
  types: FurnitureType[];
  devices: Device[];
  selectedRoom: string;
  selectedDevice: string | null;
  selectedFurniture: string | null;
  onSelectRoom: (id: string) => void;
  onSelectDevice: (id: string) => void;
  onSelectFurniture: (id: string) => void;
  onMoveFurniture: (id: string, x: number, y: number) => void;
};

function centroid(poly: number[][]): [number, number] {
  const n = poly.length || 1;
  return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n];
}

function bbox(poly: number[][]) {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  return { x1: Math.min(...xs), x2: Math.max(...xs), y1: Math.min(...ys), y2: Math.max(...ys) };
}

export function FloorPlan(props: Props) {
  const { rooms, furniture, types, devices, selectedRoom, selectedDevice, selectedFurniture } = props;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [hoverFurniture, setHoverFurniture] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const typeMap = new Map(types.map((t) => [t.id, t]));

  const positions = useMemo(() => {
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
  }, [devices, furniture, rooms, typeMap]);

  const onCount = (roomId: string) =>
    devices.filter((d) => d.roomId === roomId && d.state?.power === true).length;

  const toSvg = (clientX: number, clientY: number): [number, number] => {
    const svg = svgRef.current;
    if (!svg) return [0, 0];
    const r = svg.getBoundingClientRect();
    return [((clientX - r.left) * 1200) / r.width, ((clientY - r.top) * 800) / r.height];
  };

  const furniturePos = (f: Furniture) => (drag && drag.id === f.id ? { ...f, x: drag.x, y: drag.y } : f);

  return (
    <div className="plan-wrap">
      <div className="plan-head">
        <span>平面图 · 点击房间或设备查看</span>
        <div className="plan-tools">
          <button className="icon-btn" onClick={() => setScale((s) => Math.max(0.7, +(s - 0.1).toFixed(2)))} aria-label="缩小">−</button>
          <span className="zoom">{Math.round(scale * 100)}%</span>
          <button className="icon-btn" onClick={() => setScale((s) => Math.min(1.8, +(s + 0.1).toFixed(2)))} aria-label="放大">+</button>
          <button className="icon-btn text" onClick={() => setScale(1)}>复位</button>
        </div>
      </div>

      <div className="plan-scroll">
        <svg
          ref={svgRef}
          className="plan"
          viewBox="0 0 1200 800"
          width={`${scale * 100}%`}
          role="img"
          aria-label="户型平面图"
        >
          <rect x="0" y="0" width="1200" height="800" fill="#fbfbfb" stroke="#dcdcdc" strokeWidth="2" />
          {rooms.map((room) => {
            const active = room.id === selectedRoom;
            const pts = room.polygon.map((p) => p.join(",")).join(" ");
            const [cx, cy] = centroid(room.polygon);
            const b = bbox(room.polygon);
            return (
              <g key={room.id} onClick={() => props.onSelectRoom(room.id)} style={{ cursor: "pointer" }}>
                <polygon
                  points={pts}
                  fill={active ? "#eeeeee" : "#ffffff"}
                  stroke={active ? "#111" : "#b5b5b5"}
                  strokeWidth={active ? 3 : 1.5}
                />
                <text x={b.x1 + 14} y={b.y1 + 24} className="room-label">
                  {room.name}
                </text>
                <text x={b.x1 + 14} y={b.y1 + 40} className="room-sub">
                  {onCount(room.id)}/{devices.filter((d) => d.roomId === room.id).length} 开启
                </text>
                <text x={cx} y={cy} className="room-watermark">
                  {room.name}
                </text>
              </g>
            );
          })}

          {furniture.map((f) => {
            const t = typeMap.get(f.typeId);
            const w = t?.w ?? 80;
            const h = t?.h ?? 60;
            const p = furniturePos(f);
            const cx = p.x + w / 2;
            const cy = p.y + h / 2;
            const active = f.id === selectedFurniture;
            return (
              <g
                key={f.id}
                transform={`rotate(${f.rotation} ${cx} ${cy})`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  (e.target as Element).setPointerCapture(e.pointerId);
                  props.onSelectFurniture(f.id);
                  setDrag({ id: f.id, x: p.x, y: p.y });
                }}
                onPointerMove={(e) => {
                  if (!drag || drag.id !== f.id) return;
                  const [mx, my] = toSvg(e.clientX, e.clientY);
                  setDrag({
                    id: f.id,
                    x: Math.max(0, Math.min(1200 - w, mx - w / 2)),
                    y: Math.max(0, Math.min(800 - h, my - h / 2)),
                  });
                }}
                onPointerUp={() => {
                  if (drag && drag.id === f.id) props.onMoveFurniture(f.id, Math.round(drag.x), Math.round(drag.y));
                  setDrag(null);
                }}
                style={{ cursor: "grab" }}
                onMouseEnter={() => setHoverFurniture(f.id)}
                onMouseLeave={() => setHoverFurniture(null)}
              >
                <title>{f.name}</title>
                <rect
                  x={p.x}
                  y={p.y}
                  width={w}
                  height={h}
                  rx={6}
                  fill={active ? "#efefef" : "#f5f5f5"}
                  stroke={active ? "#111" : "#555"}
                  strokeWidth={active ? 3 : 1.5}
                />
                {(active || hoverFurniture === f.id) && (
                  <text x={cx} y={cy + 4} textAnchor="middle" className="furniture-label">
                    {f.name}
                  </text>
                )}
              </g>
            );
          })}

          {devices.map((d) => {
            const [x, y] = positions.get(d.id) ?? [0, 0];
            const on = d.state?.power === true;
            const active = d.id === selectedDevice;
            const showLabel = active || hover === d.id;
            return (
              <g
                key={d.id}
                onClick={(e) => { e.stopPropagation(); props.onSelectDevice(d.id); }}
                onMouseEnter={() => setHover(d.id)}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: "pointer" }}
              >
                <circle
                  cx={x}
                  cy={y}
                  r={active ? 22 : 18}
                  fill={on ? "#111" : "#fff"}
                  stroke={active ? "#111" : on ? "#111" : "#777"}
                  strokeWidth={active ? 4 : 1.6}
                />
                <g transform={`translate(${x - 11},${y - 11})`} className={on ? "glyph on" : "glyph"}>
                  <DeviceIcon type={d.type} size={22} />
                </g>
                {showLabel && (
                  <g>
                    <rect x={x - 60} y={y - 50} width={120} height={22} rx={5} fill="#111" opacity="0.92" />
                    <text x={x} y={y - 34} textAnchor="middle" className="device-tip">
                      {d.name}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="legend">
        <span><i className="dot on" /> 开启</span>
        <span><i className="dot" /> 关闭</span>
        <span className="hint-inline">悬停设备显示名称</span>
      </div>
    </div>
  );
}
