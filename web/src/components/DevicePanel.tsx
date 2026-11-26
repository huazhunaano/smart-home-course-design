import { useEffect, useState } from "react";
import type { Device, Furniture } from "../types";
import { DeviceIcon } from "./icons";

type Props = {
  device: Device | null;
  roomDevices: Device[];
  furniture: Furniture | null;
  onSelect: (id: string) => void;
  onCommand: (deviceId: string, capability: string, value: unknown) => Promise<void>;
  onRotateFurniture: (id: string) => void;
  onDeleteFurniture: (id: string) => void;
  pending: boolean;
  error: string | null;
};

const RANGES: Record<string, [number, number]> = {
  brightness: [0, 100],
  colorTemp: [2700, 6500],
  targetTemp: [16, 30],
  position: [0, 100],
  volume: [0, 100],
  fridgeTemp: [2, 8],
  freezerTemp: [-24, -16],
};

const MODES: Record<string, string[]> = {
  ac: ["cool", "heat", "fan", "dry", "auto"],
  purifier: ["auto", "sleep", "high"],
  robot: ["clean", "dock"],
  hood: ["low", "mid", "high"],
  dishwasher: ["quick", "standard", "eco"],
  ricecooker: ["cook", "soup", "keepwarm"],
  washer: ["standard", "quick", "spin"],
};

const FANS: Record<string, string[]> = {
  ac: ["low", "mid", "high", "auto"],
  hood: ["low", "mid", "high"],
};

const CN: Record<string, string> = {
  cool: "制冷", heat: "制热", fan: "送风", dry: "除湿", auto: "自动",
  sleep: "睡眠", high: "强力", clean: "清扫", dock: "回充",
  low: "低", mid: "中", quick: "快洗", standard: "标准", eco: "节能",
  cook: "煮饭", soup: "煲汤", keepwarm: "保温", spin: "脱水",
  brightness: "亮度", colorTemp: "色温", targetTemp: "目标温度", position: "开合度",
  volume: "音量", fridgeTemp: "冷藏", freezerTemp: "冷冻",
};

const READ_CN: Record<string, string> = {
  currentTemp: "当前温度", pm25: "PM2.5", remainingTime: "剩余时间", battery: "电量",
  smoke: "烟雾", temperature: "温度", humidity: "湿度", lux: "光照", presence: "有人",
  idleSec: "无人时长", powerConsumption: "功率", lockState: "门锁", doorState: "门状态",
};

function summary(d: Device): string {
  const s = d.state || {};
  if (d.type === "light") return s.power ? `开 · ${s.brightness}%` : "关闭";
  if (d.type === "ac") return s.power ? `${s.targetTemp}℃ · ${CN[s.mode] ?? s.mode}` : "关闭";
  if (d.type === "curtain") return `开合 ${s.position}%`;
  if (d.type === "lock") return s.lockState === "unlocked" ? "已解锁" : "已上锁";
  if (d.type === "thsensor") return `${s.temperature}℃ / ${s.humidity}%`;
  if (d.type === "presence") return s.presence ? "有人" : "无人";
  if (d.type === "lux") return `${s.lux} lx`;
  if (d.type === "smoke") return s.smoke ? "报警" : "正常";
  if (s.power === true) return "运行中";
  if (s.power === false) return "关闭";
  return "—";
}

