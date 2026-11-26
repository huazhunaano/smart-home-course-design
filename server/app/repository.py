# -*- coding: utf-8 -*-
"""SQLite 数据层：Repository 接口实现（仅此文件出现 SQL）。"""
from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from . import catalog


class VersionConflict(Exception):
    pass


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


SCHEMA = """
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, polygon TEXT NOT NULL, sort INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY, room_id TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL,
  capabilities TEXT NOT NULL, driver TEXT NOT NULL DEFAULT 'sim'
);
CREATE TABLE IF NOT EXISTS device_states (
  device_id TEXT PRIMARY KEY, state TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS state_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT NOT NULL,
  state TEXT NOT NULL, source TEXT NOT NULL, ts TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_state_logs_device_ts ON state_logs(device_id, ts);
CREATE TABLE IF NOT EXISTS env_samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL,
  temperature REAL NOT NULL, humidity REAL NOT NULL, ts TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_env_room_ts ON env_samples(room_id, ts);
CREATE TABLE IF NOT EXISTS scenes (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS furniture_types (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, w INTEGER NOT NULL, h INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS furniture (
  id TEXT PRIMARY KEY, room_id TEXT NOT NULL, type_id TEXT NOT NULL, name TEXT NOT NULL,
  x REAL NOT NULL, y REAL NOT NULL, rotation INTEGER NOT NULL DEFAULT 0, device_id TEXT
);
"""

FURNITURE_SEED = [
    ("f1", "R2", "sofa", "客厅沙发", 560, 60, 0, None),
    ("f2", "R2", "tv_cabinet", "电视柜", 560, 380, 0, "tv.living"),
    ("f3", "R5", "bed_double", "主卧双人床", 120, 220, 0, None),
    ("f4", "R5", "wardrobe", "主卧衣柜", 340, 160, 0, None),
    ("f5", "R5", "nightstand", "主卧床头柜", 40, 180, 0, "light.master"),
    ("f6", "R6", "bed_single", "次卧床", 80, 520, 0, None),
    ("f7", "R7", "bed_single", "老人床", 480, 650, 0, "light.elder"),
    ("f8", "R3", "dining_table", "餐桌", 950, 60, 0, None),
    ("f9", "R4", "desk", "厨房操作台", 980, 330, 0, "ricecooker.kitchen"),
    ("f10", "R8", "desk", "洗手台", 430, 440, 0, None),
]


