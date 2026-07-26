"""WGS-84 到 GCJ-02 的坐标换算。

商家坐标以 WGS-84 录入，而高德地图按 GCJ-02 渲染，两者在国内相差约 300–600 米。
换算属于服务端职责：管理端只提交 WGS-84，用户端只消费 GCJ-02，两侧都不需要知道算法。
"""

from __future__ import annotations

import math

#: Krasovsky 1940 椭球长半轴与第一偏心率平方。
SEMI_MAJOR_AXIS = 6378245.0
ECCENTRICITY_SQUARED = 0.00669342162296594323


def _transform_latitude(x: float, y: float) -> float:
    ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * math.sqrt(abs(x))
    ret += (20.0 * math.sin(6.0 * x * math.pi) + 20.0 * math.sin(2.0 * x * math.pi)) * 2.0 / 3.0
    ret += (20.0 * math.sin(y * math.pi) + 40.0 * math.sin(y / 3.0 * math.pi)) * 2.0 / 3.0
    ret += (160.0 * math.sin(y / 12.0 * math.pi) + 320 * math.sin(y * math.pi / 30.0)) * 2.0 / 3.0
    return ret


def _transform_longitude(x: float, y: float) -> float:
    ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * math.sqrt(abs(x))
    ret += (20.0 * math.sin(6.0 * x * math.pi) + 20.0 * math.sin(2.0 * x * math.pi)) * 2.0 / 3.0
    ret += (20.0 * math.sin(x * math.pi) + 40.0 * math.sin(x / 3.0 * math.pi)) * 2.0 / 3.0
    ret += (150.0 * math.sin(x / 12.0 * math.pi) + 300.0 * math.sin(x / 30.0 * math.pi)) * 2.0 / 3.0
    return ret


def outside_china(latitude: float, longitude: float) -> bool:
    """Rough bounding box; outside it GCJ-02 equals WGS-84."""
    return not (0.8293 <= latitude <= 55.8271 and 72.004 <= longitude <= 137.8347)


def wgs84_to_gcj02(latitude: float, longitude: float) -> tuple[float, float]:
    if outside_china(latitude, longitude):
        return latitude, longitude
    delta_lat = _transform_latitude(longitude - 105.0, latitude - 35.0)
    delta_lng = _transform_longitude(longitude - 105.0, latitude - 35.0)
    rad_lat = latitude / 180.0 * math.pi
    magic = math.sin(rad_lat)
    magic = 1 - ECCENTRICITY_SQUARED * magic * magic
    sqrt_magic = math.sqrt(magic)
    delta_lat = (delta_lat * 180.0) / (
        (SEMI_MAJOR_AXIS * (1 - ECCENTRICITY_SQUARED)) / (magic * sqrt_magic) * math.pi
    )
    delta_lng = (delta_lng * 180.0) / (
        SEMI_MAJOR_AXIS / sqrt_magic * math.cos(rad_lat) * math.pi
    )
    return round(latitude + delta_lat, 8), round(longitude + delta_lng, 8)
