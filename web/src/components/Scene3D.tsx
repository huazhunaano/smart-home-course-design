import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Device, Furniture, FurnitureType, Room } from "../types";
import { centroid, devicePositions } from "../layout";

const CM = 0.01; // 平面图单位 cm → 3D 米
const WALL_H = 1.4; // 矮墙，保证任何角度都能看到室内
const WALL_T = 0.12;

// 家具台面高度（米），按类型估算
const FURNITURE_H: Record<string, number> = {
  sofa: 0.8,
  bed_double: 0.5,
  bed_single: 0.5,
  wardrobe: 2.0,
  dining_table: 0.75,
  tv_cabinet: 0.5,
  desk: 0.75,
  nightstand: 0.5,
};

const STATE_CN: Record<string, string> = {
  brightness: "亮度",
  colorTemp: "色温",
  lockState: "门锁",
  mode: "模式",
  targetTemp: "目标温度",
  fanSpeed: "风速",
  position: "开合度",
  volume: "音量",
  fridgeTemp: "冷藏",
  freezerTemp: "冷冻",
  waterTemp: "水温",
  heaterMode: "加热",
  temperature: "温度",
  humidity: "湿度",
  presence: "有人",
  lux: "照度",
  smoke: "烟雾",
  pm25: "PM2.5",
  battery: "电量",
  remainingTime: "剩余",
  powerConsumption: "功率",
  currentTemp: "室温",
};

type Props = {
  room: Room;
  device: Device;
  devices: Device[];
  furniture: Furniture[];
  types: FurnitureType[];
  onExit: () => void;
};

const wx = (cm: number) => cm * CM;
const wz = (cm: number) => -cm * CM;

function stateSummary(d: Device) {
  const rows: { k: string; v: string }[] = [];
  for (const [k, v] of Object.entries(d.state ?? {})) {
    if (k === "power" || !(k in STATE_CN)) continue;
    if (v === null || v === undefined || typeof v === "object") continue;
    rows.push({ k: STATE_CN[k], v: String(v) });
    if (rows.length >= 4) break;
  }
  return rows;
}

