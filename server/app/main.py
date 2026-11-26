# -*- coding: utf-8 -*-
"""API 入口：REST + WebSocket，装配五层依赖。"""
from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .control import ControlService
from .drivers import DriverRegistry
from .repository import Repository
from .strategy import STRATEGIES, ClimatePolicy, SceneContext

DB_PATH = os.environ.get(
    "SMART_HOME_DB",
    str(Path(__file__).resolve().parent.parent / "data" / "smart_home.db"),
)

repo = Repository(DB_PATH)
drivers = DriverRegistry(repo)
_clients: set[WebSocket] = set()
_clients_lock = asyncio.Lock()


async def broadcast(payload: dict) -> None:
    text = json.dumps(payload, ensure_ascii=False)
    async with _clients_lock:
        dead = []
        for ws in _clients:
            try:
                await ws.send_text(text)
            except Exception:
                dead.append(ws)
        for ws in dead:
            _clients.discard(ws)


control = ControlService(repo, drivers, broadcast=broadcast)


class CommandIn(BaseModel):
    capability: str
    value: Any
    requestId: str | None = None


class EnvIn(BaseModel):
    roomId: str = "R2"
    temperature: float = Field(ge=-10, le=45)
    humidity: float = Field(ge=0, le=100)


class FurnitureIn(BaseModel):
    roomId: str
    typeId: str
    name: str = "家具"
    x: float = 0
    y: float = 0
    rotation: int = 0
    deviceId: str | None = None


class FurniturePatch(BaseModel):
    roomId: str | None = None
    name: str | None = None
    x: float | None = None
    y: float | None = None
    rotation: int | None = None
    deviceId: str | None = None


STATUS = {"DEVICE_NOT_FOUND": 404, "CAPABILITY_UNSUPPORTED": 400,
          "VALUE_OUT_OF_RANGE": 400, "DEVICE_TIMEOUT": 504, "VERSION_CONFLICT": 409,
          "DRIVER_ERROR": 500}

app = FastAPI(title="SmartHome API", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
                   allow_methods=["*"], allow_headers=["*"])


@app.get("/api/health")
def health():
    return {"ok": True, "devices": len(repo.list_devices()), "rooms": len(repo.list_rooms())}


@app.get("/api/rooms")
def rooms():
    return repo.list_rooms()


@app.get("/api/devices")
def devices(room_id: str | None = None):
    return repo.list_devices(room_id)


@app.get("/api/devices/{device_id}")
def device(device_id: str):
    d = repo.get_device(device_id)
    if not d:
        raise HTTPException(404, "DEVICE_NOT_FOUND")
    return d


@app.post("/api/devices/{device_id}/commands")
async def send_command(device_id: str, body: CommandIn):
    result = await control.send({"deviceId": device_id, "capability": body.capability,
                                 "value": body.value, "requestId": body.requestId})
    if not result["ok"]:
        code = str(result["error"]).split(":")[0]
        raise HTTPException(STATUS.get(code, 400), detail=result)
    return result


@app.get("/api/devices/{device_id}/state-logs")
def state_logs(device_id: str, limit: int = 50):
    return repo.state_logs(device_id, min(max(limit, 1), 500))


@app.get("/api/env/latest")
def env_latest(room_id: str | None = None):
    env = repo.latest_env(room_id)
    if not env:
        raise HTTPException(404, "NO_ENV_SAMPLE")
    return env


@app.post("/api/env")
def env_add(body: EnvIn):
    repo.add_env(body.roomId, body.temperature, body.humidity)
    return repo.latest_env(body.roomId)


@app.get("/api/scenes")
def scenes():
    return repo.list_scenes()


@app.post("/api/scenes/{scene_id}/trigger")
async def trigger(scene_id: str):
    cls = STRATEGIES.get(scene_id)
    if cls is None:
        raise HTTPException(404, "SCENE_NOT_FOUND")
    env = repo.latest_env("R2") or {"temperature": 28.0, "humidity": 55.0}
    ctx = SceneContext(season=ClimatePolicy.season_of(), indoor=env["temperature"],
                       outdoor=env["temperature"] + 3, humidity=env["humidity"])
    plans = cls(repo).evaluate(ctx)
    results = await control.dispatch(plans, scene_id=scene_id)
    failed = sum(1 for r in results if not r["ok"])
    return {"sceneId": scene_id, "total": len(results), "failed": failed, "results": results}


@app.get("/api/furniture-types")
def furniture_types():
    return repo.furniture_types()


@app.get("/api/furniture")
def furniture(room_id: str | None = None):
    return repo.list_furniture(room_id)


@app.post("/api/furniture")
def furniture_add(body: FurnitureIn):
    return repo.add_furniture(body.model_dump())


@app.patch("/api/furniture/{fid}")
def furniture_patch(fid: str, body: FurniturePatch):
    out = repo.update_furniture(fid, body.model_dump(exclude_none=True))
    if out is None:
        raise HTTPException(404, "FURNITURE_NOT_FOUND")
    return out


@app.delete("/api/furniture/{fid}")
def furniture_delete(fid: str):
    if not repo.delete_furniture(fid):
        raise HTTPException(404, "FURNITURE_NOT_FOUND")
    return {"ok": True}


@app.websocket("/ws/state")
async def ws_state(ws: WebSocket):
    await ws.accept()
    async with _clients_lock:
        _clients.add(ws)
    try:
        await ws.send_text(json.dumps({"type": "hello", "data": {"devices": len(drivers.all())}},
                                      ensure_ascii=False))
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        async with _clients_lock:
            _clients.discard(ws)


_dist = Path(__file__).resolve().parent.parent.parent / "web" / "dist"
if _dist.exists():
    app.mount("/", StaticFiles(directory=str(_dist), html=True), name="web")
