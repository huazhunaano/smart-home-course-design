# -*- coding: utf-8 -*-
"""设备目录、能力规格、房间与种子数据（与需求文档一致：19 类、40 台）。"""

# 能力规格：name -> (kind, min, max, enum)
CAP_SPECS = {
    "power": ("bool", None, None, None),
    "brightness": ("int", 0, 100, None),
    "colorTemp": ("int", 2700, 6500, None),
    "lockState": ("enum", None, None, ["locked", "unlocked"]),
    "mode": ("enum", None, None, []),
    "targetTemp": ("int", 16, 30, None),
    "fanSpeed": ("enum", None, None, ["low", "mid", "high", "auto"]),
    "position": ("int", 0, 100, None),
    "volume": ("int", 0, 100, None),
    "fridgeTemp": ("int", 2, 8, None),
    "freezerTemp": ("int", -24, -16, None),
    "waterTemp": ("int", 35, 60, None),
    "heaterMode": ("enum", None, None, ["instant", "storage"]),
}

# 设备类型 -> 能力列表
TYPE_CAPS = {
    "light": ["power", "brightness", "colorTemp"],
    "lock": ["lockState"],
    "ac": ["power", "mode", "targetTemp", "fanSpeed"],
    "curtain": ["position"],
    "thsensor": [],
    "presence": [],
    "lux": [],
    "tv": ["power", "volume"],
    "purifier": ["power", "mode"],
    "robot": ["power", "mode"],
    "speaker": ["power", "volume"],
    "hood": ["power", "fanSpeed"],
    "dishwasher": ["power", "mode"],
    "ricecooker": ["power", "mode"],
    "fridge": ["power", "fridgeTemp", "freezerTemp"],
    "smoke": [],
    "socket": ["power"],
    "waterheater": ["power", "targetTemp", "heaterMode"],
    "washer": ["power", "mode"],
}

MODE_ENUMS = {
    "ac": ["cool", "heat", "fan", "dry", "auto"],
    "purifier": ["auto", "sleep", "high"],
    "robot": ["clean", "dock"],
    "hood": ["low", "mid", "high"],
    "dishwasher": ["quick", "standard", "eco"],
    "ricecooker": ["cook", "soup", "keepwarm"],
    "washer": ["standard", "quick", "spin"],
}

INITIAL_STATE = {
    "light": {"power": False, "brightness": 0, "colorTemp": 4000},
    "lock": {"lockState": "locked"},
    "ac": {"power": False, "mode": "cool", "targetTemp": 26, "fanSpeed": "auto", "currentTemp": 28},
    "curtain": {"position": 0},
    "thsensor": {"temperature": 26.0, "humidity": 55.0},
    "presence": {"presence": False, "idleSec": 0},
    "lux": {"lux": 300},
    "tv": {"power": False, "volume": 20},
    "purifier": {"power": False, "mode": "auto", "pm25": 35},
    "robot": {"power": False, "mode": "dock", "battery": 80, "position": {"x": 0, "y": 0}},
    "speaker": {"power": False, "volume": 30},
    "hood": {"power": False, "fanSpeed": "low"},
    "dishwasher": {"power": False, "mode": "standard", "remainingTime": 0},
    "ricecooker": {"power": False, "mode": "keepwarm", "remainingTime": 0},
    "fridge": {"power": True, "fridgeTemp": 4, "freezerTemp": -18},
    "smoke": {"smoke": False},
    "socket": {"power": False, "powerConsumption": 0},
    "waterheater": {"power": False, "targetTemp": 45, "heaterMode": "storage"},
    "washer": {"power": False, "mode": "standard", "remainingTime": 0},
}

