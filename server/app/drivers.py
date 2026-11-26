# -*- coding: utf-8 -*-
"""设备层：统一驱动协议与模拟器实现（不依赖任何上层模块）。"""
from __future__ import annotations

import asyncio
import copy
import threading
import time
from typing import Callable, Protocol

from . import catalog


class DeviceDriver(Protocol):
    def describe(self) -> dict: ...
    async def execute(self, cmd: dict, timeout: float = 1.0) -> dict: ...
    def on_state(self, handler: Callable[[str, dict], None]) -> None: ...


class SimulatedDriver:
    """按能力规格执行命令，维护内存状态并回调状态监听者。"""

    def __init__(self, device: dict):
        self.device_id = device["id"]
        self.type = device["type"]
        self.caps = device["capabilities"]
        self._state = copy.deepcopy(device["state"])
        self._handlers: list[Callable[[str, dict], None]] = []
        self._lock = threading.Lock()

    def describe(self) -> dict:
        return {"deviceId": self.device_id, "type": self.type, "capabilities": self.caps}

    def on_state(self, handler: Callable[[str, dict], None]) -> None:
        self._handlers.append(handler)

    def snapshot(self) -> dict:
        with self._lock:
            return copy.deepcopy(self._state)

    async def execute(self, cmd: dict, timeout: float = 1.0) -> dict:
        started = time.perf_counter()
        await asyncio.sleep(0.02)
        value = cmd["value"]
        if str(cmd.get("requestId", "")).startswith("timeout-"):
            raise asyncio.TimeoutError("simulated timeout")
        if str(cmd.get("requestId", "")).startswith("reject-"):
            return {"requestId": cmd["requestId"], "ok": False, "error": "DEVICE_REJECTED",
                    "state": self.snapshot(), "latencyMs": int((time.perf_counter() - started) * 1000)}
        cap = cmd["capability"]
        with self._lock:
            self._state[cap] = value
            if cap == "power" and self.type == "ac":
                self._state["currentTemp"] = self._state.get("currentTemp", 28)
            if cap == "targetTemp" and self.type == "ac" and value is not None:
                cur = float(self._state.get("currentTemp", value))
                target = float(value)
                self._state["currentTemp"] = round(cur + max(-0.5, min(0.5, target - cur)), 1)
            state = copy.deepcopy(self._state)
        for h in list(self._handlers):
            h(self.device_id, state)
        return {"requestId": cmd["requestId"], "ok": True, "error": None, "state": state,
                "latencyMs": int((time.perf_counter() - started) * 1000)}


class DriverRegistry:
    def __init__(self, repo):
        self._drivers: dict[str, SimulatedDriver] = {}
        for d in repo.list_devices():
            self._drivers[d["id"]] = SimulatedDriver(d)

    def get(self, device_id: str) -> SimulatedDriver | None:
        return self._drivers.get(device_id)

    def all(self) -> dict[str, SimulatedDriver]:
        return self._drivers


def validate_value(device_type: str, capability: str, value):
    """返回 (ok, error_code, detail)。只做能力与范围校验。"""
    if capability not in catalog.TYPE_CAPS.get(device_type, []):
        return False, "CAPABILITY_UNSUPPORTED", f"{device_type} 不支持 {capability}"
    spec = catalog.CAP_SPECS.get(capability)
    if spec is None:
        return False, "CAPABILITY_UNSUPPORTED", capability
    kind, lo, hi, enum = spec
    if capability == "mode":
        enum = catalog.MODE_ENUMS.get(device_type, [])
    if capability == "targetTemp" and device_type == "waterheater":
        lo, hi = 35, 60
    if kind == "bool":
        if not isinstance(value, bool):
            return False, "VALUE_OUT_OF_RANGE", "需要布尔值"
    elif kind == "int":
        if not isinstance(value, int) or isinstance(value, bool):
            return False, "VALUE_OUT_OF_RANGE", "需要整数"
        if lo is not None and not (lo <= value <= hi):
            return False, "VALUE_OUT_OF_RANGE", f"范围 {lo}–{hi}"
    elif kind == "enum":
        if value not in (enum or []):
            return False, "VALUE_OUT_OF_RANGE", f"可选 {enum}"
    return True, None, None
