import { useRef, useState } from "react";
import type { Device, Furniture, FurnitureType, Room } from "../types";

type Props = {
  rooms: Room[];
  furniture: Furniture[];
  types: FurnitureType[];
  devices: Device[];
  selectedRoom: string;
  selectedDevice: string | null;
  onSelectRoom: (id: string) => void;
  onSelectDevice: (id: string) => void;
  onMoveFurniture: (id: string, x: number, y: number) => void;
};

function centroid(poly: number[][]): [number, number] {
  const n = poly.length || 1;
  return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n];
}

export function FloorPlan(props: Props) {
  const { rooms, furniture, types, devices, selectedRoom, selectedDevice } = props;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const typeMap = new Map(types.map((t) => [t.id, t]));

  const toSvg = (clientX: number, clientY: number): [number, number] => {
    const svg = svgRef.current;
    if (!svg) return [0, 0];
    const r = svg.getBoundingClientRect();
    return [((clientX - r.left) * 1200) / r.width, ((clientY - r.top) * 800) / r.height];
  };

  const furniturePos = (f: Furniture) => {
    if (drag && drag.id === f.id) return { ...f, x: drag.x, y: drag.y };
    return f;
  };

  const devicePos = (d: Device, index: number): [number, number] => {
    const bound = furniture.find((f) => f.deviceId === d.id);
    if (bound) {
      const t = typeMap.get(bound.typeId);
      return [bound.x + (t?.w ?? 60) / 2, bound.y + (t?.h ?? 60) / 2];
    }
    const room = rooms.find((r) => r.id === d.roomId);
    if (!room) return [0, 0];
    const [cx, cy] = centroid(room.polygon);
    const col = index % 4;
    const row = Math.floor(index / 4);
    return [cx - 90 + col * 60, cy + 40 + row * 55];
  };

  return (
    <svg ref={svgRef} className="plan" viewBox="0 0 1200 800" role="img" aria-label="户型平面图">
      <rect x="0" y="0" width="1200" height="800" fill="#fafafa" stroke="#d0d0d0" strokeWidth="2" />
      {rooms.map((room) => {
        const active = room.id === selectedRoom;
        const pts = room.polygon.map((p) => p.join(",")).join(" ");
        const [cx, cy] = centroid(room.polygon);
        return (
          <g key={room.id} onClick={() => props.onSelectRoom(room.id)} style={{ cursor: "pointer" }}>
            <polygon
              points={pts}
              fill={active ? "#ececec" : "#ffffff"}
              stroke={active ? "#111" : "#9a9a9a"}
              strokeWidth={active ? 4 : 2}
            />
            <text x={cx} y={cy} textAnchor="middle" className="room-label">
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
        return (
          <g
            key={f.id}
            transform={`rotate(${f.rotation} ${cx} ${cy})`}
            onPointerDown={(e) => {
              e.stopPropagation();
              (e.target as Element).setPointerCapture(e.pointerId);
              setDrag({ id: f.id, x: p.x, y: p.y });
            }}
            onPointerMove={(e) => {
              if (!drag || drag.id !== f.id) return;
              const [mx, my] = toSvg(e.clientX, e.clientY);
              setDrag({ id: f.id, x: Math.max(0, Math.min(1200 - w, mx - w / 2)), y: Math.max(0, Math.min(800 - h, my - h / 2)) });
            }}
            onPointerUp={() => {
              if (drag && drag.id === f.id) props.onMoveFurniture(f.id, Math.round(drag.x), Math.round(drag.y));
              setDrag(null);
            }}
            style={{ cursor: "grab" }}
          >
            <rect x={p.x} y={p.y} width={w} height={h} rx={6} fill="#f3f3f3" stroke="#333" strokeWidth={2} />
            <text x={cx} y={cy + 4} textAnchor="middle" className="furniture-label">
              {f.name}
            </text>
          </g>
        );
      })}

      {devices.map((d, i) => {
        const [x, y] = devicePos(d, i);
        const on = d.state?.power === true;
        const active = d.id === selectedDevice;
        return (
          <g key={d.id} onClick={(e) => { e.stopPropagation(); props.onSelectDevice(d.id); }} style={{ cursor: "pointer" }}>
            <circle
              cx={x}
              cy={y}
              r={active ? 15 : 12}
              fill={on ? "#111" : "#ffffff"}
              stroke={active ? "#000" : "#555"}
              strokeWidth={active ? 4 : 2}
            />
            <text x={x} y={y + 4} textAnchor="middle" className={on ? "device-glyph on" : "device-glyph"}>
              {d.type.slice(0, 1).toUpperCase()}
            </text>
            <text x={x} y={y + 30} textAnchor="middle" className="device-label">
              {d.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