class Repository:
    def __init__(self, db_path: str):
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._lock = threading.RLock()
        with self._lock:
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute("PRAGMA synchronous=NORMAL")
            self._conn.executescript(SCHEMA)
            self._seed()

    # ---------- 内部 ----------
    def _seed(self) -> None:
        cur = self._conn.execute("SELECT COUNT(*) AS n FROM rooms")
        if cur.fetchone()["n"]:
            return
        for rid, name, polygon, sort in catalog.ROOMS:
            self._conn.execute("INSERT INTO rooms VALUES (?,?,?,?)",
                               (rid, name, json.dumps(polygon), sort))
        for fid, fname, w, h in catalog.FURNITURE_TYPES:
            self._conn.execute("INSERT INTO furniture_types VALUES (?,?,?,?)", (fid, fname, w, h))
        ts = now_iso()
        for did, room, name, typ in catalog.DEVICES:
            caps = catalog.TYPE_CAPS[typ]
            self._conn.execute("INSERT INTO devices VALUES (?,?,?,?,?,?)",
                               (did, room, name, typ, json.dumps(caps, ensure_ascii=False), "sim"))
            state = json.loads(json.dumps(catalog.INITIAL_STATE[typ]))
            self._conn.execute("INSERT INTO device_states VALUES (?,?,?,?)",
                               (did, json.dumps(state, ensure_ascii=False), 1, ts))
            self._conn.execute("INSERT INTO state_logs(device_id,state,source,ts) VALUES (?,?,?,?)",
                               (did, json.dumps(state, ensure_ascii=False), "seed", ts))
        for sid, sname, enabled in catalog.SCENES:
            self._conn.execute("INSERT INTO scenes VALUES (?,?,?)", (sid, sname, enabled))
        for row in FURNITURE_SEED:
            self._conn.execute("INSERT INTO furniture VALUES (?,?,?,?,?,?,?,?)", row)
        for room_id, temp, hum in [("R2", 28.0, 58.0), ("R5", 27.0, 55.0), ("R7", 27.5, 56.0)]:
            self._conn.execute("INSERT INTO env_samples(room_id,temperature,humidity,ts) VALUES (?,?,?,?)",
                               (room_id, temp, hum, ts))
        self._conn.commit()

    @contextmanager
    def transaction(self):
        with self._lock:
            try:
                yield self._conn
                self._conn.commit()
            except Exception:
                self._conn.rollback()
                raise

    # ---------- 读 ----------
    def list_rooms(self) -> list[dict]:
        with self._lock:
            rows = self._conn.execute("SELECT * FROM rooms ORDER BY sort").fetchall()
        return [{"id": r["id"], "name": r["name"], "polygon": json.loads(r["polygon"])} for r in rows]

    def list_devices(self, room_id: str | None = None) -> list[dict]:
        sql = ("SELECT d.*, s.state, s.version, s.updated_at FROM devices d "
               "JOIN device_states s ON s.device_id = d.id")
        args: tuple = ()
        if room_id:
            sql += " WHERE d.room_id = ?"
            args = (room_id,)
        sql += " ORDER BY d.id"
        with self._lock:
            rows = self._conn.execute(sql, args).fetchall()
        return [self._device_row(r) for r in rows]

    def get_device(self, device_id: str) -> dict | None:
        with self._lock:
            r = self._conn.execute(
                "SELECT d.*, s.state, s.version, s.updated_at FROM devices d "
                "JOIN device_states s ON s.device_id = d.id WHERE d.id = ?", (device_id,)).fetchone()
        return self._device_row(r) if r else None

    @staticmethod
    def _device_row(r: sqlite3.Row) -> dict:
        return {
            "id": r["id"], "roomId": r["room_id"], "name": r["name"], "type": r["type"],
            "capabilities": json.loads(r["capabilities"]), "driver": r["driver"],
            "state": json.loads(r["state"]), "version": r["version"], "updatedAt": r["updated_at"],
        }

    def state_logs(self, device_id: str, limit: int = 50) -> list[dict]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM state_logs WHERE device_id = ? ORDER BY id DESC LIMIT ?",
                (device_id, limit)).fetchall()
        return [{"id": r["id"], "deviceId": r["device_id"], "state": json.loads(r["state"]),
                 "source": r["source"], "ts": r["ts"]} for r in rows]

    def latest_env(self, room_id: str | None = None) -> dict | None:
        with self._lock:
            if room_id:
                r = self._conn.execute(
                    "SELECT * FROM env_samples WHERE room_id = ? ORDER BY id DESC LIMIT 1",
                    (room_id,)).fetchone()
            else:
                r = self._conn.execute("SELECT * FROM env_samples ORDER BY id DESC LIMIT 1").fetchone()
        if not r:
            return None
        return {"roomId": r["room_id"], "temperature": r["temperature"],
                "humidity": r["humidity"], "ts": r["ts"]}

    def add_env(self, room_id: str, temperature: float, humidity: float) -> None:
        with self.transaction() as c:
            c.execute("INSERT INTO env_samples(room_id,temperature,humidity,ts) VALUES (?,?,?,?)",
                      (room_id, temperature, humidity, now_iso()))

    def list_scenes(self) -> list[dict]:
        with self._lock:
            rows = self._conn.execute("SELECT * FROM scenes ORDER BY rowid").fetchall()
        return [{"id": r["id"], "name": r["name"], "enabled": bool(r["enabled"])} for r in rows]

    def furniture_types(self) -> list[dict]:
        with self._lock:
            rows = self._conn.execute("SELECT * FROM furniture_types").fetchall()
        return [{"id": r["id"], "name": r["name"], "w": r["w"], "h": r["h"]} for r in rows]

    def list_furniture(self, room_id: str | None = None) -> list[dict]:
        sql = "SELECT * FROM furniture"
        args: tuple = ()
        if room_id:
            sql += " WHERE room_id = ?"
            args = (room_id,)
        with self._lock:
            rows = self._conn.execute(sql, args).fetchall()
        return [{"id": r["id"], "roomId": r["room_id"], "typeId": r["type_id"],
                 "name": r["name"], "x": r["x"], "y": r["y"], "rotation": r["rotation"],
                 "deviceId": r["device_id"]} for r in rows]

    # ---------- 写 ----------
    def save_state(self, device_id: str, state: dict, expected_version: int, source: str) -> int:
        ts = now_iso()
        payload = json.dumps(state, ensure_ascii=False)
        with self.transaction() as c:
            cur = c.execute(
                "UPDATE device_states SET state=?, version=version+1, updated_at=? "
                "WHERE device_id=? AND version=?", (payload, ts, device_id, expected_version))
            if cur.rowcount == 0:
                raise VersionConflict(device_id)
            c.execute("INSERT INTO state_logs(device_id,state,source,ts) VALUES (?,?,?,?)",
                      (device_id, payload, source, ts))
            row = c.execute("SELECT version FROM device_states WHERE device_id=?", (device_id,)).fetchone()
        return row["version"]

    def add_furniture(self, data: dict) -> dict:
        fid = data.get("id") or "f" + uuid.uuid4().hex[:8]
        with self.transaction() as c:
            c.execute("INSERT INTO furniture VALUES (?,?,?,?,?,?,?,?)",
                      (fid, data["roomId"], data["typeId"], data.get("name", "家具"),
                       data.get("x", 0), data.get("y", 0), data.get("rotation", 0),
                       data.get("deviceId")))
        return {"id": fid, **data}

    def update_furniture(self, fid: str, patch: dict) -> dict | None:
        allowed = {"roomId": "room_id", "name": "name", "x": "x", "y": "y",
                   "rotation": "rotation", "deviceId": "device_id"}
        sets, args = [], []
        for k, col in allowed.items():
            if k in patch:
                sets.append(f"{col}=?")
                args.append(patch[k])
        if not sets:
            return next((f for f in self.list_furniture() if f["id"] == fid), None)
        with self.transaction() as c:
            c.execute(f"UPDATE furniture SET {','.join(sets)} WHERE id=?", (*args, fid))
        return next((f for f in self.list_furniture() if f["id"] == fid), None)

    def delete_furniture(self, fid: str) -> bool:
        with self.transaction() as c:
            cur = c.execute("DELETE FROM furniture WHERE id=?", (fid,))
        return cur.rowcount > 0