function readValue(v: unknown): string {
  if (typeof v === "boolean") return v ? "是" : "否";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function DevicePanel(props: Props) {
  const { device, roomDevices, furniture, onSelect, onCommand, pending, error } = props;
  const [draft, setDraft] = useState<Record<string, number>>({});

  useEffect(() => {
    setDraft({});
  }, [device?.id]);

  if (furniture) {
    return (
      <div className="panel">
        <div className="panel-head">
          <h3>{furniture.name}</h3>
          <span className="tag">家具</span>
        </div>
        <p className="meta">位置 {Math.round(furniture.x)}, {Math.round(furniture.y)} · 旋转 {furniture.rotation}°</p>
        <div className="furniture-actions">
          <button className="btn" onClick={() => props.onRotateFurniture(furniture.id)}>
            旋转 90°
          </button>
          <button className="btn danger" onClick={() => props.onDeleteFurniture(furniture.id)}>
            删除家具
          </button>
        </div>
        <p className="hint">也可以选中后按 Delete 删除，按 Esc 取消选择。</p>
      </div>
    );
  }

  if (!device) {
    return (
      <div className="panel">
        <div className="panel-head">
          <h3>本房间设备</h3>
          <span className="tag">{roomDevices.length} 台</span>
        </div>
        <div className="tile-grid">
          {roomDevices.map((d) => {
            const on = d.state?.power === true;
            const canPower = d.capabilities.includes("power");
            return (
              <div key={d.id} className={on ? "tile on" : "tile"} onClick={() => onSelect(d.id)}>
                <div className="tile-icon"><DeviceIcon type={d.type} size={20} /></div>
                <div className="tile-name">{d.name}</div>
                <div className="tile-state">{summary(d)}</div>
                {canPower && (
                  <button
                    className="tile-btn"
                    disabled={pending}
                    onClick={(e) => {
                      e.stopPropagation();
                      onCommand(d.id, "power", !on);
                    }}
                  >
                    {on ? "关" : "开"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <p className="hint">点击磁贴查看详情；右上角按钮可快速开关。</p>
      </div>
    );
  }

  const caps = device.capabilities;
  const readonly = Object.entries(device.state || {}).filter(([k]) => !caps.includes(k));
  const isOn = device.state?.power === true;

  return (
    <div className="panel">
      <button className="back" onClick={() => onSelect("")}>← 返回设备列表</button>
      <div className="device-hero">
        <div className={isOn ? "hero-icon on" : "hero-icon"}>
          <DeviceIcon type={device.type} size={28} />
        </div>
        <div>
          <h3>{device.name}</h3>
          <p className="meta">{device.id} · v{device.version}</p>
        </div>
      </div>
      <p className="hero-state">{summary(device)}</p>
      {error && <p className="error">{error}</p>}

      <div className="controls">
        {caps.includes("power") && (
          <button className={isOn ? "power on" : "power"} disabled={pending} onClick={() => onCommand(device.id, "power", !isOn)}>
            {isOn ? "关闭设备" : "打开设备"}
          </button>
        )}

        {caps.includes("lockState") && (
          <button className="power" disabled={pending}
            onClick={() => onCommand(device.id, "lockState", device.state.lockState === "unlocked" ? "locked" : "unlocked")}>
            {device.state.lockState === "unlocked" ? "上锁" : "解锁"}
          </button>
        )}

        {caps.includes("mode") && (
          <div className="control">
            <label>模式</label>
            <select value={device.state.mode} disabled={pending}
              onChange={(e) => onCommand(device.id, "mode", e.target.value)}>
              {(MODES[device.type] ?? []).map((m) => <option key={m} value={m}>{CN[m] ?? m}</option>)}
            </select>
          </div>
        )}

        {caps.includes("fanSpeed") && (
          <div className="control">
            <label>风速</label>
            <select value={device.state.fanSpeed} disabled={pending}
              onChange={(e) => onCommand(device.id, "fanSpeed", e.target.value)}>
              {(FANS[device.type] ?? ["low", "mid", "high"]).map((m) => <option key={m} value={m}>{CN[m] ?? m}</option>)}
            </select>
          </div>
        )}

        {caps.filter((c) => RANGES[c]).map((c) => {
          const [lo, hi] = device.type === "waterheater" && c === "targetTemp" ? [35, 60] : RANGES[c];
          const value = draft[c] ?? Number(device.state[c] ?? lo);
          return (
            <div className="control" key={c}>
              <div className="control-head">
                <label>{CN[c] ?? c}</label>
                <b>{value}</b>
              </div>
              <input type="range" min={lo} max={hi} value={value} disabled={pending}
                onChange={(e) => setDraft({ ...draft, [c]: Number(e.target.value) })} />
              <div className="row">
                <span className="hint">{lo} – {hi}</span>
                <button className="btn small" disabled={pending}
                  onClick={() => onCommand(device.id, c, Number(value))}>应用</button>
              </div>
            </div>
          );
        })}
      </div>

      {readonly.length > 0 && (
        <div className="readonly">
          <h4>设备状态</h4>
          <div className="kv-grid">
            {readonly.map(([k, v]) => (
              <div className="kv" key={k}>
                <span>{READ_CN[k] ?? k}</span>
                <b>{readValue(v)}</b>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
