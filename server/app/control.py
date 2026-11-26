# -*- coding: utf-8 -*-
"""控制层：校验、重试、幂等、回写与广播；不包含业务规则。"""
from __future__ import annotations

import asyncio
import copy
import time
import uuid
from typing import Awaitable, Callable

from .drivers import DriverRegistry, validate_value
from .repository import Repository, VersionConflict

Broadcaster = Callable[[dict], Awaitable[None] | None]


class ControlService:
    def __init__(self, repo: Repository, drivers: DriverRegistry,
                 broadcast: Broadcaster | None = None, timeout: float = 1.0,
                 retries: int = 2):
        self.repo = repo
        self.drivers = drivers
        self.broadcast = broadcast
        self.timeout = timeout
        self.retries = retries
        self._idem: dict[str, tuple[float, dict]] = {}

    async def _emit(self, payload: dict) -> None:
        if self.broadcast is None:
            return
        r = self.broadcast(payload)
        if asyncio.iscoroutine(r):
            await r

    def _remember(self, request_id: str, result: dict) -> dict:
        self._idem[request_id] = (time.time(), copy.deepcopy(result))
        if len(self._idem) > 2000:
            cutoff = time.time() - 600
            for k, (t, _) in list(self._idem.items()):
                if t < cutoff:
                    self._idem.pop(k, None)
        return result

    async def send(self, cmd: dict) -> dict:
        request_id = cmd.get("requestId") or uuid.uuid4().hex
        cached = self._idem.get(request_id)
        if cached and time.time() - cached[0] < 600:
            return copy.deepcopy(cached[1])

        started = time.perf_counter()
        device = self.repo.get_device(cmd["deviceId"])
        if device is None:
            return self._remember(request_id, self._fail(request_id, cmd["deviceId"], "DEVICE_NOT_FOUND",
                                                         started, 0))
        ok, code, detail = validate_value(device["type"], cmd["capability"], cmd["value"])
        if not ok:
            return self._remember(request_id, self._fail(request_id, device["id"], code, started, 0,
                                                         detail))
        driver = self.drivers.get(device["id"])
        if driver is None:
            return self._remember(request_id, self._fail(request_id, device["id"], "DRIVER_NOT_FOUND",
                                                         started, 0))

        full = {"requestId": request_id, "deviceId": device["id"],
                "capability": cmd["capability"], "value": cmd["value"], "ts": time.time()}
        attempts = 0
        last_error = "DEVICE_TIMEOUT"
        for _ in range(self.retries + 1):
            attempts += 1
            try:
                ack = await driver.execute(full, self.timeout)
            except asyncio.TimeoutError:
                last_error = "DEVICE_TIMEOUT"
                await asyncio.sleep(0.02)
                continue
            except Exception as exc:  # 驱动异常统一收敛为可观察结果
                last_error = f"DRIVER_ERROR:{type(exc).__name__}"
                break
            if not ack.get("ok"):
                return self._remember(request_id, self._fail(request_id, device["id"],
                                                             ack.get("error", "DEVICE_REJECTED"),
                                                             started, attempts, None, ack.get("state")))
            version = await self._persist(device["id"], ack["state"], device["version"],
                                          cmd.get("source", "manual"))
            if version is None:
                return self._remember(request_id, self._fail(request_id, device["id"],
                                                             "VERSION_CONFLICT", started, attempts))
            result = {
                "requestId": request_id, "deviceId": device["id"], "ok": True, "error": None,
                "state": ack["state"], "version": version,
                "latencyMs": int((time.perf_counter() - started) * 1000), "attempts": attempts,
            }
            await self._emit({"type": "command.result", "data": result})
            await self._emit({"type": "device.state",
                              "data": {"deviceId": device["id"], "state": ack["state"],
                                       "version": version, "ts": time.time()}})
            return self._remember(request_id, result)

        return self._remember(request_id, self._fail(request_id, device["id"], last_error,
                                                     started, attempts))

    async def _persist(self, device_id: str, state: dict, expected: int, source: str) -> int | None:
        try:
            return self.repo.save_state(device_id, state, expected, source)
        except VersionConflict:
            latest = self.repo.get_device(device_id)
            if latest is None:
                return None
            try:
                return self.repo.save_state(device_id, state, latest["version"], source)
            except VersionConflict:
                return None

    @staticmethod
    def _fail(request_id: str, device_id: str, error: str, started: float, attempts: int,
              detail: str | None = None, state: dict | None = None) -> dict:
        out = {"requestId": request_id, "deviceId": device_id, "ok": False, "error": error,
               "latencyMs": int((time.perf_counter() - started) * 1000), "attempts": attempts}
        if detail:
            out["detail"] = detail
        if state is not None:
            out["state"] = state
        return out

    async def dispatch(self, plans: list[dict], *, scene_id: str | None = None,
                       on_progress: Callable[[dict], None] | None = None) -> list[dict]:
        results = []
        failed = 0
        for i, plan in enumerate(plans, start=1):
            cmd = dict(plan)
            cmd.setdefault("requestId", uuid.uuid4().hex)
            cmd["source"] = f"scene:{scene_id}" if scene_id else "scene"
            res = await self.send(cmd)
            results.append(res)
            if not res["ok"]:
                failed += 1
            progress = {"sceneId": scene_id, "done": i, "total": len(plans), "failed": failed}
            if on_progress:
                on_progress(progress)
            await self._emit({"type": "scene.progress", "data": progress})
        return results
