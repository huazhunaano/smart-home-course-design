# -*- coding: utf-8 -*-
"""策略层：温控算法与四个场景规则；只产出命令集，不接触驱动。"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


@dataclass
class TempDecision:
    target: int
    reason: str
    hysteresis: float = 1.0


class ClimatePolicy:
    """按季节、室内外温度与湿度给出目标温度，供策略与界面展示依据。"""

    @staticmethod
    def season_of(month: int | None = None) -> str:
        m = month or datetime.now().month
        if m in (6, 7, 8, 9):
            return "summer"
        if m in (12, 1, 2):
            return "winter"
        return "mild"

    def target_temp(self, season: str, indoor: float, outdoor: float,
                    humidity: float) -> TempDecision:
        if season == "summer":
            target = 26 if outdoor >= 30 else 27
            if humidity >= 70:
                target = 25
                reason = f"夏季室外 {outdoor:.0f}℃、湿度 {humidity:.0f}%，下调到 25℃ 兼顾除湿体感"
            else:
                reason = f"夏季室外 {outdoor:.0f}℃、室内 {indoor:.0f}℃，按 26–27℃ 节能区间取值"
        elif season == "winter":
            target = 20 if outdoor <= 5 else 21
            reason = f"冬季室外 {outdoor:.0f}℃，按 20–21℃ 采暖区间取值"
        else:
            target = 24
            reason = f"过渡季室内 {indoor:.0f}℃，取 24℃ 中性舒适值"
        return TempDecision(target=target, reason=reason)


@dataclass
class SceneContext:
    season: str
    indoor: float
    outdoor: float
    humidity: float
    presence: bool = True
    manual_overrides: set | None = None


class SceneStrategy:
    """场景基类：子类只实现 plan()，统一过滤手动接管的设备。"""

    scene_id = ""

    def __init__(self, repo):
        self.repo = repo
        self.devices = {d["id"]: d for d in repo.list_devices()}
        self.climate = ClimatePolicy()

    def _devices(self, typ: str, room: str | None = None):
        return [d for d in self.devices.values() if d["type"] == typ and (room is None or d["roomId"] == room)]

    def _cmd(self, device, cap, value) -> dict:
        return {"deviceId": device["id"], "capability": cap, "value": value}

    def evaluate(self, ctx: SceneContext) -> list[dict]:
        override = ctx.manual_overrides or set()
        plans = self.plan(ctx)
        return [c for c in plans if c["deviceId"] not in override]

    def plan(self, ctx: SceneContext) -> list[dict]:
        raise NotImplementedError


class HomeScene(SceneStrategy):
    scene_id = "home"

    def plan(self, ctx):
        decision = self.climate.target_temp(ctx.season, ctx.indoor, ctx.outdoor, ctx.humidity)
        plans = []
        for dev in self._devices("light"):
            if dev["roomId"] in ("R1", "R2", "R3"):
                plans.append(self._cmd(dev, "power", True))
                plans.append(self._cmd(dev, "brightness", 70 if dev["roomId"] != "R1" else 60))
        for dev in self._devices("ac"):
            plans.append(self._cmd(dev, "power", True))
            plans.append(self._cmd(dev, "mode", "cool" if ctx.season == "summer" else "heat"))
            plans.append(self._cmd(dev, "targetTemp", decision.target))
        for dev in self._devices("curtain", "R2"):
            plans.append(self._cmd(dev, "position", 100))
        for dev in self._devices("ricecooker"):
            plans.append(self._cmd(dev, "power", True))
            plans.append(self._cmd(dev, "mode", "cook"))
        for dev in self._devices("waterheater"):
            plans.append(self._cmd(dev, "power", True))
            plans.append(self._cmd(dev, "targetTemp", 45))
        return plans


class AwayScene(SceneStrategy):
    scene_id = "away"

    def plan(self, ctx):
        plans = []
        for dev in self._devices("light"):
            plans.append(self._cmd(dev, "power", False))
        for dev in self._devices("ac"):
            plans.append(self._cmd(dev, "power", False))
        for dev in self._devices("hood") + self._devices("ricecooker") + self._devices("tv") + self._devices("purifier"):
            plans.append(self._cmd(dev, "power", False))
        for dev in self._devices("curtain"):
            plans.append(self._cmd(dev, "position", 50))
        for dev in self._devices("robot"):
            plans.append(self._cmd(dev, "power", True))
            plans.append(self._cmd(dev, "mode", "clean"))
        return plans


class SleepScene(SceneStrategy):
    scene_id = "sleep"

    def plan(self, ctx):
        decision = self.climate.target_temp(ctx.season, ctx.indoor, ctx.outdoor, ctx.humidity)
        plans = []
        for dev in self._devices("light"):
            plans.append(self._cmd(dev, "power", False))
        for dev in self._devices("curtain"):
            plans.append(self._cmd(dev, "position", 0))
        for dev in self._devices("ac"):
            plans.append(self._cmd(dev, "power", True))
            plans.append(self._cmd(dev, "mode", "cool" if ctx.season == "summer" else "heat"))
            plans.append(self._cmd(dev, "targetTemp", decision.target))
            plans.append(self._cmd(dev, "fanSpeed", "low"))
        for dev in self._devices("purifier"):
            plans.append(self._cmd(dev, "power", True))
            plans.append(self._cmd(dev, "mode", "sleep"))
        for dev in self._devices("hood"):
            plans.append(self._cmd(dev, "power", False))
        return plans


class NightScene(SceneStrategy):
    scene_id = "night"

    def plan(self, ctx):
        plans = []
        for dev in self._devices("light", "R7"):
            plans.append(self._cmd(dev, "power", True))
            plans.append(self._cmd(dev, "brightness", 20))
        for dev in self._devices("light", "R8"):
            plans.append(self._cmd(dev, "power", True))
            plans.append(self._cmd(dev, "brightness", 30))
        for dev in self._devices("ac", "R7"):
            plans.append(self._cmd(dev, "fanSpeed", "low"))
        return plans


STRATEGIES = {
    "home": HomeScene,
    "away": AwayScene,
    "sleep": SleepScene,
    "night": NightScene,
}
