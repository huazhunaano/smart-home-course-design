# -*- coding: utf-8 -*-
from app.strategy import ClimatePolicy


def test_season():
    p = ClimatePolicy()
    assert p.season_of(7) == "summer"
    assert p.season_of(1) == "winter"
    assert p.season_of(4) == "mild"


def test_summer_target():
    p = ClimatePolicy()
    assert p.target_temp("summer", 30, 33, 55).target == 26
    assert p.target_temp("summer", 28, 28, 55).target == 27
    d = p.target_temp("summer", 28, 33, 75)
    assert d.target == 25 and "除湿" in d.reason


def test_winter_target():
    p = ClimatePolicy()
    assert p.target_temp("winter", 15, 3, 40).target == 20
    assert p.target_temp("winter", 18, 8, 40).target == 21


def test_hysteresis():
    d = ClimatePolicy().target_temp("mild", 24, 20, 50)
    assert d.hysteresis == 1.0 and d.reason
