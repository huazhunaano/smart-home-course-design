import { useEffect, useState } from "react";
import type { Device } from "../types";

type Props = {
  device: Device | null;
  roomDevices: Device[];
  onSelect: (id: string) => void;
  onCommand: (deviceId: string, capability: string, value: unknown) => Promise<void>;
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

const MODE_CN: Record<string, string> = {
  cool: "制冷", heat: "制热", fan: "送风", dry: "除湿", auto: "自动",
  sleep: "睡眠", high: "强力", clean: "清扫", dock: "回充",
  low: "低", mid: "中", quick: "快洗", standard: "标准", eco: "节能",
  cook: "煮饭", soup: "煲汤", keepwarm: "保温", spin: "脱水",
};

function summary(d: Device): string {
  const s = d.state || {};
  if (d.type === "light") return s.power ? `开 ${s.brightness}%` : "关";
  if (d.type === "ac") return s.power ? `${s.targetTemp}℃ ${MODE_CN[s.mode] ?? s.mode}` : "关";
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

export function DevicePanel({ device, roomDevices, onSelect, onCommand, pending, error }: Props) {
  const [draft, setDraft] = useState<Record<string, number>>({});

  useEffect(() => {
    setDraft({});
  }, [device?.id]);

  if (!device) {
    return (
      <div className="panel">
        <h3>本房间设备</h3>
        <div className="device-list">
          {roomDevices.map((d) => (
            <button key={d.id} className="device-row" onClick={() => onSelect(d.id)}>
              <span className="dot" data-on={d.state?.power === true} />
              <span className="dname">{d.name}</span>
              <span className="dsum">{summary(d)}</span>
            </button>
          ))}
        </div>
        <p className="hint">在平面图中点击设备，或从上方列表选择。</p>
      </div>
    );
  }

  const caps = device.capabilities;
  const readonly = Object.entries(device.state || {}).filter(([k]) => !caps.includes(k));

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>{device.name}</h3>
        <span className="tag">{device.type}</span>
      </div>
      <p className="meta">
        {device.id} · v{device.version}
      </p>
      {error && <p className="error">{error}</p>}

      <div className="controls">
        {caps.includes("power") && (
          <div className="control">
            <label>开关</label>
            <button
              className={device.state.power ? "btn on" : "btn"}
              disabled={pending}
              onClick={() => onCommand(device.id, "power", !device.state.power)}
            >
              {device.state.power ? "关闭" : "打开"}
            </button>
          </div>
        )}

        {caps.includes("lockState") && (
          <div className="control">
            <label>门锁</label>
            <button
              className="btn"
              disabled={pending}
              onClick={() =>
                onCommand(device.id, "lockState",
                  device.state.lockState === "unlocked" ? "locked" : "unlocked")
              }
            >
              {device.state.lockState === "unlocked" ? "上锁" : "解锁"}
            </button>
          </div>
        )}

        {caps.includes("mode") && (
          <div className="control">
            <label>模式</label>
            <select
              value={device.state.mode}
              disabled={pending}
              onChange={(e) => onCommand(device.id, "mode", e.target.value)}
            >
              {(MODES[device.type] ?? []).map((m) => (
                <option key={m} value={m}>{MODE_CN[m] ?? m}</option>
              ))}
            </select>
          </div>
        )}

        {caps.includes("fanSpeed") && (
          <div className="control">
            <label>风速</label>
            <select
              value={device.state.fanSpeed}
              disabled={pending}
              onChange={(e) => onCommand(device.id, "fanSpeed", e.target.value)}
            >
              {["low", "mid", "high", "auto"].map((m) => (
                <option key={m} value={m}>{MODE_CN[m] ?? m}</option>
              ))}
            </select>
          </div>
        )}

        {caps
          .filter((c) => RANGES[c])
          .map((c) => {
            const [lo, hi] = device.type === "waterheater" && c === "targetTemp" ? [35, 60] : RANGES[c];
            const value = draft[c] ?? Number(device.state[c] ?? lo);
            return (
              <div className="control" key={c}>
                <label>{c === "targetTemp" ? "目标温度" : c}</label>
                <input
                  type="range"
                  min={lo}
                  max={hi}
                  value={value}
                  disabled={pending}
                  onChange={(e) => setDraft({ ...draft, [c]: Number(e.target.value) })}
                />
                <div className="row">
                  <span className="num">{value}</span>
                  <button
                    className="btn small"
                    disabled={pending}
                    onClick={() => onCommand(device.id, c, Number(value))}
                  >
                    应用
                  </button>
                </div>
              </div>
            );
          })}
      </div>

      {readonly.length > 0 && (
        <div className="readonly">
          <h4>设备状态</h4>
          {readonly.map(([k, v]) => (
            <div className="kv" key={k}>
              <span>{k}</span>
              <b>{typeof v === "object" ? JSON.stringify(v) : String(v)}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
