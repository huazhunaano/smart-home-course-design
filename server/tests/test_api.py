# -*- coding: utf-8 -*-


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["devices"] == 40 and body["rooms"] == 9


def test_rooms_and_devices(client):
    rooms = client.get("/api/rooms").json()
    assert len(rooms) == 9
    kitchen = client.get("/api/devices", params={"room_id": "R4"}).json()
    assert len(kitchen) == 8
    assert {d["type"] for d in kitchen} >= {"hood", "dishwasher", "ricecooker", "fridge"}


def test_command_roundtrip(client):
    r = client.post("/api/devices/light.living/commands",
                    json={"capability": "brightness", "value": 70, "requestId": "api-1"})
    assert r.status_code == 200 and r.json()["ok"]
    d = client.get("/api/devices/light.living").json()
    assert d["state"]["brightness"] == 70


def test_command_errors(client):
    assert client.post("/api/devices/nope/commands",
                       json={"capability": "power", "value": True}).status_code == 404
    assert client.post("/api/devices/light.living/commands",
                       json={"capability": "brightness", "value": 500}).status_code == 400


def test_scene_trigger(client):
    r = client.post("/api/scenes/home/trigger")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] > 10 and body["failed"] == 0


def test_state_logs(client):
    logs = client.get("/api/devices/light.living/state-logs", params={"limit": 5}).json()
    assert len(logs) >= 1 and "state" in logs[0]


def test_furniture_crud(client):
    created = client.post("/api/furniture", json={"roomId": "R2", "typeId": "sofa",
                                                  "name": "测试沙发", "x": 10, "y": 20}).json()
    fid = created["id"]
    moved = client.patch(f"/api/furniture/{fid}", json={"x": 50}).json()
    assert moved["x"] == 50
    assert client.delete(f"/api/furniture/{fid}").status_code == 200
    assert client.delete(f"/api/furniture/{fid}").status_code == 404
