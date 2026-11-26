# -*- coding: utf-8 -*-
import asyncio

import pytest

from app.control import ControlService
from app.drivers import DriverRegistry
from app.repository import Repository


@pytest.fixture()
def env(tmp_path):
    repo = Repository(str(tmp_path / "t.db"))
    drivers = DriverRegistry(repo)
    sent = []
    control = ControlService(repo, drivers, broadcast=lambda p: sent.append(p))
    return repo, control, sent


def run(coro):
    return asyncio.run(coro)


def test_send_success_and_log(env):
    repo, control, sent = env
    before = len(repo.state_logs("light.entry"))
    res = run(control.send({"deviceId": "light.entry", "capability": "brightness", "value": 60,
                            "requestId": "r1"}))
    assert res["ok"] and res["version"] == 2 and res["state"]["brightness"] == 60
    assert len(repo.state_logs("light.entry")) == before + 1
    assert any(p["type"] == "device.state" for p in sent)


def test_idempotent(env):
    repo, control, _ = env
    cmd = {"deviceId": "light.entry", "capability": "power", "value": True, "requestId": "same"}
    a = run(control.send(cmd))
    b = run(control.send(cmd))
    assert a["version"] == b["version"] == 2


def test_timeout_retries(env):
    _, control, _ = env
    res = run(control.send({"deviceId": "light.entry", "capability": "power", "value": True,
                            "requestId": "timeout-1"}))
    assert not res["ok"] and res["error"] == "DEVICE_TIMEOUT" and res["attempts"] == 3


def test_unsupported_and_range(env):
    _, control, _ = env
    a = run(control.send({"deviceId": "lock.entry", "capability": "brightness", "value": 10}))
    b = run(control.send({"deviceId": "light.entry", "capability": "brightness", "value": 120}))
    assert a["error"] == "CAPABILITY_UNSUPPORTED" and a["attempts"] == 0
    assert b["error"] == "VALUE_OUT_OF_RANGE"


def test_dispatch_continues(env):
    _, control, _ = env
    plans = [
        {"deviceId": "light.entry", "capability": "power", "value": True, "requestId": "ok-1"},
        {"deviceId": "lock.entry", "capability": "brightness", "value": 10, "requestId": "bad-1"},
        {"deviceId": "lock.entry", "capability": "lockState", "value": "unlocked", "requestId": "ok-2"},
    ]
    progress = []
    results = run(control.dispatch(plans, scene_id="t", on_progress=progress.append))
    assert len(results) == 3 and results[1]["ok"] is False
    assert progress[-1] == {"sceneId": "t", "done": 3, "total": 3, "failed": 1}