export function Scene3D(props: Props) {
  const { room, device, devices, furniture, types, onExit } = props;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const resetRef = useRef<() => void>(() => {});
  const markers = useRef(new Map<string, { ball: THREE.Mesh; ring: THREE.Mesh }>());

  const positions = devicePositions([room], devices, furniture, types);
  const focus = positions.get(device.id) ?? centroid(room.polygon);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf6f6f6);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      host.innerHTML = '<p class="scene3d-fallback">当前浏览器不支持 WebGL，无法显示 3D 视图。</p>';
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 200);
    const target = new THREE.Vector3(wx(focus[0]), 0.9, wz(focus[1]));

    // 按房间尺寸取景：能看到设备附近的家具与墙体，而不是只看到一个球
    const xs = room.polygon.map((p) => wx(p[0]));
    const zs = room.polygon.map((p) => wz(p[1]));
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
    const dist = Math.min(11, Math.max(3.4, span * 1.3));
    const home = target.clone().add(new THREE.Vector3(0.75, 0.9, 0.75).normalize().multiplyScalar(dist));
    home.y = Math.max(home.y, 1.6);
    camera.position.copy(home);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 1.2;
    controls.maxDistance = Math.max(8, dist * 2.5);
    controls.maxPolarAngle = Math.PI / 2.08;
    controls.update();

    scene.add(new THREE.HemisphereLight(0xffffff, 0xe0e0e0, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(6, 11, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -10;
    sun.shadow.camera.right = 10;
    sun.shadow.camera.top = 10;
    sun.shadow.camera.bottom = -10;
    sun.shadow.bias = -0.0006;
    scene.add(sun);

    const disposables: (THREE.BufferGeometry | THREE.Material)[] = [];
    const box = (w: number, h: number, d: number, color: number, outline = true) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.02 });
      disposables.push(geo, mat);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (outline) {
        const eg = new THREE.EdgesGeometry(geo);
        const em = new THREE.LineBasicMaterial({ color: 0x2b2b2b, transparent: true, opacity: 0.8 });
        disposables.push(eg, em);
        mesh.add(new THREE.LineSegments(eg, em));
      }
      return mesh;
    };

    // 地面与房间地板
    const groundGeo = new THREE.PlaneGeometry(60, 60);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0xededed, roughness: 1 });
    disposables.push(groundGeo, groundMat);
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.012;
    ground.receiveShadow = true;
    scene.add(ground);

    const pts = room.polygon.map((p) => new THREE.Vector2(wx(p[0]), p[1] * CM));
    const shape = new THREE.Shape(pts);
    const floorGeo = new THREE.ShapeGeometry(shape);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, side: THREE.DoubleSide });
    disposables.push(floorGeo, floorMat);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // 房间轮廓线，强化“平面图 → 3D”的对应关系
    const outlineGeo = new THREE.BufferGeometry().setFromPoints([
      ...room.polygon.map((p) => new THREE.Vector3(wx(p[0]), 0.004, wz(p[1]))),
      new THREE.Vector3(wx(room.polygon[0][0]), 0.004, wz(room.polygon[0][1])),
    ]);
    const outlineMat = new THREE.LineBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.5 });
    disposables.push(outlineGeo, outlineMat);
    scene.add(new THREE.Line(outlineGeo, outlineMat));

    // 墙体：沿多边形每条边拉出矮墙，保持黑白线稿感
    for (let i = 0; i < room.polygon.length; i++) {
      const a = room.polygon[i];
      const b = room.polygon[(i + 1) % room.polygon.length];
      const ax = wx(a[0]), az = wz(a[1]);
      const bx = wx(b[0]), bz = wz(b[1]);
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.01) continue;
      const wall = box(len, WALL_H, WALL_T, 0xdedede);
      wall.position.set((ax + bx) / 2, WALL_H / 2, (az + bz) / 2);
      wall.rotation.y = Math.atan2(-(bz - az), bx - ax);
      scene.add(wall);
    }

    // 家具
    const typeMap = new Map(types.map((t) => [t.id, t]));
    for (const f of furniture.filter((x) => x.roomId === room.id)) {
      const t = typeMap.get(f.typeId);
      const w = (t?.w ?? 80) * CM;
      const d = (t?.h ?? 60) * CM;
      const h = FURNITURE_H[f.typeId] ?? 0.7;
      const mesh = box(w, h, d, 0xebebeb);
      mesh.position.set(wx(f.x) + w / 2, h / 2, wz(f.y) - d / 2);
      mesh.rotation.y = (-f.rotation * Math.PI) / 180;
      scene.add(mesh);
    }

    // 设备标记：当前设备用高立杆突出，其余设备用矮标记，避免“杆子森林”遮挡家具
    markers.current.clear();
    const poleGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.72, 12);
    const poleTallGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.5, 16);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xa8a8a8, roughness: 0.8 });
    const poleTallMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.6 });
    disposables.push(poleGeo, poleTallGeo, poleMat, poleTallMat);
    const ballGeo = new THREE.SphereGeometry(1, 24, 16);
    disposables.push(ballGeo);

    let pulseRing: THREE.Mesh | null = null;
    for (const d of devices.filter((x) => x.roomId === room.id)) {
      const [cx, cy] = positions.get(d.id) ?? centroid(room.polygon);
      const x = wx(cx);
      const z = wz(cy);
      const on = d.state?.power === true;
      const active = d.id === device.id;

      const pole = new THREE.Mesh(active ? poleTallGeo : poleGeo, active ? poleTallMat : poleMat);
      pole.position.set(x, active ? 0.75 : 0.36, z);
      pole.castShadow = true;
      scene.add(pole);

      const mat = new THREE.MeshStandardMaterial({ color: on ? 0x111111 : 0xdcdcdc, roughness: 0.4 });
      disposables.push(mat);
      const ball = new THREE.Mesh(ballGeo, mat);
      ball.scale.setScalar(active ? 0.18 : 0.1);
      ball.position.set(x, active ? 1.58 : 0.78, z);
      ball.castShadow = true;
      scene.add(ball);

      const ringGeo = new THREE.RingGeometry(0.16, 0.21, 36);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x777777, side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
      disposables.push(ringGeo, ringMat);
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, 0.006, z);
      ring.visible = on;
      scene.add(ring);

      if (active) {
        const haloGeo = new THREE.RingGeometry(0.4, 0.48, 48);
        const haloMat = new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.DoubleSide, transparent: true, opacity: 0.55 });
        disposables.push(haloGeo, haloMat);
        const halo = new THREE.Mesh(haloGeo, haloMat);
        halo.rotation.x = -Math.PI / 2;
        halo.position.set(x, 0.008, z);
        scene.add(halo);
        pulseRing = halo;
      }

      markers.current.set(d.id, { ball, ring });
    }

    const resize = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    resetRef.current = () => {
      camera.position.copy(home);
      controls.target.copy(target);
      controls.update();
    };

    const clock = new THREE.Clock();
    let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      if (pulseRing) pulseRing.scale.setScalar(1 + Math.sin(t * 2.4) * 0.08);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      for (const item of disposables) item.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === host) host.removeChild(renderer.domElement);
      markers.current.clear();
    };
    // 仅在切换设备/房间时重建场景；设备状态变化由下方 effect 更新
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id, device.id]);

  // 设备开关变化时只更新标记颜色，不重建场景
  useEffect(() => {
    for (const d of devices) {
      const m = markers.current.get(d.id);
      if (!m) continue;
      const on = d.state?.power === true;
      (m.ball.material as THREE.MeshStandardMaterial).color.set(on ? 0x111111 : 0xdcdcdc);
      m.ring.visible = on;
    }
  }, [devices]);

  const summary = stateSummary(device);
  const on = device.state?.power === true;

  return (
    <div className="scene3d">
      <div className="scene3d-host" ref={hostRef} />
      <div className="scene3d-hud">
        <div className="scene3d-title">
          <b>{device.name}</b>
          <span className={on ? "scene3d-state on" : "scene3d-state"}>{on ? "已开启" : "已关闭"}</span>
        </div>
        <p className="scene3d-room">{room.name} · 3D 局部视图</p>
        {summary.length > 0 && (
          <div className="scene3d-kv">
            {summary.map((r) => (
              <div key={r.k}><span>{r.k}</span><b>{r.v}</b></div>
            ))}
          </div>
        )}
        <p className="scene3d-tip">拖动旋转 · 滚轮缩放 · 右键平移 · Esc 退出</p>
      </div>
      <div className="scene3d-actions">
        <button className="icon-btn text" onClick={() => resetRef.current()}>视角复位</button>
        <button className="icon-btn text" onClick={onExit}>退出 3D</button>
      </div>
      <div className="scene3d-legend">
        <span><i className="dot on" /> 开启设备</span>
        <span><i className="dot" /> 关闭设备</span>
        <span><i className="halo" /> 当前设备</span>
      </div>
    </div>
  );
}