# 房间：id, 名称, 多边形（cm）, 排序
ROOMS = [
    ("R1", "玄关", [[0, 0], [400, 0], [400, 150], [0, 150]], 1),
    ("R2", "客厅", [[400, 0], [760, 0], [760, 420], [400, 420]], 2),
    ("R3", "餐厅", [[760, 0], [1200, 0], [1200, 220], [760, 220]], 3),
    ("R4", "厨房", [[760, 220], [1200, 220], [1200, 480], [760, 480]], 4),
    ("R5", "主卧", [[0, 150], [400, 150], [400, 470], [0, 470]], 5),
    ("R6", "次卧", [[0, 470], [400, 470], [400, 650], [0, 650]], 6),
    ("R7", "老人房", [[400, 620], [760, 620], [760, 800], [400, 800]], 7),
    ("R8", "卫生间", [[400, 420], [600, 420], [600, 620], [400, 620]], 8),
    ("R9", "阳台", [[760, 480], [1200, 480], [1200, 800], [760, 800]], 9),
]

# (id, room, 名称, 类型)
DEVICES = [
    ("lock.entry", "R1", "智能门锁", "lock"),
    ("light.entry", "R1", "玄关灯", "light"),
    ("presence.entry", "R1", "玄关人体", "presence"),
    ("ac.living", "R2", "客厅空调", "ac"),
    ("light.living", "R2", "客厅吸顶灯", "light"),
    ("curtain.living", "R2", "客厅窗帘", "curtain"),
    ("thsensor.living", "R2", "客厅温湿度", "thsensor"),
    ("presence.living", "R2", "客厅人体", "presence"),
    ("tv.living", "R2", "客厅电视", "tv"),
    ("purifier.living", "R2", "空气净化器", "purifier"),
    ("robot.living", "R2", "扫地机器人", "robot"),
    ("speaker.living", "R2", "智能音箱", "speaker"),
    ("light.dining", "R3", "餐厅吊灯", "light"),
    ("thsensor.dining", "R3", "餐厅温湿度", "thsensor"),
    ("light.kitchen", "R4", "厨房橱柜灯", "light"),
    ("hood.kitchen", "R4", "油烟机", "hood"),
    ("dishwasher.kitchen", "R4", "洗碗机", "dishwasher"),
    ("ricecooker.kitchen", "R4", "电饭煲", "ricecooker"),
    ("fridge.kitchen", "R4", "冰箱", "fridge"),
    ("smoke.kitchen", "R4", "烟感", "smoke"),
    ("socket.kitchen.1", "R4", "厨房插座 1", "socket"),
    ("socket.kitchen.2", "R4", "厨房插座 2", "socket"),
    ("ac.master", "R5", "主卧空调", "ac"),
    ("light.master", "R5", "主卧床头灯", "light"),
    ("curtain.master", "R5", "主卧窗帘", "curtain"),
    ("thsensor.master", "R5", "主卧温湿度", "thsensor"),
    ("ac.second", "R6", "次卧空调", "ac"),
    ("light.second", "R6", "次卧吸顶灯", "light"),
    ("thsensor.second", "R6", "次卧温湿度", "thsensor"),
    ("ac.elder", "R7", "老人房空调", "ac"),
    ("light.elder", "R7", "老人房夜灯", "light"),
    ("presence.elder", "R7", "老人房人体", "presence"),
    ("light.bath", "R8", "卫生间镜前灯", "light"),
    ("waterheater.bath", "R8", "电热水器", "waterheater"),
    ("presence.bath", "R8", "卫生间人体", "presence"),
    ("thsensor.bath", "R8", "卫生间温湿度", "thsensor"),
    ("curtain.balcony", "R9", "阳台窗帘", "curtain"),
    ("lux.balcony", "R9", "阳台光照", "lux"),
    ("washer.balcony", "R9", "洗衣机", "washer"),
    ("socket.balcony", "R9", "阳台插座", "socket"),
]

FURNITURE_TYPES = [
    ("sofa", "沙发", 220, 90),
    ("bed_double", "双人床", 180, 200),
    ("bed_single", "单人床", 120, 200),
    ("wardrobe", "衣柜", 200, 60),
    ("dining_table", "餐桌", 140, 80),
    ("tv_cabinet", "电视柜", 180, 40),
    ("desk", "书桌", 120, 60),
    ("nightstand", "床头柜", 45, 40),
]

SCENES = [
    ("home", "回家", 1),
    ("away", "离家", 1),
    ("sleep", "睡眠", 1),
    ("night", "起夜", 1),
]
